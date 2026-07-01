import React, { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { apiGet } from "../../utils/api";
import { COLORS, colorForPct } from "../../utils/colors";
import { fmtPct, fmtGrade10FromPct, computeRiskFromPct } from "../../utils/helpers";
import { isStudentRole } from "../../utils/roles";

/**
 * CoursesComparison: lists the teacher's other courses side-by-side
 * with the current one, showing avg grade, at-risk %, coverage.
 *
 * Fetches overview for each course on-demand (parallel).
 */
export default function CoursesComparison({ currentOrgUnitId, onSelectCourse }) {
  const [courses, setCourses] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);

  // Load teacher's courses (only where they're instructor)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet("/brightspace/courses/enrolled?active_only=true&limit=50");
        if (!alive) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        const teacherCourses = items.filter((c) => !isStudentRole(c.roleName));
        setCourses(teacherCourses);
      } catch {
        // silent
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Fetch overview for each course in parallel (once courses are loaded)
  useEffect(() => {
    if (courses.length === 0) return;
    let alive = true;
    (async () => {
      const results = {};
      await Promise.all(
        courses.map(async (c) => {
          try {
            const ov = await apiGet(`/gemelo/course/${c.id}/overview`);
            if (!alive) return;
            const atRiskCount = Number(ov?.studentsAtRisk?.length ?? 0);
            const totalStudents = Number(ov?.studentsCount ?? 0);
            results[c.id] = {
              avgPct: ov?.courseGradebook?.avgCurrentPerformancePct ?? null,
              avgCoverage: ov?.courseGradebook?.avgCoveragePct ?? null,
              atRiskCount,
              totalStudents,
              atRiskPct: totalStudents > 0 ? (atRiskCount / totalStudents) * 100 : null,
            };
          } catch {
            results[c.id] = { error: true };
          }
        })
      );
      if (alive) setMetrics((prev) => ({ ...prev, ...results }));
    })();
    return () => { alive = false; };
  }, [courses]);

  if (loading) {
    return (
      <div style={{ padding: "24px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
        Cargando mis cursos…
      </div>
    );
  }

  if (courses.length <= 1) {
    return (
      <div className="empty-v2" style={{ padding: "22px 16px" }}>
        <div className="empty-v2-icon">
          <BookOpen size={26} strokeWidth={1.8} />
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>No hay otros cursos para comparar.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        Comparativa con tus otros cursos. Haz clic para abrir.
      </div>
      {courses.map((c) => {
        const isCurrent = Number(c.id) === Number(currentOrgUnitId);
        const m = metrics[c.id] || {};
        const avgGrade = m.avgPct != null ? (m.avgPct / 10).toFixed(1) : "—";
        const gradeColor = m.avgPct != null ? colorForPct(m.avgPct, null) : "var(--muted)";
        return (
          <button
            key={c.id}
            onClick={() => !isCurrent && onSelectCourse?.(c.id)}
            disabled={isCurrent}
            aria-label={`Comparar con ${c.name}`}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", borderRadius: 10,
              border: `1.5px solid ${isCurrent ? "var(--brand)" : "var(--border)"}`,
              background: isCurrent ? "var(--brand-light)" : "var(--bg)",
              cursor: isCurrent ? "default" : "pointer",
              textAlign: "left",
              fontFamily: "var(--font)",
              width: "100%",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {isCurrent && "→ "}{c.name}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>
                {m.totalStudents != null ? `${m.totalStudents} estudiantes` : "Cargando..."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700 }}>NOTA</div>
                <div style={{ fontSize: 14, fontWeight: 900, fontFamily: "var(--font-mono)", color: gradeColor }}>
                  {avgGrade}
                </div>
              </div>
              <div style={{ textAlign: "center", minWidth: 42 }}>
                <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700 }}>RIESGO</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: m.atRiskPct > 30 ? COLORS.critical : m.atRiskPct > 15 ? COLORS.watch : COLORS.ok }}>
                  {m.atRiskPct != null ? `${m.atRiskPct.toFixed(0)}%` : "—"}
                </div>
              </div>
              <div style={{ textAlign: "center", minWidth: 42 }}>
                <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700 }}>COB</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>
                  {m.avgCoverage != null ? `${m.avgCoverage.toFixed(0)}%` : "—"}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
