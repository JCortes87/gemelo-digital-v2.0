import React from "react";
import { colorForPct } from "../../utils/colors";
import { fmtPct, fmtGrade10FromPct } from "../../utils/helpers";

const ROUTE_DEFS = {
  route_coverage: {
    id: "route_coverage",
    num: 0,
    title: "Ruta 0 — Activar evidencia",
    color: "var(--critical)",
    bg: "var(--critical-bg)",
    border: "var(--critical-border)",
    icon: "📋",
    description: "El estudiante tiene muy poca cobertura de evaluación. La prioridad es identificar evidencias sin calificar y activarlas antes de que el semestre avance.",
    objective: "Subir cobertura por encima del 40% en los próximos 7 días.",
    actions: [
      "Identificar 1 evidencia crítica sin nota y publicarla esta semana",
      "Acordar fecha concreta de entrega con el estudiante",
      "Verificar que el estudiante tenga acceso al material del curso",
    ],
    success: "Cobertura superior al 40% confirmada en gradebook.",
  },
  route_high_risk: {
    id: "route_high_risk",
    num: 1,
    title: "Ruta 1 — Recuperación",
    color: "var(--watch)",
    bg: "var(--watch-bg)",
    border: "var(--watch-border)",
    icon: "🚨",
    description: "El estudiante está en riesgo alto. Su nota actual está por debajo del umbral crítico. Se requiere intervención inmediata con plan estructurado de corto plazo.",
    objective: "Subir nota por encima del umbral crítico en 2 semanas.",
    actions: [
      "Reunión 1:1 de 15 minutos para acordar objetivo semanal",
      "Actividad de refuerzo o re-entrega enfocada en el error principal",
      "Retroalimentación concreta + checklist de mejora",
    ],
    success: "Nota supera el umbral crítico en la siguiente evidencia.",
  },
  route_watch: {
    id: "route_watch",
    num: 2,
    title: "Ruta 2 — Ajuste dirigido",
    color: "var(--brand)",
    bg: "var(--brand-light)",
    border: "var(--brand-light2, #D6E4FF)",
    icon: "🎯",
    description: "El estudiante está en riesgo medio. Su desempeño es insuficiente en algún resultado de aprendizaje específico. El ajuste debe ser puntual y enfocado.",
    objective: "Subir el RA crítico por encima del umbral de observación.",
    actions: [
      "Microtarea guiada (30–45 min) sobre el punto débil identificado",
      "Ejemplo resuelto + plantilla de entrega para orientar al estudiante",
      "Seguimiento en la próxima evidencia del RA crítico",
    ],
    success: "RA crítico supera el 70% en la siguiente evaluación.",
  },
  route_ok: {
    id: "route_ok",
    num: 3,
    title: "Ruta 3 — Mantener desempeño",
    color: "var(--ok)",
    bg: "var(--ok-bg)",
    border: "var(--ok-border)",
    icon: "✅",
    description: "El estudiante tiene buen desempeño. La gestión aquí es de sostenimiento y motivación para que mantenga el ritmo hasta el cierre del semestre.",
    objective: "Sostener nota por encima del umbral de observación.",
    actions: [
      "Reconocer el logro con retroalimentación positiva específica",
      "Mantener entregas a tiempo para no perder cobertura",
      "Extensión opcional: reto avanzado para profundizar competencias",
    ],
    success: "Nota se mantiene por encima del umbral de observación al cierre.",
  },
};

export default function RoutesView({ studentRows, courseInfo, thresholds, onSelectStudent, isMobile }) {
  const [selectedRoute, setSelectedRoute] = React.useState(null);
  const rows = Array.isArray(studentRows) ? studentRows : [];

  const byRoute = {};
  Object.keys(ROUTE_DEFS).forEach(id => { byRoute[id] = []; });
  rows.forEach(s => {
    const rid = s.route?.id;
    if (rid && byRoute[rid]) byRoute[rid].push(s);
  });

  const totalAssigned = Object.values(byRoute).reduce((a, arr) => a + arr.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Page header */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          G.D · Rutas de atención
        </div>
        <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {courseInfo?.Name || "Curso activo"}
        </h1>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontWeight: 500 }}>
          {totalAssigned} estudiantes asignados · {Object.values(byRoute).filter(arr => arr.length > 0).length} rutas activas
        </div>
      </div>

      {/* Route cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        {Object.values(ROUTE_DEFS).map(route => {
          const students = byRoute[route.id] || [];
          const isSelected = selectedRoute === route.id;
          return (
            <div key={route.id}
              onClick={() => setSelectedRoute(isSelected ? null : route.id)}
              style={{
                border: `1.5px solid ${isSelected ? route.color : "var(--border)"}`,
                borderRadius: 16,
                background: isSelected ? route.bg : "var(--card)",
                cursor: "pointer",
                transition: "all 0.18s ease",
                overflow: "hidden",
              }}
              onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = route.color; e.currentTarget.style.background = route.bg; }}}
              onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; }}}
            >
              {/* Route header */}
              <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: route.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {route.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: route.color }}>{route.title}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginTop: 1 }}>{route.objective}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--font-mono)", color: route.color, lineHeight: 1 }}>{students.length}</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>est.</div>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>{route.description}</p>
              </div>

              {/* Actions */}
              <div style={{ padding: "10px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7 }}>Acciones docentes</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {route.actions.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: route.color, flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                      <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.45 }}>{a}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8, background: route.color + "14", fontSize: 11, color: route.color, fontWeight: 700 }}>
                  Criterio de éxito: {route.success}
                </div>
              </div>

              {/* Student list (when selected) */}
              {isSelected && students.length > 0 && (
                <div style={{ padding: "0 16px 14px" }}>
                  <div style={{ height: 1, background: "var(--border)", marginBottom: 10 }} />
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7 }}>
                    Estudiantes en esta ruta ({students.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {students.map(s => (
                      <div key={s.userId}
                        onClick={e => { e.stopPropagation(); onSelectStudent?.(s); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 9, background: "var(--card)", border: "1px solid var(--border)", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = route.color}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: route.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: route.color, flexShrink: 0 }}>
                          {(s.displayName || "?").charAt(0)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.displayName}</div>
                          {s.route?.summary && <div style={{ fontSize: 10, color: "var(--muted)" }}>{s.route.summary}</div>}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 900, fontFamily: "var(--font-mono)", color: colorForPct(s.currentPerformancePct, thresholds) }}>{fmtGrade10FromPct(s.currentPerformancePct)}</div>
                          <div style={{ fontSize: 9, color: "var(--muted)" }}>{fmtPct(s.coveragePct)}</div>
                        </div>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>→</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isSelected && students.length === 0 && (
                <div style={{ padding: "10px 16px 14px", fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                  Ningún estudiante asignado a esta ruta actualmente.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
