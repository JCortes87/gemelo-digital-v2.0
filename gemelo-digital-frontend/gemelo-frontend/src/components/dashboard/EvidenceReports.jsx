import React, { useState, useMemo, useEffect } from "react";
import { apiGet, apiDownloadUrl } from "../../utils/api";
import { exportInstitutionalFeedbackPdf } from "../../utils/export";
import { COLORS, colorForPct } from "../../utils/colors";
import { fmtPct, fmtGrade10FromPct, computeRiskFromPct } from "../../utils/helpers";
import { sanitizeHtml } from "../../utils/sanitize";
import StudentAvatar from "../ui/StudentAvatar";

/**
 * EvidenceReports: generates random sample reports of student work.
 * Picks a random student from each band:
 *   - High performers (≥85%)
 *   - Mid performers (60-84%)
 *   - Low performers (<60%)
 *
 * For each, fetches the full gemelo (evidences) so the teacher can see
 * concrete examples of work submitted at each level.
 */
export default function EvidenceReports({
  orgUnitId,
  studentRows = [],
  courseInfo = null,
  onStudentClick = () => {},
}) {
  const [seed, setSeed] = useState(0); // bump to re-randomize
  const [details, setDetails] = useState({}); // userId → { evidences, loading, error }
  const [feedbackModal, setFeedbackModal] = useState(null); // { studentName, evidenceName, loading, data, error }

  const openFeedback = async (student, evidence) => {
    if (!evidence.linkedDropboxId) return;
    const downloadUrl = apiDownloadUrl(
      `/brightspace/course/${orgUnitId}/dropbox/folder/${evidence.linkedDropboxId}/student/${student.userId}/download`
    );
    setFeedbackModal({
      studentName: student.displayName,
      studentId: student.userId,
      evidenceName: evidence.name || `Ítem ${evidence.gradeObjectId}`,
      downloadUrl,
      loading: true,
      data: null,
      error: null,
    });
    try {
      const data = await apiGet(
        `/brightspace/course/${orgUnitId}/dropbox/folder/${evidence.linkedDropboxId}/student/${student.userId}/feedback`
      );
      setFeedbackModal((prev) => prev && { ...prev, loading: false, data });
    } catch (err) {
      setFeedbackModal((prev) => prev && { ...prev, loading: false, error: String(err?.message || err) });
    }
  };

  // Pick one random student per band
  const samples = useMemo(() => {
    const loaded = studentRows.filter(
      (s) => !s.isLoading && s.currentPerformancePct != null
    );
    if (loaded.length === 0) return null;

    const high = loaded.filter((s) => s.currentPerformancePct >= 85);
    const mid = loaded.filter((s) => s.currentPerformancePct >= 60 && s.currentPerformancePct < 85);
    const low = loaded.filter((s) => s.currentPerformancePct < 60);

    const pickRandom = (arr) => arr.length === 0 ? null : arr[Math.floor(Math.random() * arr.length)];

    // eslint-disable-next-line no-unused-vars
    const _ = seed; // dependency to retrigger on seed change
    return {
      high: pickRandom(high),
      mid: pickRandom(mid),
      low: pickRandom(low),
      counts: { high: high.length, mid: mid.length, low: low.length },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentRows, seed]);

  // Fetch evidences for each sampled student
  useEffect(() => {
    if (!samples || !orgUnitId) return;
    const targets = [samples.high, samples.mid, samples.low].filter(Boolean);

    targets.forEach(async (s) => {
      if (details[s.userId]?.evidences || details[s.userId]?.loading) return;
      setDetails((prev) => ({ ...prev, [s.userId]: { loading: true } }));
      try {
        const data = await apiGet(`/gemelo/course/${orgUnitId}/student/${s.userId}`);
        const evidences = Array.isArray(data?.gradebook?.evidences)
          ? data.gradebook.evidences.filter((e) => !e.isCorte)
          : [];
        setDetails((prev) => ({
          ...prev,
          [s.userId]: { evidences, loading: false, summary: data?.summary || {} },
        }));
      } catch (e) {
        setDetails((prev) => ({
          ...prev,
          [s.userId]: { error: String(e?.message || e), loading: false, evidences: [] },
        }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, orgUnitId]);

  const reroll = () => {
    setSeed((s) => s + 1);
    setDetails({}); // clear cache so we re-fetch
  };

  if (!samples) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: 32, opacity: 0.4, marginBottom: 8 }}>📑</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>No hay datos suficientes para generar informes</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>Se necesitan estudiantes con notas calificadas.</div>
      </div>
    );
  }

  const renderSample = ({ student, label, color, bgColor, borderColor, icon, description, count }) => {
    if (!student) {
      return (
        <div style={{
          padding: 16, borderRadius: 12,
          border: "1px dashed var(--border)",
          background: "var(--bg)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            {icon} {label}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            Sin estudiantes en esta banda
          </div>
        </div>
      );
    }

    const detail = details[student.userId] || {};
    const evidences = detail.evidences || [];
    const grade10 = (student.currentPerformancePct / 10).toFixed(1);

    return (
      <div style={{
        padding: 16, borderRadius: 12,
        border: `1.5px solid ${borderColor}`,
        background: bgColor,
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {label}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{description}</div>
          </div>
          <span className="tag" style={{ background: color + "22", color: color }}>
            {count} estudiante{count !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Student card */}
        <button
          onClick={() => onStudentClick(student.userId)}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "10px 12px", borderRadius: 10,
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.5)",
            cursor: "pointer", textAlign: "left",
            fontFamily: "var(--font)",
          }}
        >
          <StudentAvatar userId={student.userId} name={student.displayName} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {student.displayName}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
              ID {student.userId} · Cobertura: {student.coveragePct != null ? `${student.coveragePct.toFixed(0)}%` : "—"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Nota</div>
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "var(--font-mono)", color: color, lineHeight: 1 }}>
              {grade10}
            </div>
          </div>
        </button>

        {/* Evidences list */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            Trabajos asociados
          </div>
          {detail.loading ? (
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: "12px 0" }}>
              Cargando trabajos...
            </div>
          ) : detail.error ? (
            <div style={{ fontSize: 11, color: "var(--critical)", textAlign: "center", padding: "12px 0" }}>
              Error al cargar
            </div>
          ) : evidences.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", padding: "12px 0", fontStyle: "italic" }}>
              Sin evidencias calificadas para mostrar
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {evidences.slice(0, 6).map((e, i) => {
                const isGraded = e.scorePct != null;
                const evColor = isGraded ? colorForPct(e.scorePct, null) : "var(--muted)";
                const hasDropbox = e.linkedDropboxId != null;
                const downloadHref = hasDropbox
                  ? apiDownloadUrl(`/brightspace/course/${orgUnitId}/dropbox/folder/${e.linkedDropboxId}/student/${student.userId}/download`)
                  : null;
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", borderRadius: 8,
                    background: "rgba(255,255,255,0.5)",
                    fontSize: 11,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: evColor, flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.name || `Ítem ${e.gradeObjectId}`}
                    </span>
                    {e.weightPct != null && (
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>
                        {Number(e.weightPct).toFixed(0)}%
                      </span>
                    )}
                    <span style={{
                      fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 12,
                      color: evColor, minWidth: 28, textAlign: "right",
                    }}>
                      {isGraded ? (Number(e.scorePct) / 10).toFixed(1) : "—"}
                    </span>
                    {hasDropbox && (
                      <>
                        <a
                          href={downloadHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Descargar entrega del estudiante (ZIP)"
                          style={{
                            fontSize: 10, fontWeight: 700,
                            padding: "3px 7px", borderRadius: 6,
                            background: "rgba(52, 120, 246, 0.12)",
                            color: "var(--brand)",
                            textDecoration: "none",
                            border: "1px solid rgba(52, 120, 246, 0.25)",
                            flexShrink: 0,
                          }}
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          ⬇
                        </a>
                        <button
                          type="button"
                          title="Ver retroalimentación del docente"
                          onClick={(ev) => { ev.stopPropagation(); openFeedback(student, e); }}
                          style={{
                            fontSize: 10, fontWeight: 700,
                            padding: "3px 7px", borderRadius: 6,
                            background: "rgba(255, 170, 0, 0.15)",
                            color: "#b27300",
                            border: "1px solid rgba(255, 170, 0, 0.3)",
                            cursor: "pointer",
                            flexShrink: 0,
                            fontFamily: "var(--font)",
                          }}
                        >
                          💬
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
              {evidences.length > 6 && (
                <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", padding: "4px 0" }}>
                  + {evidences.length - 6} evidencias más
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header with reroll button */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, padding: "12px 14px",
        background: "var(--brand-light)",
        borderRadius: 10,
        border: "1px solid var(--brand-light2, #D6E4FF)",
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--brand)" }}>
            📑 Muestras de evidencias
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            Selección aleatoria de un estudiante por banda de desempeño con sus trabajos calificados
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={reroll}
          style={{ fontSize: 12, padding: "7px 14px" }}
        >
          🔀 Generar nuevo informe
        </button>
      </div>

      {/* 3 sample cards in a grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
        {renderSample({
          student: samples.high,
          label: "Mejor calificación",
          color: COLORS.ok,
          bgColor: "var(--ok-bg)",
          borderColor: "var(--ok-border)",
          icon: "🏆",
          description: "Estudiante con desempeño sobresaliente (≥ 8.5/10)",
          count: samples.counts.high,
        })}
        {renderSample({
          student: samples.mid,
          label: "Calificación media",
          color: COLORS.brand,
          bgColor: "var(--brand-light)",
          borderColor: "var(--brand-light2, #D6E4FF)",
          icon: "📊",
          description: "Estudiante con desempeño promedio (6.0 - 8.4/10)",
          count: samples.counts.mid,
        })}
        {renderSample({
          student: samples.low,
          label: "Calificación baja",
          color: COLORS.critical,
          bgColor: "var(--critical-bg)",
          borderColor: "var(--critical-border)",
          icon: "⚠️",
          description: "Estudiante con desempeño bajo (< 6.0/10) — requiere atención",
          count: samples.counts.low,
        })}
      </div>

      <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg)", borderRadius: 8, border: "1px dashed var(--border)", fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
        💡 Estos informes son útiles para reuniones de coordinación o revisiones de calidad. Haz clic en un estudiante para abrir su gemelo digital completo. Usa ⬇ para descargar el trabajo y 💬 para ver la retroalimentación del docente.
      </div>

      {feedbackModal && (
        <div
          className="feedback-print-root"
          onClick={() => setFeedbackModal(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(15, 23, 42, 0.55)",
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            className="feedback-print-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)",
              borderRadius: 14,
              border: "1px solid var(--border)",
              maxWidth: 660, width: "100%", maxHeight: "88vh",
              overflow: "auto",
              boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
            }}
          >
            {/* Sticky header */}
            <div style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "flex-start", gap: 12,
              position: "sticky", top: 0, background: "var(--card)", zIndex: 2,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Retroalimentación del docente
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginTop: 3, lineHeight: 1.2 }}>
                  {feedbackModal.evidenceName}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                  {feedbackModal.studentName}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {feedbackModal.downloadUrl && (
                  <a
                    href={feedbackModal.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Descargar entrega del estudiante"
                    style={{
                      background: "rgba(52,120,246,0.08)", border: "1px solid rgba(52,120,246,0.25)",
                      color: "var(--brand)", borderRadius: 8,
                      fontSize: 11, fontWeight: 700,
                      padding: "6px 10px", cursor: "pointer",
                      fontFamily: "var(--font)", textDecoration: "none",
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >⬇ Entrega</a>
                )}
                <button
                  onClick={() => {
                    if (feedbackModal.loading || !feedbackModal.data) return;
                    exportInstitutionalFeedbackPdf({
                      feedback: feedbackModal.data,
                      evidenceName: feedbackModal.evidenceName,
                      studentName: feedbackModal.studentName,
                      studentId: feedbackModal.studentId,
                      courseInfo,
                      downloadUrl: feedbackModal.downloadUrl,
                    });
                  }}
                  disabled={feedbackModal.loading || !feedbackModal.data}
                  title="Generar PDF institucional CESA con la entrega completa"
                  style={{
                    background: "linear-gradient(135deg, #0B2D5C 0%, #0B5FFF 100%)",
                    border: "1px solid #0B2D5C",
                    color: "#fff", borderRadius: 8,
                    fontSize: 11, fontWeight: 800,
                    padding: "6px 10px",
                    cursor: (feedbackModal.loading || !feedbackModal.data) ? "not-allowed" : "pointer",
                    opacity: (feedbackModal.loading || !feedbackModal.data) ? 0.5 : 1,
                    fontFamily: "var(--font)",
                  }}
                >📄 Descargar informe</button>
                <button
                  onClick={() => setFeedbackModal(null)}
                  style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "var(--muted)", padding: 4, lineHeight: 1 }}
                  aria-label="Cerrar"
                >✕</button>
              </div>
            </div>

            {/* Print-only header (hidden on screen) */}
            <div className="print-only" style={{ padding: "16px 18px 0", borderBottom: "2px solid #000" }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#555" }}>
                CESA · G.D · Retroalimentación del Docente
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, margin: "4px 0 2px" }}>{feedbackModal.evidenceName}</div>
              <div style={{ fontSize: 12, color: "#555" }}>
                Estudiante: {feedbackModal.studentName} · Fecha: {new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}
              </div>
              {feedbackModal.downloadUrl && (
                <div style={{ fontSize: 10, color: "#555", marginTop: 4 }}>
                  Entrega disponible en: {feedbackModal.downloadUrl}
                </div>
              )}
            </div>

            <div style={{ padding: 18 }}>
              {feedbackModal.loading ? (
                <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: 32 }}>
                  Cargando retroalimentación...
                </div>
              ) : feedbackModal.error ? (
                <div style={{ fontSize: 12, color: "var(--critical)", padding: 12, background: "var(--critical-bg)", borderRadius: 8 }}>
                  Error: {feedbackModal.error}
                </div>
              ) : (() => {
                const fb = feedbackModal.data || {};
                const text = fb.feedbackText || "";
                const score = fb.score;
                const outOf = fb.outOf;
                const files = Array.isArray(fb.files) ? fb.files : [];
                const rubrics = Array.isArray(fb.rubrics) ? fb.rubrics : [];
                const hasContent = text || score != null || files.length > 0 || rubrics.length > 0;

                const levelColor = (level) => {
                  if (!level) return "var(--muted)";
                  const l = level.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  if (l.includes("sobresali") || l.includes("avanz") || l.includes("excelent") || l.includes("superior") || l.includes("logrado")) return "#16a34a";
                  if (l.includes("interm") || l.includes("satisf") || l.includes("aceptable") || l.includes("proficien")) return "var(--brand)";
                  if (l.includes("basi") || l.includes("elemental") || l.includes("suficiente") || l.includes("developing")) return "#d97706";
                  if (l.includes("inicial") || l.includes("no cumple") || l.includes("deficiente") || l.includes("insuficiente") || l.includes("beginning")) return "var(--critical)";
                  return "var(--muted)";
                };
                // Deriva el nivel overall de la rúbrica a partir del % real,
                // ignorando la etiqueta holística de Brightspace cuando es
                // inconsistente con la suma de criterios.
                const levelFromPct = (s, o) => {
                  if (s == null || o == null || !(o > 0)) return null;
                  const p = (s / o) * 100;
                  if (p >= 80) return "Sobresaliente";
                  if (p >= 60) return "Satisfactoria";
                  if (p >= 40) return "Básica";
                  return "Insuficiente";
                };

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

                    {/* Global score */}
                    {(score != null || outOf != null) && (
                      <div style={{
                        padding: "14px 16px", borderRadius: 12,
                        background: "linear-gradient(135deg, var(--brand-light) 0%, rgba(255,255,255,0) 100%)",
                        border: "1px solid var(--brand-light2, #D6E4FF)",
                        display: "flex", alignItems: "center", gap: 14,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                            Calificación total
                          </div>
                          {score != null && outOf != null && (
                            <div style={{ height: 6, background: "rgba(52,120,246,0.15)", borderRadius: 99, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(100, (score / outOf) * 100)}%`, background: "var(--brand)", borderRadius: 99, transition: "width 0.6s ease" }} />
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <span style={{ fontSize: 32, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--brand)", lineHeight: 1 }}>
                            {score != null ? score : "—"}
                          </span>
                          {outOf != null && (
                            <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600, marginLeft: 2 }}>
                              / {outOf}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Teacher's general comment */}
                    {text && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                          💬 Comentario del docente
                        </div>
                        <div
                          style={{
                            fontSize: 13, lineHeight: 1.65, color: "var(--text)",
                            padding: "12px 16px", borderRadius: 10,
                            background: "var(--bg)", border: "1px solid var(--border)",
                            borderLeft: "3px solid var(--brand)",
                          }}
                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }}
                        />
                      </div>
                    )}

                    {/* Rubrics */}
                    {rubrics.length > 0 && rubrics.map((r, ri) => (
                      <div key={ri} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                        {/* Rubric header */}
                        <div style={{
                          padding: "12px 16px",
                          background: "var(--bg)",
                          borderBottom: "1px solid var(--border)",
                          display: "flex", alignItems: "center", gap: 10,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              📋 Rúbrica
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>
                              {r.name || "Sin nombre"}
                            </div>
                          </div>
                          {r.score != null && (
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--brand)", lineHeight: 1 }}>
                                {r.score}
                                {r.outOf != null && <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}> / {r.outOf}</span>}
                              </div>
                              {(() => {
                                const computedLevel = levelFromPct(r.score, r.outOf) || r.level;
                                return computedLevel ? (
                                  <div style={{
                                    fontSize: 10, fontWeight: 800, marginTop: 3,
                                    padding: "2px 8px", borderRadius: 99, display: "inline-block",
                                    background: levelColor(computedLevel) + "18",
                                    color: levelColor(computedLevel),
                                    border: "1px solid " + levelColor(computedLevel) + "40",
                                  }}>
                                    {computedLevel}
                                  </div>
                                ) : null;
                              })()}
                              {r.score != null && r.outOf != null && (
                                <div style={{ height: 4, background: "var(--border)", borderRadius: 99, overflow: "hidden", marginTop: 6, width: 80 }}>
                                  <div style={{ height: "100%", width: `${Math.min(100, (r.score / r.outOf) * 100)}%`, background: levelColor(r.level) || "var(--brand)", borderRadius: 99 }} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Criteria list */}
                        {Array.isArray(r.criteria) && r.criteria.length > 0 ? (
                          r.criteria.map((c, ci) => {
                            const cColor = levelColor(c.level);
                            return (
                              <div key={ci} style={{
                                padding: "12px 16px",
                                borderTop: ci === 0 ? "none" : "1px solid var(--border)",
                                background: "var(--card)",
                                display: "flex", gap: 12,
                              }}>
                                {/* Left accent bar */}
                                <div style={{ width: 3, borderRadius: 99, background: cColor, flexShrink: 0, alignSelf: "stretch", minHeight: 24, opacity: 0.7 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: c.comment ? 6 : 0 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", flex: 1, lineHeight: 1.35 }}>
                                      {c.name}
                                    </span>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                      {c.level && (
                                        <span style={{
                                          fontSize: 10, fontWeight: 800,
                                          padding: "2px 8px", borderRadius: 99,
                                          background: cColor + "18",
                                          color: cColor,
                                          border: "1px solid " + cColor + "40",
                                          whiteSpace: "nowrap",
                                        }}>
                                          {c.level}
                                        </span>
                                      )}
                                      {c.points != null && (
                                        <span style={{
                                          fontSize: 14, fontWeight: 900,
                                          fontFamily: "var(--font-mono)", color: cColor,
                                          minWidth: 28, textAlign: "right",
                                        }}>
                                          {c.points}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {c.comment && (
                                    <div
                                      style={{
                                        fontSize: 12, color: "var(--muted)",
                                        lineHeight: 1.55,
                                        padding: "7px 10px",
                                        background: "var(--bg)",
                                        borderRadius: 7,
                                        borderLeft: "2px solid " + cColor + "60",
                                      }}
                                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.comment) }}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", padding: "12px 16px" }}>
                            Rúbrica sin criterios evaluados
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Teacher's attached files */}
                    {files.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                          📎 Archivos adjuntos del docente ({files.length})
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {files.map((f, idx) => (
                            <div key={idx} style={{
                              fontSize: 12, padding: "8px 12px",
                              background: "var(--bg)", borderRadius: 8,
                              border: "1px solid var(--border)",
                              display: "flex", alignItems: "center", gap: 8,
                            }}>
                              <span style={{ fontSize: 14, flexShrink: 0 }}>📄</span>
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {f.FileName || f.Name || `Archivo ${idx + 1}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!hasContent && (
                      <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", textAlign: "center", padding: 28 }}>
                        Sin retroalimentación registrada para esta entrega.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
