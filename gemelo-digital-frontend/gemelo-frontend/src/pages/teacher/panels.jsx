// Paneles y bloques del dashboard docente (extraído de TeacherDashboard.jsx, #15).
import React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import StudentAvatar from "../../components/ui/StudentAvatar";
import SharedCesaLoader from "../../components/ui/CesaLoader";
import { apiUrl } from "../../utils/api";
import { normStatus, fmtPct, fmtGrade10FromPct, computeRiskFromPct } from "../../utils/helpers";
import { COLORS, colorForPct } from "../../utils/colors";
import { isStudentRole } from "../../utils/roles";
import { StatusBadge, CircularRing, Card, Stat, InfoTooltip } from "./primitives";
export function LoginScreen({ orgUnitId }) {
  const loginUrl = apiUrl(
    orgUnitId && orgUnitId > 0
      ? `/auth/brightspace/login?org_unit_id=${orgUnitId}`
      : "/auth/brightspace/login"
  );

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font)", padding: 20,
    }}>
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "40px 48px",
        textAlign: "center", maxWidth: 440, width: "100%",
        boxShadow: "var(--shadow-lg)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 13,
            background: "var(--brand)", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 15, fontWeight: 900, letterSpacing: "-0.03em",
          }}>CESA</div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em" }}>
              Visor de desempeño estudiantil
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Vista Docente · 2026.8.7
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border)", margin: "0 0 28px" }} />

        {/* Heading */}
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
          Bienvenido
        </h2>
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 28px" }}>
          Para acceder a tu tablero, inicia sesión con tu cuenta CESA de Brightspace.
          Serás redirigido a Microsoft para autenticarte.
        </p>

        {/* CTA Button */}
        <a
          href={loginUrl}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "13px 20px",
            background: "var(--brand)", color: "#fff",
            borderRadius: 12, textDecoration: "none",
            fontSize: 14, fontWeight: 800,
            boxShadow: "0 4px 16px rgba(11,95,255,0.3)",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          {/* Microsoft logo simplified */}
          <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
            <rect x="0"  y="0"  width="10" height="10" fill="#F25022"/>
            <rect x="11" y="0"  width="10" height="10" fill="#7FBA00"/>
            <rect x="0"  y="11" width="10" height="10" fill="#00A4EF"/>
            <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
          </svg>
          Iniciar sesión con Microsoft
        </a>

        {/* Info */}
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 18, lineHeight: 1.5 }}>
          Solo los instructores con cursos activos en Brightspace pueden acceder.
          Si tienes problemas, contacta a soporte CESA.
        </p>

        {/* From LTI note */}
        <div style={{
          marginTop: 20, padding: "10px 14px", borderRadius: 10,
          background: "var(--brand-light)", border: "1px solid var(--brand-light2)",
        }}>
          <p style={{ fontSize: 11, color: "var(--brand)", fontWeight: 700, margin: 0 }}>
            💡 También puedes acceder directamente desde tu curso en Brightspace
            usando el enlace de la herramiental Visor de desempeño estudiantil.
          </p>
        </div>
      </div>
    </div>
  );
}

// Loader unificado — delega en el componente compartido CesaLoader
export function CesaLoader({ title = "Visor de desempeño estudiantil", subtitle = "Cargando tablero" }) {
  return (
    <SharedCesaLoader
      title={title}
      subtitle={subtitle}
      footer="Conectando con Brightspace y consolidando evidencias académicas…"
    />
  );
}

// Lista compacta de asignaciones sin RA — usada dentro del AlertsPanel
export function UnlinkedItemsList({ items }) {
  const [open, setOpen] = React.useState(false);
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button
        className="btn"
        style={{ fontSize: 11, padding: "4px 10px", gap: 5 }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        {open ? "▴" : "▾"} Ver actividades sin RA ({list.length})
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {list.map((it, i) => (
            <div
              key={it.gradeObjectId ?? i}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg)",
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.name || `Ítem ${it.gradeObjectId}`}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                {it.weightPct != null && (
                  <span className="tag" style={{ background: "var(--watch-bg)", color: "#9A3412", fontSize: 10 }}>
                    {Number(it.weightPct).toFixed(1)}% peso
                  </span>
                )}
                <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  sin RA
                </span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted)", padding: "4px 2px", fontStyle: "italic" }}>
            💡 Vincula estas actividades a una rúbrica con RA en Brightspace para incluirlas en el análisis de competencias.
          </div>
        </div>
      )}
    </div>
  );
}

export function AlertsPanel({ alerts }) {
  const list = Array.isArray(alerts) ? alerts : [];
  const [open, setOpen] = React.useState(false);
  if (!list.length) return null;

  const sevRank = (s) => {
    const x = normStatus(s);
    if (x === "critico") return 0;
    if (x === "en desarrollo" || x === "en seguimiento" || x === "observacion") return 1;
    return 2;
  };

  const sorted = list.slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const countBySev = (sev) => sorted.filter((x) => normStatus(x.severity) === sev).length;
  const cCrit = countBySev("critico");
  const cObs = sorted.filter((x) => ["en desarrollo", "en seguimiento", "observacion"].includes(normStatus(x.severity))).length;
  const cSol = countBySev("solido");

  return (
    <Card>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🔭</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Radar docente</span>
            <span className="tag">{sorted.length}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {cCrit > 0 && (
              <span className="badge" style={{ background: "var(--critical-bg)", color: "#B42318" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.critical, display: "inline-block" }} />
                Críticos: {cCrit}
              </span>
            )}
            {cObs > 0 && (
              <span className="badge" style={{ background: "var(--watch-bg)", color: "#9A3412" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.watch, display: "inline-block" }} />
                Seguimiento: {cObs}
              </span>
            )}
            {cSol > 0 && (
              <span className="badge" style={{ background: "var(--ok-bg)", color: "#1B5E20" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.ok, display: "inline-block" }} />
                Óptimos: {cSol}
              </span>
            )}
          </div>
        </div>
        <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }}>
          {open ? "Ocultar ▴" : "Ver ▾"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((a, i) => (
            <div
              key={a.id || `${a.title || "alerta"}-${i}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 14,
                background: "var(--card)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 13 }}>{a.title || "Alerta"}</div>
                <StatusBadge status={a.severity} />
              </div>
              {a.message && <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{a.message}</div>}
              {a.kpis && Object.keys(a.kpis).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                  {Object.entries(a.kpis).map(([k, v]) => (
                    <span
                      key={k}
                      style={{
                        fontSize: 11,
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--muted)",
                      }}
                    >
                      {k}: <strong style={{ color: "var(--text)" }}>{typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : String(v)}</strong>
                    </span>
                  ))}
                </div>
              )}
              {/* Items sin RA — lista expandible */}
              {Array.isArray(a.items) && a.items.length > 0 && (
                <UnlinkedItemsList items={a.items} />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function Drawer({ open, onClose, title, subtitle, extraHeader, children }) {
  React.useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Add a class to <body> when drawer is open so the @media print CSS
  // can hide the background dashboard and only print the drawer content.
  React.useEffect(() => {
    if (!open) return;
    document.body.classList.add("drawer-is-open");
    return () => document.body.classList.remove("drawer-is-open");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="drawer-print-mode"
      style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.5)", display: "flex", justifyContent: "flex-end", zIndex: 200, backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="drawer-enter"
        style={{ width: "min(700px, 97vw)", height: "100%", background: "var(--card)", overflow: "auto", borderLeft: "1px solid var(--border)", color: "var(--text)", display: "flex", flexDirection: "column", gap: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 20px" }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 14, paddingBottom: 6 }}>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--muted)", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
              ← Estudiantes
            </button>
            <span style={{ color: "var(--border2)", fontSize: 11 }}>›</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)" }}>Expediente académico</span>
          </div>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>{title}</div>
              {subtitle && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, fontWeight: 500 }}>{subtitle}</div>}
              {extraHeader && <div style={{ marginTop: 6 }}>{extraHeader}</div>}
            </div>
            <button className="btn" onClick={onClose} style={{ flexShrink: 0, marginTop: 2 }}>✕ Cerrar</button>
          </div>
        </div>
        {/* Content */}
        <div style={{ padding: "16px 20px 28px", flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ProjectionBlock({ projection, thresholds }) {
  if (!projection || !Array.isArray(projection.scenarios) || !projection.scenarios.length) return null;

  if (projection.isFinal) {
    return (
      <Card title="Proyección final" right={<span className="tag">Cobertura 100%</span>}>
        <Stat label="Nota final" value={fmtGrade10FromPct(projection.finalPct)} valueColor={colorForPct(projection.finalPct, thresholds)} />
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          La cobertura del 100% indica que esta es la nota definitiva del curso.
        </div>
      </Card>
    );
  }

  const scenarioMeta = {
    risk: { label: "Escenario riesgo", sub: "si el resto baja", cls: "scenario-risk", icon: "📉" },
    base: { label: "Escenario base", sub: "desempeño actual", cls: "scenario-base", icon: "📊" },
    improve: { label: "Escenario mejora", sub: "si el resto sube", cls: "scenario-improve", icon: "📈" },
  };

  return (
    <Card title="Proyección de nota final" right={<span className="tag">{fmtPct(projection.coveragePct)} calificado</span>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {projection.scenarios.map((s) => {
          const meta = scenarioMeta[s.id] || { label: s.id, sub: "", cls: "scenario-base", icon: "📊" };
          return (
            <div key={s.id} className={`scenario-card ${meta.cls}`}>
              <div style={{ fontSize: 18 }}>{meta.icon}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{meta.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", color: colorForPct(s.projectedFinalPct, thresholds) }}>
                {fmtGrade10FromPct(s.projectedFinalPct)}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {meta.sub} · asume {fmtPct(s.assumptionPendingPct)} pendiente
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Notificación de ítems sin RA vinculado
export function NoRaMappingNotice({ evidences, units }) {
  // Evidences with grades but whose gradeObjectId doesn't appear in any unit's evidence list
  const gradedEvIds = new Set(
    (Array.isArray(evidences) ? evidences : [])
      .filter((e) => e.scorePct != null)
      .map((e) => String(e.gradeObjectId))
  );

  // Collect all gradeObjectIds that ARE linked to a RA unit
  const linkedIds = new Set();
  for (const u of (Array.isArray(units) ? units : [])) {
    for (const ev of (u.evidence || [])) {
      if (ev.folderId != null) linkedIds.add(String(ev.folderId));
    }
  }

  // Items with grade but no RA link
  const unlinked = (Array.isArray(evidences) ? evidences : []).filter(
    (e) => e.scorePct != null && !linkedIds.has(String(e.gradeObjectId))
  );

  if (!unlinked.length) return null;

  const [open, setOpen] = React.useState(false);

  return (
    <div style={{
      marginTop: 8,
      border: "1px solid var(--watch-bg)",
      borderColor: "#FED7AA",
      borderRadius: 10,
      background: "var(--watch-bg)",
      overflow: "hidden",
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", cursor: "pointer", userSelect: "none", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#9A3412" }}>
              {unlinked.length} asignación{unlinked.length !== 1 ? "es" : ""} calificada{unlinked.length !== 1 ? "s" : ""} sin Resultado de Aprendizaje
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              Estas evidencias tienen nota pero no están vinculadas a ningún RA en la rúbrica
            </div>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #FED7AA", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {unlinked.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "var(--card)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.name || `Ítem ${e.gradeObjectId}`}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                <span className="tag" style={{ background: "var(--watch-bg)", color: "#9A3412" }}>
                  {fmtPct(e.weightPct)} peso
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: colorForPct(e.scorePct, null) }}>
                  {e.scorePct != null ? (e.scorePct / 10).toFixed(1) : "—"}
                </span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted)", padding: "4px 2px" }}>
            💡 Para que aparezcan en el análisis de RA, vincula estas asignaciones a una rúbrica con criterios mapeados en Brightspace.
          </div>
        </div>
      )}
    </div>
  );
}

export function QualityFlagsBlock({ flags }) {
  const list = Array.isArray(flags) ? flags.filter((f) => f?.type) : [];
  const [open, setOpen] = React.useState(false);
  if (!list.length) return null;

  const relevant = list.filter((f) => f.type !== "role_not_enabled");
  if (!relevant.length) return null;

  return (
    <Card title={null}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔍</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Flags de calidad del modelo</span>
          <span className="tag" style={{ background: "var(--watch-bg)", color: "var(--watch)" }}>
            {relevant.length}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {relevant.map((f, i) => (
            <div key={i} className="qc-flag">
              <strong>{f.type}</strong>
              {f.message && <span style={{ marginLeft: 8, opacity: 0.8 }}>— {f.message}</span>}
              {f.rubricId && <span style={{ marginLeft: 8, opacity: 0.6 }}>rubric:{f.rubricId}</span>}
              {f.unitCode && <span style={{ marginLeft: 8, opacity: 0.6 }}>unit:{f.unitCode}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function PendingItemsBlock({ pendingItems, missingValues }) {
  const items = Array.isArray(pendingItems) ? pendingItems : [];
  const missing = Array.isArray(missingValues) ? missingValues : [];
  if (!items.length && !missing.length) return null;

  const [open, setOpen] = React.useState(false);
  const topPending = items.slice(0, 5);

  return (
    <Card title={null}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Evidencias pendientes</span>
          <span className="tag">{items.length + missing.length}</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{open ? "▴" : "▾"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {topPending.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Sin calificar (por peso)
              </div>
              {topPending.map((it, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", flex: 1, minWidth: 0 }}>
                    {it.name || `Ítem ${it.gradeObjectId}`}
                  </div>
                  <span className="tag" style={{ background: "var(--watch-bg)", color: "#9A3412", flexShrink: 0 }}>
                    {fmtPct(it.weightPct)} peso
                  </span>
                </div>
              ))}
              {items.length > 5 && <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "4px 0" }}>+ {items.length - 5} más</div>}
            </div>
          )}
          {missing.length > 0 && (
            <div style={{ marginTop: items.length > 0 ? 12 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                No liberados en gradebook ({missing.length})
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Ítems sin valor visible para el estudiante. Revisar configuración de visibilidad.</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function EvidencesTimeline({ evidences, thresholds }) {
  const list = Array.isArray(evidences) ? evidences.filter((e) => e.scorePct !== null && e.scorePct !== undefined) : [];
  if (!list.length) return null;
  const [open, setOpen] = React.useState(false);

  const chartData = list.map((e) => ({
    name: (e.name || "").slice(0, 20),
    pct: Number(e.scorePct ?? 0),
  }));

  return (
    <Card title={null}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📋</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Historial de evidencias</span>
          <span className="tag">{list.length} calificadas</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{open ? "▴" : "▾"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div
            role="img"
            aria-label="Gráfico de evolución del desempeño del estudiante"
            style={{ width: "100%", height: 160 }}
          >
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Desempeño"]} />
                <ReferenceLine y={Number(thresholds?.watch || 70)} stroke={COLORS.watch} strokeDasharray="4 4" label={{ value: "70%", fill: COLORS.watch, fontSize: 10 }} />
                <ReferenceLine y={Number(thresholds?.critical || 50)} stroke={COLORS.critical} strokeDasharray="4 4" label={{ value: "50%", fill: COLORS.critical, fontSize: 10 }} />
                <Line type="monotone" dataKey="pct" stroke={COLORS.brand} strokeWidth={2} dot={{ fill: COLORS.brand, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// CoursePanel — lista de cursos del docente
// ─────────────────────────────────────────────────────────
export function CoursePanel({ courses, loadingCourses, currentId, onSelect, onClose }) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        String(c.name || "").toLowerCase().includes(q) ||
        String(c.code || "").toLowerCase().includes(q)
    );
  }, [courses, search]);

  // Separate by role first, then by active state
  const instructorCourses = filtered.filter(c => !isStudentRole(c.roleName));
  const studentCourses = filtered.filter(c => isStudentRole(c.roleName));

  const renderSection = (title, list, color, icon) => {
    if (list.length === 0) return null;
    const active = list.filter(c => c.isActive !== false);
    const inactive = list.filter(c => c.isActive === false);
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{
          padding: "10px 16px 6px",
          display: "flex", alignItems: "center", gap: 8,
          borderTop: "1px solid var(--border)",
        }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {title}
          </span>
          <span className="tag" style={{ background: color + "1A", color: color, marginLeft: "auto" }}>{list.length}</span>
        </div>
        {active.length > 0 && (
          <>
            {active.map((c) => (
              <CourseItem key={c.id} course={c} isActive={true} isCurrent={c.id === currentId} onSelect={onSelect} accent={color} />
            ))}
          </>
        )}
        {inactive.length > 0 && (
          <>
            <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Históricos
            </div>
            {inactive.map((c) => (
              <CourseItem key={c.id} course={c} isActive={false} isCurrent={c.id === currentId} onSelect={onSelect} accent={color} />
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="course-panel-overlay" onClick={onClose}>
      <div className="course-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Mis cursos</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {loadingCourses
                ? "Cargando…"
                : `${instructorCourses.length} como profesor · ${studentCourses.length} como estudiante`}
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ padding: "6px 12px", fontSize: 12 }}>
            ✕ Cerrar
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código…"
            type="text"
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 10, padding: "8px 12px",
              fontWeight: 600, background: "var(--bg)",
              color: "var(--text)", fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingCourses ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              <div className="pulse-dot" style={{ background: "var(--brand)", width: 10, height: 10, margin: "0 auto 12px" }} />
              Consultando Brightspace…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              Sin resultados para "{search}"
            </div>
          ) : (
            <>
              {renderSection("Como Profesor", instructorCourses, "var(--brand)", "📊")}
              {renderSection("Como Estudiante", studentCourses, "var(--ok)", "🎓")}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function CourseItem({ course, isActive, isCurrent, onSelect, accent }) {
  const startYear = course.startDate ? new Date(course.startDate).getFullYear() : null;
  const endYear   = course.endDate   ? new Date(course.endDate).getFullYear()   : null;
  const period = startYear && endYear && startYear !== endYear
    ? `${startYear}–${endYear}` : startYear ? String(startYear) : null;

  const isStudent = isStudentRole(course.roleName);
  const accentColor = accent || (isStudent ? "var(--ok)" : "var(--brand)");

  const handleClick = () => {
    if (isStudent) {
      // Student courses redirect to the student portal
      sessionStorage.setItem("gemelo_pending_org", String(course.id));
      window.location.href = window.location.origin + "/portal";
    } else {
      onSelect(course.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`course-item${isCurrent ? " active" : ""}`}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      style={isCurrent ? { borderLeft: `3px solid ${accentColor}` } : undefined}
    >
      <div
        className="course-item-dot"
        style={{ background: isActive ? accentColor : "var(--muted)" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {course.name || `Curso ${course.id}`}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
          {course.code && (
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)", fontWeight: 600 }}>
              {course.code}
            </span>
          )}
          {period && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{period}</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        {isCurrent && (
          <span className="tag" style={{ fontSize: 10, padding: "2px 6px", background: accentColor + "1A", color: accentColor }}>Activo</span>
        )}
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
          {course.id}
        </span>
      </div>
    </div>
  );
}

export function StudentCard({ s, onOpen, weakestMacro }) {
  const gradeColor = colorForPct(s.currentPerformancePct, null);
  const covColor   = colorForPct(s.coveragePct, null);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(s)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(s); }}
      className="kpi-card fade-up"
      style={{ cursor: "pointer", borderRadius: 16, padding: "14px 14px 12px" }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {/* Avatar */}
        <StudentAvatar userId={s.userId} name={s.displayName} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.displayName}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 1 }}>ID {s.userId}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <StatusBadge status={s.isLoading ? "cargando" : s.risk} />
          {s.hasPrescription && <span className="tag" style={{ fontSize: 9 }}>📋 Plan activo</span>}
        </div>
      </div>

      {/* Rings + stats row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <CircularRing pct={s.currentPerformancePct ?? 0} size={56} stroke={5} color={gradeColor} label={fmtGrade10FromPct(s.currentPerformancePct)} fontSize={11} />
        <CircularRing pct={s.coveragePct ?? 0} size={56} stroke={5} color={covColor} label={fmtPct(s.coveragePct)} fontSize={10} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>NOTA · COBERTURA</div>
          {(s.mostCriticalMacro || weakestMacro) && (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              RA crítico: <span style={{ fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                {s.mostCriticalMacro?.code ?? weakestMacro?.code}{!s.mostCriticalMacro && <span style={{ fontSize: 9, opacity: 0.5 }}>~</span>}
              </span>
            </div>
          )}
          {s.route?.title && (
            <div style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.route.title}</div>
          )}
        </div>
      </div>

      <button
        className="btn"
        style={{ width: "100%", fontSize: 12, padding: "7px 0", borderRadius: 10, textAlign: "center" }}
        onClick={(e) => { e.stopPropagation(); onOpen(s); }}
      >
        Ver gemelo digital →
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────

// CoursePanorama removed — cards moved inline

// ─────────────────────────────────────────────────────────────────────────────
// GradeDistributionCard — Barra de distribución de notas (inline en dashboard)
// ─────────────────────────────────────────────────────────────────────────────
export function GradeDistributionCard({ studentRows, thresholds, style }) {
  const rows = Array.isArray(studentRows) ? studentRows : [];
  const withGrades = rows.filter(s => s.currentPerformancePct != null);
  const bands = [
    { label: "9–10", color: "#12B76A", min: 9,   max: 10 },
    { label: "8–9",  color: "#32D583", min: 8,   max: 9  },
    { label: "7–8",  color: "#6CE9A6", min: 7,   max: 8  },
    { label: "6–7",  color: "#FCD385", min: 6,   max: 7  },
    { label: "5–6",  color: "#F79009", min: 5,   max: 6  },
    { label: "<5",   color: "#D92D20", min: 0,   max: 5  },
  ].map(b => ({
    ...b,
    count: withGrades.filter(s => {
      const g = s.currentPerformancePct / 10;
      return b.min === 0 ? g < 5 : g >= b.min && g < b.max;
    }).length,
  }));
  const maxBand = Math.max(...bands.map(b => b.count), 1);
  const bajos  = rows.filter(s => computeRiskFromPct(s.currentPerformancePct) === "bajo");
  const medios = rows.filter(s => computeRiskFromPct(s.currentPerformancePct) === "medio");
  const altos  = rows.filter(s => computeRiskFromPct(s.currentPerformancePct) === "alto");
  const zeros  = rows.filter(s => s.currentPerformancePct == null);

  return (
    <Card style={style} title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>📊 Distribución de calificaciones <InfoTooltip text="Histograma de calificaciones de los estudiantes en rangos de 1 punto. Los colores reflejan el estado: rojo=crítico (<5), amarillo=seguimiento (5-7), verde=óptimo (≥7). Excluye columnas 'Corte' para evitar doble conteo." /></span>} accent="brand">
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {bands.map(b => (
          <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--muted)", width: 30, flexShrink: 0 }}>{b.label}</span>
            <div style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--bg)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${b.count ? Math.max(8, Math.round((b.count / maxBand) * 100)) : 0}%`, background: b.color, borderRadius: 5, transition: "width 0.7s cubic-bezier(.4,0,.2,1)" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "var(--font-mono)", color: b.count ? b.color : "var(--muted)", width: 20, textAlign: "right", flexShrink: 0 }}>{b.count}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-around" }}>
        {[
          { label: "OK",       count: bajos.length,  color: "var(--ok)"       },
          { label: "Medio",    count: medios.length,  color: "var(--watch)"    },
          { label: "Alto",     count: altos.length,   color: "var(--critical)" },
          { label: "Sin nota", count: zeros.length,   color: "var(--muted)"    },
        ].map(r => (
          <div key={r.label} style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontFamily: "var(--font-mono)", color: r.color, fontSize: 20, lineHeight: 1 }}>{r.count}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, marginTop: 3 }}>{r.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// AppSidebar — Fixed left navigation
// ──────────────────────────────────────────────
