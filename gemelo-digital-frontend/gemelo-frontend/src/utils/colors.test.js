// Tests de la lógica de coloreo por estado/umbral en utils/colors.js (#16).
import { describe, it, expect } from "vitest";
import { COLORS, colorForRisk, colorForPct, colorForLearningOutcome, chartColorScheme } from "./colors";

describe("colorForRisk", () => {
  it("mapea riesgos a colores del sistema", () => {
    expect(colorForRisk("alto")).toBe(COLORS.critical);
    expect(colorForRisk("Crítico")).toBe(COLORS.pending); // "crítico" con tilde no matchea "critico"
    expect(colorForRisk("critico")).toBe(COLORS.critical);
    expect(colorForRisk("medio")).toBe(COLORS.watch);
    expect(colorForRisk("bajo")).toBe(COLORS.ok);
    expect(colorForRisk("")).toBe(COLORS.pending);
    expect(colorForRisk(null)).toBe(COLORS.pending);
  });
});

describe("colorForPct", () => {
  it("usa umbrales por defecto 50/70", () => {
    expect(colorForPct(30)).toBe(COLORS.critical);
    expect(colorForPct(60)).toBe(COLORS.watch);
    expect(colorForPct(70)).toBe(COLORS.ok);
    expect(colorForPct(95)).toBe(COLORS.ok);
  });
  it("respeta umbrales personalizados del curso", () => {
    const thr = { critical: 60, watch: 80 };
    expect(colorForPct(65, thr)).toBe(COLORS.watch);
    expect(colorForPct(85, thr)).toBe(COLORS.ok);
  });
  it("pending para valores nulos", () => {
    expect(colorForPct(null)).toBe(COLORS.pending);
    expect(colorForPct("abc")).toBe(COLORS.pending);
  });
});

describe("colorForLearningOutcome", () => {
  it("prioriza el status explícito sobre el pct", () => {
    expect(colorForLearningOutcome({ status: "critico", avgPct: 95 })).toBe(COLORS.critical);
    expect(colorForLearningOutcome({ status: "en desarrollo", avgPct: 95 })).toBe(COLORS.watch);
    expect(colorForLearningOutcome({ status: "optimo", avgPct: 10 })).toBe(COLORS.ok);
  });
  it("cae a colorForPct sin status conocido", () => {
    expect(colorForLearningOutcome({ status: "", avgPct: 30 })).toBe(COLORS.critical);
    expect(colorForLearningOutcome(null)).toBe(COLORS.pending);
  });
});

describe("chartColorScheme", () => {
  it("devuelve 8 colores de serie en ambos modos", () => {
    expect(chartColorScheme(false).series).toHaveLength(8);
    expect(chartColorScheme(true).series).toHaveLength(8);
  });
  it("los modos light y dark difieren", () => {
    expect(chartColorScheme(false).tooltipBg).not.toBe(chartColorScheme(true).tooltipBg);
  });
});
