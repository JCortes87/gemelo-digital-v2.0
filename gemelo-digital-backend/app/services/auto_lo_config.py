# app/services/auto_lo_config.py
"""
Auto-mapper de Resultados de Aprendizaje (RA) por curso.

En lugar de exigir un JSON manual en `config/courses/{orgUnitId}.json`
para cada uno de los +10k cursos, construimos en runtime la
configuración de rúbricas a partir de dos endpoints de Brightspace:

  - GET /lo/outcomeSets/    → nos da las descripciones (Description)
                              en formato "CODIGO-Texto".
  - GET /lo/alignments/     → nos dice qué outcomes están enganchados
                              a qué rúbricas / actividades.

El resultado tiene la misma forma que el `rubricsModel` que hoy
consume `gemelo_service._build_gemelo_inner`, así que se puede
inyectar transparente cuando no hay config manual.

Cache: TTL en memoria por orgUnitId (default 10 min). No es
por-request para no golpear Brightspace en cada snapshot.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("uvicorn.error")

# ── Cache en memoria ─────────────────────────────────────────────────────────
_CACHE: Dict[int, Tuple[float, Dict[str, Any]]] = {}
_TTL_SECONDS = 600  # 10 min

# Regex del formato observado: "Z1O1DOR3-Emplear los conceptos..."
# Permite letras/dígitos/._- en el código. El separador acepta guión ASCII,
# guiones Unicode (U+2010–2015), signo menos (U+2212) o dos puntos: Brightspace
# a veces usa un guión no-ASCII que antes rompía la extracción del código.
_CODE_REGEX = re.compile(r"^([A-Za-z0-9._-]+)\s*[-\u2010-\u2015\u2212:]\s*(.+)$")


def _norm_str(v: Any) -> str:
    return str(v).strip() if v is not None else ""


def _norm_desc(v: Any) -> str:
    """Colapsa espacios/saltos de línea/NBSP a un solo espacio y elimina
    caracteres invisibles (zero-width, BOM, marcas direccionales): así el `.`
    del regex (que no cruza saltos de línea) siempre encaja el título."""
    if v is None:
        return ""
    s = re.sub(r"[\u200B-\u200F\u2060\uFEFF]", "", str(v)).replace("\u00a0", " ")
    return re.sub(r"\s+", " ", s).strip()


def _parse_description(desc: str) -> Optional[Dict[str, str]]:
    """Devuelve {code, title, description} si el texto encaja el patrón."""
    norm = _norm_desc(desc)
    if not norm:
        return None
    m = _CODE_REGEX.match(norm)
    if not m:
        return None
    return {
        "code": m.group(1).upper(),
        "title": m.group(2).strip(),
        "description": norm,
    }


def _walk_outcomes(node: Any, out: Dict[str, Dict[str, str]]) -> None:
    """Recorre recursivamente el árbol de outcomeSets acumulando
    { outcomeId(uuid) : {code,title,description} }."""
    if node is None:
        return
    if isinstance(node, list):
        for it in node:
            _walk_outcomes(it, out)
        return
    if not isinstance(node, dict):
        return

    # SourceId / OutcomeId son el uuid canónico
    oid = (
        node.get("SourceId")
        or node.get("OutcomeId")
        or node.get("Id")
        or node.get("id")
    )
    desc = node.get("Description") or node.get("description")
    parsed = _parse_description(_norm_str(desc)) if desc else None
    if oid and parsed:
        key = str(oid)
        if key not in out:
            out[key] = parsed

    # Hijos posibles
    for k in (
        "Outcomes", "outcomes",
        "SubOutcomes", "subOutcomes",
        "ChildOutcomes", "childOutcomes",
        "Children", "children",
    ):
        if k in node:
            _walk_outcomes(node[k], out)


def _index_outcome_sets(payload: Any) -> Dict[str, Dict[str, str]]:
    """Devuelve { outcomeUuid : {code,title,description} } filtrando el
    trailing OutcomeSetId=0 que Brightspace suele devolver."""
    out: Dict[str, Dict[str, str]] = {}
    if not payload:
        return out

    # Puede ser lista raíz o dict con `outcomeSets`
    items = payload
    if isinstance(payload, dict):
        items = payload.get("outcomeSets") or payload.get("OutcomeSets") or payload

    if isinstance(items, list):
        # Filtrar sets espurios con OutcomeSetId=0 y sin outcomes
        filtered = []
        for s in items:
            if not isinstance(s, dict):
                continue
            sid = s.get("OutcomeSetId") or s.get("outcomeSetId")
            outcomes = s.get("Outcomes") or s.get("outcomes")
            if (sid == 0 or sid == "0") and not outcomes:
                continue
            filtered.append(s)
        _walk_outcomes(filtered, out)
    else:
        _walk_outcomes(items, out)

    return out


def _index_alignments(
    payload: Any,
) -> Tuple[Dict[str, List[str]], Dict[str, List[str]]]:
    """
    Recorre /lo/alignments/ y devuelve:
      - rubric_to_outcomes: { rubricId(str) : [outcomeUuid, ...] }
      - activity_to_outcomes: { "{Type}:{LmsObjectId}" : [outcomeUuid, ...] }
        (útil para exponer RAs en Evidencias aún cuando no hay rúbrica).
    """
    rubric_to_outcomes: Dict[str, List[str]] = {}
    activity_to_outcomes: Dict[str, List[str]] = {}
    if not payload:
        return rubric_to_outcomes, activity_to_outcomes

    items = payload
    if isinstance(payload, dict):
        items = (
            payload.get("alignments")
            or payload.get("Alignments")
            or payload.get("Items")
            or payload
        )
    if not isinstance(items, list):
        return rubric_to_outcomes, activity_to_outcomes

    # Forma real del bulk /lo/alignments/ en v1.93 (verificada en
    # cesa.brightspace.com): el OutcomeId está arriba y las actividades
    # alineadas cuelgan de él en `Activities` (PLURAL), cada una con
    # {ActivityType, ObjectId, RubricId, QuestionId}. La versión previa
    # de este parser esperaba `Activity` (singular) con Type/LmsObjectId,
    # forma que este tenant NO devuelve → por eso salía todo "sin alinear".
    for entry in items:
        if not isinstance(entry, dict):
            continue
        oid = (
            entry.get("OutcomeId")
            or entry.get("outcomeId")
            or entry.get("SourceId")
        )
        if not oid:
            continue
        oid = str(oid)

        activities = entry.get("Activities") or entry.get("activities") or []
        # Compat hacia atrás: algunos tenants podrían exponer un único `Activity`.
        if not activities and isinstance(entry.get("Activity"), dict):
            activities = [entry["Activity"]]

        for act in activities:
            if not isinstance(act, dict):
                continue
            rubric_id = act.get("RubricId") or act.get("rubricId")
            obj_type = (
                act.get("ActivityType")
                or act.get("Type")
                or act.get("type")
            )
            obj_id = (
                act.get("ObjectId")
                or act.get("LmsObjectId")
                or act.get("lmsObjectId")
            )

            if rubric_id not in (None, ""):
                key = str(int(rubric_id))
                rubric_to_outcomes.setdefault(key, [])
                if oid not in rubric_to_outcomes[key]:
                    rubric_to_outcomes[key].append(oid)

            if obj_type and obj_id not in (None, ""):
                akey = f"{obj_type}:{obj_id}"
                activity_to_outcomes.setdefault(akey, [])
                if oid not in activity_to_outcomes[akey]:
                    activity_to_outcomes[akey].append(oid)

    return rubric_to_outcomes, activity_to_outcomes


def _build_rubrics_cfg(
    rubric_to_outcomes: Dict[str, List[str]],
    outcome_index: Dict[str, Dict[str, str]],
) -> Dict[str, Any]:
    """
    Construye la sección `rubrics` con la misma forma que espera
    `_build_gemelo_inner`:

      { rubricId(str) : {
          "name": "...",
          "autoGenerated": True,
          "outcomeCodes": ["Z1O1DOR3", ...],   # metadata extra
          # No incluimos criteriaMap porque el mapeo criterio→outcome no
          # existe en /lo/alignments (los outcomes se alinean a la rúbrica
          # completa, no a un criterio específico). El fallback
          # sintético de gemelo_service se encargará de agregar por
          # criterio y darle el `unit_code` derivado de outcomeCodes.
        }
      }
    """
    result: Dict[str, Any] = {}
    for rubric_id, outcome_ids in rubric_to_outcomes.items():
        codes: List[str] = []
        for oid in outcome_ids:
            info = outcome_index.get(oid)
            if info and info.get("code"):
                codes.append(info["code"])
        # dedupe preservando orden
        seen: set = set()
        uniq_codes = []
        for c in codes:
            if c not in seen:
                seen.add(c)
                uniq_codes.append(c)
        if not uniq_codes:
            continue
        result[rubric_id] = {
            "autoGenerated": True,
            "outcomeCodes": uniq_codes,
        }
    return result


async def build_auto_lo_config(bs, orgUnitId: int) -> Dict[str, Any]:
    """
    Devuelve un dict con la forma:
      {
        "rubricsModel": {
          "rubrics": { rubricId : {autoGenerated, outcomeCodes:[...]} }
        },
        "outcomeIndex": { outcomeUuid : {code,title,description} },
        "outcomeCodeMap": { code : {title,description} },
        "activityToOutcomes": { "Type:Id" : [outcomeUuid,...] },
        "hasRubricAlignments": bool,
        "hasQuestionOnly": bool,   # curso sólo mide RAs por quiz question
      }

    Cache TTL en memoria por orgUnitId.
    """
    now = time.monotonic()
    cached = _CACHE.get(orgUnitId)
    if cached and (now - cached[0]) < _TTL_SECONDS:
        return cached[1]

    try:
        sets_payload = await bs.list_outcome_sets(orgUnitId)
    except Exception as e:
        logger.warning("auto_lo_config: list_outcome_sets falló para %s: %s", orgUnitId, e)
        sets_payload = []

    try:
        # Usar el endpoint bulk 1.93 (list_alignments), NO list_lo_alignments
        # (que apunta a 1.92 y devuelve 404 en /lo/alignments/). list_alignments
        # ya maneja 404/403 devolviendo [].
        align_payload = await bs.list_alignments(orgUnitId)
    except Exception as e:
        logger.warning("auto_lo_config: list_alignments falló para %s: %s", orgUnitId, e)
        align_payload = []

    outcome_index = _index_outcome_sets(sets_payload)
    rubric_to_outcomes, activity_to_outcomes = _index_alignments(align_payload)
    rubrics_cfg = _build_rubrics_cfg(rubric_to_outcomes, outcome_index)

    outcome_code_map: Dict[str, Dict[str, str]] = {}
    for info in outcome_index.values():
        code = info.get("code")
        if code and code not in outcome_code_map:
            outcome_code_map[code] = {
                "title": info.get("title", ""),
                "description": info.get("description", ""),
            }

    has_rubric = bool(rubric_to_outcomes)
    has_question_only = (not has_rubric) and any(
        (":" in k) for k in activity_to_outcomes.keys()
    )

    result = {
        "rubricsModel": {"rubrics": rubrics_cfg} if rubrics_cfg else None,
        "outcomeIndex": outcome_index,
        "outcomeCodeMap": outcome_code_map,
        "activityToOutcomes": activity_to_outcomes,
        "hasRubricAlignments": has_rubric,
        "hasQuestionOnly": has_question_only,
    }
    # No cachear resultados vacíos: si el índice de RA quedó vacío (p.ej. justo
    # antes de importar/alinear, o por un fallo transitorio de la API de
    # Brightspace), guardarlo envenenaría la caché por _TTL_SECONDS y ocultaría
    # los RA recién importados. Sólo cacheamos cuando hay outcomes reales.
    if outcome_index:
        _CACHE[orgUnitId] = (now, result)
    else:
        _CACHE.pop(orgUnitId, None)
    return result


def invalidate_cache(orgUnitId: Optional[int] = None) -> None:
    if orgUnitId is None:
        _CACHE.clear()
    else:
        _CACHE.pop(orgUnitId, None)
