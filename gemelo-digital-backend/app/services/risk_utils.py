"""
Calculos agregados de riesgo y macrocompetencias.

Cuando el modelo CESA agrupa unidades chicas (C.1.1, C.1.2, ...) en
macrocompetencias (C1, C2, RA1, ...), se calcula un % ponderado por
unidad. Estas funciones hacen ese roll-up.

Tambien queda aqui la funcion `weighted_avg`, que es usada por el
roll-up pero podria usarse en otros calculos ponderados del proyecto.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.services.common_utils import _num
from app.services.scale_utils import status_from_pct


#|---------- Nivel de riesgo estudiantil ----------|

_DEFAULT_THRESHOLDS: Dict[str, float] = {"critical": 50.0, "watch": 70.0}


def risk_from_pct(pct: Optional[float], thresholds: Optional[Dict[str, float]] = None) -> str:
    """
    Calcula el nivel de riesgo de un estudiante a partir de su porcentaje
    de desempeño actual.

    Retorna: "alto" | "medio" | "bajo" | "pending"

    - "pending": no hay datos de calificación aún (pct es None).
    - "alto":    pct < critical (default 50%)
    - "medio":   pct < watch   (default 70%)
    - "bajo":    pct >= watch

    Unico punto de verdad para riesgo — usado tanto en build_gemelo (live)
    como en sync_student_metric_snapshots (DB cache).
    """
    if pct is None:
        return "pending"
    try:
        p = float(pct)
    except Exception:
        return "pending"
    thr = thresholds or _DEFAULT_THRESHOLDS
    if p < float(thr.get("critical", 50.0)):
        return "alto"
    if p < float(thr.get("watch", 70.0)):
        return "medio"
    return "bajo"


#|---------- Promedios ponderados ----------|
def weighted_avg(items: List[Tuple[float, float]]) -> float:
    """
    Promedio ponderado: items es una lista de tuplas (valor, peso).

    Devuelve 0.0 si la suma de pesos es 0 (evita ZeroDivisionError).
    No filtra valores None — el caller debe pasarlos como floats.
    """
    den = sum(w for _, w in items) or 0.0
    if den == 0:
        return 0.0
    return sum(p * w for p, w in items) / den


#|---------- Macrocompetencias dinamicas (extraccion de prefijos C.x.y -> Cx) ----------|
# Formato esperado: "C.1.1", "RA.2.3", "PE.1" -> macro: "C1", "RA2", "PE1"
# El regex captura el prefijo alfa y el primer segmento numerico.
_MACRO_RE = re.compile(r"^([A-Za-z]+)\.(\d+)(?:\.)?")


def _macro_code_from_unit(code: str) -> Optional[str]:
    """
    Convierte un unit_code (ej. 'C.1.3') a su macrocompetencia (ej. 'C1').

    Cursos con config manual usan el formato 'PREFIJO.N.M' y se agrupan por
    'PREFIJON'. Cursos auto-mapeados (la gran mayoría, sin config) generan
    códigos sintéticos que NO llevan ese formato: códigos RA reales como
    'Z1O1DOR3' o el fallback 'RUB-11483'. Para que esos RAs también se
    muestren, los códigos que no matchean el formato pasan como su propia
    macro (uno por código) en vez de descartarse.
    """
    clean = str(code or "").strip()
    if not clean:
        return None
    m = _MACRO_RE.match(clean)
    if not m:
        return clean
    prefix, num = m.group(1), m.group(2)
    return f"{prefix}{num}"


def _get_unit_weight_from_cfg(cfg: Any, unit_code: str) -> float:
    """
    Lee el peso de una unidad de aprendizaje (ej. 'C.1.1') desde el
    config bundle del curso, buscando en todas las rubricas hasta
    encontrarla. Default: 1.0.

    Soporta tanto cfg como objeto Pydantic (con attrs `rubrics`,
    `learningUnits`) como dict crudo. La estructura esperada es:
        cfg.rubrics[*].learningUnits[unit_code].weight
    """
    if cfg is None:
        return 1.0

    rubrics = getattr(cfg, "rubrics", None) if not isinstance(cfg, dict) else cfg.get("rubrics")
    if not rubrics or not isinstance(rubrics, dict):
        return 1.0

    for _, r in rubrics.items():
        lu = getattr(r, "learningUnits", None) if not isinstance(r, dict) else r.get("learningUnits")
        if isinstance(lu, dict) and unit_code in lu:
            ud = lu[unit_code]
            try:
                return float(ud.get("weight", 1.0)) if isinstance(ud, dict) else float(getattr(ud, "weight", 1.0))
            except Exception:
                return 1.0

    return 1.0


#|---------- Roll-up de unidades a macrocompetencias ----------|
def build_macro_units(
    units: List[Dict[str, Any]],
    cfg: Any,
    thresholds: Dict[str, float],
) -> List[Dict[str, Any]]:
    """
    Agrupa unidades hijas (C.1.1, C.1.2, ...) en sus macrocompetencias
    (C1) y calcula el % ponderado de cada macro.

    Para cada unit:
    1. Extrae su macro_code via `_macro_code_from_unit`.
    2. Busca su peso en el config via `_get_unit_weight_from_cfg`.
    3. Acumula (pct, peso, child_code) por macro.

    Para cada macro:
    1. Calcula `pct_macro` = weighted_avg de (pct, peso) de las hijas.
    2. Asigna status (critico/observacion/solido) via `status_from_pct`.

    Output ordenado alfabeticamente por macro_code.
    """
    acc: Dict[str, List[Tuple[float, float, str]]] = {}

    for u in units:
        child_code = str(u.get("code", "")).strip()
        macro = _macro_code_from_unit(child_code)
        if not macro:
            continue

        w = _get_unit_weight_from_cfg(cfg, child_code)
        pct = _num(u.get("pct", 0.0), 0.0)
        acc.setdefault(macro, []).append((pct, w, child_code))

    out: List[Dict[str, Any]] = []
    for macro_code, rows in acc.items():
        pct_macro = weighted_avg([(p, w) for p, w, _ in rows])
        pct_macro_round = round(pct_macro, 1)
        out.append(
            {
                "code": macro_code,
                "pct": pct_macro_round,
                "status": status_from_pct(pct_macro_round, thresholds),
                "children": [c for _, __, c in rows],
            }
        )

    return sorted(out, key=lambda x: x["code"])
