import React from "react";
import { fmtPct, fmtGrade10FromPct, computeRiskFromPct } from "../../utils/helpers";
import { sanitizeHtml } from "../../utils/sanitize";
import { elSpeak, elStop } from "../../utils/speech";

export default function VoiceAssistant({ studentRows, overview, raDashboard, courseInfo }) {
  const [msgs, setMsgs] = React.useState(() => [{
    id: 0, role: "bot", fromVoice: false,
    text: `Listo. Tengo cargados los datos de <strong>${courseInfo?.Name || "este curso"}</strong>. Puedo analizar riesgo, evidencias y desempeño por RA. Escríbeme o usa el micrófono 🎙️.`,
  }]);
  const [input, setInput] = React.useState("");
  const [aiStatus, setAiStatus] = React.useState("idle");
  const [voiceOut, setVoiceOut] = React.useState(true);
  const [speed, setSpeed]   = React.useState(1.2);
  const [activeSpeakId, setActiveSpeakId] = React.useState(null);
  const [liveText, setLiveText] = React.useState("");
  const chatRef  = React.useRef(null);
  const recRef   = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [msgs, aiStatus]);

  // ── Pre-compute course data ──
  const withGrades = (Array.isArray(studentRows) ? studentRows : []).filter((s) => s.currentPerformancePct != null);
  const avg = withGrades.length
    ? (withGrades.reduce((a, s) => a + Number(s.currentPerformancePct) / 10, 0) / withGrades.length).toFixed(2)
    : null;
  const altos  = (Array.isArray(studentRows) ? studentRows : []).filter((s) => computeRiskFromPct(s.currentPerformancePct) === "alto");
  const medios = (Array.isArray(studentRows) ? studentRows : []).filter((s) => computeRiskFromPct(s.currentPerformancePct) === "medio");
  const zeros  = (Array.isArray(studentRows) ? studentRows : []).filter((s) => s.currentPerformancePct == null);
  const courseName = courseInfo?.Name || "el curso";

  // ── Banco de sugerencias (rotación aleatoria cada apertura) ──
  const SUGGESTION_BANK = [
    { icon: "🔴", label: "¿Quiénes están en riesgo alto?" },
    { icon: "📊", label: "¿Cuál es la nota promedio?" },
    { icon: "📉", label: "¿Quién tiene la nota más baja?" },
    { icon: "⚠️", label: "¿Hay estudiantes sin nota?" },
    { icon: "🏆", label: "¿Cuáles son los top 3?" },
    { icon: "🎯", label: "¿Qué RA está más crítico?" },
    { icon: "📋", label: "Dame un resumen del curso" },
    { icon: "🟡", label: "¿Quiénes están en riesgo medio?" },
    { icon: "📦", label: "¿Cuántos aprobaron (≥7.0)?" },
    { icon: "🔍", label: "¿Cuál es la cobertura promedio?" },
    { icon: "⏳", label: "¿Cuántos tienen pendientes sin calificar?" },
    { icon: "🛤️", label: "¿Qué rutas de intervención hay?" },
    { icon: "📅", label: "¿Cómo va el ritmo de contenidos?" },
    { icon: "🧮", label: "¿Cuántos están por debajo de 5.0?" },
    { icon: "🚀", label: "¿Quiénes mejoraron su desempeño?" },
    { icon: "🎓", label: "¿Hay estudiantes sin actividad reciente?" },
  ];
  // Seleccionar 4 aleatorias estables por montaje
  const [visibleChips, setVisibleChipsState] = React.useState(() => {
    const shuffled = [...SUGGESTION_BANK].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  });
  const CHIPS = visibleChips;

  // ── Command processor — respuestas cortas y precisas ──
  // Regla de orden: más específico SIEMPRE antes que más genérico
  function processCmd(cmd) {
    const c = cmd.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const n = studentRows.length;

    // ── Ritmo de contenidos (antes de "contenido" genérico)
    if (c.includes("ritmo") || c.includes("ritmo de contenido")) {
      const kpis = overview?.contentKpis;
      if (!kpis) return "Sin datos de ritmo de contenidos disponibles.";
      return `Contenidos creados: <strong>${kpis.createdCount ?? "—"}</strong> · Mínimo esperado: <strong>${kpis.minExpected ?? "—"}</strong> · Cumplimiento: <strong>${kpis.progressRatio != null ? Math.round(kpis.progressRatio*100)+"%" : "—"}</strong>.`;
    }

    // ── Actividad reciente (antes de cualquier otra rama)
    if (c.includes("actividad reciente") || c.includes("sin actividad") || c.includes("inactiv")) {
      if (!zeros.length) return "Todos los estudiantes han tenido actividad registrada.";
      return `Sin actividad registrada: <strong>${zeros.length}</strong>:<br>${zeros.slice(0,5).map(s => `‣ ${s.displayName.split(",")[0]}`).join("<br>")}${zeros.length > 5 ? `<br>… y ${zeros.length - 5} más` : ""}`;
    }

    // ── RA / Resultados de aprendizaje (ANTES de "critico" genérico y "menor")
    if (c.includes("que ra") || c.includes("cual ra") || c.includes("ra critico") || c.includes("ra mas") ||
        c.includes("resultado de aprendizaje") || c.includes("resultados de aprendizaje") ||
        c.includes("competencia") || (c.includes("ra") && (c.includes("critico") || c.includes("bajo") || c.includes("peor")))) {
      const ras = Array.isArray(raDashboard?.ras) ? raDashboard.ras.filter(r => r.studentsWithData > 0) : [];
      if (!ras.length) return "Sin datos de RA aún. Se requieren evaluaciones con rúbricas calificadas.";
      const sorted = [...ras].sort((a,b) => a.avgPct - b.avgPct);
      return `${sorted.map(r => `${r.avgPct < 50 ? "[Crítico]" : r.avgPct < 70 ? "[Observación]" : "[OK]"} <strong>${r.code}:</strong> ${fmtPct(r.avgPct)}`).join("<br>")}.<br>Foco: <strong>${sorted[0].code}</strong> (menor desempeño).`;
    }

    // ── Por debajo de 5 (ANTES de "menor" o "bajo" genérico que también captura "nota más baja")
    if (c.includes("debajo de 5") || c.includes("menor a 5") || c.includes("menor de 5") ||
        c.includes("5.0") || c.includes("reprobado") || c.includes("cuantos") && c.includes("5")) {
      const rep = withGrades.filter(s => s.currentPerformancePct / 10 < 5);
      return `Con nota menor a 5.0: <strong>${rep.length} de ${n}</strong>.${rep.length ? "<br>" + rep.slice(0,4).map(s=>`‣ ${s.displayName.split(",")[0]} (${fmtGrade10FromPct(s.currentPerformancePct)})`).join("<br>") : ""}`;
    }

    // ── Nota más baja / quién tiene la peor nota
    if ((c.includes("nota") && (c.includes("mas baja") || c.includes("baja") || c.includes("peor") || c.includes("menor nota"))) ||
        c.includes("nota minima") || (c.includes("quien") && c.includes("baj"))) {
      const worst = [...withGrades].sort((a, b) => a.currentPerformancePct - b.currentPerformancePct)[0];
      if (!worst) return "Sin calificaciones registradas aún.";
      return `Nota más baja: <strong>${worst.displayName}</strong> con <strong>${fmtGrade10FromPct(worst.currentPerformancePct)}</strong>.`;
    }

    // ── Riesgo alto (ANTES de riesgo genérico)
    if (c.includes("riesgo alto") || c.includes("alto riesgo") ||
        (c.includes("riesgo") && (c.includes("quienes") || c.includes("quién") || c.includes("quienes estan"))) ) {
      if (!altos.length) return "Ningún estudiante en riesgo alto actualmente.";
      return `Riesgo alto (${altos.length}):<br>${altos.slice(0, 6).map(s => `‣ ${s.displayName.split(",")[0]} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}${altos.length > 6 ? `<br>… y ${altos.length - 6} más` : ""}`;
    }

    // ── Riesgo medio
    if (c.includes("riesgo medio") || c.includes("medio riesgo")) {
      if (!medios.length) return "Ningún estudiante en riesgo medio actualmente.";
      return `Riesgo medio (${medios.length}):<br>${medios.slice(0, 5).map(s => `‣ ${s.displayName.split(",")[0]} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}${medios.length > 5 ? `<br>… y ${medios.length - 5} más` : ""}`;
    }

    // ── Riesgo general
    if (c.includes("riesgo") || c.includes("risk")) {
      const ok = n - altos.length - medios.length - zeros.length;
      return `Riesgo en <strong>${courseName}</strong>:<br>Alto: ${altos.length} · Medio: ${medios.length} · OK: ${ok} · Sin nota: ${zeros.length}.<br>${altos.length > 0 ? `Prioridad: ${altos.slice(0,3).map(s => s.displayName.split(",")[0]).join(", ")}.` : ""}`;
    }

    // ── Alertas críticas
    if (c.includes("alerta")) {
      const crit = altos.filter(s => s.currentPerformancePct != null && s.currentPerformancePct < 50);
      return `Sin nota: <strong>${zeros.length}</strong> · Nota menor a 5: <strong>${crit.length}</strong>.<br>${crit.length ? crit.slice(0,3).map(s => `‣ ${s.displayName.split(",")[0]} (${fmtGrade10FromPct(s.currentPerformancePct)})`).join("<br>") : ""}`;
    }

    // ── Top estudiantes
    if (c.includes("top") || c.includes("mejor") || c.includes("destacado") || (c.includes("cuales") && c.includes("top"))) {
      const sorted = [...withGrades].sort((a, b) => b.currentPerformancePct - a.currentPerformancePct).slice(0, 3);
      if (!sorted.length) return "Sin calificaciones disponibles aún.";
      return `Top 3:<br>${sorted.map((s, i) => `${i+1}. ${s.displayName.split(",")[0]} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}`;
    }

    // ── Resumen del curso
    if (c.includes("resumen") || c.includes("informe") || c.includes("reporte") || c.includes("como va") || c.includes("dame un")) {
      return `<strong>${courseName}</strong><br>Estudiantes: ${n} · Promedio: ${avg ?? "—"}/10<br>Alto: ${altos.length} · Medio: ${medios.length} · Sin nota: ${zeros.length}`;
    }

    // ── Sin nota
    if (c.includes("sin nota") || c.includes("sin evidencia") || c.includes("ruta 0")) {
      if (!zeros.length) return "Todos los estudiantes tienen nota registrada.";
      return `Sin nota: <strong>${zeros.length}</strong>:<br>${zeros.slice(0,5).map(s => `‣ ${s.displayName.split(",")[0]}`).join("<br>")}${zeros.length > 5 ? `<br>… y ${zeros.length - 5} más` : ""}`;
    }

    // ── Aprobados
    if (c.includes("aprobado") || c.includes("pasando") || c.includes("aprobaron") || c.includes("aprobaron")) {
      const ap = withGrades.filter(s => s.currentPerformancePct / 10 >= 7);
      return `Aprobados (nota mayor o igual a 7.0): <strong>${ap.length} de ${n}</strong> (${n ? Math.round(ap.length/n*100) : 0}%).`;
    }

    // ── Cobertura
    if (c.includes("cobertura") || (c.includes("50") && c.includes("cobertura"))) {
      const avgCov = overview?.courseGradebook?.avgCoveragePct;
      const lowCov = (Array.isArray(studentRows) ? studentRows : []).filter(s => s.coveragePct != null && s.coveragePct < 50);
      return `Cobertura promedio: <strong>${fmtPct(avgCov)}</strong>.${lowCov.length ? `<br>${lowCov.length} est. con cobertura menor al 50%.` : ""}`;
    }

    // ── Promedio (último catch-all de nota)
    if (c.includes("promedio") || c.includes("nota promedio") || c.includes("cual es la nota")) {
      return `Promedio del curso: <strong>${avg ?? "—"}/10</strong> (${withGrades.length} estudiantes con nota).`;
    }

    // ── RA general (logro por RA)
    if (c.includes("ra") || c.includes("logro") || c.includes("aprendizaje")) {
      const ras = Array.isArray(raDashboard?.ras) ? raDashboard.ras.filter(r => r.studentsWithData > 0) : [];
      if (!ras.length) return "Sin datos de RA aún. Se requieren evaluaciones con rúbricas calificadas.";
      const sorted = [...ras].sort((a,b) => a.avgPct - b.avgPct);
      return `${sorted.map(r => `${r.avgPct < 50 ? "[Crítico]" : r.avgPct < 70 ? "[Obs]" : "[OK]"} <strong>${r.code}:</strong> ${fmtPct(r.avgPct)}`).join(" · ")}<br>Foco: <strong>${sorted[0].code}</strong>.`;
    }

    // ── Rutas de intervención
    if (c.includes("ruta") || c.includes("intervencion") || c.includes("prescripcion") || c.includes("plan activo")) {
      const routeCounts = { route_coverage: 0, route_high_risk: 0, route_watch: 0, route_ok: 0 };
      (Array.isArray(studentRows) ? studentRows : []).forEach(s => {
        const rid = s.route?.id || "";
        if (routeCounts[rid] !== undefined) routeCounts[rid]++;
      });
      const total = Object.values(routeCounts).reduce((a,b) => a+b, 0);
      if (!total) return "No hay datos de rutas disponibles aún.";
      return `Rutas activas:<br>` +
        `<strong>Ruta 0</strong> (Activar evidencia): ${routeCounts.route_coverage} est.<br>` +
        `<strong>Ruta 1</strong> (Recuperación): ${routeCounts.route_high_risk} est.<br>` +
        `<strong>Ruta 2</strong> (Ajuste dirigido): ${routeCounts.route_watch} est.<br>` +
        `<strong>Ruta 3</strong> (Mantener desempeño): ${routeCounts.route_ok} est.`;
    }

    return `No encontré esa consulta. Prueba: riesgo alto, riesgo medio, promedio, sin nota, top estudiantes, resultados de aprendizaje, aprobados, cobertura, rutas.`;
  }

  // ── TTS — usa ElevenLabs (alta calidad) con fallback a Web Speech API ──
  function speakText(html, msgId) {
    setAiStatus("speaking"); setActiveSpeakId(msgId);
    elSpeak(
      html,
      () => { setAiStatus("speaking"); setActiveSpeakId(msgId); },
      () => { setAiStatus("idle");     setActiveSpeakId(null); },
    );
  }

  function stopSpeaking() {
    elStop();
    setAiStatus("idle"); setActiveSpeakId(null);
  }

  // ── Send message ──
  function sendMsg(text, fromVoice = false) {
    const t = (text || input).trim();
    if (!t) return;
    setInput("");
    const uid = Date.now();
    setMsgs((prev) => [...prev, { id: uid, role: "user", fromVoice, text: t }]);
    setAiStatus("thinking");
    setTimeout(() => {
      const resp = processCmd(t);
      const bid = Date.now() + 1;
      setMsgs((prev) => [...prev, { id: bid, role: "bot", fromVoice: false, text: resp }]);
      setAiStatus("idle");
      if (voiceOut) speakText(resp, bid);
    }, 500 + Math.random() * 300);
  }

  // ── Mic ──
  const voiceOk = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function toggleMic() {
    if (aiStatus === "speaking") stopSpeaking();
    if (aiStatus === "listening") {
      recRef.current?.stop();
      setAiStatus("idle"); setLiveText("");
      return;
    }
    if (!voiceOk) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "es-CO"; rec.continuous = false; rec.interimResults = true;
    rec.onstart  = () => { setAiStatus("listening"); setLiveText(""); };
    rec.onend    = () => { if (aiStatus === "listening") { setAiStatus("idle"); setLiveText(""); } };
    rec.onerror  = () => { setAiStatus("idle"); setLiveText(""); };
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join("");
      setLiveText(t);
      if (e.results[e.results.length - 1].isFinal) {
        rec.stop(); setAiStatus("thinking"); setLiveText("");
        setTimeout(() => sendMsg(t, true), 300);
      }
    };
    recRef.current = rec; rec.start();
  }

  const SM = {
    idle:      { icon: "🎓", label: "Listo para instrucciones", sub: "Escribe o usa el micrófono", color: "var(--muted)" },
    listening: { icon: "🎙️", label: "Escuchando…", sub: liveText || "Habla en español", color: "var(--critical)" },
    thinking:  { icon: "⚙️", label: "Analizando datos…", sub: "Procesando tu consulta", color: "var(--brand)" },
    speaking:  { icon: "🔊", label: "Respondiendo en voz…", sub: "Haz clic en ⏹ para detener", color: "var(--ok)" },
  };
  const sm = SM[aiStatus] || SM.idle;

  return (
    <div className="ai-panel">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--brand)", boxShadow: "0 0 8px var(--brand)", animation: aiStatus !== "idle" ? "pulse 1.4s ease infinite" : "none" }} />
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Asistente IA Académica</div>
          <span className="tag" style={{ background: "var(--brand-light)", color: "var(--brand)", fontSize: 10 }}>2026.8.7 · 07/08/2026</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {studentRows.length} estudiantes · {courseInfo?.Name || "Curso activo"}
        </div>
      </div>

      {/* Status bar */}
      <div className={`ai-status-outer ${aiStatus !== "idle" ? aiStatus : ""}`}>
        <div className="ai-status-icon" style={{ fontSize: 18 }}>{sm.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: sm.color }}>{sm.label}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sm.sub}</div>
        </div>
        {(aiStatus === "listening" || aiStatus === "speaking") && (
          <div className="ai-wave">
            {[1,2,3,4,5].map((n) => (
              <div key={n} className="ai-wave-bar" style={{
                background: aiStatus === "listening" ? "var(--critical)" : "var(--ok)"
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Sugerencias rotativas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Sugerencias</span>
          <button
            onClick={() => {
              const shuffled = [...SUGGESTION_BANK].sort(() => Math.random() - 0.5).slice(0, 6);
              setVisibleChipsState(shuffled);
            }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--muted)", padding: "2px 4px", borderRadius: 4 }}
            title="Nuevas sugerencias"
          >↻ nuevas</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
          {visibleChips.map((c) => (
            <button
              key={c.label}
              className="ai-chip-btn"
              onClick={() => sendMsg(c.label)}
              style={{ textAlign: "left", fontSize: 11, padding: "6px 9px", borderRadius: 8, lineHeight: 1.35 }}
            >
              <span style={{ marginRight: 5 }}>{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="ai-chat" ref={chatRef}>
        {msgs.map((m) => (
          <div key={m.id} className={`ai-bubble-wrap ${m.role}`}>
            <div className="ai-meta">
              {m.role === "bot" ? "Asistente" : "Tú"}
              {m.fromVoice && <span className="ai-voice-badge">🎙️ voz</span>}
            </div>
            <div className={`ai-bubble ${m.role}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.text) }} />
            {m.role === "bot" && (
              <button
                className={`ai-speak-btn${activeSpeakId === m.id ? " active" : ""}`}
                onClick={() => activeSpeakId === m.id ? stopSpeaking() : speakText(m.text, m.id)}
              >
                {activeSpeakId === m.id ? "⏸ Detener" : "🔊 Escuchar"}
              </button>
            )}
          </div>
        ))}
        {aiStatus === "thinking" && (
          <div className="ai-bubble-wrap bot">
            <div className="ai-meta">Asistente</div>
            <div className="ai-bubble bot">
              <div className="ai-typing">
                <div className="ai-typing-dot" /><div className="ai-typing-dot" /><div className="ai-typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          className={`voice-btn${aiStatus === "listening" ? " listening" : ""}`}
          onClick={voiceOk ? toggleMic : undefined}
          title={voiceOk ? (aiStatus === "listening" ? "Detener" : "Hablar por voz") : "Micrófono no disponible en este navegador"}
          style={{ height: 40, width: 40, fontSize: 17, flexShrink: 0, opacity: voiceOk ? 1 : 0.4, cursor: voiceOk ? "pointer" : "not-allowed" }}
        >
          {aiStatus === "listening" ? "⏹" : "🎙️"}
        </button>
        <input
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
          placeholder={aiStatus === "listening" ? "🎙️ Escuchando…" : "Pregunta sobre el curso…"}
          style={{ height: 40 }}
        />
        <button className="ai-send-btn" onClick={() => sendMsg()} style={{ height: 40, padding: "0 14px", fontSize: 13 }}>↵</button>
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <button
          className={`ai-toggle${voiceOut ? " active" : ""}`}
          onClick={() => { setVoiceOut((v) => !v); if (aiStatus === "speaking") stopSpeaking(); }}
        >
          <div className="ai-toggle-dot" />
          <span style={{ fontSize: 11, fontWeight: 700, color: voiceOut ? "var(--ok)" : "var(--muted)" }}>
            {voiceOut ? "🔊 Voz activada" : "🔇 Voz desactivada"}
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>TTS:</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "var(--text)", fontFamily: "var(--font-mono)", outline: "none" }}
          >
            <option value={0.8}>Lenta</option>
            <option value={1.0}>Normal</option>
            <option value={1.2}>Rápida</option>
            <option value={1.5}>Muy rápida</option>
          </select>
          <button className={`ai-stop-btn${aiStatus === "speaking" ? " visible" : ""}`} onClick={stopSpeaking}>⏹ Detener</button>
        </div>
      </div>

      {/* Guide cards */}
      <div className="ai-guide-grid">
        {[
          { icon: "🎙️", color: "var(--brand)", title: "Entrada de Voz", desc: "Presiona el micrófono y habla en español. La transcripción se procesa automáticamente." },
          { icon: "🔊", color: "var(--ok)", title: "Salida de Voz", desc: "Activa la voz y el asistente leerá cada respuesta. Usa '🔊 Escuchar' en mensajes anteriores." },
          { icon: "⚡", color: "var(--watch)", title: "Datos Reales", desc: "Todas las respuestas usan los datos del curso en tiempo real — calificaciones, cobertura, riesgo y RAs." },
        ].map((g) => (
          <div key={g.title} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{g.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: g.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{g.title}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{g.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
