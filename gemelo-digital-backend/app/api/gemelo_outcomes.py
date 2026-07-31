# app/api/gemelo_outcomes.py
"""Sub-router de learning outcomes (RAs): registry, alignments, export/import,
bulk-create. Extraido de gemelo.py (refactor #15). Se monta bajo el router
principal de gemelo (prefix /gemelo), por eso este router NO lleva prefix.
"""
import re
import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.rate_limit import limiter
from app.services.gemelo_service import GemeloService
from app.api.gemelo_shared import get_service, _http500
from app.api.gemelo_admin import _require_super_admin

router = APIRouter()


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


class OutcomeDeleteIn(BaseModel):
    """Desvincular/eliminar conjuntos de RA del registro de UN curso.

    Solo toca el registro del curso (DELETE course-scoped); el catálogo
    global de la organización NUNCA se modifica desde aquí.
    """
    orgUnitId: int                # curso del que se desvinculan los sets
    setIds: List[Any]             # OutcomeSetIds (course-scoped) a eliminar
    dryRun: bool = True           # True = solo preview (no escribe)


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


@router.post("/outcomes/course/delete-sets")
@limiter.limit("30/minute")
async def outcomes_course_delete_sets(
    payload: OutcomeDeleteIn,
    request: Request,
    svc: GemeloService = Depends(get_service),
):
    """
    Desvincula (elimina) conjuntos de RA del REGISTRO de un curso.

    DELETE course-scoped: /d2l/api/le/{lo}/{orgUnitId}/lo/outcomeSets/{setId}.
    El catálogo global de la organización no se toca. Con dryRun=True (default)
    solo muestra qué se eliminaría. Cada set se verifica releyendo el registro
    del curso después del DELETE (verifiedRemoved). Solo admin.
    Requiere scope outcomes:sets:manage.
    """
    _require_super_admin(request)
    ou = int(payload.orgUnitId)
    if ou <= 0:
        raise HTTPException(
            status_code=400,
            detail="orgUnitId inválido: el borrado debe ir scoped a un curso.",
        )
    set_ids = [str(s).strip() for s in (payload.setIds or []) if str(s).strip()]
    if not set_ids:
        raise HTTPException(
            status_code=400,
            detail="No se indicó ningún conjunto de RA (setIds vacío).",
        )
    dry = bool(payload.dryRun)
    results: List[Dict[str, Any]] = []
    for sid in set_ids:
        try:
            res = await svc.bs.delete_course_outcome_set(ou, sid, dry_run=dry)
        except HTTPException:
            raise
        except Exception as e:
            res = {"ok": False, "setId": sid, "orgUnitId": ou,
                   "dryRun": dry, "detail": str(e)[:400]}
        results.append(res)

    all_ok = all(bool(r.get("ok")) for r in results)

    # Tras un borrado REAL, invalidar la caché de auto_lo_config del curso:
    # si no, el índice cacheado seguiría mostrando los RA eliminados.
    if not dry:
        try:
            from app.services.auto_lo_config import invalidate_cache
            invalidate_cache(ou)
        except Exception:
            pass

    return {"ok": all_ok, "dryRun": dry, "orgUnitId": ou,
            "requested": len(set_ids), "results": results}


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


