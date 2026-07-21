export function toDate(x) {
  const d = x ? new Date(x) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

export function weeksBetween(start, end) {
  if (!start || !end) return 0;
  const ms = Math.max(0, end.getTime() - start.getTime());
  return ms / (7 * 24 * 60 * 60 * 1000);
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function normStatus(x) {
  return String(x || "").toLowerCase().trim();
}

export function fmtPct(x) {
  if (x === null || x === undefined || Number.isNaN(Number(x))) return "—";
  return `${Number(x).toFixed(1)}%`;
}

export function fmtGrade10FromPct(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return "—";
  return (Number(pct) / 10).toFixed(1);
}

/**
 * Extrae descripciones planas de outcomeSets de Brightspace.
 *
 * Brightspace puede devolver los outcomes de varias formas:
 *   - Array top-level `outcomeSets` con cada set conteniendo `Outcomes`.
 *   - `outcomeSets` puede ser directamente un array plano de outcomes
 *     (cuando el curso hereda los RAs sin agruparlos en un set).
 *   - Cada outcome puede tener SubOutcomes/ChildOutcomes anidados que
 *     tambien son RAs vigentes (algunos cursos definen jerarquias).
 *
 * Se recorre recursivamente y se devuelven todas las descripciones no vacias
 * en el orden en que aparecen. Cursos como 41634 exponian los RAs solo
 * en el nivel anidado, por eso antes se veian vacios.
 */
export function flattenOutcomeDescriptions(payload) {
  const flat = [];
  if (!payload) return flat;

  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;

    const desc = node.Description ?? node.description;
    if (desc && String(desc).trim()) flat.push(String(desc).trim());

    // Recorrer contenedores comunes de outcomes en el arbol
    const children =
      node.Outcomes || node.outcomes ||
      node.SubOutcomes || node.subOutcomes ||
      node.ChildOutcomes || node.childOutcomes ||
      node.Children || node.children;
    if (children) visit(children);
  };

  // El payload puede llegar como {outcomeSets: [...]}, como array crudo o
  // como un solo set. Cubrimos las tres variantes.
  const sets = payload.outcomeSets ?? payload;
  visit(sets);

  // Dedupe manteniendo el orden — Brightspace a veces repite la misma
  // description por rubricas compartidas.
  const seen = new Set();
  return flat.filter((d) => {
    const key = d.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isVisibleContentItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.IsHidden === true) return false;
  return Number(item.Type) !== 0;
}

export function safeAvg(list) {
  // Nota (#16): se filtran null/undefined/"" ANTES de Number() porque
  // Number(null) === 0 — sin este filtro, un dato faltante contaba como 0
  // y arrastraba el promedio hacia abajo.
  const nums = (Array.isArray(list) ? list : [])
    .filter((x) => x !== null && x !== undefined && x !== "")
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function pickCriticalMacroFromGemelo(g) {
  const arr = g?.macro?.units || g?.macroUnits || [];
  if (!Array.isArray(arr) || !arr.length) return null;
  const copy = arr
    .map((x) => ({ code: x.code, pct: Number(x.pct ?? x.avgPct ?? 0) }))
    .filter((x) => x.code);
  if (!copy.length) return null;
  copy.sort((a, b) => a.pct - b.pct);
  return copy[0];
}

export function computeRiskFromPct(pct) {
  if (pct == null || Number.isNaN(Number(pct))) return "pending";
  const p = Number(pct);
  if (p < 50) return "alto";
  if (p < 70) return "medio";
  return "bajo";
}

export function suggestRouteForStudent(s, thresholds) {
  const risk = String(s?.risk || "").toLowerCase();
  const perf = s?.currentPerformancePct != null ? Number(s.currentPerformancePct) : null;
  const cov = s?.coveragePct != null ? Number(s.coveragePct) : null;

  if (cov != null && cov < 40) {
    return {
      id: "route_coverage",
      title: "Ruta 0 — Activar evidencia",
      summary: "Priorizar calificación de evidencias pendientes.",
      actions: [
        "Identificar 1 evidencia crítica y publicarla esta semana",
        "Acordar fecha de entrega con el estudiante",
      ],
    };
  }

  if (risk === "alto") {
    return {
      id: "route_high_risk",
      title: "Ruta 1 — Recuperación",
      summary: "Intervención inmediata con plan corto (7 días).",
      actions: [
        "Reunión 1:1 (15 min) para acordar objetivo semanal",
        "Actividad de refuerzo o re-entrega enfocada en el error",
        "Retroalimentación concreta + checklist de mejora",
      ],
    };
  }

  if (risk === "medio" || (perf != null && perf < thresholds.watch)) {
    const macro = s?.mostCriticalMacro?.code;
    return {
      id: "route_watch",
      title: "Ruta 2 — Ajuste dirigido",
      summary: macro ? `Enfoque: ${macro} (${fmtPct(s?.mostCriticalMacro?.pct)})` : "Enfoque: desempeño general",
      actions: [
        "Microtarea guiada (30–45 min) sobre el punto débil",
        "Ejemplo resuelto + plantilla de entrega",
        "Seguimiento en próxima evidencia",
      ],
    };
  }

  return {
    id: "route_ok",
    title: "Ruta 3 — Mantener desempeño",
    summary: "Sostener ritmo y calidad.",
    actions: ["Mantener entregas a tiempo", "Extensión opcional: reto avanzado"],
  };
}

export function contentRhythmStatus(progressRatio) {
  const COLORS = { pending: "#98A2B3", critical: "#D92D20", watch: "#F79009", ok: "#12B76A" };
  if (progressRatio == null) {
    return { status: "pending", color: COLORS.pending, bg: "var(--pending-bg)", label: "Pendiente" };
  }
  if (progressRatio < 0.8) {
    return { status: "critico", color: COLORS.critical, bg: "var(--critical-bg)", label: "Crítico" };
  }
  if (progressRatio < 1.0) {
    return { status: "observacion", color: COLORS.watch, bg: "var(--watch-bg)", label: "En seguimiento" };
  }
  return { status: "solido", color: COLORS.ok, bg: "var(--ok-bg)", label: "Óptimo" };
}

/**
 * Parse a Brightspace grade item formula to extract the evidence names it
 * references.
 *
 * Example:
 *   AVG{ [Actividad I-1 - IA y Derechos de Autor.Puntos recibidos],
 *        [Actividad I-2 - ¿Listos para lanzar un chatbot?.Puntos recibidos] }
 *
 * Returns: ["Actividad I-1 - IA y Derechos de Autor",
 *           "Actividad I-2 - ¿Listos para lanzar un chatbot?"]
 */
export function parseFormulaReferences(formula) {
  if (!formula || typeof formula !== "string") return [];
  let decoded = formula;
  try {
    if (typeof document !== "undefined") {
      const txt = document.createElement("textarea");
      txt.innerHTML = formula;
      decoded = txt.value;
    }
  } catch {}
  const re = /\[([^\]]+?)\.(?:Puntos recibidos|Points Received|Puntos Recibidos|Puntos|Points|Calificaci[óo]n|Grade|Score|Max Points|Puntaje)\]/gi;
  const names = [];
  let m;
  while ((m = re.exec(decoded)) !== null) {
    const name = m[1].trim();
    if (name && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) {
    const re2 = /\[([^\]]+?)\]/g;
    while ((m = re2.exec(decoded)) !== null) {
      const name = m[1].trim();
      if (name && /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(name) && !names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

/**
 * Build "corte groups" for the Resumen por Cortes section.
 *
 * Returns: [
 *   {
 *     id: string,            // unique key
 *     name: string,          // group title
 *     period: number|null,   // cortePeriod if we can infer one
 *     aggregates: Evidence[],// corte summary items (Formula / isCorte)
 *     components: Evidence[],// the individual evidences that make up the corte
 *   },
 *   ...
 * ]
 *
 * Priority:
 *   1. If gradeCategories[] is provided (category-based grouping, most reliable):
 *      each category becomes a group. Items inside are split into
 *      aggregates (isCorte OR gradeType=Formula) vs components (the rest).
 *      Categories that contain no meaningful content are skipped.
 *
 *   2. Fallback for courses WITHOUT categories but with formula text:
 *      parse each corte's formula references (via matchEvidencesByFormula).
 *
 *   3. Last-resort fallback: if there's only ONE corte in the whole course
 *      and no categories, put every non-corte evidence under it. Better than
 *      showing an empty group (pattern common when course uses a Formula
 *      item that Brightspace doesn't expose the formula text for).
 */
// Match a category/item name against the set of accepted "corte" labels
// and return the period number (1..4) if it matches, else null. Patterns:
//   - "Corte 1", "CORTE 2"
//   - "Primer corte", "Segundo corte", "Tercer corte", "Cuarto corte"
//   - "Corte uno", "Corte dos", "Corte tres", "Corte cuatro"
//
// Intentionally does NOT match "C1"/"C2" because those conflict with
// real category names like "C1 - Tareas" that aren't grading periods.
export function detectCortePeriod(name) {
  if (!name) return null;
  const s = String(name).trim();
  // Corte 1, CORTE 2, etc. Requires the word "corte" to be present.
  let m = s.match(/\b(?:CORTE|Corte)\s*([1-4])\b/i);
  if (m) return parseInt(m[1], 10);
  // Ordinal: Primer/Segundo/Tercer/Cuarto corte
  const ordinalMap = { primer: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4 };
  m = s.match(/\b(primer|segundo|tercer|tercero|cuarto)\s*corte\b/i);
  if (m) return ordinalMap[m[1].toLowerCase()];
  // Word: Corte uno/dos/tres/cuatro
  const wordMap = { uno: 1, dos: 2, tres: 3, cuatro: 4 };
  m = s.match(/\bcorte\s*(uno|dos|tres|cuatro)\b/i);
  if (m) return wordMap[m[1].toLowerCase()];
  return null;
}

export function buildCorteGroups(evidences, gradeCategories) {
  const list = Array.isArray(evidences) ? evidences : [];
  if (list.length === 0) return [];

  const corteItems = list.filter((e) => e?.isCorte === true);
  const nonCorteItems = list.filter((e) => e?.isCorte !== true);

  // ── Path 1: categories (ONLY those named "Corte N") ──────────────────
  // When the course uses categories, we ONLY surface those whose name
  // matches a "Corte N" pattern (Corte 1, Primer corte, C2, Corte dos...).
  // Any other category (Tareas, Quizzes, etc.) is skipped because the user
  // wants the Resumen section to focus on the actual grading periods.
  const cats = Array.isArray(gradeCategories) ? gradeCategories : [];
  if (cats.length > 0) {
    const groups = [];
    const byId = new Map();
    for (const e of list) byId.set(String(e.gradeObjectId), e);

    for (const cat of cats) {
      const period = detectCortePeriod(cat?.name);
      if (period == null) continue;   // skip non-corte categories

      const ids = Array.isArray(cat?.itemIds) ? cat.itemIds : [];
      const itemsInCat = ids
        .map((id) => byId.get(String(id)))
        .filter(Boolean);
      if (itemsInCat.length === 0) continue;

      const aggregates = itemsInCat.filter(
        (e) => e.isCorte === true || String(e.gradeType || "").toLowerCase() === "formula"
      );
      const components = itemsInCat.filter(
        (e) => e.isCorte !== true && String(e.gradeType || "").toLowerCase() !== "formula"
      );

      if (aggregates.length === 0 && components.length === 0) continue;

      groups.push({
        id: `cat-${cat.id}`,
        name: cat.name || `Corte ${period}`,
        period,
        aggregates,
        components,
      });
    }

    if (groups.length > 0) {
      // Sort: by inferred period (if any), then by name
      groups.sort((a, b) => {
        const pa = a.period ?? 99;
        const pb = b.period ?? 99;
        if (pa !== pb) return pa - pb;
        return String(a.name).localeCompare(String(b.name), "es");
      });
      return groups;
    }
  }

  // ── Path 2: no categories — use the API ORDER to bucket items ────────
  // Brightspace returns grade items in gradebook display order. Rollup
  // items (Formula / Corte) appear AFTER the assignments they aggregate:
  //
  //   Actividad I-1, Actividad I-2, ..., Actividad I_5, [Corte 1],
  //   Actividad I-6, Actividad I-7, Actividad II-2, [Corte 2], ...
  //
  // So we walk the list, accumulate non-rollup items into a bucket, and
  // flush the bucket every time we hit a rollup. This is the most
  // reliable mapping when the API doesn't expose formula text.
  const isRollup = (e) =>
    e?.isCorte === true ||
    String(e?.gradeType || "").toLowerCase() === "formula";

  const rollups = list.filter(isRollup);
  if (rollups.length > 0) {
    const groups = [];
    let bucket = [];
    let periodCounter = 0;
    for (const e of list) {
      if (isRollup(e)) {
        periodCounter += 1;
        // Try formula-text matching first (if available) — more precise
        const fromFormula = matchEvidencesByFormula(e, list.filter((x) => !isRollup(x)));
        const components = fromFormula.length > 0 ? fromFormula : bucket;
        groups.push({
          id: `corte-${e.gradeObjectId}`,
          name: e.name || `Sección ${periodCounter}`,
          period: e.cortePeriod ?? periodCounter,
          aggregates: [e],
          components,
        });
        bucket = [];
      } else {
        bucket.push(e);
      }
    }
    // Any non-rollup items left after the LAST rollup are "work not yet
    // assigned to a corte" — show them as a tail group so the user sees them.
    if (bucket.length > 0) {
      groups.push({
        id: "tail-unassigned",
        name: "Sin corte asignado",
        period: null,
        aggregates: [],
        components: bucket,
      });
    }
    return groups;
  }

  // No rollups at all → nothing to show in this section
  return [];
}

/**
 * Given a formula-based corte item and the full evidence list, return the
 * matching evidences referenced by the formula.
 */
export function matchEvidencesByFormula(corteItem, allEvidences) {
  const refs = parseFormulaReferences(corteItem?.formula);
  if (refs.length === 0) return [];
  const list = Array.isArray(allEvidences) ? allEvidences : [];
  const norm = (s) => String(s || "").toLowerCase().trim();
  const out = [];
  const seen = new Set();
  for (const ref of refs) {
    const r = norm(ref);
    let hit = list.find((e) => norm(e.name) === r);
    if (!hit) hit = list.find((e) => norm(e.name).startsWith(r));
    if (!hit) hit = list.find((e) => norm(e.name).includes(r) || r.includes(norm(e.name)));
    if (hit && !seen.has(hit.gradeObjectId)) {
      out.push(hit);
      seen.add(hit.gradeObjectId);
    }
  }
  return out;
}
