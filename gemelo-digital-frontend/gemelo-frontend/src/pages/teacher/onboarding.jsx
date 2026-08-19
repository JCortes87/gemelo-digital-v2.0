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
    title: "Bienvenido al Visor de desempeño estudiantil",
    icon: "🎓",
    desc: "Tu asistente académico inteligente para CESA. Monitorea el desempeño de tus estudiantes en tiempo real, identifica riesgos y toma decisiones de acompañamiento basadas en datos.",
    highlight: null,
    voice: (name) => `Bienvenido al Visor de desempeño estudiantil${name ? ", " + name : ""}. Tu asistente académico inteligente para el seguimiento de tus estudiantes.`,
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

// ─────────────────────────────────────────────────────────────────────────────
// Tour guiado por las opciones (18 ago 2026): tras las tarjetas del tutorial
// se ofrece un recorrido que resalta cada opción real de la pantalla con un
// foco y un texto flotante que explica qué es y qué hace. Los pasos se anclan
// con el atributo data-tour de cada elemento (sidebar y topbar en layout.jsx);
// si un elemento no está visible (p. ej. el selector de vista en móvil), el
// paso se salta solo. También se puede relanzar desde el menú ⚙️ → "Tour de
// opciones".
// ─────────────────────────────────────────────────────────────────────────────
const TOUR_STEPS = [
  { target: "nav-dashboard", icon: "📊", title: "Dashboard", desc: "El panorama del curso: calificación promedio, estudiantes en riesgo, recursos educativos publicados, asignaciones y accesos al curso." },
  { target: "nav-students", icon: "👥", title: "Estudiantes", desc: "La lista completa del curso con la calificación, el nivel de riesgo y el último ingreso de cada estudiante. Haz clic en uno para ver su detalle." },
  { target: "nav-calendar", icon: "📅", title: "Calendario", desc: "Todas las fechas de entrega del curso, mes a mes." },
  { target: "nav-trends", icon: "📈", title: "Tendencias", desc: "Cómo evoluciona el curso en el tiempo: promedio, riesgo y entregas día a día." },
  { target: "nav-routes", icon: "🛤️", title: "Rutas de atención", desc: "Sugerencias de acompañamiento para cada estudiante según su situación: activar evidencias, recuperación, seguimiento o mantener el desempeño." },
  { target: "nav-predictions", icon: "🔮", title: "Predicción de calificaciones", desc: "Una proyección de la nota final de cada estudiante si mantiene su ritmo actual." },
  { target: "nav-evidences", icon: "📑", title: "Evidencias", desc: "Las actividades calificadas del curso, con sus notas y reportes para descargar." },
  { target: "nav-learning-outcomes", icon: "🎯", title: "Resultados de aprendizaje", desc: "El desempeño del curso en cada resultado de aprendizaje y su vínculo con las actividades." },
  { target: "nav-assistant", icon: "🤖", title: "Asistente IA", desc: "Pregunta en lenguaje natural — por ejemplo \"¿quiénes están en riesgo alto?\" — y obtén la respuesta al instante, por texto o por voz." },
  { target: "topbar-search", icon: "🔍", title: "Abrir un curso por ID", desc: "Escribe el ID de un curso y presiona Enter para abrirlo directamente." },
  { target: "view-toggle", icon: "🎓", title: "Vista profesor / estudiante", desc: "Cambia a la vista de un estudiante para ver su portal tal como él lo ve." },
  { target: "topbar-menu", icon: "⚙️", title: "Más opciones", desc: "Comandos rápidos, tus cursos, idioma, tema claro u oscuro, imprimir… y este tour, por si quieres repetirlo." },
];

export function GuidedTour({ onFinish }) {
  // Solo los pasos cuyo elemento existe y está visible en pantalla
  const [steps] = React.useState(() =>
    TOUR_STEPS.filter((s) => {
      const el = document.querySelector(`[data-tour="${s.target}"]`);
      return el && el.getClientRects().length > 0;
    })
  );
  const [idx, setIdx] = React.useState(0);
  const [rect, setRect] = React.useState(null);
  const step = steps[idx];
  const isLast = idx === steps.length - 1;

  // Medir el elemento del paso actual (y re-medir en resize/scroll)
  React.useEffect(() => {
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;
    try { el.scrollIntoView({ block: "nearest" }); } catch { /* noop */ }
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  // Salir con Escape
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onFinish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  if (!step || !rect) return null;

  // Posición de la tarjeta: a la derecha del elemento si cabe; si no,
  // debajo (o encima), siempre dentro de la ventana.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const CARD_W = Math.min(300, vw - 24);
  const CARD_H = 220; // estimado para decidir arriba/abajo
  let cardPos;
  if (vw - rect.right >= CARD_W + 28) {
    cardPos = { left: rect.right + 14, top: Math.min(Math.max(rect.top, 12), vh - CARD_H - 12) };
  } else {
    const left = Math.min(Math.max(rect.right - CARD_W, 12), vw - CARD_W - 12);
    const top = rect.bottom + 14 + CARD_H < vh ? rect.bottom + 14 : Math.max(12, rect.top - CARD_H - 14);
    cardPos = { left, top };
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, fontFamily: "var(--font)" }}>
      {/* Bloquea la interacción con el resto de la pantalla durante el tour */}
      <div style={{ position: "absolute", inset: 0 }} aria-hidden="true" />
      {/* Foco sobre la opción actual (el sombreado oscurece todo lo demás) */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12,
          borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)",
          border: "2px solid var(--brand)",
          transition: "top .25s ease, left .25s ease, width .25s ease, height .25s ease",
          pointerEvents: "none",
        }}
      />
      {/* Texto flotante del paso */}
      <div
        role="dialog"
        aria-label={`Tour: ${step.title}`}
        style={{
          position: "fixed", left: cardPos.left, top: cardPos.top, width: CARD_W,
          background: "var(--card)", borderRadius: 14, padding: "16px 18px",
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)", border: "1px solid var(--border)",
          transition: "top .25s ease, left .25s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }} aria-hidden="true">{step.icon}</span>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: "var(--text)", margin: 0, letterSpacing: "-0.01em" }}>
            {step.title}
          </h3>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, margin: "0 0 12px" }}>
          {step.desc}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onFinish}
            style={{ background: "none", border: "none", fontSize: 11, fontWeight: 700, color: "var(--muted)", cursor: "pointer", padding: "6px 4px" }}
          >
            Salir
          </button>
          <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700, marginLeft: "auto" }}>
            {idx + 1} de {steps.length}
          </span>
          {idx > 0 && (
            <button
              onClick={() => setIdx((i) => i - 1)}
              style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", fontSize: 11.5, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
            >
              ← Anterior
            </button>
          )}
          <button
            onClick={() => (isLast ? onFinish() : setIdx((i) => i + 1))}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "var(--brand)", color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
          >
            {isLast ? "Finalizar ✓" : "Siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
            🆕 Novedades · Visor de desempeño estudiantil
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

// onFinish(startTour): startTour=true cuando el usuario acepta el tour
// guiado que se ofrece al terminar las tarjetas.
export function OnboardingTutorial({ userName, onFinish }) {
  const [step, setStep] = React.useState(0);
  const [speaking, setSpeaking] = React.useState(false);
  // "cards" = tarjetas del tutorial · "offer" = tarjeta que ofrece el tour
  const [phase, setPhase] = React.useState("cards");
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
      // Al terminar las tarjetas no se cierra de una: se ofrece el tour
      window.speechSynthesis?.cancel();
      localStorage.setItem("gemelo_onboarded", "1");
      setPhase("offer");
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    window.speechSynthesis?.cancel();
    localStorage.setItem("gemelo_onboarded", "1");
    onFinish(false);
  };

  // Tarjeta final: ¿quiere hacer el tour por las opciones?
  if (phase === "offer") {
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
          padding: "36px 40px", maxWidth: 460, width: "100%",
          boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
        }}>
          <div style={{ textAlign: "center", fontSize: 48, marginBottom: 16, lineHeight: 1 }}>🧭</div>
          <h2 style={{ fontSize: 21, fontWeight: 900, color: "var(--text)", textAlign: "center", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
            ¿Quieres un tour por las opciones?
          </h2>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, textAlign: "center", margin: "0 0 26px" }}>
            Te señalamos en pantalla cada opción del menú y te contamos qué
            hace cada una. Toma menos de un minuto, y puedes salir cuando
            quieras. Si prefieres verlo después, está en el menú ⚙️ →
            "Tour de opciones".
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => onFinish(false)}
              style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", fontSize: 13, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
            >
              No, gracias
            </button>
            <button
              onClick={() => onFinish(true)}
              style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(11,95,255,0.3)" }}
            >
              Sí, iniciar el tour 🧭
            </button>
          </div>
        </div>
      </div>
    );
  }

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
