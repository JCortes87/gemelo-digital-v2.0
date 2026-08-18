// Tests de las funciones puras de negocio en utils/helpers.js (#16).
// Corren con `npm test` (vitest). Sin DOM: son funciones puras.
import { describe, it, expect } from "vitest";
import {
  toDate,
  weeksBetween,
  clamp,
  normStatus,
  fmtPct,
  fmtGrade10FromPct,
  flattenOutcomeDescriptions,
  isVisibleContentItem,
  safeAvg,
  pickCriticalMacroFromGemelo,
  computeRiskFromPct,
  suggestRouteForStudent,
  contentRhythmStatus,
  fileTypeFromUrl,
  contentTypeLabel,
  countEducationalResources,
  parseFormulaReferences,
  detectCortePeriod,
  buildCorteGroups,
  matchEvidencesByFormula,
} from "./helpers";

describe("toDate", () => {
  it("convierte fechas válidas", () => {
    expect(toDate("2026-01-15")).toBeInstanceOf(Date);
  });
  it("devuelve null para inválidas/vacías", () => {
    expect(toDate(null)).toBeNull();
    expect(toDate("")).toBeNull();
    expect(toDate("no-es-fecha")).toBeNull();
  });
});

describe("weeksBetween", () => {
  it("calcula semanas entre dos fechas", () => {
    const a = new Date("2026-01-01");
    const b = new Date("2026-01-15");
    expect(weeksBetween(a, b)).toBeCloseTo(2, 5);
  });
  it("no devuelve negativos si end < start", () => {
    const a = new Date("2026-01-15");
    const b = new Date("2026-01-01");
    expect(weeksBetween(a, b)).toBe(0);
  });
  it("devuelve 0 si falta alguna fecha", () => {
    expect(weeksBetween(null, new Date())).toBe(0);
  });
});

describe("clamp", () => {
  it("limita dentro del rango", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("normStatus", () => {
  it("normaliza a minúsculas y sin espacios", () => {
    expect(normStatus("  Crítico ")).toBe("crítico");
    expect(normStatus(null)).toBe("");
  });
});

describe("fmtPct / fmtGrade10FromPct", () => {
  it("formatea porcentajes con un decimal", () => {
    expect(fmtPct(85.25)).toBe("85.3%");
    expect(fmtPct(0)).toBe("0.0%");
  });
  it("devuelve em-dash para nulos/NaN", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct(undefined)).toBe("—");
    expect(fmtPct("abc")).toBe("—");
  });
  it("convierte pct a escala 0-10", () => {
    expect(fmtGrade10FromPct(85)).toBe("8.5");
    expect(fmtGrade10FromPct(null)).toBe("—");
  });
});

describe("computeRiskFromPct", () => {
  it("clasifica riesgo con los umbrales por defecto (50/70)", () => {
    expect(computeRiskFromPct(30)).toBe("alto");
    expect(computeRiskFromPct(49.9)).toBe("alto");
    expect(computeRiskFromPct(50)).toBe("medio");
    expect(computeRiskFromPct(69.9)).toBe("medio");
    expect(computeRiskFromPct(70)).toBe("bajo");
    expect(computeRiskFromPct(100)).toBe("bajo");
  });
  it("devuelve pending para valores nulos o no numéricos", () => {
    expect(computeRiskFromPct(null)).toBe("pending");
    expect(computeRiskFromPct(undefined)).toBe("pending");
    expect(computeRiskFromPct("x")).toBe("pending");
  });
});

describe("safeAvg", () => {
  it("promedia ignorando no-números", () => {
    expect(safeAvg([10, 20, "30", null, "abc"])).toBe(20);
  });
  it("devuelve null para lista vacía o sin números", () => {
    expect(safeAvg([])).toBeNull();
    expect(safeAvg(["a", null])).toBeNull();
    expect(safeAvg("no-array")).toBeNull();
  });
});

describe("pickCriticalMacroFromGemelo", () => {
  it("elige la macro con menor pct", () => {
    const g = { macro: { units: [
      { code: "M1", pct: 80 },
      { code: "M2", pct: 45 },
      { code: "M3", pct: 60 },
    ] } };
    expect(pickCriticalMacroFromGemelo(g)).toEqual({ code: "M2", pct: 45 });
  });
  it("devuelve null sin datos", () => {
    expect(pickCriticalMacroFromGemelo(null)).toBeNull();
    expect(pickCriticalMacroFromGemelo({ macro: { units: [] } })).toBeNull();
  });
});

describe("isVisibleContentItem", () => {
  it("oculta items IsHidden o Type 0 (módulos)", () => {
    expect(isVisibleContentItem({ IsHidden: true, Type: 1 })).toBe(false);
    expect(isVisibleContentItem({ Type: 0 })).toBe(false);
    expect(isVisibleContentItem({ Type: 1 })).toBe(true);
    expect(isVisibleContentItem(null)).toBe(false);
  });
});

describe("contentRhythmStatus", () => {
  it("mapea ratio de progreso a estado", () => {
    expect(contentRhythmStatus(null).status).toBe("pending");
    expect(contentRhythmStatus(0.5).status).toBe("critico");
    expect(contentRhythmStatus(0.9).status).toBe("observacion");
    expect(contentRhythmStatus(1.0).status).toBe("solido");
  });
});

describe("flattenOutcomeDescriptions", () => {
  it("aplana outcomeSets con Outcomes anidados", () => {
    const payload = { outcomeSets: [
      { Outcomes: [
        { Description: "RA1" },
        { Description: "RA2", SubOutcomes: [{ Description: "RA2.1" }] },
      ] },
    ] };
    expect(flattenOutcomeDescriptions(payload)).toEqual(["RA1", "RA2", "RA2.1"]);
  });
  it("acepta array plano y deduplica ignorando mayúsculas", () => {
    const payload = [{ description: "ra x" }, { Description: "RA X" }];
    expect(flattenOutcomeDescriptions(payload)).toEqual(["ra x"]);
  });
  it("devuelve [] sin payload", () => {
    expect(flattenOutcomeDescriptions(null)).toEqual([]);
  });
});

describe("suggestRouteForStudent", () => {
  const thresholds = { critical: 50, watch: 70 };
  it("Ruta 0 cuando la cobertura de evidencia es < 40%", () => {
    const s = { risk: "alto", coveragePct: 20 };
    expect(suggestRouteForStudent(s, thresholds).id).toBe("route_coverage");
  });
  it("Ruta 1 para riesgo alto", () => {
    const s = { risk: "Alto", coveragePct: 80 };
    expect(suggestRouteForStudent(s, thresholds).id).toBe("route_high_risk");
  });
  it("Ruta 2 para riesgo medio o desempeño bajo el umbral watch", () => {
    expect(suggestRouteForStudent({ risk: "medio" }, thresholds).id).toBe("route_watch");
    expect(
      suggestRouteForStudent({ risk: "bajo", currentPerformancePct: 65 }, thresholds).id
    ).toBe("route_watch");
  });
  it("Ruta 3 para estudiantes sin señales de riesgo", () => {
    const s = { risk: "bajo", currentPerformancePct: 90, coveragePct: 90 };
    expect(suggestRouteForStudent(s, thresholds).id).toBe("route_ok");
  });
});

describe("detectCortePeriod", () => {
  it("detecta 'Corte N'", () => {
    expect(detectCortePeriod("Corte 1")).toBe(1);
    expect(detectCortePeriod("CORTE 3")).toBe(3);
  });
  it("detecta ordinales y palabras", () => {
    expect(detectCortePeriod("Primer corte")).toBe(1);
    expect(detectCortePeriod("Tercer Corte")).toBe(3);
    expect(detectCortePeriod("Corte dos")).toBe(2);
  });
  it("NO detecta 'C1 - Tareas' (conflicto con categorías reales)", () => {
    expect(detectCortePeriod("C1 - Tareas")).toBeNull();
    expect(detectCortePeriod("Quizzes")).toBeNull();
    expect(detectCortePeriod(null)).toBeNull();
  });
});

describe("parseFormulaReferences", () => {
  it("extrae nombres de evidencias de una fórmula Brightspace", () => {
    const f = "AVG{ [Actividad I-1 - IA.Puntos recibidos], [Actividad I-2.Puntos recibidos] }";
    expect(parseFormulaReferences(f)).toEqual(["Actividad I-1 - IA", "Actividad I-2"]);
  });
  it("deduplica referencias y tolera entradas no válidas", () => {
    const f = "[Tarea A.Points Received] + [Tarea A.Points Received]";
    expect(parseFormulaReferences(f)).toEqual(["Tarea A"]);
    expect(parseFormulaReferences(null)).toEqual([]);
    expect(parseFormulaReferences(123)).toEqual([]);
  });
});

describe("buildCorteGroups", () => {
  const ev = (id, name, extra = {}) => ({ gradeObjectId: id, name, ...extra });

  it("agrupa por categorías 'Corte N' cuando existen", () => {
    const evidences = [
      ev(1, "Actividad 1"),
      ev(2, "Actividad 2"),
      ev(3, "Corte 1", { isCorte: true }),
      ev(4, "Tarea suelta"),
    ];
    const cats = [
      { id: 10, name: "Corte 1", itemIds: [1, 2, 3] },
      { id: 11, name: "Tareas", itemIds: [4] }, // categoría no-corte → se omite
    ];
    const groups = buildCorteGroups(evidences, cats);
    expect(groups).toHaveLength(1);
    expect(groups[0].period).toBe(1);
    expect(groups[0].aggregates.map((e) => e.gradeObjectId)).toEqual([3]);
    expect(groups[0].components.map((e) => e.gradeObjectId)).toEqual([1, 2]);
  });

  it("sin categorías: agrupa por orden de API (rollup cierra el bucket)", () => {
    const evidences = [
      ev(1, "Act I-1"),
      ev(2, "Act I-2"),
      ev(3, "Corte 1", { isCorte: true }),
      ev(4, "Act II-1"),
      ev(5, "Corte 2", { isCorte: true }),
      ev(6, "Act suelta"),
    ];
    const groups = buildCorteGroups(evidences, []);
    expect(groups).toHaveLength(3);
    expect(groups[0].components.map((e) => e.gradeObjectId)).toEqual([1, 2]);
    expect(groups[1].components.map((e) => e.gradeObjectId)).toEqual([4]);
    expect(groups[2].id).toBe("tail-unassigned");
    expect(groups[2].components.map((e) => e.gradeObjectId)).toEqual([6]);
  });

  it("devuelve [] sin evidencias o sin rollups", () => {
    expect(buildCorteGroups([], [])).toEqual([]);
    expect(buildCorteGroups([ev(1, "Act 1")], [])).toEqual([]);
  });
});

describe("matchEvidencesByFormula", () => {
  it("empareja por nombre exacto, prefijo o inclusión", () => {
    const all = [
      { gradeObjectId: 1, name: "Actividad I-1 - IA y Derechos" },
      { gradeObjectId: 2, name: "Actividad I-2" },
    ];
    const corte = { formula: "AVG{ [Actividad I-1 - IA y Derechos.Puntos recibidos], [Actividad I-2.Puntos recibidos] }" };
    expect(matchEvidencesByFormula(corte, all).map((e) => e.gradeObjectId)).toEqual([1, 2]);
  });
  it("devuelve [] sin fórmula", () => {
    expect(matchEvidencesByFormula({}, [])).toEqual([]);
  });
});

describe("fileTypeFromUrl", () => {
  it("clasifica archivos por extensión", () => {
    expect(fileTypeFromUrl("/content/enforced/1/guia.pdf")).toBe("PDF");
    expect(fileTypeFromUrl("/c/notas.docx")).toBe("Word");
    expect(fileTypeFromUrl("/c/datos.xlsx")).toBe("Excel");
    expect(fileTypeFromUrl("/c/mapa.png")).toBe("Imágenes");
    expect(fileTypeFromUrl("/c/audio.mp3")).toBe("Audios");
    expect(fileTypeFromUrl("/c/clase.mp4")).toBe("Videos");
  });
  it("reconoce el .pdf en quicklinks con query string", () => {
    expect(fileTypeFromUrl("/d2l/common/dialogs/quicklink/quicklink.d2l?ou=1&type=coursefile&fileid=docs/guia.pdf")).toBe("PDF");
  });
  it("NO clasifica .html ni páginas web", () => {
    expect(fileTypeFromUrl("/content/enforced/1/pagina.html")).toBeNull();
    expect(fileTypeFromUrl("https://ejemplo.com/articulo")).toBeNull();
    expect(fileTypeFromUrl("")).toBeNull();
    expect(fileTypeFromUrl(null)).toBeNull();
  });
});

describe("contentTypeLabel", () => {
  it("HTML: solo páginas internas creadas en Brightspace", () => {
    expect(contentTypeLabel("Acerca del CESA", "/content/enforced/1/acerca.html", 1)).toBe("HTML");
  });
  it("un enlace a una página web externa es Enlace aunque termine en .html", () => {
    expect(contentTypeLabel("Noticia", "https://ejemplo.com/nota.html", 3)).toBe("Enlace");
    expect(contentTypeLabel("Sitio", "https://ejemplo.com/", 3)).toBe("Enlace");
  });
  it("un enlace a un archivo cuenta por su tipo de archivo", () => {
    expect(contentTypeLabel("Guía", "https://ejemplo.com/guia.pdf", 3)).toBe("PDF");
    expect(contentTypeLabel("Datos", "https://ejemplo.com/datos.xlsx", 3)).toBe("Excel");
  });
  it("archivos del curso por su extensión", () => {
    expect(contentTypeLabel("Guía", "/content/enforced/1/guia.pdf", 1)).toBe("PDF");
  });
  it("cae al título si no hay URL", () => {
    expect(contentTypeLabel("resumen.pdf", null, null)).toBe("PDF");
    expect(contentTypeLabel("pagina.html", null, null)).toBe("HTML");
    expect(contentTypeLabel("Enlace al foro", null, null)).toBe("Enlace");
    expect(contentTypeLabel("Bienvenida", null, null)).toBe("Otros");
  });
});

describe("countEducationalResources", () => {
  const page = (id, url, links) => ({ Id: id, Title: `P${id}`, Url: url, TopicType: 1, EmbeddedLinks: links });
  it("cuenta topics visibles y excluye ocultos", () => {
    const r = countEducationalResources([
      { Id: 1, Title: "a", Url: "/c/a.pdf", TopicType: 1 },
      { Id: 2, Title: "b", Url: "/c/b.pdf", TopicType: 1, IsHidden: true },
    ]);
    expect(r.total).toBe(1);
    expect(r.breakdown).toEqual([{ label: "PDF", count: 1 }]);
  });
  it("una página con 7 PDFs enlazados suma la página y los 7 PDFs", () => {
    const links = Array.from({ length: 7 }, (_, i) => `/content/enforced/1/pdf${i}.pdf`);
    const r = countEducationalResources([page(1, "/content/enforced/1/pagina.html", links)]);
    expect(r.total).toBe(8);
    expect(r.breakdown).toEqual([
      { label: "PDF", count: 7 },
      { label: "HTML", count: 1 },
    ]);
  });
  it("los enlaces a sitios web dentro de una página NO cuentan", () => {
    const r = countEducationalResources([
      page(1, "/c/p.html", ["https://ejemplo.com/articulo", "/c/guia.pdf"]),
    ]);
    expect(r.total).toBe(2); // la página + el PDF
  });
  it("dedupe: mismo archivo en dos páginas cuenta una vez", () => {
    const r = countEducationalResources([
      page(1, "/c/p1.html", ["/c/guia.pdf"]),
      page(2, "/c/p2.html", ["/c/guia.pdf"]),
    ]);
    expect(r.total).toBe(3); // 2 páginas + 1 PDF
  });
  it("dedupe: archivo enlazado que además es recurso propio cuenta una vez", () => {
    const r = countEducationalResources([
      { Id: 1, Title: "Guía", Url: "/c/guia.pdf", TopicType: 1 },
      page(2, "/c/p.html", ["/c/guia.pdf"]),
    ]);
    expect(r.total).toBe(2); // el PDF (como recurso) + la página
  });
  it("los EmbeddedLinks de páginas ocultas no cuentan", () => {
    const r = countEducationalResources([
      { ...page(1, "/c/p.html", ["/c/guia.pdf"]), IsHidden: true },
    ]);
    expect(r.total).toBe(0);
  });
  it("lista vacía o null", () => {
    expect(countEducationalResources([]).total).toBe(0);
    expect(countEducationalResources(null).total).toBe(0);
  });
});
