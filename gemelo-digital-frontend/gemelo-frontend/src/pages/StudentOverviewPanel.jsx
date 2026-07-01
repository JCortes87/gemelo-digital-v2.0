import React, { useState, useEffect, useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { apiGet, mapLimit } from "../utils/api";
import { COLORS, colorForPct } from "../utils/colors";
import { computeRiskFromPct, fmtPct, fmtGrade10FromPct } from "../utils/helpers";
import { injectStyles } from "../styles/global";
import Skeleton, { SkeletonList } from "../components/ui/Skeleton";
import { downloadCsv } from "../utils/export";

/**
 * StudentOverviewPanel — SuperAdmin panel that shows a single student's
 * performance across ALL their enrolled courses.
 *
 * Props:
 *   userId:  Brightspace user ID to query
 *   onClose: callback to close the overlay
 */
export default function StudentOverviewPanel({ userId, period, onClose }) {
  useEffect(() => { injectStyles(); }, []);

  const [userInfo, setUserInfo] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseMetrics, setCourseMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("grade");

  // 1. Load user info + enrolled courses
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setCourses([]);
    setCourseMetrics({});
    setUserInfo(null);

    (async () => {
      try {
        // Fetch user info and enrollments in parallel
        const [userRes, coursesRes] = await Promise.allSettled([
          apiGet(`/brightspace/users/${userId}`),
          apiGet(`/brightspace/courses/enrolled?user_id=${userId}&active_only=true&limit=200${period ? `&period=${encodeURIComponent(period)}` : ""}`),
        ]);

        if (!alive) return;

        if (userRes.status === "fulfilled") {
          const u = userRes.value;
          setUserInfo({
            userId: u.UserId || u.Identifier || userId,
            name: `${u.FirstName || ""} ${u.LastName || ""}`.trim() || `Usuario ${userId}`,
            email: u.UserName || u.ExternalEmail || u.UniqueName || "",
            orgDefinedId: u.OrgDefinedId || "",
          });
        } else {
          setUserInfo({ userId, name: `Usuario ${userId}`, email: "" });
        }

        if (coursesRes.status === "fulfilled") {
          const items = Array.isArray(coursesRes.value?.items) ? coursesRes.value.items : [];
          setCourses(items);
        } else {
          throw coursesRes.reason || new Error("No se pudieron cargar los cursos");
        }
      } catch (e) {
        if (alive) setError(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [userId, period]);

  // 2. Load per-course metrics for this student (rate-limited)
  useEffect(() => {
    if (courses.length === 0 || !userId) return;
    let alive = true;
    setLoadingMetrics(true);

    (async () => {
      await mapLimit(courses, 5, async (course) => {
        if (!alive) return;
        const courseId = course.id || course.orgUnitId;
        if (!courseId) return;
        try {
          const data = await apiGet(`/gemelo/course/${courseId}/student/${userId}`);
          if (!alive) return;
          const summary = data?.summary || {};
          setCourseMetrics((prev) => ({
            ...prev,
            [courseId]: {
              loaded: true,
              grade: summary.currentPerformancePct,
              coverage: summary.coveragePct,
              risk: computeRiskFromPct(summary.currentPerformancePct),
              pendingCount: summary.pendingUngradedCount || 0,
              overdueCount: summary.overdueUnscoredCount || 0,
              gradedCount: summary.gradedItemsCount || 0,
              totalItems: summary.totalItemsCount || 0,
            },
          }));
        } catch {
          if (!alive) return;
          setCourseMetrics((prev) => ({
            ...prev,
            [courseId]: { loaded: true, error: true },
          }));
        }
      });
      if (alive) setLoadingMetrics(false);
    })();

    return () => { alive = false; };
  }, [courses, userId]);

  // Derived: merge courses with metrics
  const enrichedCourses = useMemo(() => {
    return courses.map((c) => {
      const id = c.id || c.orgUnitId;
      const m = courseMetrics[id] || {};
      return {
        ...c,
        courseId: id,
        grade: m.grade ?? null,
        coverage: m.coverage ?? null,
        risk: m.risk ?? "pending",
        pendingCount: m.pendingCount ?? 0,
        overdueCount: m.overdueCount ?? 0,
        gradedCount: m.gradedCount ?? 0,
        totalItems: m.totalItems ?? 0,
        loaded: m.loaded ?? false,
        metricError: m.error ?? false,
      };
    });
  }, [courses, courseMetrics]);

  // Filtered + sorted
  const filteredCourses = useMemo(() => {
    let list = enrichedCourses;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.code || "").toLowerCase().includes(q) ||
        String(c.courseId).includes(q)
      );
    }

    // Risk filter
    if (riskFilter !== "all") {
      list = list.filter((c) => c.risk === riskFilter);
    }

    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === "grade") {
        const ga = a.grade ?? -1, gb = b.grade ?? -1;
        return ga - gb; // worst first
      }
      if (sortBy === "coverage") {
        const ca = a.coverage ?? -1, cb = b.coverage ?? -1;
        return ca - cb;
      }
      if (sortBy === "name") {
        return (a.name || "").localeCompare(b.name || "", "es");
      }
      return 0;
    });

    return list;
  }, [enrichedCourses, search, riskFilter, sortBy]);

  // KPI aggregates
  const kpis = useMemo(() => {
    const loaded = enrichedCourses.filter((c) => c.loaded && !c.metricError);
    const withGrade = loaded.filter((c) => c.grade != null);
    const withCoverage = loaded.filter((c) => c.coverage != null);
    const avgGrade = withGrade.length > 0
      ? withGrade.reduce((s, c) => s + c.grade, 0) / withGrade.length
      : null;
    const avgCoverage = withCoverage.length > 0
      ? withCoverage.reduce((s, c) => s + c.coverage, 0) / withCoverage.length
      : null;
    const atRisk = loaded.filter((c) => c.risk === "alto" || c.risk === "medio").length;
    return {
      totalCourses: courses.length,
      loadedCourses: loaded.length,
      avgGrade,
      avgCoverage,
      atRisk,
    };
  }, [enrichedCourses, courses]);

  if (!userId) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "var(--bg)", overflow: "auto",
      fontFamily: "var(--font)",
    }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 10,
        background: "rgba(255,255,255,0.9)", backdropFilter: "blur(16px) saturate(180%)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 56,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "var(--brand)", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 10, fontWeight: 900,
          }}>CESA</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>G.D</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Panel Estudiante · Super Admin
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "var(--brand)", color: "#fff", border: "none",
            borderRadius: 8, padding: "7px 14px", fontSize: 12,
            fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)",
          }}
        >
          ✕ Cerrar
        </button>
      </header>

      <main style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Student Info Header */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
            G.D · Rendimiento General{period ? ` · Período ${period}` : ""}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "var(--brand)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 900, flexShrink: 0,
            }}>
              {(userInfo?.name || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em", margin: 0 }}>
                {userInfo?.name || "Cargando..."}
              </h1>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                ID {userId}
                {userInfo?.email && <> · {userInfo.email}</>}
                {userInfo?.orgDefinedId && <> · {userInfo.orgDefinedId}</>}
              </div>
            </div>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div style={{
            padding: "16px 20px", borderRadius: 12,
            background: "var(--critical-bg)", color: COLORS.critical,
            fontSize: 13, fontWeight: 600, marginBottom: 20,
            border: `1px solid ${COLORS.critical}33`,
          }}>
            Error: {error}
          </div>
        )}

        {/* Loading state — skeleton */}
        {loading ? (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="card" lines={2} />)}
            </div>
            <SkeletonList count={6} variant="row" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
              <KpiCard label="Cursos" value={kpis.totalCourses} sub={loadingMetrics ? `${kpis.loadedCourses} cargados...` : `${kpis.loadedCourses} con datos`} />
              <KpiCard
                label="Promedio General"
                value={kpis.avgGrade != null ? (kpis.avgGrade / 10).toFixed(1) : "—"}
                sub={kpis.avgGrade != null ? `/10` : "sin datos"}
                valueColor={kpis.avgGrade != null ? colorForPct(kpis.avgGrade) : "var(--muted)"}
              />
              <KpiCard
                label="Cobertura Promedio"
                value={kpis.avgCoverage != null ? `${kpis.avgCoverage.toFixed(1)}%` : "—"}
                sub="ítems calificados"
                valueColor={kpis.avgCoverage != null ? colorForPct(kpis.avgCoverage) : "var(--muted)"}
              />
              <KpiCard
                label="Cursos en Riesgo"
                value={kpis.atRisk}
                sub={`de ${kpis.loadedCourses}`}
                valueColor={kpis.atRisk > 0 ? COLORS.critical : COLORS.ok}
              />
            </div>

            {/* Progress indicator (#7) */}
            {loadingMetrics && kpis.totalCourses > 0 && (
              <div
                role="progressbar"
                aria-valuenow={kpis.loadedCourses}
                aria-valuemin={0}
                aria-valuemax={kpis.totalCourses}
                aria-label={`Analizando curso ${kpis.loadedCourses} de ${kpis.totalCourses}`}
                style={{
                  marginBottom: 16, padding: "10px 14px",
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>
                  <span>Analizando curso {kpis.loadedCourses} de {kpis.totalCourses}</span>
                  <span>{Math.round((kpis.loadedCourses / kpis.totalCourses) * 100)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "rgba(148,163,184,0.18)", overflow: "hidden" }}>
                  <div style={{
                    width: `${(kpis.loadedCourses / kpis.totalCourses) * 100}%`,
                    height: "100%", background: "var(--brand)",
                    transition: "width 0.4s ease",
                  }} />
                </div>
              </div>
            )}

            {/* Evolution chart (#10) — avg grade per semester */}
            {(() => {
              const bySem = {};
              for (const c of enrichedCourses) {
                if (!c.loaded || c.metricError || c.grade == null) continue;
                const k = c.semesterCode || "Sin período";
                if (!bySem[k]) bySem[k] = { sem: k, sum: 0, n: 0 };
                bySem[k].sum += c.grade;
                bySem[k].n += 1;
              }
              const data = Object.values(bySem)
                .map((s) => ({ sem: s.sem, grade: +(s.sum / s.n / 10).toFixed(2), count: s.n }))
                .sort((a, b) => String(a.sem).localeCompare(String(b.sem)));
              if (data.length < 2) return null;
              return (
                <div style={{
                  marginBottom: 16, padding: "14px 16px",
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 12,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8, letterSpacing: "-0.01em" }}>
                    Evolución por período · nota promedio /10
                  </div>
                  <div style={{ width: "100%", height: 180 }}>
                    <ResponsiveContainer>
                      <LineChart data={data} margin={{ top: 6, right: 18, left: 0, bottom: 4 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="sem" tick={{ fontSize: 11, fill: "var(--muted)" }} />
                        <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: "var(--muted)" }} width={28} />
                        <Tooltip
                          contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                          formatter={(v, _n, p) => [`${v} /10 (${p.payload.count} curso${p.payload.count !== 1 ? "s" : ""})`, "Promedio"]}
                        />
                        <ReferenceLine y={7} stroke={COLORS.ok} strokeDasharray="4 4" />
                        <ReferenceLine y={5} stroke={COLORS.critical} strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="grade" stroke={COLORS.brand} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.brand }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}

            {/* Filters */}
            <div style={{
              display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16,
              padding: "12px 16px", background: "var(--card)",
              borderRadius: 12, border: "1px solid var(--border)",
            }}>
              <input
                type="text"
                placeholder="Buscar curso..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: "1 1 200px", padding: "8px 12px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--text)", fontSize: 12, fontFamily: "var(--font)", outline: "none",
                }}
              />
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                style={{
                  padding: "8px 12px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--text)", fontSize: 12, fontFamily: "var(--font)", cursor: "pointer",
                }}
              >
                <option value="all">Todos los estados</option>
                <option value="alto">Alto riesgo</option>
                <option value="medio">Riesgo medio</option>
                <option value="bajo">Bajo riesgo</option>
                <option value="pending">Sin datos</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  padding: "8px 12px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--text)", fontSize: 12, fontFamily: "var(--font)", cursor: "pointer",
                }}
              >
                <option value="grade">Ordenar por nota</option>
                <option value="coverage">Ordenar por cobertura</option>
                <option value="name">Ordenar por nombre</option>
              </select>
              {(search || riskFilter !== "all") && (
                <button
                  onClick={() => { setSearch(""); setRiskFilter("all"); }}
                  style={{
                    padding: "8px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "var(--bg)",
                    color: "var(--muted)", fontSize: 11, fontWeight: 700,
                    cursor: "pointer", fontFamily: "var(--font)",
                  }}
                >
                  Limpiar filtros
                </button>
              )}
              <button
                onClick={() => {
                  const headers = ["ID Curso", "Curso", "Código", "Período", "Rol", "Nota /10", "Cobertura %", "Riesgo", "Calificadas", "Total ítems", "Vencidas"];
                  const rows = filteredCourses.map((c) => [
                    c.courseId,
                    c.name || "",
                    c.code || "",
                    c.semesterCode || "",
                    c.roleName || "",
                    c.grade != null ? (c.grade / 10).toFixed(1) : "",
                    c.coverage != null ? c.coverage.toFixed(1) : "",
                    c.risk || "",
                    c.gradedCount,
                    c.totalItems,
                    c.overdueCount,
                  ]);
                  const ts = new Date().toISOString().slice(0, 10);
                  const safeName = (userInfo?.name || `usuario_${userId}`).replace(/[^\w]+/g, "_").slice(0, 40);
                  downloadCsv(`gemelo_estudiante_${safeName}_${ts}.csv`, headers, rows);
                }}
                disabled={filteredCourses.length === 0}
                title="Descargar CSV con los cursos filtrados"
                style={{
                  padding: "8px 12px", borderRadius: 8,
                  border: "1px solid var(--brand)", background: "var(--brand)",
                  color: "#fff", fontSize: 11, fontWeight: 800,
                  cursor: filteredCourses.length === 0 ? "not-allowed" : "pointer",
                  opacity: filteredCourses.length === 0 ? 0.5 : 1,
                  fontFamily: "var(--font)",
                }}
              >
                ⬇ Exportar CSV
              </button>
            </div>

            {/* Courses Table */}
            {filteredCourses.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "40px 20px", color: "var(--muted)",
                background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: 32, opacity: 0.4, marginBottom: 8 }}>📚</div>
                {courses.length === 0
                  ? "Este usuario no tiene cursos activos."
                  : `Sin resultados para los filtros aplicados (${courses.length} cursos totales).`
                }
              </div>
            ) : (
              <div style={{
                background: "var(--card)", borderRadius: 12,
                border: "1px solid var(--border)", overflow: "hidden",
              }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--bg)" }}>
                      <th style={thStyle}>Curso</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 80 }}>Nota</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 90 }}>Cobertura</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 90 }}>Estado</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 100 }}>Evidencias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCourses.map((c) => (
                      <tr key={c.courseId} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>
                            {c.name || `Curso ${c.courseId}`}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                            ID {c.courseId}
                            {c.code && <> · {c.code}</>}
                            {c.semesterCode && (
                              <span style={{
                                marginLeft: 6, fontSize: 9, fontWeight: 700,
                                padding: "1px 6px", borderRadius: 4,
                                background: "rgba(255, 170, 0, 0.12)", color: "#b27300",
                              }}>{c.semesterCode}</span>
                            )}
                            {c.roleName && (
                              <span style={{
                                marginLeft: 6, fontSize: 9, fontWeight: 700,
                                padding: "1px 6px", borderRadius: 4,
                                background: "var(--brand-light)", color: "var(--brand)",
                              }}>{c.roleName}</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          {c.loaded ? (
                            c.metricError ? (
                              <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>
                            ) : (
                              <span style={{
                                fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 900,
                                color: c.grade != null ? colorForPct(c.grade) : "var(--muted)",
                              }}>
                                {c.grade != null ? fmtGrade10FromPct(c.grade) : "—"}
                              </span>
                            )
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--muted)" }}>···</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          {c.loaded && !c.metricError ? (
                            <span style={{ fontWeight: 600, color: c.coverage != null ? colorForPct(c.coverage) : "var(--muted)" }}>
                              {c.coverage != null ? fmtPct(c.coverage) : "—"}
                            </span>
                          ) : c.loaded ? (
                            <span style={{ color: "var(--muted)" }}>—</span>
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--muted)" }}>···</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {c.loaded && !c.metricError ? (
                            <RiskBadge risk={c.risk} />
                          ) : c.loaded ? (
                            <span style={{ color: "var(--muted)", fontSize: 10 }}>error</span>
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--muted)" }}>···</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          {c.loaded && !c.metricError ? (
                            <div style={{ fontSize: 11 }}>
                              <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                                {c.gradedCount}/{c.totalItems}
                              </span>
                              {c.overdueCount > 0 && (
                                <span style={{
                                  marginLeft: 4, fontSize: 9, fontWeight: 800,
                                  padding: "1px 5px", borderRadius: 4,
                                  background: "var(--critical-bg)", color: COLORS.critical,
                                }}>
                                  {c.overdueCount} vencidas
                                </span>
                              )}
                            </div>
                          ) : c.loaded ? (
                            <span style={{ color: "var(--muted)" }}>—</span>
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--muted)" }}>···</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            <div style={{ textAlign: "center", padding: "20px 0", fontSize: 11, color: "var(--muted)" }}>
              {filteredCourses.length} de {courses.length} curso{courses.length !== 1 ? "s" : ""}
              {loadingMetrics && " · Cargando métricas..."}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Micro components ──

const thStyle = {
  padding: "10px 14px",
  fontSize: 10,
  fontWeight: 800,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  textAlign: "left",
  borderBottom: "2px solid var(--border)",
};

function KpiCard({ label, value, sub, valueColor }) {
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 12,
      background: "var(--card)", border: "1px solid var(--border)",
      boxShadow: "var(--shadow)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{
        fontSize: 26, fontWeight: 900, color: valueColor || "var(--text)",
        fontFamily: "var(--font-mono)", letterSpacing: "-0.02em", marginTop: 4,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function RiskBadge({ risk }) {
  const config = {
    alto: { bg: "var(--critical-bg)", color: COLORS.critical, label: "Alto" },
    medio: { bg: "var(--watch-bg)", color: COLORS.watch, label: "Medio" },
    bajo: { bg: "var(--ok-bg)", color: COLORS.ok, label: "Bajo" },
    pending: { bg: "var(--pending-bg)", color: "var(--muted)", label: "—" },
  };
  const cfg = config[risk] || config.pending;
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 99,
      background: cfg.bg, color: cfg.color,
      textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      {cfg.label}
    </span>
  );
}
