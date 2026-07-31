import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { apiGetCached } from "../utils/api";

const CourseContext = createContext(null);

export function CourseProvider({ children, orgUnitId: externalOrgUnitId }) {
  // orgUnitId can be controlled externally or internally
  const [orgUnitId, setOrgUnitId] = useState(externalOrgUnitId || 0);
  const [orgUnitInput, setOrgUnitInput] = useState(String(externalOrgUnitId || ""));

  // Sync with external prop
  useEffect(() => {
    if (externalOrgUnitId && externalOrgUnitId !== orgUnitId) {
      setOrgUnitId(externalOrgUnitId);
      setOrgUnitInput(String(externalOrgUnitId));
    }
  }, [externalOrgUnitId, orgUnitId]);

  // Course data state
  const [overview, setOverview] = useState(null);
  const [studentsList, setStudentsList] = useState(null);
  const [studentRows, setStudentRows] = useState([]);
  const [raDashboard, setRaDashboard] = useState(null);
  const [learningOutcomesPayload, setLearningOutcomesPayload] = useState(null);
  const [outcomesMap, setOutcomesMap] = useState({});
  const [contentRoot, setContentRoot] = useState([]);
  const [courseInfo, setCourseInfo] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Course list state
  const [courseList, setCourseList] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseListLoaded, setCourseListLoaded] = useState(false);
  const [courseListError, setCourseListError] = useState("");

  // Per-course threshold overrides (#13). Stored in localStorage as
  // gemelo_thresholds_<orgUnitId> = JSON.stringify({critical, watch}).
  const [thresholdOverrides, setThresholdOverrides] = useState({});

  useEffect(() => {
    if (!orgUnitId) return;
    try {
      const raw = localStorage.getItem(`gemelo_thresholds_${orgUnitId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        setThresholdOverrides((prev) => ({ ...prev, [orgUnitId]: parsed }));
      }
    } catch { /* ignore */ }
  }, [orgUnitId]);

  const override = thresholdOverrides[orgUnitId];
  const thresholds = useMemo(() => {
    const base = overview?.thresholds || { critical: 50, watch: 70 };
    return override ? { ...base, ...override } : base;
  }, [overview, override]);

  const setCourseThresholds = useCallback((next) => {
    if (!orgUnitId) return;
    const clean = {
      critical: Math.max(0, Math.min(100, Number(next.critical) || 0)),
      watch: Math.max(0, Math.min(100, Number(next.watch) || 0)),
    };
    if (clean.watch < clean.critical) clean.watch = clean.critical;
    setThresholdOverrides((prev) => ({ ...prev, [orgUnitId]: clean }));
    try { localStorage.setItem(`gemelo_thresholds_${orgUnitId}`, JSON.stringify(clean)); } catch { /* ignore */ }
  }, [orgUnitId]);

  const resetCourseThresholds = useCallback(() => {
    if (!orgUnitId) return;
    setThresholdOverrides((prev) => {
      const n = { ...prev };
      delete n[orgUnitId];
      return n;
    });
    try { localStorage.removeItem(`gemelo_thresholds_${orgUnitId}`); } catch { /* ignore */ }
  }, [orgUnitId]);

  // Search courses
  const searchCourses = useCallback(async (term) => {
    setLoadingCourses(true);
    setCourseListError("");
    try {
      const q = term && term.trim().length > 0 ? term.trim() : "";
      const qs = q ? `?active_only=false&limit=50&search=${encodeURIComponent(q)}` : `?active_only=false&limit=50`;

      const [myData, allData] = await Promise.allSettled([
        apiGetCached(`/brightspace/my-course-offerings${qs}`, { ttl: 300_000 }),
        apiGetCached(`/brightspace/all-courses${qs}`, { ttl: 300_000 }),
      ]);

      if (myData.status === "rejected" && allData.status === "rejected") {
        throw myData.reason || new Error("No se pudo cargar la lista de cursos");
      }

      const myItems  = myData.status  === "fulfilled" ? (Array.isArray(myData.value?.items)  ? myData.value.items  : []) : [];
      const allItems = allData.status === "fulfilled" ? (Array.isArray(allData.value?.items) ? allData.value.items : []) : [];

      const idSet = new Set(myItems.map(c => String(c.id)));
      const final = allItems.length > 0
        ? allItems.map(c => ({ ...c, enrolled: idSet.has(String(c.id)) }))
        : myItems;

      final.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
      });

      setCourseList(final.length > 0 ? final : myItems);
      setCourseListLoaded(true);
    } catch (e) {
      // No bloquea la UI, pero deja rastro y expone el error para mostrarlo
      console.warn("searchCourses falló:", e);
      setCourseListError(String(e?.message || e));
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  const loadCourseList = useCallback(async () => {
    if (courseListLoaded || loadingCourses) return;
    await searchCourses("");
  }, [courseListLoaded, loadingCourses, searchCourses]);

  const selectCourse = useCallback((id) => {
    const v = Number(id);
    if (v > 0) {
      setOrgUnitId(v);
      setOrgUnitInput(String(v));
    }
  }, []);

  const clearCourse = useCallback(() => {
    setOrgUnitId(0);
    setOrgUnitInput("");
    setError("");
    setOverview(null);
  }, []);

  // Memoizado: el objeto value solo cambia cuando cambia algún dato real.
  // Los setters de useState son estables, por eso no van en las dependencias.
  const value = useMemo(() => ({
    orgUnitId,
    orgUnitInput,
    setOrgUnitId: selectCourse,
    setOrgUnitInput,
    clearCourse,

    overview,
    setOverview,
    studentsList,
    setStudentsList,
    studentRows,
    setStudentRows,
    raDashboard,
    setRaDashboard,
    learningOutcomesPayload,
    setLearningOutcomesPayload,
    outcomesMap,
    setOutcomesMap,
    contentRoot,
    setContentRoot,
    courseInfo,
    setCourseInfo,

    loading,
    setLoading,
    error,
    setError,

    thresholds,
    isThresholdOverridden: !!override,
    setCourseThresholds,
    resetCourseThresholds,

    courseList,
    loadingCourses,
    courseListLoaded,
    courseListError,
    setCourseListLoaded,
    searchCourses,
    loadCourseList,
  }), [
    orgUnitId, orgUnitInput, selectCourse, clearCourse,
    overview, studentsList, studentRows, raDashboard,
    learningOutcomesPayload, outcomesMap, contentRoot, courseInfo,
    loading, error,
    thresholds, override, setCourseThresholds, resetCourseThresholds,
    courseList, loadingCourses, courseListLoaded, courseListError,
    searchCourses, loadCourseList,
  ]);

  return (
    <CourseContext.Provider value={value}>
      {children}
    </CourseContext.Provider>
  );
}

export function useCourse() {
  const ctx = useContext(CourseContext);
  if (!ctx) throw new Error("useCourse must be used within CourseProvider");
  return ctx;
}
