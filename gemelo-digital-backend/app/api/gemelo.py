# app/api/gemelo.py
# Router core de gemelo. Los endpoints de outcomes, debug y admin viven en
# sub-routers extraidos (gemelo_outcomes / gemelo_debug / gemelo_admin) que se
# montan al final de este archivo. Helpers compartidos: gemelo_shared.
from typing import Any, Dict, List, Optional
import asyncio
from collections import defaultdict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request

from app.config_loader import load_course_bundle
from app.rate_limit import limiter
from app.services.brightspace_client import BrightspaceClient
from app.services.gemelo_service import GemeloService
from app.services.sync_service import SyncService
from app.api.gemelo_shared import get_service, _http500, logger
from app.api.course_auth import require_course_staff, require_course_member

#|---------- Lectura desde Postgres con chequeo de frescura de los datos ----------|
from app.services.gemelo_db_service import (
    build_course_overview_from_db,
    upsert_course_metric_history,
    get_course_metric_history,
)
from app.services.db_freshness import is_fresh
from app.db.session import SessionLocal
from app.db.models import GradeItem, DropboxFolder
from sqlalchemy import select


#|---------- Upsert snapshot diario de tendencias (background task) ----------|
def _upsert_history_bg(orgUnitId: int, overview: dict) -> None:
    """Guarda el snapshot diario de tendencias del curso. Silencia errores."""
    try:
        upsert_course_metric_history(orgUnitId, overview)
    except Exception as e:
        logger.warning("upsert_course_metric_history ou=%s fallo: %s", orgUnitId, e)


#|---------- Persistir snapshots tras fallback a Brightspace (background task) ----------|
async def _refresh_overview_db_bg(orgUnitId: int, access_token: str) -> None:
    """
    Tarea de background que se ejecuta DESPUES de devolver la respuesta
    al cliente. Re-sincroniza los snapshots de metricas del curso usando
    el access_token capturado en el momento del request.

    Se dispara cuando el endpoint /overview tuvo que llamar a Brightspace
    porque los datos en Postgres estaban viejos. Tras la respuesta al
    cliente, esta tarea actualiza la DB para que la proxima peticion al
    mismo curso encuentre datos frescos y se sirva rapido sin volver a
    Brightspace.

    Recibe el token como string (no el Request original) para no depender
    del scope de la request, que ya termino al ejecutarse esta tarea.
    """
    try:
        bs = BrightspaceClient(tokens={"access_token": access_token})
        sync_svc = SyncService(bs)

        #|---------- Refrescar enrollments antes que snapshots ----------|
        # sync_classlist actualiza la tabla enrollments y desactiva los
        # estudiantes que ya no estan en la classlist de Brightspace. Sin
        # esto, los snapshots de estudiantes removidos seguirian siendo
        # visibles en la siguiente lectura desde Postgres.
        classlist_result = await sync_svc.sync_classlist(orgUnitId)
        snapshots_result = await sync_svc.sync_student_metric_snapshots(orgUnitId)

        logger.info(
            "Refresh DB en background completado ou=%s: classlist=%s snapshots=%s",
            orgUnitId,
            str(classlist_result)[:120],
            str(snapshots_result)[:120],
        )
    except Exception as e:
        logger.warning(
            "Refresh DB en background fallo ou=%s: %s",
            orgUnitId, e,
        )


def _extract_access_token_from_client(bs: BrightspaceClient) -> Optional[str]:
    """
    Obtiene el access_token resuelto de un BrightspaceClient activo,
    para pasarselo a una background task. Devuelve None si no se puede
    resolver (en cuyo caso no programamos el refresh).
    """
    # Path explicito: tokens dict pasado al constructor
    if bs._tokens:
        t = bs._tokens.get("access_token")
        if t:
            return t

    # Path sesion: extraemos via _auth_headers que llama _resolve_token
    try:
        headers = bs._auth_headers()
        auth = headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip() or None
    except Exception:
        return None
    return None


router = APIRouter(prefix="/gemelo", tags=["gemelo"])

# Cache simple en memoria para el RA dashboard (evita recalcular en cada refresh)
import time as _time
import asyncio as _asyncio
_RA_DASHBOARD_CACHE: dict = {}
_RA_DASHBOARD_TTL = 300  # 5 minutos
_RA_DASHBOARD_LOCKS: dict = {}  # un Lock por orgUnitId para evitar stampede


def _get_ra_lock(orgUnitId: int) -> _asyncio.Lock:
    """Devuelve (creando si es necesario) el Lock para el cache de un curso."""
    if orgUnitId not in _RA_DASHBOARD_LOCKS:
        _RA_DASHBOARD_LOCKS[orgUnitId] = _asyncio.Lock()
    return _RA_DASHBOARD_LOCKS[orgUnitId]




def _dump(obj: Any) -> Dict[str, Any]:
    """
    Convierte Pydantic/dataclass/obj a dict de forma defensiva.
    Cubre los casos que causaban el error:
      - obj es None o Ellipsis (...)
      - obj es un tipo primitivo (str, int, bool)
      - obj es Pydantic con campos en Ellipsis
      - obj no tiene __dict__
    """
    # Casos nulos o centinela
    if obj is None or obj is ...:
        return {}

    # Ya es dict: devolver directo
    if isinstance(obj, dict):
        # Filtramos valores Ellipsis que puedan venir en el dict
        return {k: v for k, v in obj.items() if v is not ...}

    # Tipos primitivos: no tienen sentido como dict
    if isinstance(obj, (str, int, float, bool, list, tuple, set)):
        return {}

    # Pydantic v2
    if hasattr(obj, "model_dump"):
        try:
            result = obj.model_dump()
            if isinstance(result, dict):
                return result
        except Exception as e:
            logger.warning("_dump model_dump() falló: %s", e)

    # Pydantic v1
    if hasattr(obj, "dict"):
        try:
            result = obj.dict()
            if isinstance(result, dict):
                return result
        except Exception as e:
            logger.warning("_dump .dict() falló: %s", e)

    # Dataclass / objeto genérico con __dict__
    try:
        raw = vars(obj)
        # Filtramos Ellipsis y privados
        return {
            k: v
            for k, v in raw.items()
            if not k.startswith("_") and v is not ...
        }
    except TypeError:
        # vars() falla en objetos sin __dict__ (built-ins, slots, etc.)
        logger.warning("_dump vars() falló para tipo %s", type(obj))
        return {}


def _safe_bundle(orgUnitId: int) -> Dict[str, Any]:
    """
    Carga el bundle del curso de forma segura.
    Si no existe o falla, retorna dict vacío sin propagar la excepción.
    Centraliza el try/except para no repetirlo en cada endpoint.
    """
    try:
        return load_course_bundle(orgUnitId) or {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        logger.warning("_safe_bundle orgUnitId=%s error=%s", orgUnitId, e)
        return {}



# =========================================================
# Endpoints productivos
# =========================================================

@router.get("/course/{orgUnitId}/student/{userId}")
@limiter.limit("60/minute")
async def gemelo_course_student(
    request: Request,
    orgUnitId: int,
    userId: int,
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_member),
):
    # El gemelo de un estudiante solo lo ve el profesor del curso, un
    # administrador, o el propio estudiante.
    if not access["isInstructor"] and str(userId) != str(access["userId"]):
        raise HTTPException(
            status_code=403,
            detail="Solo puedes ver tu propia información.",
        )
    try:
        return await svc.build_gemelo(orgUnitId, userId)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _http500(e, "gemelo_course_student", orgUnitId=orgUnitId, userId=userId)


@router.get("/course/{orgUnitId}/overview")
@limiter.limit("30/minute")
async def gemelo_course_overview(
    request: Request,
    orgUnitId: int,
    background_tasks: BackgroundTasks,
    fresh_max_minutes: int = Query(
        30,
        ge=0,
        le=525600,  # 1 ano — escape para forzar DB con data muy vieja en pruebas
        description="Edad maxima (minutos) para servir desde DB. 0 = forzar Brightspace.",
    ),
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_staff),
):
    """
    Devuelve el overview agregado del curso (medias del gradebook,
    distribucion de riesgo, alertas, etc.) priorizando lectura desde
    Postgres y cayendo a Brightspace solo cuando es necesario.

    Flujo:

    1. Lee los snapshots desde Postgres. Si hay datos y `lastSyncAt`
       esta dentro de `fresh_max_minutes`, responde con `source="db"`.
       Tiempo tipico: < 50 ms.

    2. Si la DB no tiene datos frescos (o el lookup falla), llama a
       Brightspace para reconstruir el overview en vivo y responde
       con `source="brightspace"`. Tiempo tipico: 1-3 s.

    3. Tras un fallback exitoso a Brightspace, programa una tarea de
       background que re-sincroniza los snapshots usando la sesion del
       usuario actual. La proxima peticion al mismo curso encontrara
       DB fresca y se servira rapida sin volver a Brightspace.

    El cliente puede forzar el bypass de la cache con
    `?fresh_max_minutes=0`.
    """
    #|---------- Lectura rapida desde Postgres ----------|
    try:
        db_result = await build_course_overview_from_db(orgUnitId)
        if db_result.get("hasData") and is_fresh(
            db_result.get("lastSyncAt"), fresh_max_minutes
        ):
            db_result["source"] = "db"
            logger.info(
                "overview ou=%s servido desde Postgres (lastSyncAt=%s)",
                orgUnitId, db_result.get("lastSyncAt"),
            )
            # Upsert snapshot diario de tendencias en background
            background_tasks.add_task(_upsert_history_bg, orgUnitId, db_result)
            return db_result
    except Exception as e:
        logger.warning(
            "overview ou=%s: lectura de Postgres fallo (%s); reconstruyendo desde Brightspace",
            orgUnitId, e,
        )

    #|---------- Reconstruccion desde Brightspace + persistencia en background ----------|
    logger.info("overview ou=%s reconstruyendo desde Brightspace", orgUnitId)
    try:
        bs_result = await svc.build_course_overview(orgUnitId)
        if isinstance(bs_result, dict):
            bs_result.setdefault("source", "brightspace")

        # Tras una llamada exitosa a Brightspace, persistimos los snapshots
        # en background para acelerar la siguiente peticion al mismo curso.
        # Errores aqui no afectan la respuesta al cliente.
        try:
            access_token = _extract_access_token_from_client(svc.bs)
            if access_token:
                background_tasks.add_task(
                    _refresh_overview_db_bg, orgUnitId, access_token
                )
                logger.info(
                    "overview ou=%s programado refresh DB en background",
                    orgUnitId,
                )
            else:
                logger.warning(
                    "overview ou=%s sin access_token resoluble; no se programa refresh",
                    orgUnitId,
                )
        except Exception as e:
            # Errores aqui no deben afectar la respuesta al cliente
            logger.warning(
                "overview ou=%s no se pudo programar refresh DB en background: %s",
                orgUnitId, e,
            )

        # Upsert snapshot diario de tendencias en background
        if isinstance(bs_result, dict) and bs_result.get("studentsCount"):
            background_tasks.add_task(_upsert_history_bg, orgUnitId, bs_result)

        return bs_result
    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _http500(e, "gemelo_course_overview", orgUnitId=orgUnitId)


@router.get("/course/{orgUnitId}/metric-history")
async def gemelo_course_metric_history(
    orgUnitId: int,
    days: int = Query(90, ge=1, le=365, description="Número de días de historia a devolver"),
    access: Dict[str, Any] = Depends(require_course_staff),
):
    """
    Devuelve los snapshots diarios de tendencias del curso (últimos N días).
    Usado por el gráfico CourseTrends del dashboard del profesor.
    Fuente: DB — no llama a Brightspace.
    """
    try:
        history = get_course_metric_history(orgUnitId, days=days)
        return {
            "orgUnitId": orgUnitId,
            "days": days,
            "count": len(history),
            "snapshots": history,
        }
    except Exception as e:
        _http500(e, "gemelo_course_metric_history", orgUnitId=orgUnitId)


@router.get("/course/{orgUnitId}/ra/dashboard")
@limiter.limit("10/minute")
async def gemelo_course_ra_dashboard(
    request: Request,
    orgUnitId: int,
    only_students: bool = Query(True, description="Si true, filtra roles de estudiante"),
    limit: Optional[int] = Query(None, ge=1, le=500, description="Max usuarios a procesar (para piloto)"),
    concurrency: int = Query(8, ge=1, le=25, description="Concurrencia de cómputo (no subir demasiado)"),
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_staff),
):
    """
    Agrega RA1/RA2/RA3 a nivel curso a partir del cálculo existente del gemelo
    por estudiante. Retorna promedio (%) y cobertura por RA.
    """
    try:
        # Chequeo rápido fuera del lock — si hay cache válido lo devolvemos sin bloquear
        now_ts = _time.time()
        cached = _RA_DASHBOARD_CACHE.get(orgUnitId)
        if cached and (now_ts - cached["ts"] < _RA_DASHBOARD_TTL):
            cached_ras = (cached["data"].get("ras") or [])
            # Cachea si hay resultados de aprendizaje (aunque sean sin datos de
            # rúbrica: cursos evaluados solo por quiz igual listan sus RAs).
            if cached_ras:
                return cached["data"]

        # Adquirir lock por curso para evitar que requests concurrentes
        # calculen el RA dashboard en paralelo (stampede / CPU duplicado)
        async with _get_ra_lock(orgUnitId):
            # Re-chequear dentro del lock: puede que otra coroutine ya calculó
            now_ts = _time.time()
            cached = _RA_DASHBOARD_CACHE.get(orgUnitId)
            if cached and (now_ts - cached["ts"] < _RA_DASHBOARD_TTL):
                cached_ras = (cached["data"].get("ras") or [])
                if cached_ras:
                    return cached["data"]

            students_payload = await svc.list_course_students(orgUnitId)
            items = (
                students_payload.get("items") or []
                if isinstance(students_payload, dict)
                else []
            )

            if not items:
                return {
                    "orgUnitId": orgUnitId,
                    "totalStudents": 0,
                    "ras": [],
                    "updatedAt": None,
                    "note": "Sin estudiantes en list_course_students()",
                }

            if only_students:
                items = [
                    s for s in items
                    if _is_student_role(s.get("roleName") or s.get("RoleName"))
                ]

            if limit:
                items = items[:limit]

            user_ids: List[int] = []
            for s in items:
                uid = s.get("userId") or s.get("UserId") or s.get("UserID")
                if uid is None:
                    continue
                try:
                    user_ids.append(int(uid))
                except Exception:
                    continue

            total_students = len(user_ids)
            if total_students == 0:
                return {
                    "orgUnitId": orgUnitId,
                    "totalStudents": 0,
                    "ras": [],
                    "updatedAt": None,
                }

            coros = [svc.build_gemelo(orgUnitId, uid) for uid in user_ids]
            results = await _gather_with_semaphore(coros, limit=concurrency)

            agg: Dict[str, Dict[str, Any]] = defaultdict(
                lambda: {"sum": 0.0, "count": 0}
            )
            last_updated_at: Optional[str] = None

            for r in results:
                if isinstance(r, Exception) or not isinstance(r, dict):
                    continue

                try:
                    upd = (
                        (r.get("summary") or {}).get("updatedAt")
                        or (r.get("course") or {}).get("updatedAt")
                    )
                    if upd:
                        last_updated_at = upd
                except Exception:
                    pass

                macro_units = (r.get("macro") or {}).get("units") or []
                for u in macro_units:
                    code = u.get("code")
                    pct = u.get("pct")
                    if not code or pct is None:
                        continue
                    try:
                        agg[code]["sum"] += float(pct)
                        agg[code]["count"] += 1
                    except Exception:
                        continue

            # Catálogo de resultados de aprendizaje reales del curso y qué
            # outcomes están alineados a asignaciones (rúbricas). Sirve para
            # (a) etiquetar con la descripción real y (b) listar TAMBIÉN los
            # resultados sin datos de rúbrica, marcándolos "no alineado a
            # asignaciones" (típicamente solo evaluados por quiz), sin calcular
            # su nota — eso queda pendiente.
            try:
                outcome_index = await svc._get_outcome_index(orgUnitId)
            except Exception:
                outcome_index = {}
            try:
                align_index = await svc._get_alignment_index(orgUnitId)
            except Exception:
                align_index = {}
            aligned_outcome_ids = {
                oid for oids in align_index.values() for oid in oids
            }
            code_to_info = {
                info.get("code"): info
                for info in outcome_index.values()
                if info.get("code")
            }
            code_to_oid = {
                info.get("code"): oid
                for oid, info in outcome_index.items()
                if info.get("code")
            }

            ras = []
            seen_codes = set()
            for code in sorted(agg.keys()):
                count = agg[code]["count"]
                avg = round(agg[code]["sum"] / count, 1) if count else None
                coverage_pct = (
                    round((count / total_students) * 100.0, 1)
                    if total_students else 0.0
                )
                info = code_to_info.get(code) or {}
                ras.append({
                    "code": code,
                    "label": info.get("title") or code,
                    "title": info.get("title"),
                    "avgPct": avg,
                    "coveragePct": coverage_pct,
                    "studentsWithData": count,
                    "totalStudents": total_students,
                    "alignedToAssignment": True,
                })
                seen_codes.add(code)

            # Resultados de aprendizaje reales SIN datos de rúbrica: los
            # mostramos igual pero sin nota. Si tampoco están alineados a una
            # rúbrica (solo quiz o sin alinear), lo indicamos explícitamente.
            for oid, info in outcome_index.items():
                code = info.get("code")
                if not code or code in seen_codes:
                    continue
                aligned = oid in aligned_outcome_ids
                ras.append({
                    "code": code,
                    "label": info.get("title") or code,
                    "title": info.get("title"),
                    "avgPct": None,
                    "coveragePct": 0.0,
                    "studentsWithData": 0,
                    "totalStudents": total_students,
                    "alignedToAssignment": aligned,
                    "note": None if aligned else "No alineado a asignaciones",
                })
                seen_codes.add(code)

            ras.sort(key=lambda x: x["code"])

            # RA evaluados por QUIZ: promedio (%) por outcome alineado a quizzes.
            # Va en una pestaña lateral aparte de los RA por rúbrica/asignación.
            try:
                quiz_outcomes = await svc.build_quiz_outcomes(
                    orgUnitId, user_ids, outcome_index, concurrency=concurrency
                )
            except Exception:
                quiz_outcomes = []

            payload = {
                "orgUnitId": orgUnitId,
                "totalStudents": total_students,
                "updatedAt": last_updated_at,
                "ras": ras,
                "quizOutcomes": quiz_outcomes,
            }

            _RA_DASHBOARD_CACHE[orgUnitId] = {"ts": _time.time(), "data": payload}
            return payload

    except Exception as e:
        _http500(e, "gemelo_course_ra_dashboard", orgUnitId=orgUnitId)


@router.get("/course/{orgUnitId}/students")
async def gemelo_course_students(
    orgUnitId: int,
    with_metrics: bool = Query(False),
    include: Optional[str] = Query(None),   # "summary" → activa métricas batch
    svc: GemeloService = Depends(get_service),
    access: Dict[str, Any] = Depends(require_course_staff),
):
    try:
        bundle = _safe_bundle(orgUnitId)

        # ── Extraer course de forma segura ──────────────────────────────────
        # bundle puede ser:
        #   a) {"course": <PydanticModel>, "rubricsModel": ...}  → caso normal
        #   b) {}                                                 → sin config
        #   c) el propio modelo de curso directamente             → config plana
        #
        # NO hacemos `bundle.get("course") or bundle` porque si "course" existe
        # pero es un objeto Pydantic con campos en Ellipsis, el `or` lo ignora
        # y cae al bundle entero, propagando el mismo problema.
        raw_course = bundle.get("course") if isinstance(bundle, dict) else bundle
        course_dict = _dump(raw_course) if raw_course is not None else {}

        students = await svc.list_course_students(orgUnitId)

        # Thresholds de forma segura
        scale = course_dict.get("scale")
        thresholds = (
            scale.get("thresholds")
            if isinstance(scale, dict)
            else None
        )

        course_brief = {
            "orgUnitId": orgUnitId,
            "modelType": (
                course_dict.get("modelType")
                or course_dict.get("maturityProfile")
            ),
            "maturityProfile": course_dict.get("maturityProfile"),
            "scale": scale,
            "thresholds": thresholds,
        }

        items: List[Dict[str, Any]] = students.get("items") or []

        # include=summary es alias de with_metrics=true (usado por el frontend)
        load_metrics = with_metrics or (include == "summary")

        if load_metrics and items:
            student_ids = [
                int(x["userId"])
                for x in items
                if x.get("userId") is not None
            ]
            # Pasamos raw_course (el objeto original), no course_dict,
            # porque compute_students_gradebook_metrics ya llama _as_dict internamente
            metrics_by_user = await svc.compute_students_gradebook_metrics(
                orgUnitId, student_ids, raw_course
            )

            enriched = []
            for s in items:
                uid = int(s["userId"])
                m = metrics_by_user.get(uid, {})
                enriched.append({**s, "summary": m, "gradebook": m})
            items = enriched

        return {
            "course": course_brief,
            "students": {
                "count": students.get("count", 0),
                "items": items,
            },
        }

    except Exception as e:
        _http500(e, "gemelo_course_students", orgUnitId=orgUnitId)


@router.get("/config/{orgUnitId}")
def get_course_config(
    orgUnitId: int,
    access: Dict[str, Any] = Depends(require_course_member),
):
    try:
        bundle = load_course_bundle(orgUnitId)
        # Dumpeamos el bundle completo, no solo "course"
        bundle_dict = _dump(bundle) if bundle is not None else {}
        return {
            "course": bundle_dict,
            "hasRubricsModel": (
                bundle.get("rubricsModel") is not None
                if isinstance(bundle, dict)
                else hasattr(bundle, "rubricsModel")
            ),
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _http500(e, "get_course_config", orgUnitId=orgUnitId)



@router.get("/course/{orgUnitId}/grade-items")
async def gemelo_grade_items(
    orgUnitId: int,
    svc: GemeloService = Depends(get_service),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    access: Dict[str, Any] = Depends(require_course_member),
):
    """Devuelve grade items + dropbox folders del curso con sus due dates.
    Lee desde cache DB (sync de JC). Fallback a Brightspace si el cache está vacío,
    y dispara re-sync en background para la próxima petición."""

    def _build_items_from_db(db_grade_items, db_dropbox_folders):
        dropbox_by_id: Dict[str, Any] = {}
        dropbox_by_grade_item: Dict[str, Any] = {}
        for df in db_dropbox_folders:
            key = str(df.brightspace_folder_id)
            dropbox_by_id[key] = df
            if df.grade_item_id is not None:
                dropbox_by_grade_item[str(df.grade_item_id)] = df

        items = []
        seen_dropbox_ids: set = set()

        for gi in db_grade_items:
            grade_id = gi.brightspace_grade_object_id
            due_date = gi.due_date
            end_date = gi.end_date
            start_date = None
            linked_dropbox_id = None

            linked_df = None
            if gi.associated_tool_id in (1, 2000) and gi.associated_tool_item_id is not None:
                linked_df = dropbox_by_id.get(str(gi.associated_tool_item_id))
            if not linked_df and grade_id is not None:
                linked_df = dropbox_by_grade_item.get(str(grade_id))

            if linked_df:
                seen_dropbox_ids.add(str(linked_df.brightspace_folder_id))
                if not due_date:
                    due_date = linked_df.due_date
                if not end_date:
                    end_date = linked_df.due_date
                start_date = linked_df.start_date
                linked_dropbox_id = linked_df.brightspace_folder_id

            items.append({
                "id": grade_id,
                "name": gi.name,
                "weightPct": gi.weight,
                "maxPoints": gi.max_points,
                "startDate": start_date,
                "dueDate": due_date,
                "endDate": end_date,
                "gradeType": gi.grade_type,
                "categoryId": gi.category_id,
                "source": "grade_item",
                "linkedDropboxId": linked_dropbox_id,
            })

        for df in db_dropbox_folders:
            if str(df.brightspace_folder_id) in seen_dropbox_ids:
                continue
            items.append({
                "id": df.brightspace_folder_id,
                "name": df.name,
                "weightPct": None,
                "maxPoints": None,
                "startDate": df.start_date,
                "dueDate": df.due_date,
                "endDate": df.end_date or df.due_date,
                "gradeType": "Dropbox",
                "categoryId": df.category_id,
                "source": "dropbox",
                "linkedDropboxId": df.brightspace_folder_id,
            })

        return items

    # --- Try DB cache first ---
    try:
        db = SessionLocal()
        try:
            db_grade_items = db.execute(
                select(GradeItem).where(GradeItem.org_unit_id == orgUnitId)
            ).scalars().all()
            db_dropbox_folders = db.execute(
                select(DropboxFolder).where(DropboxFolder.org_unit_id == orgUnitId)
            ).scalars().all()
        finally:
            db.close()

        if db_grade_items or db_dropbox_folders:
            items = _build_items_from_db(db_grade_items, db_dropbox_folders)
            return {
                "orgUnitId": orgUnitId,
                "count": len(items),
                "gradeItemsCount": len(db_grade_items),
                "dropboxFoldersCount": len(db_dropbox_folders),
                "items": items,
                "source": "cache",
            }
    except Exception as db_err:
        logger.warning("grade-items DB cache miss for %s: %s", orgUnitId, db_err)

    # --- Fallback: live Brightspace ---
    async def _safe_grade_items():
        try:
            raw = await svc.bs.list_grade_items(orgUnitId)
            if isinstance(raw, dict):
                return raw.get("Items") or raw.get("items") or []
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    async def _safe_dropbox_folders():
        try:
            raw = await svc.bs.list_dropbox_folders(orgUnitId)
            if isinstance(raw, dict):
                return raw.get("Items") or raw.get("items") or []
            return raw if isinstance(raw, list) else []
        except Exception:
            return []

    def _pick_dropbox_due_date(df: dict) -> Optional[str]:
        if not isinstance(df, dict):
            return None
        direct = df.get("DueDate") or df.get("EndDate")
        if direct:
            return direct
        availability = df.get("Availability") or {}
        if isinstance(availability, dict):
            for k in ("DueDate", "EndDate", "dueDate", "endDate"):
                if availability.get(k):
                    return availability[k]
        for k in ("RestrictedDueDate", "SubmissionEndDate"):
            if df.get(k):
                return df[k]
        return None

    def _pick_dropbox_start_date(df: dict) -> Optional[str]:
        if not isinstance(df, dict):
            return None
        direct = df.get("StartDate")
        if direct:
            return direct
        availability = df.get("Availability") or {}
        if isinstance(availability, dict):
            for k in ("StartDate", "startDate"):
                if availability.get(k):
                    return availability[k]
        return None

    try:
        grade_items, dropbox_folders = await asyncio.gather(
            _safe_grade_items(),
            _safe_dropbox_folders(),
        )

        dropbox_by_id = {}
        dropbox_by_grade_item = {}
        for df in dropbox_folders:
            if not isinstance(df, dict):
                continue
            df_id = df.get("Id") or df.get("Identifier")
            if df_id is not None:
                dropbox_by_id[str(df_id)] = df
            grade_item_id = df.get("GradeItemId")
            if grade_item_id is not None:
                dropbox_by_grade_item[str(grade_item_id)] = df

        items = []
        seen_dropbox_ids = set()

        for it in grade_items:
            if not isinstance(it, dict):
                continue
            grade_id = it.get("Id") or it.get("Identifier")
            name = it.get("Name")
            due_date = it.get("DueDate")
            end_date = it.get("EndDate")

            associated = it.get("AssociatedTool") or {}
            tool_item_id = associated.get("ToolItemId")
            tool_id = associated.get("ToolId")
            linked_dropbox = None
            if tool_id in (1, 2000) and tool_item_id is not None:
                linked_dropbox = dropbox_by_id.get(str(tool_item_id))
            if not linked_dropbox and grade_id is not None:
                linked_dropbox = dropbox_by_grade_item.get(str(grade_id))

            start_date = None
            if linked_dropbox:
                seen_dropbox_ids.add(str(linked_dropbox.get("Id") or ""))
                df_due = _pick_dropbox_due_date(linked_dropbox)
                if not due_date:
                    due_date = df_due
                if not end_date:
                    end_date = df_due
                start_date = _pick_dropbox_start_date(linked_dropbox)

            items.append({
                "id": grade_id,
                "name": name,
                "weightPct": it.get("Weight"),
                "maxPoints": it.get("MaxPoints"),
                "startDate": start_date,
                "dueDate": due_date,
                "endDate": end_date,
                "gradeType": it.get("GradeType"),
                "categoryId": it.get("CategoryId"),
                "source": "grade_item",
                "linkedDropboxId": (linked_dropbox or {}).get("Id"),
            })

        for df in dropbox_folders:
            if not isinstance(df, dict):
                continue
            df_id = df.get("Id") or df.get("Identifier")
            if str(df_id) in seen_dropbox_ids:
                continue
            df_due = _pick_dropbox_due_date(df)
            df_start = _pick_dropbox_start_date(df)
            items.append({
                "id": df_id,
                "name": df.get("Name"),
                "weightPct": None,
                "maxPoints": None,
                "startDate": df_start,
                "dueDate": df_due,
                "endDate": df_due,
                "gradeType": "Dropbox",
                "categoryId": df.get("CategoryId"),
                "source": "dropbox",
                "linkedDropboxId": df_id,
            })

        # Trigger background sync so the next request hits the cache
        async def _bg_sync():
            try:
                sync_svc = SyncService(svc.bs)
                await sync_svc.sync_grade_items(orgUnitId)
                await sync_svc.sync_dropbox_folders(orgUnitId)
            except Exception as e:
                logger.warning("grade-items bg sync failed for %s: %s", orgUnitId, e)

        background_tasks.add_task(_bg_sync)

        return {
            "orgUnitId": orgUnitId,
            "count": len(items),
            "gradeItemsCount": len(grade_items),
            "dropboxFoldersCount": len(dropbox_folders),
            "items": items,
            "source": "live",
        }
    except Exception as e:
        msg = str(e)
        if "403" in msg or "401" in msg or "404" in msg:
            return {"orgUnitId": orgUnitId, "count": 0, "items": [], "error": msg[:200]}
        _http500(e, "gemelo_grade_items", orgUnitId=orgUnitId)



# =========================================================
# Helpers internos
# =========================================================

def _is_student_role(role_name: Optional[str]) -> bool:
    """Filtra solo estudiantes. Si no viene rol, no bloquea."""
    if not role_name:
        return True
    rn = role_name.lower()
    return ("student" in rn) or ("estudiante" in rn) or ("learner" in rn)


async def _gather_with_semaphore(coros, limit: int = 10):
    """Ejecuta corutinas con límite de concurrencia."""
    sem = asyncio.Semaphore(limit)

    async def runner(c):
        async with sem:
            return await c

    return await asyncio.gather(*(runner(c) for c in coros), return_exceptions=True)



# =========================================================
# Sub-routers extraidos (refactor #15) — mismo API surface
# =========================================================
from app.api.gemelo_outcomes import router as _outcomes_router
from app.api.gemelo_debug import router as _debug_router
from app.api.gemelo_admin import router as _admin_router

router.include_router(_outcomes_router)
router.include_router(_debug_router)
router.include_router(_admin_router)
