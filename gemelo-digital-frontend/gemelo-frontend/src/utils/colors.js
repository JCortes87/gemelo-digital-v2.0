export const COLORS = {
  critical: "#D92D20",
  watch: "#F79009",
  ok: "#12B76A",
  pending: "#98A2B3",
  brand: "#0B5FFF",
};

export const STATUS_CONFIG = {
  solido: { bg: "var(--ok-bg)", fg: "#1B5E20", dot: COLORS.ok, label: "Óptimo" },
  "óptimo": { bg: "var(--ok-bg)", fg: "#1B5E20", dot: COLORS.ok, label: "Óptimo" },
  optimo: { bg: "var(--ok-bg)", fg: "#1B5E20", dot: COLORS.ok, label: "Óptimo" },
  observacion: { bg: "var(--watch-bg)", fg: "#9A3412", dot: COLORS.watch, label: "Seguimiento" },
  "en seguimiento": { bg: "var(--watch-bg)", fg: "#9A3412", dot: COLORS.watch, label: "Seguimiento" },
  "en desarrollo": { bg: "var(--watch-bg)", fg: "#9A3412", dot: COLORS.watch, label: "En desarrollo" },
  critico: { bg: "var(--critical-bg)", fg: "#B42318", dot: COLORS.critical, label: "Crítico" },
  cargando: { bg: "var(--brand-light)", fg: "#1D4ED8", dot: COLORS.brand, label: "Cargando" },
  pending: { bg: "var(--pending-bg)", fg: "var(--muted)", dot: COLORS.pending, label: "Pendiente" },
  alto: { bg: "var(--critical-bg)", fg: "#B42318", dot: COLORS.critical, label: "Alto" },
  medio: { bg: "var(--watch-bg)", fg: "#9A3412", dot: COLORS.watch, label: "Medio" },
  bajo: { bg: "var(--ok-bg)", fg: "#1B5E20", dot: COLORS.ok, label: "Bajo" },
};

import { normStatus } from "./helpers";

export function colorForRisk(risk) {
  const r = normStatus(risk);
  if (r === "alto" || r === "critico") return COLORS.critical;
  if (r === "medio" || r === "en desarrollo") return COLORS.watch;
  if (r === "bajo" || r === "óptimo") return COLORS.ok;
  return COLORS.pending;
}

export function colorForPct(pct, thresholds) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return COLORS.pending;
  const p = Number(pct);
  const thr = thresholds || { critical: 50, watch: 70 };
  if (p < Number(thr.critical)) return COLORS.critical;
  if (p < Number(thr.watch)) return COLORS.watch;
  return COLORS.ok;
}

/**
 * Paleta unificada para gráficas Recharts.
 *
 * Devuelve un set coherente de colores según el modo (light/dark) que respeta
 * la marca CESA y mantiene contraste WCAG AA sobre el fondo de card. Uso:
 *
 *   const palette = chartColorScheme(darkMode);
 *   <Line stroke={palette.series[0]} />
 *   <ReferenceLine stroke={palette.axis} />
 *
 * `series` es un array de 8 colores rotatorios; `qualitative` cubre categorías
 * fijas frecuentes (positivo, negativo, neutro, benchmark). Los colores de
 * ejes / grid usan tokens visuales del sistema.
 */
export function chartColorScheme(darkMode = false) {
  if (darkMode) {
    return {
      series: [
        "#60A5FA", // brand
        "#34D399", // ok / verde
        "#FBBF24", // watch / ambar
        "#F87171", // critical / rojo
        "#A78BFA", // púrpura
        "#22D3EE", // cian
        "#F472B6", // rosa
        "#FB923C", // naranja
      ],
      qualitative: {
        positive: "#34D399",
        negative: "#F87171",
        neutral: "#94A3BB",
        benchmark: "#A78BFA",
        highlight: "#FBBF24",
      },
      axis: "#94A3BB",
      grid: "rgba(148,163,187,0.18)",
      tooltipBg: "#1A2332",
      tooltipBorder: "#2D3B4F",
      tooltipText: "#F1F5FB",
    };
  }
  return {
    series: [
      "#0B5FFF", // brand
      "#12B76A", // ok
      "#E8900A", // watch
      "#D92D20", // critical
      "#7C3AED", // púrpura
      "#0891B2", // cian
      "#DB2777", // rosa
      "#EA580C", // naranja
    ],
    qualitative: {
      positive: "#12B76A",
      negative: "#D92D20",
      neutral: "#8B96A8",
      benchmark: "#7C3AED",
      highlight: "#E8900A",
    },
    axis: "#5A6580",
    grid: "rgba(90,101,128,0.15)",
    tooltipBg: "#FFFFFF",
    tooltipBorder: "#E4E8EF",
    tooltipText: "#0F1827",
  };
}

export function colorForLearningOutcome(m, thresholds) {
  const st = normStatus(m?.status);
  if (st === "critico") return COLORS.critical;
  if (st === "en desarrollo" || st === "en seguimiento" || st === "observacion") return COLORS.watch;
  if (st === "optimo" || st === "solido" || st === "óptimo") return COLORS.ok;
  return colorForPct(m?.avgPct, thresholds);
}
