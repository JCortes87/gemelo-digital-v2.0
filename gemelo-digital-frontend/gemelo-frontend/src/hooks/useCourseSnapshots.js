import { useState, useEffect, useMemo } from "react";
import { apiGetCached } from "../utils/api";

/**
 * Snapshots diarios de tendencias del curso, servidos desde la DB del backend.
 * Fallback a localStorage si la API falla (sin conexión, error de red, etc.)
 *
 * Snapshot shape:
 *   { date: "YYYY-MM-DD", avgPct, atRiskPct, coveragePct, totalStudents }
 *
 * Returns:
 *   - snapshots: array ordenado por fecha (últimos 90 días)
 *   - today: snapshot de hoy (si existe)
 *   - source: "api" | "localStorage" | "empty"
 */
export default function useCourseSnapshots(orgUnitId, currentMetrics) {
  const storageKey = orgUnitId ? `gemelo_snapshots_${orgUnitId}` : null;

  const [snapshots, setSnapshots] = useState(() => {
    // Seed inicial desde localStorage mientras llega la API
    if (!storageKey || typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [source, setSource] = useState("localStorage");

  // Cargar desde la API
  useEffect(() => {
    if (!orgUnitId) return;
    let cancelled = false;

    apiGetCached(`/gemelo/course/${orgUnitId}/metric-history?days=90`)
      .then((data) => {
        if (cancelled) return;
        const apiSnaps = data?.snapshots;
        if (Array.isArray(apiSnaps) && apiSnaps.length > 0) {
          setSnapshots(apiSnaps);
          setSource("api");
          // Sincroniza localStorage con lo que llegó de la API
          try {
            localStorage.setItem(storageKey, JSON.stringify(apiSnaps));
          } catch {}
        } else {
          setSource("empty");
        }
      })
      .catch(() => {
        // Red caída — usamos lo que ya cargamos de localStorage
        setSource("localStorage");
      });

    return () => { cancelled = true; };
  }, [orgUnitId]);

  // Captura snapshot del día actual desde currentMetrics (escribe a localStorage + API lo persiste via overview)
  useEffect(() => {
    if (!storageKey) return;
    if (!currentMetrics) return;
    if (currentMetrics.totalStudents == null || currentMetrics.totalStudents === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const newSnap = {
      date: today,
      avgPct: currentMetrics.avgPct ?? null,
      atRiskPct: currentMetrics.atRiskPct ?? null,
      coveragePct: currentMetrics.coveragePct ?? null,
      totalStudents: currentMetrics.totalStudents ?? 0,
    };

    setSnapshots((prev) => {
      const filtered = prev.filter((s) => s.date !== today);
      const next = [...filtered, newSnap];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const trimmed = next.filter((s) => s.date >= cutoffStr);
      trimmed.sort((a, b) => a.date.localeCompare(b.date));
      try {
        localStorage.setItem(storageKey, JSON.stringify(trimmed));
      } catch {}
      return trimmed;
    });
  }, [
    storageKey,
    currentMetrics?.avgPct,
    currentMetrics?.atRiskPct,
    currentMetrics?.coveragePct,
    currentMetrics?.totalStudents,
  ]);

  const today = useMemo(() => {
    const d = new Date().toISOString().slice(0, 10);
    return snapshots.find((s) => s.date === d) || null;
  }, [snapshots]);

  return { snapshots, today, source };
}
