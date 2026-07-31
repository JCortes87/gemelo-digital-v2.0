import React, { useMemo, useState } from "react";
import {
  Lightbulb, AlertTriangle, AlertOctagon, HelpCircle, TrendingDown, Clock,
  CalendarClock, Trophy, BarChart3, Target, Siren, Compass, Puzzle, Telescope,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { computeRiskFromPct } from "../../utils/helpers";

/**
 * SmartAlerts: analyzes studentRows and course data to generate
 * automatic alerts for the instructor. Pure client-side heuristics.
 *
 * Alert categories:
 *  - CRITICAL: immediate attention (e.g., N students failed)
 *  - WARNING: concerning patterns (e.g., coverage dropped)
 *  - INFO: positive signals or neutral info
 */
// Map backend severity strings (critico/observacion/en desarrollo/solido)
// to SmartAlerts severity levels (critical/warning/info).
function normalizeBackendSeverity(s) {
  const x = String(s || "").toLowerCase().trim();
  if (x === "critico" || x === "crítico" || x === "critical") return "critical";
  if (x === "solido" || x === "sólido" || x === "ok" || x === "info") return "info";
  // observacion, en seguimiento, en desarrollo, warning → warning
  return "warning";
}

// Convert a backend "Radar docente" alert (from overview.alerts) into the
// same shape SmartAlerts uses internally.
function normalizeBackendAlert(a, index = 0) {
  if (!a || typeof a !== "object") return null;
  const severity = normalizeBackendSeverity(a.severity);
  // Icons by content type (Lucide component references)
  const icons = {
    cobertura: BarChart3,
    desempeno: Target,
    riesgo: Siren,
    macro: Compass,
    ra: Puzzle,
    default: Telescope,
  };
  const t = String(a.title || a.id || "").toLowerCase();
  let icon = icons.default;
  if (t.includes("cobertura")) icon = icons.cobertura;
  else if (t.includes("desempeño") || t.includes("desempeno") || t.includes("promedio")) icon = icons.desempeno;
  else if (t.includes("riesgo")) icon = icons.riesgo;
  else if (t.includes("macro") || t.includes("competencia")) icon = icons.macro;
  else if (t.includes("ra") || t.includes("resultado") || t.includes("aprendiz")) icon = icons.ra;

  return {
    // Key estable: nunca Math.random() (rompe la reconciliación de React y
    // re-monta el nodo en cada render). El índice es estable dentro del render.
    id: a.id || `backend-${a.title || `alert-${index}`}`,
    severity,
    icon,
    title: a.title || "Observación del curso",
    message: a.message || "",
    students: null,
    kpis: a.kpis || null,
    items: Array.isArray(a.items) ? a.items : null,
    source: "radar",
  };
}

function SmartAlerts({
  studentRows = [],
  overview = null,
  courseInfo = null,
  contentKpis = null,
  backendAlerts = null,
  onStudentClick = () => {},
}) {
  const alerts = useMemo(() => {
    const rows = Array.isArray(studentRows) ? studentRows : [];
    const loaded = rows.filter((s) => !s.isLoading);

    const out = [];

    // Merge backend "Radar docente" alerts first (course-structure level)
    const backendList = Array.isArray(backendAlerts)
      ? backendAlerts
      : (Array.isArray(overview?.alerts) ? overview.alerts : []);
    backendList.forEach((b, i) => {
      const norm = normalizeBackendAlert(b, i);
      if (norm) out.push(norm);
    });

    if (loaded.length === 0) return out;

    // 1. Students with failing grade (< 5.0)
    const failing = loaded.filter(
      (s) => s.currentPerformancePct != null && s.currentPerformancePct < 50
    );
    if (failing.length > 0) {
      out.push({
        id: "failing",
        severity: "critical",
        icon: AlertOctagon,
        title: `${failing.length} estudiante${failing.length !== 1 ? "s" : ""} con nota reprobatoria`,
        message: `Nota actual menor a 5.0. Requieren intervención urgente.`,
        students: failing.slice(0, 5).map((s) => ({ id: s.userId, name: s.displayName })),
        totalCount: failing.length,
      });
    }

    // 2. Students with overdue evidences
    const withOverdue = loaded.filter(
      (s) => (s.notSubmittedWeightPct ?? s.overdueWeightPct ?? 0) > 10
    );
    if (withOverdue.length > 0) {
      out.push({
        id: "overdue",
        severity: "critical",
        icon: AlertTriangle,
        title: `${withOverdue.length} estudiante${withOverdue.length !== 1 ? "s" : ""} con ítems vencidos sin entregar`,
        message: "Más del 10% del peso del curso vencido sin registro.",
        students: withOverdue.slice(0, 5).map((s) => ({ id: s.userId, name: s.displayName })),
        totalCount: withOverdue.length,
      });
    }

    // 3. Students without any grade (potential dropouts)
    const noGrade = loaded.filter(
      (s) => s.currentPerformancePct == null || s.currentPerformancePct === 0
    );
    if (noGrade.length > 0 && noGrade.length < loaded.length * 0.5) {
      out.push({
        id: "no_grade",
        severity: "warning",
        icon: HelpCircle,
        title: `${noGrade.length} estudiante${noGrade.length !== 1 ? "s" : ""} sin nota registrada`,
        message: "Pueden ser abandonos. Verifica su actividad reciente.",
        students: noGrade.slice(0, 5).map((s) => ({ id: s.userId, name: s.displayName })),
        totalCount: noGrade.length,
      });
    }

    // 4. Low coverage overall
    const avgCoverage = overview?.courseGradebook?.avgCoveragePct;
    if (avgCoverage != null && avgCoverage < 30) {
      out.push({
        id: "low_cov",
        severity: "warning",
        icon: TrendingDown,
        title: "Cobertura evaluativa baja",
        message: `Solo ${avgCoverage.toFixed(1)}% del curso está calificado. Revisa si hay ítems sin publicar.`,
        students: null,
      });
    }

    // 5. Pending grade backlog for the instructor
    const pendingGradeBacklog = loaded.filter(
      (s) => (s.pendingSubmittedWeightPct ?? 0) > 15
    );
    if (pendingGradeBacklog.length > 0) {
      out.push({
        id: "pending_grade",
        severity: "warning",
        icon: Clock,
        title: `${pendingGradeBacklog.length} estudiante${pendingGradeBacklog.length !== 1 ? "s" : ""} esperando calificación`,
        message: "Hay entregas recibidas pendientes por calificar. Prioriza el cierre evaluativo.",
        students: pendingGradeBacklog.slice(0, 5).map((s) => ({ id: s.userId, name: s.displayName })),
        totalCount: pendingGradeBacklog.length,
      });
    }

    // 6. Content rhythm alert
    if (contentKpis?.progressRatio != null && contentKpis.progressRatio < 0.8) {
      out.push({
        id: "content_rhythm",
        severity: "warning",
        icon: CalendarClock,
        title: "Ritmo de publicación de contenidos bajo",
        message: `Has publicado ${contentKpis.createdCount}/${contentKpis.minExpected} contenidos esperados (${Math.round(contentKpis.progressRatio * 100)}%). Considera publicar más material.`,
        students: null,
      });
    }

    // 7. Positive: high performers
    const high = loaded.filter(
      (s) => s.currentPerformancePct != null && s.currentPerformancePct >= 85
    );
    if (high.length > 0 && high.length >= loaded.length * 0.3) {
      out.push({
        id: "high_performers",
        severity: "info",
        icon: Trophy,
        title: `${high.length} estudiante${high.length !== 1 ? "s" : ""} con excelente desempeño`,
        message: "Nota ≥ 8.5. Considera retos adicionales para mantener su motivación.",
        students: high.slice(0, 5).map((s) => ({ id: s.userId, name: s.displayName })),
        totalCount: high.length,
      });
    }

    // Sort: critical first, then warning, then info
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    out.sort((a, b) => (sevOrder[a.severity] ?? 99) - (sevOrder[b.severity] ?? 99));

    return out;
  }, [studentRows, overview, contentKpis, backendAlerts]);

  const [open, setOpen] = useState(false);

  if (alerts.length === 0) return null;

  const severityStyles = {
    critical: { border: "var(--critical)", bg: "var(--critical-bg)", color: "var(--critical)" },
    warning: { border: "var(--watch)", bg: "var(--watch-bg)", color: "var(--watch)" },
    info: { border: "var(--ok)", bg: "var(--ok-bg)", color: "var(--ok)" },
  };

  // Count by severity for the collapsed summary
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const a of alerts) counts[a.severity] = (counts[a.severity] || 0) + 1;

  return (
    <div className="kpi-card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Collapsed header — clickable to toggle */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={open}
        aria-label={`Alertas inteligentes, ${alerts.length} detectadas. Click para ${open ? "ocultar" : "ver detalle"}.`}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px",
          borderBottom: open ? "1px solid var(--border)" : "none",
          background: "var(--bg)",
          cursor: "pointer",
          userSelect: "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-light)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg)"; }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: "linear-gradient(135deg, var(--brand-light) 0%, rgba(11, 95, 255, 0.06) 100%)",
          color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Lightbulb size={18} strokeWidth={2.2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
              Alertas inteligentes
            </span>
            <span className="tag">{alerts.length}</span>
          </div>
          {/* Severity breakdown badges */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {counts.critical > 0 && (
              <span className="badge" style={{ background: "var(--critical-bg)", color: "#B42318" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--critical)", display: "inline-block" }} />
                Críticas: {counts.critical}
              </span>
            )}
            {counts.warning > 0 && (
              <span className="badge" style={{ background: "var(--watch-bg)", color: "#9A3412" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--watch)", display: "inline-block" }} />
                Observación: {counts.warning}
              </span>
            )}
            {counts.info > 0 && (
              <span className="badge" style={{ background: "var(--ok-bg)", color: "#1B5E20" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)", display: "inline-block" }} />
                Positivas: {counts.info}
              </span>
            )}
          </div>
        </div>
        <button
          className="btn"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          style={{ padding: "6px 10px", fontSize: 12, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          {open ? "Ocultar" : "Ver detalle"}
          {open ? <ChevronUp size={14} strokeWidth={2.4} /> : <ChevronDown size={14} strokeWidth={2.4} />}
        </button>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="stagger-children" style={{ display: "flex", flexDirection: "column" }}>
          {alerts.map((alert) => {
            const s = severityStyles[alert.severity] || severityStyles.info;
            // Los iconos de lucide-react son objetos forwardRef ({$$typeof,
            // render}), no funciones planas. Aceptamos función u objeto como
            // componente renderizable; solo string/emoji cae al <span>.
            const AlertIcon =
              alert.icon &&
              (typeof alert.icon === "function" || typeof alert.icon === "object")
                ? alert.icon
                : null;
            return (
              <div
                key={alert.id}
                style={{
                  padding: "12px 18px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex", gap: 12, alignItems: "flex-start",
                  borderLeft: `3px solid ${s.border}`,
                  background: s.bg,
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: "rgba(255,255,255,0.7)", color: s.color,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {AlertIcon
                    ? <AlertIcon size={18} strokeWidth={2.2} />
                    : <span style={{ fontSize: 16 }}>{alert.icon}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: s.color, marginBottom: 2 }}>
                    {alert.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
                    {alert.message}
                  </div>
                  {alert.students && alert.students.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {alert.students.map((st) => (
                        <button
                          key={st.id}
                          onClick={() => onStudentClick(st.id)}
                          className="chip"
                          style={{ fontSize: 10, padding: "3px 8px" }}
                        >
                          {(st.name || "").split(" ").slice(0, 2).join(" ")}
                        </button>
                      ))}
                      {alert.totalCount > alert.students.length && (
                        <span style={{ fontSize: 10, color: "var(--muted)", alignSelf: "center" }}>
                          +{alert.totalCount - alert.students.length} más
                        </span>
                      )}
                    </div>
                  )}
                  {/* Backend "Radar docente" alerts: KPIs inline */}
                  {alert.kpis && Object.keys(alert.kpis).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {Object.entries(alert.kpis).map(([k, v]) => (
                        <span
                          key={k}
                          style={{
                            fontSize: 10,
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            padding: "2px 6px",
                            fontFamily: "var(--font-mono)",
                            color: "var(--muted)",
                          }}
                        >
                          {k}: <strong style={{ color: "var(--text)" }}>
                            {typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : String(v)}
                          </strong>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Items list (e.g., ítems sin RA) */}
                  {alert.items && alert.items.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                      {alert.items.slice(0, 5).map((it, idx) => (
                        <div key={idx}>• {it.name || it.title || String(it)}</div>
                      ))}
                      {alert.items.length > 5 && (
                        <div style={{ fontStyle: "italic" }}>+{alert.items.length - 5} más</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default React.memo(SmartAlerts);
