import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

/**
 * Lightweight i18n context — no external library.
 * Supports ES (default) and EN. Users can switch from topbar.
 * Persisted in localStorage.
 */

const translations = {
  es: {
    // Common
    "common.loading": "Cargando...",
    "common.error": "Error",
    "common.retry": "Reintentar",
    "common.cancel": "Cancelar",
    "common.save": "Guardar",
    "common.close": "Cerrar",
    "common.search": "Buscar",
    "common.export": "Exportar",
    "common.print": "Imprimir",
    "common.logout": "Cerrar sesión",
    // Dashboard
    "dashboard.title": "G.D · Vista Docente",
    "dashboard.students": "Estudiantes",
    "dashboard.courseManagement": "Gestión del curso",
    "dashboard.riskAcademic": "Riesgo académico",
    "dashboard.priorityAcademic": "Prioridad académica",
    "dashboard.priorityStudents": "Estudiantes prioritarios",
    "dashboard.gradeDistribution": "Distribución de notas",
    "dashboard.trends": "Tendencias del curso",
    "dashboard.smartAlerts": "Alertas inteligentes",
    "dashboard.dueDateCalendar": "Calendario de entregas",
    "dashboard.myCourses": "Mis cursos",
    "dashboard.noCourse": "Selecciona un curso",
    // Sidebar / Topbar
    "nav.dashboard": "Dashboard",
    "nav.students": "Estudiantes",
    "nav.calendar": "Calendario",
    "nav.trends": "Tendencias",
    "nav.routes": "Rutas de atención",
    "nav.predictions": "Predicción de notas",
    "nav.evidences": "Evidencias",
    "nav.learningOutcomes": "Resultados de aprendizaje",
    "nav.assistant": "Asistente IA",
    "nav.support": "Soporte",
    "nav.views": "Vistas",
    "nav.activeCourse": "Curso activo",
    "nav.teacherView": "Vista Docente",
    "topbar.courseIdPlaceholder": "ID de curso…",
    "topbar.commands": "Comandos",
    "topbar.home": "Inicio",
    "topbar.myCourses": "Mis cursos",
    "topbar.viewAs": "Ver como...",
    "topbar.teacherView": "Vista profesor",
    "topbar.studentView": "Vista estudiante",
    // Portal
    "portal.title": "G.D · Mi Rendimiento",
    "portal.greeting": "Hola",
    "portal.myGrade": "Mi Nota Actual",
    "portal.coverage": "Cobertura",
    "portal.myStatus": "Mi Estado",
    "portal.myRoute": "Mi Ruta de Mejora",
    "portal.myLearningOutcomes": "Mis Resultados de Aprendizaje",
    "portal.myEvidences": "Mis Evidencias Calificadas",
    "portal.overdueDeliveries": "Entregas Vencidas",
    "portal.pendingDeliveries": "Entregas Pendientes",
  },
  en: {
    "common.loading": "Loading...",
    "common.error": "Error",
    "common.retry": "Retry",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.close": "Close",
    "common.search": "Search",
    "common.export": "Export",
    "common.print": "Print",
    "common.logout": "Sign out",
    "dashboard.title": "Digital Twin · Teacher View",
    "dashboard.students": "Students",
    "dashboard.courseManagement": "Course Management",
    "dashboard.riskAcademic": "Academic Risk",
    "dashboard.priorityAcademic": "Academic Priority",
    "dashboard.priorityStudents": "Priority Students",
    "dashboard.gradeDistribution": "Grade Distribution",
    "dashboard.trends": "Course Trends",
    "dashboard.smartAlerts": "Smart Alerts",
    "dashboard.dueDateCalendar": "Due Date Calendar",
    "dashboard.myCourses": "My Courses",
    "dashboard.noCourse": "Select a course",
    "nav.dashboard": "Dashboard",
    "nav.students": "Students",
    "nav.calendar": "Calendar",
    "nav.trends": "Trends",
    "nav.routes": "Intervention Routes",
    "nav.predictions": "Grade Predictions",
    "nav.evidences": "Evidences",
    "nav.learningOutcomes": "Learning Outcomes",
    "nav.assistant": "AI Assistant",
    "nav.support": "Support",
    "nav.views": "Views",
    "nav.activeCourse": "Active course",
    "nav.teacherView": "Teacher View",
    "topbar.courseIdPlaceholder": "Course ID…",
    "topbar.commands": "Commands",
    "topbar.home": "Home",
    "topbar.myCourses": "My Courses",
    "topbar.viewAs": "View as...",
    "topbar.teacherView": "Teacher view",
    "topbar.studentView": "Student view",
    "portal.title": "Digital Twin · My Performance",
    "portal.greeting": "Hi",
    "portal.myGrade": "My Current Grade",
    "portal.coverage": "Coverage",
    "portal.myStatus": "My Status",
    "portal.myRoute": "My Improvement Path",
    "portal.myLearningOutcomes": "My Learning Outcomes",
    "portal.myEvidences": "My Graded Evidences",
    "portal.overdueDeliveries": "Overdue Deliveries",
    "portal.pendingDeliveries": "Pending Deliveries",
  },
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    if (typeof localStorage === "undefined") return "es";
    return localStorage.getItem("gemelo_locale") || "es";
  });

  useEffect(() => {
    try { localStorage.setItem("gemelo_locale", locale); } catch { /* noop */ }
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback((key, fallback) => {
    const dict = translations[locale] || translations.es;
    return dict[key] || fallback || key;
  }, [locale]);

  const setLocale = useCallback((l) => {
    if (translations[l]) setLocaleState(l);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((l) => (l === "es" ? "en" : "es"));
  }, []);

  // Memoizado: evita re-renders en cascada de todos los consumidores de useI18n()
  const value = useMemo(
    () => ({ locale, t, setLocale, toggleLocale }),
    [locale, t, setLocale, toggleLocale],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback: return a no-op t() so the app still works if provider missing
    return {
      locale: "es",
      t: (k, fb) => fb || k,
      setLocale: () => {},
      toggleLocale: () => {},
    };
  }
  return ctx;
}
