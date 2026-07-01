import React, { useMemo, useState } from "react";
import { computeRiskFromPct, fmtGrade10FromPct, fmtPct } from "../../utils/helpers";
import { elSpeak, elStop } from "../../utils/speech";

/**
 * AINarrativeSummary: generates a natural-language weekly summary of the
 * course state. Pure client-side heuristic generation — no external AI call.
 * Can optionally be read aloud using the existing TTS utility.
 */
function AINarrativeSummary({ studentRows = [], overview = null, courseInfo = null, raDashboard = null, contentKpis = null }) {
  // Estado de la lectura por voz: "idle" (sin sonar) | "loading" (pidiendo el
  // audio al backend) | "playing" (sonando). Permite deshabilitar el boton
  // mientras carga y mostrar "Detener" mientras suena.
  const [voiceStatus, setVoiceStatus] = useState("idle");

  const narrative = useMemo(() => {
    const rows = Array.isArray(studentRows) ? studentRows : [];
    const loaded = rows.filter((s) => !s.isLoading);
    if (loaded.length === 0) return null;

    const courseName = courseInfo?.Name || "este curso";
    const avgPct = overview?.courseGradebook?.avgCurrentPerformancePct;
    const withGrade = loaded.filter((s) => s.currentPerformancePct != null);
    const avgGrade = withGrade.length > 0
      ? (withGrade.reduce((a, s) => a + s.currentPerformancePct, 0) / withGrade.length)
      : null;
    const avg10 = avgGrade != null ? (avgGrade / 10).toFixed(1) : "—";

    const risky = {
      alto: loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "alto"),
      medio: loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "medio"),
      bajo: loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "bajo"),
      pending: loaded.filter((s) => s.currentPerformancePct == null),
    };

    const overdue = loaded.filter((s) => (s.notSubmittedWeightPct ?? 0) > 10);
    const pendingGrade = loaded.filter((s) => (s.pendingSubmittedWeightPct ?? 0) > 15);

    // Weakest RA
    const ras = Array.isArray(raDashboard?.ras) ? raDashboard.ras.filter(r => r.studentsWithData > 0) : [];
    const weakestRa = ras.length > 0 ? ras.slice().sort((a, b) => a.avgPct - b.avgPct)[0] : null;

    // Build paragraph
    const parts = [];
    parts.push(`En **${courseName}** tienes ${loaded.length} estudiantes con nota promedio de **${avg10}/10**.`);

    if (risky.alto.length > 0) {
      const names = risky.alto.slice(0, 3).map((s) => s.displayName.split(" ")[0]).join(", ");
      parts.push(`Hay **${risky.alto.length} en riesgo alto** (${names}${risky.alto.length > 3 ? ", entre otros" : ""}) que requieren intervención inmediata.`);
    } else {
      parts.push(`Ningún estudiante está en riesgo alto, ¡buen trabajo manteniendo el rendimiento!`);
    }

    if (risky.medio.length > 0) {
      parts.push(`${risky.medio.length} estudiante${risky.medio.length !== 1 ? "s están" : " está"} en riesgo medio — buen candidato${risky.medio.length !== 1 ? "s" : ""} para ajustes dirigidos.`);
    }

    if (overdue.length > 0) {
      parts.push(`**${overdue.length}** estudiante${overdue.length !== 1 ? "s tienen" : " tiene"} más del 10% del peso del curso vencido sin entregar. Sugiero reunirte con ellos esta semana.`);
    }

    if (pendingGrade.length > 0) {
      parts.push(`Hay **${pendingGrade.length}** entrega${pendingGrade.length !== 1 ? "s" : ""} pendiente${pendingGrade.length !== 1 ? "s" : ""} por calificar. Cerrar el backlog evaluativo ayuda a bajar la ansiedad del estudiante.`);
    }

    if (weakestRa) {
      parts.push(`El Resultado de Aprendizaje más débil es **${weakestRa.code}** (${fmtPct(weakestRa.avgPct)}). Considera actividades de refuerzo enfocadas en esa competencia.`);
    }

    if (contentKpis?.progressRatio != null && contentKpis.progressRatio < 0.8) {
      parts.push(`Tu ritmo de publicación de contenidos está al ${Math.round(contentKpis.progressRatio * 100)}% del mínimo esperado. Publicar material adicional aumentará el engagement.`);
    }

    // Closing recommendation
    if (risky.alto.length >= 3) {
      parts.push(`**Mi recomendación principal esta semana:** realiza una reunión grupal corta con los estudiantes en riesgo alto.`);
    } else if (overdue.length >= 3) {
      parts.push(`**Mi recomendación principal esta semana:** prioriza activar entregas vencidas antes de nueva evaluación.`);
    } else if (pendingGrade.length > 0) {
      parts.push(`**Mi recomendación principal esta semana:** calificar las entregas pendientes para cerrar el ciclo evaluativo.`);
    } else {
      parts.push(`**Mi recomendación principal esta semana:** mantén el ritmo actual y considera retos adicionales para los estudiantes destacados.`);
    }

    return parts.join(" ");
  }, [studentRows, overview, courseInfo, raDashboard, contentKpis]);

  const handleSpeak = () => {
    // Si ya esta sonando, este clic la detiene.
    if (voiceStatus === "playing") {
      elStop();
      setVoiceStatus("idle");
      return;
    }
    // Si esta cargando, ignoramos (el boton ademas queda deshabilitado): asi un
    // doble clic no dispara dos audios.
    if (voiceStatus === "loading") return;
    if (!narrative) return;

    // Strip markdown for TTS
    const clean = narrative.replace(/\*\*/g, "").replace(/\n+/g, " ");
    setVoiceStatus("loading");
    elSpeak(
      clean,
      () => setVoiceStatus("playing"),   // onStart: el audio empezo a sonar
      () => setVoiceStatus("idle"),      // onEnd: termino o se detuvo
    );
  };

  if (!narrative) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
        Sin datos suficientes para generar un resumen.
      </div>
    );
  }

  // Render narrative with **bold** → <strong>
  const rendered = narrative.split(/(\*\*[^*]+\*\*)/g).map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      return <strong key={i} style={{ color: "var(--brand)" }}>{seg.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{seg}</React.Fragment>;
  });

  return (
    <div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", marginBottom: 14 }}>
        {rendered}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          className="btn"
          onClick={handleSpeak}
          disabled={voiceStatus === "loading"}
          aria-label={
            voiceStatus === "playing" ? "Detener lectura"
            : voiceStatus === "loading" ? "Cargando audio"
            : "Escuchar resumen"
          }
          style={{
            fontSize: 11,
            padding: "6px 12px",
            opacity: voiceStatus === "loading" ? 0.6 : 1,
            cursor: voiceStatus === "loading" ? "wait" : "pointer",
          }}
        >
          {voiceStatus === "playing" ? "⏹ Detener"
            : voiceStatus === "loading" ? "⏳ Cargando…"
            : "🔊 Escuchar"}
        </button>
        <button
          className="btn"
          onClick={() => {
            const clean = narrative.replace(/\*\*/g, "");
            navigator.clipboard?.writeText(clean);
            alert("Resumen copiado al portapapeles");
          }}
          aria-label="Copiar resumen al portapapeles"
          style={{ fontSize: 11, padding: "6px 12px" }}
        >
          📋 Copiar
        </button>
      </div>
    </div>
  );
}

export default React.memo(AINarrativeSummary);
