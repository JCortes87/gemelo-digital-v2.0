import { computeRiskFromPct } from "./helpers";

function normalizeVoiceText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function includesAny(text, patterns) {
  return patterns.some((p) => text.includes(p));
}

export function parseVoiceCommand(rawText) {
  const text = normalizeVoiceText(rawText);
  if (!text) return { type: "unknown", message: "No se reconoció ningún comando." };

  if (includesAny(text, ["resultado de aprendizaje","resultados de aprendizaje","prioridad academica","competencias","subcompetencias","logro por ra"])) {
    return { type: "navigate_section", section: "learning-outcomes", message: "Mostrando resultados de aprendizaje." };
  }
  if (includesAny(text, ["estudiantes prioritarios","prioritarios","mayor riesgo","riesgo mas alto","riesgo alto","en riesgo"])) {
    return { type: "highest_risk_student", message: "Buscando el estudiante con mayor riesgo académico." };
  }
  if (includesAny(text, ["resultado mas bajo","peor resultado","nota mas baja","menor nota","estudiante mas bajo","peor desempe"])) {
    return { type: "lowest_result_student", message: "Buscando el estudiante con menor desempeño." };
  }
  if (includesAny(text, ["estudiantes en riesgo","solo riesgo","muestrame los de riesgo","filtrar riesgo"])) {
    return { type: "filter_students_risk", message: "Filtrando estudiantes en riesgo." };
  }
  if (includesAny(text, ["evidencias","abre evidencias","mostrar evidencias"])) {
    return { type: "open_drawer_tab", tab: "evidencias", message: "Abriendo evidencias." };
  }
  if (includesAny(text, ["unidades","subcompetencias","abre unidades"])) {
    return { type: "open_drawer_tab", tab: "unidades", message: "Abriendo unidades." };
  }
  if (includesAny(text, ["intervencion","prescripcion"])) {
    return { type: "open_drawer_tab", tab: "prescripcion", message: "Abriendo intervención personalizada." };
  }
  if (includesAny(text, ["calidad","flags","calidad del modelo"])) {
    return { type: "open_drawer_tab", tab: "calidad", message: "Abriendo calidad del modelo." };
  }
  if (includesAny(text, ["resumen","volver al resumen"])) {
    return { type: "open_drawer_tab", tab: "resumen", message: "Abriendo resumen del estudiante." };
  }
  if (includesAny(text, ["aprobados","aprobado","pasando"])) {
    return { type: "filter_approved", message: "Mostrando estudiantes aprobados (≥7.0)." };
  }

  const buscarMatch = text.match(/(?:busca|buscar|abrir|abre|mostrar|muestrame)\s+a?\s*([a-zà-ü\s]+)$/i);
  if (buscarMatch?.[1] && buscarMatch[1].trim().length >= 3) {
    return { type: "find_student_by_name", name: buscarMatch[1].trim(), message: `Buscando a ${buscarMatch[1].trim()}.` };
  }
  if (includesAny(text, ["estudiantes","lista de estudiantes"])) {
    return { type: "navigate_section", section: "students", message: "Mostrando listado de estudiantes." };
  }
  if (text.length >= 3) {
    return { type: "text_search", text: rawText, message: `Buscando: ${rawText}` };
  }
  return { type: "unknown", message: "No se entendió el comando. Prueba: 'estudiante con resultado más bajo' o 'resultados de aprendizaje'." };
}

export function findLowestResultStudent(rows) {
  const valid = (Array.isArray(rows) ? rows : []).filter(
    (s) => !s?.isLoading && s?.currentPerformancePct != null && !Number.isNaN(Number(s.currentPerformancePct))
  );
  if (!valid.length) return null;
  return valid.slice().sort((a, b) => Number(a.currentPerformancePct) - Number(b.currentPerformancePct))[0];
}

export function findHighestRiskStudent(rows) {
  const valid = (Array.isArray(rows) ? rows : []).filter((s) => !s?.isLoading);
  if (!valid.length) return null;
  const riskRank = (s) => {
    const risk = computeRiskFromPct(s?.currentPerformancePct);
    if (risk === "alto") return 0;
    if (risk === "medio") return 1;
    if (risk === "bajo") return 2;
    return 3;
  };
  return valid.slice().sort((a, b) => {
    const rd = riskRank(a) - riskRank(b);
    if (rd !== 0) return rd;
    return Number(a?.currentPerformancePct ?? 999) - Number(b?.currentPerformancePct ?? 999);
  })[0];
}

export function findStudentByName(rows, name) {
  const q = normalizeVoiceText(name);
  return (Array.isArray(rows) ? rows : []).find((s) => normalizeVoiceText(s?.displayName).includes(q)) || null;
}
