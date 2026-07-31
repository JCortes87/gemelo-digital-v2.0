// @vitest-environment jsdom
// Smoke test del refactor #15: verifica que los módulos extraídos de
// TeacherDashboard.jsx importan sin errores, exportan lo esperado y que
// los átomos de UI renderizan en jsdom. Detecta imports rotos, exports
// faltantes y ciclos de importación que el build no siempre revela.
import { describe, it, expect } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";

describe("módulos extraídos: exports completos", () => {
  it("dashboardStyles exporta injectStyles y la inyecta una sola vez", async () => {
    const m = await import("./dashboardStyles");
    expect(typeof m.injectStyles).toBe("function");
    m.injectStyles();
    m.injectStyles(); // idempotente
    expect(document.querySelectorAll("#gemelo-styles")).toHaveLength(1);
  });

  it("primitives exporta los 10 átomos", async () => {
    const m = await import("./primitives");
    for (const name of [
      "StatusBadge", "CircularRing", "ThresholdsModal", "Card", "Stat",
      "Divider", "ProgressBar", "InfoTooltip", "SortTh", "CoverageBars",
    ]) {
      expect(m[name], name).toBeDefined();
    }
  });

  it("panels exporta los 13 bloques", async () => {
    const m = await import("./panels");
    for (const name of [
      "LoginScreen", "CesaLoader", "UnlinkedItemsList", "AlertsPanel", "Drawer",
      "ProjectionBlock", "NoRaMappingNotice", "QualityFlagsBlock",
      "PendingItemsBlock", "EvidencesTimeline", "CoursePanel", "StudentCard",
      "GradeDistributionCard",
    ]) {
      expect(typeof m[name], name).toBe("function");
    }
  });

  it("layout, modals, onboarding y RaLinker exportan sus componentes", async () => {
    const layout = await import("./layout");
    expect(typeof layout.AppSidebar).toBe("function");
    expect(typeof layout.AppTopbar).toBe("function");
    const modals = await import("./modals");
    expect(typeof modals.BugReportModal).toBe("function");
    expect(typeof modals.FloatingAI).toBe("function");
    const onboarding = await import("./onboarding");
    expect(typeof onboarding.AnnouncementsModal).toBe("function");
    expect(typeof onboarding.OnboardingTutorial).toBe("function");
    const ra = await import("./RaLinker");
    expect(typeof ra.RaLinker).toBe("function");
  });

  it("TeacherDashboard (página completa) importa sin errores", async () => {
    const m = await import("../TeacherDashboard");
    expect(typeof m.default).toBe("function");
  });
});

describe("átomos de UI renderizan en jsdom", () => {
  const render = async (element) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);
    await new Promise((resolve) => {
      // React 19: render es async; flush con un microtask + rAF simulado
      root.render(element);
      setTimeout(resolve, 0);
    });
    return { div, root };
  };

  it("Card renderiza título y contenido", async () => {
    const { Card } = await import("./primitives");
    const { div } = await render(
      React.createElement(Card, { title: "Mi tarjeta" }, "contenido-x")
    );
    expect(div.textContent).toContain("Mi tarjeta");
    expect(div.textContent).toContain("contenido-x");
  });

  it("Stat renderiza label y valor", async () => {
    const { Stat } = await import("./primitives");
    const { div } = await render(
      React.createElement(Stat, { label: "Promedio", value: "85%" })
    );
    expect(div.textContent).toContain("Promedio");
    expect(div.textContent).toContain("85%");
  });

  it("StatusBadge renderiza el estado", async () => {
    const { StatusBadge } = await import("./primitives");
    const { div } = await render(React.createElement(StatusBadge, { status: "critico" }));
    expect(div.textContent.length).toBeGreaterThan(0);
  });

  it("ProgressBar y CircularRing renderizan sin lanzar", async () => {
    const { ProgressBar, CircularRing } = await import("./primitives");
    await render(React.createElement(ProgressBar, { value: 65, color: "#0B5FFF" }));
    await render(React.createElement(CircularRing, { pct: 72, label: "RA1" }));
  });
});
