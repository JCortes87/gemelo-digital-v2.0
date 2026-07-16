# app/api/gemelo.py
import logging
import re
import traceback
from typing import Any, Dict, List, Optional
import asyncio
from collections import defaultdict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.config_loader import load_course_bundle
from app.rate_limit import limiter
from app.security import require_debug_enabled
from app.services.brightspace_client import BrightspaceClient, get_brightspace_client
from app.services.gemelo_service import GemeloService
from app.services.sync_service import SyncService

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

logger = logging.getLogger("uvicorn.error")

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



def get_service(
    request: Request,
    bs: "BrightspaceClient" = Depends(get_brightspace_client),
) -> GemeloService:
    return GemeloService(bs)


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


def _http500(e: Exception, where: str, **ctx):
    # Preservar HTTPException (401/403/404/429...) con su status original: un
    # error de autenticación (401) NO debe enmascararse como 500 — inflaba la
    # RollbackAlarm en cada redeploy (sesiones en memoria perdidas → 401→500) e
    # impedía que el frontend detectara el 401 para pedir re-login.
    if isinstance(e, HTTPException):
        raise e
    logger.error("HTTP 500 en %s | ctx=%s | err=%s", where, ctx, str(e))
    logger.error(traceback.format_exc())
    raise HTTPException(status_code=500, detail=str(e))


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
):
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
def get_course_config(orgUnitId: int):
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


# =========================================================
# Endpoints de debug
# =========================================================

@router.get("/debug/{orgUnitId}/folders", dependencies=[Depends(require_debug_enabled)])
async def debug_folders(
    orgUnitId: int,
    svc: GemeloService = Depends(get_service),
):
    try:
        data = await svc.bs.list_dropbox_folders(orgUnitId)
        return {"orgUnitId": orgUnitId, "pythonType": str(type(data)), "data": data}
    except Exception as e:
        _http500(e, "debug_folders", orgUnitId=orgUnitId)


@router.get("/debug/{orgUnitId}/rubric/{rubricId}", dependencies=[Depends(require_debug_enabled)])
async def debug_rubric(
    orgUnitId: int,
    rubricId: str,
    svc: GemeloService = Depends(get_service),
):
    try:
        return await svc.bs.get_rubric_detail(orgUnitId, rubricId)
    except Exception as e:
        _http500(e, "debug_rubric", orgUnitId=orgUnitId, rubricId=rubricId)


@router.get("/course/{orgUnitId}/learning-outcomes")
async def gemelo_learning_outcomes(
    orgUnitId: int,
    svc: GemeloService = Depends(get_service),
):
    try:
        from app.services.auto_lo_config import build_auto_lo_config

        data = await svc.bs.list_outcome_sets(orgUnitId)
        auto = {}
        try:
            auto = await build_auto_lo_config(svc.bs, orgUnitId)
        except Exception:
            auto = {}

        activity_to_outcomes = auto.get("activityToOutcomes") or {}
        activity_names = await _resolve_activity_names(svc, orgUnitId, activity_to_outcomes)

        return {
            "orgUnitId": orgUnitId,
            "outcomeSets": data,
            "outcomeCodeMap": auto.get("outcomeCodeMap") or {},
            "outcomeIndex": auto.get("outcomeIndex") or {},
            "rubricToOutcomeCodes": {
                rid: (info or {}).get("outcomeCodes", [])
                for rid, info in (
                    (auto.get("rubricsModel") or {}).get("rubrics") or {}
                ).items()
            },
            "activityToOutcomes": activity_to_outcomes,
            "activityNames": activity_names,
            "hasRubricAlignments": bool(auto.get("hasRubricAlignments")),
            "hasQuestionOnly": bool(auto.get("hasQuestionOnly")),
        }
    except Exception as e:
        _http500(e, "gemelo_learning_outcomes", orgUnitId=orgUnitId)


async def _resolve_activity_names(
    svc: GemeloService,
    orgUnitId: int,
    activity_to_outcomes: Dict[str, Any],
) -> Dict[str, str]:
    """
    Devuelve { "Type:Id" : "Nombre legible" } para las actividades alineadas.
    Best-effort: resuelve Assignment (carpetas de entrega) y Quiz. Los tipos
    sin lista fácil (DiscussionTopic, ContentObject, QuizQuestion) se omiten y
    el frontend cae al "Type #Id".
    """
    names: Dict[str, str] = {}
    keys = list(activity_to_outcomes.keys())
    if not keys:
        return names

    types_present = {k.split(":", 1)[0] for k in keys}

    def _norm_list(x: Any) -> List[Dict[str, Any]]:
        if isinstance(x, list):
            return [it for it in x if isinstance(it, dict)]
        if isinstance(x, dict):
            for k in ("Items", "Objects", "items"):
                v = x.get(k)
                if isinstance(v, list):
                    return [it for it in v if isinstance(it, dict)]
        return []

    folder_by_id: Dict[str, str] = {}
    quiz_by_id: Dict[str, str] = {}

    coros = []
    labels = []
    if "Assignment" in types_present:
        coros.append(svc.bs.list_dropbox_folders(orgUnitId)); labels.append("Assignment")
    if "Quiz" in types_present:
        coros.append(svc.bs.list_quizzes(orgUnitId)); labels.append("Quiz")

    if coros:
        results = await asyncio.gather(*coros, return_exceptions=True)
        for label, res in zip(labels, results):
            if isinstance(res, Exception):
                continue
            for it in _norm_list(res):
                if label == "Assignment":
                    fid = it.get("Id") or it.get("id")
                    if fid is not None:
                        folder_by_id[str(fid)] = str(it.get("Name") or it.get("name") or "").strip()
                else:  # Quiz
                    qid = it.get("QuizId") or it.get("Id") or it.get("id")
                    if qid is not None:
                        quiz_by_id[str(qid)] = str(it.get("Name") or it.get("name") or "").strip()

    for key in keys:
        t, _, oid = key.partition(":")
        nm = ""
        if t == "Assignment":
            nm = folder_by_id.get(oid, "")
        elif t == "Quiz":
            nm = quiz_by_id.get(oid, "")
        if nm:
            names[key] = nm

    return names


def _norm_registry_outcome(o: dict) -> dict:
    return {
        "id": o.get("OutcomeId"),
        "shortCode": (o.get("ShortCode") or "").strip(),
        "description": (o.get("Description") or "").strip(),
        "children": [_norm_registry_outcome(c) for c in (o.get("Children") or [])],
    }


def _count_registry_outcomes(items: list) -> int:
    return sum(1 + _count_registry_outcomes(it["children"]) for it in items)


@router.get("/outcomes/registry")
async def outcomes_registry(
    request: Request,
    svc: GemeloService = Depends(get_service),
):
    """
    Fase 1 — Visor global de RA (super admin, solo lectura).

    Lee el registro central de conjuntos de RA a nivel tenant
    (GET /d2l/api/le/{lo}/lo/outcomeSets/, scope outcomes:sets:read) y lo
    devuelve normalizado y ordenado por nombre. Es lo que la coordinadora
    edita manualmente en /d2l/le/6606/lo/programs/.
    """
    _require_super_admin(request)
    raw = await svc.bs.list_outcome_registry()
    sets: list[dict] = []
    total = 0
    for s in raw:
        outs = [_norm_registry_outcome(o) for o in (s.get("Outcomes") or [])]
        cnt = _count_registry_outcomes(outs)
        total += cnt
        sets.append({
            "setId": s.get("OutcomeSetId"),
            "name": s.get("Name") or "",
            "outcomeCount": cnt,
            "outcomes": outs,
        })
    sets.sort(key=lambda x: (x["name"] or "").lower())
    return {"setCount": len(sets), "outcomeTotal": total, "sets": sets}


def _norm_ou(x: dict) -> dict:
    t = x.get("Type") or {}
    return {
        "id": x.get("Identifier") or x.get("OrgUnitId") or x.get("Id"),
        "name": x.get("Name") or "",
        "code": x.get("Code") or "",
        "typeId": t.get("Id"),
        "typeName": t.get("Name") or t.get("Code") or "",
    }


@router.get("/orgstructure/search")
async def orgstructure_search(
    request: Request,
    name: str | None = None,
    code: str | None = None,
    typeId: int | None = None,
    svc: GemeloService = Depends(get_service),
):
    """
    Fase 2 — Busca unidades organizativas (super admin). Sirve para localizar
    la unidad del semestre (ej. 20262) por nombre/código.
    """
    _require_super_admin(request)
    items = await svc.bs.search_orgunits(name=name, code=code, type_id=typeId)
    return {"count": len(items), "items": [_norm_ou(x) for x in items]}


@router.get("/orgstructure/{ou}/descendants")
async def orgstructure_descendants(
    ou: int,
    request: Request,
    typeId: int | None = None,
    svc: GemeloService = Depends(get_service),
):
    """
    Fase 2 — Descendientes de una unidad (ej. cursos bajo un semestre).
    Sin typeId devuelve todos + un histograma de tipos (para descubrir cuál es
    el tipo "curso" en este tenant). Con typeId filtra a ese tipo.
    """
    _require_super_admin(request)
    items = await svc.bs.list_descendants(ou, ou_type_id=typeId)
    norm = [_norm_ou(x) for x in items]
    histogram: dict[str, int] = {}
    for n in norm:
        key = f"{n['typeId']}:{n['typeName']}"
        histogram[key] = histogram.get(key, 0) + 1
    return {
        "orgUnitId": ou,
        "count": len(norm),
        "typeHistogram": histogram,
        "items": norm,
    }


@router.get("/outcomes/probe/{orgUnitId}")
async def probe_outcomes_registry(
    orgUnitId: int,
    request: Request,
    programId: int | None = None,
    setId: int | None = None,
    paths: str | None = None,
    svc: GemeloService = Depends(get_service),
):
    """
    Diagnóstico super-admin: sondea varios endpoints candidatos del registro
    global de Resultados de Aprendizaje para descubrir cuál responde en este
    tenant (mismo enfoque empírico con el que hallamos alignments 1.93).

    Ronda 2: barre versiones LE sobre /outcomes/ (por si el 404 es negociación
    de versión, no ausencia de ruta) y prueba la ruta específica del programa.

    Params opcionales:
      - programId: prueba .../lo/programs/{programId} en varias versiones.
      - paths: rutas arbitrarias separadas por coma o salto de línea. Si empiezan
        por http se usan tal cual; si no, se anteponen al base_url. Permite probar
        endpoints nuevos SIN reiniciar el backend.

    Devuelve status + muestra por cada candidato. Solo lectura.
    """
    _require_super_admin(request)
    base = svc.bs.base_url
    lo = svc.bs.lo_version       # 1.92
    al = svc.bs.align_version    # 1.93
    lp = svc.bs.lp_version       # 1.50

    candidates: list[tuple[str, str]] = [
        # ── Ronda 3: TENANT-level outcomeSets (sin orgUnitId) = el registro real ──
        # Documentado en outcomes:sets:read → /d2l/api/le/(v)/lo/outcomeSets/
        ("outcomeSets TENANT @le/lo",    f"{base}/d2l/api/le/{lo}/lo/outcomeSets/"),
        ("outcomeSets TENANT @le/align", f"{base}/d2l/api/le/{al}/lo/outcomeSets/"),
        # Referencia: org-level (ya sabíamos que da placeholder vacío)
        ("outcomeSets @le/lo (org)",     f"{base}/d2l/api/le/{lo}/{orgUnitId}/lo/outcomeSets/"),
        ("alignments @le/align (org)",   f"{base}/d2l/api/le/{al}/{orgUnitId}/lo/alignments/"),
        # ── Competencies legacy (por si CESA usa el tool viejo) ──
        ("competencies @le/lo (org)",         f"{base}/d2l/api/le/{lo}/{orgUnitId}/competencies/"),
        ("competencies structure @le/lo",     f"{base}/d2l/api/le/{lo}/{orgUnitId}/competencies/structure/"),
        ("competency objectives @le/lo",      f"{base}/d2l/api/le/{lo}/{orgUnitId}/competencies/objectives/"),
        ("learningObjectives @le/lo",         f"{base}/d2l/api/le/{lo}/{orgUnitId}/competencies/learningObjectives/"),
        ("orgunit children @lp",  f"{base}/d2l/api/lp/{lp}/orgstructure/{orgUnitId}/children/"),
    ]

    # Set específico: drill-down una vez que conozcamos un OutcomeSetId real.
    if setId is not None:
        for v in (lo, al):
            candidates.append(
                (f"outcomeSet {setId} TENANT @le/{v}", f"{base}/d2l/api/le/{v}/lo/outcomeSets/{setId}")
            )
            candidates.append(
                (f"outcomeSet {setId} @le/{v} (org)", f"{base}/d2l/api/le/{v}/{orgUnitId}/lo/outcomeSets/{setId}")
            )
            candidates.append(
                (f"alignments/outcomeSet {setId} @le/{v}", f"{base}/d2l/api/le/{v}/lo/alignments/outcomeSet/{setId}")
            )

    # Programa específico (el que edita la coordinadora: /lo/programs/{id})
    if programId is not None:
        for v in (lo, al):
            candidates.append(
                (f"program {programId} @le/{v}", f"{base}/d2l/api/le/{v}/{orgUnitId}/lo/programs/{programId}")
            )

    # Rutas arbitrarias ad-hoc (sin reiniciar backend)
    if paths:
        for raw in paths.replace("\n", ",").split(","):
            p = raw.strip()
            if not p:
                continue
            url = p if p.startswith("http") else f"{base}/{p.lstrip('/')}"
            candidates.append((f"custom: {p[:40]}", url))

    results = await asyncio.gather(
        *[svc.bs.probe_get(url) for _, url in candidates]
    )
    return {
        "orgUnitId": orgUnitId,
        "versions": {"lo": lo, "align": al, "lp": lp},
        "results": [
            {"label": label, "url": url, **res}
            for (label, url), res in zip(candidates, results)
        ],
    }


# Tipos de actividad aceptados por Brightspace (ALIGNEDACTIVITYTYPE_T).
_ALIGN_ACTIVITY_TYPES = {
    "ContentObject",
    "DiscussionTopic",
    "Assignment",
    "LtiLink",
    "Quiz",
    "Survey",
    "Checklist",
    "SelfAssessment",
    "QuizQuestion",
    "RubricCriterion",
}
_ALIGN_ACTIONS = {"add", "remove", "replace"}


class AlignmentUpdateIn(BaseModel):
    action: str                 # add | remove | replace
    outcomeIds: List[str] = []  # GUIDs de los RAs (SourceId/OutcomeId)


class OutcomeDescriptionUpdateIn(BaseModel):
    description: str            # nueva descripción del RA
    dryRun: bool = True        # True = solo preview (no escribe en Brightspace)


class OutcomeImportIn(BaseModel):
    """Fase 4 — importar RA global a un curso vacío (bulkImport)."""
    targetOrgUnitId: int                          # curso destino (ej. piloto 6762)
    sourceOutcomeSetIds: Optional[str] = None     # CSV de setIds (numéricos) a exportar; None = todos
    importIds: Optional[List[str]] = None         # GUIDs de conjuntos a importar (selección)
    sets: Optional[List[Dict[str, Any]]] = None   # body explícito (si ya se exportó en el cliente)
    dryRun: bool = True                           # True = solo preview (no escribe)


class OutcomeBulkRowIn(BaseModel):
    """Una fila de la plantilla masiva: código + título del RA."""
    code: str
    title: str


class OutcomeBulkSetIn(BaseModel):
    """Un conjunto de RA a crear (agrupación de filas de la plantilla)."""
    name: str
    rows: List[OutcomeBulkRowIn]


class OutcomeBulkCreateIn(BaseModel):
    """Creación masiva de RA desde plantilla (CSV parseado en el cliente).

    Cursos destino OPCIONALES: sin ninguno, los RA se crean solo en el
    catálogo global (nivel organización). Se aceptan varios cursos a la vez.
    """
    targetOrgUnitId: Optional[int] = None          # compat: un solo curso
    targetOrgUnitIds: Optional[List[int]] = None   # varios cursos a la vez
    sets: List[OutcomeBulkSetIn]
    dryRun: bool = True


@router.post("/course/{orgUnitId}/alignments/activity/{activityType}/{objectId}")
@limiter.limit("20/minute")
async def update_course_alignment(
    orgUnitId: int,
    activityType: str,
    objectId: str,
    payload: AlignmentUpdateIn,
    request: Request,
    svc: GemeloService = Depends(get_service),
):
    """
    Registra/actualiza las alineaciones de Resultados de Aprendizaje (RA) de una
    actividad del curso. Solo super-admin.

    - action: add | remove | replace
    - outcomeIds: lista de GUIDs (SourceId de los outcomes). Para 'remove' con
      lista vacía Brightspace no borra todo; usar 'replace' con [] para vaciar.
    """
    _require_super_admin(request)

    action = str(payload.action or "").strip().lower()
    if action not in _ALIGN_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"action inválida: {payload.action!r}. Use add | remove | replace.",
        )

    act_type = (activityType or "").strip()
    if act_type not in _ALIGN_ACTIVITY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"activityType inválido: {act_type!r}. "
                f"Permitidos: {', '.join(sorted(_ALIGN_ACTIVITY_TYPES))}."
            ),
        )

    # Los RA de un Quiz se vinculan POR PREGUNTA en Brightspace, no a nivel
    # de quiz completo: Brightspace acepta la escritura global (devuelve la
    # alineación con Direct:true) pero NO tiene efecto real en la evaluación
    # — los alignments efectivos llevan QuestionId. Bloqueamos la escritura
    # global para no reportar un "éxito" que en realidad no cambia nada.
    if act_type == "Quiz":
        raise HTTPException(
            status_code=400,
            detail=(
                "Los Resultados de Aprendizaje de un quiz se vinculan por "
                "pregunta desde el editor del quiz en Brightspace, no de "
                "forma global. Esta operación no está disponible para quizzes."
            ),
        )

    outcome_ids = [str(o).strip() for o in (payload.outcomeIds or []) if str(o).strip()]
    if action in {"add", "replace"} and not outcome_ids:
        raise HTTPException(
            status_code=400,
            detail="Debe indicar al menos un outcomeId para 'add' o 'replace'.",
        )

    try:
        result = await svc.bs.update_activity_alignment(
            orgUnitId, act_type, objectId, action, outcome_ids
        )
    except HTTPException:
        raise
    except Exception as e:
        _http500(
            e,
            "update_course_alignment",
            orgUnitId=orgUnitId,
            activityType=act_type,
            objectId=objectId,
        )

    # Invalidar cache para que la próxima visualización refleje el cambio.
    try:
        from app.services.auto_lo_config import invalidate_cache
        invalidate_cache(orgUnitId)
    except Exception:
        pass

    return {"ok": True, "action": action, "alignments": result}


@router.put("/outcomes/set/{setId}/outcome/{outcomeId}")
@limiter.limit("20/minute")
async def update_outcome_description(
    setId: int,
    outcomeId: str,
    payload: OutcomeDescriptionUpdateIn,
    request: Request,
    svc: GemeloService = Depends(get_service),
):
    """
    Fase 3 — Edita la descripción de un RA del registro global (solo super-admin).

    Requiere scope outcomes:sets:manage. Hace read-modify-write del conjunto
    completo (PUT /d2l/api/le/{lo}/lo/outcomeSets/{setId}). Con dryRun=True
    (por defecto) devuelve un preview before/after SIN escribir en Brightspace,
    para verificar el cambio antes de confirmarlo.
    """
    _require_super_admin(request)
    desc = (payload.description or "").strip()
    if not desc:
        raise HTTPException(status_code=400, detail="La descripción no puede estar vacía.")
    oid = (outcomeId or "").strip()
    if not oid:
        raise HTTPException(status_code=400, detail="Falta el OutcomeId del RA.")
    try:
        result = await svc.bs.update_outcome_description(
            setId, oid, desc, dry_run=bool(payload.dryRun)
        )
    except HTTPException:
        raise
    except Exception as e:
        _http500(e, "update_outcome_description", setId=setId, outcomeId=oid)
    return result


@router.get("/outcomes/export")
async def outcomes_export(
    request: Request,
    orgUnitId: int | None = None,
    outcomeSetIds: str | None = None,
    svc: GemeloService = Depends(get_service),
):
    """
    Fase 4 — Exporta outcome sets en formato ImportExportOutcomeSet (canónico).

    Sin orgUnitId exporta el CATÁLOGO GLOBAL (nivel organización); con orgUnitId
    exporta los de ese curso. outcomeSetIds (CSV) filtra a sets concretos.
    Requiere scope outcomes:sets:export. Solo lectura — sirve para descubrir
    cuál es el catálogo global y ver el body reutilizable para importar.
    """
    _require_super_admin(request)
    try:
        res = await svc.bs.bulk_export_outcome_sets(
            org_unit_id=orgUnitId, outcome_set_ids=outcomeSetIds
        )
    except Exception as e:
        _http500(e, "outcomes_export", orgUnitId=orgUnitId)
    # Resumen ligero para la UI (sin volcar árboles enormes en la lista).
    summary = []
    for s in (res.get("sets") or []):
        if not isinstance(s, dict):
            continue
        summary.append({
            "name": s.get("Name"),
            "importId": s.get("ImportId"),
            "outcomeCount": svc.bs._count_import_outcomes(s.get("Outcomes")),
        })
    res["summary"] = summary
    return res


@router.get("/outcomes/course/{orgUnitId}/sets")
async def outcomes_course_sets(
    orgUnitId: int,
    request: Request,
    svc: GemeloService = Depends(get_service),
):
    """
    Fase 4 — Lista los outcome sets de un curso (para ver si está vacío antes de
    importar y verificar después). Solo lectura, scope outcomes:sets:read.
    """
    _require_super_admin(request)
    try:
        raw = await svc.bs.list_outcome_sets(orgUnitId)
    except Exception as e:
        _http500(e, "outcomes_course_sets", orgUnitId=orgUnitId)
    sets = svc.bs._summarize_course_sets(raw)
    total = sum(x["outcomeCount"] for x in sets)
    return {"orgUnitId": orgUnitId, "setCount": len(sets), "outcomeTotal": total, "sets": sets}


@router.post("/outcomes/import")
@limiter.limit("60/minute")  # import masivo a varios cursos (1 request/curso, concurrencia 3)
async def outcomes_import(
    payload: OutcomeImportIn,
    request: Request,
    svc: GemeloService = Depends(get_service),
):
    """
    Fase 4 — Importa RA global a un curso (bulkImport). Solo super-admin.

    Flujo: si no se pasa `sets` explícito, EXPORTA el catálogo global
    (opcionalmente filtrado por sourceOutcomeSetIds) y usa ese body. Luego lo
    IMPORTA al curso targetOrgUnitId. Con dryRun=True (por defecto) NO escribe:
    devuelve el body que se enviaría + el estado actual del curso destino.
    Es un MERGE: nunca borra ni altera RA existentes en el curso.
    Requiere scopes outcomes:sets:export + outcomes:sets:import.
    """
    _require_super_admin(request)
    target = int(payload.targetOrgUnitId)
    sets = payload.sets
    export_meta: Dict[str, Any] = {}
    if not sets:
        exp = await svc.bs.bulk_export_outcome_sets(
            org_unit_id=None, outcome_set_ids=payload.sourceOutcomeSetIds
        )
        if not exp.get("ok"):
            raise HTTPException(
                status_code=502,
                detail=f"Export global falló (HTTP {exp.get('status')}): {str(exp.get('detail'))[:400]}",
            )
        sets = exp.get("sets") or []
        # Filtrar por ImportId seleccionado (evita importar los 137 conjuntos).
        wanted = {str(x).strip() for x in (payload.importIds or []) if str(x).strip()}
        if wanted:
            sets = [s for s in sets if isinstance(s, dict) and str(s.get("ImportId")) in wanted]
        export_meta = {
            "exportStatus": exp.get("status"),
            "exportUrl": exp.get("url"),
            "selectedImportIds": sorted(wanted),
            "exportedSets": [
                {"name": s.get("Name"), "importId": s.get("ImportId"),
                 "outcomeCount": svc.bs._count_import_outcomes(s.get("Outcomes"))}
                for s in sets if isinstance(s, dict)
            ],
        }
    if not sets:
        raise HTTPException(
            status_code=400,
            detail="No hay outcome sets para importar (¿seleccionaste algún conjunto? el ImportId no coincidió).",
        )
    try:
        result = await svc.bs.bulk_import_outcome_sets(
            target, sets, dry_run=bool(payload.dryRun)
        )
    except HTTPException:
        raise
    except Exception as e:
        _http500(e, "outcomes_import", targetOrgUnitId=target)
    result["export"] = export_meta

    # Tras una importación REAL (no dry-run), invalidar la caché de auto_lo_config
    # del curso destino. Si no, build_auto_lo_config seguiría sirviendo el índice
    # vacío cacheado y los RA recién importados no aparecerían por _TTL_SECONDS.
    if not bool(payload.dryRun):
        try:
            from app.services.auto_lo_config import invalidate_cache
            invalidate_cache(target)
        except Exception:
            pass

    return result


# Código de RA válido: letras/dígitos/._- (mismo criterio que el parser de
# descripciones "CODIGO-Texto" en auto_lo_config._CODE_REGEX).
_RA_CODE_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _slugify_import_id(name: str) -> str:
    """Slug estable para ImportId a partir del nombre del conjunto."""
    s = re.sub(r"\s+", "-", str(name or "").strip().lower())
    s = re.sub(r"[^a-z0-9._-]", "", s)
    return s[:80] or "sin-nombre"


@router.post("/outcomes/bulk-create")
@limiter.limit("10/minute")
async def outcomes_bulk_create(
    payload: OutcomeBulkCreateIn,
    request: Request,
    svc: GemeloService = Depends(get_service),
):
    """
    Creación MASIVA de RA desde una plantilla (CSV parseado en el cliente).
    Solo super-admin.

    Recibe conjuntos {name, rows:[{code,title}]} y construye el body en
    formato ImportExportOutcomeSet (docs Valence: set = {Name, ImportId,
    Outcomes}; outcome de autor = {Source:"lores", ShortCode, Description,
    Children}). Description = "CODIGO-Título" — el formato que consume el
    auto-mapper — y luego se envía a bulkImport.

    Destinos: targetOrgUnitIds (varios cursos) y/o targetOrgUnitId (uno).
    SIN ningún curso destino, importa a NIVEL ORGANIZACIÓN: los conjuntos
    quedan en el catálogo global, listos para importarse a cursos después.

    - dryRun=True (default): devuelve el body construido + estado del curso,
      SIN escribir en Brightspace.
    - Es un MERGE: nunca borra RA existentes; outcomes equivalentes se
      deduplican (mismo source + description + padre).
    Requiere scope outcomes:sets:import.
    """
    _require_super_admin(request)

    # Destinos: lista + single (compat), deduplicados preservando orden.
    # Lista vacía => importación a nivel organización (target None).
    targets: List[int] = []
    for t in list(payload.targetOrgUnitIds or []) + (
        [payload.targetOrgUnitId] if payload.targetOrgUnitId else []
    ):
        try:
            ti = int(t)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"Curso destino inválido: {t!r}")
        if ti > 0 and ti not in targets:
            targets.append(ti)

    # ── Validación de la plantilla ────────────────────────────────────────
    errors: List[str] = []
    bs_sets: List[Dict[str, Any]] = []
    for si, s in enumerate(payload.sets or []):
        set_name = str(s.name or "").strip()
        if not set_name:
            errors.append(f"Conjunto #{si + 1}: falta el nombre del conjunto.")
            continue
        slug = _slugify_import_id(set_name)
        seen_codes: set = set()
        outcomes: List[Dict[str, Any]] = []
        for ri, row in enumerate(s.rows or []):
            code = str(row.code or "").strip().upper()
            # Normalizar espacios/invisibles del título (mismo criterio que
            # auto_lo_config._norm_desc para que el parser siempre encaje).
            title = re.sub(r"\s+", " ", str(row.title or "").replace("\u00a0", " ")).strip()
            where = f"Conjunto '{set_name}', fila {ri + 1}"
            if not code and not title:
                continue  # fila vacía — ignorar silenciosamente
            if not code:
                errors.append(f"{where}: falta el código del RA.")
                continue
            if not _RA_CODE_RE.match(code):
                errors.append(
                    f"{where}: código inválido '{code}' (solo letras, dígitos, punto, guión y guión bajo; sin espacios)."
                )
                continue
            if not title:
                errors.append(f"{where}: falta el título/descripción del RA '{code}'.")
                continue
            if code in seen_codes:
                errors.append(f"{where}: código duplicado '{code}' dentro del conjunto.")
                continue
            seen_codes.add(code)
            # Estructura ImportExportOutcome para outcomes DE AUTOR (docs
            # Valence /res/outcomes.html): requiere el discriminador
            # Source="lores" + ShortCode + Description + Children. (Campos
            # como ImportId/Notes por outcome NO existen en este formato y
            # provocan "JSON Binding Error".)
            outcomes.append({
                "Source": "lores",
                "ShortCode": "",
                "Description": f"{code}-{title}",
                "Children": [],
            })
        if not outcomes:
            errors.append(f"Conjunto '{set_name}': no tiene filas válidas.")
            continue
        bs_sets.append({
            "Name": set_name,
            "ImportId": f"gemelo:{slug}",
            "Outcomes": outcomes,
        })

    if errors:
        raise HTTPException(
            status_code=400,
            detail="La plantilla tiene errores: " + " | ".join(errors[:15])
            + (f" (+{len(errors) - 15} más)" if len(errors) > 15 else ""),
        )
    if not bs_sets:
        raise HTTPException(status_code=400, detail="La plantilla no contiene ningún RA válido.")

    dry = bool(payload.dryRun)
    # Sin cursos destino → una sola importación a nivel organización.
    run_targets: List[Optional[int]] = list(targets) if targets else [None]
    results: List[Dict[str, Any]] = []
    for tgt in run_targets:
        try:
            r = await svc.bs.bulk_import_outcome_sets(tgt, bs_sets, dry_run=dry)
        except HTTPException:
            raise
        except Exception as e:
            _http500(e, "outcomes_bulk_create", targetOrgUnitId=tgt)
        r["orgUnitId"] = tgt  # None = catálogo global
        results.append(r)
        # Tras una creación REAL en un curso, invalidar caché del auto-mapper
        # (igual que en outcomes_import) para que los RA aparezcan de inmediato.
        if not dry and tgt is not None:
            try:
                from app.services.auto_lo_config import invalidate_cache
                invalidate_cache(tgt)
            except Exception:
                pass

    return {
        "ok": all(bool(r.get("ok")) for r in results),
        "dryRun": dry,
        "orgLevelOnly": not targets,
        "targets": targets,
        "preview": results[0].get("preview") if results else None,
        "results": results,
    }


@router.get("/course/{orgUnitId}/grade-items")
async def gemelo_grade_items(
    orgUnitId: int,
    svc: GemeloService = Depends(get_service),
    background_tasks: BackgroundTasks = BackgroundTasks(),
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


@router.get(
    "/debug/{orgUnitId}/folder/{folderId}/student/{userId}/rubric/{rubricId}/assessment",
    dependencies=[Depends(require_debug_enabled)],
)
async def debug_assessment(
    orgUnitId: int,
    folderId: int,
    userId: int,
    rubricId: int,
    svc: GemeloService = Depends(get_service),
):
    try:
        return await svc.bs.get_dropbox_rubric_assessment(
            orgUnitId=orgUnitId,
            folderId=folderId,
            rubricId=rubricId,
            userId=userId,
        )
    except Exception as e:
        _http500(
            e, "debug_assessment",
            orgUnitId=orgUnitId, folderId=folderId,
            userId=userId, rubricId=rubricId,
        )


@router.get("/debug/{orgUnitId}/classlist", dependencies=[Depends(require_debug_enabled)])
async def debug_classlist(
    orgUnitId: int,
    full: bool = Query(False, description="Si true, devuelve la lista completa"),
    limit: int = Query(3, ge=1, le=500, description="Tamaño del sample cuando full=false"),
    svc: GemeloService = Depends(get_service),
):
    try:
        data = await svc.bs.list_classlist(orgUnitId)

        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = data.get("Items") or data.get("items") or []
        else:
            items = []

        payload = {
            "orgUnitId": orgUnitId,
            "pythonType": str(type(data)),
            "count": len(items),
        }
        payload["items" if full else "sample"] = items if full else items[:limit]
        return payload
    except Exception as e:
        _http500(e, "debug_classlist", orgUnitId=orgUnitId)


@router.get("/debug/{orgUnitId}/grades/items", dependencies=[Depends(require_debug_enabled)])
async def debug_grade_items(
    orgUnitId: int,
    svc: GemeloService = Depends(get_service),
):
    try:
        data = await svc.bs.list_grade_items(orgUnitId)

        if isinstance(data, dict):
            data_list = data.get("Items") or data.get("items") or []
        else:
            data_list = data if isinstance(data, list) else []

        parsed = []
        for it in (data_list[:10] if isinstance(data_list, list) else []):
            if isinstance(it, dict):
                parsed.append({
                    "Id": it.get("Id") or it.get("Identifier"),
                    "Name": it.get("Name"),
                    "Weight": it.get("Weight"),
                    "GradeType": it.get("GradeType"),
                    "CategoryId": it.get("CategoryId"),
                    # Incluimos fechas para diagnóstico del "no enviado"
                    "DueDate": it.get("DueDate"),
                    "EndDate": it.get("EndDate"),
                })

        return {
            "orgUnitId": orgUnitId,
            "pythonType": str(type(data)),
            "count": len(data_list) if isinstance(data_list, list) else None,
            "parsedSample": parsed,
            "rawSample": data_list[:5] if isinstance(data_list, list) else data_list,
        }
    except Exception as e:
        _http500(e, "debug_grade_items", orgUnitId=orgUnitId)


@router.get("/debug/{orgUnitId}/grades/{gradeObjectId}/student/{userId}", dependencies=[Depends(require_debug_enabled)])
async def debug_grade_value(
    orgUnitId: int,
    gradeObjectId: int,
    userId: int,
    svc: GemeloService = Depends(get_service),
):
    try:
        data = await svc.bs.get_grade_value(orgUnitId, gradeObjectId, userId)
        return {
            "orgUnitId": orgUnitId,
            "gradeObjectId": gradeObjectId,
            "userId": userId,
            "pythonType": str(type(data)),
            "raw": data,
            "extracted": {
                "PointsNumerator": data.get("PointsNumerator") if isinstance(data, dict) else None,
                "PointsDenominator": data.get("PointsDenominator") if isinstance(data, dict) else None,
                "WeightedNumerator": data.get("WeightedNumerator") if isinstance(data, dict) else None,
                "WeightedDenominator": data.get("WeightedDenominator") if isinstance(data, dict) else None,
            },
        }
    except Exception as e:
        _http500(
            e, "debug_grade_value",
            orgUnitId=orgUnitId, gradeObjectId=gradeObjectId, userId=userId,
        )


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
# Reporte de errores (bug reports) + Anuncios del administrador
# =========================================================
import os as _os
import json as _json
import time as _time_mod
from datetime import datetime, timezone
from pydantic import BaseModel

from app.state import get_session as _get_session
from app.services.brightspace_client import _extract_session_id_any
from app.services.email_service import send_email, smtp_configured
from app.services.user_registry import (
    list_emails as _list_emails,
    list_users as _list_users,
    record_user as _record_user,
)

# Correo del administrador que recibe los reportes de error.
BUG_REPORT_EMAIL = _os.getenv("BUG_REPORT_EMAIL", "desarrolloprofesoral@cesa.edu.co")
# IDs de super-administrador autorizados (mismo default que el frontend: 5427).
_SUPERADMIN_IDS = {
    s.strip() for s in _os.getenv("SUPERADMIN_IDS", "5427").split(",") if s.strip()
}

_DATA_DIR = _os.getenv("GEMELO_DATA_DIR") or _os.path.dirname(
    _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
)
_BUG_REPORTS_FILE = _os.path.join(_DATA_DIR, "bug_reports.jsonl")
_ANNOUNCEMENTS_FILE = _os.path.join(_DATA_DIR, "announcements.json")


def _session_from_request(request: Request) -> Dict[str, Any]:
    """Devuelve la sesión (dict) del request, o {} si no hay/expiró."""
    try:
        sid = _extract_session_id_any(request)
        if not sid:
            return {}
        return _get_session(sid) or {}
    except Exception:
        return {}


def _append_jsonl(path: str, record: Dict[str, Any]) -> None:
    """Agrega una línea JSON al archivo (best-effort, silencia errores)."""
    try:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(_json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.warning("no se pudo persistir en %s: %s", path, str(e)[:120])


class BugReportIn(BaseModel):
    title: Optional[str] = ""
    description: str
    severity: Optional[str] = "media"
    context: Optional[Dict[str, Any]] = None  # url, navegador, pantalla, etc.


@router.post("/bug-report")
@limiter.limit("5/minute")
async def submit_bug_report(payload: BugReportIn, request: Request):
    """
    Recibe un reporte de error del usuario, lo persiste y lo envía por
    correo al administrador. Si SMTP no está configurado, igual persiste y
    devuelve delivered=false para que el frontend caiga a un mailto.
    """
    desc = (payload.description or "").strip()
    if not desc:
        raise HTTPException(status_code=422, detail="La descripción es obligatoria.")

    sess = _session_from_request(request)
    reporter = {
        "user_id": sess.get("user_id"),
        "user_name": sess.get("user_name"),
        "user_email": sess.get("user_email"),
    }
    ctx = payload.context or {}
    now_iso = datetime.now(timezone.utc).isoformat()
    severity = (payload.severity or "media").strip().lower()
    title = (payload.title or "").strip() or "Reporte de error"

    record = {
        "ts": now_iso,
        "title": title,
        "severity": severity,
        "description": desc,
        "reporter": reporter,
        "context": ctx,
    }
    _append_jsonl(_BUG_REPORTS_FILE, record)

    # Cuerpo del correo
    ctx_lines = "\n".join(f"  {k}: {v}" for k, v in ctx.items()) or "  (sin contexto)"
    body_text = (
        f"Nuevo reporte de error en G.D\n\n"
        f"Título: {title}\n"
        f"Severidad: {severity.upper()}\n"
        f"Fecha: {now_iso}\n\n"
        f"Reportado por:\n"
        f"  Nombre: {reporter.get('user_name') or '(desconocido)'}\n"
        f"  ID: {reporter.get('user_id') or '(desconocido)'}\n"
        f"  Email: {reporter.get('user_email') or '(desconocido)'}\n\n"
        f"Descripción:\n{desc}\n\n"
        f"Contexto técnico:\n{ctx_lines}\n"
    )

    delivered = False
    error = None
    if smtp_configured():
        res = send_email(
            to=[BUG_REPORT_EMAIL],
            subject=f"[G.D Bug] {title}",
            body_text=body_text,
            reply_to=reporter.get("user_email") or None,
        )
        delivered = bool(res.get("ok"))
        error = res.get("error")
    else:
        error = "smtp_no_configurado"

    return {
        "ok": True,
        "delivered": delivered,
        "reason": error,
        "adminEmail": BUG_REPORT_EMAIL,
    }


_ADMIN_ROLES = {"Super Administrator", "Administrator"}


def _require_super_admin(request: Request) -> Dict[str, Any]:
    """
    Verifica que la sesión pertenezca a un super-admin. Autoriza si el
    user_id está en SUPERADMIN_IDS o si el rol de sistema es Admin/Super Admin.
    Lanza 403 si no.
    """
    sess = _session_from_request(request)
    uid = str(sess.get("user_id") or "")
    role = str(sess.get("role") or "")
    if (uid and uid in _SUPERADMIN_IDS) or (role in _ADMIN_ROLES):
        return sess
    raise HTTPException(status_code=403, detail="Solo el administrador puede hacer esto.")


def _load_announcements() -> List[Dict[str, Any]]:
    try:
        with open(_ANNOUNCEMENTS_FILE, encoding="utf-8") as fh:
            data = _json.load(fh)
        return data if isinstance(data, list) else []
    except FileNotFoundError:
        return []
    except Exception:
        return []


def _save_announcements(items: List[Dict[str, Any]]) -> None:
    try:
        tmp = _ANNOUNCEMENTS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            _json.dump(items, fh, ensure_ascii=False)
        _os.replace(tmp, _ANNOUNCEMENTS_FILE)
    except Exception as e:
        logger.warning("no se pudo guardar anuncios: %s", str(e)[:120])


class AnnouncementIn(BaseModel):
    subject: str
    message: str
    audience: Optional[str] = "all"         # "all" (todos los usuarios) | "manual"
    recipients: Optional[List[str]] = None  # emails cuando audience="manual"
    tag: Optional[str] = "Anuncio"          # Anuncio | Actualización | Importante
    send_email: Optional[bool] = True       # si false, solo publica in-app
    preview: Optional[bool] = False         # si true, no envía ni guarda


def _resolve_recipients(payload: "AnnouncementIn") -> List[str]:
    """Resuelve la lista de correos según la audiencia elegida.

    Los estudiantes NO reciben correo: ven los anuncios solo dentro del
    portal. Por eso 'all' excluye a quienes están marcados como "student".
    """
    if (payload.audience or "all") == "all":
        return _list_emails(exclude_students=True)
    return [r.strip() for r in (payload.recipients or []) if r and r.strip()]


@router.get("/admin/known-users")
async def admin_known_users(request: Request):
    """Usuarios que han iniciado sesión en G.D (para elegir destinatarios). Solo super-admin."""
    _require_super_admin(request)
    users = _list_users(with_email_only=False)
    emails = _list_emails()
    return {"total": len(users), "withEmail": len(emails), "users": users}


@router.get("/admin/usage/summary")
async def admin_usage_summary(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
):
    """
    Métricas de uso de la plataforma para el Panel de Administración:
    quiénes han ingresado, cuándo, serie diaria de logins y últimos accesos.
    Fuente: Postgres (login_events / known_users). Solo super-admin.
    """
    _require_super_admin(request)
    import asyncio as _asyncio
    from app.services.usage_tracking import usage_summary as _usage_summary
    try:
        return await _asyncio.to_thread(_usage_summary, days)
    except Exception as e:
        logger.warning("admin_usage_summary falló: %s", str(e)[:200])
        raise HTTPException(
            status_code=503,
            detail="No se pudo consultar el historial de uso (BD no disponible).",
        )


@router.post("/admin/announcement")
@limiter.limit("5/minute")
async def create_announcement(payload: AnnouncementIn, request: Request):
    """
    Publica un anuncio del administrador y (opcionalmente) lo envía por
    correo a los destinatarios (via BCC para no exponer emails).
    Solo super-admin. `preview=true` valida sin enviar ni guardar.
    """
    sess = _require_super_admin(request)
    subject = (payload.subject or "").strip()
    message = (payload.message or "").strip()
    if not subject or not message:
        raise HTTPException(status_code=422, detail="Asunto y mensaje son obligatorios.")

    recipients = _resolve_recipients(payload)

    if payload.preview:
        return {
            "ok": True, "preview": True,
            "recipientCount": len(recipients),
            "smtpConfigured": smtp_configured(),
        }

    sent = {"ok": False, "recipients": 0, "error": None}
    if payload.send_email and recipients:
        if not smtp_configured():
            sent["error"] = "smtp_no_configurado"
        else:
            from_name = _os.getenv("SMTP_FROM_NAME", "G.D CESA")
            html = (
                f"<div style='font-family:Arial,sans-serif;max-width:560px'>"
                f"<h2 style='color:#0b5fff'>{subject}</h2>"
                f"<div style='white-space:pre-wrap;font-size:15px;line-height:1.6'>{message}</div>"
                f"<hr style='border:none;border-top:1px solid #eee;margin:24px 0'>"
                f"<p style='font-size:12px;color:#888'>Este mensaje fue enviado por el administrador de G.D · CESA.</p>"
                f"</div>"
            )
            res = send_email(
                to=[],  # broadcast oculto
                bcc=recipients,
                subject=subject,
                body_text=message,
                body_html=html,
            )
            sent = {"ok": bool(res.get("ok")), "recipients": res.get("recipients", 0), "error": res.get("error")}

    # Persistir el anuncio para mostrarlo in-app
    items = _load_announcements()
    ann = {
        "id": int(_time_mod.time() * 1000),
        "ts": datetime.now(timezone.utc).isoformat(),
        "subject": subject,
        "message": message,
        "tag": (payload.tag or "Anuncio").strip(),
        "author": sess.get("user_name") or "Administrador",
        "emailSent": sent["ok"],
        "recipientCount": sent["recipients"],
    }
    items.insert(0, ann)
    _save_announcements(items[:100])  # conservar los 100 más recientes

    return {"ok": True, "announcement": ann, "email": sent}


@router.get("/announcements")
async def list_announcements(limit: int = Query(default=20, ge=1, le=100)):
    """Anuncios recientes del administrador para mostrar dentro de la app."""
    return {"items": _load_announcements()[:limit]}


class AudienceIn(BaseModel):
    audience: str  # "student" | "staff"


@router.post("/audience")
async def set_audience(payload: AudienceIn, request: Request):
    """
    Marca el canal de notificación del usuario según el portal que usa:
    "student" (solo in-app, sin correo) o "staff" (sí recibe correo).
    Lo llama el frontend tras conocer el rol. Best-effort.
    """
    aud = (payload.audience or "").strip().lower()
    if aud not in ("student", "staff"):
        raise HTTPException(status_code=422, detail="audience debe ser 'student' o 'staff'.")
    sess = _session_from_request(request)
    uid = sess.get("user_id")
    if not uid:
        return {"ok": False, "reason": "sin_sesion"}
    try:
        _record_user(
            uid,
            (sess.get("user_name") or "").strip(),
            sess.get("user_email"),
            sess.get("role"),
            audience=aud,
        )
        # También en Postgres (persistente entre redeploys). Best-effort.
        try:
            import asyncio as _asyncio
            from app.services.usage_tracking import set_audience as _set_audience_db
            await _asyncio.to_thread(_set_audience_db, uid, aud)
        except Exception:
            pass
        return {"ok": True, "audience": aud}
    except Exception as e:
        logger.warning("set_audience falló: %s", str(e)[:120])
        return {"ok": False, "reason": "error"}