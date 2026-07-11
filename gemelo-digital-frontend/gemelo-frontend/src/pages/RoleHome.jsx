import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, GraduationCap, Presentation, Eye, LayoutGrid, LogOut,
  Sparkles, ArrowRight, Users, BookOpen, TrendingUp, ShieldCheck, X, Loader2,
  Ban, ExternalLink, Crown, Clock, ChevronDown, ChevronUp, Filter, Megaphone, Send,
  Target, ListChecks,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost } from "../utils/api";
import { injectStyles } from "../styles/global";
import { isStudentRole } from "../utils/roles";
import CesaLoader from "../components/ui/CesaLoader";

const StudentOverviewPanel = lazy(() => import("./StudentOverviewPanel"));

// ────────────────────────────────────────────────────────────────
// Reloj en vivo AISLADO. Antes el estado del reloj vivía dentro de
// RoleHome y se actualizaba cada segundo, forzando un re-render de
// TODO el componente. Como CourseCard y AdminAnnounce se definen en
// línea, cada re-render las remontaba → parpadeo de las tarjetas y
// consultas constantes al backend. Al aislar el reloj en su propio
// componente, solo él se vuelve a renderizar.
// ────────────────────────────────────────────────────────────────
function AdminClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="admin-hero-clock">
      <span className="big">{now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>
      {now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Tarjeta de curso y header de sección AISLADOS a nivel de módulo y
// memoizados. Antes se definían dentro de RoleHome, así que cada
// re-render del padre creaba un TIPO de componente nuevo → React
// desmontaba y volvía a montar el DOM de las tarjetas, y la animación
// de `.stagger-children` (floatIn) se reproducía otra vez → parpadeo
// constante de "Cursos recientes" en la vista admin. (Mismo patrón
// que AdminClock, ver comentario arriba.)
// ────────────────────────────────────────────────────────────────

// ============ CARD DE CURSO REDISEÑADA ============
const CourseCard = React.memo(function CourseCard({ course, role, onSelect }) {
  const isActive = course.isActive !== false;
  const RoleIcon = role === "student" ? GraduationCap : Presentation;
  return (
    <button
      onClick={() => onSelect(course.id, role)}
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
});

// ============ HEADER DE SECCIÓN CON ICONO LUCIDE ============
const SectionHeader = React.memo(function SectionHeader({ Icon, title, count, variant = "instructor" }) {
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
});

export default function RoleHome() {
  useEffect(() => { injectStyles(); }, []);

  const { authUser, logout, isInstructor, isStudent, isDualRole, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const firstName = (authUser?.user_name || "").split(" ")[0] || "Usuario";

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ── Modo admin "lazy" ──────────────────────────────────────────
  // Los administradores / super administradores tienen acceso a muchísimos
  // cursos y listar sus inscripciones completas (limit=500) hace muy lenta
  // la carga inicial. Para ellos NO cargamos la lista automáticamente:
  // solo la sección de recientes + búsqueda global bajo demanda, con un
  // botón opcional para cargar la lista completa si la necesitan.
  const isAdminRole = useMemo(() => (authUser?.all_roles || []).some(r => {
    const s = String(r).toLowerCase();
    // "administrator" / "super administrator" sí; "coordinador administrativo" no.
    return s.includes("admin") && !s.includes("administrativo");
  }), [authUser]);
  const lazyMode = isSuperAdmin || isAdminRole;
  const [myCoursesRequested, setMyCoursesRequested] = useState(false);

  // Instructor course filtering (semester + collapse)
  const [filterSemester, setFilterSemester] = useState("");
  const [showAllInst, setShowAllInst] = useState(false);
  const INITIAL_INST_LIMIT = 6;

  // Recently visited courses (localStorage-backed)
  const RECENT_KEY = "gemelo_recent_courses";
  // Formato nuevo: [{id, name, code}] para poder pintar la tarjeta sin tener
  // la lista de cursos cargada (modo admin). Compat con el formato viejo (["id"]).
  const [recentEntries, setRecentEntries] = useState(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr
        .map(e => (e && typeof e === "object") ? { ...e, id: String(e.id) } : { id: String(e) })
        .filter(e => e.id && e.id !== "undefined" && e.id !== "null" && e.id !== "0");
    } catch { return []; }
  });
  const pushRecent = useCallback((course) => {
    const obj = (course && typeof course === "object")
      ? { id: String(course.id), name: String(course.name || ""), code: String(course.code || "") }
      : { id: String(course) };
    if (!obj.id || obj.id === "0" || obj.id === "undefined") return;
    setRecentEntries(prev => {
      const next = [obj, ...prev.filter(x => x.id !== obj.id)].slice(0, 5);
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

  // Estadísticas para el hero de administración (Super Admin)
  const [adminStats, setAdminStats] = useState(null);
  useEffect(() => {
    if (!isSuperAdmin) return;
    let alive = true;
    (async () => {
      try {
        const data = await apiGet("/gemelo/admin/known-users");
        if (alive) setAdminStats({ total: data?.total ?? 0, withEmail: data?.withEmail ?? 0 });
      } catch { /* silent */ }
    })();
    return () => { alive = false; };
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!lazyMode || search.trim().length < 3) {
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
  }, [search, lazyMode]);

  useEffect(() => {
    // Modo admin: no cargar la lista completa de inscripciones automáticamente
    // (demasiados cursos → carga muy lenta). Solo bajo demanda con el botón.
    if (lazyMode && !myCoursesRequested) {
      setCourses([]);
      setLoading(false);
      return;
    }
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
  }, [lazyMode, myCoursesRequested]);

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

  // Recently visited instructor courses (from localStorage).
  // Con lista cargada: preferimos los datos frescos del curso. En modo admin
  // (sin lista) usamos los metadatos guardados en localStorage.
  const recentInstCourses = useMemo(() => {
    if (recentEntries.length === 0) return [];
    const map = new Map(instructorCourses.map(c => [String(c.id), c]));
    return recentEntries
      .map(e => {
        const fresh = map.get(e.id);
        if (fresh) return fresh;
        if (lazyMode) return { id: e.id, name: e.name || `Curso ${e.id}`, code: e.code || "", isActive: true };
        return null;
      })
      .filter(Boolean)
      .slice(0, lazyMode ? 5 : 4);
  }, [recentEntries, instructorCourses, lazyMode]);

  const shouldCollapse = filteredInst.length > INITIAL_INST_LIMIT && !search && !filterSemester;
  const visibleInst = (shouldCollapse && !showAllInst)
    ? filteredInst.slice(0, INITIAL_INST_LIMIT)
    : filteredInst;

  const handleSelectCourse = useCallback((courseId, asRole) => {
    const idStr = String(courseId);
    const isStudentInCourse = studentCourses.some(c => String(c.id) === idStr);
    const isInstructorInCourse = instructorCourses.some(c => String(c.id) === idStr);

    let targetRole = asRole;
    if (isStudentInCourse && !isInstructorInCourse) targetRole = "student";
    else if (isInstructorInCourse && !isStudentInCourse) targetRole = "instructor";

    // Enriquecer el "reciente" con nombre/código para poder pintarlo luego
    // sin necesidad de cargar la lista completa (modo admin).
    const gMeta = (globalResults || []).find(c => String(c.id || c.Identifier) === idStr);
    const meta =
      instructorCourses.find(c => String(c.id) === idStr) ||
      studentCourses.find(c => String(c.id) === idStr) ||
      recentInstCourses.find(c => String(c.id) === idStr) ||
      (gMeta ? { id: idStr, name: gMeta.name || gMeta.Name || "", code: gMeta.code || gMeta.Code || "" } : null);
    pushRecent(meta || courseId);
    sessionStorage.setItem("gemelo_pending_org", String(courseId));
    const target = targetRole === "student" ? "/portal" : "/dashboard";
    window.location.href = window.location.origin + target;
  }, [studentCourses, instructorCourses, globalResults, recentInstCourses, pushRecent]);

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
              G.D
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

        {/* ── Admin hero (Super Admin) ── */}
        {isSuperAdmin && (
          <div className="admin-hero">
            <div className="admin-hero-inner">
              <div>
                <span className="admin-hero-badge">
                  <Crown size={12} strokeWidth={2.6} /> Super Admin · Consola
                </span>
                <h1 className="admin-hero-title">Hola, {firstName}</h1>
                <p className="admin-hero-sub">
                  Panel de administración de G.D. Gestiona usuarios, revisa el rendimiento académico y comunica novedades a toda la plataforma desde un solo lugar.
                </p>
              </div>
              <AdminClock />
            </div>
            <div className="admin-stat-row">
              <div className="admin-stat">
                <div className="admin-stat-value">{adminStats ? adminStats.total : "—"}</div>
                <div className="admin-stat-label"><Users size={12} strokeWidth={2.4} /> Usuarios G.D</div>
              </div>
              <div className="admin-stat">
                <div className="admin-stat-value">{adminStats ? adminStats.withEmail : "—"}</div>
                <div className="admin-stat-label"><Send size={12} strokeWidth={2.4} /> Con correo</div>
              </div>
              <div className="admin-stat">
                <div className="admin-stat-value">{loading ? "…" : (lazyMode && !myCoursesRequested) ? "—" : courses.length}</div>
                <div className="admin-stat-label"><BookOpen size={12} strokeWidth={2.4} /> Mis cursos</div>
              </div>
              <div className="admin-stat">
                <div className="admin-stat-value">{semesters.length || availableSemesters.length || "—"}</div>
                <div className="admin-stat-label"><LayoutGrid size={12} strokeWidth={2.4} /> Períodos</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Welcome (no Super Admin) ── */}
        {!isSuperAdmin && (
        <div style={{ textAlign: "center", marginBottom: 32, animation: "floatIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 99,
            background: "var(--brand-light)", color: "var(--brand)",
            fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em",
            marginBottom: 14,
          }}>
            <Sparkles size={12} strokeWidth={2.5} /> G.D
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
        )}

        {/* ── Search bar ── */}
        {!loading && (courses.length > 0 || lazyMode) && (
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
              placeholder={lazyMode && courses.length === 0
                ? "Buscar en todos los cursos por nombre, código o ID (mín. 3 caracteres)..."
                : "Buscar por nombre, código o ID..."}
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

            {/* ── Recientes (con historial; en modo admin siempre que existan) ── */}
            {isInstructor && recentInstCourses.length > 0 && (lazyMode || instructorCourses.length > INITIAL_INST_LIMIT) && !search && !filterSemester && (
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
                    <CourseCard key={`recent-${c.id}`} course={c} role="instructor" onSelect={handleSelectCourse} />
                  ))}
                </div>
              </section>
            )}

            {/* ── Admin: la lista completa no se carga automáticamente ── */}
            {lazyMode && !myCoursesRequested && !search && (
              <section className="home-panel" style={{ animationDelay: "0.10s", textAlign: "center", padding: "26px 20px" }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                  <div className="section-header-icon-wrap">
                    <BookOpen size={22} strokeWidth={2.2} />
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
                  Tus cursos no se cargan automáticamente
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6, maxWidth: 540, margin: "0 auto 16px" }}>
                  Como administrador tienes acceso a demasiados cursos y listarlos todos hace muy lenta esta página.
                  Usa el buscador de arriba (mínimo 3 caracteres — por nombre, código o ID) para encontrar cualquier curso,
                  o carga tu lista de inscripciones solo si la necesitas.
                </div>
                <button
                  onClick={() => setMyCoursesRequested(true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    background: "var(--bg)", border: "1.5px solid var(--border)", borderRadius: 10,
                    padding: "9px 18px", fontSize: 12.5, fontWeight: 800, color: "var(--brand)",
                    cursor: "pointer", transition: "all 0.15s", fontFamily: "var(--font)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "var(--brand-light)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg)"; }}
                >
                  <BookOpen size={14} strokeWidth={2.4} /> Cargar mis cursos inscritos
                </button>
              </section>
            )}

            {/* ── Admin: búsqueda muy corta (la global exige 3 caracteres) ── */}
            {lazyMode && courses.length === 0 && search.trim().length > 0 && search.trim().length < 3 && (
              <div className="empty-v2">
                <div className="empty-v2-icon">
                  <Search size={30} strokeWidth={1.8} />
                </div>
                <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 700 }}>
                  Escribe al menos 3 caracteres para buscar en todos los cursos
                </div>
              </div>
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
                        <CourseCard key={`inst-${c.id}`} course={c} role="instructor" onSelect={handleSelectCourse} />
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
                    <CourseCard key={`stud-${c.id}`} course={c} role="student" onSelect={handleSelectCourse} />
                  ))}
                </div>
              </section>
            )}

            {/* ══════ SUPER ADMIN CARDS ══════ */}
            {isSuperAdmin && (
              <div className="admin-tools-wrap" style={{ order: -1, display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="admin-section-label">
                  <span className="lbl"><ShieldCheck size={13} strokeWidth={2.4} /> Herramientas de administración</span>
                </div>
                <div className="admin-tools-grid">

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
                    style={{ flex: "1 1 160px", minWidth: 0, maxWidth: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
                  />
                  <select
                    value={impersonatePeriod}
                    onChange={e => setImpersonatePeriod(e.target.value)}
                    style={{ flex: "1 1 160px", minWidth: 0, maxWidth: "100%", textOverflow: "ellipsis", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", cursor: "pointer", fontWeight: 500 }}
                  >
                    <option value="">Todos los periodos (2025+)</option>
                    {semesters.map(s => (
                      <option key={s.id} value={s.code}>{s.code}</option>
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

            {/* 3. Resultados de aprendizaje — tarjeta que lleva a su página dedicada */}
            {isSuperAdmin && (
              <section className="home-panel superadmin-brand" style={{ animationDelay: "0.24s" }}>
                <div className="section-header-v2">
                  <div className="section-header-icon-wrap">
                    <Target size={22} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="section-header-title">Resultados de aprendizaje</div>
                    <div className="section-header-count">Super Admin · Página dedicada</div>
                  </div>
                </div>
                <div style={{
                  fontSize: 12, color: "var(--muted)", marginBottom: 14,
                  padding: "10px 14px", background: "var(--brand-light)",
                  borderRadius: 10, borderLeft: "3px solid var(--brand)",
                  display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
                }}>
                  <ListChecks size={16} strokeWidth={2.2} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
                  <span>Registro global de RA, cursos por semestre y alineaciones por curso. Se abre en una página independiente con más espacio para trabajar.</span>
                </div>
                <button
                  onClick={() => navigate("/outcomes")}
                  style={{
                    width: "100%", padding: "12px 16px", borderRadius: 12,
                    border: "none", cursor: "pointer",
                    background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
                    color: "#fff", fontSize: 14, fontWeight: 800, fontFamily: "var(--font)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "transform 0.15s, box-shadow 0.2s",
                    boxShadow: "0 6px 16px -6px rgba(11, 95, 255, 0.5)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <Target size={16} strokeWidth={2.4} /> Abrir resultados de aprendizaje
                  <ArrowRight size={16} strokeWidth={2.4} />
                </button>
              </section>
            )}

            {/* 4. Enviar anuncio / notificación a los usuarios */}
                  <div className="span-full">{isSuperAdmin && <AdminAnnounce />}</div>
                </div>
              </div>
            )}

            {/* 4. Búsqueda global de cursos */}
            {lazyMode && search.trim().length >= 3 && (
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
                  Accede desde Brightspace usando el enlace de G.D en tu curso.
                </div>
              </div>
            )}

            {/* ── No results for search ── */}
            {!loading && search && courses.length > 0 && filteredInst.length === 0 && filteredStud.length === 0 && !(lazyMode && search.trim().length >= 3) && (
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
            <Sparkles size={12} strokeWidth={2} /> CESA · G.D 2026.7.10
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

// ══════════════════════════════════════════════════════════
// AdminAnnounce — compositor de anuncios/notificaciones (Super Admin)
// Envía un anuncio a todos los usuarios registrados (opción B) por correo
// (BCC) y lo publica in-app. El envío por correo depende de SMTP configurado.
// ══════════════════════════════════════════════════════════
function AdminAnnounce() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [tag, setTag] = useState("Anuncio");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null); // {total, withEmail}

  const TAGS = ["Anuncio", "Actualización", "Importante"];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiGet("/gemelo/admin/known-users");
        if (alive) setStats({ total: data?.total ?? 0, withEmail: data?.withEmail ?? 0 });
      } catch {
        if (alive) setStats(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  const canSend = subject.trim() && message.trim() && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    const n = stats?.withEmail ?? 0;
    if (!window.confirm(
      `Se enviará este anuncio por correo a ${n} usuario${n !== 1 ? "s" : ""} y se publicará dentro de la app.\n\n¿Confirmas el envío?`
    )) return;
    setSending(true);
    setResult(null);
    try {
      const res = await apiPost("/gemelo/admin/announcement", {
        subject: subject.trim(),
        message: message.trim(),
        tag,
        audience: "all",
        send_email: true,
      });
      setResult({ ok: true, data: res });
      setSubject("");
      setMessage("");
    } catch (e) {
      setResult({ ok: false, error: String(e?.message || e) });
    } finally {
      setSending(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1.5px solid var(--border)", background: "var(--bg)",
    color: "var(--text)", fontSize: 13, fontFamily: "var(--font)",
    outline: "none", fontWeight: 500, boxSizing: "border-box",
  };

  const emailInfo = result?.ok ? (result.data?.email || {}) : null;

  return (
    <section className="home-panel superadmin-brand" style={{ animationDelay: "0.22s" }}>
      <div className="section-header-v2">
        <div className="section-header-icon-wrap">
          <Megaphone size={22} strokeWidth={2.2} />
        </div>
        <div>
          <div className="section-header-title">Enviar anuncio a los usuarios</div>
          <div className="section-header-count">Super Admin · Notificaciones</div>
        </div>
      </div>

      <div style={{
        fontSize: 12, color: "var(--muted)", marginBottom: 14,
        padding: "10px 14px", background: "var(--brand-light)",
        borderRadius: 10, borderLeft: "3px solid var(--brand)",
        display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
      }}>
        <ShieldCheck size={16} strokeWidth={2.2} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
        <span>
          El anuncio se envía por correo a <strong>{stats ? stats.withEmail : "…"}</strong> usuario(s) registrado(s) en G.D y se publica dentro de la app. Los correos van en copia oculta (BCC).
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Asunto del anuncio"
          value={subject}
          maxLength={140}
          onChange={e => setSubject(e.target.value)}
          style={{ ...inputStyle, flex: "2 1 220px" }}
        />
        <select value={tag} onChange={e => setTag(e.target.value)} style={{ ...inputStyle, flex: "1 1 140px", cursor: "pointer" }}>
          {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <textarea
        placeholder="Escribe el mensaje… (ej: nueva actualización de la plataforma, mantenimiento programado, reforma importante…)"
        value={message}
        onChange={e => setMessage(e.target.value)}
        rows={5}
        style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, marginBottom: 12 }}
      />

      <button
        onClick={handleSend}
        disabled={!canSend}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 12,
          border: "none", cursor: canSend ? "pointer" : "not-allowed",
          background: canSend ? "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)" : "var(--bg)",
          color: canSend ? "#fff" : "var(--muted)",
          fontSize: 14, fontWeight: 800, fontFamily: "var(--font)",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          boxShadow: canSend ? "0 6px 16px -6px rgba(11, 95, 255, 0.5)" : "none",
        }}
      >
        <Send size={16} strokeWidth={2.4} /> {sending ? "Enviando…" : "Enviar anuncio"}
      </button>

      {result && (
        <div style={{
          marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: 12, lineHeight: 1.5,
          background: result.ok ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
          border: `1px solid ${result.ok ? "rgba(22,163,74,0.3)" : "rgba(220,38,38,0.3)"}`,
          color: "var(--text)",
        }}>
          {result.ok ? (
            emailInfo?.ok ? (
              <>✅ Anuncio publicado y enviado por correo a <strong>{emailInfo.recipients}</strong> usuario(s).</>
            ) : emailInfo?.error === "smtp_no_configurado" ? (
              <>✅ Anuncio publicado in-app. ⚠️ El correo no se envió porque falta configurar el servidor SMTP (Office365).</>
            ) : (
              <>✅ Anuncio publicado. ⚠️ El correo no se pudo enviar: {emailInfo?.error || "error desconocido"}.</>
            )
          ) : (
            <>❌ No se pudo enviar: {result.error}</>
          )}
        </div>
      )}
    </section>
  );
}
