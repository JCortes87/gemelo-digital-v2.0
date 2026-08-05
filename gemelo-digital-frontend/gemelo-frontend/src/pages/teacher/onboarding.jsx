// Tutorial de onboarding y modal de novedades (extraído de TeacherDashboard.jsx, #15).
import React from "react";
import { apiGet } from "../../utils/api";
import { elSpeak } from "../../utils/speech";

// INTERRUPTOR TEMPORAL: en false el tutorial no narra los pasos por voz
// (etapa de pruebas con recargas frecuentes). Nota: aunque estuviera en
// true, con ELEVENLABS_ENABLED=false en utils/speech.js la voz seria la
// gratuita del navegador — no consume tokens de ElevenLabs.
const TUTORIAL_VOICE_ENABLED = false;
const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: "Bienvenido a G.D",
    icon: "🎓",
    desc: "Tu asistente académico inteligente para CESA. Monitorea el desempeño de tus estudiantes en tiempo real, identifica riesgos y toma decisiones de acompañamiento basadas en datos.",
    highlight: null,
    voice: (name) => `Bienvenido a G.D${name ? ", " + name : ""}. Tu asistente académico inteligente para el seguimiento de tus estudiantes.`,
  },
  {
    id: "dashboard",
    title: "Dashboard del curso",
    icon: "📊",
    desc: "Ve el panorama completo: nota promedio, estudiantes en riesgo, distribución de calificaciones, cumplimiento evaluativo y resultados de aprendizaje evaluados con rúbricas.",
    highlight: "dashboard",
    voice: () => "El Dashboard te da el panorama completo de tu curso. Aquí ves el promedio, los estudiantes en riesgo y el cumplimiento evaluativo.",
  },
  {
    id: "priority",
    title: "Estudiantes prioritarios",
    icon: "🔴",
    desc: "Identifica automáticamente quiénes necesitan atención urgente: nota crítica, baja cobertura o ítems vencidos sin calificar. Haz clic en un estudiante para ver su gemelo digital completo.",
    highlight: "priority",
    voice: () => "La sección de estudiantes prioritarios te muestra quiénes necesitan atención urgente, con nota crítica o pendientes sin calificar.",
  },
  {
    id: "calendar",
    title: "Calendario de entregas",
    icon: "📅",
    desc: "Visualiza todas las fechas de entrega del curso. Al abrir el detalle de un estudiante, el calendario muestra su estado individual por actividad: entregada ✓, vencida ✗ o pendiente.",
    highlight: null,
    voice: () => "El Calendario de entregas muestra todas las fechas del curso. Puedes ver el estado de cada actividad por estudiante.",
  },
  {
    id: "routes",
    title: "Rutas de atención",
    icon: "🛤️",
    desc: "Cada estudiante tiene una ruta de intervención asignada automáticamente: activar evidencia, recuperación, ajuste dirigido o mantener desempeño. Úsalas para priorizar tus acciones.",
    highlight: "routes",
    voice: () => "Las Rutas de atención te indican qué acción tomar con cada estudiante, desde activar evidencias hasta planes de recuperación.",
  },
  {
    id: "ai",
    title: "Asistente IA con voz",
    icon: "🤖",
    desc: "Consulta en lenguaje natural: '¿Quiénes están en riesgo alto?', '¿Cuál es el promedio?'. También puedes hablar con el micrófono y obtener respuestas en segundos.",
    highlight: "assistant",
    voice: () => "El Asistente de Inteligencia Artificial responde tus preguntas en lenguaje natural. Puedes escribir o usar el micrófono para consultar el estado de tu curso.",
  },
  {
    id: "courses",
    title: "Cursos y roles",
    icon: "📚",
    desc: "Usa 'Mis cursos' en la barra superior para cambiar entre tus cursos activos. Si tienes doble rol (docente y estudiante), desde la pantalla de inicio puedes elegir cómo acceder.",
    highlight: null,
    voice: () => "Puedes cambiar entre tus cursos en cualquier momento usando el botón Mis cursos. Si tienes doble rol, elige tu vista desde la pantalla de inicio. ¡Listo para comenzar!",
  },
];

// Colores por tipo de anuncio del administrador
const ANN_TAG_COLORS = {
  "Nuevo": "#16a34a",
  "Anuncio": "var(--brand)",
  "Actualización": "#0891b2",
  "Mejorado": "var(--brand)",
  "Importante": "#dc2626",
  "SuperAdmin": "#7c3aed",
};

function _fmtAnnDate(ts) {
  try {
    return new Date(ts).toLocaleString("es-CO", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Feed in-app de anuncios/actualizaciones publicados por el administrador.
export function AnnouncementsModal({ onClose }) {
  const [items, setItems] = React.useState(null); // null = cargando
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiGet("/gemelo/announcements?limit=50");
        if (alive) setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (e) {
        if (alive) { setItems([]); setError("No se pudieron cargar las novedades."); }
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font)", padding: 20,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--card)", borderRadius: 20,
        padding: "28px 30px", maxWidth: 540, width: "100%",
        maxHeight: "82vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
        position: "relative",
      }}>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)", padding: 4, lineHeight: 1 }}
        >✕</button>

        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            🆕 Novedades · G.D
          </span>
        </div>

        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          {items === null && (
            <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "40px 0" }}>
              Cargando novedades…
            </div>
          )}

          {items !== null && items.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, padding: "40px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              {error || "No hay novedades por ahora. Aquí verás las actualizaciones y anuncios del administrador."}
            </div>
          )}

          {items !== null && items.map((a) => {
            const color = ANN_TAG_COLORS[a.tag] || "var(--brand)";
            return (
              <div key={a.id} style={{
                border: "1px solid var(--border)", borderRadius: 12,
                padding: "14px 16px", background: "var(--bg)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
                    padding: "3px 9px", borderRadius: 99,
                    background: color + "1a", color, border: "1px solid " + color + "40",
                  }}>
                    {a.tag || "Anuncio"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                    {_fmtAnnDate(a.ts)}
                  </span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 900, color: "var(--text)", margin: "0 0 6px", letterSpacing: "-0.01em" }}>
                  {a.subject}
                </h3>
                <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
                  {a.message}
                </p>
                {a.author && (
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, fontWeight: 600 }}>
                    — {a.author}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          style={{ marginTop: 18, padding: "11px 0", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(11,95,255,0.3)" }}
        >
          Entendido ✓
        </button>
      </div>
    </div>
  );
}

export function OnboardingTutorial({ userName, onFinish }) {
  const [step, setStep] = React.useState(0);
  const [speaking, setSpeaking] = React.useState(false);
  const current = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  const speak = React.useCallback((text) => {
    if (!TUTORIAL_VOICE_ENABLED) return;
    elSpeak(
      text,
      () => setSpeaking(true),
      () => setSpeaking(false),
    );
  }, []);

  // Auto-speak on step change (desactivado con TUTORIAL_VOICE_ENABLED=false)
  React.useEffect(() => {
    if (!TUTORIAL_VOICE_ENABLED) return;
    const text = current.voice(userName);
    // Small delay for better UX
    const t = setTimeout(() => speak(text), 300);
    return () => { clearTimeout(t); window.speechSynthesis?.cancel(); };
  }, [step]);

  const handleNext = () => {
    if (isLast) {
      window.speechSynthesis?.cancel();
      localStorage.setItem("gemelo_onboarded", "1");
      onFinish();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    window.speechSynthesis?.cancel();
    localStorage.setItem("gemelo_onboarded", "1");
    onFinish();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font)", padding: 20,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--card)", borderRadius: 20,
        padding: "36px 40px", maxWidth: 520, width: "100%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
        position: "relative",
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24, justifyContent: "center" }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 22 : 8, height: 8, borderRadius: 99,
              background: i === step ? "var(--brand)" : i < step ? "var(--ok)" : "var(--border)",
              transition: "all 0.3s ease",
            }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ textAlign: "center", fontSize: 48, marginBottom: 16, lineHeight: 1 }}>
          {current.icon}
        </div>

        {/* Title */}
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", textAlign: "center", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          {current.title}
        </h2>

        {/* Description */}
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, textAlign: "center", margin: "0 0 28px" }}>
          {current.desc}
        </p>

        {/* Voice indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24, height: 24 }}>
          {speaking ? (
            <>
              {[1,2,3,4,5].map(n => (
                <div key={n} style={{
                  width: 4, borderRadius: 2,
                  background: "var(--brand)",
                  animation: "waveAI 1.1s ease-in-out infinite",
                  animationDelay: `${n * 0.1}s`,
                  height: `${8 + n * 4}px`,
                }} />
              ))}
              <span style={{ fontSize: 11, color: "var(--brand)", fontWeight: 700, marginLeft: 6 }}>Hablando…</span>
            </>
          ) : (
            <button
              onClick={() => speak(current.voice(userName))}
              style={{ background: "none", border: "1px solid var(--border)", borderRadius: 99, padding: "4px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
            >
              🔊 Repetir
            </button>
          )}
        </div>

        {/* Step counter */}
        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginBottom: 16, fontWeight: 600 }}>
          {step + 1} de {ONBOARDING_STEPS.length}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleSkip}
            style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", fontSize: 13, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
          >
            Saltar tutorial
          </button>
          <button
            onClick={handleNext}
            style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(11,95,255,0.3)" }}
          >
            {isLast ? "¡Comenzar! 🚀" : "Siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LoginScreen — Pantalla de acceso cuando el usuario no está autenticado
// ─────────────────────────────────────────────────────────────────────────────
