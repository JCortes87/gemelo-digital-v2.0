import React, { useMemo, useState } from "react";
import { predictClassFailures, predictFinalGrade } from "../../utils/prediction";
import { COLORS, colorForPct } from "../../utils/colors";

/**
 * Class-level grade prediction summary.
 *
 * Uses a deterministic projection (NOT machine learning):
 *   expected_final = (current_pct × coverage%) + (current_pct × (100 - coverage%))
 *   ≡ current_pct  (assumes student maintains current performance)
 *
 * Categories:
 *   - Reprobará:  expected < 50% (4.9 / 10)
 *   - En el límite (borderline): 50-60% (5.0 - 5.9 / 10)
 *   - Aprobará: ≥ 60% (≥ 6.0 / 10)
 *
 * Confidence grows with coverage (more graded items = more reliable projection).
 *
 * Props:
 *   studentRows
 *   onStudentClick: (userId) => void
 *   courseInfo: { Name, StartDate, EndDate }
 *   variant: "compact" | "full"
 */
function GradePredictions({
  studentRows = [],
  onStudentClick = () => {},
  courseInfo = null,
  variant = "compact",
}) {
  const [showHelp, setShowHelp] = useState(false);

  const { willFail, borderline, willPass, total } = useMemo(
    () => predictClassFailures(studentRows),
    [studentRows]
  );

  const fmtDate = (iso) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "2-digit" });
    } catch { return null; }
  };

  const startDateStr = fmtDate(courseInfo?.StartDate);
  const endDateStr = fmtDate(courseInfo?.EndDate);

  const { daysElapsed, daysRemaining, progressPct } = useMemo(() => {
    if (!courseInfo?.StartDate || !courseInfo?.EndDate) {
      return { daysElapsed: null, daysRemaining: null, progressPct: null };
    }
    try {
      const start = new Date(courseInfo.StartDate).getTime();
      const end = new Date(courseInfo.EndDate).getTime();
      const now = Date.now();
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        return { daysElapsed: null, daysRemaining: null, progressPct: null };
      }
      const total = end - start;
      const elapsed = Math.max(0, now - start);
      const remaining = Math.max(0, end - now);
      return {
        daysElapsed: Math.floor(elapsed / 86400000),
        daysRemaining: Math.floor(remaining / 86400000),
        progressPct: Math.min(100, Math.max(0, (elapsed / total) * 100)),
      };
    } catch {
      return { daysElapsed: null, daysRemaining: null, progressPct: null };
    }
  }, [courseInfo]);

  // Average confidence across students
  const avgConfidence = useMemo(() => {
    const preds = studentRows
      .map(s => predictFinalGrade(s))
      .filter(p => p != null);
    if (preds.length === 0) return null;
    return Math.round(preds.reduce((a, p) => a + p.confidence, 0) / preds.length);
  }, [studentRows]);

  if (total === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
        <div style={{ fontSize: 28, opacity: 0.4, marginBottom: 6 }}>🔮</div>
        <div style={{ fontSize: 12 }}>Sin datos suficientes para predecir notas finales.</div>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
          Se necesitan estudiantes con al menos algo de cobertura calificada.
        </div>
      </div>
    );
  }

  const failPct = Math.round((willFail.length / total) * 100);
  const borderPct = Math.round((borderline.length / total) * 100);
  const passPct = Math.round((willPass.length / total) * 100);

  const StudentList = ({ list, color, bgColor, borderColor, label, icon }) => (
    <div style={{
      padding: 14, background: bgColor, border: `1px solid ${borderColor}`,
      borderRadius: 12, marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {label} ({list.length})
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: variant === "full" ? 360 : 200, overflowY: "auto" }}>
        {list.map(({ student, pred }) => {
          const grade10 = pred.expectedGrade10.toFixed(1);
          return (
            <button
              key={student.userId}
              onClick={() => onStudentClick(student.userId)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(255,255,255,0.4)",
                cursor: "pointer",
                fontSize: 12, fontFamily: "var(--font)", textAlign: "left",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.95)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {student.displayName}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                  Nota actual: {student.currentPerformancePct != null ? (student.currentPerformancePct / 10).toFixed(1) : "—"}/10
                  {" · "}Cobertura: {student.coveragePct != null ? `${student.coveragePct.toFixed(0)}%` : "—"}
                  {" · "}Confianza: {pred.confidence}%
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>Proyección</div>
                <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "var(--font-mono)", color: color, lineHeight: 1 }}>
                  {grade10}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div>
      {/* Course timeline header (full variant only) */}
      {variant === "full" && (startDateStr || endDateStr) && (
        <div style={{
          marginBottom: 16, padding: "14px 16px",
          borderRadius: 12, background: "var(--brand-light)",
          border: "1px solid var(--brand-light2, #D6E4FF)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            📅 Línea de tiempo del curso
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
            {startDateStr && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Inicio</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{startDateStr}</div>
              </div>
            )}
            {endDateStr && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Finaliza</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{endDateStr}</div>
              </div>
            )}
          </div>
          {progressPct != null && (
            <div>
              <div style={{ height: 8, borderRadius: 99, background: "rgba(255,255,255,0.6)", overflow: "hidden", marginBottom: 6 }}>
                <div style={{ width: `${progressPct}%`, height: "100%", background: "var(--brand)", borderRadius: 99 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)" }}>
                <span>{daysElapsed} días transcurridos</span>
                <span style={{ fontWeight: 700, color: "var(--brand)" }}>{progressPct.toFixed(0)}% completado</span>
                <span>{daysRemaining} días restantes</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* How it works — collapsible */}
      <div style={{
        marginBottom: 12,
        padding: "10px 14px",
        background: "var(--bg)",
        borderRadius: 10,
        border: "1px solid var(--border)",
      }}>
        <button
          onClick={() => setShowHelp(v => !v)}
          aria-expanded={showHelp}
          style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 700, color: "var(--brand)",
            padding: 0,
          }}
        >
          <span>{showHelp ? "▾" : "▸"}</span>
          <span>¿Cómo funciona la predicción?</span>
        </button>
        {showHelp && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 8px" }}>
              La predicción <strong>NO usa machine learning</strong>. Es una proyección determinística simple:
            </p>
            <div style={{ background: "var(--card)", padding: 10, borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 11, marginBottom: 8 }}>
              <div>• Tomamos la nota actual del estudiante (sobre el % calificado del curso).</div>
              <div>• Asumimos que mantendrá ese mismo desempeño en el % restante.</div>
              <div>• La nota proyectada = nota actual.</div>
            </div>
            <p style={{ margin: "0 0 8px" }}>
              La <strong>confianza</strong> crece con la cobertura calificada: si solo se ha
              calificado el 20% del curso, la proyección es muy especulativa (confianza 20%).
              Si está en 80%, la proyección es muy fiable.
            </p>
            <p style={{ margin: 0, fontStyle: "italic", color: "var(--muted)" }}>
              Categorías:&nbsp;
              <span style={{ color: COLORS.critical, fontWeight: 700 }}>Reprobará (&lt;5.0)</span> ·{" "}
              <span style={{ color: COLORS.watch, fontWeight: 700 }}>En el límite (5.0–5.9)</span> ·{" "}
              <span style={{ color: COLORS.ok, fontWeight: 700 }}>Aprobará (≥6.0)</span>
            </p>
          </div>
        )}
      </div>

      {/* Headline summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--critical-border)", background: "var(--critical-bg)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--critical)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>Reprobarán</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.critical, fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {willFail.length}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>{failPct}% del curso</div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--watch-border)", background: "var(--watch-bg)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--watch)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>En el límite</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.watch, fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {borderline.length}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>{borderPct}% del curso</div>
        </div>
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--ok-border)", background: "var(--ok-bg)", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "var(--ok)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>Aprobarán</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.ok, fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {willPass.length}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>{passPct}% del curso</div>
        </div>
      </div>

      {/* Confidence indicator */}
      {avgConfidence != null && (
        <div style={{
          marginBottom: 14, padding: "8px 12px",
          background: "var(--bg)", borderRadius: 8,
          border: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 14 }}>📊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text)" }}>
              Confianza promedio: {avgConfidence}%
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              {avgConfidence < 30
                ? "Muy especulativa — el curso está empezando."
                : avgConfidence < 60
                ? "Moderada — todavía puede cambiar significativamente."
                : "Alta — proyecciones fiables."}
            </div>
          </div>
          <div style={{ width: 80, height: 6, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
            <div style={{
              width: `${avgConfidence}%`, height: "100%",
              background: avgConfidence > 60 ? "var(--ok)" : avgConfidence > 30 ? "var(--watch)" : "var(--critical)",
              borderRadius: 99,
            }} />
          </div>
        </div>
      )}

      {/* Detailed lists */}
      {willFail.length > 0 && (
        <StudentList
          list={variant === "full" ? willFail : willFail.slice(0, 5)}
          color={COLORS.critical}
          bgColor="var(--critical-bg)"
          borderColor="var(--critical-border)"
          label="⚠️ Alto riesgo de reprobación"
          icon="🔴"
        />
      )}

      {borderline.length > 0 && (
        <StudentList
          list={variant === "full" ? borderline : borderline.slice(0, 5)}
          color={COLORS.watch}
          bgColor="var(--watch-bg)"
          borderColor="var(--watch-border)"
          label="🟡 En el límite"
          icon="⚖️"
        />
      )}

      {variant === "full" && willPass.length > 0 && (
        <StudentList
          list={willPass}
          color={COLORS.ok}
          bgColor="var(--ok-bg)"
          borderColor="var(--ok-border)"
          label="✅ En camino a aprobar"
          icon="✅"
        />
      )}
    </div>
  );
}

export default React.memo(GradePredictions);
