// Vinculador de RAs (resultados de aprendizaje) con evidencias (extraído de TeacherDashboard.jsx, #15).
import { useState, useEffect, useMemo, useCallback } from "react";
import { apiGetCached, apiPost, invalidateApiCache } from "../../utils/api";
import { Card, InfoTooltip } from "./primitives";
const RA_ACTIVITY_TYPE_LABELS = {
  Assignment: "Tarea",
  Quiz: "Cuestionario",
  DiscussionTopic: "Discusión",
  ContentObject: "Contenido",
  QuizQuestion: "Pregunta",
  Checklist: "Lista",
  Survey: "Encuesta",
  SelfAssessment: "Autoeval.",
  LtiLink: "LTI",
};

// Deriva la lista de RA { guid, code, title, description } recorriendo el
// árbol crudo de outcomeSets de Brightspace. Se usa como fallback cuando el
// índice derivado del backend (outcomeIndex/outcomeCodeMap) llega vacío por
// caché obsoleta: el outcomeSets crudo siempre viene fresco en la respuesta.
// Separador amplio: guión ASCII, guiones Unicode (U+2010–2015), signo menos
// (U+2212) o dos puntos. Brightspace a veces usa un guión no-ASCII entre el
// código y el texto, lo que antes rompía la extracción del código.
const RA_CODE_RE = /^([A-Za-z0-9._-]+)\s*[-\u2010-\u2015\u2212:]\s*(.+)$/;
// Normaliza espacios/saltos de línea/NBSP a un solo espacio y elimina
// caracteres invisibles (zero-width, BOM, marcas direccionales) para que el
// regex (cuyo `.` no cruza saltos de línea) encaje siempre.
function normalizeDesc(v) {
  return String(v ?? "")
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function parseOutcomeSetsToList(outcomeSets) {
  const acc = {};
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node !== "object") return;
    const guid = node.SourceId || node.OutcomeId || node.Id || node.id;
    const desc = normalizeDesc(node.Description ?? node.description ?? "");
    if (guid && desc) {
      const key = String(guid);
      if (!acc[key]) {
        const m = desc.match(RA_CODE_RE);
        acc[key] = m
          ? { guid: key, code: m[1].toUpperCase(), title: m[2].trim(), description: desc }
          : { guid: key, code: String(node.ShortCode || "").trim() || key.slice(0, 6), title: desc, description: desc };
      }
    }
    for (const k of ["Outcomes", "outcomes", "SubOutcomes", "subOutcomes", "ChildOutcomes", "childOutcomes", "Children", "children"]) {
      if (node[k]) walk(node[k]);
    }
  };
  walk(outcomeSets);
  return Object.values(acc);
}

// Devuelve {code, title} legibles para un outcome, derivándolos SIEMPRE de la
// descripción "CÓDIGO-texto" (que el backend guarda completa). Así el chip
// muestra el código real (p.ej. L1O1DNR2) y el título aunque el índice del
// backend traiga el code vacío o un fragmento del GUID.
function raParts(o) {
  const desc = normalizeDesc(o?.description ?? o?.title ?? "");
  const m = desc.match(RA_CODE_RE);
  if (m) return { code: m[1].toUpperCase(), title: m[2].trim(), full: desc };
  const code = String(o?.code ?? "").trim();
  // Si el `code` recibido parece un fragmento de GUID (hex de 6), no lo mostramos.
  const cleanCode = /^[0-9a-f]{6}$/i.test(code) ? "" : code;
  return { code: cleanCode, title: desc || code, full: desc || code };
}

// Base pública de Brightspace para deep-links (editor de quizzes, etc.).
const BS_PUBLIC_BASE = (import.meta.env?.VITE_BRIGHTSPACE_BASE_URL || "https://cesa.brightspace.com").replace(/\/$/, "");

// Estilo de pestaña tipo navegador para el switch Tareas | Quizzes del RaLinker.
const raTabStyle = (active) => ({
  display: "inline-flex", alignItems: "center", gap: 7,
  padding: "9px 16px 8px", borderRadius: "10px 10px 0 0",
  border: "1.5px solid var(--border)",
  borderBottom: active ? "1.5px solid var(--card)" : "1.5px solid var(--border)",
  marginBottom: -1.5,
  background: active ? "var(--card)" : "var(--bg)",
  color: active ? "var(--brand)" : "var(--muted)",
  fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font)",
  cursor: "pointer", whiteSpace: "nowrap",
});

export function RaLinker({ orgUnitId, courseName }) {
  const [lo, setLo] = useState(null);
  const [gradeItems, setGradeItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sel, setSel] = useState({});           // key "Type:Id" → [guid,...]
  const [savingKey, setSavingKey] = useState(null);
  const [msg, setMsg] = useState(null);
  const [query, setQuery] = useState("");
  const [raTab, setRaTab] = useState("tasks");  // "tasks" | "quizzes"

  const load = useCallback(async (fresh = false) => {
    if (!orgUnitId) return;
    setLoading(true); setError("");
    try {
      if (fresh) invalidateApiCache(`/gemelo/course/${orgUnitId}/`);
      const [loRes, giRes] = await Promise.allSettled([
        apiGetCached(`/gemelo/course/${orgUnitId}/learning-outcomes`, { force: fresh }),
        apiGetCached(`/gemelo/course/${orgUnitId}/grade-items`, { force: fresh }),
      ]);
      if (loRes.status !== "fulfilled") throw loRes.reason;
      setLo(loRes.value);
      setGradeItems(giRes.status === "fulfilled" ? (giRes.value?.items || []) : []);
    } catch (e) {
      setError(String(e?.message || "No se pudieron cargar los resultados de aprendizaje."));
    } finally {
      setLoading(false);
    }
  }, [orgUnitId]);

  useEffect(() => { load(false); }, [load]);

  // RA seleccionables (todos los del/los conjunto(s) del curso).
  const allOutcomes = useMemo(() => {
    const idx = lo?.outcomeIndex || {};
    let list = Object.entries(idx).map(([guid, info]) => ({ guid, ...(info || {}) }));
    // Fallback: si el índice derivado del backend viene vacío (caché obsoleta tras
    // importar RA), derivamos los RA del outcomeSets crudo, que siempre llega fresco.
    if (list.length === 0 && lo?.outcomeSets) list = parseOutcomeSetsToList(lo.outcomeSets);
    return list.sort((a, b) => String(a.code || a.title || "").localeCompare(String(b.code || b.title || ""), "es", { numeric: true }));
  }, [lo]);

  // Lista unificada de actividades alineables:
  //  1) carpetas de entrega / grade items del gradebook → Assignment:folderId
  //  2) cualquier actividad ya alineada (incluye quizzes) desde activityToOutcomes
  const activities = useMemo(() => {
    const a2o = lo?.activityToOutcomes || {};
    const names = lo?.activityNames || {};
    const byKey = new Map();

    const add = (key, name, type) => {
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, { key, name: name || null, type });
      else if (name && !byKey.get(key).name) byKey.get(key).name = name;
    };

    // 1) Del gradebook: carpetas de entrega (Assignment) y grade items ligados.
    for (const gi of gradeItems) {
      const folderId =
        gi?.source === "dropbox" ? gi?.id
        : gi?.linkedDropboxId != null ? gi.linkedDropboxId
        : null;
      if (folderId != null) add(`Assignment:${folderId}`, gi?.name, "Assignment");
    }

    // 2) Actividades ya alineadas (para no perder quizzes u otros tipos).
    for (const key of Object.keys(a2o)) {
      const type = key.slice(0, key.indexOf(":"));
      add(key, names[key], type);
    }

    return Array.from(byKey.values()).sort((a, b) =>
      String(a.name || a.key).localeCompare(String(b.name || b.key), "es", { numeric: true }));
  }, [lo, gradeItems]);

  // Inicializa selección desde las alineaciones existentes.
  useEffect(() => {
    const a2o = lo?.activityToOutcomes || {};
    const init = {};
    for (const [k, guids] of Object.entries(a2o)) init[k] = Array.isArray(guids) ? [...guids] : [];
    setSel(init);
    setMsg(null);
  }, [lo]);

  const toggleSel = useCallback((key, guid) => {
    setSel(prev => {
      const cur = prev[key] || [];
      const next = cur.includes(guid) ? cur.filter(g => g !== guid) : [...cur, guid];
      return { ...prev, [key]: next };
    });
  }, []);

  const dirty = useCallback((key) => {
    const orig = (lo?.activityToOutcomes || {})[key] || [];
    const cur = sel[key] || [];
    if (orig.length !== cur.length) return true;
    const os = new Set(orig);
    return cur.some(g => !os.has(g));
  }, [lo, sel]);

  const saveActivity = useCallback(async (key) => {
    if (!orgUnitId) return;
    const idx = key.indexOf(":");
    const type = key.slice(0, idx);
    const objectId = key.slice(idx + 1);
    const outcomeIds = sel[key] || [];
    setSavingKey(key); setMsg(null);
    try {
      await apiPost(
        `/gemelo/course/${orgUnitId}/alignments/activity/${type}/${encodeURIComponent(objectId)}`,
        { action: "replace", outcomeIds },
      );
      setMsg({ type: "ok", text: "Vínculo guardado. Los RA de esa actividad se actualizaron." });
      await load(true);
    } catch (e) {
      const raw = String(e?.message || "");
      const forbidden = /403|super|admin|forbidden/i.test(raw);
      setMsg({
        type: "err",
        text: forbidden
          ? "Tu usuario no tiene permiso para escribir alineaciones (actualmente restringido a administradores). Avísale al equipo para habilitar la vinculación a docentes."
          : (raw || "No se pudo guardar el vínculo."),
      });
    } finally {
      setSavingKey(null);
    }
  }, [sel, orgUnitId, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activities;
    return activities.filter(a =>
      String(a.name || a.key).toLowerCase().includes(q) ||
      RA_ACTIVITY_TYPE_LABELS[a.type]?.toLowerCase().includes(q));
  }, [activities, query]);

  // Los quizzes vinculan RA POR PREGUNTA en Brightspace (no a nivel de quiz):
  // una escritura global de quiz devuelve ok:true pero NO tiene efecto real
  // (los alignments efectivos llevan QuestionId). Por eso separamos:
  // tareas/actividades editables vs quizzes de solo lectura.
  const editableAll = useMemo(() => activities.filter(a => a.type !== "Quiz"), [activities]);
  const editableActs = useMemo(() => filtered.filter(a => a.type !== "Quiz"), [filtered]);
  const quizActs = useMemo(() => filtered.filter(a => a.type === "Quiz"), [filtered]);
  const hasQuizzes = useMemo(() => activities.some(a => a.type === "Quiz"), [activities]);

  const linkedCount = useMemo(
    () => editableAll.filter(a => (sel[a.key] || []).length > 0).length,
    [editableAll, sel]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, gap: 10, color: "var(--muted)" }}>
        <span className="pulse-dot" style={{ background: "var(--brand)", width: 10, height: 10 }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Cargando actividades y resultados de aprendizaje…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card accent="critical">
        <div style={{ padding: 8, color: "var(--critical)", fontSize: 13, fontWeight: 600 }}>⚠️ {error}</div>
        <button className="btn" onClick={() => load(true)} style={{ marginTop: 8, fontSize: 12 }}>Reintentar</button>
      </Card>
    );
  }

  const noOutcomes = allOutcomes.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          G.D · Vinculación de RA
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 4 }}>
          Resultados de aprendizaje
        </h1>
        <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
          {courseName || `Curso ${orgUnitId}`} · Elige a qué RA apunta cada actividad para activar la analítica por resultado.
        </div>
      </div>

      {noOutcomes ? (
        <Card accent="watch">
          <div className="empty-state">
            <span className="empty-state-icon">🎯</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Este curso aún no tiene Resultados de Aprendizaje registrados</span>
            <span style={{ fontSize: 12, color: "var(--muted-strong)", textAlign: "center", lineHeight: 1.5, maxWidth: 420, marginTop: 4 }}>
              Primero deben importarse o registrarse los RA del curso en Brightspace. Una vez existan, aquí podrás vincular tus actividades a cada uno.
            </span>
          </div>
        </Card>
      ) : (
        <>
          {/* RA del curso (referencia) */}
          <Card
            title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Resultados de aprendizaje del curso <InfoTooltip text="Estos son los RA definidos para tu curso. Úsalos como referencia al vincular cada actividad." /></span>}
            right={<span className="tag">{allOutcomes.length}</span>}
            accent="brand"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allOutcomes.map(o => {
                const p = raParts(o);
                return (
                  <div key={o.guid}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12.5, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}>
                    {p.code && (
                      <span style={{ flex: "0 0 auto", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color: "var(--brand)", background: "var(--brand-light)", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap", marginTop: 1 }}>
                        {p.code}
                      </span>
                    )}
                    <span style={{ flex: "1 1 auto", color: "var(--text)", fontWeight: 500, lineHeight: 1.5 }}>
                      {p.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Actividades → RA · pestañas tipo navegador: Tareas | Quizzes */}
          <Card>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, borderBottom: "1.5px solid var(--border)", margin: "-2px 0 14px", flexWrap: "wrap" }}>
              <button onClick={() => setRaTab("tasks")} style={raTabStyle(raTab === "tasks")}>
                📋 Vincular tareas y actividades
              </button>
              {hasQuizzes && (
                <button onClick={() => setRaTab("quizzes")} style={raTabStyle(raTab === "quizzes")}>
                  📝 Quizzes
                  <span style={{
                    fontSize: 10, fontWeight: 800, borderRadius: 99, padding: "1px 7px",
                    background: raTab === "quizzes" ? "var(--brand-light)" : "var(--border)",
                    color: raTab === "quizzes" ? "var(--brand)" : "var(--muted)",
                  }}>{quizActs.length}</span>
                </button>
              )}
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, paddingBottom: 9 }}>
                {raTab === "tasks" ? (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: linkedCount > 0 ? "var(--solid)" : "var(--muted)" }}>
                    {linkedCount}/{editableAll.length} vinculadas
                  </span>
                ) : (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted)" }}>RA por pregunta</span>
                )}
                <InfoTooltip text={raTab === "tasks"
                  ? "Para cada tarea o actividad, marca el o los RA que evalúa y presiona Guardar. Un vínculo por actividad; puedes cambiarlo cuando quieras. Los quizzes tienen su propia pestaña porque sus RA se vinculan por pregunta."
                  : "Los RA de un quiz se vinculan pregunta por pregunta desde el editor del quiz en Brightspace, no de forma global. Aquí se muestran los RA que ya miden sus preguntas."} />
              </span>
            </div>

            {raTab === "tasks" && msg && (
              <div style={{
                fontSize: 12.5, borderRadius: 10, padding: "9px 12px", marginBottom: 12,
                display: "flex", alignItems: "center", gap: 8, fontWeight: 600,
                color: msg.type === "ok" ? "var(--solid)" : "var(--critical)",
                background: msg.type === "ok" ? "var(--solid-bg, rgba(16,185,129,0.1))" : "var(--critical-bg, rgba(220,38,38,0.08))",
              }}>
                <span>{msg.type === "ok" ? "✅" : "⚠️"}</span>{msg.text}
              </div>
            )}

            {activities.length > 6 && (
              <input
                type="text"
                placeholder="Buscar actividad…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, marginBottom: 12, outline: "none" }}
              />
            )}

            {raTab === "tasks" && (editableAll.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state-icon">📭</span>
                <span style={{ fontSize: 12.5 }}>No se detectaron tareas o actividades vinculables en este curso.</span>
                <span style={{ fontSize: 11.5, color: "var(--muted-strong)", textAlign: "center", maxWidth: 360, marginTop: 4 }}>
                  Crea tareas (asignaciones) en Brightspace y vuelve aquí para vincularlas a tus RA.
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {editableActs.map(act => {
                  const chosen = sel[act.key] || [];
                  const idx = act.key.indexOf(":");
                  const objectId = act.key.slice(idx + 1);
                  const typeLabel = RA_ACTIVITY_TYPE_LABELS[act.type] || act.type;
                  const isDirty = dirty(act.key);
                  const hasLink = chosen.length > 0;
                  return (
                    <div key={act.key} style={{
                      background: "var(--card)", border: `1px solid ${hasLink ? "var(--brand)" : "var(--border)"}`,
                      borderRadius: 12, padding: "12px 14px", transition: "border-color 0.15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <span style={{ flex: "0 0 auto", fontSize: 10, fontWeight: 800, color: "var(--brand)", background: "var(--brand-light)", padding: "3px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{typeLabel}</span>
                          {act.name
                            ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{act.name}</span>
                            : <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>#{objectId}</span>}
                        </span>
                        <button
                          onClick={() => saveActivity(act.key)}
                          disabled={savingKey === act.key || !isDirty}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "6px 14px", borderRadius: 8, border: "none",
                            cursor: (savingKey === act.key || !isDirty) ? "not-allowed" : "pointer",
                            background: isDirty ? "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)" : "var(--bg)",
                            color: isDirty ? "#fff" : "var(--muted)",
                            fontSize: 12, fontWeight: 800, fontFamily: "var(--font)",
                            opacity: savingKey === act.key ? 0.6 : 1,
                          }}
                        >
                          {savingKey === act.key ? "Guardando…" : isDirty ? "💾 Guardar" : "Guardado"}
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {allOutcomes.map(o => {
                          const on = chosen.includes(o.guid);
                          const p = raParts(o);
                          return (
                            <button
                              key={o.guid}
                              onClick={() => toggleSel(act.key, o.guid)}
                              title={p.full}
                              style={{
                                display: "flex", alignItems: "flex-start", gap: 9, width: "100%",
                                textAlign: "left", fontSize: 12, fontWeight: 600, padding: "8px 11px",
                                borderRadius: 10, cursor: "pointer",
                                border: on ? "1.5px solid var(--brand)" : "1.5px solid var(--border)",
                                background: on ? "var(--brand-light)" : "transparent",
                                color: on ? "var(--text)" : "var(--muted)",
                                transition: "all 0.12s",
                              }}
                            >
                              <span style={{
                                flex: "0 0 auto", marginTop: 1, width: 16, height: 16, borderRadius: 5,
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                fontSize: 11, fontWeight: 900,
                                border: on ? "none" : "1.5px solid var(--border)",
                                background: on ? "var(--brand)" : "transparent",
                                color: on ? "#fff" : "transparent",
                              }}>✓</span>
                              {p.code && (
                                <span style={{ flex: "0 0 auto", fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--brand)", fontSize: 11.5, marginTop: 1 }}>
                                  {p.code}
                                </span>
                              )}
                              <span style={{ flex: "1 1 auto", lineHeight: 1.4 }}>{p.title}</span>
                            </button>
                          );
                        })}
                      </div>
                      {!hasLink && (
                        <div style={{ fontSize: 10.5, color: "var(--muted)", fontStyle: "italic", marginTop: 8 }}>
                          Sin vincular — marca al menos un RA.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Pestaña Quizzes: RA por pregunta (solo lectura + acceso directo a Brightspace) */}
            {raTab === "quizzes" && (
              <>
              <div style={{
                fontSize: 12, borderRadius: 10, padding: "9px 12px", marginBottom: 12,
                display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 600, lineHeight: 1.5,
                color: "var(--watch, #b45309)", background: "var(--watch-bg, rgba(245,158,11,0.1))",
              }}>
                <span>ℹ️</span>
                <span style={{ flex: "1 1 auto" }}>
                  Los quizzes no se vinculan globalmente: en Brightspace cada <b>pregunta</b> del quiz
                  se alinea a su RA (editor del quiz → pregunta → Learning Outcomes). Los RA listados
                  abajo provienen de esas alineaciones por pregunta y se actualizan solos al editarlas.
                </span>
                <a
                  href={`${BS_PUBLIC_BASE}/d2l/lms/quizzing/admin/quizzes_manage.d2l?ou=${orgUnitId}`}
                  target="_blank" rel="noreferrer"
                  style={{
                    flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "6px 12px", borderRadius: 8, textDecoration: "none",
                    background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
                    color: "#fff", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
                  }}
                >
                  Abrir quizzes en Brightspace ↗
                </a>
              </div>

              {quizActs.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", padding: "4px 2px" }}>
                  Ningún quiz coincide con la búsqueda.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {quizActs.map(act => {
                    const idx = act.key.indexOf(":");
                    const objectId = act.key.slice(idx + 1);
                    const typeLabel = RA_ACTIVITY_TYPE_LABELS[act.type] || act.type;
                    const guids = (lo?.activityToOutcomes || {})[act.key] || [];
                    const linked = guids
                      .map(g => allOutcomes.find(o => o.guid === g))
                      .filter(Boolean);
                    return (
                      <div key={act.key} style={{
                        background: "var(--card)", border: `1px solid ${linked.length > 0 ? "var(--brand)" : "var(--border)"}`,
                        borderRadius: 12, padding: "12px 14px",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: linked.length > 0 ? 10 : 0, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span style={{ flex: "0 0 auto", fontSize: 10, fontWeight: 800, color: "var(--watch, #b45309)", background: "var(--watch-bg, rgba(245,158,11,0.12))", padding: "3px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{typeLabel}</span>
                            {act.name
                              ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{act.name}</span>
                              : <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>#{objectId}</span>}
                          </span>
                          <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: linked.length > 0 ? "var(--solid)" : "var(--muted)" }}>
                              {linked.length > 0 ? `${linked.length} RA por pregunta` : "Sin RA en preguntas"}
                            </span>
                            <a
                              href={`${BS_PUBLIC_BASE}/d2l/lms/quizzing/admin/modify/quiz_newedit_properties.d2l?qi=${encodeURIComponent(objectId)}&ou=${orgUnitId}`}
                              target="_blank" rel="noreferrer"
                              title="Abre el editor del quiz en Brightspace para vincular RA a cada pregunta"
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                padding: "5px 11px", borderRadius: 8, textDecoration: "none",
                                border: "1.5px solid var(--brand)", background: "var(--brand-light)",
                                color: "var(--brand)", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap",
                              }}
                            >
                              Vincular en Brightspace ↗
                            </a>
                          </span>
                        </div>
                        {linked.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {linked.map(o => {
                              const p = raParts(o);
                              return (
                                <div key={o.guid} title={p.full} style={{
                                  display: "flex", alignItems: "flex-start", gap: 9,
                                  fontSize: 12, fontWeight: 600, padding: "8px 11px", borderRadius: 10,
                                  border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)",
                                }}>
                                  {p.code && (
                                    <span style={{ flex: "0 0 auto", fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--brand)", fontSize: 11.5, marginTop: 1 }}>
                                      {p.code}
                                    </span>
                                  )}
                                  <span style={{ flex: "1 1 auto", lineHeight: 1.4 }}>{p.title}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10.5, color: "var(--muted)", fontStyle: "italic", marginTop: 8 }}>
                            Vincula RA a las preguntas de este quiz desde Brightspace para verlos aquí.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * =========================
 * Main App
 * =========================
 */
