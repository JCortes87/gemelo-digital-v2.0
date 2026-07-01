/**
 * Export utilities — generate CSV and printable HTML reports from
 * course / student data. No external libraries required.
 */
import { COLORS } from "./colors";
import { computeRiskFromPct } from "./helpers";

/**
 * Map a percentage to a status color (critical/watch/ok/pending).
 * Centralizes the same thresholds used in computeRiskFromPct.
 */
function colorForRiskPct(pct) {
  const r = computeRiskFromPct(pct);
  if (r === "alto") return COLORS.critical;
  if (r === "medio") return COLORS.watch;
  if (r === "bajo") return COLORS.ok;
  return COLORS.pending;
}

/**
 * Escape a CSV field (wrap in quotes if contains comma/quote/newline).
 */
function escCsv(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Trigger a browser download of a blob with a given filename.
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Generic CSV download helper. `headers` is an array of strings, `rows` is
 * an array of arrays (same length as headers). Filename is the final name.
 */
export function downloadCsv(filename, headers, rows) {
  const headerLine = (headers || []).map(escCsv).join(",");
  const bodyLines = (rows || []).map((r) => (r || []).map(escCsv).join(","));
  const content = "\uFEFF" + [headerLine, ...bodyLines].join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
}

/**
 * Catalog of columns available for CSV export. Each entry has a stable `key`
 * (used to select columns), a human-readable `label`, and a `value(s)` getter.
 * Order in this array is the default export order.
 */
export const STUDENT_CSV_COLUMNS = [
  { key: "userId", label: "ID", value: (s) => s.userId },
  { key: "displayName", label: "Nombre", value: (s) => s.displayName },
  { key: "email", label: "Email", value: (s) => s.email || "" },
  {
    key: "grade10",
    label: "Nota (0-10)",
    value: (s) =>
      s.currentPerformancePct != null ? (s.currentPerformancePct / 10).toFixed(1) : "",
  },
  {
    key: "coveragePct",
    label: "Cobertura %",
    value: (s) => (s.coveragePct != null ? s.coveragePct.toFixed(1) : ""),
  },
  { key: "risk", label: "Riesgo", value: (s) => s.risk || "" },
  { key: "route", label: "Ruta", value: (s) => s.route?.title || "" },
  {
    key: "criticalMacro",
    label: "RA crítico",
    value: (s) => s.mostCriticalMacro?.code || "",
  },
  {
    key: "pendingPct",
    label: "Pendientes %",
    value: (s) =>
      s.pendingSubmittedWeightPct != null
        ? s.pendingSubmittedWeightPct.toFixed(1)
        : "",
  },
  {
    key: "overduePct",
    label: "Vencidos %",
    value: (s) =>
      s.notSubmittedWeightPct != null
        ? s.notSubmittedWeightPct.toFixed(1)
        : s.overdueWeightPct != null
        ? s.overdueWeightPct.toFixed(1)
        : "",
  },
];

/**
 * Export students roster to CSV.
 *
 * @param {Array} studentRows  rows to export (caller is responsible for
 *   passing the *filtered* list — the function does not re-apply filters,
 *   but the optional `filterDescription` is embedded in the filename for
 *   provenance).
 * @param {Object} courseInfo  for naming the file.
 * @param {Object} [options]
 * @param {string[]} [options.columns]            keys from STUDENT_CSV_COLUMNS
 *   to include (in order). If omitted, exports all columns.
 * @param {string}   [options.filterDescription]  short slug describing the
 *   active filter (e.g., "solo-riesgo"). Embedded in the filename.
 */
export function exportStudentsCsv(studentRows, courseInfo, options = {}) {
  const rows = Array.isArray(studentRows) ? studentRows : [];
  const { columns, filterDescription } = options || {};

  const selected = Array.isArray(columns) && columns.length
    ? columns
        .map((k) => STUDENT_CSV_COLUMNS.find((c) => c.key === k))
        .filter(Boolean)
    : STUDENT_CSV_COLUMNS;

  const headers = selected.map((c) => c.label);
  const lines = [headers.map(escCsv).join(",")];
  for (const s of rows) {
    lines.push(selected.map((c) => c.value(s)).map(escCsv).join(","));
  }
  const content = "\uFEFF" + lines.join("\r\n"); // BOM for Excel UTF-8
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const ts = new Date().toISOString().slice(0, 10);
  const courseSafe = String(courseInfo?.Name || "curso").replace(/[^\w]+/g, "_").slice(0, 40);
  const filterSafe = filterDescription
    ? `_${String(filterDescription).replace(/[^\w]+/g, "_").slice(0, 30)}`
    : "";
  downloadBlob(blob, `gemelo_${courseSafe}${filterSafe}_${ts}.csv`);
}

/**
 * Open a new window with a printable HTML report of the full course
 * (header + stats + students table). User can use browser print dialog.
 */
export function exportCourseReport(studentRows, courseInfo, overview) {
  const rows = Array.isArray(studentRows) ? studentRows : [];
  const today = new Date().toLocaleString("es-CO");
  const courseName = courseInfo?.Name || "Curso";
  const totalStudents = rows.length;
  const avgPct = overview?.courseGradebook?.avgCurrentPerformancePct;
  const avgCov = overview?.courseGradebook?.avgCoveragePct;

  const riskCounts = { alto: 0, medio: 0, bajo: 0, pending: 0 };
  for (const s of rows) {
    riskCounts[computeRiskFromPct(s.currentPerformancePct)]++;
  }

  const rowsHtml = rows.map((s) => {
    const grade = s.currentPerformancePct != null ? (s.currentPerformancePct / 10).toFixed(1) : "—";
    const cov = s.coveragePct != null ? s.coveragePct.toFixed(1) + "%" : "—";
    const risk = s.risk || "—";
    const color = colorForRiskPct(s.currentPerformancePct);
    return `<tr>
      <td style="font-family:monospace;color:#5A6580">${s.userId}</td>
      <td>${escapeHtml(s.displayName || "")}</td>
      <td style="text-align:right;font-weight:900;color:${color}">${grade}</td>
      <td style="text-align:right">${cov}</td>
      <td style="text-align:center;text-transform:uppercase;font-size:10px;font-weight:800">${risk}</td>
      <td style="font-size:11px;color:#5A6580">${escapeHtml(s.route?.title || "")}</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte ${escapeHtml(courseName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Manrope, sans-serif; padding: 30px 40px; color: #0F1827; max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub { font-size: 12px; color: #5A6580; margin-bottom: 24px; }
  .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat { flex: 1; min-width: 140px; padding: 14px; border: 1px solid #E4E8EF; border-radius: 10px; }
  .stat-label { font-size: 10px; color: #5A6580; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-value { font-size: 28px; font-weight: 900; margin-top: 4px; letter-spacing: -0.02em; }
  .risk-grid { display: flex; gap: 8px; margin-bottom: 24px; }
  .risk-item { flex: 1; padding: 10px; border-radius: 8px; text-align: center; }
  .risk-alto { background: #FEF3F2; color: #B42318; }
  .risk-medio { background: #FFF8ED; color: #9A3412; }
  .risk-bajo { background: #ECFDF3; color: #1B5E20; }
  .risk-pending { background: #F1F3F7; color: #5A6580; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; background: #F2F4F8; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #5A6580; border-bottom: 2px solid #E4E8EF; }
  td { padding: 6px 10px; border-bottom: 1px solid #E4E8EF; }
  tr:nth-child(even) { background: #FAFBFD; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E4E8EF; font-size: 10px; color: #5A6580; text-align: center; }
  @media print {
    body { padding: 20px; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>G.D · Reporte de Curso</h1>
  <div class="sub">${escapeHtml(courseName)} · Generado ${escapeHtml(today)}</div>

  <div class="stats">
    <div class="stat">
      <div class="stat-label">Estudiantes</div>
      <div class="stat-value">${totalStudents}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Nota promedio</div>
      <div class="stat-value">${avgPct != null ? (avgPct / 10).toFixed(1) : "—"}<span style="font-size:14px;color:#5A6580">/10</span></div>
    </div>
    <div class="stat">
      <div class="stat-label">Cobertura</div>
      <div class="stat-value">${avgCov != null ? avgCov.toFixed(1) + "%" : "—"}</div>
    </div>
  </div>

  <div class="risk-grid">
    <div class="risk-item risk-alto">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase">Alto</div>
      <div style="font-size:22px;font-weight:900">${riskCounts.alto}</div>
    </div>
    <div class="risk-item risk-medio">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase">Medio</div>
      <div style="font-size:22px;font-weight:900">${riskCounts.medio}</div>
    </div>
    <div class="risk-item risk-bajo">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase">Bajo</div>
      <div style="font-size:22px;font-weight:900">${riskCounts.bajo}</div>
    </div>
    <div class="risk-item risk-pending">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase">Sin datos</div>
      <div style="font-size:22px;font-weight:900">${riskCounts.pending}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>ID</th><th>Nombre</th><th style="text-align:right">Nota</th><th style="text-align:right">Cobertura</th><th style="text-align:center">Riesgo</th><th>Ruta</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="footer">
    CESA · G.D V.260428 · Reporte generado automáticamente
  </div>

  <script>
    // Auto-open print dialog after load (user can cancel)
    setTimeout(() => { window.print(); }, 400);
  </script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    console.warn("No se pudo abrir la ventana de reporte. Revisa tu bloqueador de pop-ups.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

/**
 * Color por nivel/desempeño (igual que en el modal de retroalimentación).
 */
function levelColorHex(level) {
  if (!level) return "#5A6580";
  const l = String(level).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (l.includes("avanz") || l.includes("excelent") || l.includes("superior") || l.includes("logrado")) return "#16a34a";
  if (l.includes("interm") || l.includes("satisf") || l.includes("aceptable") || l.includes("proficien")) return "#0B5FFF";
  if (l.includes("basi") || l.includes("elemental") || l.includes("suficiente") || l.includes("developing")) return "#d97706";
  if (l.includes("inicial") || l.includes("no cumple") || l.includes("deficiente") || l.includes("insuficiente") || l.includes("beginning")) return "#B42318";
  return "#5A6580";
}

/**
 * Genera un PDF institucional con la retroalimentación de una entrega.
 * Abre una ventana nueva con el HTML formateado y dispara el diálogo de imprimir
 * para que el docente "Guarde como PDF".
 *
 * @param {object} args
 * @param {object} args.feedback        Datos del modal: { score, outOf, feedbackText, rubrics, files, assignmentInstructions, submissionComment, submittedAt }
 * @param {string} args.evidenceName    Nombre de la entrega
 * @param {string} args.studentName     Nombre del estudiante
 * @param {number|string} args.studentId
 * @param {object} args.courseInfo      Info del curso (Name, Code)
 * @param {string} args.downloadUrl     URL de descarga del documento del estudiante
 */
export function exportInstitutionalFeedbackPdf({
  feedback = {},
  evidenceName = "",
  studentName = "",
  studentId = "",
  courseInfo = null,
  downloadUrl = "",
}) {
  const today = new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
  const submittedAt = feedback.submittedAt
    ? new Date(feedback.submittedAt).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const courseName = courseInfo?.Name || "Curso";
  const courseCode = courseInfo?.Code || "";
  const rubricsRaw = Array.isArray(feedback.rubrics) ? feedback.rubrics : [];
  // Prioridad: 1) calificación obtenida real (feedback.score viene del feedback
  // envelope o, si no existe, del gradebook como fallback en el backend),
  // 2) si tampoco hay, usar la nota de la rúbrica (porque ESA fue la calificación
  // efectiva del docente cuando no publicó nota al gradebook).
  let score = feedback.score;
  let outOf = feedback.outOf;
  if ((score == null || outOf == null || !(outOf > 0)) && rubricsRaw.length) {
    for (const r of rubricsRaw) {
      const s = r?.score, o = r?.outOf;
      if (s != null && o != null && o > 0) { score = s; outOf = o; break; }
    }
  }
  const grade10 = (score != null && outOf != null && outOf > 0)
    ? ((score / outOf) * 10).toFixed(1) : null;
  const pct = (score != null && outOf != null && outOf > 0)
    ? Math.min(100, (score / outOf) * 100) : null;

  // Semáforo (también para el badge compacto al lado de Entrega)
  let topColor = "#5A6580";
  if (pct != null) {
    if (pct >= 80) topColor = "#16a34a";
    else if (pct >= 60) topColor = "#0B5FFF";
    else if (pct >= 40) topColor = "#d97706";
    else topColor = "#B42318";
  }
  const text = feedback.feedbackText || "";
  const instructions = feedback.assignmentInstructions || "";
  const studentComment = feedback.submissionComment || "";
  const files = Array.isArray(feedback.files) ? feedback.files : [];
  const rubrics = rubricsRaw;

  const logoUrl = `${window.location.origin}/cesa-logo-white.png`;

  const rubricsHtml = rubrics.map((r) => {
    const rPct = (r.score != null && r.outOf != null && r.outOf > 0)
      ? Math.min(100, (r.score / r.outOf) * 100) : null;
    const rColor = levelColorHex(r.level);
    const criteriaHtml = (Array.isArray(r.criteria) ? r.criteria : []).map((c) => {
      const cColor = levelColorHex(c.level);
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #E4E8EF;font-size:11px;font-weight:700;color:#0F1827;width:35%;border-left:3px solid ${cColor}">${escapeHtml(c.name || "")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E4E8EF;text-align:center;width:18%">
            ${c.level ? `<span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:99px;background:${cColor}22;color:${cColor};border:1px solid ${cColor}55;text-transform:uppercase">${escapeHtml(c.level)}</span>` : "—"}
          </td>
          <td style="padding:8px 10px;border-bottom:1px solid #E4E8EF;text-align:right;font-family:ui-monospace,monospace;font-size:13px;font-weight:900;color:${cColor};width:8%">${c.points != null ? c.points : "—"}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #E4E8EF;font-size:10px;color:#5A6580;line-height:1.4">${c.comment ? c.comment : '<span style="color:#B0B7C3;font-style:italic">Sin comentario</span>'}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="rubric-block" style="margin-top:18px;border:1px solid #D6DCE5;border-radius:8px;overflow:hidden;page-break-inside:avoid">
        <div style="padding:10px 14px;background:linear-gradient(135deg, #0B2D5C 0%, #0B5FFF 100%);color:#fff;display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85">📋 Rúbrica utilizada</div>
            <div style="font-size:14px;font-weight:800;margin-top:2px">${escapeHtml(r.name || "Sin nombre")}</div>
          </div>
          ${r.score != null ? `
            <div style="text-align:right">
              <div style="font-family:ui-monospace,monospace;font-size:18px;font-weight:900">${r.score}${r.outOf != null ? `<span style="font-size:11px;opacity:0.75;font-weight:600"> / ${r.outOf}</span>` : ""}</div>
              ${r.level ? `<div style="font-size:9px;font-weight:800;margin-top:3px;padding:2px 8px;border-radius:99px;background:rgba(255,255,255,0.18);display:inline-block;text-transform:uppercase">${escapeHtml(r.level)}</div>` : ""}
              ${rPct != null ? `<div style="height:3px;background:rgba(255,255,255,0.25);border-radius:99px;overflow:hidden;margin-top:5px;width:80px;margin-left:auto"><div style="height:100%;width:${rPct}%;background:#fff;border-radius:99px"></div></div>` : ""}
            </div>` : ""}
        </div>
        ${(Array.isArray(r.criteria) && r.criteria.length > 0) ? `
          <table style="width:100%;border-collapse:collapse;background:#fff">
            <thead>
              <tr style="background:#F2F4F8">
                <th style="text-align:left;padding:6px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#5A6580;border-bottom:2px solid #E4E8EF">Criterio</th>
                <th style="text-align:center;padding:6px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#5A6580;border-bottom:2px solid #E4E8EF">Nivel</th>
                <th style="text-align:right;padding:6px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#5A6580;border-bottom:2px solid #E4E8EF">Pts</th>
                <th style="text-align:left;padding:6px 10px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#5A6580;border-bottom:2px solid #E4E8EF">Comentario</th>
              </tr>
            </thead>
            <tbody>${criteriaHtml}</tbody>
          </table>` : `<div style="padding:14px;font-size:11px;color:#5A6580;font-style:italic;text-align:center">Rúbrica sin criterios evaluados.</div>`}
      </div>
    `;
  }).join("");

  const filesHtml = files.length > 0 ? `
    <div class="section" style="margin-top:18px">
      <div class="section-title">📎 Archivos adjuntos del docente (${files.length})</div>
      <ul style="margin:6px 0 0;padding-left:18px;font-size:11px;color:#0F1827;line-height:1.6">
        ${files.map((f) => `<li>${escapeHtml(f.FileName || f.Name || "Archivo")}</li>`).join("")}
      </ul>
    </div>
  ` : "";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Retroalimentación · ${escapeHtml(studentName)} · ${escapeHtml(evidenceName)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Manrope, sans-serif;
    color: #0F1827;
    margin: 0;
    padding: 0;
    background: #fff;
  }
  .page { max-width: 800px; margin: 0 auto; padding: 0 32px 32px; }
  .institutional-header {
    background: linear-gradient(135deg, #0B2D5C 0%, #0B5FFF 100%);
    color: #fff;
    padding: 22px 32px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .institutional-header img { height: 52px; width: auto; }
  .institutional-header .h-text { flex: 1; }
  .institutional-header .h-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.85; }
  .institutional-header .h-sub { font-size: 18px; font-weight: 800; margin-top: 4px; letter-spacing: -0.01em; }
  .institutional-header .h-meta { font-size: 10px; opacity: 0.85; margin-top: 4px; }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 18px;
  }
  .info-card {
    border: 1px solid #E4E8EF;
    border-radius: 8px;
    padding: 12px 14px;
    background: #FAFBFD;
  }
  .info-label { font-size: 9px; font-weight: 800; color: #5A6580; text-transform: uppercase; letter-spacing: 0.08em; }
  .info-value { font-size: 13px; font-weight: 700; color: #0F1827; margin-top: 3px; line-height: 1.3; }

  .grade-card {
    border: 2px solid #0B5FFF;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 18px;
    background: linear-gradient(135deg, #EAF2FF 0%, #fff 100%);
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .grade-card .gc-label { font-size: 10px; font-weight: 800; color: #0B5FFF; text-transform: uppercase; letter-spacing: 0.08em; }
  .grade-card .gc-bar { height: 6px; background: rgba(11,95,255,0.18); border-radius: 99px; overflow: hidden; margin-top: 8px; }
  .grade-card .gc-bar-inner { height: 100%; background: #0B5FFF; border-radius: 99px; }
  .grade-card .gc-value { font-family: ui-monospace, monospace; font-size: 38px; font-weight: 900; color: #0B5FFF; line-height: 1; }
  .grade-card .gc-outof { font-size: 14px; color: #5A6580; font-weight: 600; }
  .grade-card .gc-grade10 { font-size: 11px; color: #5A6580; margin-top: 4px; font-weight: 700; }

  .section { margin-top: 18px; page-break-inside: avoid; }
  .section-title {
    font-size: 10px;
    font-weight: 800;
    color: #0B2D5C;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 2px solid #0B5FFF;
    padding-bottom: 4px;
    margin-bottom: 8px;
  }
  .section-body {
    font-size: 12px;
    line-height: 1.6;
    color: #0F1827;
    padding: 10px 14px;
    background: #FAFBFD;
    border: 1px solid #E4E8EF;
    border-radius: 8px;
    border-left: 3px solid #0B5FFF;
  }
  .section-body img { max-width: 100%; height: auto; }
  .section-body p { margin: 0 0 8px; }
  .section-body p:last-child { margin-bottom: 0; }

  .download-link {
    display: inline-block;
    padding: 10px 16px;
    background: #0B5FFF;
    color: #fff !important;
    text-decoration: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    word-break: break-all;
  }
  .download-note { font-size: 10px; color: #5A6580; margin-top: 6px; line-height: 1.4; }

  .footer {
    margin-top: 32px;
    padding: 12px 32px;
    border-top: 1px solid #E4E8EF;
    font-size: 9px;
    color: #5A6580;
    text-align: center;
    line-height: 1.5;
  }

  @media print {
    @page { margin: 1.2cm; size: A4; }
    .institutional-header { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .grade-card, .rubric-block, .download-link, .section-body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .no-print { display: none !important; }
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="institutional-header">
    <img src="${logoUrl}" alt="CESA" onerror="this.style.display='none'" />
    <div class="h-text">
      <div class="h-title">Colegio de Estudios Superiores de Administración</div>
      <div class="h-sub">G.D · Reporte de Retroalimentación</div>
      <div class="h-meta">Generado el ${escapeHtml(today)}</div>
    </div>
  </div>

  <div class="page">

    <div class="info-grid">
      <div class="info-card">
        <div class="info-label">Estudiante</div>
        <div class="info-value">${escapeHtml(studentName || "—")}</div>
        ${studentId ? `<div style="font-size:10px;color:#5A6580;margin-top:2px;font-family:ui-monospace,monospace">ID ${escapeHtml(String(studentId))}</div>` : ""}
      </div>
      <div class="info-card">
        <div class="info-label">Curso</div>
        <div class="info-value">${escapeHtml(courseName)}</div>
        ${courseCode ? `<div style="font-size:10px;color:#5A6580;margin-top:2px">${escapeHtml(courseCode)}</div>` : ""}
      </div>
      <div class="info-card" style="grid-column:1/-1;display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <div class="info-label">Entrega</div>
          <div class="info-value">${escapeHtml(evidenceName || "—")}</div>
          ${submittedAt ? `<div style="font-size:10px;color:#5A6580;margin-top:2px">Fecha de entrega: ${escapeHtml(submittedAt)}</div>` : ""}
        </div>
        ${grade10 != null ? `
          <div style="flex-shrink:0;text-align:center;padding:8px 14px;border-radius:12px;background:${topColor};color:#fff;min-width:74px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;opacity:0.9">Nota</div>
            <div style="font-size:22px;font-weight:900;line-height:1.1">${grade10}</div>
            <div style="font-size:9px;font-weight:700;opacity:0.9">/ 10</div>
          </div>
        ` : ""}
      </div>
    </div>

    ${instructions ? `
      <div class="section">
        <div class="section-title">📌 Instrucciones de la tarea</div>
        <div class="section-body">${instructions}</div>
      </div>
    ` : ""}

    ${downloadUrl ? `
      <div class="section">
        <div class="section-title">📄 Documento entregado por el estudiante</div>
        <div style="padding:10px 14px;background:#FAFBFD;border:1px solid #E4E8EF;border-radius:8px">
          <a href="${escapeHtml(downloadUrl)}" class="download-link" target="_blank" rel="noopener">⬇ Descargar entrega</a>
          <div class="download-note">El documento se abrirá/descargará desde el sistema. Conserve este enlace para acceder al archivo original del estudiante.</div>
        </div>
      </div>
    ` : ""}

    ${studentComment ? `
      <div class="section">
        <div class="section-title">📝 Comentario del estudiante (entrega)</div>
        <div class="section-body" style="border-left-color:#16a34a">${studentComment}</div>
      </div>
    ` : ""}

    <div class="section">
      <div class="section-title">💬 Comentario general del docente</div>
      ${text
        ? `<div class="section-body">${text}</div>`
        : `<div class="section-body" style="border-left-color:#B0B7C3;color:#5A6580;font-style:italic">No se realizó un comentario general del docente para esta entrega.</div>`
      }
    </div>

    ${rubrics.length > 0 ? `
      <div class="section">
        <div class="section-title">🎯 Evaluación detallada por rúbrica</div>
        ${rubricsHtml}
      </div>
    ` : ""}

    ${filesHtml}

    ${(score == null && rubrics.length === 0 && !instructions && !studentComment && files.length === 0 && !text) ? `
      <div style="padding:32px;text-align:center;color:#5A6580;font-size:12px;font-style:italic;background:#FAFBFD;border-radius:8px;border:1px dashed #E4E8EF">
        Esta entrega no tiene retroalimentación registrada en el sistema.
      </div>
    ` : ""}

  </div>

  <div class="footer">
    CESA · G.D · Reporte de retroalimentación generado automáticamente<br/>
    Este documento es de uso académico interno y contiene información confidencial del estudiante.
  </div>

  <script>
    // Esperar a que carguen imágenes (logo) antes de imprimir
    function startPrint() { setTimeout(function() { window.print(); }, 250); }
    if (document.readyState === "complete") { startPrint(); }
    else { window.addEventListener("load", startPrint); }
  </script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("No se pudo abrir la ventana del reporte. Revisa tu bloqueador de pop-ups.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
