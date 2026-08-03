import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { Presentation, GraduationCap, ArrowRight, LogOut } from "lucide-react";
import {
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Line,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import StudentAvatar from "../components/ui/StudentAvatar";
import Breadcrumb from "../components/ui/Breadcrumb";
import LastUpdated from "../components/ui/LastUpdated";
import CommandPalette from "../components/ui/CommandPalette";
import ContextualTip from "../components/ui/ContextualTip";
import SharedCesaLoader from "../components/ui/CesaLoader";
import ErrorBoundary from "../components/ui/ErrorBoundary";
import SmartAlerts from "../components/dashboard/SmartAlerts";
import CourseTrends from "../components/dashboard/CourseTrends";
import DueDateCalendar from "../components/dashboard/DueDateCalendar";
import AssignmentsPanel from "../components/dashboard/AssignmentsPanel";
import AINarrativeSummary from "../components/dashboard/AINarrativeSummary";
import GradePredictions from "../components/dashboard/GradePredictions";
import EvidenceReports from "../components/dashboard/EvidenceReports";
const CoordinatorDashboard = React.lazy(() => import("./CoordinatorDashboard"));
const StudentPortal = React.lazy(() => import("./StudentPortal"));
import useStudentNotes from "../hooks/useStudentNotes";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";
import useCourseSnapshots from "../hooks/useCourseSnapshots";
import useStudentChat from "../hooks/useStudentChat";
import { exportStudentsCsv, exportCourseReport, STUDENT_CSV_COLUMNS } from "../utils/export";
import { apiUrl, apiGet, apiGetCached, apiPost, invalidateApiCache, API_BASE_URL } from "../utils/api";
import { elSpeak } from "../utils/speech";
import { COLORS, STATUS_CONFIG, colorForRisk, colorForPct } from "../utils/colors";
import {
  toDate, weeksBetween, clamp, normStatus,
  fmtPct, fmtGrade10FromPct, contentRhythmStatus,
  buildCorteGroups, flattenOutcomeDescriptions,
  computeRiskFromPct, suggestRouteForStudent,
} from "../utils/helpers";
import { isStudentRole } from "../utils/roles";
import VoiceAssistant from "../components/dashboard/VoiceAssistant";
import { parseVoiceCommand, findLowestResultStudent, findHighestRiskStudent, findStudentByName } from "../utils/voiceCommands";
import RoutesView from "../components/dashboard/RoutesView";
// Módulos extraídos de este archivo (#15): estilos, átomos de UI, paneles,
// layout, modales, onboarding y el vinculador de RAs.
import { injectStyles } from "./teacher/dashboardStyles";
import useMediaQuery from "../hooks/useMediaQuery";
import {
  StatusBadge, CircularRing, ThresholdsModal, Card, Stat, Divider,
  ProgressBar, InfoTooltip, SortTh, CoverageBars, GaugeMeter,
} from "./teacher/primitives";

// Tipo de un elemento de contenido. Prioriza la URL del archivo (lo más
// confiable), luego el TopicType de Brightspace (3 = enlace externo) y por
// último el título. Los "elementos" son los archivos/páginas dentro de los
// módulos de contenido del curso.
// Categorías acordadas: HTML (páginas construidas en Brightspace), PDF,
// Excel, Word, Imágenes (todos los formatos), Audios (todos), Videos
// (todos), Enlace (links externos o internos) y Otros para el resto.
function contentTypeLabel(title, url, topicType) {
  const check = (s) => {
    if (!s) return null;
    if (s.includes(".pdf")) return "PDF";
    if (/\.(docx?|rtf)(\?|$|\b)/.test(s)) return "Word";
    if (/\.(xlsx?|csv)(\?|$|\b)/.test(s)) return "Excel";
    if (/\.(png|jpe?g|gif|svg|webp|bmp|tiff?|ico)(\?|$|\b)/.test(s)) return "Imágenes";
    if (/\.(mp3|wav|ogg|m4a|aac|wma)(\?|$|\b)/.test(s)) return "Audios";
    if (/\.(mp4|mov|avi|webm|mkv|wmv|flv)(\?|$|\b)/.test(s)) return "Videos";
    if (/\.html?(\?|$|\b)/.test(s)) return "HTML";
    return null;
  };
  const u = String(url || "").toLowerCase();
  const fromUrl = check(u);
  if (fromUrl) return fromUrl;
  if (Number(topicType) === 3) return "Enlace";
  if (/^https?:/.test(u)) return "Enlace";
  const fromTitle = check(String(title || "").toLowerCase());
  if (fromTitle) return fromTitle;
  if (/https?:|www\.|link|enlace/.test(String(title || "").toLowerCase())) return "Enlace";
  return "Otros";
}

const CONTENT_TYPE_ICONS = {
  HTML: "🌐", PDF: "📕", Excel: "📗", Word: "📘",
  "Imágenes": "🖼️", Audios: "🎧", Videos: "🎬", Enlace: "🔗", Otros: "📄",
};

// Cuentas institucionales/de servicio que no deben aparecer como profesor
const SERVICE_ACCOUNT_RE = /^cesa\b|laboratorio|desarrollo profesoral|soporte|capacitaci|prueba|demo|test/i;

// Formatea el último acceso de un estudiante como texto relativo corto.
function fmtLastAccess(iso) {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 1) return "Hoy";
  if (days < 2) return "Ayer";
  if (days < 30) return `Hace ${Math.floor(days)} días`;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
import { AnnouncementsModal, OnboardingTutorial } from "./teacher/onboarding";
import {
  LoginScreen, CesaLoader, UnlinkedItemsList, AlertsPanel, Drawer,
  ProjectionBlock, NoRaMappingNotice, QualityFlagsBlock, PendingItemsBlock,
  EvidencesTimeline, CoursePanel, StudentCard, GradeDistributionCard,
} from "./teacher/panels";
import { AppSidebar, AppTopbar } from "./teacher/layout";
import { BugReportModal, FloatingAI } from "./teacher/modals";
import { RaLinker } from "./teacher/RaLinker";

/**
 * =========================
 * Config
 * =========================
 */

const DEFAULT_ORG_UNIT_ID = 0; // Se sobreescribe con el curso del LTI o selección del docente

export default function TeacherDashboard() {
  useEffect(() => {
    injectStyles();
  }, []);

  // Marca a este usuario como "staff" (docente/admin) → sí recibe correos.
  useEffect(() => {
    apiPost("/gemelo/audience", { audience: "staff" }).catch(() => {});
  }, []);

  // Read initialOrgUnitId from AuthContext — AuthContext claims sessionStorage
  // early (before lazy-loaded TeacherDashboard mounts), so we rely on the
  // context value instead of reading sessionStorage directly here.
  const { initialOrgUnitId: ctxInitialOrgUnitId, isDualRole, isSuperAdmin } = useAuth();
  const { locale, toggleLocale } = useI18n();
  const navigate = useNavigate();

  const isNarrow = useMediaQuery("(max-width: 900px)");
  const isMobile = useMediaQuery("(max-width: 640px)");

  // ── Section refs for voice scroll navigation ────────────
  const overviewRef        = React.useRef(null);
  const priorityRef        = React.useRef(null);
  const learningOutcomesRef = React.useRef(null);
  const studentsRef        = React.useRef(null);

  // ── Voice command state ─────────────────────────────────
  const [voiceFeedback, setVoiceFeedback] = useState("");
  // null al inicio: solo cambia cuando un comando de voz/paleta navega.
  // (Si arranca en "students", el efecto de navegación abre esa pestaña al montar.)
  const [activeSection, setActiveSection] = useState(null);
  const [advancedQuery, setAdvancedQuery] = useState({ mode: "text", target: null });

  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // ── Auth state ────────────────────────────────────────────────────────────
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState(null); // { user_id, user_name, user_email }
  const [showTutorial, setShowTutorial] = React.useState(false);

  useEffect(() => {
    (async () => {
      try {
        // ── Leer hash fragment del callback OAuth ──
        // Formato: #gemelo:SESSION_ID:orgUnitId:first_login
        // El hash nunca va al servidor ni se cachea — es la fuente más confiable
        let _sid = null;
        let _hashOu = null;
        const _hash = window.location.hash;
        if (_hash.startsWith("#gemelo:")) {
          const parts = _hash.slice(1).split(":");
          // parts = ["gemelo", "SESSION_ID", "orgUnitId", "1"]
          if (parts.length >= 2) {
            _sid    = parts[1] || null;
            _hashOu = parts[2] && Number(parts[2]) > 0 ? Number(parts[2]) : null;
            const _fl = parts[3];
            if (_fl === "1") sessionStorage.setItem("gemelo_first_login", "1");
          }
          // Limpiar el hash de la URL sin recargar
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }

        // Fallback: leer de localStorage (visitas posteriores sin hash)
        if (!_sid) _sid = localStorage.getItem("gemelo_sid");

        // Guardar session_id en localStorage para peticiones siguientes
        if (_sid) localStorage.setItem("gemelo_sid", _sid);

        // Aplicar orgUnitId del hash si vino en el fragmento
        if (_hashOu) {
          setOrgUnitId(_hashOu);
          setOrgUnitInput(String(_hashOu));
        }

        // Llamar /auth/me (el sid va solo en el header Bearer, nunca en la URL)
        const res = await fetch(apiUrl("/auth/me"), {
          credentials: "include",
          headers: _sid ? { "Authorization": `Bearer ${_sid}` } : {},
        });
        const data = await res.json();
        if (data.authenticated) {
          setAuthUser(data);
          // Recuperar orgUnitId guardado en sessionStorage (viene del LTI)
          const savedOu = sessionStorage.getItem("gemelo_pending_org");
          if (savedOu && Number(savedOu) > 0) {
            sessionStorage.removeItem("gemelo_pending_org");
            setOrgUnitId(Number(savedOu));
            setOrgUnitInput(savedOu);
          }
          // Detectar primera vez: viene del callback OAuth (first_login=1 en sessionStorage)
          // O si nunca ha visto el tutorial (localStorage "gemelo_onboarded" no existe)
          const isFirstLogin = sessionStorage.getItem("gemelo_first_login") === "1";
          const alreadyOnboarded = localStorage.getItem("gemelo_onboarded") === "1";
          if (isFirstLogin || !alreadyOnboarded) {
            sessionStorage.removeItem("gemelo_first_login");
            setShowTutorial(true);
          } else {
            // Saludo de voz si ya onboarded (solo dice bienvenido brevemente)
            const name = (data.user_name || "").split(" ")[0];
            if (name) {
              setTimeout(() => elSpeak(`Bienvenido de nuevo, ${name}`), 800);
            }
          }
        } else if (data.lti_detected) {
          // LTI detectado sin token OAuth → guardar orgUnitId y redirigir a OAuth
          const ou = data.org_unit_id || "";
          if (ou) sessionStorage.setItem("gemelo_pending_org", ou);
          const loginPath = ou
            ? apiUrl(`/auth/brightspace/login?org_unit_id=${ou}`)
            : apiUrl("/auth/brightspace/login");
          window.location.href = loginPath;
          return;
        }
      } catch {
        // offline / error → mostrar login
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  // orgUnitId ya se inicializa desde la URL en el useState lazy initializer

  // Scroll to section when voice command navigates
  useEffect(() => {
    // La tabla de estudiantes ahora vive en su propia pestaña
    if (activeSection === "students") {
      setActiveTab("students");
      return;
    }
    const map = {
      overview:          overviewRef,
      priority:          priorityRef,
      "learning-outcomes": learningOutcomesRef,
      students:          studentsRef,
    };
    const ref = map[activeSection];
    if (ref?.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  const [orgUnitId, setOrgUnitId] = useState(() => {
    // Priority 1: AuthContext initial value (from LTI hash fragment or RoleHome selection)
    if (ctxInitialOrgUnitId && Number(ctxInitialOrgUnitId) > 0) {
      return Number(ctxInitialOrgUnitId);
    }
    // Priority 2: URL query params (OAuth callback flow)
    const params = new URLSearchParams(window.location.search);
    const ou = params.get("orgUnitId");
    const fl = params.get("first_login");
    if (fl === "1") sessionStorage.setItem("gemelo_first_login", "1");

    if (ou && Number(ou) > 0) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState(null, "", cleanUrl);
      return Number(ou);
    }
    if (params.toString()) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    // Priority 3: sessionStorage fallback (in case AuthContext didn't clear it)
    const saved = sessionStorage.getItem("gemelo_pending_org");
    if (saved && Number(saved) > 0) return Number(saved);
    return DEFAULT_ORG_UNIT_ID;
  });
  const [orgUnitInput, setOrgUnitInput] = useState(() => {
    if (ctxInitialOrgUnitId && Number(ctxInitialOrgUnitId) > 0) {
      return String(ctxInitialOrgUnitId);
    }
    const params = new URLSearchParams(window.location.search);
    const ou = params.get("orgUnitId");
    if (ou && Number(ou) > 0) return ou;
    const saved = sessionStorage.getItem("gemelo_pending_org");
    if (saved && Number(saved) > 0) return saved;
    return String(DEFAULT_ORG_UNIT_ID || "");
  });

  // If AuthContext provides initialOrgUnitId AFTER mount (e.g., slow auth), apply it
  useEffect(() => {
    if (ctxInitialOrgUnitId && Number(ctxInitialOrgUnitId) > 0 && !orgUnitId) {
      setOrgUnitId(Number(ctxInitialOrgUnitId));
      setOrgUnitInput(String(ctxInitialOrgUnitId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxInitialOrgUnitId]);

  const [outcomesMap, setOutcomesMap] = useState({});
  const [learningOutcomesPayload, setLearningOutcomesPayload] = useState(null);
  const [contentRoot, setContentRoot] = useState([]);
  // Accesos al curso (userId -> LastAccessed ISO o null) y consumo de contenidos
  const [lastAccessMap, setLastAccessMap] = useState({});
  // Classlist crudo (para derivar el equipo docente por diferencia con estudiantes)
  const [classlistItems, setClasslistItems] = useState([]);
  // Profesores/instructores del curso (LP enrollments trae el nombre del rol)
  const [instructors, setInstructors] = useState(null); // null = cargando
  // Elementos de contenido con metadatos completos (Url/TopicType) para
  // clasificar por tipo (PDF, Word, etc.) — el content/root no trae Url
  const [contentTopics, setContentTopics] = useState(null);
  const [consumption, setConsumption] = useState(null);
  const [overview, setOverview] = useState(null);
  const [studentsList, setStudentsList] = useState(null);
  const [studentRows, setStudentRows] = useState([]);
  const [raDashboard, setRaDashboard] = useState(null);
  // Pestaña activa en "Prioridad académica": RA por rúbrica/asignación vs por quiz.
  const [raTab, setRaTab] = useState("rubrica");

  // Last data fetch timestamp + refresh trigger
  const [lastUpdate, setLastUpdate] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Cuando el usuario pulsa "Actualizar ahora" marcamos este ref para que la
  // siguiente carga pida datos en vivo a Brightspace (fresh_max_minutes=0) en
  // vez de leer el cache de Postgres. La carga inicial lo deja en false para
  // seguir siendo rapida (DB-first).
  const forceFreshRef = React.useRef(false);
  const handleRefresh = React.useCallback(() => {
    forceFreshRef.current = true;
    setRefreshKey((k) => k + 1);
  }, []);

  // switchCourse: hard reset all course-specific state BEFORE changing orgUnitId.
  // This prevents sticky error states when switching between courses after
  // a 403 / access denied error.
  const switchCourse = React.useCallback((newId) => {
    const n = Number(newId);
    if (!(n > 0)) return;
    // Clear all course state explicitly (don't rely on useEffect)
    setErr("");
    setOverview(null);
    setStudentsList(null);
    setStudentRows([]);
    setRaDashboard(null);
    setLearningOutcomesPayload(null);
    setOutcomesMap({});
    setStudentDetail(null);
    setSelectedStudent(null);
    setStudentErr("");
    setStudentLoading(false);
    setCourseInfo(null);
    setContentRoot([]);
    setLoading(true);
    // Now set the new course — useEffect will fetch fresh data
    setOrgUnitId(n);
    setOrgUnitInput(String(n));
    // Close any open course panel
    setShowCoursePanel(false);
  }, []);


  // Command palette (Ctrl+K)
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Coordinator panel overlay (renders on top of dashboard, avoids re-fetch)
  const [showCoordinator, setShowCoordinator] = useState(false);

  // SuperAdmin impersonation: view a student's portal
  const [impersonateStudent, setImpersonateStudent] = useState(null); // { userId, name }
  // Solo superadmin: "Vista estudiante" abre un selector de estudiante (modal)
  // y muestra el portal del estudiante elegido vía impersonateStudent.
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Quick filter (active filter chip applied to the students table)
  // Values: null, "risk_high", "risk_medium", "no_coverage", "overdue", "pending_grade", "approved"
  const [quickFilter, setQuickFilter] = useState(null);

  // Bulk selection (student userIds selected via checkboxes)
  const [selectedStudentIds, setSelectedStudentIds] = useState(() => new Set());
  const toggleStudentSelection = React.useCallback((userId) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);
  const clearSelection = React.useCallback(() => setSelectedStudentIds(new Set()), []);

  // Collapsible risk groups in students table
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const toggleGroupCollapsed = React.useCallback((groupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  // Group students table by risk?
  const [groupByRisk, setGroupByRisk] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem("gemelo_group_by_risk") === "1";
  });
  useEffect(() => {
    try {
      localStorage.setItem("gemelo_group_by_risk", groupByRisk ? "1" : "0");
    } catch {}
  }, [groupByRisk]);

  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [courseInfo, setCourseInfo] = useState(null);
  const [query, setQuery] = useState("");
  const [onlyRisk, setOnlyRisk] = useState(false);

  // CSV export configuration: which columns to include + popover open state
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvColumns, setCsvColumns] = useState(() => STUDENT_CSV_COLUMNS.map((c) => c.key));

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentErr, setStudentErr] = useState("");

  const [drawerTab, setDrawerTab] = useState("resumen");

  // ── Main navigation tabs (persisted in URL) ──────────
  const VALID_TABS = ["dashboard", "students", "calendar", "trends", "routes", "predictions", "evidences", "learning-outcomes", "assistant", "help"];
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const activeTab = VALID_TABS.includes(tabFromUrl) ? tabFromUrl : "dashboard";
  const setActiveTab = useCallback((next) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (!next || next === "dashboard") p.delete("tab");
      else p.set("tab", next);
      return p;
    }, { replace: false });
  }, [setSearchParams]);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile sidebar

  // ── Course panel ───────────────────────────────────────
  const [showCoursePanel, setShowCoursePanel] = useState(false);
  const [courseList, setCourseList] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseListLoaded, setCourseListLoaded] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");

  // Buscar cursos: usa /courses/enrolled (incluye roleName) como fuente principal
  const searchCourses = React.useCallback(async (term) => {
    setLoadingCourses(true);
    try {
      const q = term && term.trim().length > 0 ? term.trim() : "";

      // enrolled es la fuente principal: incluye TODOS los cursos con roleName
      // my-course-offerings como fallback (solo cursos como instructor)
      const [enrolledData, myData] = await Promise.allSettled([
        apiGetCached(`/brightspace/courses/enrolled?active_only=false&limit=200`, { ttl: 300_000 }),
        apiGetCached(`/brightspace/my-course-offerings?active_only=false&limit=50`, { ttl: 300_000 }),
      ]);

      const enrolledItems = enrolledData.status === "fulfilled"
        ? (Array.isArray(enrolledData.value?.items) ? enrolledData.value.items : [])
        : [];
      const myItems = myData.status === "fulfilled"
        ? (Array.isArray(myData.value?.items) ? myData.value.items : [])
        : [];

      // Usar enrolled como base (tiene roleName). Fallback a myItems si enrolled falla.
      let final;
      if (enrolledItems.length > 0) {
        final = enrolledItems;
      } else {
        // Fallback: my-course-offerings (solo instructor, sin roleName)
        final = myItems.map(c => ({ ...c, roleName: "Instructor" }));
      }

      // Filtrar por búsqueda
      if (q) {
        final = final.filter(c =>
          String(c.name || "").toLowerCase().includes(q.toLowerCase()) ||
          String(c.code || "").toLowerCase().includes(q.toLowerCase()) ||
          String(c.id || "").includes(q)
        );
      }

      final.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
      });

      setCourseList(final);
      setCourseListLoaded(true);
    } catch {
      // no bloquear si falla
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  // Auto-cargar la lista de cursos al montar: necesaria para detectar si
  // el usuario es estudiante (no profesor) en el curso actual y redirigir.
  useEffect(() => {
    if (!courseListLoaded && !loadingCourses && orgUnitId && orgUnitId !== 0) {
      searchCourses("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUnitId]);

  // Auto-redirect to /portal if user is only enrolled as student in this course.
  // SuperAdmins are exempt (they can view any course as instructor).
  useEffect(() => {
    if (isSuperAdmin) return;
    if (!orgUnitId || orgUnitId === 0) return;
    if (!courseListLoaded || courseList.length === 0) return;
    const idStr = String(orgUnitId);
    const matches = courseList.filter(c => String(c.id) === idStr);
    if (matches.length === 0) return;
    const hasInstructorRole = matches.some(c => !isStudentRole(c.roleName));
    const hasStudentRole = matches.some(c => isStudentRole(c.roleName));
    if (hasStudentRole && !hasInstructorRole) {
      sessionStorage.setItem("gemelo_pending_org", String(orgUnitId));
      window.location.href = window.location.origin + "/portal";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUnitId, courseListLoaded, courseList, isSuperAdmin]);

  // Cargar lista de cursos del docente (lazy — solo cuando abre el panel)
  const loadCourseList = React.useCallback(async () => {
    if (courseListLoaded || loadingCourses) return;
    await searchCourses("");
  }, [courseListLoaded, loadingCourses, searchCourses]);

  const handleOpenCoursePanel = () => {
    setShowCoursePanel(true);
    loadCourseList();
  };

  // Auto-cargar cursos solo cuando NO hay curso seleccionado (orgUnitId=0)
  // Si orgUnitId > 0 (viene de LTI o selección previa) → ir directo al dashboard
  React.useEffect(() => {
    if (authUser && (!orgUnitId || orgUnitId === 0)) {
      loadCourseList();
    }
    // Si viene con orgUnitId del LTI, no cargar lista — ir directo
  }, [authUser, orgUnitId]);

  const handleSelectCourse = (id) => {
    switchCourse(id);
  };

  // ── Voice search ───────────────────────────────────────
  const [voiceListening, setVoiceListening] = useState(false);
  const recognitionRef = React.useRef(null);

  const voiceSupported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // executeVoiceCommand MUST be declared before toggleVoice (dependency order)
  const executeVoiceCommand = React.useCallback((rawText) => {
    const command = parseVoiceCommand(rawText);
    setVoiceFeedback(command.message || "");

    switch (command.type) {
      case "navigate_section": {
        setAdvancedQuery({ mode: "text", target: null });
        setOnlyRisk(false);
        setQuery("");
        setActiveSection(command.section);
        return;
      }
      case "lowest_result_student": {
        setAdvancedQuery({ mode: "lowest-result", target: null });
        const student = findLowestResultStudent(studentRows);
        if (student) {
          setActiveSection("students");
          setSelectedStudent(student);
          setDrawerTab("resumen");
          setVoiceFeedback(`Abriendo a ${student.displayName} — nota más baja: ${fmtGrade10FromPct(student.currentPerformancePct)}.`);
        } else {
          setVoiceFeedback("No encontré estudiantes con calificación disponible.");
        }
        return;
      }
      case "highest_risk_student": {
        setAdvancedQuery({ mode: "highest-risk", target: null });
        const student = findHighestRiskStudent(studentRows);
        if (student) {
          setActiveSection("priority");
          setSelectedStudent(student);
          setDrawerTab("resumen");
          setVoiceFeedback(`Abriendo a ${student.displayName} — estudiante priorizado por riesgo académico.`);
        } else {
          setVoiceFeedback("No encontré estudiantes priorizados.");
        }
        return;
      }
      case "filter_students_risk": {
        setAdvancedQuery({ mode: "students-at-risk", target: null });
        setActiveSection("students");
        setOnlyRisk(true);
        setQuery("");
        setVoiceFeedback("Filtro activado: solo estudiantes en riesgo.");
        return;
      }
      case "filter_approved": {
        setAdvancedQuery({ mode: "text", target: null });
        setActiveSection("students");
        setOnlyRisk(false);
        setQuery(""); // will filter via advancedQuery
        setAdvancedQuery({ mode: "approved", target: null });
        setVoiceFeedback("Mostrando estudiantes aprobados (nota ≥ 7.0).");
        return;
      }
      case "find_student_by_name": {
        setAdvancedQuery({ mode: "text", target: null });
        const student = findStudentByName(studentRows, command.name);
        if (student) {
          setActiveSection("students");
          setSelectedStudent(student);
          setDrawerTab("resumen");
          setVoiceFeedback(`Abriendo a ${student.displayName}.`);
        } else {
          setQuery(command.name);
          setActiveSection("students");
          setVoiceFeedback(`No encontré coincidencia exacta. Buscando: "${command.name}".`);
        }
        return;
      }
      case "open_drawer_tab": {
        setAdvancedQuery({ mode: "text", target: null });
        if (!selectedStudent) {
          const fallback = findHighestRiskStudent(studentRows);
          if (fallback) {
            setSelectedStudent(fallback);
            setDrawerTab(command.tab);
            setVoiceFeedback(`Abriendo ${command.tab} para ${fallback.displayName}.`);
          } else {
            setVoiceFeedback("No hay estudiante seleccionado. Abre uno primero.");
          }
        } else {
          setDrawerTab(command.tab);
          setVoiceFeedback(`Abriendo ${command.tab} para ${selectedStudent.displayName}.`);
        }
        return;
      }
      case "text_search": {
        setActiveSection("students");
        setOnlyRisk(false);
        setAdvancedQuery({ mode: "text", target: null });
        setQuery(command.text || "");
        return;
      }
      default: {
        // feedback already set above
      }
    }
  }, [studentRows, selectedStudent]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVoice = React.useCallback(() => {
    if (!voiceSupported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (voiceListening) {
      recognitionRef.current?.stop();
      setVoiceListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = "es-CO";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => {
      setVoiceListening(true);
      setVoiceFeedback("🎙️ Escuchando... habla ahora");
    };
    rec.onend   = () => setVoiceListening(false);
    rec.onerror = () => {
      setVoiceListening(false);
      setVoiceFeedback("No fue posible capturar el audio. Intenta de nuevo.");
    };

    rec.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ")
        .trim();
      if (transcript) {
        executeVoiceCommand(transcript);
      } else {
        setVoiceFeedback("No se detectó un comando claro.");
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }, [voiceListening, voiceSupported, executeVoiceCommand]);

  // Stop recognition on unmount
  React.useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const hideGlobalProgressCol = isNarrow;
  const hideCriticalMacroCol = isMobile;
  const compactRouteCol = isNarrow;
  const useCards = isMobile;

  /**
   * Load course overview/student dashboard
   */
  useEffect(() => {
    // No cargar si no hay curso seleccionado
    if (!orgUnitId || orgUnitId === 0) {
      setLoading(false);
      setOverview(null);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    setLoading(true);
    setErr("");
    setOverview(null);
    setStudentsList(null);
    setStudentRows([]);
    setRaDashboard(null);
    setLearningOutcomesPayload(null);
    setOutcomesMap({});

    // Si el usuario pidio "Actualizar ahora", forzamos datos en vivo desde
    // Brightspace (bypass del cache de 30 min) SOLO para esta corrida, y
    // reseteamos el flag para que las cargas siguientes vuelvan a ser
    // DB-first (rapidas). Forzar tambien dispara el re-sync en background que
    // refresca enrollments (add/remove de estudiantes) y snapshots.
    const forceFresh = forceFreshRef.current;
    forceFreshRef.current = false;
    const overviewUrl =
      `/gemelo/course/${orgUnitId}/overview` +
      (forceFresh ? "?fresh_max_minutes=0" : "");

    (async () => {
      try {
        if (forceFresh) invalidateApiCache(`/gemelo/course/${orgUnitId}/`);
        const [ovRes, stRes, raRes, loRes] = await Promise.allSettled([
          apiGetCached(overviewUrl, { signal: controller.signal, force: forceFresh }),
          apiGetCached(`/gemelo/course/${orgUnitId}/students?include=summary`, { signal: controller.signal, force: forceFresh }),
          apiGetCached(`/gemelo/course/${orgUnitId}/ra/dashboard`, { signal: controller.signal, force: forceFresh }),
          apiGetCached(`/gemelo/course/${orgUnitId}/learning-outcomes`, { signal: controller.signal, force: forceFresh }),
        ]);

        if (!isMounted) return;
        if (ovRes.status !== "fulfilled") { setLoading(false); throw ovRes.reason; }
        if (stRes.status !== "fulfilled") { setLoading(false); throw stRes.reason; }

        const ov = ovRes.value;
        const st = stRes.value;

        setOverview(ov);
        setStudentsList(st);
        if (raRes.status === "fulfilled") setRaDashboard(raRes.value);

        if (loRes.status === "fulfilled") {
          const payload = loRes.value;
          setLearningOutcomesPayload(payload);

          // Recorre recursivamente cualquier arbol de outcomes de Brightspace
          // (algunos cursos, como 41634, definen los RAs como subOutcomes
          // anidados; el walker plano anterior los pasaba por alto).
          const map = {};
          const walk = (node) => {
            if (!node) return;
            if (Array.isArray(node)) { node.forEach(walk); return; }
            if (typeof node !== "object") return;

            const desc = String(node.Description ?? node.description ?? "").trim();
            if (desc) {
              const m = desc.match(/^([A-Za-z0-9_.-]+)\s*[-–—:]\s*(.+)$/);
              if (m) {
                const code = String(m[1]).toUpperCase();
                if (!map[code]) {
                  map[code] = { code, description: desc, title: String(m[2] || "").trim() };
                }
              }
            }
            const children =
              node.Outcomes || node.outcomes ||
              node.SubOutcomes || node.subOutcomes ||
              node.ChildOutcomes || node.childOutcomes ||
              node.Children || node.children;
            if (children) walk(children);
          };
          walk(payload?.outcomeSets ?? payload);
          setOutcomesMap(map);
        }

        const studentItems = (st?.students?.items || st?.items || []).slice();
        const thr = ov?.thresholds || { critical: 50, watch: 70 };

        const baseRows = studentItems.map((s) => {
          const userId = s.userId ?? s.UserId ?? s.Identifier;
          const base = {
            userId: Number(userId),
            displayName: s.displayName ?? s.DisplayName ?? "—",
            email: s.email ?? s.EmailAddress ?? null,
            roleName: s.roleName ?? "—",
            isLoading: true,
            risk: "cargando",
            globalPct: null,
            currentPerformancePct: null,
            coveragePct: null,
            coverageCountText: null,
            gradedItemsCount: null,
            totalItemsCount: null,
            hasPrescription: false,
            mostCriticalMacro: null,
            notSubmittedWeightPct: null,
          };
          base.route = suggestRouteForStudent(base, thr);
          return base;
        });

        setStudentRows(baseRows);
        setLoading(false);

        // hasInlineSummary: detecta si el backend devolvió métricas reales con datos de nota.
        // Requisito: al menos un estudiante tiene currentPerformancePct o coveragePct real.
        // Si el batch endpoint retornó todos nulos (falla silenciosa), caemos al mapLimit.
        const _hasMeaningfulData = studentItems.some((s) => {
          const sum = s.summary ?? s.gradebook ?? {};
          return sum?.currentPerformancePct != null || sum?.coveragePct != null;
        });
        // También consideramos válido si hay estructura de items (totalItemsCount > 0)
        // para al menos un estudiante — aunque no tenga nota aún
        const _hasStructure = studentItems.some((s) => {
          const sum = s.summary ?? s.gradebook ?? {};
          return (sum?.totalItemsCount != null && sum.totalItemsCount > 0);
        });
        const hasInlineSummary = studentItems.length > 0 && (_hasMeaningfulData || _hasStructure);

        if (hasInlineSummary) {
          const details = studentItems.map((s) => {
            const userId = s.userId ?? s.UserId ?? s.Identifier;
            const sum = s.summary ?? s.gradebook ?? s;
            const gradedItemsCount = sum?.gradedItemsCount ?? sum?.coverageGradedCount ?? null;
            const totalItemsCount = sum?.totalItemsCount ?? sum?.coverageTotalCount ?? null;
            const coverageCountText =
              sum?.coverageCountText ??
              (gradedItemsCount != null && totalItemsCount != null ? `${gradedItemsCount}/${totalItemsCount}` : null);

            const row = {
              userId: Number(userId),
              displayName: s.displayName ?? s.DisplayName ?? "—",
              roleName: s.roleName ?? "—",
              isLoading: false,
              // Riesgo siempre desde nota del gradebook (no del campo risk del backend que puede ser de RA)
              risk: computeRiskFromPct(sum?.currentPerformancePct ?? null),
              globalPct: sum?.globalPct ?? null,
              currentPerformancePct: sum?.currentPerformancePct ?? null,
              coveragePct: sum?.coveragePct ?? null,
              gradedItemsCount,
              totalItemsCount,
              coverageCountText,
              hasPrescription: Boolean(sum?.hasPrescription ?? s?.hasPrescription ?? false),
              mostCriticalMacro: s?.mostCriticalMacro ?? null,
              // Nombres normalizados: pendingSubmitted + overdue para compatibilidad con toda la UI
              pendingSubmittedCount:     sum?.pendingUngradedCount      ?? sum?.pendingSubmittedCount      ?? 0,
              pendingSubmittedWeightPct: sum?.pendingUngradedWeightPct  ?? sum?.pendingSubmittedWeightPct  ?? 0,
              overdueCount:              sum?.overdueUnscoredCount       ?? sum?.overdueCount               ?? 0,
              overdueWeightPct:          sum?.overdueUnscoredWeightPct   ?? sum?.overdueWeightPct           ?? 0,
              notSubmittedCount:         sum?.overdueUnscoredCount       ?? sum?.notSubmittedCount          ?? 0,
              notSubmittedWeightPct:     sum?.overdueUnscoredWeightPct   ?? sum?.notSubmittedWeightPct      ?? 0,
            };
            row.route = suggestRouteForStudent(row, thr);
            return row;
          });

          if (!isMounted) return;
          setStudentRows(details);

          // Enriquecer con datos de overview.studentsAtRisk (ya tiene currentPerformancePct
          // calculado por build_course_overview que sí usa build_gemelo individual).
          // Esto evita hacer llamadas adicionales a /student/{id} que pueden fallar por CORS
          // en algunos entornos de producción.
          const atRiskMap = {};
          for (const s of (ov?.studentsAtRisk || [])) {
            if (s.userId != null) atRiskMap[Number(s.userId)] = s;
          }
          // mostCriticalMacro por estudiante (TODOS, no solo en riesgo) — así la
          // tarjeta muestra el RA crítico real del estudiante y coincide con su detalle.
          const macroMap = ov?.studentsMostCriticalMacro || {};

          if (Object.keys(atRiskMap).length > 0 || Object.keys(macroMap).length > 0) {
            setStudentRows((prev) =>
              prev.map((row) => {
                const ar = atRiskMap[row.userId];
                const ownMacro = macroMap[row.userId] ?? macroMap[String(row.userId)] ?? null;
                if (!ar) {
                  // No en riesgo: solo enriquecer el RA crítico individual si existe.
                  if (!ownMacro) return row;
                  const merged = { ...row, mostCriticalMacro: ownMacro };
                  merged.route = suggestRouteForStudent(merged, thr);
                  return merged;
                }
                const perf = ar.currentPerformancePct ?? null;
                const merged = {
                  ...row,
                  currentPerformancePct: perf,
                  coveragePct: ar.coveragePct ?? row.coveragePct,
                  risk: computeRiskFromPct(perf),
                  notSubmittedWeightPct: Number(ar.overdueUnscoredWeightPct ?? ar.notSubmittedWeightPct ?? 0),
                  overdueWeightPct:      Number(ar.overdueUnscoredWeightPct ?? ar.notSubmittedWeightPct ?? 0),
                  pendingSubmittedWeightPct: Number(ar.pendingUngradedWeightPct ?? ar.pendingSubmittedWeightPct ?? 0),
                  // mostCriticalMacro: preferir el del estudiante en riesgo, luego el mapa global
                  mostCriticalMacro: ar.mostCriticalMacro ?? ownMacro ?? row.mostCriticalMacro ?? null,
                };
                merged.route = suggestRouteForStudent(merged, thr);
                return merged;
              })
            );
          }
          return;
        }

        // El batch /students?include=summary no devolvió estructura (hasInlineSummary=false).
        // Enriquecer desde overview.studentsAtRisk en lugar de llamar /student/{id}
        // (esas llamadas pueden fallar por CORS en producción).
        const atRiskMap2 = {};
        for (const s of (ov?.studentsAtRisk || [])) {
          if (s.userId != null) atRiskMap2[Number(s.userId)] = s;
        }
        const macroMap2 = ov?.studentsMostCriticalMacro || {};
        setStudentRows((prev) =>
          prev.map((row) => {
            const ar = atRiskMap2[row.userId];
            const ownMacro2 = macroMap2[row.userId] ?? macroMap2[String(row.userId)] ?? null;
            const perf = ar?.currentPerformancePct ?? null;
            const merged = {
              ...row,
              isLoading: false,
              currentPerformancePct: perf,
              coveragePct: ar?.coveragePct ?? row.coveragePct,
              risk: computeRiskFromPct(perf),
              notSubmittedWeightPct: Number(ar?.overdueUnscoredWeightPct ?? ar?.notSubmittedWeightPct ?? 0),
              overdueWeightPct:      Number(ar?.overdueUnscoredWeightPct ?? ar?.notSubmittedWeightPct ?? 0),
              pendingSubmittedWeightPct: Number(ar?.pendingUngradedWeightPct ?? ar?.pendingSubmittedWeightPct ?? 0),
              mostCriticalMacro: ar?.mostCriticalMacro ?? ownMacro2 ?? row.mostCriticalMacro ?? null,
            };
            merged.route = suggestRouteForStudent(merged, thr);
            return merged;
          })
        );
      } catch (e) {
        // Ignorar aborts (propios o de un consumidor compartido en apiGetCached):
        // no son errores reales del curso, solo cancelaciones de montaje/unmount.
        if (controller.signal.aborted || !isMounted || e?.name === "AbortError") return;
        setErr(String(e?.message || e));
        setLoading(false);
      }
      // Mark the data as fetched NOW (after successful or attempted load)
      if (isMounted) setLastUpdate(Date.now());
    })();

    return () => {
      isMounted = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUnitId, refreshKey]);

  /**
   * Load course info + content root
   */
  useEffect(() => {
    if (!orgUnitId) return;

    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        const [courseRes, contentRes] = await Promise.allSettled([
          apiGetCached(`/brightspace/course/${orgUnitId}`, { signal: controller.signal, ttl: 300_000 }),
          apiGetCached(`/brightspace/course/${orgUnitId}/content/root`, { signal: controller.signal, ttl: 300_000 }),
        ]);

        if (!alive) return;

        if (courseRes.status === "fulfilled") {
          setCourseInfo(courseRes.value);
        } else {
          console.error("Error cargando curso:", courseRes.reason);
          setCourseInfo(null);
        }

        if (contentRes.status === "fulfilled") {
          setContentRoot(Array.isArray(contentRes.value) ? contentRes.value : []);
        } else {
          console.error("Error cargando contenido root:", contentRes.reason);
          setContentRoot([]);
        }
      } catch (e) {
        if (!alive || controller.signal.aborted) return;
        console.error("Error cargando curso/contenido:", e);
        setCourseInfo(null);
        setContentRoot([]);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgUnitId, refreshKey]);

  /**
   * Accesos al curso (LastAccessed del classlist) y consumo de contenidos
   * por estudiante (user progress). Best-effort: si fallan, las tarjetas
   * muestran "no disponible" sin romper el dashboard.
   */
  useEffect(() => {
    if (!orgUnitId) return;
    let alive = true;
    setLastAccessMap({});
    setClasslistItems([]);
    setInstructors(null);
    setContentTopics(null);
    setConsumption(null);

    (async () => {
      try {
        const ins = await apiGetCached(`/brightspace/course/${orgUnitId}/instructors`, { ttl: 300_000 });
        if (alive) setInstructors(Array.isArray(ins?.items) ? ins.items : []);
      } catch {
        if (alive) setInstructors([]);
      }
    })();

    (async () => {
      try {
        const ct = await apiGetCached(`/brightspace/course/${orgUnitId}/content/topics`, { ttl: 300_000 });
        if (alive) setContentTopics(Array.isArray(ct?.items) ? ct.items : []);
      } catch {
        if (alive) setContentTopics([]);
      }
    })();

    (async () => {
      try {
        const cl = await apiGetCached(`/brightspace/course/${orgUnitId}/classlist`, { ttl: 300_000 });
        if (!alive) return;
        const items = Array.isArray(cl?.items) ? cl.items : [];
        const map = {};
        for (const u of items) {
          if (u?.Identifier != null) map[String(u.Identifier)] = u.LastAccessed || null;
        }
        setLastAccessMap(map);
        setClasslistItems(items);
      } catch { /* opcional */ }
    })();

    (async () => {
      try {
        const c = await apiGetCached(`/brightspace/course/${orgUnitId}/content/consumption`, { ttl: 300_000 });
        if (alive) setConsumption(c && typeof c === "object" ? c : { perUser: {} });
      } catch {
        if (alive) setConsumption({ perUser: {} });
      }
    })();

    return () => { alive = false; };
  }, [orgUnitId, refreshKey]);

  /**
   * Load student detail
   */
  useEffect(() => {
    if (!selectedStudent?.userId) return;

    let alive = true;
    const controller = new AbortController();

    setStudentLoading(true);
    setStudentErr("");
    setStudentDetail(null);
    setDrawerTab("resumen");

    (async () => {
      try {
        const g = await apiGetCached(`/gemelo/course/${orgUnitId}/student/${selectedStudent.userId}`, {
          signal: controller.signal,
        });
        if (!alive) return;

        // Si el servidor no incluyó evidencias en el gradebook (modo estudiante en server antiguo),
        // las obtenemos del endpoint directo de Brightspace.
        const hasEvidences = Array.isArray(g?.gradebook?.evidences) && g.gradebook.evidences.length > 0;
        if (!hasEvidences && g?.summary?.gradedItemsCount > 0) {
          try {
            const ev = await apiGet(
              `/brightspace/course/${orgUnitId}/grades/student/${selectedStudent.userId}/evidence`,
              { signal: controller.signal }
            );
            if (alive && Array.isArray(ev?.items)) {
              const normalized = ev.items
                .filter((e) => e.points != null || e.displayed != null)
                .map((e) => {
                  const pts  = e.points   != null ? Number(e.points)    : null;
                  const max  = e.maxPoints != null ? Number(e.maxPoints) : null;
                  const scorePct = pts != null && max != null && max > 0
                    ? Math.round((pts / max) * 1000) / 10
                    : null;
                  return {
                    gradeObjectId: e.gradeObjectId,
                    name:      e.name || `Ítem ${e.gradeObjectId}`,
                    weightPct: e.weight != null ? Number(e.weight) : null,
                    scorePct,
                    status:    scorePct != null ? "graded" : (e.displayed ? "pending" : "open"),
                  };
                });
              g.gradebook = { ...(g.gradebook || {}), evidences: normalized };
            }
          } catch {
            // evidencias no disponibles — no bloquear el drawer
          }
        }

        // Enrich with email from studentRows (the list endpoint includes it)
        const rowMatch = studentRows.find((r) => r.userId === selectedStudent.userId);
        if (rowMatch?.email && !g.email) {
          g.email = rowMatch.email;
        }
        setStudentDetail(g);
      } catch (e) {
        if (controller.signal.aborted || !alive) return;
        setStudentErr(String(e?.message || e));
      } finally {
        if (!alive) return;
        setStudentLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [selectedStudent?.userId, orgUnitId]);

  // #13 Per-course threshold override (persisted in localStorage)
  const [thresholdsOverride, setThresholdsOverride] = useState(null);
  const [showThresholdsModal, setShowThresholdsModal] = useState(false);
  useEffect(() => {
    if (!orgUnitId) { setThresholdsOverride(null); return; }
    try {
      const raw = localStorage.getItem(`gemelo_thresholds_${orgUnitId}`);
      setThresholdsOverride(raw ? JSON.parse(raw) : null);
    } catch { setThresholdsOverride(null); }
  }, [orgUnitId]);
  const baseThresholds = overview?.thresholds || { critical: 50, watch: 70 };
  const thresholds = thresholdsOverride
    ? { ...baseThresholds, ...thresholdsOverride }
    : baseThresholds;
  const saveThresholds = (next) => {
    if (!orgUnitId) return;
    const clean = {
      critical: Math.max(0, Math.min(100, Number(next.critical) || 0)),
      watch: Math.max(0, Math.min(100, Number(next.watch) || 0)),
    };
    if (clean.watch < clean.critical) clean.watch = clean.critical;
    setThresholdsOverride(clean);
    try { localStorage.setItem(`gemelo_thresholds_${orgUnitId}`, JSON.stringify(clean)); } catch { /* ignore */ }
  };
  const resetThresholds = () => {
    setThresholdsOverride(null);
    try { localStorage.removeItem(`gemelo_thresholds_${orgUnitId}`); } catch { /* ignore */ }
  };

  const riskData = useMemo(() => {
    // Calculado desde notas reales (no globalRiskDistribution del backend que puede ser por RA)
    const counts = { alto: 0, medio: 0, bajo: 0 };
    for (const s of studentRows) {
      if (s.isLoading || s.currentPerformancePct == null) continue;
      const r = computeRiskFromPct(s.currentPerformancePct);
      if (r in counts) counts[r]++;
    }
    return [
      { name: "Alto", key: "alto", value: counts.alto },
      { name: "Medio", key: "medio", value: counts.medio },
      { name: "Bajo", key: "bajo", value: counts.bajo },
    ];
  }, [studentRows]);

  const learningOutcomesData = useMemo(() => {
  const ras = Array.isArray(raDashboard?.ras) ? raDashboard.ras : [];
  const descList = flattenOutcomeDescriptions(learningOutcomesPayload);

  // Mostrar TODOS los RAs, incluso los sin datos (studentsWithData=0)
  // effectiveRas: si hay al menos 1 RA definido en el dashboard, mostrarlos todos
  const effectiveRas = ras.length > 0 ? ras : [];

  if (effectiveRas.length) {
    const outcomeMap = {};
    Object.values(outcomesMap || {}).forEach((o) => {
      if (o?.code) outcomeMap[String(o.code).toUpperCase()] = o;
    });

    const w = 100 / effectiveRas.length;

    return effectiveRas.map((r, idx) => {
      const code = String(r.code || `RA${idx + 1}`).toUpperCase();
      const match = outcomeMap[code];
      const fallbackDesc = descList[idx] || "";

      return {
        code,
        name: match?.title || r.label || fallbackDesc || code,
        description: match?.description || fallbackDesc || r.label || code,
        avgPct: Number(r.avgPct ?? 0),
        weightPct: Number(r.weightPct ?? w),
        status: r.status || null,
        coveragePct: Number(r.coveragePct ?? 0),
        studentsWithData: Number(r.studentsWithData ?? 0),
        totalStudents: Number(r.totalStudents ?? 0),
        alignedToAssignment: r.alignedToAssignment !== false,
        note: r.note || null,
      };
    });
  }

  // Fallback: no vino raDashboard.ras pero sí hay outcomes. Preferimos
  // usar los códigos reales (Z1O1DOR3, A1O3EAR2…) que trae el backend
  // en outcomeCodeMap → outcomesMap; sólo caemos a RA1..RAN si no hay
  // códigos detectables.
  const outcomeEntries = Object.values(outcomesMap || {}).filter((o) => o?.code);
  if (outcomeEntries.length) {
    const w = 100 / outcomeEntries.length;
    return outcomeEntries.map((o) => ({
      code: String(o.code).toUpperCase(),
      name: o.title || o.description || o.code,
      description: o.description || o.title || o.code,
      avgPct: 0,
      weightPct: w,
      status: null,
      coveragePct: 0,
      studentsWithData: 0,
      totalStudents: 0,
    }));
  }

  if (descList.length) {
    const w = 100 / descList.length;
    return descList.map((d, idx) => ({
      code: `RA${idx + 1}`,
      name: d,
      description: d,
      avgPct: 0,
      weightPct: w,
      status: null,
      coveragePct: 0,
      studentsWithData: 0,
      totalStudents: 0,
    }));
  }

  return [];
}, [raDashboard, learningOutcomesPayload, outcomesMap]);

// RA evaluados por QUIZ (pestaña lateral). El backend ya devuelve el promedio
// por outcome alineado a quizzes; aquí sólo lo adaptamos a la forma de fila.
const quizOutcomesData = useMemo(() => {
  const qo = Array.isArray(raDashboard?.quizOutcomes) ? raDashboard.quizOutcomes : [];
  const outcomeMap = {};
  Object.values(outcomesMap || {}).forEach((o) => {
    if (o?.code) outcomeMap[String(o.code).toUpperCase()] = o;
  });
  return qo.map((r, idx) => {
    const code = String(r.code || `RA${idx + 1}`).toUpperCase();
    const match = outcomeMap[code];
    return {
      code,
      name: match?.title || r.title || r.label || code,
      description: match?.description || r.title || r.label || code,
      avgPct: Number(r.avgPct ?? 0),
      weightPct: null,
      status: null,
      coveragePct: Number(r.coveragePct ?? 0),
      studentsWithData: Number(r.studentsWithData ?? 0),
      totalStudents: Number(r.totalStudents ?? 0),
      source: "quiz",
    };
  });
}, [raDashboard, outcomesMap]);

const weakestAssignment = useMemo(() => {
  const allEvidence = [];

  for (const s of studentRows) {
    const evs = s?.evidences || s?.gradebook?.evidences || [];
    for (const ev of evs) {
      if (ev?.scorePct != null && !Number.isNaN(Number(ev.scorePct))) {
        allEvidence.push({
          gradeObjectId: ev.gradeObjectId,
          name: ev.name || `Ítem ${ev.gradeObjectId}`,
          scorePct: Number(ev.scorePct),
        });
      }
    }
  }

  if (!allEvidence.length) return null;

  const byItem = {};
  for (const ev of allEvidence) {
    const key = String(ev.gradeObjectId);
    if (!byItem[key]) {
      byItem[key] = {
        gradeObjectId: ev.gradeObjectId,
        name: ev.name,
        values: [],
      };
    }
    byItem[key].values.push(ev.scorePct);
  }

  const summary = Object.values(byItem).map((it) => {
    const avg = it.values.reduce((a, b) => a + b, 0) / it.values.length;
    return {
      gradeObjectId: it.gradeObjectId,
      name: it.name,
      avgPct: avg,
      count: it.values.length,
    };
  });

  summary.sort((a, b) => a.avgPct - b.avgPct);
  return summary[0] || null;
}, [studentRows]);

  const weakestMacro = useMemo(() => {
  if (!Array.isArray(learningOutcomesData) || !learningOutcomesData.length) return null;

  const valid = learningOutcomesData
    .filter((m) => m && m.avgPct != null && !Number.isNaN(Number(m.avgPct)))
    .map((m) => ({
      ...m,
      avgPct: Number(m.avgPct),
      coveragePct: Number(m.coveragePct ?? 0),
      studentsWithData: Number(m.studentsWithData ?? 0),
      totalStudents: Number(m.totalStudents ?? 0),
    }));

  if (!valid.length) return null;

  // Preferir RAs que SÍ se han usado (con datos/cobertura). Un RA en 0% sin
  // estudiantes evaluados es "no usado", no un desempeño real de 0; mostrar el
  // más bajo entre los usados. Solo si ninguno tiene datos, caer a todos.
  const used = valid.filter((m) => m.studentsWithData > 0 || m.coveragePct > 0);
  const pool = used.length ? used : valid;

  pool.sort((a, b) => a.avgPct - b.avgPct);
  return pool[0];
}, [learningOutcomesData]);

  const assignmentRiskData = useMemo(() => {
    const toItem = (raw, perf, overduePct, pendingPct, coveragePct) => {
      const risk = computeRiskFromPct(perf);
      const type =
        risk === "alto" || (perf != null && Number(perf) < 50)
          ? "low_grade"
          : overduePct > 0
          ? "overdue"
          : pendingPct > 0
          ? "pending_submitted"
          : "low_coverage";
      return {
        ...raw, type, risk,
        currentPerformancePct: perf != null ? Number(perf) : null,
        notSubmittedWeightPct: overduePct,
        pendingSubmittedWeightPct: pendingPct,
        coveragePct: Number(coveragePct ?? 0),
      };
    };

    // Lookup de nombres desde studentRows (classlist) para enriquecer
    // cuando el backend devuelve displayName == String(userId) (DB sin sync de classlist aún)
    const nameByUserId = new Map();
    for (const s of studentRows) {
      if (s.userId != null && s.displayName) {
        nameByUserId.set(String(s.userId), s.displayName);
      }
    }
    const resolveName = (userId, fallbackName) => {
      const richer = nameByUserId.get(String(userId));
      if (richer) return richer;
      // Si el "name" backend es solo el userId (sin sincronizar), no mostrar dígitos
      if (fallbackName && String(fallbackName) !== String(userId)) return fallbackName;
      return `Estudiante ${userId}`;
    };

    // Fuente 1: overview.studentsAtRisk (backend)
    const backendRisk = Array.isArray(overview?.studentsAtRisk) ? overview.studentsAtRisk : [];
    let candidates = [];
    if (backendRisk.length > 0) {
      candidates = backendRisk.map((s) =>
        toItem(
          { userId: s.userId, name: resolveName(s.userId, s.displayName) },
          s.currentPerformancePct,
          Number(s.overdueUnscoredWeightPct ?? s.notSubmittedWeightPct ?? 0),
          Number(s.pendingUngradedWeightPct ?? s.pendingSubmittedWeightPct ?? 0),
          s.coveragePct,
        )
      );
    } else {
      // Fuente 2: studentRows cargados
      const loaded = studentRows.filter((s) => !s.isLoading);
      candidates = loaded.map((s) =>
        toItem(
          { userId: s.userId, name: s.displayName },
          s.currentPerformancePct,
          Number(s.notSubmittedWeightPct ?? s.overdueWeightPct ?? 0),
          Number(s.pendingSubmittedWeightPct ?? 0),
          s.coveragePct,
        )
      );
    }

    const filtered = candidates.filter((s) => {
      if (s.risk === "alto" || s.risk === "medio") return true;
      if (s.risk === "pending") return s.coveragePct < 60 || s.notSubmittedWeightPct > 0 || s.pendingSubmittedWeightPct > 0;
      return s.notSubmittedWeightPct > 10 || s.pendingSubmittedWeightPct > 10;
    });

    const riskOrder = { alto: 0, medio: 1, pending: 2, bajo: 3 };
    filtered.sort((a, b) => {
      const ro = (riskOrder[a.risk] ?? 3) - (riskOrder[b.risk] ?? 3);
      if (ro !== 0) return ro;
      return (a.currentPerformancePct ?? 999) - (b.currentPerformancePct ?? 999);
    });

    const seen = new Set();
    return filtered.filter((s) => {
      if (seen.has(s.userId)) return false;
      seen.add(s.userId);
      return true;
    }).slice(0, 8);
  }, [overview, studentRows]);

  const avgPerfPct = overview?.courseGradebook?.avgCurrentPerformancePct ?? null;
  const avgCov = overview?.courseGradebook?.avgCoveragePct ?? null;
  const covDone = avgCov == null ? 0 : Math.max(0, Math.min(100, Number(avgCov)));

  // avgPendingUngradedPct: enviado sin nota. Fuente 1: backend. Fuente 2: promedio de studentRows.
  const avgPendingUngradedPct = useMemo(() => {
    const direct =
      overview?.courseGradebook?.avgPendingUngradedPct ??
      overview?.courseGradebook?.avgPendingSubmittedPct;
    if (direct != null && !Number.isNaN(Number(direct))) {
      return Math.max(0, Math.min(100, Number(direct)));
    }
    const loaded = studentRows.filter((s) => !s.isLoading);
    if (loaded.length > 0) {
      const vals = loaded
        .map((s) => Number(s.pendingSubmittedWeightPct ?? 0))
        .filter((x) => !Number.isNaN(x));
      if (vals.length > 0)
        return Math.min(100, vals.reduce((a, b) => a + b, 0) / loaded.length);
    }
    return 0;
  }, [overview, studentRows]);

  // avgOverdueUnscoredPct: vencido sin registro. Fuente 1: backend. Fuente 2: promedio de studentRows.
  const avgOverdueUnscoredPct = useMemo(() => {
    const direct =
      overview?.courseGradebook?.avgOverdueUnscoredPct ??
      overview?.courseGradebook?.avgNotSubmittedPct;
    if (direct != null && !Number.isNaN(Number(direct))) {
      return Math.max(0, Math.min(100, Number(direct)));
    }
    const loaded = studentRows.filter((s) => !s.isLoading);
    if (loaded.length > 0) {
      const vals = loaded
        .map((s) => Number(s.overdueWeightPct ?? s.notSubmittedWeightPct ?? 0))
        .filter((x) => !Number.isNaN(x));
      if (vals.length > 0)
        return Math.min(100, vals.reduce((a, b) => a + b, 0) / loaded.length);
    }
    // Fallback 2: studentsAtRisk si rows aún no cargaron
    const atRisk = Array.isArray(overview?.studentsAtRisk) ? overview.studentsAtRisk : [];
    if (atRisk.length > 0) {
      const total = overview?.studentsCount ?? atRisk.length;
      const sum = atRisk.reduce(
        (acc, s) => acc + Number(s.overdueUnscoredWeightPct ?? s.notSubmittedWeightPct ?? 0), 0
      );
      return Math.min(100, sum / total);
    }
    return 0;
  }, [overview, studentRows]);

  const covPending = Math.max(
    0,
    Math.min(100, 100 - covDone - avgPendingUngradedPct - avgOverdueUnscoredPct)
  );

  const studentsCount = overview?.studentsCount ?? studentsList?.students?.count ?? studentRows.length ?? 0;
  const totalStudents = Number(studentsCount || 0) || 0;
  // atRiskCount calculado desde nota real (computeRiskFromPct), no desde globalRiskDistribution del backend
  // que puede basarse en RA/rúbricas y no en el gradebook final.
  const atRiskCount = studentRows.filter((s) => {
    if (s.isLoading || s.currentPerformancePct == null) return false;
    return computeRiskFromPct(s.currentPerformancePct) !== "bajo";
  }).length;
  const atRiskPct = totalStudents > 0 ? (atRiskCount / totalStudents) * 100 : null;

  const courseStatus = useMemo(() => {
    if (avgPerfPct != null && Number(avgPerfPct) > 0) {
      const p = Number(avgPerfPct);
      if (p < thresholds.critical) return "critico";
      if (p < thresholds.watch) return "en seguimiento";
      return "solido";
    }
    // Fallback: distribución calculada desde notas reales de studentRows
    const loaded = studentRows.filter((s) => !s.isLoading && s.currentPerformancePct != null);
    if (!loaded.length) return "pending";
    const a = loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "alto").length;
    const m = loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "medio").length;
    const b = loaded.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "bajo").length;
    if (a >= m && a >= b && a > 0) return "critico";
    if (m >= a && m >= b && m > 0) return "en desarrollo";
    if (b > 0) return "solido";
    return "pending";
  }, [avgPerfPct, thresholds, overview, studentRows]);

  const filteredStudents = useMemo(() => {
    let list = Array.isArray(studentRows) ? [...studentRows] : [];

    // advancedQuery modes override normal filters
    if (advancedQuery.mode === "lowest-result") {
      const s = findLowestResultStudent(list);
      return s ? [s] : [];
    }
    if (advancedQuery.mode === "highest-risk") {
      const s = findHighestRiskStudent(list);
      return s ? [s] : [];
    }
    if (advancedQuery.mode === "students-at-risk") {
      return list.filter((s) => ["alto", "medio"].includes(computeRiskFromPct(s.currentPerformancePct)));
    }
    if (advancedQuery.mode === "approved") {
      return list.filter((s) => s.currentPerformancePct != null && s.currentPerformancePct >= 70);
    }

    // Normal filter path
    if (onlyRisk) list = list.filter((s) => ["alto", "medio"].includes(computeRiskFromPct(s.currentPerformancePct)));

    // Quick filter chips
    if (quickFilter === "risk_high") {
      list = list.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "alto");
    } else if (quickFilter === "risk_medium") {
      list = list.filter((s) => computeRiskFromPct(s.currentPerformancePct) === "medio");
    } else if (quickFilter === "no_coverage") {
      list = list.filter((s) => (s.coveragePct ?? 0) < 40);
    } else if (quickFilter === "overdue") {
      list = list.filter((s) => (s.notSubmittedWeightPct ?? s.overdueWeightPct ?? 0) > 0);
    } else if (quickFilter === "pending_grade") {
      list = list.filter((s) => (s.pendingSubmittedWeightPct ?? 0) > 0);
    } else if (quickFilter === "approved") {
      list = list.filter((s) => s.currentPerformancePct != null && s.currentPerformancePct >= 70);
    } else if (quickFilter === "no_grade") {
      list = list.filter((s) => s.currentPerformancePct == null);
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          String(s.userId).includes(q) ||
          String(s.displayName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [studentRows, query, onlyRisk, advancedQuery, quickFilter]);

const contentKpis = useMemo(() => {
    const root = Array.isArray(contentRoot) ? contentRoot : [];
    if (!root.length) {
      return { createdCount: null, minExpected: null, progressRatio: null };
    }

    const start = toDate(courseInfo?.StartDate);
    const end = toDate(courseInfo?.EndDate);
    if (!start) {
      return { createdCount: null, minExpected: null, progressRatio: null };
    }

    const now = new Date();
    const windowEnd = end && end < now ? end : now;

    let createdCount = 0;

    for (const mod of root) {
      if (mod?.IsHidden === true) continue;

      const items = Array.isArray(mod?.Structure) ? mod.Structure : [];
      for (const it of items) {
        const isVisible = it?.IsHidden !== true;
        const isLeafContent = Number(it?.Type) === 1; // no contar módulos/folders
        const itDate = toDate(it?.LastModifiedDate);

        if (isVisible && isLeafContent && itDate && itDate >= start) {
          createdCount += 1;
        }
      }
    }

    const weeks = weeksBetween(start, windowEnd);
    const minExpected = Math.max(1, Math.ceil(weeks / 2));
    const progressRatio = minExpected > 0 ? clamp(createdCount / minExpected, 0, 2) : null;

    // Desglose por tipo de los mismos contenidos que cuenta createdCount
    const typeCounts = {};
    for (const mod of root) {
      if (mod?.IsHidden === true) continue;
      for (const it of (Array.isArray(mod?.Structure) ? mod.Structure : [])) {
        const itDate = toDate(it?.LastModifiedDate);
        if (it?.IsHidden !== true && Number(it?.Type) === 1 && itDate && itDate >= start) {
          const label = contentTypeLabel(it?.Title || it?.ShortTitle);
          typeCounts[label] = (typeCounts[label] || 0) + 1;
        }
      }
    }
    const typeBreakdown = Object.entries(typeCounts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    return { createdCount, minExpected, progressRatio, typeBreakdown };
  }, [contentRoot, courseInfo?.StartDate, courseInfo?.EndDate]);

  const contentRhythmMeta = useMemo(() => {
    return contentRhythmStatus(contentKpis?.progressRatio);
  }, [contentKpis]);

  // Total de temas de contenido visibles del curso (para % de consumo).
  // Preferimos /content/topics porque recorre módulos anidados; el root solo
  // trae el primer nivel y en cursos con submódulos contaba 0, dejando la
  // barra de promedio de acceso a contenidos sin mostrar (avgPct null).
  const totalContentTopics = useMemo(() => {
    if (Array.isArray(contentTopics) && contentTopics.length) {
      return contentTopics.filter((t) => t?.IsHidden !== true).length;
    }
    let n = 0;
    for (const mod of (Array.isArray(contentRoot) ? contentRoot : [])) {
      if (mod?.IsHidden === true) continue;
      for (const it of (Array.isArray(mod?.Structure) ? mod.Structure : [])) {
        if (it?.IsHidden !== true && Number(it?.Type) === 1) n += 1;
      }
    }
    return n;
  }, [contentTopics, contentRoot]);

  // Consumo de contenidos por estudiantes (temas visitados / total temas)
  const consumptionStats = useMemo(() => {
    if (consumption == null) return null; // cargando
    const per = consumption?.perUser || {};
    const perTopics = consumption?.perUserTopics || {};
    const ids = studentRows.map((r) => String(r.userId));
    const vals = ids.map((id) => per[id]).filter((v) => v != null);
    if (!vals.length) return { available: false };
    const opened = vals.filter((v) => v > 0).length;
    const avgPct = totalContentTopics > 0
      ? (vals.reduce((a, b) => a + Math.min(Number(b) || 0, totalContentTopics), 0) / (vals.length * totalContentTopics)) * 100
      : null;
    const openedPct = vals.length > 0 ? (opened / vals.length) * 100 : null;
    // Detalle por estudiante: cuántos temas y cuáles (ids), ordenado desc
    const detail = studentRows
      .map((r) => {
        const id = String(r.userId);
        if (per[id] == null) return null;
        return {
          userId: r.userId,
          name: r.displayName,
          count: Number(per[id]) || 0,
          topicIds: Array.isArray(perTopics[id]) ? perTopics[id] : [],
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count);
    return { available: true, opened, total: vals.length, avgPct, openedPct, detail };
  }, [consumption, studentRows, totalContentTopics]);

  // Accesos al curso por recencia (a partir de LastAccessed del classlist).
  // Cada bucket lleva su lista completa: se despliega al hacer clic.
  const accessStats = useMemo(() => {
    if (!studentRows.length || !Object.keys(lastAccessMap).length) return null;
    const now = Date.now();
    const todayList = [];   // entraron en las últimas 24 h
    const weekList = [];    // entraron en los últimos 7 días (incluye hoy)
    const staleList = [];   // llevan más de 14 días SIN entrar
    const neverList = [];   // nunca han entrado al curso
    for (const r of studentRows) {
      const iso = lastAccessMap[String(r.userId)];
      if (!iso) {
        neverList.push({ userId: r.userId, name: r.displayName, days: null });
        continue;
      }
      const days = (now - new Date(iso).getTime()) / 86400000;
      const entry = { userId: r.userId, name: r.displayName, days: Math.floor(days) };
      if (days <= 1) todayList.push(entry);
      if (days <= 7) weekList.push(entry);
      else if (days > 14) staleList.push(entry);
    }
    todayList.sort((a, b) => a.days - b.days);
    weekList.sort((a, b) => a.days - b.days);
    staleList.sort((a, b) => b.days - a.days);
    neverList.sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
    return {
      today: todayList.length,
      week: weekList.length,
      stale: staleList.length,
      never: neverList.length,
      total: studentRows.length,
      todayList, weekList, staleList, neverList,
    };
  }, [studentRows, lastAccessMap]);

  // Qué lista de accesos está desplegada: "today" | "week" | "stale" | "never" | null
  const [accessListOpen, setAccessListOpen] = useState(null);

  // Profesores del curso: preferimos los roles reales de LP enrollments
  // (Instructor/Profesor/Docente). Si el endpoint no devuelve nada, caemos
  // al equipo no-estudiante del classlist como antes.
  const teacherAccessList = useMemo(() => {
    let list = [];
    if (Array.isArray(instructors) && instructors.length > 0) {
      list = instructors
        .filter((u) => u?.Identifier != null)
        .map((u) => ({
          userId: String(u.Identifier),
          name: u.DisplayName || `Usuario ${u.Identifier}`,
          iso: lastAccessMap[String(u.Identifier)] ?? null,
        }));
    } else if (classlistItems.length && studentRows.length) {
      const studentIds = new Set(studentRows.map((r) => String(r.userId)));
      list = classlistItems
        .filter((u) => u?.Identifier != null && !studentIds.has(String(u.Identifier)))
        .map((u) => ({
          userId: String(u.Identifier),
          name: u.DisplayName || `${u.FirstName || ""} ${u.LastName || ""}`.trim() || `Usuario ${u.Identifier}`,
          iso: u.LastAccessed || null,
        }));
    }
    // Ocultar cuentas institucionales/de servicio: solo el profesor real
    return list.filter((t) => !SERVICE_ACCOUNT_RE.test(String(t.name).trim()));
  }, [instructors, lastAccessMap, classlistItems, studentRows]);

  // Metadatos de los elementos de contenido (id -> título/url/tipo) para el
  // detalle de consumo y la clasificación por tipo. Prefiere el endpoint
  // /content/topics (trae Url); cae al content/root si aún no llegó.
  const contentTopicMeta = useMemo(() => {
    const map = new Map();
    if (Array.isArray(contentTopics) && contentTopics.length) {
      for (const t of contentTopics) {
        if (t?.Id != null) {
          map.set(String(t.Id), {
            title: t.Title || `Elemento ${t.Id}`,
            url: t.Url || null,
            topicType: t.TopicType ?? null,
          });
        }
      }
      return map;
    }
    for (const mod of (Array.isArray(contentRoot) ? contentRoot : [])) {
      if (mod?.IsHidden === true) continue;
      for (const it of (Array.isArray(mod?.Structure) ? mod.Structure : [])) {
        if (it?.Id != null && Number(it?.Type) === 1) {
          map.set(String(it.Id), { title: it.Title || it.ShortTitle || `Elemento ${it.Id}`, url: null, topicType: null });
        }
      }
    }
    return map;
  }, [contentTopics, contentRoot]);

  // KPI de elementos publicados: total, desglose por tipo y ritmo, todo
  // derivado de la MISMA fuente para que el desglose siempre sume el total.
  // Preferimos /content/topics (con Url para clasificar); fallback al root.
  const elementsStats = useMemo(() => {
    if (Array.isArray(contentTopics) && contentTopics.length) {
      const start = toDate(courseInfo?.StartDate);
      const counts = {};
      let total = 0;
      for (const t of contentTopics) {
        if (t?.IsHidden === true) continue;
        const d = toDate(t?.LastModifiedDate);
        if (start && (!d || d < start)) continue;
        const label = contentTypeLabel(t?.Title, t?.Url, t?.TopicType);
        counts[label] = (counts[label] || 0) + 1;
        total += 1;
      }
      const breakdown = Object.entries(counts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
      const minExpected = contentKpis?.minExpected ?? null;
      const ratio = minExpected ? clamp(total / minExpected, 0, 2) : null;
      return { total, breakdown, rhythm: contentRhythmStatus(ratio) };
    }
    return {
      total: contentKpis?.createdCount ?? null,
      breakdown: contentKpis?.typeBreakdown || [],
      rhythm: contentRhythmMeta,
    };
  }, [contentTopics, courseInfo?.StartDate, contentKpis, contentRhythmMeta]);

  // Detalle de consumo desplegable
  const [consumptionDetailOpen, setConsumptionDetailOpen] = useState(false);
  const [consumptionStudentOpen, setConsumptionStudentOpen] = useState(null);
  // Desglose por tipo en el KPI de contenidos publicados
  const [contentTypesOpen, setContentTypesOpen] = useState(false);
  const performanceBands = useMemo(() => {
  const bands = [
    { name: "Excelente", key: "excellent", value: 0, color: COLORS.ok },
    { name: "Sólido", key: "solid", value: 0, color: COLORS.brand },
    { name: "Seguimiento", key: "watch", value: 0, color: COLORS.watch },
    { name: "Crítico", key: "critical", value: 0, color: COLORS.critical },
    { name: "Sin datos", key: "pending", value: 0, color: COLORS.pending },
  ];

  for (const s of studentRows) {
    const p = s?.currentPerformancePct;
    if (p == null || Number.isNaN(Number(p))) {
      bands[4].value += 1;
    } else if (Number(p) >= 85) {
      bands[0].value += 1;
    } else if (Number(p) >= 70) {
      bands[1].value += 1;
    } else if (Number(p) >= 50) {
      bands[2].value += 1;
    } else {
      bands[3].value += 1;
    }
  }

  return bands;
}, [studentRows]);

  const sortedStudents = useMemo(() => {
    const list = filteredStudents.slice();
    const dir = sortDir === "asc" ? 1 : -1;

    const getVal = (s) => {
      switch (sortKey) {
        case "userId":
          return Number(s.userId || 0);
        case "grade10":
          return s.currentPerformancePct == null ? -1 : Number(s.currentPerformancePct) / 10;
        case "coverage":
          return s.coveragePct == null ? -1 : Number(s.coveragePct);
        case "risk": {
          const r = normStatus(s.risk);
          return r === "alto" ? 0 : r === "medio" ? 1 : r === "bajo" ? 2 : 3;
        }
        default:
          return String(s.displayName || "").toLowerCase();
      }
    };

    list.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "es", { sensitivity: "base" }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });

    return list;
  }, [filteredStudents, sortKey, sortDir]);

  const drawerSummary = studentDetail?.summary || {};
  const drawerMacro = (studentDetail?.macroUnits || studentDetail?.macro?.units || []).map((u) => ({
    code: u.code,
    pct: Number(u.pct || 0),
  }));
  const drawerUnits = studentDetail?.units || [];
  const drawerPrescription = Array.isArray(studentDetail?.prescription) ? studentDetail.prescription : [];
  const drawerProjection = studentDetail?.projection || null;
  const drawerGradebook = studentDetail?.gradebook || {};
  const drawerEvidences = Array.isArray(drawerGradebook?.evidences) ? drawerGradebook.evidences : [];
  const drawerGradeCategories = Array.isArray(drawerGradebook?.gradeCategories) ? drawerGradebook.gradeCategories : [];
  const drawerPendingItems = Array.isArray(drawerGradebook?.pendingItems) ? drawerGradebook.pendingItems : [];
  const drawerMissingValues = Array.isArray(drawerGradebook?.missingValues) ? drawerGradebook.missingValues : [];
  const drawerQcFlags = Array.isArray(studentDetail?.qualityFlags) ? studentDetail.qualityFlags : [];
  const drawerPendingUngradedPct = Number(drawerSummary?.pendingUngradedWeightPct ?? 0);
  const drawerOverdueUnscoredPct = Number(drawerSummary?.overdueUnscoredWeightPct ?? 0);
  const covGraded = Number(drawerSummary?.gradedItemsCount ?? drawerGradebook?.gradedItemsCount ?? 0) || 0;
  const covTotal = Number(drawerSummary?.totalItemsCount ?? drawerGradebook?.totalItemsCount ?? 0) || 0;
  const covText =
    drawerSummary?.coverageCountText ||
    drawerGradebook?.coverageCountText ||
    (covTotal > 0 ? `${covGraded}/${covTotal}` : null);
  const covMissing = covTotal > 0 ? Math.max(0, covTotal - covGraded) : 0;

  // Private teacher notes per student (localStorage)
  const studentNotesHook = useStudentNotes(orgUnitId, selectedStudent?.userId);
  // Student interaction log (chat-style timeline per student)
  const studentChatHook = useStudentChat(orgUnitId, selectedStudent?.userId);
  const [chatInputType, setChatInputType] = useState("note");
  const [chatInputText, setChatInputText] = useState("");

  const drawerTabs = [
    { id: "resumen", label: "Resumen", icon: "📊" },
    { id: "evidencias", label: "Evidencias", icon: "📋", count: drawerEvidences.length || undefined },
    { id: "unidades", label: "Unidades", icon: "🎯", count: drawerUnits.length || undefined },
    { id: "notas", label: "Mis notas", icon: "📝" },
    { id: "historial", label: "Historial", icon: "💬", count: studentChatHook.entries.length || undefined },
    ...(drawerPrescription.length
      ? [{ id: "prescripcion", label: "Intervención", icon: "💊", count: drawerPrescription.length }]
      : []),
    ...(drawerQcFlags.filter((f) => f?.type && f.type !== "role_not_enabled").length
      ? [{ id: "calidad", label: "Calidad", icon: "🔍" }]
      : []),
  ];

  // Daily snapshots for trend charts (localStorage persisted)
  const snapshotMetrics = useMemo(() => ({
    avgPct: overview?.courseGradebook?.avgCurrentPerformancePct ?? null,
    atRiskPct: atRiskPct,
    coveragePct: overview?.courseGradebook?.avgCoveragePct ?? null,
    totalStudents: studentsCount,
  }), [overview, atRiskPct, studentsCount]);
  const { snapshots: courseSnapshots } = useCourseSnapshots(orgUnitId, snapshotMetrics);

  // Helper to select a student by userId from SmartAlerts chips
  const selectStudentById = React.useCallback((uid) => {
    const s = studentRows.find((r) => r.userId === uid);
    if (s) setSelectedStudent(s);
  }, [studentRows]);

  // Palette commands
  const paletteCommands = useMemo(() => {
    const cmds = [];
    // Navigation
    cmds.push({ id: "nav_dashboard", group: "Navegar", icon: "📊", label: "Ir al Dashboard", hint: "1", action: () => setActiveTab("dashboard") });
    cmds.push({ id: "nav_students", group: "Navegar", icon: "👥", label: "Estudiantes", hint: "4", action: () => setActiveTab("students") });
    cmds.push({ id: "nav_calendar", group: "Navegar", icon: "📅", label: "Calendario de entregas", hint: "5", action: () => setActiveTab("calendar") });
    cmds.push({ id: "nav_trends", group: "Navegar", icon: "📈", label: "Tendencias del curso", hint: "6", action: () => setActiveTab("trends") });
    cmds.push({ id: "nav_routes", group: "Navegar", icon: "🛤️", label: "Rutas de atención", hint: "2", action: () => setActiveTab("routes") });
    cmds.push({ id: "nav_assistant", group: "Navegar", icon: "🤖", label: "Asistente IA", hint: "3", action: () => setActiveTab("assistant") });
    // Actions
    cmds.push({ id: "act_courses", group: "Acciones", icon: "📚", label: "Cambiar de curso", action: () => handleOpenCoursePanel() });
    cmds.push({ id: "act_refresh", group: "Acciones", icon: "⟳", label: "Refrescar datos", hint: "R", action: handleRefresh });
    cmds.push({ id: "act_print", group: "Acciones", icon: "🖨", label: "Imprimir vista actual", action: () => window.print() });
    cmds.push({ id: "act_dark", group: "Acciones", icon: darkMode ? "☀️" : "🌙", label: darkMode ? "Modo claro" : "Modo oscuro", action: () => setDarkMode(v => !v) });
    cmds.push({ id: "act_group", group: "Acciones", icon: "📑", label: groupByRisk ? "Desagrupar tabla" : "Agrupar tabla por riesgo", action: () => setGroupByRisk(v => !v) });
    // Filters
    cmds.push({ id: "fil_high", group: "Filtros", icon: "🔴", label: "Solo riesgo alto", action: () => { setQuickFilter("risk_high"); setActiveSection("students"); } });
    cmds.push({ id: "fil_med", group: "Filtros", icon: "🟡", label: "Solo riesgo medio", action: () => { setQuickFilter("risk_medium"); setActiveSection("students"); } });
    cmds.push({ id: "fil_overdue", group: "Filtros", icon: "⚠️", label: "Con entregas vencidas", action: () => { setQuickFilter("overdue"); setActiveSection("students"); } });
    cmds.push({ id: "fil_pending", group: "Filtros", icon: "⏳", label: "Con entregas pendientes por calificar", action: () => { setQuickFilter("pending_grade"); setActiveSection("students"); } });
    cmds.push({ id: "fil_approved", group: "Filtros", icon: "✅", label: "Aprobados (≥7.0)", action: () => { setQuickFilter("approved"); setActiveSection("students"); } });
    cmds.push({ id: "fil_clear", group: "Filtros", icon: "✖", label: "Limpiar filtros", action: () => { setQuickFilter(null); setQuery(""); setOnlyRisk(false); } });
    // Students — first 20 quick access
    (studentRows || []).slice(0, 50).forEach((s) => {
      cmds.push({
        id: `student_${s.userId}`,
        group: "Estudiantes",
        icon: "👤",
        label: s.displayName,
        hint: `#${s.userId}`,
        action: () => setSelectedStudent(s),
      });
    });
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentRows, darkMode, groupByRisk]);

  // Global keyboard shortcuts
  useKeyboardShortcuts([
    { keys: "ctrl+k", handler: () => setPaletteOpen(true), description: "Abrir paleta" },
    { keys: "/", handler: () => setPaletteOpen(true), description: "Abrir paleta" },
    { keys: "escape", handler: () => { setSelectedStudent(null); setPaletteOpen(false); }, description: "Cerrar" },
    { keys: "1", handler: () => setActiveTab("dashboard"), description: "Dashboard" },
    { keys: "2", handler: () => setActiveTab("routes"), description: "Rutas" },
    { keys: "3", handler: () => setActiveTab("assistant"), description: "Asistente" },
    { keys: "4", handler: () => setActiveTab("students"), description: "Estudiantes" },
    { keys: "5", handler: () => setActiveTab("calendar"), description: "Calendario" },
    { keys: "6", handler: () => setActiveTab("trends"), description: "Tendencias" },
    { keys: "r", handler: handleRefresh, description: "Refrescar" },
    { keys: "c", handler: handleOpenCoursePanel, description: "Cambiar curso" },
    { keys: "?", handler: () => setPaletteOpen(true), description: "Ayuda" },
    { keys: "shift+/", handler: () => setPaletteOpen(true), description: "Ayuda" },
  ], [darkMode, groupByRisk]);

  const makeSort = (key) => ({
    active: sortKey === key,
    dir: sortDir,
    onClick: () => {
      const d = sortKey === key && sortDir === "asc" ? "desc" : "asc";
      setSortKey(key);
      setSortDir(d);
    },
  });

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CesaLoader subtitle="Verificando sesión..." />
      </div>
    );
  }
  if (!authUser) return <LoginScreen orgUnitId={orgUnitId} />;

  // Superadmin sin curso seleccionado → SIEMPRE a su consola (RoleHome).
  // El selector de cursos de profesor no es útil para el usuario admin
  // (p. ej. Desarrollo Profesoral) y aparecía al refrescar en /dashboard.
  if ((!orgUnitId || orgUnitId === 0) && isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  // Sin curso seleccionado → mostrar selector automáticamente (visual de tarjetas, igual que RoleHome)
  if (!orgUnitId || orgUnitId === 0) {
    const instructorCourses = courseList.filter(c => !isStudentRole(c.roleName));
    const studentCourses = courseList.filter(c => isStudentRole(c.roleName));

    const openCourse = (c) => {
      if (isStudentRole(c.roleName)) {
        sessionStorage.setItem("gemelo_pending_org", String(c.id));
        window.location.href = window.location.origin + "/portal";
      } else {
        switchCourse(c.id);
      }
    };

    const CourseCardV2 = ({ c, role }) => {
      const isActive = c.isActive !== false;
      const RoleIcon = role === "student" ? GraduationCap : Presentation;
      return (
        <button
          onClick={() => openCourse(c)}
          className={`course-card-v2 role-${role} ${!isActive ? "inactive" : ""}`}
          aria-label={`Abrir curso ${c.name}`}
        >
          <div className="course-card-icon">
            <RoleIcon size={22} strokeWidth={2} />
          </div>
          <div className="course-card-title">{c.name || `Curso ${c.id}`}</div>
          <div className="course-card-meta">
            <span className="course-card-id">
              #{c.id}{c.code ? ` · ${c.code}` : ""}
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

    const SectionHeaderV2 = ({ icon, title, count, variant = "instructor" }) => (
      <div className="section-header-v2">
        <div className={`section-header-icon-wrap ${variant === "student" ? "student" : ""}`}>
          {icon}
        </div>
        <div>
          <div className="section-header-title">{title}</div>
          <div className="section-header-count">{count} curso{count !== 1 ? "s" : ""}</div>
        </div>
      </div>
    );

    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font)" }}>
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <header style={{
          position: "sticky", top: 0, zIndex: 50,
          background: "var(--card)", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", height: 60,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 900, letterSpacing: "0.02em" }}>CESA</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "var(--text)", lineHeight: 1.15, letterSpacing: "-0.01em" }}>Gemelo Digital</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                Hola, {authUser?.user_name?.split(" ")[0] || "docente"} — selecciona tu curso
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              try {
                const _sid2 = localStorage.getItem("gemelo_sid");
                const _lh = _sid2 ? { "Authorization": `Bearer ${_sid2}` } : {};
                await fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "include", headers: _lh });
              } catch {}
              localStorage.removeItem("gemelo_sid");
              sessionStorage.clear();
              window.location.href = window.location.origin + "/";
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "var(--muted)", cursor: "pointer", fontFamily: "var(--font)" }}
          >
            <LogOut size={14} strokeWidth={2.2} /> Cerrar sesión
          </button>
        </header>

        {/* ── Contenido ───────────────────────────────────────────── */}
        <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 60px" }}>
          {/* Buscador + contador */}
          {!loadingCourses && (courseList.length > 0 || courseSearch) && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
              <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 440 }}>
                <input
                  type="text"
                  placeholder="Buscar por nombre, código o ID…"
                  value={courseSearch}
                  onChange={e => {
                    const val = e.target.value;
                    setCourseSearch(val);
                    // Debounce: esperar 400ms antes de buscar en backend
                    clearTimeout(window._courseSearchTimer);
                    window._courseSearchTimer = setTimeout(() => {
                      setCourseListLoaded(false);
                      searchCourses(val);
                    }, 400);
                  }}
                  style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", boxSizing: "border-box", boxShadow: "var(--shadow-sm)" }}
                  onFocus={e => e.target.style.borderColor = "var(--brand)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--muted)" }}>🔍</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                {courseSearch
                  ? `${courseList.length} resultado${courseList.length !== 1 ? "s" : ""} para "${courseSearch}"`
                  : `${courseList.length} cursos recientes · ${courseList.filter(c => c.isActive).length} activos`
                }
              </div>
            </div>
          )}

          {loadingCourses ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)", fontSize: 13 }}>
              Cargando tus cursos…
            </div>
          ) : courseList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>
                {courseSearch ? `Sin resultados para "${courseSearch}"` : "No se encontraron cursos."}
              </div>
              {courseSearch && (
                <button
                  onClick={() => {
                    setCourseSearch("");
                    setCourseListLoaded(false);
                    searchCourses("");
                  }}
                  style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)" }}
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              {instructorCourses.length > 0 && (
                <section>
                  <SectionHeaderV2 icon={<Presentation size={22} strokeWidth={2.2} />} title="Como Profesor" count={instructorCourses.length} />
                  <div className="course-grid stagger-children">
                    {instructorCourses.map(c => <CourseCardV2 key={`i-${c.id}`} c={c} role="instructor" />)}
                  </div>
                </section>
              )}
              {studentCourses.length > 0 && (
                <section>
                  <SectionHeaderV2 icon={<GraduationCap size={22} strokeWidth={2.2} />} title="Como Estudiante" count={studentCourses.length} variant="student" />
                  <div className="course-grid stagger-children">
                    {studentCourses.map(c => <CourseCardV2 key={`s-${c.id}`} c={c} role="student" />)}
                  </div>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  if (loading) return <CesaLoader subtitle="Cargando tablero..." />;

  if (err) {
    // Detectar tipo de error para mostrar mensaje apropiado
    const isNoAccess  = err.includes("401") || err.includes("403") || err.includes("autenticado") || err.includes("No tiene acceso");
    const isNotFound  = err.includes("404") || err.includes("not found") || err.includes("no encontrado");

    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)", padding: 20 }}>
        <div style={{ background: "var(--card)", border: `1.5px solid ${isNoAccess ? "var(--watch)" : isNotFound ? "var(--muted)" : "var(--critical)"}`, borderRadius: 18, padding: "40px 44px", maxWidth: 460, width: "100%", boxShadow: "var(--shadow-lg)", textAlign: "center" }}>
          {/* Icon */}
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {isNoAccess ? "🔒" : isNotFound ? "🔍" : "⚠️"}
          </div>
          {/* Title */}
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", margin: "0 0 10px", letterSpacing: "-0.02em" }}>
            {isNoAccess
              ? "Sin acceso a este curso"
              : isNotFound
              ? "Curso no encontrado"
              : "Error al cargar el curso"
            }
          </h2>
          {/* Description */}
          <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 24px" }}>
            {isNoAccess
              ? `No tienes rol de instructor o coordinador en el curso ${orgUnitId}. Solo los docentes asignados pueden ver el G.D de un curso.`
              : isNotFound
              ? `El curso con ID ${orgUnitId} no existe en Brightspace o fue eliminado.`
              : err
            }
          </p>
          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => {
                setErr("");
                setOverview(null);
                setStudentsList(null);
                setStudentRows([]);
                setOrgUnitId(0);
                setOrgUnitInput("");
                setCourseListLoaded(false);
              }}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
            >
              ← Ver mis cursos
            </button>
            {!isNoAccess && !isNotFound && (
              <button
                onClick={() => { setErr(""); setOverview(null); }}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Reintentar
              </button>
            )}
          </div>
          {/* Course ID hint */}
          <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            Curso ID: {orgUnitId}
          </div>
        </div>
      </div>
    );
  }

  if (!overview) return <CesaLoader subtitle="Inicializando información del curso..." />;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--font)" }}>
      {/* ── Tutorial primera vez ── */}
      {showTutorial && (
        <OnboardingTutorial
          userName={(authUser?.user_name || "").split(" ")[0]}
          onFinish={() => setShowTutorial(false)}
        />
      )}
      {/* ── Sidebar ── */}
      <AppSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentCourseName={courseInfo?.Name || (orgUnitId ? `Curso ${orgUnitId}` : null)}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Topbar ── */}
      <AppTopbar
        isMobile={isMobile}
        sidebarOpen={sidebarOpen}
        onOpenSidebar={() => setSidebarOpen((v) => !v)}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        orgUnitInput={orgUnitInput}
        setOrgUnitInput={setOrgUnitInput}
        setOrgUnitId={setOrgUnitId}
        handleOpenCoursePanel={handleOpenCoursePanel}
        authUser={authUser}
        isDualRole={isDualRole}
        onGoHome={() => navigate("/")}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenCoordinator={() => setShowCoordinator(true)}
        locale={locale}
        toggleLocale={toggleLocale}
        isSuperAdmin={isSuperAdmin}
        adminView={impersonateStudent ? "student" : "teacher"}
        onAdminViewChange={isSuperAdmin ? (v) => {
          if (v === "student") setStudentPickerOpen(true);
          else { setImpersonateStudent(null); setStudentPickerOpen(false); }
        } : undefined}
      />

      {/* ── Main content ── */}
      <main id="main-content" tabIndex={-1} className="app-main">
        <div className="app-content">

        {/* ── Routes tab ── */}
        {activeTab === "routes" && (
          <div className="fade-up tab-enter">
            <RoutesView
              studentRows={studentRows}
              overview={overview}
              courseInfo={courseInfo}
              thresholds={thresholds}
              onSelectStudent={setSelectedStudent}
              isMobile={isMobile}
            />
          </div>
        )}

        {/* ── Predictions tab ── */}
        {activeTab === "predictions" && (
          <div className="fade-up tab-enter">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
                G.D · Predicciones
              </div>
              <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
                Predicción de notas finales
              </h1>
              <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
                {courseInfo?.Name || `Curso ${orgUnitId}`}
              </div>
            </div>
            <Card>
              <ErrorBoundary sectionName="Predicción de notas">
                <GradePredictions
                  studentRows={studentRows}
                  onStudentClick={selectStudentById}
                  courseInfo={courseInfo}
                  variant="full"
                />
              </ErrorBoundary>
            </Card>
          </div>
        )}

        {/* ── Evidences tab ── */}
        {activeTab === "evidences" && (
          <div className="fade-up tab-enter">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
                G.D · Informes de evidencias
              </div>
              <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
                Evidencias por banda de desempeño
              </h1>
              <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
                {courseInfo?.Name || `Curso ${orgUnitId}`}
              </div>
            </div>
            <Card>
              <ErrorBoundary sectionName="Informes de evidencias">
                <EvidenceReports
                  orgUnitId={orgUnitId}
                  studentRows={studentRows}
                  courseInfo={courseInfo}
                  onStudentClick={selectStudentById}
                />
              </ErrorBoundary>
            </Card>
          </div>
        )}

        {/* ── Resultados de aprendizaje (vincular actividades → RA) ── */}
        {activeTab === "learning-outcomes" && (
          <div className="fade-up tab-enter">
            <ErrorBoundary sectionName="Resultados de aprendizaje">
              <RaLinker orgUnitId={orgUnitId} courseName={courseInfo?.Name} />
            </ErrorBoundary>
          </div>
        )}

        {/* ── Assistant tab ── */}
        {activeTab === "assistant" && (
          <div className="fade-up tab-enter">
            <ErrorBoundary sectionName="Asistente de voz">
              <VoiceAssistant
                studentRows={studentRows}
                overview={overview}
                raDashboard={raDashboard}
                courseInfo={courseInfo}
                thresholds={thresholds}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* ── Dashboard tab ── */}
        {activeTab === "dashboard" && <>

        {/* Page header */}
        <div className="fade-up tab-enter" style={{ marginBottom: 20 }}>
          {/* Breadcrumb */}
          <Breadcrumb items={[
            ...(isDualRole ? [{ label: "Inicio", icon: "🏠", onClick: () => navigate("/") }] : []),
            { label: "Mis cursos", icon: "📚", onClick: handleOpenCoursePanel },
            { label: courseInfo?.Name || `Curso ${orgUnitId}` },
          ]} />
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
                G.D · Vista Docente
              </div>
              <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                {courseInfo?.Name || (orgUnitId ? `Curso ${orgUnitId}` : "Selecciona un curso")}
              </h1>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontWeight: 500 }}>
                {studentsCount} estudiantes
                {avgPerfPct != null && avgPerfPct > 0 ? ` · Promedio ${fmtGrade10FromPct(avgPerfPct)}/10` : ""}
                {courseInfo?.StartDate ? ` · ${new Date(courseInfo.StartDate).getFullYear()}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <LastUpdated timestamp={lastUpdate} onRefresh={handleRefresh} loading={loading} />
              <StatusBadge status={courseStatus} />
            </div>
          </div>
        </div>

        {/* ── KPIs principales del curso (estilo tarjetas centradas, compacto) ── */}
        <div
          className="fade-up fade-up-1"
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 12,
            alignItems: "stretch",
          }}
        >
          {/* Nota promedio — donut */}
          <div className="kpi-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: isMobile ? 12 : 14, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: "0.01em" }}>
              Nota promedio
            </div>
            <CircularRing
              pct={avgPerfPct != null && Number(avgPerfPct) > 0 ? avgPerfPct : 0}
              size={isMobile ? 84 : 96}
              stroke={10}
              color={avgPerfPct != null && Number(avgPerfPct) > 0 ? colorForPct(avgPerfPct, thresholds) : "var(--border)"}
              label={avgPerfPct == null || Number(avgPerfPct) === 0 ? "—" : fmtGrade10FromPct(avgPerfPct)}
              fontSize={isMobile ? 15 : 18}
            />
            <div style={{ fontSize: 10, color: "var(--muted)" }}>Escala 0–10 · gradebook</div>
          </div>

          {/* Estudiantes — número grande */}
          <div className="kpi-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: isMobile ? 12 : 14, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: "0.01em" }}>
              Estudiantes
            </div>
            <div style={{ fontSize: isMobile ? 30 : 38, fontWeight: 900, color: "var(--text)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
              {studentsCount || "—"}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>Inscritos en el curso</div>
          </div>

          {/* En riesgo — número grande coloreado */}
          <div className="kpi-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: isMobile ? 12 : 14, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: "0.01em" }}>
              En riesgo
            </div>
            <div style={{
              fontSize: isMobile ? 30 : 38, fontWeight: 900, fontFamily: "var(--font-mono)", lineHeight: 1,
              color: atRiskPct == null ? "var(--muted)" : atRiskPct > 40 ? COLORS.critical : atRiskPct > 20 ? COLORS.watch : COLORS.ok,
            }}>
              {atRiskPct == null ? "—" : atRiskCount}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              {atRiskPct == null ? "Sin datos aún" : `${fmtPct(atRiskPct)} del curso (alto + medio)`}
            </div>
          </div>

          {/* Contenidos creados — número grande + ritmo */}
          <div className="kpi-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: isMobile ? 12 : 14, textAlign: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", letterSpacing: "0.01em", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Elementos publicados <InfoTooltip text="Elementos dentro de los módulos de contenido del curso (PDF, Word, Excel, páginas, enlaces…) creados o actualizados desde el inicio del curso. No incluye asignaciones (dropbox) — esas se cuentan aparte en la tarjeta de Asignaciones." />
            </div>
            <div style={{ fontSize: isMobile ? 30 : 38, fontWeight: 900, color: elementsStats.total != null ? elementsStats.rhythm.color : "var(--muted)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
              {elementsStats.total ?? "—"}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              {contentKpis?.minExpected != null ? `Mínimo esperado: ${contentKpis.minExpected}` : "Desde inicio del curso"}
            </div>
            {elementsStats.total != null && (
              <span className="badge" style={{ background: elementsStats.rhythm.bg, color: elementsStats.rhythm.color, fontSize: 10 }}>
                {elementsStats.rhythm.label}
              </span>
            )}
            {(elementsStats.breakdown?.length ?? 0) > 0 && (
              <>
                <button
                  onClick={() => setContentTypesOpen((v) => !v)}
                  aria-expanded={contentTypesOpen}
                  style={{
                    border: "none", background: "transparent", cursor: "pointer",
                    fontSize: 10, fontWeight: 700, color: "var(--brand)",
                    fontFamily: "var(--font)", padding: "2px 6px",
                  }}
                >
                  Tipos de elemento {contentTypesOpen ? "▴" : "▾"}
                </button>
                {contentTypesOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%", maxHeight: 110, overflowY: "auto" }}>
                    {elementsStats.breakdown.map((t) => (
                      <div key={t.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, padding: "1px 8px" }}>
                        <span style={{ color: "var(--text)", fontWeight: 600 }}>
                          <span aria-hidden="true" style={{ marginRight: 4 }}>{CONTENT_TYPE_ICONS[t.label] || "📄"}</span>
                          {t.label}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--brand)" }}>{t.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Consumo de contenidos por estudiantes (antes en "Accesos al curso"):
                barras de promedio y cobertura + desplegable con el detalle */}
            <div style={{ width: "100%", textAlign: "left", marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              {consumptionStats == null ? (
                <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>Cargando consumo…</div>
              ) : !consumptionStats.available ? (
                <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>Consumo no disponible para este curso.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {consumptionStats.avgPct != null && (
                    <div>
                      <ProgressBar
                        value={Math.min(100, consumptionStats.avgPct)}
                        color={colorForPct(consumptionStats.avgPct, thresholds)}
                        animate={false}
                        showLabel={false}
                      />
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          Promedio de acceso a elementos publicados
                          <InfoTooltip text="De todos los elementos publicados (PDF, Word, páginas, enlaces…), porcentaje que ha abierto en promedio cada estudiante. Cada elemento cuenta una sola vez por estudiante — no mide cuántas veces lo abrió. Ej: 75% = un estudiante típico ha abierto 3 de cada 4 elementos." />
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800 }}>{fmtPct(consumptionStats.avgPct)}</span>
                      </div>
                    </div>
                  )}
                  {consumptionStats.openedPct != null && (
                    <div>
                      <ProgressBar
                        value={Math.min(100, consumptionStats.openedPct)}
                        color={colorForPct(consumptionStats.openedPct, thresholds)}
                        animate={false}
                        showLabel={false}
                      />
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          {consumptionStats.opened} de {consumptionStats.total} estudiantes han abierto elementos
                          <InfoTooltip text="Estudiantes que han abierto al menos uno de los elementos publicados del curso (PDF, Word, páginas, enlaces…)." />
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800 }}>{fmtPct(consumptionStats.openedPct)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="fade-up fade-up-2"
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : isNarrow ? "1fr 1fr" : "repeat(4, minmax(220px, 1fr))",
            gap: 12,
            marginBottom: 12,
            alignItems: "stretch",
          }}
        >
          <div ref={overviewRef} style={{ order: 3, display: "flex" }}>
          <Card style={{ flex: 1 }} title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>📋 Cumplimiento evaluativo <InfoTooltip text="Índice de cumplimiento evaluativo del curso: % del peso calificado, pendiente de calificación y vencido sin registro." /></span>} right={<StatusBadge status={courseStatus} />} accent="brand">
            <div style={{ marginTop: 4 }}>
              {avgCov == null || Number(avgCov) === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Cobertura no disponible (sin evidencias calificadas)
                </div>
              ) : (
                <CoverageBars
                  donePct={covDone}
                  pendingPct={avgPendingUngradedPct}
                  openPct={covPending}
                  overduePct={avgOverdueUnscoredPct}
                />
              )}
            </div>
          </Card>
          </div>

          {/* ── Riesgo académico ── */}
          <div style={{ order: 1, display: "flex" }}>
            <Card style={{ flex: 1 }} title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>⚠️ Riesgo académico <InfoTooltip text="Distribución de los estudiantes según su nota actual: Alto (<5.0), Medio (5.0–7.0), Bajo (≥7.0). Calculado solo con notas reales del gradebook, excluye columnas 'Corte'." /></span>} accent="pending">
              <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 6px" }}>
                <GaugeMeter
                  pct={atRiskPct ?? 0}
                  size={150}
                  centerLabel={atRiskPct == null ? "—" : fmtPct(atRiskPct)}
                  centerColor={atRiskPct == null ? "var(--muted)" : atRiskPct > 40 ? COLORS.critical : atRiskPct > 20 ? COLORS.watch : COLORS.ok}
                  sublabel={totalStudents ? `${atRiskCount} de ${totalStudents} estudiantes en riesgo` : "Sin datos aún"}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {riskData.map((r) => {
                  const count = Number(r.value || 0);
                  const pct = totalStudents > 0 ? (count / totalStudents) * 100 : 0;
                  return (
                    <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: colorForRisk(r.key),
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, fontSize: 12, color: "var(--text)", fontWeight: 600 }}>
                        {r.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          fontFamily: "var(--font-mono)",
                          color: colorForRisk(r.key),
                        }}
                      >
                        {count}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", width: 44, textAlign: "right" }}>
                        {pct.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* ── Distribución de notas ── */}
          <div style={{ order: 2, display: "flex" }}>
            <GradeDistributionCard studentRows={studentRows} thresholds={thresholds} style={{ flex: 1 }} />
          </div>

          <div ref={priorityRef} style={{ order: 4, display: "flex" }}>
          <Card
            style={{ flex: 1 }}
            title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🚨 Estudiantes prioritarios <InfoTooltip text="Estudiantes que requieren tu atención inmediata: nota crítica (<5), cobertura baja (<60%), ítems vencidos sin calificar o pendientes de calificación. Ordenados por nivel de riesgo." /></span>} accent="critical"
            right={
              assignmentRiskData.length > 0
                ? <span className="tag" style={{ background: "var(--critical-bg)", color: "#B42318" }}>Requieren atención</span>
                : <StatusBadge status="solido" />
            }
          >
            {studentRows.some((s) => s.isLoading) && !assignmentRiskData.length ? (
              <div className="empty-state" style={{ minHeight: 120 }}>
                <span className="pulse-dot" style={{ background: COLORS.brand, width: 10, height: 10 }} />
                <span style={{ fontSize: 12 }}>Cargando datos de cobertura…</span>
              </div>
            ) : assignmentRiskData.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Nota &lt;5 · cobertura baja · ítems vencidos
                </div>
                <div style={{ overflowY: "auto", maxHeight: 300, paddingRight: 2, display: "flex", flexDirection: "column", gap: 6 }}>
                {assignmentRiskData.map((item) => {
                  const covColor = colorForPct(item.coveragePct, thresholds);
                  const hasOverdue = item.notSubmittedWeightPct > 0;
                  const hasLowGrade = item.type === "low_grade";
                  const grade10 = item.currentPerformancePct != null ? (item.currentPerformancePct / 10).toFixed(1) : null;
                  const gradeColor = item.currentPerformancePct != null ? colorForPct(item.currentPerformancePct, thresholds) : COLORS.pending;
                  const borderColor = hasLowGrade ? "#FECDCA" : hasOverdue ? "#FED7AA" : "var(--border)";
                  const bgColor = hasLowGrade ? "var(--critical-bg)" : hasOverdue ? "var(--watch-bg)" : "var(--card)";

                  return (
                    <div
                      key={item.userId}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const s = studentRows.find((r) => r.userId === item.userId);
                        if (s) setSelectedStudent(s);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const s = studentRows.find((r) => r.userId === item.userId);
                          if (s) setSelectedStudent(s);
                        }
                      }}
                      style={{
                        border: `1px solid ${borderColor}`,
                        borderRadius: 10,
                        padding: "9px 11px",
                        background: bgColor,
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        transition: "box-shadow 0.15s, transform 0.1s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.name}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            {item.type === "pending_submitted" && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: COLORS.brand, textTransform: "uppercase", letterSpacing: "0.06em" }}>⏳ Pendiente calificación</span>
                            )}
                            {item.type === "overdue" && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: COLORS.critical, textTransform: "uppercase", letterSpacing: "0.06em" }}>🔴 Vencido sin entrega</span>
                            )}
                            {item.type === "low_grade" && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: COLORS.critical, textTransform: "uppercase", letterSpacing: "0.06em" }}>⚠️ Nota crítica</span>
                            )}
                            {item.type === "low_coverage" && (
                              <span style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>📉 Cobertura baja</span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={computeRiskFromPct(item.currentPerformancePct)} />
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {grade10 != null && (
                            <div style={{ flex: 1, textAlign: "center", padding: "3px 7px", borderRadius: 8, background: "rgba(255,255,255,0.6)", border: `1px solid ${gradeColor}30` }}>
                              <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Nota</div>
                              <div style={{ fontSize: 14, fontWeight: 900, fontFamily: "var(--font-mono)", color: gradeColor, lineHeight: 1.1 }}>{grade10}</div>
                            </div>
                          )}
                          {item.pendingSubmittedWeightPct > 0 && (
                            <div style={{ flex: 1, textAlign: "center", padding: "3px 7px", borderRadius: 8, background: "rgba(255,255,255,0.6)", border: "1px solid #FED7AA" }}>
                              <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Pendiente</div>
                              <div style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: COLORS.watch }}>{fmtPct(item.pendingSubmittedWeightPct)}</div>
                            </div>
                          )}
                          {hasOverdue && (
                            <div style={{ flex: 1, textAlign: "center", padding: "3px 7px", borderRadius: 8, background: "rgba(255,255,255,0.6)", border: "1px solid #FECDCA" }}>
                              <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Vencido</div>
                              <div style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: COLORS.critical }}>{fmtPct(item.notSubmittedWeightPct)}</div>
                            </div>
                          )}
                        </div>
                        <div style={{ width: "100%" }}>
                          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 3 }}>Cobertura</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ flex: 1, height: 5, borderRadius: 999, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${item.coveragePct}%`, background: covColor, borderRadius: 999 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "var(--font-mono)", color: covColor, flexShrink: 0 }}>
                              {fmtPct(item.coveragePct)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 2 }}>
                  Haz clic en un estudiante para ver su gemelo →
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ minHeight: 110 }}>
                <span className="empty-state-icon">✅</span>
                <span style={{ fontSize: 12 }}>Sin estudiantes críticos</span>
                <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
                  Todos los estudiantes tienen cobertura ≥ 60% y sin ítems vencidos.
                </span>
              </div>
            )}
          </Card>
          </div>

        </div>

        {/* ── Fila: Resultados de aprendizaje + Asignaciones + Accesos ── */}
        <div
          className="fade-up fade-up-2"
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : isNarrow ? "1fr 1fr" : "1.15fr 1.15fr 0.75fr",
            gap: 12,
            marginBottom: 12,
            alignItems: "stretch",
          }}
        >
        <div ref={learningOutcomesRef} style={{ display: "flex" }}>
          <Card
            style={{ flex: 1 }}
            title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🎯 Resultados de aprendizaje <InfoTooltip text="Resultados de Aprendizaje (RA) del curso ordenados de menor a mayor desempeño. El RA en primera posición es donde tus estudiantes están más débiles — prioriza refuerzo ahí." /></span>}
            accent="brand"
            right={
              <button
                onClick={() => setActiveTab("learning-outcomes")}
                title="Vincula o ajusta los RA de tus actividades para activar/afinar la analítica por resultado."
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 13px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
                  color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)",
                  boxShadow: "var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.1))",
                }}
              >
                🔗 Vincular
              </button>
            }
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {quizOutcomesData.length > 0 && (
                <div
                  role="tablist"
                  style={{
                    display: "inline-flex",
                    alignSelf: "flex-start",
                    gap: 2,
                    padding: 3,
                    borderRadius: 10,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    marginBottom: 2,
                  }}
                >
                  {[
                    { key: "rubrica", label: "Por asignación" },
                    { key: "quiz", label: "Por quiz" },
                  ].map((tab) => {
                    const active = raTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        role="tab"
                        aria-selected={active}
                        onClick={() => setRaTab(tab.key)}
                        style={{
                          border: "none",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "5px 12px",
                          borderRadius: 8,
                          background: active ? "var(--brand)" : "transparent",
                          color: active ? "#fff" : "var(--muted-strong)",
                          transition: "background 0.15s",
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 8 }}>
              {(raTab === "quiz" ? quizOutcomesData : learningOutcomesData)
                .slice()
                .sort((a, b) => a.avgPct - b.avgPct)
                .map((m) => {
                  const computedStatus =
                    m.status ||
                    (m.avgPct < thresholds.critical
                      ? "critico"
                      : m.avgPct < thresholds.watch
                      ? "observacion"
                      : "solido");
                  const ringColor = colorForPct(m.avgPct, thresholds);

                  return (
                    <div
                      key={m.code}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: "10px 12px",
                        background: "var(--card)",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        transition: "box-shadow 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.boxShadow = "var(--shadow-md)"}
                      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
                    >
                      <CircularRing
                        pct={m.studentsWithData > 0 ? m.avgPct : 0}
                        size={64}
                        stroke={6}
                        color={m.studentsWithData > 0 ? ringColor : "var(--border)"}
                        label={m.studentsWithData > 0 ? fmtPct(m.avgPct) : "—"}
                        fontSize={11}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span className="tag">{m.code}</span>
                          <InfoTooltip text={(m.description || m.name || "Sin descripción disponible.").trim()} />
                          <div style={{ marginLeft: "auto" }}>
                            {m.studentsWithData > 0
                              ? <StatusBadge status={computedStatus} />
                              : <span style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", background: "var(--bg)", padding: "2px 7px", borderRadius: 99, border: "1px solid var(--border)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.alignedToAssignment ? "Sin uso" : "Sin asignación"}</span>
                            }
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>
                          {m.source === "quiz"
                            ? "Evaluado por quiz"
                            : `Peso ${m.weightPct ? `${Number(m.weightPct).toFixed(0)}%` : "—"}`}
                        </div>
                        {m.studentsWithData > 0 && m.coveragePct != null ? (
                          <div>
                            <ProgressBar value={m.coveragePct} color={colorForPct(m.coveragePct, thresholds)} />
                            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, textAlign: "right" }}>
                              {fmtPct(m.coveragePct)} · {m.studentsWithData}/{m.totalStudents} est.
                            </div>
                          </div>
                        ) : m.studentsWithData === 0 ? (
                          <div style={{ fontSize: 10, color: "var(--muted)", fontStyle: "italic", lineHeight: 1.4 }}>
                            {m.alignedToAssignment
                              ? "Sin evaluaciones vinculadas a rúbricas aún."
                              : (m.note || "No alineado a asignaciones (evaluado por quiz).")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!(raTab === "quiz" ? quizOutcomesData : learningOutcomesData).length && (
                <div className="empty-state">
                  <span className="empty-state-icon">🎯</span>
                  <span style={{ fontSize: 12 }}>Sin datos de RA para este curso</span>
                  <span style={{ fontSize: 11, color: "var(--muted-strong)", textAlign: "center", lineHeight: 1.5, maxWidth: 340, marginTop: 4 }}>
                    Los Resultados de Aprendizaje necesitan estar registrados en Brightspace <strong>y</strong> mapeados a las rúbricas del curso en la configuración del gemelo.
                    Si el curso ya los tiene definidos en Brightspace, solicita al equipo que registre la configuración para este <code>orgUnitId</code>.
                  </span>
                  {Number(avgCov ?? 0) > 0 && (
                    <span style={{ fontSize: 11, color: "var(--watch)", fontWeight: 700, textAlign: "center", padding: "4px 8px", borderRadius: 8, background: "var(--watch-bg)", marginTop: 6 }}>
                      ⚠️ Hay evidencias calificadas pero sin rúbricas vinculadas a RA
                    </span>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── Estado de asignaciones (entregado / calificado / vencido) ── */}
        <div style={{ display: "flex" }}>
          <Card
            style={{ flex: 1 }}
            title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>📝 Asignaciones del curso <InfoTooltip text="Estado de las asignaciones (dropbox) que has creado en Brightspace: cuántas tienen entregas de estudiantes (con % de entrega), cuántas ya están completamente calificadas y cuántas vencieron. Ordenadas por fecha de entrega." /></span>}
            accent="brand"
          >
            <ErrorBoundary sectionName="Asignaciones del curso">
              <AssignmentsPanel orgUnitId={orgUnitId} />
            </ErrorBoundary>
          </Card>
        </div>

        {/* ── Accesos al curso (LastAccessed del classlist) ── */}
        <div style={{ display: "flex" }}>
          <Card
            style={{ flex: 1 }}
            title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🔑 Accesos al curso <InfoTooltip text="Último acceso de cada estudiante al curso en Brightspace (dato del classlist). Útil para detectar estudiantes desconectados. En la pestaña Estudiantes ves el último acceso de cada uno." /></span>}
            accent="brand"
          >
            {accessStats == null ? (
              <div className="empty-state" style={{ minHeight: 90 }}>
                <span className="pulse-dot" style={{ background: COLORS.brand, width: 8, height: 8 }} />
                <span style={{ fontSize: 11 }}>Cargando accesos…</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  { key: "today", label: "Entraron hoy", value: accessStats.today, color: COLORS.ok },
                  { key: "week", label: "Entraron en los últimos 7 días", value: accessStats.week, color: COLORS.brand },
                  { key: "stale", label: "Sin entrar hace +14 días", value: accessStats.stale, color: accessStats.stale > 0 ? COLORS.watch : "var(--muted)" },
                  { key: "never", label: "Nunca han entrado", value: accessStats.never, color: accessStats.never > 0 ? COLORS.critical : "var(--muted)" },
                ].map((row) => {
                  const canExpand = row.value > 0;
                  const isOpen = accessListOpen === row.key;
                  const rowInner = (
                    <>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 12, color: "var(--text)", fontWeight: 600, textAlign: "left" }}>{row.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, fontFamily: "var(--font-mono)", color: row.color }}>{row.value}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", width: 40, textAlign: "right" }}>
                        {accessStats.total > 0 ? `${((row.value / accessStats.total) * 100).toFixed(0)}%` : ""}
                      </div>
                      {canExpand && (
                        <span style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>{isOpen ? "▴" : "▾"}</span>
                      )}
                    </>
                  );
                  return canExpand ? (
                    <button
                      key={row.key}
                      onClick={() => setAccessListOpen((v) => (v === row.key ? null : row.key))}
                      aria-expanded={isOpen}
                      title="Clic para ver quiénes son"
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        background: isOpen ? "var(--bg)" : "transparent",
                        border: "none", borderRadius: 8, padding: "3px 4px",
                        cursor: "pointer", fontFamily: "var(--font)", width: "100%",
                      }}
                    >
                      {rowInner}
                    </button>
                  ) : (
                    <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 4px" }}>
                      {rowInner}
                    </div>
                  );
                })}

                {accessListOpen && (() => {
                  const lists = {
                    today: accessStats.todayList,
                    week: accessStats.weekList,
                    stale: accessStats.staleList,
                    never: accessStats.neverList,
                  };
                  const colors = { today: COLORS.ok, week: COLORS.brand, stale: COLORS.watch, never: COLORS.critical };
                  const rightLabel = (s) => {
                    if (accessListOpen === "never") return "Nunca";
                    if (s.days === 0) return "Hoy";
                    if (s.days === 1) return "Ayer";
                    return `Hace ${s.days} días`;
                  };
                  const list = lists[accessListOpen] || [];
                  if (!list.length) return null;
                  return (
                    <div style={{
                      maxHeight: 170, overflowY: "auto",
                      border: "1px solid var(--border)", borderRadius: 10,
                      background: "var(--bg)", padding: "4px 2px",
                      display: "flex", flexDirection: "column", gap: 2,
                    }}>
                      {list.map((s) => (
                        <button
                          key={s.userId}
                          onClick={() => {
                            const row = studentRows.find((r) => r.userId === s.userId);
                            if (row) setSelectedStudent(row);
                          }}
                          title="Ver el gemelo de este estudiante"
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                            border: "none", background: "transparent", cursor: "pointer",
                            padding: "4px 8px", borderRadius: 6, fontSize: 11,
                            fontFamily: "var(--font)", color: "var(--text)", textAlign: "left", width: "100%",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-light)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                          <span style={{ color: colors[accessListOpen], fontWeight: 800, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                            {rightLabel(s)}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}

                <Divider />

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Accesos del profesor
                  </div>
                  <InfoTooltip text="Último ingreso al curso de cada miembro del equipo docente (roles no-estudiante del classlist de Brightspace)." />
                </div>
                {teacherAccessList.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>Dato no disponible.</div>
                ) : (
                  teacherAccessList.slice(0, 4).map((t) => (
                    <div key={t.userId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)", fontWeight: 700 }}>
                        {t.name}
                      </span>
                      <span style={{ color: t.iso ? "var(--text)" : COLORS.critical, fontWeight: 800, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                        {fmtLastAccess(t.iso)}
                      </span>
                    </div>
                  ))
                )}

                {/* Detalle de acceso a contenidos por estudiante (las barras de
                    resumen viven en la tarjeta KPI "Elementos publicados") */}
                {consumptionStats?.available && (
                  <>
                    <Divider />

                    <button
                      className="btn"
                      onClick={() => { setConsumptionDetailOpen((v) => !v); setConsumptionStudentOpen(null); }}
                      aria-expanded={consumptionDetailOpen}
                      style={{ alignSelf: "center", fontSize: 11, padding: "5px 12px", borderRadius: 8 }}
                    >
                      👥 {consumptionDetailOpen ? "Ocultar detalle" : "Acceso a contenidos"} {consumptionDetailOpen ? "▴" : "▾"}
                    </button>

                    {consumptionDetailOpen && (
                      <div style={{
                        maxHeight: 220, overflowY: "auto",
                        border: "1px solid var(--border)", borderRadius: 10,
                        background: "var(--bg)", padding: "4px 2px",
                        display: "flex", flexDirection: "column", gap: 2,
                      }}>
                        {(consumptionStats.detail || []).map((s) => {
                          const isOpen = consumptionStudentOpen === s.userId;
                          const hasTopics = s.topicIds.length > 0;
                          return (
                            <div key={s.userId}>
                              <button
                                onClick={() => setConsumptionStudentOpen((v) => (v === s.userId ? null : s.userId))}
                                title={hasTopics ? "Ver qué contenidos abrió" : "Sin detalle de contenidos"}
                                style={{
                                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                                  border: "none", background: isOpen ? "var(--brand-light)" : "transparent",
                                  cursor: "pointer", padding: "4px 8px", borderRadius: 6, fontSize: 11,
                                  fontFamily: "var(--font)", color: "var(--text)", textAlign: "left", width: "100%",
                                }}
                              >
                                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                  <span style={{ fontWeight: 800, fontFamily: "var(--font-mono)", color: s.count > 0 ? "var(--brand)" : "var(--muted)" }}>
                                    {s.count} {s.count === 1 ? "contenido" : "contenidos"}
                                  </span>
                                  {hasTopics && <span style={{ fontSize: 9, color: "var(--muted)" }}>{isOpen ? "▴" : "▾"}</span>}
                                </span>
                              </button>
                              {isOpen && hasTopics && (
                                <div style={{ padding: "2px 8px 6px 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                                  {[...new Set(s.topicIds)].map((tid) => {
                                    const meta = contentTopicMeta.get(String(tid));
                                    const title = meta?.title || `Contenido ${tid}`;
                                    const typeLabel = contentTypeLabel(title, meta?.url, meta?.topicType);
                                    return (
                                      <div key={tid} style={{ fontSize: 10, color: "var(--muted-strong)", display: "flex", gap: 5, alignItems: "flex-start" }}>
                                        <span aria-hidden="true" style={{ flexShrink: 0 }} title={typeLabel}>{CONTENT_TYPE_ICONS[typeLabel] || "📄"}</span>
                                        <span style={{ lineHeight: 1.35 }}>{title}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {isOpen && !hasTopics && (
                                <div style={{ padding: "2px 8px 6px 16px", fontSize: 10, color: "var(--muted)" }}>
                                  Sin detalle de contenidos disponible para este estudiante.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

              </div>
            )}
          </Card>
        </div>

        </div>

        {/* ── Alertas inteligentes (fusiona Radar docente + heurísticas locales) ── */}
        <div className="fade-up fade-up-3" style={{ marginBottom: 12 }}>
          <ErrorBoundary sectionName="Alertas inteligentes">
            <SmartAlerts
              studentRows={studentRows}
              overview={overview}
              courseInfo={courseInfo}
              contentKpis={contentKpis}
              backendAlerts={overview?.alerts}
              onStudentClick={selectStudentById}
            />
          </ErrorBoundary>
        </div>

        {/* ── Resumen semanal IA (narrativa) ── */}
        <div className="fade-up fade-up-3" style={{ marginBottom: 12 }}>
          <ContextualTip
            id="batch4_intro_v3"
            title="✨ Nuevas funciones disponibles"
            description="Tu dashboard ahora tiene resumen narrativo con IA, predicción de notas finales (menú lateral), alertas inteligentes, tendencias históricas y más. Haz Ctrl+K para la paleta de comandos, o presiona ? para ver todos los atajos."
          />
          <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🤖 Resumen semanal <InfoTooltip text="Resumen narrativo en lenguaje natural del estado del curso. Se genera automáticamente a partir de los datos actuales. Puedes escucharlo con TTS." /></span>} accent="brand">
            <ErrorBoundary sectionName="Resumen semanal">
              <AINarrativeSummary
                studentRows={studentRows}
                overview={overview}
                courseInfo={courseInfo}
                raDashboard={raDashboard}
                contentKpis={contentKpis}
              />
            </ErrorBoundary>
          </Card>
        </div>

        </>}

        {/* ── Tendencias tab ── */}
        {activeTab === "trends" && (
        <div className="fade-up tab-enter">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              G.D · Tendencias
            </div>
            <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
              Tendencias del curso
            </h1>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
              {courseInfo?.Name || `Curso ${orgUnitId}`}
            </div>
          </div>
          <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Tendencias del curso <InfoTooltip text="Evolución de nota promedio, porcentaje en riesgo y cobertura a lo largo de los últimos días. Los datos se capturan automáticamente cada vez que abres el dashboard." /></span>} accent="brand">
            <ErrorBoundary sectionName="Tendencias del curso">
              <CourseTrends snapshots={courseSnapshots} />
            </ErrorBoundary>
          </Card>
        </div>
        )}

        {/* ── Calendario tab ── */}
        {activeTab === "calendar" && (
        <div className="fade-up tab-enter">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              G.D · Calendario
            </div>
            <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
              Calendario de entregas
            </h1>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
              {courseInfo?.Name || `Curso ${orgUnitId}`}
            </div>
          </div>
          <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Calendario de entregas <InfoTooltip text="Próximas entregas del curso con detección de sobrecarga (3+ en el mismo día). Heatmap semanal al final. Toma los datos directamente del gradebook del curso." /></span>}>
            <ErrorBoundary sectionName="Calendario de entregas">
              <DueDateCalendar orgUnitId={orgUnitId} studentRows={studentRows} />
            </ErrorBoundary>
          </Card>
        </div>
        )}

        {/* ── Estudiantes tab ── */}
        {activeTab === "students" && (
        <div className="fade-up tab-enter">
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
              G.D · Estudiantes
            </div>
            <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
              Listado de estudiantes
            </h1>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
              {courseInfo?.Name || `Curso ${orgUnitId}`}
            </div>
          </div>
        <div ref={studentsRef}>
          <Card
            title={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>Estudiantes</span>
                <span className="tag">{studentsList?.students?.count ?? studentRows.length ?? 0}</span>
                {studentRows.some((s) => s.isLoading) && (
                  <span
                    className="pulse-dot"
                    style={{ background: COLORS.brand, width: 8, height: 8 }}
                    title="Cargando datos..."
                  />
                )}
              </div>
            }
            right={
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      className="btn"
                      onClick={() => {
                        const activeFilters = [];
                        if (onlyRisk) activeFilters.push("solo-riesgo");
                        if (quickFilter) activeFilters.push(quickFilter);
                        if (advancedQuery?.mode) activeFilters.push(advancedQuery.mode);
                        if (query.trim()) activeFilters.push("buscar");
                        const filterDescription = activeFilters.join("-");
                        exportStudentsCsv(filteredStudents, courseInfo, {
                          columns: csvColumns,
                          filterDescription,
                        });
                      }}
                      title={`Exportar ${filteredStudents.length} estudiantes (filtro activo) a CSV`}
                      aria-label="Exportar estudiantes a CSV"
                      style={{ fontSize: 11, padding: "6px 10px" }}
                    >
                      📥 CSV ({filteredStudents.length})
                    </button>
                    <button
                      className="btn"
                      onClick={() => setCsvOpen((o) => !o)}
                      aria-label="Configurar columnas del CSV"
                      aria-expanded={csvOpen}
                      title="Elegir columnas a exportar"
                      style={{ fontSize: 11, padding: "6px 8px" }}
                    >
                      ▾
                    </button>
                  </div>
                  {csvOpen && (
                    <div
                      role="menu"
                      style={{
                        position: "absolute", top: "calc(100% + 4px)", right: 0,
                        background: "var(--card)", border: "1px solid var(--border)",
                        borderRadius: 8, boxShadow: "var(--shadow)",
                        padding: 10, minWidth: 200, zIndex: 50,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                        Columnas a exportar
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                        {STUDENT_CSV_COLUMNS.map((col) => {
                          const checked = csvColumns.includes(col.key);
                          return (
                            <label key={col.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", padding: "2px 0" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  setCsvColumns((prev) =>
                                    e.target.checked
                                      ? STUDENT_CSV_COLUMNS.map((c) => c.key).filter((k) => prev.includes(k) || k === col.key)
                                      : prev.filter((k) => k !== col.key)
                                  );
                                }}
                              />
                              {col.label}
                            </label>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                        <button
                          className="btn"
                          onClick={() => setCsvColumns(STUDENT_CSV_COLUMNS.map((c) => c.key))}
                          style={{ fontSize: 10, padding: "4px 8px", flex: 1 }}
                        >
                          Todas
                        </button>
                        <button
                          className="btn"
                          onClick={() => setCsvOpen(false)}
                          style={{ fontSize: 10, padding: "4px 8px", flex: 1 }}
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  className="btn"
                  onClick={() => exportCourseReport(studentRows, courseInfo, overview)}
                  title="Generar reporte imprimible (PDF via Print)"
                  aria-label="Generar reporte imprimible"
                  style={{ fontSize: 11, padding: "6px 10px" }}
                >
                  🖨 Reporte
                </button>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" checked={onlyRisk} onChange={(e) => setOnlyRisk(e.target.checked)} />
                  Solo en riesgo
                </label>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={voiceListening ? "🎙️ Escuchando…" : "Buscar por ID o nombre…"}
                    type="text"
                    style={{
                      width: isMobile ? 160 : 200,
                      border: `1px solid ${voiceListening ? "var(--critical)" : "var(--border)"}`,
                      borderRadius: 10,
                      padding: "7px 10px",
                      fontWeight: 600,
                      background: voiceListening ? "var(--critical-bg)" : "var(--card)",
                      color: "var(--text)",
                      fontSize: 12,
                      transition: "border-color 0.2s, background 0.2s",
                    }}
                  />
                  {voiceSupported && (
                    <button
                      className={`voice-btn${voiceListening ? " listening" : ""}`}
                      onClick={toggleVoice}
                      title={voiceListening ? "Detener escucha" : "Buscar por voz"}
                    >
                      {voiceListening ? "⏹" : "🎙️"}
                    </button>
                  )}
                </div>
              </div>
            }
          >
            {/* Voice feedback banner */}
            {voiceFeedback && (
              <div style={{
                marginBottom: 12, padding: "10px 14px", borderRadius: 10,
                border: `1px solid ${voiceListening ? "var(--critical)" : "var(--brand)"}`,
                background: voiceListening ? "var(--critical-bg)" : "var(--brand-light)",
                color: voiceListening ? "var(--critical)" : "var(--brand)",
                fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>{voiceListening ? "🎙️" : "🔍"}</span>
                <span style={{ flex: 1 }}>{voiceFeedback}</span>
                <button
                  className="btn"
                  style={{ padding: "3px 8px", fontSize: 11 }}
                  onClick={() => { setVoiceFeedback(""); setAdvancedQuery({ mode: "text", target: null }); setOnlyRisk(false); setQuery(""); }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Quick filter chips */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {[
                { id: null, label: "Todos", icon: "📋" },
                { id: "risk_high", label: "Riesgo alto", icon: "🔴" },
                { id: "risk_medium", label: "Riesgo medio", icon: "🟡" },
                { id: "overdue", label: "Vencidos", icon: "⚠️" },
                { id: "pending_grade", label: "Pendientes calificación", icon: "⏳" },
                { id: "no_coverage", label: "Cobertura < 40%", icon: "📉" },
                { id: "approved", label: "Aprobados", icon: "✅" },
                { id: "no_grade", label: "Sin nota", icon: "❓" },
              ].map(f => {
                const active = quickFilter === f.id;
                return (
                  <button
                    key={f.id || "all"}
                    className={`chip ${active ? "active" : ""}`}
                    onClick={() => setQuickFilter(f.id)}
                    aria-pressed={active}
                    style={{ fontSize: 11 }}
                  >
                    {f.icon} {f.label}
                  </button>
                );
              })}
              <button
                className="chip"
                onClick={() => setGroupByRisk(v => !v)}
                aria-pressed={groupByRisk}
                title="Agrupar la tabla por nivel de riesgo"
                style={{ fontSize: 11, marginLeft: "auto", borderColor: groupByRisk ? "var(--brand)" : undefined, color: groupByRisk ? "var(--brand)" : undefined }}
              >
                📑 {groupByRisk ? "Agrupado" : "Agrupar por riesgo"}
              </button>
            </div>

            {/* Bulk action bar */}
            {selectedStudentIds.size > 0 && (
              <div style={{
                marginBottom: 10, padding: "10px 14px",
                borderRadius: 10, border: "1px solid var(--brand)",
                background: "var(--brand-light)",
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "var(--brand)" }}>
                  {selectedStudentIds.size} estudiante{selectedStudentIds.size !== 1 ? "s" : ""} seleccionado{selectedStudentIds.size !== 1 ? "s" : ""}
                </span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
                  <button
                    className="btn"
                    onClick={() => {
                      // Compose mailto with all selected student emails
                      const selected = studentRows.filter(s => selectedStudentIds.has(s.userId));
                      const withEmail = selected.filter(s => s.email);
                      const skipped = selected.length - withEmail.length;

                      if (withEmail.length === 0) {
                        alert(
                          `Ninguno de los ${selected.length} estudiantes seleccionados tiene email disponible.\n\n` +
                          `El email se obtiene del classlist de Brightspace. Si el campo no aparece, ` +
                          `puede deberse a permisos de privacidad del curso o a que los estudiantes no tienen email registrado.`
                        );
                        return;
                      }

                      if (skipped > 0) {
                        const proceed = window.confirm(
                          `${withEmail.length} de ${selected.length} estudiantes tienen email.\n` +
                          `${skipped} serán omitidos.\n\n¿Continuar con los disponibles?`
                        );
                        if (!proceed) return;
                      }

                      const emails = withEmail.map(s => s.email).join(",");
                      const subject = encodeURIComponent("Sobre el curso: " + (courseInfo?.Name || ""));
                      const body = encodeURIComponent(
                        `Hola,\n\n[escribe tu mensaje aquí]\n\nSaludos,\n${authUser?.user_name || "Docente"}`
                      );
                      // Use BCC to protect privacy; mailto: limit varies by client (~2000 chars usually)
                      window.location.href = `mailto:?bcc=${encodeURIComponent(emails)}&subject=${subject}&body=${body}`;
                    }}
                    style={{ fontSize: 11, padding: "5px 10px" }}
                  >
                    ✉ Email a todos
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      // Export selected students to CSV
                      const selected = studentRows.filter(s => selectedStudentIds.has(s.userId));
                      const rows = [
                        ["ID", "Nombre", "Email", "Nota", "Cobertura", "Riesgo"].join(","),
                        ...selected.map(s => [
                          s.userId,
                          `"${(s.displayName || "").replace(/"/g, '""')}"`,
                          s.email || "",
                          s.currentPerformancePct != null ? (s.currentPerformancePct / 10).toFixed(1) : "",
                          s.coveragePct != null ? s.coveragePct.toFixed(1) + "%" : "",
                          s.risk || "",
                        ].join(","))
                      ].join("\n");
                      const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `estudiantes_${orgUnitId}_${Date.now()}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{ fontSize: 11, padding: "5px 10px" }}
                  >
                    📥 Exportar CSV
                  </button>
                  <button
                    className="btn"
                    onClick={clearSelection}
                    style={{ fontSize: 11, padding: "5px 10px" }}
                  >
                    ✕ Limpiar
                  </button>
                </div>
              </div>
            )}

            {/* Voice hint */}
            {voiceSupported && !voiceFeedback && (
              <div className="voice-hint" style={{ marginBottom: 10 }}>
                <span>🎙️</span>
                Prueba: <em>"resultado más bajo"</em> · <em>"resultados de aprendizaje"</em> · <em>"estudiantes en riesgo"</em>
              </div>
            )}

            {useCards ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sortedStudents.map((s) => (
                  <StudentCard key={s.userId} s={s} onOpen={setSelectedStudent} weakestMacro={weakestMacro} />
                ))}
                {!sortedStudents.length && (
                  <div className="empty-state">
                    <span className="empty-state-icon">🔍</span>
                    <span>Sin resultados para el filtro</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "10px 10px", width: 28 }}>
                        <input
                          type="checkbox"
                          aria-label="Seleccionar todos los estudiantes visibles"
                          checked={sortedStudents.length > 0 && sortedStudents.every(s => selectedStudentIds.has(s.userId))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStudentIds(new Set(sortedStudents.map(s => s.userId)));
                            } else {
                              clearSelection();
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </th>
                      <SortTh label="ID" {...makeSort("userId")} />
                      <SortTh label="Nombre" {...makeSort("name")} />
                      <SortTh label="Riesgo" {...makeSort("risk")} />
                      <th
                        style={{
                          padding: "10px 10px",
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--muted)",
                        }}
                      >
                        Ruta
                      </th>
                      {!hideCriticalMacroCol && (
                        <th
                          style={{
                            padding: "10px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--muted)",
                          }}
                        >
                          RA crítico
                        </th>
                      )}
                      {!hideGlobalProgressCol && (
                        <th
                          style={{
                            padding: "10px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--muted)",
                          }}
                        >
                          Global
                        </th>
                      )}
                      <SortTh label="Nota" {...makeSort("grade10")} />
                      <SortTh label="Cobertura" {...makeSort("coverage")} title="% del curso con evidencias calificadas" />
                      <th
                        title="Último acceso del estudiante al curso en Brightspace"
                        style={{ padding: "10px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "left", whiteSpace: "nowrap" }}
                      >
                        Último acceso
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const renderStudentRow = (s) => (
                        <tr
                          key={s.userId}
                          onClick={() => setSelectedStudent(s)}
                          className="tr-hover"
                          style={{
                            borderBottom: "1px solid var(--border)",
                            cursor: "pointer",
                            background: selectedStudentIds.has(s.userId) ? "var(--brand-light)" : undefined,
                          }}
                        >
                          <td style={{ padding: "10px 10px", width: 28 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar ${s.displayName}`}
                              checked={selectedStudentIds.has(s.userId)}
                              onChange={() => toggleStudentSelection(s.userId)}
                            />
                          </td>
                          <td style={{ padding: "10px 10px", fontWeight: 700, color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                            {s.userId}
                          </td>
                          <td style={{ padding: "10px 10px", fontWeight: 700, color: "var(--text)", minWidth: 180 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <StudentAvatar userId={s.userId} name={s.displayName} size={28} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                                  {s.displayName}
                                  {s.hasPrescription && (
                                    <span title="Tiene prescripción activa" style={{ fontSize: 14 }}>📋</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "10px 10px" }}>
                            <StatusBadge status={s.isLoading ? "cargando" : s.risk} />
                          </td>
                          <td style={{ padding: "10px 10px", maxWidth: compactRouteCol ? 200 : 320, minWidth: 160 }}>
                            {s.route ? (
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 12, color: "var(--text)" }}>
                                  {s.route.title}
                                </div>
                                <div
                                  style={{
                                    fontSize: 11, color: "var(--muted)",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    maxWidth: compactRouteCol ? 180 : 300,
                                  }}
                                  title={s.route.summary}
                                >
                                  {s.route.summary}
                                </div>
                              </div>
                            ) : ("—")}
                          </td>
                          {!hideCriticalMacroCol && (
                            <td style={{ padding: "10px 10px", minWidth: 90 }}>
                              {(() => {
                                const ra = s.mostCriticalMacro || weakestMacro;
                                if (!ra) return <span style={{ color: "var(--muted)" }}>—</span>;
                                const isFallback = !s.mostCriticalMacro;
                                return (
                                  <div title={isFallback ? "RA del curso (sin datos individuales)" : undefined}>
                                    <div style={{
                                      fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800,
                                      color: isFallback ? "var(--muted)" : colorForPct(ra.pct, thresholds),
                                    }}>
                                      {ra.code}
                                      {isFallback && <span style={{ fontSize: 9, marginLeft: 3, opacity: 0.6 }}>~</span>}
                                    </div>
                                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                      {fmtPct(ra.pct ?? ra.avgPct)}
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                          )}
                          {!hideGlobalProgressCol && (
                            <td style={{ padding: "10px 10px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                              {fmtPct(s.globalPct)}
                            </td>
                          )}
                          <td style={{ padding: "10px 10px" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 900, color: colorForPct(s.currentPerformancePct, thresholds) }}>
                              {fmtGrade10FromPct(s.currentPerformancePct)}
                            </div>
                          </td>
                          <td style={{ padding: "10px 10px", minWidth: 110 }}>
                            <div style={{ fontWeight: 800, fontSize: 13, fontFamily: "var(--font-mono)" }}>
                              {fmtPct(s.coveragePct)}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>
                              {s.coverageCountText || "—"}
                            </div>
                            {s.coveragePct != null && (
                              <ProgressBar value={s.coveragePct} color={colorForPct(s.coveragePct, thresholds)} animate={false} />
                            )}
                          </td>
                          <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                            {(() => {
                              const iso = lastAccessMap[String(s.userId)];
                              const txt = Object.keys(lastAccessMap).length ? fmtLastAccess(iso) : "—";
                              const days = iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : null;
                              const color = !Object.keys(lastAccessMap).length ? "var(--muted)"
                                : iso == null ? COLORS.critical
                                : days > 14 ? COLORS.watch
                                : "var(--text)";
                              return (
                                <span title={iso ? new Date(iso).toLocaleString("es-CO") : "Sin accesos registrados"} style={{ fontSize: 12, fontWeight: 700, color }}>
                                  {txt}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ padding: "10px 10px", textAlign: "right" }}>
                            <button
                              className="btn"
                              style={{ fontSize: 12, padding: "5px 10px" }}
                              onClick={(e) => { e.stopPropagation(); setSelectedStudent(s); }}
                            >
                              Ver →
                            </button>
                          </td>
                        </tr>
                      );

                      if (!sortedStudents.length) {
                        return (
                          <tr>
                            <td colSpan={12} style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                              Sin resultados para el filtro.
                            </td>
                          </tr>
                        );
                      }

                      if (!groupByRisk) {
                        return sortedStudents.map(renderStudentRow);
                      }

                      const groups = { alto: [], medio: [], bajo: [], pending: [] };
                      for (const s of sortedStudents) {
                        const r = computeRiskFromPct(s.currentPerformancePct);
                        if (groups[r]) groups[r].push(s);
                      }
                      const groupMeta = [
                        { key: "alto", label: "Riesgo alto", color: "var(--critical)", bg: "var(--critical-bg)" },
                        { key: "medio", label: "Riesgo medio", color: "var(--watch)", bg: "var(--watch-bg)" },
                        { key: "bajo", label: "Bajo riesgo", color: "var(--ok)", bg: "var(--ok-bg)" },
                        { key: "pending", label: "Sin datos", color: "var(--muted)", bg: "var(--bg)" },
                      ];
                      return groupMeta.map(gm => {
                        if (groups[gm.key].length === 0) return null;
                        const isCollapsed = collapsedGroups.has(gm.key);
                        return (
                          <React.Fragment key={`group-${gm.key}`}>
                            <tr
                              onClick={() => toggleGroupCollapsed(gm.key)}
                              style={{ cursor: "pointer", background: gm.bg, borderBottom: "1px solid var(--border)" }}
                            >
                              <td colSpan={20} style={{ padding: "8px 12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: gm.color }}>
                                  <span>{isCollapsed ? "▸" : "▾"}</span>
                                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: gm.color }} />
                                  <span>{gm.label}</span>
                                  <span className="tag" style={{ background: "rgba(255,255,255,0.6)", color: gm.color }}>{groups[gm.key].length}</span>
                                </div>
                              </td>
                            </tr>
                            {!isCollapsed && groups[gm.key].map(renderStudentRow)}
                          </React.Fragment>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
        </div>
        )}

        </div>
      </main>

      {/* ── Command Palette (Ctrl+K) ── */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />

      {/* ── #13 Configurable risk thresholds ── */}
      {showThresholdsModal && (
        <ThresholdsModal
          current={thresholds}
          base={baseThresholds}
          isOverridden={!!thresholdsOverride}
          onSave={(v) => { saveThresholds(v); setShowThresholdsModal(false); }}
          onReset={() => { resetThresholds(); setShowThresholdsModal(false); }}
          onClose={() => setShowThresholdsModal(false)}
        />
      )}

      {/* ── Floating AI button ── */}
      {overview && (
        <FloatingAI
          onOpenTutorial={() => setShowTutorial(true)}
          onOpenAssistant={() => setActiveTab("assistant")}
        />
      )}

      {/* Course Panel overlay */}
      {showCoursePanel && (
        <CoursePanel
          courses={courseList}
          loadingCourses={loadingCourses}
          currentId={orgUnitId}
          onSelect={handleSelectCourse}
          onClose={() => setShowCoursePanel(false)}
        />
      )}

      <Drawer
        open={!!selectedStudent}
        onClose={() => {
          setSelectedStudent(null);
          setStudentDetail(null);
          setStudentErr("");
          setStudentLoading(false);
        }}
        title={selectedStudent ? `${selectedStudent.displayName}` : "Estudiante"}
        subtitle={`ID ${selectedStudent?.userId ?? "—"} · G.D · Vista docente`}
        extraHeader={isSuperAdmin && selectedStudent && (
          <button
            onClick={() => setImpersonateStudent({
              userId: selectedStudent.userId,
              name: selectedStudent.displayName,
            })}
            style={{
              fontSize: 11, fontWeight: 700,
              padding: "5px 10px", borderRadius: 8,
              background: "rgba(255, 170, 0, 0.12)",
              color: "#b27300",
              border: "1px solid rgba(255, 170, 0, 0.3)",
              cursor: "pointer",
              fontFamily: "var(--font)",
            }}
          >
            👁 Ver portal de este estudiante
          </button>
        )}
      >
        {studentLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
            <div className="cesa-water-text" style={{ fontSize: 36 }}>
              <span className="cesa-water-text__outline" style={{ fontSize: 36 }}>CESA</span>
              <span className="cesa-water-text__fill" aria-hidden="true" style={{ fontSize: 36 }}>CESA</span>
              <span className="cesa-water-text__wave" aria-hidden="true" />
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Consolidando gemelo digital…</div>
          </div>
        ) : studentErr ? (
          <Card title="Error" right={<StatusBadge status="critico" />}>
            <div style={{ color: "var(--critical)", fontWeight: 700 }}>{studentErr}</div>
          </Card>
        ) : !studentDetail ? (
          <Card title="Sin información" right={<StatusBadge status="pending" />}>
            <div style={{ color: "var(--muted)" }}>No hay datos consolidados para este estudiante.</div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* ── Student header: photo + quick actions ── */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", flexWrap: "wrap" }}>
              <StudentAvatar userId={selectedStudent?.userId} name={selectedStudent?.displayName} size={56} />
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em" }}>
                  {selectedStudent?.displayName || "Estudiante"}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>
                  ID {selectedStudent?.userId ?? "—"}
                  {studentDetail?.email && <> · {studentDetail.email}</>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {studentDetail?.email && (
                  <a
                    href={`mailto:${studentDetail.email}?subject=${encodeURIComponent("Sobre tu curso: " + (courseInfo?.Name || ""))}`}
                    className="btn"
                    style={{ fontSize: 11, padding: "6px 10px", textDecoration: "none" }}
                    title="Enviar correo al estudiante"
                  >
                    ✉ Email
                  </a>
                )}
                <button
                  className="btn"
                  onClick={() => window.print()}
                  style={{ fontSize: 11, padding: "6px 10px" }}
                  title="Imprimir expediente del estudiante"
                >
                  🖨 Imprimir
                </button>
              </div>
            </div>

            {/* ── Hero KPI row with circular rings ── */}
            <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
              {/* Nota ring */}
              <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 10px", background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border)", gap: 6 }}>
                <CircularRing
                  pct={drawerSummary?.currentPerformancePct ?? 0}
                  size={88}
                  stroke={8}
                  color={colorForPct(drawerSummary?.currentPerformancePct, thresholds)}
                  label={fmtGrade10FromPct(drawerSummary?.currentPerformancePct)}
                  sublabel="/10"
                  fontSize={20}
                />
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>Nota actual</div>
              </div>
              {/* Cobertura ring */}
              <div style={{ flex: "1 1 140px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 10px", background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border)", gap: 6 }}>
                <CircularRing
                  pct={drawerSummary?.coveragePct ?? 0}
                  size={88}
                  stroke={8}
                  color={colorForPct(drawerSummary?.coveragePct, thresholds)}
                  label={fmtPct(drawerSummary?.coveragePct)}
                  fontSize={14}
                />
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>Cobertura</div>
                <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center" }}>{covText || "—"} ítems</div>
              </div>
              {/* Riesgo + stats */}
              <div style={{ flex: "2 1 180px", display: "flex", flexDirection: "column", justifyContent: "center", padding: "16px 14px", background: "var(--bg)", borderRadius: 16, border: "1px solid var(--border)", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Estado de riesgo</span>
                  <StatusBadge status={drawerSummary?.risk || selectedStudent?.risk || "pending"} />
                </div>
                {drawerPendingUngradedPct > 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: "var(--watch-bg)", border: "1px solid var(--watch-border)" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--watch)" }}>⏳ Pendiente calificación</span>
                    <span style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--watch)" }}>{fmtPct(drawerPendingUngradedPct)}</span>
                  </div>
                )}
                {drawerOverdueUnscoredPct > 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 8, background: "var(--critical-bg)", border: "1px solid var(--critical-border)" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--critical)" }}>🔴 Vencido sin entrega</span>
                    <span style={{ fontSize: 12, fontWeight: 900, fontFamily: "var(--font-mono)", color: "var(--critical)" }}>{fmtPct(drawerOverdueUnscoredPct)}</span>
                  </div>
                )}
                {drawerPendingUngradedPct === 0 && drawerOverdueUnscoredPct === 0 && (
                  <div style={{ fontSize: 12, color: "var(--ok)", fontWeight: 700 }}>✅ Sin entregas pendientes</div>
                )}
              </div>
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              {drawerTabs.map((tab) => (
                <button key={tab.id} className={`chip ${drawerTab === tab.id ? "active" : ""}`} onClick={() => setDrawerTab(tab.id)} style={{ fontSize: 12 }}>
                  {tab.icon} {tab.label}{" "}
                  {tab.count != null ? (
                    <span className="tag" style={{ fontSize: 10, padding: "1px 6px" }}>{tab.count}</span>
                  ) : null}
                </button>
              ))}
            </div>

            {drawerTab === "resumen" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Cobertura individual del estudiante */}
                {drawerSummary?.coveragePct != null && (
                  <Card title="Cobertura de evaluación">
                    <CoverageBars
                      donePct={drawerSummary?.coveragePct ?? 0}
                      pendingPct={drawerPendingUngradedPct}
                      openPct={Math.max(0, 100 - (drawerSummary?.coveragePct ?? 0) - drawerPendingUngradedPct - drawerOverdueUnscoredPct)}
                      overduePct={drawerOverdueUnscoredPct}
                    />
                  </Card>
                )}

                {drawerMacro.length > 0 ? (
                  <Card title="Resultados de aprendizaje del estudiante">
                    {/* Ring grid */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 14 }}>
                      {drawerMacro.map((item) => {
                        const ringColor = colorForPct(item.pct, thresholds);
                        const isCrit = item.pct < (thresholds?.critical ?? 50);
                        const isWatch = !isCrit && item.pct < (thresholds?.watch ?? 70);
                        const statusLabel = isCrit ? "Crítico" : isWatch ? "Observación" : "Óptimo";
                        const statusColor = isCrit ? COLORS.critical : isWatch ? COLORS.watch : COLORS.ok;
                        return (
                          <div key={item.code} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 10px 10px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)", flex: "1 1 90px", maxWidth: 130 }}>
                            <CircularRing pct={item.pct} size={68} stroke={7} color={ringColor} label={fmtPct(item.pct)} fontSize={11} />
                            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", textAlign: "center" }}>{item.code}</div>
                            <span style={{ fontSize: 9, fontWeight: 800, color: statusColor, background: statusColor + "1A", padding: "2px 7px", borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.05em" }}>{statusLabel}</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Description list — one row per RA */}
                    {drawerMacro.some(item => {
                      const ri = learningOutcomesData.find(r => r.code === item.code);
                      return ri?.description || ri?.name;
                    }) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                        {drawerMacro.map((item) => {
                          const ri = learningOutcomesData.find(r => r.code === item.code);
                          const rawDesc = ri?.description || ri?.name || "";
                          // Strip leading "CODE - " prefix if present
                          const desc = rawDesc.replace(/^[A-Za-z0-9_.-]+\s*[-–]\s*/, "").trim();
                          if (!desc || desc === item.code) return null;
                          const ringColor = colorForPct(item.pct, thresholds);
                          return (
                            <div key={item.code + "_d"} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)" }}>
                              <span style={{ flexShrink: 0, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 900, color: ringColor, minWidth: 26, paddingTop: 1 }}>{item.code}</span>
                              <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, fontWeight: 500 }}>{desc}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Legend */}
                    <div style={{ display: "flex", gap: 14, fontSize: 10, color: "var(--muted)", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 10, height: 2, background: COLORS.critical, display: "inline-block", borderRadius: 1 }} /> Crítico ({thresholds?.critical ?? 50}%)
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 10, height: 2, background: COLORS.watch, display: "inline-block", borderRadius: 1 }} /> Observación ({thresholds?.watch ?? 70}%)
                      </span>
                      <button
                        onClick={() => setShowThresholdsModal(true)}
                        title="Configurar umbrales de riesgo para este curso"
                        style={{
                          marginLeft: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700,
                          border: "1px solid var(--border)", background: "var(--card)",
                          color: "var(--brand)", borderRadius: 6, cursor: "pointer",
                        }}
                      >
                        ⚙ Ajustar{thresholdsOverride ? " ●" : ""}
                      </button>
                    </div>
                  </Card>
                ) : learningOutcomesData.length > 0 ? (
                  <Card title="Resultados de aprendizaje del curso">
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, padding: "6px 10px", background: "var(--bg)", borderRadius: 8 }}>
                      Sin datos de evaluación por RA para este estudiante aún. Resultados del curso:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {learningOutcomesData.map((ra) => (
                        <div key={ra.code} style={{
                          display: "flex", alignItems: "flex-start", gap: 10,
                          padding: "8px 10px", borderRadius: 8,
                          border: "1px solid var(--border)", background: "var(--bg)",
                        }}>
                          <span className="tag" style={{ flexShrink: 0, marginTop: 1 }}>{ra.code}</span>
                          <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.5, fontWeight: 500 }}>
                            {ra.description || ra.name || ra.code}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ) : null}

                {drawerProjection && <ProjectionBlock projection={drawerProjection} thresholds={thresholds} />}

                {selectedStudent?.route && (
                  <Card title={selectedStudent.route.title} right={<StatusBadge status={computeRiskFromPct(selectedStudent?.currentPerformancePct)} />}>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>{selectedStudent.route.summary}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(selectedStudent.route.actions || []).map((a, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span style={{ color: COLORS.brand, fontWeight: 900, minWidth: 16, fontSize: 12 }}>{i + 1}.</span>
                          <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                <PendingItemsBlock pendingItems={drawerPendingItems} missingValues={drawerMissingValues} />
              </div>
            )}

            {drawerTab === "evidencias" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {drawerEvidences.length > 0 ? (() => {
                  const drawerCorte = drawerEvidences.filter(e => e?.isCorte === true);
                  const drawerNonCorte = drawerEvidences.filter(e => e?.isCorte !== true);
                  const drawerOverdue = drawerNonCorte.filter(e => e?.status === "overdue_unscored" || (e?.isOverdue && e?.scorePct == null));
                  // Mapa evidenceKey → [códigos RA] derivado de las unidades
                  // del estudiante. u.evidence[].folderId/gradeObjectId nos
                  // conecta cada evidencia con las RAs a las que aporta.
                  const evidenceRasMap = (() => {
                    const m = new Map();
                    for (const u of (drawerUnits || [])) {
                      const code = u?.code;
                      if (!code) continue;
                      for (const ev of (u.evidence || [])) {
                        const keys = [ev?.folderId, ev?.gradeObjectId, ev?.rubricId]
                          .filter((k) => k != null)
                          .map(String);
                        for (const k of keys) {
                          if (!m.has(k)) m.set(k, new Set());
                          m.get(k).add(code);
                        }
                      }
                    }
                    return m;
                  })();
                  const raCodesFor = (e) => {
                    const cands = [e?.gradeObjectId, e?.folderId, e?.rubricId]
                      .filter((k) => k != null)
                      .map(String);
                    const set = new Set();
                    for (const k of cands) {
                      const v = evidenceRasMap.get(k);
                      if (v) v.forEach((c) => set.add(c));
                    }
                    return Array.from(set);
                  };
                  const fmtDue = (iso) => {
                    if (!iso) return "—";
                    try { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "2-digit" }); } catch { return "—"; }
                  };
                  return (
                    <>
                      {/* Cortes agrupados por categoría/período (no cuentan en el promedio) */}
                      {(() => {
                        const dgroups = buildCorteGroups(drawerEvidences, drawerGradeCategories);
                        return dgroups.length > 0;
                      })() && (
                        <Card title="Resumen por Cortes" right={<span className="tag">No suman</span>} accent="brand">
                          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10, padding: "6px 10px", background: "var(--bg)", borderRadius: 8, borderLeft: "3px solid var(--brand)" }}>
                            📊 Ponderados acumulados que Brightspace calcula. Se agrupan por categoría/corte con las evidencias que los componen. <strong>No cuentan</strong> en el promedio del estudiante.
                          </div>
                          {(() => {
                            const dgroups = buildCorteGroups(drawerEvidences, drawerGradeCategories);
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {dgroups.map((g, gi) => {
                                  const corteList = g.aggregates;
                                  const evList = g.components;
                                  const mainCorte = corteList.find((e) => e.scorePct != null) || corteList[0];
                                  const hPct = mainCorte?.scorePct;
                                  const hColor = hPct != null ? colorForPct(hPct, thresholds) : "var(--muted)";
                                  const label = g.name;
                                  const k = g.period ?? (gi + 1);
                                  return (
                                    <div key={g.id} style={{
                                      borderRadius: 12,
                                      border: `1.5px solid ${hColor === "var(--muted)" ? "var(--border)" : `${hColor}55`}`,
                                      overflow: "hidden",
                                      background: "var(--card)",
                                    }}>
                                      <div style={{
                                        padding: "10px 14px",
                                        background: hColor === "var(--muted)" ? "var(--bg)" : `${hColor}14`,
                                        borderBottom: `1px solid ${hColor === "var(--muted)" ? "var(--border)" : `${hColor}33`}`,
                                        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                                      }}>
                                        <div style={{
                                          width: 30, height: 30, borderRadius: 8,
                                          background: hColor === "var(--muted)" ? "var(--bg)" : hColor,
                                          color: hColor === "var(--muted)" ? "var(--muted)" : "#fff",
                                          display: "flex", alignItems: "center", justifyContent: "center",
                                          fontSize: 12, fontWeight: 900,
                                        }}>{k === 99 ? "?" : k}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>{label}</div>
                                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                                            {mainCorte?.name || label}
                                          </div>
                                        </div>
                                        {hPct != null && (
                                          <div style={{ textAlign: "right" }}>
                                            <div style={{ fontSize: 8, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase" }}>Acum.</div>
                                            <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "var(--font-mono)", color: hColor, lineHeight: 1 }}>
                                              {(hPct / 10).toFixed(1)}<span style={{ fontSize: 10, color: "var(--muted)" }}>/10</span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      <div style={{ padding: "10px 14px" }}>
                                        {corteList.length > 1 && (
                                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                                            {corteList.filter(c => c !== mainCorte).map((c, idx) => {
                                              const col = c.scorePct != null ? colorForPct(c.scorePct, thresholds) : "var(--muted)";
                                              return (
                                                <span key={`tc-${idx}`} style={{
                                                  fontSize: 10, fontWeight: 700,
                                                  padding: "3px 8px", borderRadius: 7,
                                                  background: `${col}15`, border: `1px solid ${col}44`, color: col,
                                                }}>
                                                  {c.name}: <strong style={{ fontFamily: "var(--font-mono)" }}>{c.scorePct != null ? (c.scorePct / 10).toFixed(1) : "—"}</strong>
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                        {evList.length > 0 && (
                                          <div>
                                            <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>
                                              Evidencias ({evList.length})
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                              {evList.map((e, idx) => {
                                                const col = e.scorePct != null ? colorForPct(e.scorePct, thresholds) : "var(--muted)";
                                                const isG = e.scorePct != null;
                                                return (
                                                  <div key={`tev-${idx}`} style={{
                                                    display: "flex", alignItems: "center", gap: 8,
                                                    padding: "5px 10px", borderRadius: 6,
                                                    background: "var(--bg)", border: "1px solid var(--border)",
                                                    fontSize: 11,
                                                  }}>
                                                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: col }} />
                                                    <span style={{ flex: 1, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                      {e.name || `Ítem ${e.gradeObjectId}`}
                                                    </span>
                                                    {e.categoryName && (
                                                      <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 8, background: "var(--brand-light)", color: "var(--brand)", fontWeight: 700 }}>
                                                        {e.categoryName}
                                                      </span>
                                                    )}
                                                    {e.weightPct > 0 && (
                                                      <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{Number(e.weightPct).toFixed(0)}%</span>
                                                    )}
                                                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 12, color: col, minWidth: 28, textAlign: "right" }}>
                                                      {isG ? (e.scorePct / 10).toFixed(1) : "—"}
                                                    </span>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        )}
                                        {mainCorte?.formula && (
                                          <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 7, background: "rgba(99, 102, 241, 0.08)", border: "1px dashed rgba(99, 102, 241, 0.35)", fontSize: 10 }}>
                                            <div style={{ fontWeight: 800, color: "rgb(79, 70, 229)", marginBottom: 2 }}>🧮 Fórmula</div>
                                            <div style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", wordBreak: "break-word" }}>{mainCorte.formula}</div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </Card>
                      )}

                      {/* Vencidas */}
                      {drawerOverdue.length > 0 && (
                        <Card title={`⚠️ Entregas Vencidas (${drawerOverdue.length})`} accent="critical">
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {drawerOverdue.map((e, i) => (
                              <div key={`d-overdue-${i}`} style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "10px 12px", borderRadius: 10,
                                border: "1px solid var(--critical-border)",
                                background: "var(--critical-bg)", gap: 10,
                              }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
                                    {e.name || `Ítem ${e.gradeObjectId}`}
                                  </div>
                                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, color: "var(--critical)", fontWeight: 700 }}>🗓 Venció: {fmtDue(e.dueDate)}</span>
                                    <span style={{ fontSize: 11, color: "var(--muted)" }}>Peso: {fmtPct(e.weightPct)}</span>
                                  </div>
                                </div>
                                <span className="badge" style={{ background: "var(--critical)", color: "#fff", border: "none", padding: "4px 10px", fontSize: 10, fontWeight: 800 }}>VENCIDA</span>
                              </div>
                            ))}
                          </div>
                        </Card>
                      )}

                      <EvidencesTimeline evidences={drawerNonCorte} thresholds={thresholds} />
                      <Card title="Detalle de evidencias">
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                                <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "left" }}>Evidencia</th>
                                <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "left" }}>RAs</th>
                                <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "right" }}>Peso</th>
                                <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "right" }}>Nota</th>
                                <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "center" }}>Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drawerNonCorte.map((e, i) => {
                                const evRas = raCodesFor(e);
                                return (
                                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                  <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                                    {e.name || `Ítem ${e.gradeObjectId}`}
                                    {e.dueDate && (
                                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                                        🗓 {fmtDue(e.dueDate)}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: "8px 10px" }}>
                                    {evRas.length > 0 ? (
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                        {evRas.map((code) => {
                                          const info = outcomesMap?.[code];
                                          return (
                                            <span
                                              key={code}
                                              className="tag"
                                              title={info?.title || info?.description || code}
                                              style={{ fontSize: 10, padding: "2px 6px" }}
                                            >
                                              {code}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: 10, color: "var(--muted)" }}>—</span>
                                    )}
                                  </td>
                                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>
                                    {fmtPct(e.weightPct)}
                                  </td>
                                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 900, color: colorForPct(e.scorePct, thresholds) }}>
                                    {e.scorePct != null ? (Number(e.scorePct) / 10).toFixed(1) : "—"}
                                  </td>
                                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                                    <StatusBadge status={e.status || "pending"} />
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                      <NoRaMappingNotice evidences={drawerNonCorte} units={drawerUnits} />
                    </>
                  );
                })() : (
                  <div className="empty-state">
                    <span className="empty-state-icon">📭</span>
                    <span>Sin evidencias calificadas disponibles</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Los ítems del gradebook aún no tienen nota registrada.
                    </span>
                  </div>
                )}
              </div>
            )}

            {drawerTab === "unidades" && (
              <Card title="Subcompetencias / Unidades">
                {drawerUnits.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {drawerUnits.map((u) => (
                      <div key={u.code} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="tag">{u.code}</span>
                          <StatusBadge status={u.status} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 900, color: colorForPct(u.pct, thresholds) }}>
                            {fmtPct(u.pct)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{(u.evidence || []).length} evidencias</div>
                        </div>
                        <ProgressBar value={u.pct} color={colorForPct(u.pct, thresholds)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <span className="empty-state-icon">🎯</span>
                    <span>Sin unidades consolidadas</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Posible falta de rúbricas evaluadas o mapeadas.
                    </span>
                  </div>
                )}
              </Card>
            )}

            {drawerTab === "prescripcion" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ background: "var(--watch-bg)", border: "1px solid #FED7AA", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, color: "#9A3412" }}>
                  ⚠️ Este estudiante requiere intervención prioritaria.
                </div>
                {drawerPrescription.map((p) => (
                  <Card key={p.routeId} title={p.title} right={<span className="tag">{p.routeId}</span>}>
                    {p.successCriteria && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, padding: "6px 10px", background: "var(--bg)", borderRadius: 8 }}>
                        🎯 {p.successCriteria}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(p.actions || []).map((a, idx) => (
                        <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <span
                            style={{
                              background: COLORS.brand,
                              color: "#fff",
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 900,
                              flexShrink: 0,
                              marginTop: 1,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.4 }}>{a}</span>
                        </div>
                      ))}
                    </div>
                    {p.priority?.length > 0 && (
                      <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {p.priority.map((pr) => (
                          <span key={pr} className="tag" style={{ background: "var(--critical-bg)", color: "#B42318" }}>
                            {pr}
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {drawerTab === "calidad" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 12px", background: "var(--bg)", borderRadius: 8 }}>
                  Flags generados por el motor de calidad del gemelo. Indican posibles inconsistencias en rúbricas, criterios no mapeados, o datos ausentes.
                </div>
                <QualityFlagsBlock flags={drawerQcFlags} />
              </div>
            )}

            {drawerTab === "historial" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Card title={`Historial de interacciones (${studentChatHook.entries.length})`}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, padding: "8px 12px", background: "var(--bg)", borderRadius: 8, borderLeft: "3px solid var(--brand)" }}>
                    💬 Registra tus interacciones con este estudiante: reuniones, emails, acciones tomadas. Se guarda localmente en tu navegador.
                  </div>

                  {/* Entry form */}
                  <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)" }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                      {[
                        { id: "meeting", label: "Reunión", icon: "🤝" },
                        { id: "email", label: "Email", icon: "✉" },
                        { id: "note", label: "Nota", icon: "📝" },
                        { id: "action", label: "Acción", icon: "✅" },
                      ].map(t => (
                        <button
                          key={t.id}
                          className={`chip ${chatInputType === t.id ? "active" : ""}`}
                          onClick={() => setChatInputType(t.id)}
                          style={{ fontSize: 11 }}
                        >
                          {t.icon} {t.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={chatInputText}
                      onChange={(e) => setChatInputText(e.target.value)}
                      placeholder={`Describe la ${chatInputType}...`}
                      aria-label="Describir interacción"
                      style={{
                        width: "100%", minHeight: 60, padding: 10,
                        borderRadius: 8, border: "1px solid var(--border)",
                        background: "var(--card)", color: "var(--text)",
                        fontFamily: "var(--font)", fontSize: 13, lineHeight: 1.4,
                        outline: "none", resize: "vertical",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          if (chatInputText.trim()) {
                            studentChatHook.addEntry(chatInputType, chatInputText);
                            setChatInputText("");
                          }
                        }}
                        disabled={!chatInputText.trim()}
                        style={{ fontSize: 12, padding: "6px 14px" }}
                      >
                        Registrar
                      </button>
                    </div>
                  </div>

                  {/* Timeline */}
                  {studentChatHook.entries.length === 0 ? (
                    <div className="empty-state" style={{ minHeight: 100 }}>
                      <span className="empty-state-icon">💬</span>
                      <span>Sin interacciones registradas</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {studentChatHook.entries.map((entry) => {
                        const typeMeta = {
                          meeting: { icon: "🤝", color: "var(--brand)", label: "Reunión" },
                          email: { icon: "✉", color: "var(--watch)", label: "Email" },
                          note: { icon: "📝", color: "var(--muted)", label: "Nota" },
                          action: { icon: "✅", color: "var(--ok)", label: "Acción" },
                        }[entry.type] || { icon: "▸", color: "var(--muted)", label: entry.type };
                        return (
                          <div key={entry.id} style={{
                            display: "flex", gap: 10,
                            padding: "10px 12px", borderRadius: 10,
                            border: `1px solid var(--border)`,
                            background: "var(--card)",
                            borderLeft: `3px solid ${typeMeta.color}`,
                          }}>
                            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{typeMeta.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, color: typeMeta.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                  {typeMeta.label}
                                </span>
                                <span style={{ fontSize: 10, color: "var(--muted)" }}>
                                  {new Date(entry.date).toLocaleString("es-CO", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                              <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                                {entry.text}
                              </div>
                            </div>
                            <button
                              onClick={() => studentChatHook.deleteEntry(entry.id)}
                              aria-label="Eliminar entrada"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14, padding: "0 4px", alignSelf: "flex-start" }}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </div>
            )}

            {drawerTab === "notas" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Card title="Mis notas privadas" right={
                  studentNotesHook.lastUpdated ? (
                    <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>
                      Guardado: {new Date(studentNotesHook.lastUpdated).toLocaleString("es-CO")}
                    </span>
                  ) : null
                }>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, padding: "8px 12px", background: "var(--bg)", borderRadius: 8, borderLeft: "3px solid var(--brand)" }}>
                    🔒 Estas notas son <strong>privadas y locales</strong> a tu navegador. No se comparten con el estudiante ni con otros docentes. Útil para registrar observaciones, acuerdos, recordatorios.
                  </div>
                  <textarea
                    value={studentNotesHook.notes}
                    onChange={(e) => studentNotesHook.setNotes(e.target.value)}
                    placeholder="Escribe aquí tus observaciones sobre este estudiante…"
                    aria-label="Notas privadas del estudiante"
                    style={{
                      width: "100%", minHeight: 200, padding: 12,
                      borderRadius: 10, border: "1px solid var(--border)",
                      background: "var(--bg)", color: "var(--text)",
                      fontFamily: "var(--font)", fontSize: 13, lineHeight: 1.5,
                      outline: "none", resize: "vertical",
                    }}
                  />
                  {studentNotesHook.notes && (
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={() => {
                          if (window.confirm("¿Borrar estas notas definitivamente?")) {
                            studentNotesHook.clearNotes();
                          }
                        }}
                        className="btn"
                        style={{ fontSize: 11, padding: "5px 10px", color: "var(--critical)", borderColor: "var(--critical-border)" }}
                      >
                        🗑 Borrar notas
                      </button>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* SuperAdmin — selector de estudiante para "Vista estudiante" */}
      {isSuperAdmin && studentPickerOpen && (
        <div
          onClick={() => { setStudentPickerOpen(false); setPickerSearch(""); }}
          style={{
            position: "fixed", inset: 0, zIndex: 320,
            background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: "12vh",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Elegir estudiante para vista estudiante"
            style={{
              width: "min(480px, 92vw)", maxHeight: "70vh",
              background: "var(--card)", borderRadius: 16,
              border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>
                🎓 Vista estudiante — elige un estudiante
              </div>
              <button
                onClick={() => { setStudentPickerOpen(false); setPickerSearch(""); }}
                aria-label="Cerrar"
                style={{ background: "none", border: "none", fontSize: 16, cursor: "pointer", color: "var(--muted)" }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
              <input
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Buscar por nombre o ID…"
                autoFocus
                style={{
                  width: "100%", padding: "9px 12px", fontSize: 13,
                  border: "1px solid var(--border)", borderRadius: 10,
                  background: "var(--bg)", color: "var(--text)",
                  fontFamily: "var(--font)", outline: "none",
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
              {(Array.isArray(studentRows) ? studentRows : [])
                .filter((s) => {
                  if (!pickerSearch.trim()) return true;
                  const q = pickerSearch.toLowerCase();
                  return (s.displayName || "").toLowerCase().includes(q) || String(s.userId).includes(q);
                })
                .slice(0, 50)
                .map((s) => (
                  <button
                    key={s.userId}
                    onClick={() => {
                      setImpersonateStudent({ userId: s.userId, name: s.displayName });
                      setStudentPickerOpen(false);
                      setPickerSearch("");
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "9px 16px", border: "none",
                      background: "transparent", cursor: "pointer",
                      fontSize: 13, fontFamily: "var(--font)",
                      color: "var(--text)", textAlign: "left",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-light)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: "var(--brand-light)", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 800, color: "var(--brand)", flexShrink: 0,
                    }}>{(s.displayName || "?").charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.displayName}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>ID {s.userId}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--brand)" }}>Ver portal →</span>
                  </button>
                ))}
              {(Array.isArray(studentRows) ? studentRows : []).length === 0 && (
                <div style={{ padding: "20px 16px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
                  Carga un curso primero para ver sus estudiantes.
                </div>
              )}
            </div>
            <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--muted)", textAlign: "center" }}>
              Verás el portal exactamente como lo ve el estudiante elegido
            </div>
          </div>
        </div>
      )}

      {/* SuperAdmin impersonation — view a student's portal */}
      {impersonateStudent && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 310,
          background: "var(--page-bg, #f5f7fb)",
          overflow: "auto",
        }}>
          {/* Banner: "Viewing as..." */}
          <div style={{
            position: "sticky", top: 0, zIndex: 5,
            padding: "8px 20px",
            background: "linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)",
            color: "#000",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 12, fontWeight: 700,
          }}>
            <span>👁 Vista previa: estás viendo como <strong>{impersonateStudent.name}</strong> (ID {impersonateStudent.userId})</span>
            <button
              onClick={() => setImpersonateStudent(null)}
              style={{
                background: "#fff", border: "none", borderRadius: 6,
                padding: "4px 12px", fontSize: 11, fontWeight: 800,
                cursor: "pointer", color: "#000",
              }}
            >
              ✕ Salir de vista previa
            </button>
          </div>
          <React.Suspense fallback={<SharedCesaLoader title="Portal del Estudiante" subtitle="Cargando vista previa" />}>
            <StudentPortal
              orgUnitIdOverride={orgUnitId}
              userIdOverride={impersonateStudent.userId}
              allowOverviewPanel={isSuperAdmin}
            />
          </React.Suspense>
        </div>
      )}

      {/* Coordinator overlay — renders ON TOP of the dashboard so data is
          preserved. When the user closes it, the dashboard is still mounted. */}
      {showCoordinator && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "var(--page-bg, #f5f7fb)",
          overflow: "auto",
        }}>
          <React.Suspense fallback={<SharedCesaLoader title="Panel Coordinador" subtitle="Cargando" />}>
            <CoordinatorDashboard onClose={() => setShowCoordinator(false)} />
          </React.Suspense>
        </div>
      )}
    </div>
  );
}
