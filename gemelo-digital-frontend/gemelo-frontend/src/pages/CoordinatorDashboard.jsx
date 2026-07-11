import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiGetCached } from "../utils/api";
import { fmtPct, fmtGrade10FromPct, computeRiskFromPct } from "../utils/helpers";
import { COLORS, colorForPct } from "../utils/colors";
import { injectStyles } from "../styles/global";
import Breadcrumb from "../components/ui/Breadcrumb";
import { isStudentRole } from "../utils/roles";

/**
 * CoordinatorDashboard: aggregated view of courses filtered by the user.
 * Shows a filter screen first (semester, category, search term) before
 * loading any data, to avoid fetching everything upfront.
 */
export default function CoordinatorDashboard({ onClose }) {
  useEffect(() => { injectStyles(); }, []);
  const navigate = useNavigate();
  const { authUser, logout } = useAuth();

  // ── Phase 1: pre-cargar el catálogo de cursos del coordinador ──────────────
  // Se usa para (a) derivar los períodos disponibles del propio listado —igual
  // que el panel de profesor, en lugar del endpoint /semesters que llega vacío—
  // y (b) filtrar por período/categoría/nombre en cliente, que es más confiable
  // que el filtro server-side por `period=`.
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      setCatalogLoading(true);
      // Mismo patrón que el panel de profesor (RoleHome): si el endpoint
      // principal `courses/enrolled` falla, caer a `my-course-offerings`.
      // Sin este fallback el catálogo quedaba vacío y el dropdown de períodos
      // solo mostraba "Todos los períodos".
      try {
        let items = [];
        try {
          const data = await apiGet("/brightspace/courses/enrolled?active_only=false&limit=500");
          items = (Array.isArray(data?.items) ? data.items : []).filter((c) => !isStudentRole(c.roleName));
        } catch {
          const data = await apiGet("/brightspace/my-course-offerings?active_only=false&limit=50");
          items = (Array.isArray(data?.items) ? data.items : []).map((c) => ({ ...c, roleName: "Instructor" }));
        }
        if (alive) setCatalog(items);
      } catch {
        if (alive) setCatalog([]);
      } finally {
        if (alive) setCatalogLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Filter form state (shown BEFORE loading) ─────────────────────────────
  const [filterSemester, setFilterSemester] = useState("");    // semesterCode e.g. "202510"
  const [filterCategory, setFilterCategory] = useState("all"); // pregrado/posgrado/aula/etc
  const [filterSearch, setFilterSearch] = useState("");        // free-text name search

  // ── Phase 2: loaded data ─────────────────────────────────────────────────
  const [hasSearched, setHasSearched] = useState(false);
  const [courses, setCourses] = useState([]);
  const [courseMetrics, setCourseMetrics] = useState({});
  const [sortBy, setSortBy] = useState("atRiskPct");

  const KNOWN_CATEGORIES = [
    { value: "all", label: "Todas las categorías" },
    { value: "PREGRADO", label: "Pregrado" },
    { value: "POSGRADO", label: "Posgrado / Maestría" },
    { value: "AULA", label: "Aula" },
    { value: "DIPLOMADO", label: "Diplomado" },
    { value: "EDUCACIÓN CONTINUA", label: "Educación Continua" },
    { value: "DESARROLLO", label: "Desarrollo" },
  ];

  // ── Triggered when user clicks "Buscar cursos" ───────────────────────────
  // Filtra en cliente el catálogo ya cargado (por período) y dispara la carga
  // de métricas solo para el subconjunto resultante. El filtro por categoría y
  // nombre se aplica en `sortedCourses` (useMemo) de forma reactiva.
  const handleSearch = () => {
    setHasSearched(true);
    setCourseMetrics({});
    const relevant = filterSemester
      ? catalog.filter((c) => extractSemester(c) === filterSemester)
      : catalog.slice();
    setCourses(relevant);
  };

  // ── Load metrics for each course (rate-limited) ───────────────────────────
  useEffect(() => {
    if (courses.length === 0) return;
    let alive = true;
    (async () => {
      const CONCURRENCY = 5;
      const queue = [...courses];
      async function worker() {
        while (queue.length > 0 && alive) {
          const c = queue.shift();
          if (!c) break;
          try {
            const ov = await apiGetCached(`/gemelo/course/${c.id}/overview`);
            if (!alive) return;
            const total = Number(ov?.studentsCount ?? 0);
            const atRiskCount = Number(ov?.studentsAtRisk?.length ?? 0);
            const metric = {
              totalStudents: total,
              avgPct: ov?.courseGradebook?.avgCurrentPerformancePct ?? null,
              avgCoverage: ov?.courseGradebook?.avgCoveragePct ?? null,
              atRiskCount,
              atRiskPct: total > 0 ? (atRiskCount / total) * 100 : null,
            };
            if (alive) setCourseMetrics((prev) => ({ ...prev, [c.id]: metric }));
          } catch {
            if (alive) setCourseMetrics((prev) => ({ ...prev, [c.id]: { error: true } }));
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    })();
    return () => { alive = false; };
  }, [courses]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const extractSemester = (course) => {
    const hay = `${course?.name || ""} ${course?.code || ""}`;
    const strict = hay.match(/\b(20\d{2})(10|20|30)\b/);
    if (strict) return `${strict[1]}${strict[2]}`;
    const loose = hay.match(/\b(20\d{2})[\s\-._](\d)\b/);
    if (loose) {
      const q = loose[2];
      if (q === "1") return `${loose[1]}10`;
      if (q === "2") return `${loose[1]}20`;
      if (q === "3") return `${loose[1]}30`;
    }
    return null;
  };

  const extractCategory = (course) => {
    let name = String(course?.name || "").trim();
    name = name.replace(/^20\d{2}(?:10|20|30)\s*[-·_]?\s*/i, "");
    const upper = name.toUpperCase();
    if (/PREGRADO/.test(upper)) return "PREGRADO";
    if (/POSGRADO|MAESTR|DOCTORADO/.test(upper)) return "POSGRADO";
    if (/AULA/.test(upper)) return "AULA";
    if (/DESARROLLO/.test(upper)) return "DESARROLLO";
    if (/DIPLOMADO/.test(upper)) return "DIPLOMADO";
    if (/EDUCACI/.test(upper)) return "EDUCACIÓN CONTINUA";
    const words = name.split(/\s+/).filter(w => w.length > 0 && !/^\d+$/.test(w));
    return words.length > 0 ? words[0].toUpperCase() : "SIN CATEGORÍA";
  };

  const formatSemester = (code) => {
    if (!code || code.length !== 6) return code;
    const year = code.slice(0, 4);
    const q = code.slice(4, 6);
    const roman = q === "10" ? "I" : q === "20" ? "II" : q === "30" ? "III" : q;
    return `${year}-${roman}`;
  };

  // Períodos disponibles derivados del catálogo real (no del endpoint /semesters,
  // que viene vacío). Ordenados del más reciente al más antiguo. Mismo criterio
  // que el panel de profesor, garantizando que el dropdown solo muestre períodos
  // que sí tienen cursos y que el filtro siempre funcione.
  const availableSemesters = useMemo(() => {
    const set = new Set();
    for (const c of catalog) {
      const s = extractSemester(c);
      if (s) set.add(s);
    }
    return Array.from(set).sort().reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  // ── Client-side filtering + sorting on loaded courses ────────────────────
  const sortedCourses = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();
    const list = courses.filter((c) => {
      if (q && !(String(c.name || "").toLowerCase().includes(q) || String(c.code || "").toLowerCase().includes(q))) {
        return false;
      }
      if (filterCategory !== "all") {
        const cat = extractCategory(c);
        if (cat !== filterCategory) return false;
      }
      return true;
    });
    const withMetrics = list.map((c) => ({
      ...c,
      m: courseMetrics[c.id] || {},
      _semester: extractSemester(c),
      _category: extractCategory(c),
    }));
    withMetrics.sort((a, b) => {
      if (sortBy === "name") return String(a.name || "").localeCompare(String(b.name || ""), "es");
      if (sortBy === "avgPct") return (b.m.avgPct ?? -1) - (a.m.avgPct ?? -1);
      if (sortBy === "atRiskPct") return (b.m.atRiskPct ?? -1) - (a.m.atRiskPct ?? -1);
      return 0;
    });
    return withMetrics;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, courseMetrics, filterSearch, sortBy, filterCategory]);

  const filteredTotals = useMemo(() => {
    const metrics = sortedCourses.map((c) => c.m).filter((m) => m && !m.error);
    if (metrics.length === 0) return { totalStudents: 0, atRiskCount: 0, avgGrade: null, avgCoverage: null };
    const totalStudents = metrics.reduce((a, m) => a + (m.totalStudents || 0), 0);
    const atRiskCount = metrics.reduce((a, m) => a + (m.atRiskCount || 0), 0);
    // Promedio SIMPLE de promedios de curso (cada curso pesa igual).
    const withAvg = metrics.filter((m) => m.avgPct != null);
    const avgGrade = withAvg.length > 0
      ? withAvg.reduce((a, m) => a + m.avgPct, 0) / withAvg.length
      : null;
    const withCov = metrics.filter((m) => m.avgCoverage != null);
    const avgCoverage = withCov.length > 0
      ? withCov.reduce((a, m) => a + m.avgCoverage, 0) / withCov.length
      : null;
    return { totalStudents, atRiskCount, avgGrade, avgCoverage };
  }, [sortedCourses]);

  const metricsLoaded = Object.values(courseMetrics).filter((m) => !m?.error).length;
  const metricsDone = Object.keys(courseMetrics).length;      // atendidos (éxito + error)
  const metricsTotal = courses.length;                        // conjunto que se está cargando
  const metricsPct = metricsTotal > 0 ? Math.round((metricsDone / metricsTotal) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font)" }}>
      {/* Topbar */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.9)", backdropFilter: "blur(16px) saturate(180%)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 56,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 900 }}>CESA</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>G.D</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Panel Coordinador</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={() => navigate("/")} style={{ padding: "7px 12px", fontSize: 12, background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer" }}>
            🏠 Inicio
          </button>
          <button className="btn" onClick={onClose ? onClose : () => navigate("/dashboard")} style={{ padding: "7px 12px", fontSize: 12 }}>
            📊 Vista docente
          </button>
          <button onClick={logout} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, padding: "4px 8px", fontSize: 10, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}>
            Salir
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>
        <Breadcrumb items={[
          { label: "Inicio", icon: "🏠", onClick: () => navigate("/") },
          { label: "Panel Coordinador" },
        ]} />

        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          G.D
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em", marginBottom: 16 }}>
          Panel Coordinador
        </h1>

        {/* ── Filter form (always visible) ── */}
        <div className="kpi-card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            🔍 Configura los filtros y haz clic en Buscar
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            {/* Semester */}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Período / Semestre</span>
              <select
                value={filterSemester}
                onChange={(e) => setFilterSemester(e.target.value)}
                disabled={catalogLoading}
                style={{
                  padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: 12, fontFamily: "var(--font)", outline: "none",
                  cursor: catalogLoading ? "wait" : "pointer",
                }}
              >
                <option value="">
                  {catalogLoading ? "Cargando períodos…" : "Todos los períodos"}
                </option>
                {availableSemesters.map((code) => (
                  <option key={code} value={code}>{formatSemester(code)}</option>
                ))}
              </select>
            </label>

            {/* Category */}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tipo / Categoría</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{
                  padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: 12, fontFamily: "var(--font)", outline: "none", cursor: "pointer",
                }}
              >
                {KNOWN_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>

            {/* Free-text search */}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 220px" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Buscar por nombre</span>
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                placeholder="Ej: Finanzas, Mercadeo..."
                style={{
                  padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--bg)", color: "var(--text)",
                  fontSize: 12, fontFamily: "var(--font)", outline: "none",
                }}
              />
            </label>

            {/* Search button */}
            <button
              onClick={handleSearch}
              disabled={catalogLoading}
              style={{
                padding: "9px 20px", borderRadius: 8, border: "none",
                background: catalogLoading ? "var(--border)" : "var(--brand)",
                color: catalogLoading ? "var(--muted)" : "#fff",
                fontSize: 13, fontWeight: 800, cursor: catalogLoading ? "not-allowed" : "pointer",
                fontFamily: "var(--font)", flexShrink: 0, alignSelf: "flex-end",
              }}
            >
              {catalogLoading ? "Cargando catálogo…" : "🔍 Buscar cursos"}
            </button>

            {hasSearched && (
              <button
                onClick={() => {
                  setHasSearched(false);
                  setCourses([]);
                  setCourseMetrics({});
                  setFilterSearch("");
                  setFilterCategory("all");
                  setFilterSemester("");
                }}
                style={{
                  padding: "9px 14px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--muted)", fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "var(--font)", flexShrink: 0,
                  alignSelf: "flex-end",
                }}
              >
                ✕ Limpiar
              </button>
            )}
          </div>

          {/* Active filter summary */}
          {hasSearched && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {filterSemester && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 99, background: "var(--brand-light)", color: "var(--brand)", textTransform: "uppercase" }}>
                  Período: {formatSemester(filterSemester)}
                </span>
              )}
              {filterCategory !== "all" && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 99, background: "var(--brand-light)", color: "var(--brand)", textTransform: "uppercase" }}>
                  {filterCategory}
                </span>
              )}
              {filterSearch && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 99, background: "var(--brand-light)", color: "var(--brand)" }}>
                  "{filterSearch}"
                </span>
              )}
              {!filterSemester && filterCategory === "all" && !filterSearch && (
                <span style={{ fontSize: 10, color: "var(--muted)" }}>Todos los cursos activos</span>
              )}
            </div>
          )}
        </div>

        {/* ── Empty / pre-search state ── */}
        {!hasSearched && (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: 16, color: "var(--muted)",
          }}>
            <div style={{ fontSize: 40, opacity: 0.35, marginBottom: 12 }}>🏛</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
              Selecciona los filtros y busca
            </div>
            <div style={{ fontSize: 12, maxWidth: 380, margin: "0 auto" }}>
              Elige el período académico, tipo de programa o nombre de asignatura y haz clic en <strong>Buscar cursos</strong> para cargar los datos.
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {hasSearched && (
          <>
            {/* KPI totals */}
            {sortedCourses.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
                <div className="kpi-card">
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cursos</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "var(--text)", marginTop: 4 }}>{sortedCourses.length}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                    {metricsLoaded} con datos · {courses.length} total
                  </div>
                </div>
                <div className="kpi-card">
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Estudiantes</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: "var(--text)", marginTop: 4 }}>{filteredTotals.totalStudents}</div>
                </div>
                <div className="kpi-card">
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Nota promedio</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: colorForPct(filteredTotals.avgGrade, null), marginTop: 4 }}>
                    {filteredTotals.avgGrade != null ? fmtGrade10FromPct(filteredTotals.avgGrade) : "—"}
                    <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>/10</span>
                  </div>
                </div>
                <div className="kpi-card">
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>En riesgo</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: COLORS.critical, marginTop: 4 }}>
                    {filteredTotals.atRiskCount}
                    <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 600 }}>
                      {filteredTotals.totalStudents > 0 && ` · ${((filteredTotals.atRiskCount / filteredTotals.totalStudents) * 100).toFixed(0)}%`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="kpi-card" style={{ padding: 0, overflow: "hidden" }}>
              {/* Sort bar */}
              {sortedCourses.length > 0 && (
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Ordenar:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{
                      padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)",
                      background: "var(--card)", color: "var(--text)",
                      fontSize: 12, fontFamily: "var(--font)", outline: "none",
                    }}
                  >
                    <option value="atRiskPct">Mayor riesgo primero</option>
                    <option value="avgPct">Mejor nota primero</option>
                    <option value="name">Nombre A-Z</option>
                  </select>
                  <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
                    {sortedCourses.length} curso{sortedCourses.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              {/* Barra de progreso de carga de métricas — reemplaza el texto
                  "cargando métricas x/y" por un indicador visual con porcentaje. */}
              {metricsTotal > 0 && metricsDone < metricsTotal && (
                <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--brand)", display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--brand)", display: "inline-block", animation: "pulse 1.2s ease-in-out infinite" }} />
                      Analizando cursos… {metricsDone}/{metricsTotal}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: "var(--brand)", fontFamily: "var(--font-mono)" }}>{metricsPct}%</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${metricsPct}%`, background: "var(--brand)", borderRadius: 99, transition: "width 0.35s ease" }} />
                  </div>
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                      <th style={thStyle}>Curso</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Estudiantes</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Nota prom.</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Cobertura</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>En riesgo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {catalogLoading && (
                      <tr>
                        <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                          <div style={{ fontSize: 13 }}>Cargando catálogo de cursos…</div>
                        </td>
                      </tr>
                    )}
                    {!catalogLoading && sortedCourses.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                          <div style={{ fontSize: 36, opacity: 0.35, marginBottom: 8 }}>📚</div>
                          <div style={{ fontSize: 13 }}>Sin cursos encontrados con estos filtros.</div>
                        </td>
                      </tr>
                    )}
                    {sortedCourses.map(({ id, name, code, m, _semester, _category }) => {
                      const avgColor = m.avgPct != null ? colorForPct(m.avgPct, null) : "var(--muted)";
                      const riskColor = m.atRiskPct == null ? "var(--muted)"
                        : m.atRiskPct > 30 ? COLORS.critical
                        : m.atRiskPct > 15 ? COLORS.watch
                        : COLORS.ok;
                      return (
                        <tr
                          key={id}
                          onClick={() => {
                            sessionStorage.setItem("gemelo_pending_org", String(id));
                            window.location.href = window.location.origin + "/dashboard";
                          }}
                          style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                          className="tr-hover"
                        >
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                            <div>{name}</div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                              {code && <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{code}</span>}
                              {_semester && <span className="tag" style={{ fontSize: 9, padding: "1px 6px" }}>{formatSemester(_semester)}</span>}
                              {_category && _category !== "SIN CATEGORÍA" && (
                                <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                  {_category}
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text)", fontWeight: 700 }}>
                            {m.totalStudents != null ? m.totalStudents : "..."}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 16, fontWeight: 900, fontFamily: "var(--font-mono)", color: avgColor }}>
                            {m.avgPct != null ? (m.avgPct / 10).toFixed(1) : "—"}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                            {m.avgCoverage != null ? `${m.avgCoverage.toFixed(0)}%` : "—"}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, fontWeight: 800, color: riskColor }}>
                            {m.atRiskCount != null ? `${m.atRiskCount} (${m.atRiskPct?.toFixed(0)}%)` : "—"}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            <span style={{ color: "var(--brand)", fontSize: 16 }}>→</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 11, color: "var(--muted)" }}>
          CESA · G.D 2026.7.10 · Panel Coordinador
        </div>
      </main>
    </div>
  );
}

const thStyle = {
  padding: "10px 14px",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--muted)",
  textAlign: "left",
};
