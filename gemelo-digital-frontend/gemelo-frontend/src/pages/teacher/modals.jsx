// Modal de reporte de bugs y botón flotante de IA (extraído de TeacherDashboard.jsx, #15).
import React from "react";
import { apiGet, apiPost } from "../../utils/api";
import { AnnouncementsModal } from "./onboarding";
export const BUG_REPORT_EMAIL = "desarrolloprofesoral@cesa.edu.co";

export function BugReportModal({ onClose }) {
  const [title, setTitle] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [severity, setSeverity] = React.useState("media");
  const [sent, setSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [delivered, setDelivered] = React.useState(false); // true si el backend lo envió por correo
  const [copied, setCopied] = React.useState(false);

  const SEVERITIES = [
    { value: "baja", label: "Baja — algo menor" },
    { value: "media", label: "Media — molesta pero puedo seguir" },
    { value: "alta", label: "Alta — no puedo continuar" },
  ];

  const contextObj = () => ({
    url: window.location.href,
    fecha: new Date().toLocaleString("es-CO"),
    navegador: navigator.userAgent,
    pantalla: `${window.innerWidth}x${window.innerHeight}`,
  });

  const buildContext = () =>
    Object.entries(contextObj()).map(([k, v]) => `${k}: ${v}`).join("\n");

  const buildBody = () =>
    `Descripción del error:\n${desc.trim()}\n\nSeveridad: ${severity.toUpperCase()}\n\n──────────\nContexto técnico (no borrar):\n${buildContext()}`;

  const canSend = desc.trim().length > 0 && !sending;

  // Intenta enviar por el backend (SMTP). Si el backend no tiene SMTP
  // configurado o falla, cae a abrir el cliente de correo con mailto.
  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    const subject = `[Visor de desempeño estudiantil - Bug] ${title.trim() || "Reporte de error"}`;
    try {
      const res = await apiPost("/gemelo/bug-report", {
        title: title.trim(),
        description: desc.trim(),
        severity,
        context: contextObj(),
      });
      if (res?.delivered) {
        setDelivered(true);
        setSent(true);
        return;
      }
      // backend recibió el reporte pero SMTP no está configurado → mailto
      const mailto = `mailto:${BUG_REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildBody())}`;
      window.location.href = mailto;
      setSent(true);
    } catch {
      // backend no disponible → mailto
      const mailto = `mailto:${BUG_REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildBody())}`;
      window.location.href = mailto;
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `Para: ${BUG_REPORT_EMAIL}\nAsunto: [Visor de desempeño estudiantil - Bug] ${title.trim() || "Reporte de error"}\n\n${buildBody()}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const inputStyle = {
    padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)",
    background: "var(--bg)", color: "var(--text)", fontSize: 13,
    fontFamily: "var(--font)", outline: "none", width: "100%", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, display: "block" };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font)", padding: 20, backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--card)", borderRadius: 20,
        padding: "32px 34px", maxWidth: 500, width: "100%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)", position: "relative",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)", padding: 4, lineHeight: 1 }}
        >✕</button>

        {!sent ? (
          <>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                🐞 Reportar un error · Visor de desempeño estudiantil
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: "0 0 20px" }}>
              Cuéntanos qué salió mal. El reporte llega al administrador ({BUG_REPORT_EMAIL}) con el contexto técnico para poder resolverlo pronto.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Título breve (opcional)</label>
              <input
                type="text" value={title} maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: No cargan las calificaciones del curso"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>¿Qué pasó? *</label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Describe el error: qué hacías, qué esperabas y qué ocurrió."
                rows={5}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>Severidad</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleCopy}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", fontSize: 12, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
              >
                {copied ? "✓ Copiado" : "📋 Copiar reporte"}
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                style={{
                  flex: 2, padding: "11px 0", borderRadius: 10, border: "none",
                  background: canSend ? "var(--brand)" : "var(--border)",
                  color: canSend ? "#fff" : "var(--muted)",
                  fontSize: 13, fontWeight: 800, cursor: canSend ? "pointer" : "not-allowed",
                  boxShadow: canSend ? "0 4px 14px rgba(11,95,255,0.3)" : "none",
                }}
              >
                {sending ? "Enviando…" : "📨 Enviar reporte"}
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", margin: "0 0 10px" }}>
              ¡Gracias por reportarlo!
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 22px" }}>
              {delivered
                ? <>Tu reporte fue enviado al administrador (<strong>{BUG_REPORT_EMAIL}</strong>). ¡Gracias por ayudarnos a mejorar!</>
                : <>Se abrió tu correo con el reporte listo para <strong>{BUG_REPORT_EMAIL}</strong>. Si no se abrió, usa "Copiar reporte" y envíalo manualmente a esa dirección.</>}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleCopy}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", fontSize: 12, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
              >
                {copied ? "✓ Copiado" : "📋 Copiar reporte"}
              </button>
              <button
                onClick={onClose}
                style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// FloatingAI — Help menu (tutorial + updates + AI assistant)
// ──────────────────────────────────────────────
export function FloatingAI({ onOpenTutorial, onOpenAssistant }) {
  const [open, setOpen] = React.useState(false);
  const [showUpdates, setShowUpdates] = React.useState(false);
  const [showBugReport, setShowBugReport] = React.useState(false);
  const [annCount, setAnnCount] = React.useState(0);

  // Contador de novedades para el badge del menú de ayuda.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiGet("/gemelo/announcements?limit=50");
        if (alive) setAnnCount(Array.isArray(data?.items) ? data.items.length : 0);
      } catch { /* silencioso: si falla, no mostramos badge */ }
    })();
    return () => { alive = false; };
  }, []);

  const menuItems = [
    {
      icon: "📖",
      title: "Tutorial",
      desc: "Guía paso a paso de la plataforma",
      onClick: () => { setOpen(false); onOpenTutorial?.(); },
    },
    {
      icon: "🆕",
      title: "Novedades",
      desc: annCount > 0 ? `${annCount} anuncio${annCount === 1 ? "" : "s"} del administrador` : "Anuncios y actualizaciones",
      badge: annCount > 0 ? annCount : null,
      onClick: () => { setOpen(false); setShowUpdates(true); },
    },
    {
      icon: "🤖",
      title: "Asistente IA",
      desc: "Consultas en lenguaje natural",
      onClick: () => { setOpen(false); onOpenAssistant?.(); },
    },
    {
      icon: "🐞",
      title: "Reportar un error",
      desc: "Envía un bug al administrador",
      onClick: () => { setOpen(false); setShowBugReport(true); },
    },
  ];

  return (
    <>
      {showUpdates && <AnnouncementsModal onClose={() => setShowUpdates(false)} />}
      {showBugReport && <BugReportModal onClose={() => setShowBugReport(false)} />}
      <div className="ai-fab">
        {open && (
          <div className="ai-fab-panel" style={{ width: 250, maxHeight: "none" }}>
            <div className="ai-fab-panel-header" style={{ padding: "10px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 14 }}>❓</span>
                <span style={{ fontSize: 12, fontWeight: 800 }}>Centro de ayuda</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
              >✕</button>
            </div>

            <div style={{ padding: "10px 9px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {menuItems.map((item) => (
                <button
                  key={item.title}
                  onClick={item.onClick}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 14px", borderRadius: 10,
                    border: "1.5px solid var(--border)",
                    background: "var(--bg)", cursor: "pointer",
                    textAlign: "left", fontFamily: "var(--font)",
                    transition: "all 0.13s", position: "relative",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "var(--brand-light)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg)"; }}
                >
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{item.title}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{item.desc}</div>
                  </div>
                  {item.badge != null && (
                    <span style={{
                      fontSize: 9, fontWeight: 900, background: "#16a34a", color: "#fff",
                      padding: "2px 6px", borderRadius: 99, flexShrink: 0,
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className={`ai-fab-btn${open ? " active" : ""}`}
          onClick={() => setOpen(v => !v)}
          title="Centro de ayuda"
        >
          <span style={{ color: "#fff", fontSize: open ? 20 : 22, fontWeight: 900 }}>{open ? "✕" : "?"}</span>
        </button>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
// RaLinker — Página "Resultados de aprendizaje" (vista docente)
// Lista las actividades del curso y permite al profesor elegir a qué
// Resultado(s) de Aprendizaje apunta cada una. Espeja el módulo de
// administración (LearningOutcomesAdmin) pero con una UX más amable:
// autofetch de su propia copia de datos + refresco tras guardar.
// ──────────────────────────────────────────────
