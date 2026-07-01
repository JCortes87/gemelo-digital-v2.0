import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, GraduationCap, Presentation, Eye, LayoutGrid, LogOut, User,
  Sparkles, ArrowRight, Users, BookOpen, TrendingUp, ShieldCheck, X, Loader2,
  Ban, ExternalLink, Crown, Clock, ChevronDown, ChevronUp, Filter,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiGet } from "../utils/api";
import { injectStyles } from "../styles/global";
import { isStudentRole } from "../utils/roles";
import CesaLoader from "../components/ui/CesaLoader";

const StudentOverviewPanel = lazy(() => import("./StudentOverviewPanel"));

export default function RoleHome() {
  useEffect(() => { injectStyles(); }, []);

  const { authUser, logout, isInstructor, isStudent, isDualRole, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const firstName = (authUser?.user_name || "").split(" ")[0] || "Usuario";

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Instructor course filtering (semester + collapse)
  const [filterSemester, setFilterSemester] = useState("");
  const [showAllInst, setShowAllInst] = useState(false);
  const INITIAL_INST_LIMIT = 6;

  // Recently visited courses (localStorage-backed)
  const RECENT_KEY = "gemelo_recent_courses";
  const [recentIds, setRecentIds] = useState(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch { return []; }
  });
  const pushRecent = useCallback((id) => {
    const idStr = String(id);
    setRecentIds(prev => {
      const next = [idStr, ...prev.filter(x => x !== idStr)].slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const [globalResults, setGlobalResults] = useState([]);
  const [globalLoading, setGlobalLoading] = useState(false);

  const [impersonateOrgId, setImpersonateOrgId] = useState("");
  const [impersonateUserId, setImpersonateUserId] = useState("");
  const [impersonateRole, setImpersonateRole] = useState("instructor");
  const [impersonatePeriod, setImpersonatePeriod] = useState("");
  const [overviewUserId, setOverviewUserId] = useState(null);
  const [overviewPeriod, setOverviewPeriod] = useState("");
  const [overviewStudentSearchId, setOverviewStudentSearchId] = useState("");

  const [semesters, setSemesters] = useState([]);
  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const data = await apiGet("/brightspace/semesters?min_year=2025");
        setSemesters(Array.isArray(data?.items) ? data.items : []);
      } catch { /* silent */ }
    })();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin || search.trim().length < 3) {
      setGlobalResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setGlobalLoading(true);
      try {
        const data = await apiGet(`/brightspace/all-courses?search=${encodeURIComponent(search.trim())}&limit=30`);
        setGlobalResults(Array.isArray(data?.items) ? data.items : []);
      } catch {
        setGlobalResults([]);
      } finally {
        setGlobalLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search, isSuperAdmin]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet("/brightspace/courses/enrolled?active_only=false&limit=500");
        if (alive) setCourses(Array.isArray(data?.items) ? data.items : []);
      } catch {
        try {
          const data = await apiGet("/brightspace/my-course-offerings?active_only=false&limit=50");
          if (alive) setCourses((Array.isArray(data?.items) ? data.items : []).map(c => ({ ...c, roleName: "Instructor" })));
        } catch { /* silent */ }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const { instructorCourses, studentCourses } = useMemo(() => {
    const inst = [];
    const stud = [];
    for (const c of courses) {
      const rn = String(c.roleName || "").toLowerCase().trim();
      if (isStudentRole(rn)) stud.push(c);
      else if (rn) inst.push(c);
      else inst.push(c);
    }
    const sorter = (a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
    };
    inst.sort(sorter);
    stud.sort(sorter);
    return { instructorCourses: inst, studentCourses: stud };
  }, [courses]);

  // Semester helpers (same pattern as CoordinatorDashboard)
  const extractSemester = useCallback((course) => {
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
  }, []);
  const formatSemester = useCallback((code) => {
    if (!code || code.length !== 6) return code;
    const roman = code.slice(4, 6) === "10" ? "I" : code.slice(4, 6) === "20" ? "II" : code.slice(4, 6) === "30" ? "III" : code.slice(4, 6);
    return `${code.slice(0, 4)}-${roman}`;
  }, []);

  // Available semesters from instructor courses (for the filter dropdown)
  const availableSemesters = useMemo(() => {
    const set = new Set();
    for (const c of instructorCourses) {
      const s = extractSemester(c);
      if (s) set.add(s);
    }
    return Array.from(set).sort().reverse();
  }, [instructorCourses, extractSemester]);

  const filterCourses = useCallback((list) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      String(c.name || "").toLowerCase().includes(q) ||
      String(c.code || "").toLowerCase().includes(q) ||
      String(c.id || "").includes(q)
    );
  }, [search]);

  const filteredStud = filterCourses(studentCourses);

  // Instructor courses: apply search + semester filter
  const filteredInst = useMemo(() => {
    let list = filterCourses(instructorCourses);
    if (filterSemester) {
      list = list.filter(c => extractSemester(c) === filterSemester);
    }
    return list;
  }, [instructorCourses, filterCourses, filterSemester, extractSemester]);

  // Recently visited instructor courses (from localStorage), only those still in the list
  const recentInstCourses = useMemo(() => {
    if (recentIds.length === 0) return [];
    const map = new Map(instructorCourses.map(c => [String(c.id), c]));
    return recentIds.map(id => map.get(id)).filter(Boolean).slice(0, 4);
  }, [recentIds, instructorCourses]);

  const shouldCollapse = filteredInst.length > INITIAL_INST_LIMIT && !search && !filterSemester;
  const visibleInst = (shouldCollapse && !showAllInst)
    ? filteredInst.slice(0, INITIAL_INST_LIMIT)
    : filteredInst;

  const handleSelectCourse = (courseId, asRole) => {
    const idStr = String(courseId);
    const isStudentInCourse = studentCourses.some(c => String(c.id) === idStr);
    const isInstructorInCourse = instructorCourses.some(c => String(c.id) === idStr);

    let targetRole = asRole;
    if (isStudentInCourse && !isInstructorInCourse) targetRole = "student";
    else if (isInstructorInCourse && !isStudentInCourse) targetRole = "instructor";

    pushRecent(courseId);
    sessionStorage.setItem("gemelo_pending_org", String(courseId));
    const target = targetRole === "student" ? "/portal" : "/dashboard";
    window.location.href = window.location.origin + target;
  };

  // ============ CARD DE CURSO REDISEÑADA ============
  const CourseCard = ({ course, role }) => {
    const isActive = course.isActive !== false;
    const RoleIcon = role === "student" ? GraduationCap : Presentation;
    return (
      <button
        onClick={() => handleSelectCourse(course.id, role)}
        className={`course-card-v2 role-${role} ${!isActive ? "inactive" : ""}`}
        aria-label={`Abrir curso ${course.name}`}
      >
        <div className="course-card-icon">
          <RoleIcon size={22} strokeWidth={2} />
        </div>
        <div className="course-card-title">{course.name || `Curso ${course.id}`}</div>
        <div className="course-card-meta">
          <span className="course-card-id">
            #{course.id}{course.code ? ` · ${course.code}` : ""}
          </span>
          {!isActive && (
            <span style={{
              fontSize: 9, fontWeight: 800, color: "var(--muted)",
              background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: 99, padding: "1px 8px", textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              Inactivo
            </span>
          )}
        </div>
        <span className="course-card-arrow"><ArrowRight size={18} strokeWidth={2.5} /></span>
      </button>
    );
  };

  // ============ HEADER DE SECCIÓN CON ICONO LUCIDE ============
  const SectionHeader = ({ Icon, title, count, variant = "instructor" }) => {
    const wrapClass = variant === "student" ? "student" : variant === "warn" ? "warn" : "";
    return (
      <div className="section-header-v2">
        <div className={`section-header-icon-wrap ${wrapClass}`}>
          <Icon size={22} strokeWidth={2.2} />
        </div>
        <div>
          <div className="section-header-title">{title}</div>
          <div className="section-header-count">
            {count} curso{count !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font)" }}>
      {/* ==================== TOP BAR ==================== */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.85)", backdropFilter: "blur(16px) saturate(180%)",
        WebkitBackdropFilter: "blur(16px) saturate(180%)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 60,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 10, fontWeight: 900, letterSpacing: "0.05em",
            boxShadow: "0 4px 14px -4px rgba(11, 95, 255, 0.5)",
          }}>CESA</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>
              Gemelo Digital
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Selecciona tu vista
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 800,
            boxShadow: "0 3px 10px -3px rgba(11, 95, 255, 0.4)",
          }}>
            {firstName.charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
            {authUser?.user_name?.split(" ").slice(0, 2).join(" ")}
          </span>
          <button
            onClick={logout}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "none", border: "1px solid var(--border)", borderRadius: 8,
              padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--muted)",
              cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--critical-bg)"; e.currentTarget.style.color = "var(--critical)"; e.currentTarget.style.borderColor = "var(--critical)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            <LogOut size={14} strokeWidth={2.2} /> Salir
          </button>
        </div>
      </header>

      {/* ==================== CONTENIDO ==================== */}
      <main id="main-content" tabIndex={-1} style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 60px" }}>

        {/* ── Welcome ── */}
        <div style={{ textAlign: "center", marginBottom: 32, animation: "floatIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 99,
            background: "var(--brand-light)", color: "var(--brand)",
            fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em",
            marginBottom: 14,
          }}>
            <Sparkles size={12} strokeWidth={2.5} /> Gemelo Digital
          </div>
          <h1 style={{
            fontSize: 34, fontWeight: 900, color: "var(--text)",
            letterSpacing: "-0.035em", margin: "0 0 8px", lineHeight: 1.1,
          }}>
            Hola, {firstName}
          </h1>
          <p style={{ fontSize: 15, color: "var(--muted)", margin: 0, maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
            {isDualRole
              ? "Tienes acceso como docente y como estudiante. Selecciona un curso para continuar."
              : isStudent
                ? "Selecciona un curso para ver tu información académica."
                : "Selecciona un curso para ver el tablero docente."}
          </p>
          {isDualRole && (
            <div style={{ display: "inline-flex", gap: 6, marginTop: 16 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, padding: "5px 12px", borderRadius: 99, background: "var(--brand-light)", color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <Presentation size={11} /> Docente
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, padding: "5px 12px", borderRadius: 99, background: "var(--ok-bg)", color: "var(--ok)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <GraduationCap size={11} /> Estudiante
              </span>
            </div>
          )}
        </div>

        {/* ── Search bar ── */}
        {!loading && courses.length > 0 && (
          <div style={{
            position: "relative", marginBottom: 24, maxWidth: 640,
            marginLeft: "auto", marginRight: "auto",
            animation: "floatIn 0.5s 0.05s cubic-bezier(0.16, 1, 0.3, 1) both",
          }}>
            <Search size={16} strokeWidth={2.4} style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              color: "var(--muted)", pointerEvents: "none",
            }} />
            <input
              type="text"
              placeholder="Buscar por nombre, código o ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "12px 14px 12px 40px", borderRadius: 12,
                border: "1.5px solid var(--border)", background: "var(--card)",
                color: "var(--text)", fontSize: 14, fontFamily: "var(--font)",
                outline: "none", transition: "all 0.2s", fontWeight: 500,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
              onFocus={e => { e.target.style.borderColor = "var(--brand)"; e.target.style.boxShadow = "0 0 0 4px rgba(11, 95, 255, 0.12)"; }}
              onBlur={e => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)"; }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6,
                  width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "var(--muted)",
                }}
                aria-label="Limpiar búsqueda"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}

        {/* ── Loading state ── */}
        {loading ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "60px 0", color: "var(--muted)", fontSize: 14,
          }}>
            <Loader2 size={32} strokeWidth={2.2} style={{ animation: "rotateGlow 1s linear infinite", color: "var(--brand)", marginBottom: 14 }} />
            <div style={{ fontWeight: 600 }}>Cargando tus cursos...</div>
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>Consultando Brightspace</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* ── Recientes (solo si hay historial y ≥ 4 cursos totales) ── */}
            {isInstructor && recentInstCourses.length > 0 && instructorCourses.length > INITIAL_INST_LIMIT && !search && !filterSemester && (
              <section className="home-panel" style={{ animationDelay: "0.06s" }}>
                <div className="section-header-v2">
                  <div className="section-header-icon-wrap">
                    <Clock size={22} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="section-header-title">Cursos recientes</div>
                    <div className="section-header-count">
                      {recentInstCourses.length} visitado{recentInstCourses.length !== 1 ? "s" : ""} recientemente
                    </div>
                  </div>
                </div>
                <div className="course-grid stagger-children">
                  {recentInstCourses.map(c => (
                    <CourseCard key={`recent-${c.id}`} course={c} role="instructor" />
                  ))}
                </div>
              </section>
            )}

            {/* ── Cursos como Profesor ── */}
            {isInstructor && (filteredInst.length > 0 || (instructorCourses.length > 0 && filterSemester)) && (
              <section className="home-panel" style={{ animationDelay: "0.08s" }}>
                <SectionHeader
                  Icon={Presentation}
                  title="Mis cursos como Profesor"
                  count={filteredInst.length}
                  variant="instructor"
                />

                {/* Semester filter — solo se muestra cuando hay muchos cursos y ≥ 2 semestres */}
                {instructorCourses.length > INITIAL_INST_LIMIT && availableSemesters.length >= 2 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    padding: "10px 12px", marginBottom: 14,
                    background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10,
                  }}>
                    <Filter size={14} strokeWidth={2.4} style={{ color: "var(--muted)" }} />
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Filtrar por período
                    </span>
                    <select
                      value={filterSemester}
                      onChange={(e) => { setFilterSemester(e.target.value); setShowAllInst(false); }}
                      style={{
                        padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)",
                        background: "var(--card)", color: "var(--text)",
                        fontSize: 12, fontFamily: "var(--font)", fontWeight: 600, outline: "none", cursor: "pointer",
                      }}
                    >
                      <option value="">Todos los períodos</option>
                      {availableSemesters.map(code => (
                        <option key={code} value={code}>{formatSemester(code)}</option>
                      ))}
                    </select>
                    {filterSemester && (
                      <button
                        onClick={() => setFilterSemester("")}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          background: "var(--brand-light)", color: "var(--brand)", border: "none",
                          borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        <X size={11} strokeWidth={2.5} /> Limpiar
                      </button>
                    )}
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                      {filteredInst.length} de {instructorCourses.length}
                    </span>
                  </div>
                )}

                {filteredInst.length === 0 ? (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                    Sin cursos en el período seleccionado.
                  </div>
                ) : (
                  <>
                    <div className="course-grid stagger-children">
                      {visibleInst.map(c => (
                        <CourseCard key={`inst-${c.id}`} course={c} role="instructor" />
                      ))}
                    </div>

                    {shouldCollapse && (
                      <div style={{ textAlign: "center", marginTop: 14 }}>
                        <button
                          onClick={() => setShowAllInst(v => !v)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            background: "var(--bg)", border: "1.5px solid var(--border)", borderRadius: 10,
                            padding: "8px 16px", fontSize: 12, fontWeight: 800, color: "var(--brand)",
                            cursor: "pointer", transition: "all 0.15s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "var(--brand-light)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg)"; }}
                        >
                          {showAllInst
                            ? <><ChevronUp size={14} strokeWidth={2.5} /> Mostrar menos</>
                            : <><ChevronDown size={14} strokeWidth={2.5} /> Ver todos ({filteredInst.length - INITIAL_INST_LIMIT} más)</>
                          }
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {/* ── Cursos como Estudiante ── */}
            {isStudent && filteredStud.length > 0 && (
              <section className="home-panel" style={{ animationDelay: "0.12s" }}>
                <SectionHeader
                  Icon={GraduationCap}
                  title="Mis cursos como Estudiante"
                  count={filteredStud.length}
                  variant="student"
                />
                <div className="course-grid stagger-children">
                  {filteredStud.map(c => (
                    <CourseCard key={`stud-${c.id}`} course={c} role="student" />
                  ))}
                </div>
              </section>
            )}

            {/* ══════ SUPER ADMIN CARDS ══════ */}

            {/* 1. Rendimiento general del estudiante */}
            {isSuperAdmin && (
              <section className="home-panel superadmin-brand" style={{ animationDelay: "0.16s" }}>
                <div className="section-header-v2">
                  <div className="section-header-icon-wrap">
                    <TrendingUp size={22} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="section-header-title">Rendimiento general de un estudiante</div>
                    <div className="section-header-count">Super Admin</div>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, color: "var(--muted)", marginBottom: 14,
                  padding: "10px 14px", background: "var(--brand-light)",
                  borderRadius: 10, borderLeft: "3px solid var(--brand)",
                  display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
                }}>
                  <ShieldCheck size={16} strokeWidth={2.2} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
                  <span>Busca todas las asignaturas donde está inscrito un estudiante y su promedio por curso. Selecciona un período para acelerar la búsqueda.</span>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <input
                    type="number"
                    placeholder="ID del estudiante"
                    value={overviewStudentSearchId}
                    onChange={e => setOverviewStudentSearchId(e.target.value)}
                    style={{ flex: "1 1 180px", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
                  />
                  <select
                    value={impersonatePeriod}
                    onChange={e => setImpersonatePeriod(e.target.value)}
                    style={{ flex: "1 1 220px", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", cursor: "pointer", fontWeight: 500 }}
                  >
                    <option value="">Todos los periodos (2025+)</option>
                    {semesters.map(s => (
                      <option key={s.id} value={s.code}>{s.code} — {s.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => {
                    const uid = Number(overviewStudentSearchId);
                    if (!uid || uid <= 0) { alert("Ingresa un ID de estudiante válido"); return; }
                    setOverviewPeriod(impersonatePeriod.trim());
                    setOverviewUserId(uid);
                  }}
                  disabled={!overviewStudentSearchId || Number(overviewStudentSearchId) <= 0}
                  style={{
                    width: "100%", padding: "12px 16px", borderRadius: 12,
                    border: "none", cursor: overviewStudentSearchId ? "pointer" : "not-allowed",
                    background: overviewStudentSearchId
                      ? "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)"
                      : "var(--bg)",
                    color: overviewStudentSearchId ? "#fff" : "var(--muted)",
                    fontSize: 14, fontWeight: 800, fontFamily: "var(--font)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "transform 0.15s, box-shadow 0.2s",
                    boxShadow: overviewStudentSearchId ? "0 6px 16px -6px rgba(11, 95, 255, 0.5)" : "none",
                  }}
                  onMouseEnter={(e) => { if (overviewStudentSearchId) e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <TrendingUp size={16} strokeWidth={2.4} /> Ver rendimiento general
                </button>
              </section>
            )}

            {/* 2. Suplantar usuario */}
            {isSuperAdmin && (
              <section className="home-panel superadmin-warn" style={{ animationDelay: "0.20s" }}>
                <div className="section-header-v2">
                  <div className="section-header-icon-wrap warn">
                    <Eye size={22} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="section-header-title">Suplantar usuario</div>
                    <div className="section-header-count">Super Admin · Vista temporal</div>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, color: "var(--muted)", marginBottom: 14,
                  padding: "10px 14px", background: "rgba(255, 170, 0, 0.08)",
                  borderRadius: 10, borderLeft: "3px solid #f59e0b",
                  display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
                }}>
                  <Crown size={16} strokeWidth={2.2} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
                  <span>Abre un curso como si fueras un profesor o estudiante específico. Para "Como Estudiante" debes ingresar el ID del estudiante.</span>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <input
                    type="number"
                    placeholder="ID del curso"
                    value={impersonateOrgId}
                    onChange={e => setImpersonateOrgId(e.target.value)}
                    style={{ flex: "1 1 120px", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
                  />
                  <select
                    value={impersonateRole}
                    onChange={e => setImpersonateRole(e.target.value)}
                    style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", cursor: "pointer", fontWeight: 500 }}
                  >
                    <option value="instructor">Como Profesor</option>
                    <option value="student">Como Estudiante</option>
                  </select>
                  {impersonateRole === "student" && (
                    <input
                      type="number"
                      placeholder="ID del estudiante"
                      value={impersonateUserId}
                      onChange={e => setImpersonateUserId(e.target.value)}
                      style={{ flex: "1 1 140px", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
                    />
                  )}
                </div>
                {(() => {
                  const orgValid = impersonateOrgId && Number(impersonateOrgId) > 0;
                  const studentValid = impersonateUserId && Number(impersonateUserId) > 0;
                  const canSubmit = impersonateRole === "instructor" ? orgValid : (orgValid && studentValid);
                  return (
                    <button
                      onClick={() => {
                        if (!canSubmit) return;
                        const org = Number(impersonateOrgId);
                        const uid = Number(impersonateUserId);
                        sessionStorage.setItem("gemelo_pending_org", String(org));
                        if (impersonateRole === "student") {
                          sessionStorage.setItem("gemelo_impersonate_user", String(uid));
                          window.location.href = window.location.origin + "/portal";
                        } else {
                          sessionStorage.removeItem("gemelo_impersonate_user");
                          window.location.href = window.location.origin + "/dashboard";
                        }
                      }}
                      disabled={!canSubmit}
                      style={{
                        width: "100%", padding: "12px 16px", borderRadius: 12,
                        border: "none", cursor: canSubmit ? "pointer" : "not-allowed",
                        background: canSubmit
                          ? "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)"
                          : "var(--bg)",
                        color: canSubmit ? "#78350f" : "var(--muted)",
                        fontSize: 14, fontWeight: 800, fontFamily: "var(--font)",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                        transition: "transform 0.15s, box-shadow 0.2s",
                        boxShadow: canSubmit ? "0 6px 16px -6px rgba(245, 158, 11, 0.5)" : "none",
                      }}
                      onMouseEnter={(e) => { if (canSubmit) e.currentTarget.style.transform = "translateY(-1px)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                    >
                      <Eye size={16} strokeWidth={2.4} /> {impersonateRole === "student" ? "Ver como estudiante" : "Ver como profesor"}
                    </button>
                  );
                })()}
              </section>
            )}

            {/* 3. Búsqueda global de cursos */}
            {isSuperAdmin && search.trim().length >= 3 && (
              <section className="home-panel" style={{ animationDelay: "0.24s" }}>
                <div className="section-header-v2">
                  <div className="section-header-icon-wrap">
                    <LayoutGrid size={22} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="section-header-title">Búsqueda global de cursos</div>
                    <div className="section-header-count">
                      {globalLoading
                        ? "Buscando..."
                        : `${globalResults.length} resultado${globalResults.length !== 1 ? "s" : ""}`}
                    </div>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, color: "var(--muted)", marginBottom: 14,
                  padding: "10px 14px", background: "var(--bg)",
                  borderRadius: 10, borderLeft: "3px solid var(--brand)",
                  display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
                }}>
                  <BookOpen size={16} strokeWidth={2.2} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
                  <span>Consulta <strong>todos los cursos</strong> de Brightspace, no solo tus inscripciones. Usa el buscador arriba (mín. 3 caracteres).</span>
                </div>
                {globalResults.length > 0 ? (
                  <div className="course-grid stagger-children">
                    {globalResults.map(c => (
                      <button
                        key={`global-${c.id || c.Identifier}`}
                        onClick={() => handleSelectCourse(c.id || c.Identifier, "instructor")}
                        className="course-card-v2"
                      >
                        <div className="course-card-icon">
                          <BookOpen size={22} strokeWidth={2} />
                        </div>
                        <div className="course-card-title">
                          {c.name || c.Name || `Curso ${c.id || c.Identifier}`}
                        </div>
                        <div className="course-card-meta">
                          <span className="course-card-id">
                            #{c.id || c.Identifier}{c.code || c.Code ? ` · ${c.code || c.Code}` : ""}
                          </span>
                        </div>
                        <span className="course-card-arrow"><ArrowRight size={18} strokeWidth={2.5} /></span>
                      </button>
                    ))}
                  </div>
                ) : !globalLoading ? (
                  <div style={{ textAlign: "center", padding: "16px 0", color: "var(--muted)", fontSize: 13 }}>
                    Sin resultados en Brightspace para "{search}"
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
                    <div className="loading-dots"><span /><span /><span /></div>
                  </div>
                )}
              </section>
            )}

            {/* ── Estudiante sin cursos ── */}
            {isStudent && !isInstructor && filteredStud.length === 0 && !search && (
              <div className="empty-v2">
                <div className="empty-v2-icon">
                  <GraduationCap size={30} strokeWidth={1.8} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
                  Sin cursos encontrados
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, maxWidth: 380 }}>
                  Accede desde Brightspace usando el enlace de Gemelo Digital en tu curso.
                </div>
              </div>
            )}

            {/* ── No results for search ── */}
            {!loading && search && filteredInst.length === 0 && filteredStud.length === 0 && !(isSuperAdmin && search.trim().length >= 3) && (
              <div className="empty-v2">
                {/^\d{3,}$/.test(search.trim()) ? (
                  <>
                    <div className="empty-v2-icon" style={{ background: "var(--critical-bg)", color: "var(--critical)" }}>
                      <Ban size={30} strokeWidth={1.8} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
                      No estás inscrito en el curso #{search.trim()}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, maxWidth: 460, lineHeight: 1.5 }}>
                      Verifica el ID del curso o solicita al docente/administrador que te inscriba en Brightspace.
                    </div>
                    {isSuperAdmin && (
                      <div style={{
                        marginBottom: 12, padding: "12px 14px",
                        background: "rgba(255, 170, 0, 0.08)", border: "1px solid rgba(255, 170, 0, 0.3)",
                        borderRadius: 12, fontSize: 12, color: "var(--text)", maxWidth: 460,
                      }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
                          <Crown size={12} /> Super Admin: puedes abrir cualquier curso.
                        </div>
                        <button
                          onClick={() => handleSelectCourse(parseInt(search.trim(), 10), "instructor")}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                            color: "#78350f", border: "none", borderRadius: 10,
                            padding: "8px 14px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                          }}
                        >
                          <ExternalLink size={14} /> Abrir curso #{search.trim()}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="empty-v2-icon">
                      <Search size={30} strokeWidth={1.8} />
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 8, color: "var(--text)", fontWeight: 700 }}>
                      Sin resultados para "{search}"
                    </div>
                  </>
                )}
                <button
                  onClick={() => setSearch("")}
                  style={{
                    background: "var(--brand)", color: "#fff", border: "none",
                    borderRadius: 10, padding: "8px 18px", fontSize: 12, fontWeight: 800, cursor: "pointer",
                    marginTop: 8, transition: "transform 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
                  onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
                >
                  Limpiar búsqueda
                </button>
              </div>
            )}

            {/* Quick access buttons */}
            {!isDualRole && !loading && courses.length > 0 && (
              <div style={{ textAlign: "center", paddingTop: 8 }}>
                <button
                  onClick={() => navigate(isStudent ? "/portal" : "/dashboard")}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: "none", border: "1.5px solid var(--border)", borderRadius: 10,
                    padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "var(--muted)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
                >
                  Ir al {isStudent ? "portal de estudiante" : "dashboard docente"}
                  <ArrowRight size={14} strokeWidth={2.4} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "32px 0 8px", fontSize: 11, color: "var(--muted)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={12} strokeWidth={2} /> CESA · Gemelo Digital V.260701
          </div>
        </div>
      </main>

      {/* StudentOverviewPanel overlay */}
      {overviewUserId && (
        <Suspense fallback={
          <div style={{ position: "fixed", inset: 0, zIndex: 300 }}>
            <CesaLoader title="Panel del Estudiante" subtitle="Cargando" />
          </div>
        }>
          <StudentOverviewPanel
            userId={overviewUserId}
            period={overviewPeriod}
            onClose={() => setOverviewUserId(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
