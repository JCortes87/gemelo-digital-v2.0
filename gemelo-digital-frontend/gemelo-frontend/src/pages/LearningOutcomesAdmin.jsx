import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, LayoutGrid, Loader2, Target, ListChecks, CheckCircle2,
  AlertTriangle, RefreshCw, Pencil, Save, Plus, ChevronDown, ChevronUp,
  TrendingUp, BookOpen, ArrowLeft, Upload, Download,
} from "lucide-react";
import { apiGet, apiPost, apiPut, mapLimit } from "../utils/api";
import { injectStyles } from "../styles/global";

// ────────────────────────────────────────────────────────────────
// Resultados de aprendizaje (RA) — herramienta de administración.
// Página independiente (Super Admin) extraída de RoleHome para tener
// más espacio de trabajo. Consulta el registro global de RA del tenant,
// localiza cursos por semestre y revisa/edita alineaciones por curso.
// ────────────────────────────────────────────────────────────────

// Tipos de actividad que Brightspace acepta para alinear RAs.
const ALIGN_ACTIVITY_TYPES = [
  "Assignment", "Quiz", "DiscussionTopic", "ContentObject",
  "QuizQuestion", "Checklist", "Survey", "SelfAssessment", "LtiLink",
];

// Etiquetas legibles (ES) por tipo de actividad.
const ACTIVITY_TYPE_LABELS = {
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

// Deriva la lista de RA directamente del outcomeSets crudo (siempre llega
// fresco desde Brightspace), como fallback cuando el índice derivado del
// backend viene vacío por caché obsoleta tras importar RA.
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
          ? { guid: key, id: key, code: m[1].toUpperCase(), title: m[2].trim(), description: desc }
          : { guid: key, id: key, code: String(node.ShortCode || "").trim() || key.slice(0, 6), title: desc, description: desc };
      }
    }
    for (const k of ["Outcomes", "outcomes", "SubOutcomes", "subOutcomes", "ChildOutcomes", "childOutcomes", "Children", "children"]) {
      if (node[k]) walk(node[k]);
    }
  };
  walk(outcomeSets);
  return Object.values(acc);
}

// Devuelve {code, title} legibles derivándolos SIEMPRE de la descripción
// "CÓDIGO-texto", así el chip muestra el código real (p.ej. L1O1DNR2) aunque
// el índice del backend traiga el code vacío o un fragmento del GUID.
function raParts(o) {
  const desc = normalizeDesc(o?.description ?? o?.title ?? "");
  const m = desc.match(RA_CODE_RE);
  if (m) return { code: m[1].toUpperCase(), title: m[2].trim(), full: desc };
  const code = String(o?.code ?? "").trim();
  // Si el `code` recibido parece un fragmento de GUID (hex de 6), no lo mostramos.
  const cleanCode = /^[0-9a-f]{6}$/i.test(code) ? "" : code;
  return { code: cleanCode, title: desc || code, full: desc || code };
}

const chipStyle = {
  display: "inline-flex", alignItems: "center", gap: 6,
  fontSize: 11.5, fontWeight: 700, padding: "6px 11px", borderRadius: 999,
  background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)",
};

// ── Plantilla CSV de creación masiva de RA ──────────────────────────────────
// Divide una línea CSV respetando comillas dobles ("" = comilla escapada).
function splitCsvLine(line, delim) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// Parser tolerante de la plantilla: detecta el delimitador (; , o tab),
// exige encabezado con columnas conjunto/codigo/titulo (acentos opcionales)
// y agrupa las filas por conjunto. Devuelve { sets, errors }.
function parseRaTemplate(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const lines = clean.split(/\r\n|\n|\r/).filter(l => l.trim() !== "");
  if (lines.length === 0) return { sets: [], errors: ["El archivo está vacío."] };
  const first = lines[0];
  const delim = [";", ",", "\t"]
    .map(d => ({ d, n: splitCsvLine(first, d).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (delim.n < 2) {
    return { sets: [], errors: ["No se reconoce el formato: la primera fila debe ser el encabezado conjunto;codigo;titulo (separado por ; o ,)."] };
  }
  const header = splitCsvLine(first, delim.d).map(h => normalizeDesc(h).toLowerCase());
  const idxOf = (...names) => header.findIndex(h => names.some(n => h.includes(n)));
  const iSet = idxOf("conjunto", "set", "asignatura");
  const iCode = idxOf("codigo", "código", "code");
  const iTitle = idxOf("titulo", "título", "descripcion", "descripción", "title");
  if (iCode < 0 || iTitle < 0) {
    return { sets: [], errors: ["Encabezado no reconocido: se esperan las columnas conjunto, codigo y titulo (la plantilla descargable ya las trae)."] };
  }
  const errors = [];
  const byName = new Map();
  for (let li = 1; li < lines.length; li++) {
    const cols = splitCsvLine(lines[li], delim.d);
    const setName = normalizeDesc((iSet >= 0 ? cols[iSet] : "") || "") || "RA importados (Gemelo)";
    const code = normalizeDesc(cols[iCode] || "").toUpperCase();
    const title = normalizeDesc(cols[iTitle] || "");
    if (!code && !title) continue; // fila vacía
    if (!code) { errors.push(`Fila ${li + 1}: falta el código.`); continue; }
    if (!/^[A-Za-z0-9._-]+$/.test(code)) {
      errors.push(`Fila ${li + 1}: código inválido "${code}" (sin espacios; solo letras, números, punto, guión y guión bajo).`);
      continue;
    }
    if (!title) { errors.push(`Fila ${li + 1}: falta el título del RA "${code}".`); continue; }
    if (!byName.has(setName)) byName.set(setName, []);
    const rows = byName.get(setName);
    if (rows.some(r => r.code === code)) {
      errors.push(`Fila ${li + 1}: código duplicado "${code}" en el conjunto "${setName}".`);
      continue;
    }
    rows.push({ code, title });
  }
  const sets = Array.from(byName.entries()).map(([name, rows]) => ({ name, rows }));
  return { sets: sets.filter(s => s.rows.length > 0), errors };
}

// Metadatos visuales por estado de RA de una oferta (para badges y filtros).
const STATUS_META = {
  sinRA:      { label: "Sin RA",      color: "#dc2626",     bg: "rgba(220,38,38,0.1)",   border: "rgba(220,38,38,0.3)" },
  sinAlinear: { label: "Sin alinear", color: "#d97706",     bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.3)" },
  alineado:   { label: "Alineado",    color: "#059669",     bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.3)" },
  error:      { label: "Error",       color: "var(--muted)", bg: "var(--bg)",             border: "var(--border)" },
};

// Clasifica un descendiente por su tipo: oferta de curso vs grupo (sección).
function classifyCourseUnit(typeName) {
  const t = (typeName || "").toLowerCase();
  if (t.includes("oferta")) return "offering";
  if (t.includes("grupo") || t.includes("section")) return "group";
  return "other";
}

// Clasifica una unidad de la búsqueda (usa typeId + typeName). Los semestres
// son contenedores → "Ver cursos"; las ofertas llevan RA → "Ver RA"; los grupos
// son secciones hijas sin RA propios.
function classifyUnit(u) {
  const t = (u?.typeName || "").toLowerCase();
  if (Number(u?.typeId) === 5 || t.includes("semestre") || t.includes("semester")) return "semester";
  if (t.includes("oferta")) return "offering";
  if (t.includes("grupo") || t.includes("section")) return "group";
  return "other";
}

// ────────────────────────────────────────────────────────────────
// Auto-emparejador (Opción A): dado el nombre de un curso "Sin RA",
// sugiere el conjunto de RA org-level que mejor coincide (de los ~137).
// Los conjuntos se nombran "NOMBRE ASIGNATURA-ZZ#" (ZZ=código asignatura,
// #=1 pregrado / 2 posgrado / 3 flexibilización). Normalizamos ambos lados
// (sin tildes, mayúsculas, sin puntuación ni stopwords) y puntuamos por
// solapamiento de tokens + bonus si el nombre de la asignatura es substring.
// ────────────────────────────────────────────────────────────────
const MATCH_STOPWORDS = new Set([
  "DE", "DEL", "LA", "EL", "LOS", "LAS", "Y", "A", "E", "O", "U", "EN",
  "PARA", "CON", "POR", "SIN", "AL", "SE", "UN", "UNA", "SU",
]);

function normSubject(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita tildes
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function subjectTokens(s) {
  return normSubject(s)
    .split(" ")
    .filter(t => t.length > 1 && !MATCH_STOPWORDS.has(t));
}

// Quita el sufijo "-ZZ#" (guion + 2-4 letras + dígito) del nombre del conjunto.
function stripSetSuffix(name) {
  return (name || "").replace(/[-–—]\s*[A-Za-z]{2,4}\d\s*$/, "").trim();
}

// Puntúa qué tan bien un conjunto (setName) coincide con un curso (courseName).
// Devuelve [0..~1.5]: fracción de tokens del conjunto presentes en el curso,
// + 0.5 de bonus si el nombre completo de la asignatura aparece como substring.
function scoreSetMatch(courseName, setName) {
  const courseSet = new Set(subjectTokens(courseName));
  const stripped = stripSetSuffix(setName);
  const setToks = subjectTokens(stripped);
  if (setToks.length === 0 || courseSet.size === 0) return 0;
  let hits = 0;
  for (const t of setToks) if (courseSet.has(t)) hits += 1;
  let score = hits / setToks.length;
  const sn = normSubject(stripped);
  const cn = normSubject(courseName);
  if (sn && cn.includes(sn)) score += 0.5;        // asignatura completa dentro del curso
  else if (sn && sn.includes(cn) && cn.length > 3) score += 0.25;
  return score;
}

// Ordena el catálogo por afinidad con el curso y devuelve las mejores opciones
// con puntaje > 0. `limit` opciones (por defecto 6).
function suggestSetsForCourse(courseName, catalogSummary, limit = 6) {
  const rows = (catalogSummary || [])
    .map(s => ({ ...s, score: scoreSetMatch(courseName, s.name) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return rows.slice(0, limit);
}

// Panel del emparejador (Opción A): sugerencias + búsqueda manual + dry-run/import.
// Reutilizable: se muestra tanto bajo un curso "Sin RA" en la Fase 2 como en la
// vista de detalle "Ver RA" cuando el curso no tiene RA. `matcher` es el estado
// compartido; `onToggle/onQuery/onRun` son los handlers del componente padre.
function MatcherPanel({ matcher, impCatalog, onToggle, onQuery, onRun }) {
  if (!matcher) return null;
  const mSelIds = Object.keys(matcher.selected).filter(k => matcher.selected[k]);
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {matcher.loading ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12.5, fontWeight: 600 }}>
          <Loader2 size={14} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> Buscando la asignatura que coincide…
        </div>
      ) : (
      <>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>
          Conjuntos sugeridos {matcher.suggestions.length > 0 ? `(${matcher.suggestions.length})` : ""}
        </div>
        {matcher.suggestions.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            No hubo coincidencia automática con el nombre del curso. Busca abajo la asignatura por nombre o código y márcala.
          </div>
        )}
        {matcher.suggestions.map((s, i) => {
          const on = !!matcher.selected[s.importId];
          const pct = Math.min(100, Math.round((s.score / 1.5) * 100));
          const strong = s.score >= 0.9, mid = s.score >= 0.5;
          const badge = strong ? { t: "coincidencia muy alta", c: "#059669" } : mid ? { t: "coincidencia alta", c: "#0284c7" } : { t: "coincidencia parcial", c: "#d97706" };
          return (
            <label key={s.importId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand-light)" : "var(--card)" }}>
              <input type="checkbox" checked={on} onChange={() => onToggle(s.importId)} style={{ width: 16, height: 16, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i === 0 && <span style={{ color: "var(--brand)", fontWeight: 900 }}>★ </span>}{s.name}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span>{s.outcomeCount ?? "?"} RA</span>
                  <span style={{ color: badge.c, fontWeight: 800 }}>● {badge.t} ({pct}%)</span>
                </div>
              </div>
            </label>
          );
        })}

        <input
          type="text"
          placeholder="¿No es la correcta? Busca otra asignatura por nombre o código…"
          value={matcher.query}
          onChange={e => onQuery(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "7px 11px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 12, fontFamily: "var(--font)", outline: "none" }}
        />
        {matcher.query.trim() && (
          <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {(impCatalog?.summary || [])
              .filter(s => {
                const q = matcher.query.trim().toLowerCase();
                return (s.name || "").toLowerCase().includes(q) || (s.importId || "").toLowerCase().includes(q);
              })
              .slice(0, 40)
              .map(s => {
                const on = !!matcher.selected[s.importId];
                return (
                  <label key={s.importId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 9px", borderRadius: 7, cursor: "pointer", border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand-light)" : "var(--card)" }}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(s.importId)} style={{ width: 15, height: 15, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--muted)" }}>{s.outcomeCount ?? "?"} RA</span>
                  </label>
                );
              })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
          <button
            onClick={() => onRun(true)}
            disabled={!!matcher.running || mSelIds.length === 0}
            style={{ padding: "7px 13px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: (matcher.running || mSelIds.length === 0) ? "not-allowed" : "pointer", opacity: (mSelIds.length === 0) ? 0.5 : 1, background: "var(--card)", color: "var(--text)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {matcher.running === "dry" ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={13} strokeWidth={2.4} />}
            Previsualizar
          </button>
          <button
            onClick={() => onRun(false)}
            disabled={!!matcher.running || mSelIds.length === 0}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: (matcher.running || mSelIds.length === 0) ? "not-allowed" : "pointer", opacity: (mSelIds.length === 0) ? 0.5 : 1, background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {matcher.running === "real" ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={13} strokeWidth={2.4} />}
            Importar al curso
          </button>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
            {mSelIds.length} conjunto(s) marcado(s)
          </span>
        </div>

        {matcher.msg && (
          <div style={{
            fontSize: 12, fontWeight: 600, lineHeight: 1.5, padding: "8px 11px", borderRadius: 8,
            background: matcher.msg.type === "ok" ? "rgba(16,185,129,0.12)" : matcher.msg.type === "err" ? "rgba(220,38,38,0.1)" : "var(--card)",
            color: matcher.msg.type === "ok" ? "#059669" : matcher.msg.type === "err" ? "#dc2626" : "var(--text)",
            border: `1px solid ${matcher.msg.type === "ok" ? "rgba(16,185,129,0.3)" : matcher.msg.type === "err" ? "rgba(220,38,38,0.3)" : "var(--border)"}`,
            display: "flex", alignItems: "flex-start", gap: 7,
          }}>
            {matcher.msg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} /> : matcher.msg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} /> : <Search size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span>{matcher.msg.text}</span>
          </div>
        )}
      </>
      )}
    </div>
  );
}

// Panel de import MASIVO: importa conjuntos del catálogo global a VARIOS cursos
// marcados con checkbox en la lista de la Fase 2 (p. ej. las 8 secciones de
// "Introducción al Derecho"). Las sugerencias se calculan agregando el mejor
// puntaje de cada conjunto frente a TODOS los cursos marcados.
function BulkImportPanel({ bulk, impCatalog, nCourses, onToggle, onQuery, onRun }) {
  if (!bulk) return null;
  const selIds = Object.keys(bulk.selected).filter(k => bulk.selected[k]);
  return (
    <div style={{ border: "1.5px solid var(--brand)", borderRadius: 10, background: "var(--bg)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
        <Target size={14} strokeWidth={2.6} style={{ color: "var(--brand)", flexShrink: 0 }} />
        Importar RA a {nCourses} curso(s) seleccionados
      </div>
      {bulk.loading ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 12.5, fontWeight: 600 }}>
          <Loader2 size={14} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> Buscando conjuntos que coinciden con los cursos marcados…
        </div>
      ) : (
      <>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>
          Conjuntos sugeridos {bulk.suggestions.length > 0 ? `(${bulk.suggestions.length})` : ""}
        </div>
        {bulk.suggestions.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            No hubo coincidencia automática con los nombres de los cursos. Busca abajo la asignatura por nombre o código y márcala.
          </div>
        )}
        {bulk.suggestions.map((s, i) => {
          const on = !!bulk.selected[s.importId];
          const pct = Math.min(100, Math.round((s.score / 1.5) * 100));
          const strong = s.score >= 0.9, mid = s.score >= 0.5;
          const badge = strong ? { t: "coincidencia muy alta", c: "#059669" } : mid ? { t: "coincidencia alta", c: "#0284c7" } : { t: "coincidencia parcial", c: "#d97706" };
          return (
            <label key={s.importId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 9px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand-light)" : "var(--card)" }}>
              <input type="checkbox" checked={on} onChange={() => onToggle(s.importId)} style={{ width: 16, height: 16, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i === 0 && <span style={{ color: "var(--brand)", fontWeight: 900 }}>★ </span>}{s.name}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span>{s.outcomeCount ?? "?"} RA</span>
                  <span style={{ color: badge.c, fontWeight: 800 }}>● {badge.t} ({pct}%)</span>
                </div>
              </div>
            </label>
          );
        })}

        <input
          type="text"
          placeholder="¿No es la correcta? Busca otra asignatura por nombre o código…"
          value={bulk.query}
          onChange={e => onQuery(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "7px 11px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 12, fontFamily: "var(--font)", outline: "none" }}
        />
        {bulk.query.trim() && (
          <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {(impCatalog?.summary || [])
              .filter(s => {
                const q = bulk.query.trim().toLowerCase();
                return (s.name || "").toLowerCase().includes(q) || (s.importId || "").toLowerCase().includes(q);
              })
              .slice(0, 40)
              .map(s => {
                const on = !!bulk.selected[s.importId];
                return (
                  <label key={s.importId} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 9px", borderRadius: 7, cursor: "pointer", border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand-light)" : "var(--card)" }}>
                    <input type="checkbox" checked={on} onChange={() => onToggle(s.importId)} style={{ width: 15, height: 15, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <span style={{ flexShrink: 0, fontSize: 10.5, color: "var(--muted)" }}>{s.outcomeCount ?? "?"} RA</span>
                  </label>
                );
              })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
          <button
            onClick={() => onRun(true)}
            disabled={!!bulk.running || selIds.length === 0}
            style={{ padding: "7px 13px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: (bulk.running || selIds.length === 0) ? "not-allowed" : "pointer", opacity: (selIds.length === 0) ? 0.5 : 1, background: "var(--card)", color: "var(--text)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {bulk.running === "dry" ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={13} strokeWidth={2.4} />}
            Previsualizar
          </button>
          <button
            onClick={() => onRun(false)}
            disabled={!!bulk.running || selIds.length === 0}
            style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: (bulk.running || selIds.length === 0) ? "not-allowed" : "pointer", opacity: (selIds.length === 0) ? 0.5 : 1, background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {bulk.running === "real" ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={13} strokeWidth={2.4} />}
            Importar a {nCourses} curso(s)
          </button>
          <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
            {selIds.length} conjunto(s) marcado(s)
          </span>
          {bulk.running && bulk.progress && (
            <span style={{ fontSize: 11.5, color: "var(--brand)", fontWeight: 800 }}>
              {bulk.progress.done}/{bulk.progress.total} cursos…
            </span>
          )}
        </div>

        {bulk.msg && (
          <div style={{
            fontSize: 12, fontWeight: 600, lineHeight: 1.5, padding: "8px 11px", borderRadius: 8,
            background: bulk.msg.type === "ok" ? "rgba(16,185,129,0.12)" : bulk.msg.type === "err" ? "rgba(220,38,38,0.1)" : "var(--card)",
            color: bulk.msg.type === "ok" ? "#059669" : bulk.msg.type === "err" ? "#dc2626" : "var(--text)",
            border: `1px solid ${bulk.msg.type === "ok" ? "rgba(16,185,129,0.3)" : bulk.msg.type === "err" ? "rgba(220,38,38,0.3)" : "var(--border)"}`,
            display: "flex", alignItems: "flex-start", gap: 7,
          }}>
            {bulk.msg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} /> : bulk.msg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} /> : <Search size={14} strokeWidth={2.6} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span>{bulk.msg.text}</span>
          </div>
        )}

        {Array.isArray(bulk.results) && bulk.results.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {bulk.results.map(r => (
              <div key={r.ou} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, lineHeight: 1.4, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--card)" }}>
                {r.ok
                  ? <CheckCircle2 size={13} strokeWidth={2.6} style={{ color: "#059669", flexShrink: 0, marginTop: 2 }} />
                  : <AlertTriangle size={13} strokeWidth={2.6} style={{ color: "#dc2626", flexShrink: 0, marginTop: 2 }} />}
                <span style={{ flex: 1, minWidth: 0, color: "var(--text)", fontWeight: 600 }}>
                  {r.name} <span style={{ color: "var(--muted)", fontWeight: 500 }}>#{r.ou}</span>
                  {r.ok
                    ? (r.after != null ? <span style={{ color: "#059669", fontWeight: 700 }}> · {r.after} RA</span> : null)
                    : <span style={{ color: "#dc2626", fontWeight: 500 }}> · {r.err}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </>
      )}
    </div>
  );
}

// Fila de un RA dentro del visor de registro global (recursiva por Children).
// `edit` (opcional) habilita la edición de descripciones: { setId, state, onStart,
// onCancel, onChange, onSave } donde state = { id, value, saving, mode }.
function RegistryOutcome({ o, depth = 0, edit }) {
  const editing = edit && edit.state?.id === o.id;
  return (
    <div style={{ paddingLeft: depth * 14 }}>
      <div style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5, lineHeight: 1.45, alignItems: "flex-start" }}>
        {o.shortCode ? <span style={{ fontWeight: 800, color: "var(--brand)", flexShrink: 0 }}>{o.shortCode}</span> : null}
        {editing ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              value={edit.state.value}
              onChange={e => edit.onChange(e.target.value)}
              rows={3}
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1.5px solid var(--brand)", background: "var(--card)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", lineHeight: 1.45, outline: "none", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <button
                onClick={() => edit.onSave(o, true)}
                disabled={!!edit.state.saving}
                title="Previsualiza el cambio SIN escribir en Brightspace"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: edit.state.saving ? "not-allowed" : "pointer", background: "var(--bg)", color: "var(--text)", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--font)" }}
              >
                {edit.state.saving === "dry" ? <Loader2 size={12} strokeWidth={2.6} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={12} strokeWidth={2.6} />}
                Previsualizar
              </button>
              <button
                onClick={() => edit.onSave(o, false)}
                disabled={!!edit.state.saving}
                title="Escribe el cambio en Brightspace (scope outcomes:sets:manage)"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, border: "none", cursor: edit.state.saving ? "not-allowed" : "pointer", background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--font)" }}
              >
                {edit.state.saving === "real" ? <Loader2 size={12} strokeWidth={2.6} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Save size={12} strokeWidth={2.6} />}
                Guardar
              </button>
              <button
                onClick={edit.onCancel}
                disabled={!!edit.state.saving}
                style={{ padding: "5px 11px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--muted)", fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font)" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <span style={{ color: "var(--text)", flex: 1, minWidth: 0 }}>
            {o.description || <em style={{ color: "var(--muted)" }}>(sin descripción)</em>}
          </span>
        )}
        {edit && !editing && (
          <button
            onClick={() => edit.onStart(o)}
            title="Editar descripción del RA"
            style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", padding: "3px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", color: "var(--brand)", cursor: "pointer" }}
          >
            <Pencil size={12} strokeWidth={2.4} />
          </button>
        )}
      </div>
      {(o.children || []).map(c => <RegistryOutcome key={c.id} o={c} depth={depth + 1} edit={edit} />)}
    </div>
  );
}

export default function LearningOutcomesAdmin() {
  useEffect(() => { injectStyles(); }, []);
  const navigate = useNavigate();

  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [loadedOrg, setLoadedOrg] = useState(null);
  const [loadedCourseName, setLoadedCourseName] = useState(""); // nombre del curso cargado (para sugerencias)

  // ── Estado de escritura (edición de alineaciones) ──
  const [editMode, setEditMode] = useState(false);
  const [sel, setSel] = useState({});           // "Type:Id" -> [guid,...]
  const [savingKey, setSavingKey] = useState(null);
  const [writeMsg, setWriteMsg] = useState(null); // { type:'ok'|'err', text }
  const [newType, setNewType] = useState("Assignment");
  const [newId, setNewId] = useState("");
  const [newSel, setNewSel] = useState([]);

  // ── Pestaña activa: organiza las herramientas por tarea (menos desorden) ──
  const [adminTab, setAdminTab] = useState("cursos"); // cursos|catalogo|plantilla|manual

  // ── Fase 1: visor del registro global de RA (solo lectura) ──
  const [regLoading, setRegLoading] = useState(false);
  const [registry, setRegistry] = useState(null);
  const [regQuery, setRegQuery] = useState("");
  const [regExpanded, setRegExpanded] = useState({}); // setId -> bool
  // ── Fase 3: edición de descripciones de RA (scope outcomes:sets:manage) ──
  const [raEdit, setRaEdit] = useState(null);   // { id, value, saving:false|'dry'|'real' }
  const [raEditMsg, setRaEditMsg] = useState(null); // { type:'ok'|'preview'|'err', text, before, after }
  const loadRegistry = useCallback(async () => {
    setRegLoading(true); setError("");
    try {
      const res = await apiGet("/gemelo/outcomes/registry");
      setRegistry(res);
    } catch (e) {
      setError(String(e?.message || "No se pudo cargar el registro global."));
    } finally {
      setRegLoading(false);
    }
  }, []);

  // Inicia la edición de un RA (carga su descripción actual en el textarea).
  const raEditStart = useCallback((o) => {
    setRaEditMsg(null);
    setRaEdit({ id: o.id, value: o.description || "", saving: false });
  }, []);
  const raEditCancel = useCallback(() => { setRaEdit(null); setRaEditMsg(null); }, []);
  const raEditChange = useCallback((v) => {
    setRaEdit(prev => prev ? { ...prev, value: v } : prev);
  }, []);
  // Guarda (dryRun=true → solo previsualiza; false → escribe en Brightspace).
  const raEditSave = useCallback(async (o, dryRun, setId) => {
    const value = (raEdit?.value ?? "").trim();
    if (!value) { setRaEditMsg({ type: "err", text: "La descripción no puede estar vacía." }); return; }
    setRaEdit(prev => prev ? { ...prev, saving: dryRun ? "dry" : "real" } : prev);
    setRaEditMsg(null);
    try {
      const res = await apiPut(
        `/gemelo/outcomes/set/${setId}/outcome/${encodeURIComponent(o.id)}`,
        { description: value, dryRun: !!dryRun },
      );
      const before = typeof res?.before === "object" ? (res.before?.Text ?? JSON.stringify(res.before)) : res?.before;
      const after = typeof res?.after === "object" ? (res.after?.Text ?? JSON.stringify(res.after)) : res?.after;
      const persisted = typeof res?.persisted === "object" ? (res.persisted?.Text ?? JSON.stringify(res.persisted)) : res?.persisted;
      if (dryRun) {
        setRaEditMsg({ type: "preview", text: "Vista previa (no se escribió en Brightspace).", before, after });
      } else if (res?.ok) {
        setRaEditMsg({ type: "ok", text: `Descripción actualizada y verificada en Brightspace (HTTP ${res.status}).`, before, after });
        setRaEdit(null);
        await loadRegistry();
      } else if (res?.warning) {
        // 2xx pero NO persistió (probable RA de tipo LORES / repositorio central).
        setRaEditMsg({
          type: "err",
          text: `${res.warning} [HTTP ${res.status} · fuente=${res.source} · GET-1set=${res.singleGetStatus}]`,
          before,
          after: persisted,
        });
      } else {
        setRaEditMsg({ type: "err", text: `Brightspace rechazó el cambio (HTTP ${res?.status ?? "?"}): ${typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail)}` });
      }
    } catch (e) {
      setRaEditMsg({ type: "err", text: String(e?.message || "No se pudo guardar la descripción.") });
    } finally {
      setRaEdit(prev => prev ? { ...prev, saving: false } : prev);
    }
  }, [raEdit, loadRegistry]);

  const regFiltered = useMemo(() => {
    if (!registry?.sets) return [];
    const q = regQuery.trim().toLowerCase();
    if (!q) return registry.sets;
    const out = [];
    for (const s of registry.sets) {
      const nameHit = (s.name || "").toLowerCase().includes(q);
      if (nameHit) { out.push(s); continue; }
      const matched = (s.outcomes || []).filter(o =>
        (o.description || "").toLowerCase().includes(q) ||
        (o.shortCode || "").toLowerCase().includes(q)
      );
      if (matched.length) out.push({ ...s, outcomes: matched });
    }
    return out;
  }, [registry, regQuery]);

  // ── Fase 4: importar RA global a cursos vacíos (bulkImport) ──
  const [impTarget, setImpTarget] = useState("6762");       // curso destino (piloto)
  const [impCatalog, setImpCatalog] = useState(null);        // export global {ok, summary, sets}
  const [impCatalogLoading, setImpCatalogLoading] = useState(false);
  const [impCourse, setImpCourse] = useState(null);          // {orgUnitId, sets, outcomeTotal}
  const [impCourseLoading, setImpCourseLoading] = useState(false);
  const [impRunning, setImpRunning] = useState(false);       // false|'dry'|'real'
  const [impMsg, setImpMsg] = useState(null);                // {type, text}
  const [impResult, setImpResult] = useState(null);          // resultado del import
  const [impSelected, setImpSelected] = useState({});        // importId -> bool (conjuntos elegidos)
  const [impCatQuery, setImpCatQuery] = useState("");        // filtro del catálogo (son ~137)

  // Opción A — emparejador por curso (inline en la Fase 2 "Sin RA").
  // matcher = { courseId, courseName, suggestions:[{importId,name,score,outcomeCount}],
  //   selected:{importId:bool}, query, running:false|'dry'|'real', msg, before, after }
  const [matcher, setMatcher] = useState(null);

  const impSelectedIds = useMemo(
    () => Object.keys(impSelected).filter(k => impSelected[k]),
    [impSelected],
  );
  const impCatFiltered = useMemo(() => {
    const rows = impCatalog?.summary || [];
    const q = impCatQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(s => (s.name || "").toLowerCase().includes(q) || (s.importId || "").toLowerCase().includes(q));
  }, [impCatalog, impCatQuery]);
  const toggleImpSet = useCallback((importId) => {
    if (!importId) return;
    setImpSelected(p => ({ ...p, [importId]: !p[importId] }));
  }, []);

  // Exporta el catálogo global (org-level) para descubrir qué conjuntos hay.
  const loadGlobalCatalog = useCallback(async () => {
    setImpCatalogLoading(true); setImpMsg(null);
    try {
      const res = await apiGet("/gemelo/outcomes/export");
      setImpCatalog(res);
      if (!res?.ok) {
        const d = typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail || {});
        setImpMsg({ type: "err", text: `Export global HTTP ${res?.status ?? "?"}: ${d.slice(0, 300)}` });
      }
      return res;
    } catch (e) {
      setImpMsg({ type: "err", text: String(e?.message || "No se pudo exportar el catálogo global.") });
      return null;
    } finally {
      setImpCatalogLoading(false);
    }
  }, []);

  // Lee los outcome sets actuales del curso destino (para ver vacío / verificar).
  const loadCourseSets = useCallback(async () => {
    const ou = parseInt(impTarget, 10);
    if (!ou) { setImpMsg({ type: "err", text: "Escribe el ID del curso destino." }); return; }
    setImpCourseLoading(true);
    try {
      const res = await apiGet(`/gemelo/outcomes/course/${ou}/sets`);
      setImpCourse(res);
    } catch (e) {
      setImpMsg({ type: "err", text: String(e?.message || "No se pudieron leer los RA del curso.") });
    } finally {
      setImpCourseLoading(false);
    }
  }, [impTarget]);

  // Importa los conjuntos seleccionados al curso (dryRun=true → solo preview).
  const runImport = useCallback(async (dryRun) => {
    const ou = parseInt(impTarget, 10);
    if (!ou) { setImpMsg({ type: "err", text: "Escribe el ID del curso destino." }); return; }
    if (impSelectedIds.length === 0) {
      setImpMsg({ type: "err", text: "Selecciona al menos un conjunto del catálogo (marca la casilla del que corresponde a la asignatura)." });
      return;
    }
    setImpRunning(dryRun ? "dry" : "real"); setImpMsg(null); setImpResult(null);
    try {
      const res = await apiPost("/gemelo/outcomes/import", {
        targetOrgUnitId: ou,
        importIds: impSelectedIds,
        dryRun: !!dryRun,
      });
      setImpResult(res);
      const nSets = res?.preview?.setCount ?? 0;
      const nOut = (res?.preview?.outcomeCounts || []).reduce((a, b) => a + (b || 0), 0);
      if (dryRun) {
        setImpMsg({ type: "preview", text: `Vista previa: se importarían ${nSets} conjunto(s) · ${nOut} RA al curso ${ou} (no se escribió nada).` });
      } else if (res?.ok) {
        setImpMsg({ type: "ok", text: `Import completado (HTTP ${res.status}) en el curso ${ou}. Revisa el "Después" abajo.` });
        await loadCourseSets();
      } else {
        const d = typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail || {});
        setImpMsg({ type: "err", text: `Brightspace rechazó el import (HTTP ${res?.status ?? "?"}): ${d.slice(0, 400)}` });
      }
    } catch (e) {
      setImpMsg({ type: "err", text: String(e?.message || "No se pudo importar.") });
    } finally {
      setImpRunning(false);
    }
  }, [impTarget, impSelectedIds, loadCourseSets]);

  // ── Creación masiva de RA desde plantilla CSV ──
  // Cursos destino OPCIONALES (vacío = solo catálogo global) y múltiples (+).
  const [tplTargets, setTplTargets] = useState([""]);
  const [tplSets, setTplSets] = useState(null);        // [{name, rows:[{code,title}]}]
  const [tplFileName, setTplFileName] = useState("");
  const [tplErrors, setTplErrors] = useState([]);      // avisos de filas descartadas
  const [tplRunning, setTplRunning] = useState(false); // false|'dry'|'real'
  const [tplMsg, setTplMsg] = useState(null);
  const [tplResult, setTplResult] = useState(null);
  const tplFileRef = useRef(null);

  const downloadRaTemplate = useCallback(() => {
    const rows = [
      ["conjunto", "codigo", "titulo"],
      ["RA - Nombre de la asignatura", "Z1O1DOR1", "Emplear los conceptos básicos de la disciplina en la solución de problemas reales"],
      ["RA - Nombre de la asignatura", "Z1O1DOR2", "Analizar críticamente la información para tomar decisiones fundamentadas"],
      ["RA - Otra asignatura (una fila por RA; cada nombre de conjunto distinto crea un conjunto aparte)", "Z2O1DOR1", "Diseñar soluciones aplicando las metodologías del curso"],
    ];
    // BOM + ; para que Excel (es-CO) lo abra directo con acentos correctos.
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "plantilla_resultados_aprendizaje.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const onTplFile = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite recargar el mismo archivo
    if (!file) return;
    setTplMsg(null); setTplResult(null);
    const apply = (text) => {
      const { sets, errors } = parseRaTemplate(text);
      setTplSets(sets); setTplErrors(errors); setTplFileName(file.name);
      if (sets.length === 0) {
        setTplMsg({ type: "err", text: errors[0] || "No se encontraron RA válidos en la plantilla." });
      }
    };
    const utf8 = new FileReader();
    utf8.onload = () => {
      const text = String(utf8.result || "");
      // Si Excel guardó en ANSI (windows-1252), la lectura UTF-8 mete "�":
      // reintentamos con esa codificación para no dañar acentos/ñ.
      if (/\uFFFD/.test(text)) {
        const ansi = new FileReader();
        ansi.onload = () => apply(String(ansi.result || ""));
        ansi.readAsText(file, "windows-1252");
      } else apply(text);
    };
    utf8.readAsText(file, "utf-8");
  }, []);

  const tplRaCount = useMemo(
    () => (tplSets || []).reduce((a, s) => a + s.rows.length, 0),
    [tplSets],
  );

  const runBulkCreate = useCallback(async (dryRun) => {
    // IDs de curso: opcionales. Entradas no vacías deben ser números válidos.
    const ids = [];
    for (const t of tplTargets) {
      const s = String(t || "").trim();
      if (!s) continue;
      if (!/^\d+$/.test(s) || parseInt(s, 10) <= 0) {
        setTplMsg({ type: "err", text: `ID de curso inválido: "${s}". Usa solo números (o deja el campo vacío).` });
        return;
      }
      const n = parseInt(s, 10);
      if (!ids.includes(n)) ids.push(n);
    }
    if (!tplSets || tplSets.length === 0) { setTplMsg({ type: "err", text: "Primero carga la plantilla CSV con los RA." }); return; }
    // Verificación con el usuario: crear SIN curso destino (solo catálogo global).
    if (ids.length === 0 && !dryRun) {
      const go = window.confirm(
        "No indicaste ningún curso destino.\n\nLos RA se crearán solo en el CATÁLOGO GLOBAL de Brightspace (nivel organización) y podrás importarlos a cursos más adelante.\n\n¿Continuar?"
      );
      if (!go) return;
    }
    setTplRunning(dryRun ? "dry" : "real"); setTplMsg(null); setTplResult(null);
    const destino = ids.length === 0
      ? "el catálogo global (sin curso)"
      : ids.length === 1 ? `el curso ${ids[0]}` : `los cursos ${ids.join(", ")}`;
    try {
      const res = await apiPost("/gemelo/outcomes/bulk-create", {
        targetOrgUnitIds: ids,
        sets: tplSets,
        dryRun: !!dryRun,
      });
      setTplResult(res);
      const nSets = res?.preview?.setCount ?? tplSets.length;
      const nOut = (res?.preview?.outcomeCounts || []).reduce((a, b) => a + (b || 0), 0) || tplRaCount;
      if (dryRun) {
        setTplMsg({ type: "preview", text: `Vista previa: se crearían ${nSets} conjunto(s) · ${nOut} RA en ${destino} (no se escribió nada).` });
      } else if (res?.ok) {
        setTplMsg({ type: "ok", text: `RA creados en ${destino}.${ids.length > 0 ? " Compara el Antes/Después abajo." : " Ya aparecen en el catálogo global (modo manual, paso 1)."}` });
      } else {
        const bad = (res?.results || []).filter(r => !r?.ok);
        const d = bad.map(r => `${r?.orgUnitId ?? "global"}: HTTP ${r?.status ?? "?"} ${typeof r?.detail === "string" ? r.detail : JSON.stringify(r?.detail || {})}`).join(" | ") || "sin detalle";
        setTplMsg({ type: "err", text: `Brightspace rechazó la creación en ${bad.length || "?"} destino(s): ${d.slice(0, 400)}` });
      }
    } catch (e) {
      setTplMsg({ type: "err", text: String(e?.message || "No se pudieron crear los RA.") });
    } finally {
      setTplRunning(false);
    }
  }, [tplTargets, tplSets, tplRaCount]);

  // ── Fase 2: cursos por semestre (vincular RA a cursos nuevos) ──
  const [semQuery, setSemQuery] = useState("");
  const [semLoading, setSemLoading] = useState(false);
  const [semUnits, setSemUnits] = useState(null);
  const [courseLoadingFor, setCourseLoadingFor] = useState(null);
  const [semCourses, setSemCourses] = useState(null); // { orgUnitId, items, typeHistogram }
  const [courseQuery, setCourseQuery] = useState("");
  // Análisis de estado RA por oferta: id -> { status: 'sinRA'|'sinAlinear'|'alineado'|'error', raCount }
  const [analysis, setAnalysis] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState({ done: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState("all"); // all|sinRA|sinAlinear|alineado
  // typeId 5 = Semestre en este tenant. Filtramos la búsqueda a semestres para
  // no devolver también sus ofertas/grupos hijos (que repiten la info).
  const SEMESTER_TYPE_ID = 5;
  const searchSemester = useCallback(async () => {
    const q = semQuery.trim();
    if (!q) { setError("Escribe el nombre o código del semestre (ej: 202620)."); return; }
    setSemLoading(true); setError(""); setSemUnits(null); setSemCourses(null);
    try {
      const res = await apiGet(`/gemelo/orgstructure/search?name=${encodeURIComponent(q)}&typeId=${SEMESTER_TYPE_ID}`);
      // Guardamos por si acaso solo los semestres (belt-and-suspenders).
      const items = (res.items || []).filter(u => classifyUnit(u) === "semester");
      setSemUnits(items.length > 0 ? items : (res.items || []));
    } catch (e) {
      setError(String(e?.message || "La búsqueda de semestres falló."));
    } finally {
      setSemLoading(false);
    }
  }, [semQuery]);
  // typeId 3 = Oferta de curso en este tenant. Filtramos los descendientes a
  // ofertas para no llenar el cupo (2000) con grupos y evitar que se trunque la
  // lista: un semestre puede tener >2000 descendientes contando grupos.
  const OFFERING_TYPE_ID = 3;
  const loadCourses = useCallback(async (ou) => {
    setCourseLoadingFor(ou); setError(""); setSemCourses(null); setCourseQuery("");
    setAnalysis({}); setStatusFilter("all"); setAnalyzeProgress({ done: 0, total: 0 });
    setBulkSel({}); setBulkPanel(null);
    try {
      const res = await apiGet(`/gemelo/orgstructure/${ou}/descendants?typeId=${OFFERING_TYPE_ID}`);
      setSemCourses(res);
    } catch (e) {
      setError(String(e?.message || "No se pudieron cargar los cursos de esa unidad."));
    } finally {
      setCourseLoadingFor(null);
    }
  }, []);
  // Analiza el estado RA de todas las ofertas cargadas (concurrencia 5). Para cada
  // oferta consulta sus learning-outcomes y clasifica: sin RA / sin alinear / alineado.
  // Permite filtrar y detectar cursos nuevos que necesitan RA o que aún no se alinean.
  const analyzeStatuses = useCallback(async () => {
    const items = (semCourses?.items || []).filter(c => classifyCourseUnit(c.typeName) === "offering");
    if (items.length === 0) return;
    setAnalyzing(true); setError("");
    setAnalyzeProgress({ done: 0, total: items.length });
    const acc = {};
    let done = 0;
    await mapLimit(items, 5, async (c) => {
      try {
        const res = await apiGet(`/gemelo/course/${c.id}/learning-outcomes`);
        const raCount = Object.keys(res?.outcomeCodeMap || {}).length;
        const aligned = !!(res?.hasRubricAlignments || res?.hasQuestionOnly);
        const status = raCount === 0 ? "sinRA" : (aligned ? "alineado" : "sinAlinear");
        acc[c.id] = { status, raCount };
      } catch (e) {
        acc[c.id] = { status: "error", err: String(e?.message || "error") };
      } finally {
        done += 1;
        setAnalyzeProgress({ done, total: items.length });
      }
    });
    setAnalysis(acc);
    setAnalyzing(false);
  }, [semCourses]);
  // Solo mostramos "Oferta de curso" (la unidad que porta los RA). Los grupos
  // (secciones hijas sin RA propios) se ocultan a propósito.
  const coursesFiltered = useMemo(() => {
    const items = semCourses?.items || [];
    let offerings = items.filter(c => classifyCourseUnit(c.typeName) === "offering");
    const q = courseQuery.trim().toLowerCase();
    if (q) {
      offerings = offerings.filter(c =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.code || "").toLowerCase().includes(q) ||
        String(c.id).includes(q)
      );
    }
    if (statusFilter !== "all") {
      // Los recién importados se mantienen visibles aunque cambien de estado,
      // para conservar la confirmación en el panel abierto.
      offerings = offerings.filter(c => analysis[c.id]?.status === statusFilter || analysis[c.id]?.justImported);
    }
    return offerings;
  }, [semCourses, courseQuery, statusFilter, analysis]);

  // Conteo por estado sobre TODAS las ofertas (ignora el filtro de texto/estado).
  const statusCounts = useMemo(() => {
    const c = { total: 0, sinRA: 0, sinAlinear: 0, alineado: 0, error: 0, analyzed: 0 };
    const items = (semCourses?.items || []).filter(x => classifyCourseUnit(x.typeName) === "offering");
    c.total = items.length;
    for (const it of items) {
      const s = analysis[it.id]?.status;
      if (!s) continue;
      c.analyzed += 1;
      if (s === "sinRA") c.sinRA += 1;
      else if (s === "sinAlinear") c.sinAlinear += 1;
      else if (s === "alineado") c.alineado += 1;
      else if (s === "error") c.error += 1;
    }
    return c;
  }, [semCourses, analysis]);

  // ── Opción A: emparejador por curso (inline en "Sin RA") ──────────
  const matcherCourseRef = useRef(null); // id del curso con panel abierto (para alternar)
  const matcherStateRef = useRef(null);  // espejo de `matcher` para leer en callbacks
  useEffect(() => { matcherStateRef.current = matcher; }, [matcher]);
  // Abre el panel bajo un curso vacío y precalcula la mejor coincidencia.
  const openMatcher = useCallback(async (course) => {
    const cid = course.id;
    const courseName = course?.name || "";
    // Alterna: si ya está abierto para este curso, ciérralo.
    if (matcherCourseRef.current === cid) {
      matcherCourseRef.current = null;
      setMatcher(null);
      return;
    }
    matcherCourseRef.current = cid;
    setMatcher({
      courseId: cid, courseName, suggestions: [], selected: {},
      query: "", running: false, msg: null, before: null, after: null, loading: true,
    });
    // Asegura catálogo cargado (export global org-level).
    let cat = impCatalog;
    if (!cat?.summary?.length) cat = await loadGlobalCatalog();
    const summary = cat?.summary || [];
    const suggestions = suggestSetsForCourse(courseName, summary, 6);
    // Preselecciona la mejor si es claramente buena (score alto y con margen).
    const sel = {};
    const [top, second] = suggestions;
    if (top && top.score >= 0.6 && (!second || top.score - second.score >= 0.2)) {
      sel[top.importId] = true;
    }
    // Solo aplica si el panel sigue abierto en este curso.
    setMatcher(prev => (prev && prev.courseId === cid
      ? { ...prev, suggestions, selected: sel, loading: false }
      : prev));
  }, [impCatalog, loadGlobalCatalog]);

  const toggleMatcherSet = useCallback((importId) => {
    if (!importId) return;
    setMatcher(prev => prev ? { ...prev, selected: { ...prev.selected, [importId]: !prev.selected[importId] } } : prev);
  }, []);

  const setMatcherQuery = useCallback((q) => {
    setMatcher(prev => prev ? { ...prev, query: q } : prev);
  }, []);

  // Ejecuta el import para el curso del panel (dryRun=true → solo preview).
  const runMatcherImport = useCallback(async (dryRun) => {
    const m = matcherStateRef.current;
    if (!m) return;
    const ou = m.courseId;
    const ids = Object.keys(m.selected).filter(k => m.selected[k]);
    if (ids.length === 0) {
      setMatcher(prev => prev ? { ...prev, msg: { type: "err", text: "Marca al menos un conjunto sugerido antes de importar." } } : prev);
      return;
    }
    setMatcher(prev => prev ? { ...prev, running: dryRun ? "dry" : "real", msg: null } : prev);
    try {
      const res = await apiPost("/gemelo/outcomes/import", {
        targetOrgUnitId: ou, importIds: ids, dryRun: !!dryRun,
      });
      const nSets = res?.preview?.setCount ?? ids.length;
      const nOut = (res?.preview?.outcomeCounts || []).reduce((a, b) => a + (b || 0), 0);
      const before = res?.courseSetsBefore?.outcomeTotal ?? res?.export_meta?.courseSetsBefore?.outcomeTotal ?? null;
      if (dryRun) {
        setMatcher(prev => prev && prev.courseId === ou
          ? { ...prev, running: false, msg: { type: "preview", text: `Vista previa: se importarían ${nSets} conjunto(s) · ${nOut} RA a "${m.courseName}" (no se escribió nada).` } }
          : prev);
      } else if (res?.ok) {
        // Verifica el resultado real leyendo los RA del curso.
        let afterTotal = null;
        try {
          const chk = await apiGet(`/gemelo/outcomes/course/${ou}/sets`);
          afterTotal = chk?.outcomeTotal ?? null;
        } catch { /* noop */ }
        // Refleja el nuevo estado en la lista (deja de estar "Sin RA").
        // `justImported` mantiene la fila visible aunque el filtro sea "Sin RA",
        // para no ocultar la confirmación de éxito inmediatamente.
        if (afterTotal != null && afterTotal > 0) {
          setAnalysis(prev => ({ ...prev, [ou]: { status: "sinAlinear", raCount: afterTotal, justImported: true } }));
        }
        setMatcher(prev => prev && prev.courseId === ou
          ? { ...prev, running: false, before, after: afterTotal, msg: { type: "ok", text: `Import completado (HTTP ${res.status}). "${m.courseName}" ahora tiene ${afterTotal ?? "?"} RA.` } }
          : prev);
      } else {
        const d = typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail || {});
        setMatcher(prev => prev && prev.courseId === ou
          ? { ...prev, running: false, msg: { type: "err", text: `Brightspace rechazó el import (HTTP ${res?.status ?? "?"}): ${d.slice(0, 300)}` } }
          : prev);
      }
    } catch (e) {
      setMatcher(prev => prev ? { ...prev, running: false, msg: { type: "err", text: String(e?.message || "No se pudo importar.") } } : prev);
    }
  }, []);

  // ── Import MASIVO: checkboxes en la lista de cursos + panel compartido ──
  // Permite marcar varias ofertas (p. ej. las 8 secciones de "Introducción al
  // Derecho") e importarles el/los mismos conjuntos de RA en una sola pasada.
  const [bulkSel, setBulkSel] = useState({});        // courseId -> bool
  const [bulkPanel, setBulkPanel] = useState(null);  // { suggestions, selected, query, running, msg, progress, results, loading }
  const bulkPanelRef = useRef(null);
  useEffect(() => { bulkPanelRef.current = bulkPanel; }, [bulkPanel]);
  const bulkIds = useMemo(
    () => Object.keys(bulkSel).filter(k => bulkSel[k]).map(Number),
    [bulkSel],
  );

  const toggleBulkCourse = useCallback((id) => {
    setBulkSel(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Marca/desmarca todas las ofertas VISIBLES (respeta filtro de texto/estado).
  const toggleBulkVisible = useCallback(() => {
    const allOn = coursesFiltered.length > 0 && coursesFiltered.every(c => bulkSel[c.id]);
    setBulkSel(prev => {
      const next = { ...prev };
      for (const c of coursesFiltered) next[c.id] = !allOn;
      return next;
    });
  }, [coursesFiltered, bulkSel]);

  // Abre/cierra el panel masivo. Las sugerencias agregan el MEJOR puntaje de
  // cada conjunto frente a todos los cursos marcados (suelen ser homónimos).
  const openBulkPanel = useCallback(async () => {
    if (bulkPanelRef.current) { setBulkPanel(null); return; }
    if (bulkIds.length === 0) return;
    setBulkPanel({ suggestions: [], selected: {}, query: "", running: false, msg: null, progress: null, results: null, loading: true });
    let cat = impCatalog;
    if (!cat?.summary?.length) cat = await loadGlobalCatalog();
    const summary = cat?.summary || [];
    const byId = new Map((semCourses?.items || []).map(c => [Number(c.id), c]));
    const names = bulkIds.map(id => byId.get(id)?.name || "").filter(Boolean);
    const suggestions = summary
      .map(s => ({ ...s, score: names.length ? Math.max(...names.map(n => scoreSetMatch(n, s.name))) : 0 }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    const sel = {};
    const [top, second] = suggestions;
    if (top && top.score >= 0.6 && (!second || top.score - second.score >= 0.2)) {
      sel[top.importId] = true;
    }
    setBulkPanel(prev => prev ? { ...prev, suggestions, selected: sel, loading: false } : prev);
  }, [bulkIds, impCatalog, loadGlobalCatalog, semCourses]);

  const toggleBulkSet = useCallback((importId) => {
    if (!importId) return;
    setBulkPanel(prev => prev ? { ...prev, selected: { ...prev.selected, [importId]: !prev.selected[importId] } } : prev);
  }, []);

  const setBulkPanelQuery = useCallback((q) => {
    setBulkPanel(prev => prev ? { ...prev, query: q } : prev);
  }, []);

  // Ejecuta el import para TODOS los cursos marcados (concurrencia 3). Cada
  // curso usa el mismo endpoint del emparejador individual; tras un import real
  // se verifica leyendo los sets del curso y se actualiza su estado en la lista.
  const runBulkImport = useCallback(async (dryRun) => {
    const p = bulkPanelRef.current;
    if (!p) return;
    const setIds = Object.keys(p.selected).filter(k => p.selected[k]);
    const courses = bulkIds;
    if (setIds.length === 0) {
      setBulkPanel(prev => prev ? { ...prev, msg: { type: "err", text: "Marca al menos un conjunto antes de importar." } } : prev);
      return;
    }
    if (courses.length === 0) {
      setBulkPanel(prev => prev ? { ...prev, msg: { type: "err", text: "No hay cursos seleccionados." } } : prev);
      return;
    }
    if (!dryRun) {
      const okGo = window.confirm(
        `Vas a importar ${setIds.length} conjunto(s) de RA a ${courses.length} curso(s).\n\nEl import es un merge: no borra ni altera RA existentes.\n\n¿Continuar?`
      );
      if (!okGo) return;
    }
    setBulkPanel(prev => prev ? { ...prev, running: dryRun ? "dry" : "real", msg: null, results: null, progress: { done: 0, total: courses.length } } : prev);
    const byId = new Map((semCourses?.items || []).map(c => [Number(c.id), c]));
    const results = [];
    let done = 0;
    // Import con reintento ante 429 (rate limit del backend). La ventana del
    // limiter es de 1 min, así que esperamos escalonado y reintentamos en lugar
    // de dar el curso por fallido: con lotes grandes esto evita "N fallidos".
    const importWithRetry = async (ou, maxRetries = 4) => {
      let attempt = 0;
      while (true) {
        try {
          return await apiPost("/gemelo/outcomes/import", {
            targetOrgUnitId: ou, importIds: setIds, dryRun: !!dryRun,
          });
        } catch (e) {
          const is429 = String(e?.message || "").includes("429");
          if (is429 && attempt < maxRetries) {
            attempt += 1;
            const waitMs = Math.min(60000, 8000 * attempt) + Math.floor(Math.random() * 1500);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
          throw e;
        }
      }
    };
    await mapLimit(courses, 3, async (ou) => {
      const name = byId.get(ou)?.name || `Curso ${ou}`;
      try {
        const res = await importWithRetry(ou);
        if (res?.ok) {
          let afterTotal = null;
          if (!dryRun) {
            try {
              const chk = await apiGet(`/gemelo/outcomes/course/${ou}/sets`);
              afterTotal = chk?.outcomeTotal ?? null;
            } catch { /* noop */ }
            if (afterTotal != null && afterTotal > 0) {
              setAnalysis(prev => ({ ...prev, [ou]: { status: "sinAlinear", raCount: afterTotal, justImported: true } }));
            }
          }
          results.push({ ou, name, ok: true, after: afterTotal });
        } else {
          const d = typeof res?.detail === "string" ? res.detail : JSON.stringify(res?.detail || {});
          results.push({ ou, name, ok: false, err: `HTTP ${res?.status ?? "?"}: ${d.slice(0, 200)}` });
        }
      } catch (e) {
        results.push({ ou, name, ok: false, err: String(e?.message || "falló") });
      } finally {
        done += 1;
        setBulkPanel(prev => prev ? { ...prev, progress: { done, total: courses.length } } : prev);
      }
    });
    const nOk = results.filter(r => r.ok).length;
    const nBad = results.length - nOk;
    results.sort((a, b) => Number(a.ok) - Number(b.ok)); // errores primero
    const msg = dryRun
      ? { type: "preview", text: `Vista previa: ${setIds.length} conjunto(s) se importarían a ${nOk} de ${results.length} curso(s)${nBad ? ` · ${nBad} con error` : ""} (no se escribió nada).` }
      : nBad === 0
        ? { type: "ok", text: `Import masivo completado: ${setIds.length} conjunto(s) importados a ${nOk} curso(s).` }
        : { type: "err", text: `Import terminado con errores: ${nOk} OK · ${nBad} fallido(s). Revisa el detalle abajo.` };
    setBulkPanel(prev => prev ? { ...prev, running: false, msg, results } : prev);
  }, [bulkIds, semCourses]);

  // ── Sondeo del registro global (diagnóstico) ──
  const [probing, setProbing] = useState(false);
  const [probeData, setProbeData] = useState(null);
  const [probeProgram, setProbeProgram] = useState(""); // ID del programa (ej: 24)
  const runProbe = useCallback(async () => {
    const ou = Number(orgId);
    if (!ou || ou <= 0) { setError("Ingresa un ID (curso u organización) para sondear."); return; }
    setProbing(true); setProbeData(null); setError("");
    try {
      const qs = probeProgram && Number(probeProgram) > 0 ? `?programId=${Number(probeProgram)}` : "";
      const res = await apiGet(`/gemelo/outcomes/probe/${ou}${qs}`);
      setProbeData(res);
    } catch (e) {
      setError(String(e?.message || "El sondeo falló."));
    } finally {
      setProbing(false);
    }
  }, [orgId, probeProgram]);

  const fetchLO = useCallback(async (ouOverride, nameOverride) => {
    const raw = ouOverride != null ? ouOverride : orgId;
    const ou = Number(raw);
    if (!ou || ou <= 0) { setError("Ingresa un ID de curso válido."); return; }
    if (ouOverride != null) setOrgId(String(ou));
    // Resuelve el nombre del curso (para el emparejador). Prioriza el nombre que
    // venga del listado; si no, lo busca en semCourses por id (comparando strings
    // para evitar el desajuste número/string que rompía las sugerencias).
    const resolvedName = nameOverride
      || (semCourses?.items || []).find(x => String(x.id) === String(ou))?.name
      || "";
    setLoadedCourseName(resolvedName);
    setLoading(true); setError(""); setData(null);
    try {
      const res = await apiGet(`/gemelo/course/${ou}/learning-outcomes`);
      setData(res);
      setLoadedOrg(ou);
    } catch {
      setError("No se pudieron cargar los resultados de aprendizaje de ese curso.");
    } finally {
      setLoading(false);
    }
  }, [orgId, semCourses]);

  const outcomes = useMemo(() => {
    const map = data?.outcomeCodeMap || {};
    let list = Object.entries(map).map(([id, info]) => ({ id, ...(info || {}) }));
    // Fallback: índice derivado vacío (caché obsoleta tras importar) → derivar del crudo.
    if (list.length === 0 && data?.outcomeSets) list = parseOutcomeSetsToList(data.outcomeSets);
    return list.sort((a, b) => String(a.code || a.title || "").localeCompare(String(b.code || b.title || ""), "es", { numeric: true }));
  }, [data]);

  const allOutcomes = useMemo(() => {
    const idx = data?.outcomeIndex || {};
    let list = Object.entries(idx).map(([guid, info]) => ({ guid, ...(info || {}) }));
    if (list.length === 0 && data?.outcomeSets) list = parseOutcomeSetsToList(data.outcomeSets);
    return list.sort((a, b) => String(a.code || a.title || "").localeCompare(String(b.code || b.title || ""), "es", { numeric: true }));
  }, [data]);

  useEffect(() => {
    const a2o = data?.activityToOutcomes || {};
    const init = {};
    for (const [k, guids] of Object.entries(a2o)) init[k] = Array.isArray(guids) ? [...guids] : [];
    setSel(init);
    setWriteMsg(null);
  }, [data]);

  const rubricCount = data ? Object.keys(data.rubricToOutcomeCodes || {}).length : 0;
  const activityCount = data ? Object.keys(data.activityToOutcomes || {}).length : 0;
  const hasOutcomes = outcomes.length > 0;
  const hasAlignments = !!(data && (data.hasRubricAlignments || data.hasQuestionOnly));
  const canEdit = hasOutcomes && allOutcomes.length > 0;

  const toggleSel = useCallback((key, guid) => {
    setSel(prev => {
      const cur = prev[key] || [];
      const next = cur.includes(guid) ? cur.filter(g => g !== guid) : [...cur, guid];
      return { ...prev, [key]: next };
    });
  }, []);

  const toggleNewSel = useCallback((guid) => {
    setNewSel(prev => prev.includes(guid) ? prev.filter(g => g !== guid) : [...prev, guid]);
  }, []);

  const saveActivity = useCallback(async (key) => {
    if (!loadedOrg) return;
    const idx = key.indexOf(":");
    const type = key.slice(0, idx);
    const objectId = key.slice(idx + 1);
    const outcomeIds = sel[key] || [];
    setSavingKey(key); setWriteMsg(null);
    try {
      await apiPost(
        `/gemelo/course/${loadedOrg}/alignments/activity/${type}/${encodeURIComponent(objectId)}`,
        { action: "replace", outcomeIds },
      );
      setWriteMsg({ type: "ok", text: `Alineaciones actualizadas para ${type} #${objectId}.` });
      await fetchLO();
    } catch (e) {
      setWriteMsg({ type: "err", text: String(e?.message || "No se pudo guardar.") });
    } finally {
      setSavingKey(null);
    }
  }, [sel, loadedOrg, fetchLO]);

  const saveNew = useCallback(async () => {
    if (!loadedOrg) return;
    const oid = newId.trim();
    if (!oid || newSel.length === 0) {
      setWriteMsg({ type: "err", text: "Indica el ID de la actividad y al menos un RA." });
      return;
    }
    setSavingKey("__new__"); setWriteMsg(null);
    try {
      await apiPost(
        `/gemelo/course/${loadedOrg}/alignments/activity/${newType}/${encodeURIComponent(oid)}`,
        { action: "add", outcomeIds: newSel },
      );
      setWriteMsg({ type: "ok", text: `RA agregados a ${newType} #${oid}.` });
      setNewId(""); setNewSel([]);
      await fetchLO();
    } catch (e) {
      setWriteMsg({ type: "err", text: String(e?.message || "No se pudo agregar la alineación.") });
    } finally {
      setSavingKey(null);
    }
  }, [loadedOrg, newId, newType, newSel, fetchLO]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px clamp(16px, 4vw, 48px) 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Cabecera de la página */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px",
              borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--card)",
              color: "var(--text)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font)", cursor: "pointer",
            }}
          >
            <ArrowLeft size={16} strokeWidth={2.4} /> Volver
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, display: "grid", placeItems: "center",
              background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff", flexShrink: 0,
            }}>
              <Target size={24} strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", lineHeight: 1.1 }}>Resultados de aprendizaje</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Super Admin · Registro global, cursos por semestre y alineaciones</div>
            </div>
          </div>
        </div>

        <section className="home-panel superadmin-brand" style={{ padding: "clamp(16px, 3vw, 26px)" }}>
          {/* ── Barra de pestañas: una herramienta por pestaña ── */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, borderBottom: "1.5px solid var(--border)", margin: "-2px 0 12px", flexWrap: "wrap" }}>
            {[
              { key: "cursos", label: "Cursos y alineaciones", Icon: LayoutGrid },
              { key: "catalogo", label: "Registro global", Icon: Target },
              { key: "plantilla", label: "Crear RA (plantilla)", Icon: Upload },
              { key: "manual", label: "Importar manual", Icon: BookOpen },
            ].map(t => {
              const active = adminTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setAdminTab(t.key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px 8px",
                    borderRadius: "10px 10px 0 0", border: "1.5px solid var(--border)",
                    borderBottom: active ? "1.5px solid var(--card)" : "1.5px solid var(--border)",
                    marginBottom: -1.5, background: active ? "var(--card)" : "var(--bg)",
                    color: active ? "var(--brand)" : "var(--muted)",
                    fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font)", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  <t.Icon size={14} strokeWidth={2.4} /> {t.label}
                </button>
              );
            })}
          </div>

          {/* Descripción de la pestaña activa */}
          <div style={{
            fontSize: 12, color: "var(--muted)", marginBottom: 14,
            padding: "10px 14px", background: "var(--brand-light)",
            borderRadius: 10, borderLeft: "3px solid var(--brand)",
            display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
          }}>
            <ListChecks size={16} strokeWidth={2.2} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
            <span>
              {adminTab === "cursos" && <>Busca un semestre, revisa el estado de RA de cada curso (sin RA / sin alinear / alineado) y consulta o edita las alineaciones de cualquier curso por ID.</>}
              {adminTab === "catalogo" && <>Todos los conjuntos de RA del tenant (nivel organización). Explora los conjuntos y edita descripciones con el lápiz.</>}
              {adminTab === "plantilla" && <>Crea RA masivos desde un archivo: descarga la plantilla, complétala en Excel y cárgala. Es un <b>merge</b>: nunca borra RA existentes.</>}
              {adminTab === "manual" && <>Modo avanzado: importa conjuntos del catálogo global a cualquier curso por ID y sondea el registro para diagnóstico.</>}
            </span>
          </div>

          {error && (
            <div style={{ fontSize: 12.5, color: "#dc2626", background: "rgba(220,38,38,0.08)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} strokeWidth={2.4} /> {error}
            </div>
          )}

          {/* ── Pestaña: Registro global de RA (todos los conjuntos del tenant) ── */}
          {adminTab === "catalogo" && (
          <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "12px 14px", background: "var(--bg)" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
                <Target size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Registro global de RA
              </div>
              {registry && (
                <span style={chipStyle}>{registry.setCount} conjuntos · {registry.outcomeTotal} RA</span>
              )}
              <button
                onClick={loadRegistry}
                disabled={regLoading}
                style={{
                  marginLeft: "auto", padding: "8px 16px", borderRadius: 10, border: "none",
                  cursor: regLoading ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
                  color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)",
                  display: "inline-flex", alignItems: "center", gap: 7,
                }}
              >
                {regLoading ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <RefreshCw size={15} strokeWidth={2.4} />}
                {regLoading ? "Cargando…" : registry ? "Recargar" : "Cargar registro"}
              </button>
            </div>
            {registry && (
              <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
                <input
                  type="text"
                  placeholder="Buscar por nombre del conjunto, código o descripción…"
                  value={regQuery}
                  onChange={e => setRegQuery(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
                />
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Pencil size={12} strokeWidth={2.4} style={{ color: "var(--brand)" }} />
                  Usa el lápiz para editar una descripción. Previsualiza primero; “Guardar” escribe en Brightspace.
                </div>
                {raEditMsg && (
                  <div style={{
                    marginTop: 8, fontSize: 12, borderRadius: 8, padding: "9px 12px", lineHeight: 1.5,
                    color: raEditMsg.type === "err" ? "#dc2626" : raEditMsg.type === "ok" ? "#059669" : "#1e40af",
                    background: raEditMsg.type === "err" ? "rgba(220,38,38,0.08)" : raEditMsg.type === "ok" ? "rgba(16,185,129,0.1)" : "rgba(37,99,235,0.08)",
                    border: `1px solid ${raEditMsg.type === "err" ? "rgba(220,38,38,0.3)" : raEditMsg.type === "ok" ? "rgba(16,185,129,0.3)" : "rgba(37,99,235,0.25)"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800 }}>
                      {raEditMsg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.4} /> : raEditMsg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.4} /> : <Search size={14} strokeWidth={2.4} />}
                      {raEditMsg.text}
                    </div>
                    {(raEditMsg.before != null || raEditMsg.after != null) && (
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3, fontFamily: "var(--font)" }}>
                        <div><span style={{ fontWeight: 700, color: "var(--muted)" }}>Antes:</span> {String(raEditMsg.before || "(vacío)")}</div>
                        <div><span style={{ fontWeight: 700, color: "var(--muted)" }}>Después:</span> {String(raEditMsg.after || "(vacío)")}</div>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ maxHeight: 460, overflowY: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {regFiltered.map(s => {
                    const open = !!regExpanded[s.setId] || !!regQuery.trim();
                    return (
                      <div key={s.setId} style={{ flexShrink: 0, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                        <button
                          onClick={() => setRegExpanded(p => ({ ...p, [s.setId]: !p[s.setId] }))}
                          style={{ width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "var(--card)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font)" }}
                        >
                          {open ? <ChevronUp size={15} strokeWidth={2.4} style={{ color: "var(--muted)", flexShrink: 0 }} /> : <ChevronDown size={15} strokeWidth={2.4} style={{ color: "var(--muted)", flexShrink: 0 }} />}
                          <span style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text)" }}>{s.name || <em style={{ color: "var(--muted)" }}>(sin nombre)</em>}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)", flexShrink: 0 }}>{s.outcomeCount} RA · #{s.setId}</span>
                        </button>
                        {open && (
                          <div style={{ padding: "4px 12px 10px", background: "var(--bg)" }}>
                            {(s.outcomes || []).map(o => (
                              <RegistryOutcome
                                key={o.id}
                                o={o}
                                edit={{
                                  setId: s.setId,
                                  state: raEdit,
                                  onStart: raEditStart,
                                  onCancel: raEditCancel,
                                  onChange: raEditChange,
                                  onSave: (out, dryRun) => raEditSave(out, dryRun, s.setId),
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {regFiltered.length === 0 && (
                    <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "10px 4px" }}>Sin coincidencias.</div>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

          {/* ── Pestaña: Creación masiva de RA desde plantilla CSV ── */}
          {adminTab === "plantilla" && (
          <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
                <Upload size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Crear RA masivos desde plantilla (CSV)
              </div>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Redacta los RA en Excel con la plantilla, cárgala aquí y créalos de una sola vez en el curso. Es un <b>merge</b>: nunca borra RA existentes.</span>
            </div>
            <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
              {/* Paso 1: plantilla */}
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>1 · Plantilla — descárgala, complétala en Excel (una fila por RA) y cárgala</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={downloadRaTemplate}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid var(--brand)", cursor: "pointer", background: "var(--bg)", color: "var(--brand)", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  <Download size={15} strokeWidth={2.4} /> Descargar plantilla CSV
                </button>
                <input ref={tplFileRef} type="file" accept=".csv,.txt,text/csv" onChange={onTplFile} style={{ display: "none" }} />
                <button
                  onClick={() => tplFileRef.current?.click()}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  <Upload size={15} strokeWidth={2.4} /> Cargar plantilla…
                </button>
                {tplFileName && (
                  <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                    {tplFileName} · {tplRaCount} RA en {(tplSets || []).length} conjunto(s)
                  </span>
                )}
              </div>

              {tplErrors.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11.5, borderRadius: 8, padding: "8px 12px", lineHeight: 1.6, color: "#d97706", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <b>{tplErrors.length} fila(s) descartada(s):</b>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {tplErrors.slice(0, 8).map((er, i) => <li key={i}>{er}</li>)}
                    {tplErrors.length > 8 && <li>… y {tplErrors.length - 8} más.</li>}
                  </ul>
                </div>
              )}

              {tplSets && tplSets.length > 0 && (
                <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", background: "var(--card)", fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>
                    Vista previa de la plantilla — revisa códigos y títulos antes de crear
                  </div>
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
                    {tplSets.map((s, si) => (
                      <div key={si} style={{ borderTop: "1px solid var(--border)" }}>
                        <div style={{ padding: "7px 12px", fontSize: 12, fontWeight: 800, color: "var(--text)", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8 }}>
                          <BookOpen size={13} strokeWidth={2.4} style={{ color: "var(--brand)", flexShrink: 0 }} />
                          {s.name}
                          <span style={{ marginLeft: "auto", color: "var(--muted)", fontWeight: 700, fontSize: 11 }}>{s.rows.length} RA</span>
                        </div>
                        {s.rows.map((r, ri) => (
                          <div key={ri} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "6px 12px 6px 24px", borderTop: "1px solid var(--border)", fontSize: 12 }}>
                            <span style={{ flexShrink: 0, fontFamily: "var(--font-mono, monospace)", fontWeight: 800, color: "var(--brand)", fontSize: 11.5 }}>{r.code}</span>
                            <span style={{ color: "var(--text)", lineHeight: 1.4 }}>{r.title}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paso 2: cursos destino (opcional, múltiples) */}
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "16px 0 8px" }}>
                2 · Cursos destino <span style={{ fontWeight: 600, textTransform: "none" }}>(opcional — vacío = solo catálogo global)</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {tplTargets.map((t, i) => (
                  <div key={i} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder={i === 0 ? "ID del curso (ej: 6762)" : "ID de otro curso"}
                      value={t}
                      onChange={e => setTplTargets(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                      style={{ width: 190, maxWidth: "100%", boxSizing: "border-box", padding: "9px 34px 9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
                    />
                    {tplTargets.length > 1 && (
                      <button
                        onClick={() => setTplTargets(prev => prev.filter((_, j) => j !== i))}
                        title="Quitar este curso"
                        aria-label={`Quitar curso destino ${i + 1}`}
                        style={{ position: "absolute", right: 6, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 15, fontWeight: 800, lineHeight: 1, padding: 4, fontFamily: "var(--font)" }}
                      >×</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setTplTargets(prev => [...prev, ""])}
                  title="Agregar otro curso destino"
                  style={{ padding: "8px 13px", borderRadius: 10, border: "1.5px dashed var(--border)", background: "var(--card)", color: "var(--brand)", fontSize: 12.5, fontWeight: 800, fontFamily: "var(--font)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  <Plus size={14} strokeWidth={2.6} /> Agregar curso
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
                Los RA se crean en el <b>catálogo global</b> y se vinculan a cada curso indicado. Si no indicas ninguno, se crean solo en el catálogo (se te pedirá confirmación) y podrás importarlos a cursos después.
              </div>

              {/* Paso 3: crear */}
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "16px 0 8px" }}>
                3 · Crear {tplRaCount > 0 ? `(${tplRaCount} RA listos)` : "— carga la plantilla arriba"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => runBulkCreate(true)}
                  disabled={!!tplRunning || tplRaCount === 0}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid var(--border)", cursor: (tplRunning || tplRaCount === 0) ? "not-allowed" : "pointer", opacity: tplRaCount === 0 ? 0.5 : 1, background: "var(--card)", color: "var(--text)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  {tplRunning === "dry" ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={15} strokeWidth={2.4} />}
                  Previsualizar (dry-run)
                </button>
                <button
                  onClick={() => runBulkCreate(false)}
                  disabled={!!tplRunning || tplRaCount === 0}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: (tplRunning || tplRaCount === 0) ? "not-allowed" : "pointer", opacity: tplRaCount === 0 ? 0.5 : 1, background: "linear-gradient(135deg, #059669 0%, #047857 100%)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  {tplRunning === "real" ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={15} strokeWidth={2.4} />}
                  {(() => {
                    const n = tplTargets.filter(t => String(t || "").trim()).length;
                    return n === 0 ? "Crear RA (catálogo global)" : n === 1 ? "Crear RA en el curso" : `Crear RA en ${n} cursos`;
                  })()}
                </button>
              </div>

              {tplMsg && (
                <div style={{
                  marginTop: 10, fontSize: 12, borderRadius: 8, padding: "9px 12px", lineHeight: 1.5,
                  color: tplMsg.type === "err" ? "#dc2626" : tplMsg.type === "ok" ? "#059669" : "#1e40af",
                  background: tplMsg.type === "err" ? "rgba(220,38,38,0.08)" : tplMsg.type === "ok" ? "rgba(16,185,129,0.1)" : "rgba(37,99,235,0.08)",
                  border: `1px solid ${tplMsg.type === "err" ? "rgba(220,38,38,0.3)" : tplMsg.type === "ok" ? "rgba(16,185,129,0.3)" : "rgba(37,99,235,0.25)"}`,
                  display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 700,
                }}>
                  {tplMsg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} /> : tplMsg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} /> : <Search size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span>{tplMsg.text}</span>
                </div>
              )}
              {(tplResult?.results || []).filter(r => r.courseSetsBefore || r.courseSetsAfter).map((r) => (
                <div key={String(r.orgUnitId ?? "org")} style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: "var(--muted)" }}>
                  <div style={{ fontWeight: 800 }}>Curso {r.orgUnitId}:</div>
                  <div><b>Antes:</b> {Array.isArray(r.courseSetsBefore) ? r.courseSetsBefore.reduce((a, s) => a + (s.outcomeCount || 0), 0) : "?"} RA</div>
                  {r.courseSetsAfter && (
                    <div><b>Después:</b> {Array.isArray(r.courseSetsAfter) ? r.courseSetsAfter.reduce((a, s) => a + (s.outcomeCount || 0), 0) : "?"} RA</div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}

          {/* ── Pestaña: Importar RA — modo manual + sondeo (avanzado) ── */}
          {adminTab === "manual" && (<>
          <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
                <BookOpen size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Importar RA — modo manual (avanzado)
              </div>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Elige a mano cualquier conjunto (o varios) e impórtalo a cualquier curso por ID, incluso si ya tiene RA. Es un <b>merge</b>: nunca borra lo existente.</span>
            </div>
            <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12, padding: "8px 11px", background: "var(--brand-light)", borderRadius: 8, borderLeft: "3px solid var(--brand)", lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 7 }}>
                <Target size={14} strokeWidth={2.4} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
                <span>¿Solo quieres poblar un curso vacío? Es más rápido con el botón <b>"Importar RA"</b> que aparece en cada curso (pestaña <b>Cursos y alineaciones</b>, filtro "Sin RA") o al abrir <b>"Ver RA"</b>: te sugiere el conjunto de la asignatura automáticamente. Usa este modo manual para casos especiales.</span>
              </div>
              {/* Paso 1: descubrir el catálogo global */}
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>1 · Catálogo global (fuente) — marca el conjunto de la asignatura</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={loadGlobalCatalog}
                  disabled={impCatalogLoading}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: impCatalogLoading ? "not-allowed" : "pointer", background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  {impCatalogLoading ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <RefreshCw size={15} strokeWidth={2.4} />}
                  {impCatalog ? "Recargar catálogo global" : "Ver catálogo global"}
                </button>
              </div>
              {impCatalog && (
                <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", background: "var(--card)", fontSize: 11.5, color: "var(--muted)", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{(impCatalog.summary || []).length} conjunto(s) org-level {impCatalog.ok ? "" : `· export HTTP ${impCatalog.status}`}</span>
                    {impSelectedIds.length > 0 && (
                      <span style={{ color: "var(--brand)" }}>· {impSelectedIds.length} seleccionado(s)</span>
                    )}
                    {impSelectedIds.length > 0 && (
                      <button onClick={() => setImpSelected({})} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "var(--font)", textDecoration: "underline" }}>Limpiar</button>
                    )}
                  </div>
                  <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
                    <input
                      type="text"
                      placeholder="Filtrar conjunto por nombre o ImportId…"
                      value={impCatQuery}
                      onChange={e => setImpCatQuery(e.target.value)}
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 9, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", outline: "none" }}
                    />
                  </div>
                  <div style={{ maxHeight: 240, overflowY: "auto" }}>
                    {impCatFiltered.map((s, i) => {
                      const checked = !!impSelected[s.importId];
                      return (
                        <label key={s.importId || i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 12px", borderTop: "1px solid var(--border)", fontSize: 12, cursor: s.importId ? "pointer" : "default", background: checked ? "var(--brand-light)" : "transparent" }}>
                          <input type="checkbox" checked={checked} disabled={!s.importId} onChange={() => toggleImpSet(s.importId)} style={{ flexShrink: 0, accentColor: "var(--brand)" }} />
                          <span style={{ fontWeight: 700, color: "var(--text)" }}>{s.name || <em style={{ color: "var(--muted)" }}>(primario / My Learning Outcomes)</em>}</span>
                          <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11, flexShrink: 0 }}>{s.outcomeCount} RA</span>
                        </label>
                      );
                    })}
                    {impCatFiltered.length === 0 && (
                      <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)" }}>
                        {(impCatalog.summary || []).length === 0 ? "Sin conjuntos (revisa el scope outcomes:sets:export)." : "Sin coincidencias con el filtro."}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Paso 2: curso destino */}
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "16px 0 8px" }}>2 · Curso destino</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="ID del curso (ej: 6762)"
                  value={impTarget}
                  onChange={e => setImpTarget(e.target.value)}
                  style={{ flex: "0 1 180px", minWidth: 0, padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
                />
                <button
                  onClick={loadCourseSets}
                  disabled={impCourseLoading}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid var(--brand)", cursor: impCourseLoading ? "not-allowed" : "pointer", background: "var(--bg)", color: "var(--brand)", fontSize: 12.5, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {impCourseLoading ? <Loader2 size={14} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <ListChecks size={14} strokeWidth={2.4} />}
                  Ver RA del curso
                </button>
              </div>
              {impCourse && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                  Curso #{impCourse.orgUnitId}: <b style={{ color: impCourse.outcomeTotal === 0 ? "#dc2626" : "#059669" }}>{impCourse.outcomeTotal} RA</b> en {impCourse.setCount} conjunto(s)
                  {impCourse.outcomeTotal === 0 ? " — vacío, ideal para importar." : " — ya tiene RA (el import hará merge)."}
                </div>
              )}

              {/* Paso 3: importar */}
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "16px 0 8px" }}>
                3 · Importar {impSelectedIds.length > 0 ? `(${impSelectedIds.length} conjunto[s] seleccionado[s])` : "— selecciona un conjunto arriba"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => runImport(true)}
                  disabled={!!impRunning || impSelectedIds.length === 0}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid var(--border)", cursor: (impRunning || impSelectedIds.length === 0) ? "not-allowed" : "pointer", opacity: impSelectedIds.length === 0 ? 0.5 : 1, background: "var(--card)", color: "var(--text)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  {impRunning === "dry" ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={15} strokeWidth={2.4} />}
                  Previsualizar (dry-run)
                </button>
                <button
                  onClick={() => runImport(false)}
                  disabled={!!impRunning || impSelectedIds.length === 0}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: (impRunning || impSelectedIds.length === 0) ? "not-allowed" : "pointer", opacity: impSelectedIds.length === 0 ? 0.5 : 1, background: "linear-gradient(135deg, #059669 0%, #047857 100%)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  {impRunning === "real" ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={15} strokeWidth={2.4} />}
                  Importar al curso
                </button>
              </div>

              {impMsg && (
                <div style={{
                  marginTop: 10, fontSize: 12, borderRadius: 8, padding: "9px 12px", lineHeight: 1.5,
                  color: impMsg.type === "err" ? "#dc2626" : impMsg.type === "ok" ? "#059669" : "#1e40af",
                  background: impMsg.type === "err" ? "rgba(220,38,38,0.08)" : impMsg.type === "ok" ? "rgba(16,185,129,0.1)" : "rgba(37,99,235,0.08)",
                  border: `1px solid ${impMsg.type === "err" ? "rgba(220,38,38,0.3)" : impMsg.type === "ok" ? "rgba(16,185,129,0.3)" : "rgba(37,99,235,0.25)"}`,
                  display: "flex", alignItems: "flex-start", gap: 6, fontWeight: 700,
                }}>
                  {impMsg.type === "err" ? <AlertTriangle size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} /> : impMsg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} /> : <Search size={14} strokeWidth={2.4} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <span>{impMsg.text}</span>
                </div>
              )}
              {impResult && (impResult.courseSetsBefore || impResult.courseSetsAfter) && (
                <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: "var(--muted)" }}>
                  <div><b>Antes:</b> {Array.isArray(impResult.courseSetsBefore) ? impResult.courseSetsBefore.reduce((a, s) => a + (s.outcomeCount || 0), 0) : "?"} RA</div>
                  {impResult.courseSetsAfter && (
                    <div><b>Después:</b> {Array.isArray(impResult.courseSetsAfter) ? impResult.courseSetsAfter.reduce((a, s) => a + (s.outcomeCount || 0), 0) : "?"} RA</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sondeo del registro (diagnóstico, avanzado) */}
          <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
                <Search size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Sondeo del registro (diagnóstico)
              </div>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Prueba varios endpoints del registro global de RA para un ID (curso u organización). Solo lectura.</span>
            </div>
            <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="number"
                  placeholder="ID (curso u organización)"
                  value={orgId}
                  onChange={e => setOrgId(e.target.value)}
                  style={{ flex: "1 1 180px", minWidth: 0, maxWidth: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
                />
                <input
                  type="number"
                  placeholder="Programa # (ej: 24, opcional)"
                  value={probeProgram}
                  onChange={e => setProbeProgram(e.target.value)}
                  title="ID del programa que edita la coordinadora en /d2l/le/6606/lo/programs/{ID}"
                  style={{ flex: "0 1 190px", minWidth: 0, padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
                />
                <button
                  onClick={runProbe}
                  disabled={probing || !orgId}
                  style={{
                    flex: "0 0 auto", padding: "9px 16px", borderRadius: 10, border: "none",
                    cursor: probing || !orgId ? "not-allowed" : "pointer",
                    background: orgId && !probing ? "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)" : "var(--bg)",
                    color: orgId && !probing ? "#fff" : "var(--muted)",
                    fontSize: 13, fontWeight: 800, fontFamily: "var(--font)",
                    display: "inline-flex", alignItems: "center", gap: 7,
                  }}
                >
                  {probing ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={15} strokeWidth={2.4} />}
                  {probing ? "Sondeando…" : "Sondear registro"}
                </button>
              </div>

              {probeData && (
                <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", background: "var(--bg)", fontSize: 12, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>Sondeo registro · org #{probeData.orgUnitId} · versiones lo={probeData?.versions?.lo} align={probeData?.versions?.align} lp={probeData?.versions?.lp}</span>
                    <button onClick={() => setProbeData(null)} style={{ border: "none", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Cerrar</button>
                  </div>
                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {(probeData.results || []).map((r, i) => {
                      const ok = r.status === 200;
                      return (
                        <div key={i} style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 11.5, fontFamily: "var(--font-mono, monospace)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                            <span style={{
                              flex: "0 0 auto", padding: "1px 7px", borderRadius: 6, fontWeight: 800, fontSize: 11,
                              color: ok ? "#059669" : "#dc2626",
                              background: ok ? "rgba(16,185,129,0.12)" : "rgba(220,38,38,0.1)",
                            }}>{r.status ?? "ERR"}</span>
                            <span style={{ fontWeight: 800, color: "var(--text)" }}>{r.label}</span>
                            {typeof r.count === "number" && <span style={{ color: "var(--muted)" }}>· {r.count} items</span>}
                          </div>
                          <div style={{ color: "var(--muted)", wordBreak: "break-all" }}>{r.url}</div>
                          {r.sample != null && (
                            <pre style={{ margin: "4px 0 0", padding: "6px 8px", background: "var(--bg)", borderRadius: 6, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, color: "var(--text)", maxHeight: 140, overflowY: "auto" }}>
                              {typeof r.sample === "string" ? r.sample : JSON.stringify(r.sample, null, 2)}
                            </pre>
                          )}
                          {r.error && <div style={{ color: "#dc2626" }}>{String(r.error)}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          </>)}

          {/* ── Pestaña: Cursos y alineaciones (semestres + consulta por ID) ── */}
          {adminTab === "cursos" && (<>
          {/* ── Fase 2: Cursos por semestre (vincular RA a cursos nuevos) ── */}
          <div style={{ marginBottom: 18, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 7 }}>
                <LayoutGrid size={16} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Cursos por semestre
              </div>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Busca el semestre (ej. 202620), da “Ver cursos” y entra a los RA de cada oferta.</span>
            </div>
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Nombre o código del semestre (ej: 202620)"
                  value={semQuery}
                  onChange={e => setSemQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") searchSemester(); }}
                  style={{ flex: "1 1 220px", minWidth: 0, padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none" }}
                />
                <button
                  onClick={searchSemester}
                  disabled={semLoading || !semQuery.trim()}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: semLoading || !semQuery.trim() ? "not-allowed" : "pointer", background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  {semLoading ? <Loader2 size={15} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={15} strokeWidth={2.4} />}
                  Buscar semestre
                </button>
              </div>

              {/* Semestres encontrados */}
              {semUnits && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {semUnits.length === 0 && (
                    <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "6px 2px" }}>No hay semestres que coincidan con “{semQuery.trim()}”.</div>
                  )}
                  {semUnits.map(u => {
                    const kind = classifyUnit(u);
                    const isOffering = kind === "offering";
                    const isGroup = kind === "group";
                    return (
                      <div key={u.id} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", opacity: isGroup ? 0.6 : 1 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{u.typeName} · #{u.id}{u.code ? ` · ${u.code}` : ""}</div>
                        </div>
                        {isGroup ? (
                          <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: "var(--muted)", background: "var(--bg)", border: "1px solid var(--border)", padding: "3px 9px", borderRadius: 6 }}>
                            Sección — usa la oferta con el mismo código
                          </span>
                        ) : isOffering ? (
                          <button
                            onClick={() => fetchLO(u.id)}
                            style={{ marginLeft: "auto", flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <ListChecks size={13} strokeWidth={2.4} /> Ver RA
                          </button>
                        ) : (
                          <button
                            onClick={() => loadCourses(u.id)}
                            disabled={courseLoadingFor === u.id}
                            style={{ marginLeft: "auto", flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--brand)", cursor: "pointer", background: "var(--bg)", color: "var(--brand)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            {courseLoadingFor === u.id ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <LayoutGrid size={13} strokeWidth={2.4} />}
                            Ver cursos
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Cursos de la unidad elegida */}
              {semCourses && (
                <div style={{ marginTop: 12, borderTop: "1px dashed var(--border)", paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={chipStyle}>Unidad #{semCourses.orgUnitId} · {semCourses.count} descendientes</span>
                    {Object.entries(semCourses.typeHistogram || {}).map(([k, v]) => (
                      <span key={k} style={{ ...chipStyle, fontSize: 11 }}>{k} ({v})</span>
                    ))}
                    <button
                      onClick={analyzeStatuses}
                      disabled={analyzing || statusCounts.total === 0}
                      title="Consulta los RA de cada oferta y clasifica su estado (sin RA / sin alinear / alineado)"
                      style={{
                        marginLeft: "auto", padding: "7px 14px", borderRadius: 999, border: "none",
                        cursor: analyzing || statusCounts.total === 0 ? "not-allowed" : "pointer",
                        background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
                        color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)",
                        display: "inline-flex", alignItems: "center", gap: 7,
                      }}
                    >
                      {analyzing ? <Loader2 size={13} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <TrendingUp size={13} strokeWidth={2.4} />}
                      {analyzing
                        ? `Analizando… ${analyzeProgress.done}/${analyzeProgress.total}`
                        : statusCounts.analyzed > 0 ? "Reanalizar estado" : "Analizar estado (RA/alineación)"}
                    </button>
                  </div>

                  {/* Filtros por estado (aparecen tras analizar) */}
                  {statusCounts.analyzed > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {[
                        { key: "all",        label: "Todas",       count: statusCounts.total },
                        { key: "sinRA",      label: "Sin RA",      count: statusCounts.sinRA },
                        { key: "sinAlinear", label: "Sin alinear", count: statusCounts.sinAlinear },
                        { key: "alineado",   label: "Alineadas",   count: statusCounts.alineado },
                        ...(statusCounts.error > 0 ? [{ key: "error", label: "Error", count: statusCounts.error }] : []),
                      ].map(f => {
                        const on = statusFilter === f.key;
                        const meta = STATUS_META[f.key];
                        return (
                          <button
                            key={f.key}
                            onClick={() => setStatusFilter(f.key)}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              fontSize: 11.5, fontWeight: 800, padding: "5px 11px", borderRadius: 999,
                              cursor: "pointer", fontFamily: "var(--font)",
                              border: on ? `1.5px solid ${meta ? meta.color : "var(--brand)"}` : "1.5px solid var(--border)",
                              background: on ? (meta ? meta.bg : "var(--brand-light)") : "var(--card)",
                              color: on ? (meta ? meta.color : "var(--brand)") : "var(--muted)",
                            }}
                          >
                            {f.label}
                            <span style={{ fontSize: 10.5, opacity: 0.85 }}>({f.count})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="Filtrar cursos por nombre, código o id…"
                    value={courseQuery}
                    onChange={e => setCourseQuery(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontFamily: "var(--font)", outline: "none" }}
                  />

                  {/* Barra de selección múltiple: marca varios cursos → import masivo */}
                  {coursesFiltered.length > 0 && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <button
                        onClick={toggleBulkVisible}
                        style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: "pointer", background: "var(--card)", color: "var(--text)", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <ListChecks size={13} strokeWidth={2.4} />
                        {coursesFiltered.every(c => bulkSel[c.id])
                          ? "Desmarcar visibles"
                          : `Marcar visibles (${coursesFiltered.length})`}
                      </button>
                      {bulkIds.length > 0 && (
                        <>
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--brand)", background: "var(--brand-light)", border: "1px solid var(--brand)", padding: "4px 10px", borderRadius: 999 }}>
                            {bulkIds.length} curso(s) marcado(s)
                          </span>
                          <button
                            onClick={() => { setBulkSel({}); setBulkPanel(null); }}
                            style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--muted)", fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font)" }}
                          >
                            Limpiar
                          </button>
                          <button
                            onClick={openBulkPanel}
                            title="Importar los mismos conjuntos de RA a todos los cursos marcados"
                            style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 8, border: bulkPanel ? "1.5px solid var(--brand)" : "none", cursor: "pointer", background: bulkPanel ? "var(--brand-light)" : "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: bulkPanel ? "var(--brand)" : "#fff", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <Upload size={13} strokeWidth={2.4} />
                            {bulkPanel ? "Cerrar panel masivo" : `Importar RA a ${bulkIds.length} curso(s)`}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Panel de import masivo (conjuntos sugeridos para los marcados) */}
                  {bulkPanel && (
                    <BulkImportPanel
                      bulk={bulkPanel}
                      impCatalog={impCatalog}
                      nCourses={bulkIds.length}
                      onToggle={toggleBulkSet}
                      onQuery={setBulkPanelQuery}
                      onRun={runBulkImport}
                    />
                  )}

                  <div style={{ maxHeight: 360, overflowY: "auto", marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {coursesFiltered.map(c => {
                      const st = analysis[c.id];
                      const meta = st ? STATUS_META[st.status] : null;
                      const isEmpty = st?.status === "sinRA";
                      const mOpen = matcher && matcher.courseId === c.id;
                      return (
                      <div key={c.id} style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 0, border: `1px solid ${mOpen || bulkSel[c.id] ? "var(--brand)" : "var(--border)"}`, borderRadius: 8, overflow: "hidden", background: bulkSel[c.id] ? "var(--brand-light)" : undefined }}>
                       <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px" }}>
                        <input
                          type="checkbox"
                          checked={!!bulkSel[c.id]}
                          onChange={() => toggleBulkCourse(c.id)}
                          title="Marcar para importar RA en lote"
                          style={{ width: 16, height: 16, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.typeName} · #{c.id}{c.code ? ` · ${c.code}` : ""}</div>
                        </div>
                        {meta && (
                          <span
                            title={st.status === "error" ? (st.err || "Error") : (st.status === "sinRA" ? "Sin resultados de aprendizaje" : `${st.raCount} RA definidos`)}
                            style={{
                              flexShrink: 0, fontSize: 10.5, fontWeight: 800,
                              padding: "3px 9px", borderRadius: 999,
                              color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
                            }}
                          >
                            {meta.label}
                          </span>
                        )}
                        {(isEmpty || mOpen) && (
                          <button
                            onClick={() => openMatcher(c)}
                            title="Sugerir e importar el conjunto de RA que corresponde a esta asignatura"
                            style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: mOpen ? "1.5px solid var(--brand)" : "1.5px solid var(--border)", cursor: "pointer", background: mOpen ? "var(--brand-light)" : "var(--bg)", color: mOpen ? "var(--brand)" : "var(--text)", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                          >
                            <Target size={13} strokeWidth={2.4} /> {mOpen ? "Cerrar" : "Importar RA"}
                          </button>
                        )}
                        <button
                          onClick={() => fetchLO(c.id, c.name)}
                          style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 6 }}
                        >
                          <ListChecks size={13} strokeWidth={2.4} /> Ver RA
                        </button>
                       </div>

                       {mOpen && (
                        <MatcherPanel
                          matcher={matcher}
                          impCatalog={impCatalog}
                          onToggle={toggleMatcherSet}
                          onQuery={setMatcherQuery}
                          onRun={runMatcherImport}
                        />
                       )}
                      </div>
                      );
                    })}
                    {coursesFiltered.length === 0 && (
                      <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "8px 2px", lineHeight: 1.5 }}>
                        {(semCourses.items || []).length > 0 && !courseQuery.trim()
                          ? `Esta unidad (#${semCourses.orgUnitId}) no contiene ofertas de curso, solo secciones/grupos. Si #${semCourses.orgUnitId} ya es una oferta de curso, usa "Consultar RA" con ese ID directamente.`
                          : "Sin ofertas de curso que coincidan."}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Consulta directa de un curso por ID */}
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", margin: "2px 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
            <ListChecks size={14} strokeWidth={2.4} style={{ color: "var(--brand)" }} /> Consultar un curso por ID
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <input
              type="number"
              placeholder="ID del curso (orgUnitId)"
              value={orgId}
              onChange={e => setOrgId(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") fetchLO(); }}
              style={{ flex: "1 1 160px", minWidth: 0, maxWidth: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font)", outline: "none", fontWeight: 500 }}
            />
            <button
              onClick={() => fetchLO()}
              disabled={loading || !orgId}
              style={{
                flex: "0 0 auto", padding: "10px 18px", borderRadius: 10, border: "none",
                cursor: loading || !orgId ? "not-allowed" : "pointer",
                background: orgId && !loading ? "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)" : "var(--bg)",
                color: orgId && !loading ? "#fff" : "var(--muted)",
                fontSize: 14, fontWeight: 800, fontFamily: "var(--font)",
                display: "inline-flex", alignItems: "center", gap: 8,
              }}
            >
              {loading ? <Loader2 size={16} strokeWidth={2.4} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Search size={16} strokeWidth={2.4} />}
              {loading ? "Consultando…" : "Consultar RA"}
            </button>
          </div>

          {data && !loading && (
            <div>
              {/* Resumen: chips */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <span style={chipStyle}><ListChecks size={13} strokeWidth={2.4} /> {outcomes.length} RA definidos</span>
                <span style={chipStyle}><TrendingUp size={13} strokeWidth={2.4} /> {rubricCount} rúbricas alineadas</span>
                <span style={chipStyle}><BookOpen size={13} strokeWidth={2.4} /> {activityCount} actividades alineadas</span>
                <span style={{
                  ...chipStyle,
                  background: hasAlignments ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                  color: hasAlignments ? "#059669" : "#d97706",
                  borderColor: hasAlignments ? "rgba(16,185,129,0.3)" : "rgba(245,158,11,0.3)",
                }}>
                  {hasAlignments ? <CheckCircle2 size={13} strokeWidth={2.4} /> : <AlertTriangle size={13} strokeWidth={2.4} />}
                  {hasAlignments ? "Alineado" : "Sin alinear"}
                </span>
                {canEdit && (
                  <button
                    onClick={() => { setEditMode(m => !m); setWriteMsg(null); }}
                    style={{
                      ...chipStyle, cursor: "pointer",
                      background: editMode ? "var(--brand)" : "var(--bg)",
                      color: editMode ? "#fff" : "var(--brand)",
                      borderColor: "var(--brand)",
                    }}
                  >
                    <Pencil size={13} strokeWidth={2.4} /> {editMode ? "Cerrar edición" : "Editar alineaciones"}
                  </button>
                )}
              </div>

              {!hasOutcomes ? (
                <div style={{ background: "var(--bg)", borderRadius: 10, border: "1px dashed var(--border)", overflow: "hidden" }}>
                  <div style={{ padding: "18px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                    <AlertTriangle size={20} strokeWidth={2} style={{ color: "#d97706", marginBottom: 6 }} />
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>Este curso (#{loadedOrg}) no tiene resultados de aprendizaje.</div>
                    <div style={{ fontSize: 12, marginBottom: 12 }}>Debe importarse o registrarse el conjunto de RA en Brightspace.</div>
                    <button
                      onClick={() => openMatcher({ id: loadedOrg, name: loadedCourseName })}
                      title="Sugerir e importar el conjunto de RA que corresponde a esta asignatura"
                      style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: matcher && matcher.courseId === loadedOrg ? "var(--brand-light)" : "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)", color: matcher && matcher.courseId === loadedOrg ? "var(--brand)" : "#fff", fontSize: 13, fontWeight: 800, fontFamily: "var(--font)", display: "inline-flex", alignItems: "center", gap: 7, ...(matcher && matcher.courseId === loadedOrg ? { border: "1.5px solid var(--brand)" } : {}) }}
                    >
                      <Target size={15} strokeWidth={2.4} /> {matcher && matcher.courseId === loadedOrg ? "Cerrar" : "Importar RA a este curso"}
                    </button>
                  </div>
                  {matcher && matcher.courseId === loadedOrg && (
                    <MatcherPanel
                      matcher={matcher}
                      impCatalog={impCatalog}
                      onToggle={toggleMatcherSet}
                      onQuery={setMatcherQuery}
                      onRun={runMatcherImport}
                    />
                  )}
                </div>
              ) : editMode ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Aviso: esto escribe en Brightspace */}
                  <div style={{
                    fontSize: 12, color: "#92400e", background: "rgba(245,158,11,0.12)",
                    border: "1px solid rgba(245,158,11,0.35)", borderRadius: 10,
                    padding: "9px 12px", display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
                  }}>
                    <AlertTriangle size={15} strokeWidth={2.3} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Los cambios se escriben directamente en Brightspace (curso #{loadedOrg}). Guardar reemplaza la lista de RA alineados de esa actividad.</span>
                  </div>

                  {writeMsg && (
                    <div style={{
                      fontSize: 12.5, borderRadius: 8, padding: "8px 12px",
                      display: "flex", alignItems: "center", gap: 6,
                      color: writeMsg.type === "ok" ? "#059669" : "#dc2626",
                      background: writeMsg.type === "ok" ? "rgba(16,185,129,0.1)" : "rgba(220,38,38,0.08)",
                    }}>
                      {writeMsg.type === "ok" ? <CheckCircle2 size={14} strokeWidth={2.4} /> : <AlertTriangle size={14} strokeWidth={2.4} />}
                      {writeMsg.text}
                    </div>
                  )}

                  {/* Actividades ya alineadas: editar (replace) */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      Actividades alineadas ({activityCount})
                    </div>
                    {activityCount === 0 ? (
                      <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "10px 12px", background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 10 }}>
                        Aún no hay actividades alineadas. Usa el formulario de abajo para crear la primera alineación.
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 420, overflowY: "auto" }}>
                        {Object.keys(data.activityToOutcomes || {}).map(key => {
                          const idx = key.indexOf(":");
                          const type = key.slice(0, idx);
                          const objectId = key.slice(idx + 1);
                          const chosen = sel[key] || [];
                          const actName = (data.activityNames || {})[key];
                          const typeLabel = ACTIVITY_TYPE_LABELS[type] || type;
                          return (
                            <div key={key} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  <span style={{ flex: "0 0 auto", fontSize: 10.5, fontWeight: 800, color: "var(--brand)", background: "var(--brand-light)", padding: "2px 7px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>{typeLabel}</span>
                                  {actName
                                    ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{actName}</span>
                                    : <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>#{objectId}</span>}
                                </span>
                                <button
                                  onClick={() => saveActivity(key)}
                                  disabled={savingKey === key}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "6px 12px", borderRadius: 8, border: "none",
                                    cursor: savingKey === key ? "not-allowed" : "pointer",
                                    background: "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
                                    color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "var(--font)",
                                  }}
                                >
                                  {savingKey === key ? <Loader2 size={13} strokeWidth={2.6} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Save size={13} strokeWidth={2.6} />}
                                  {savingKey === key ? "Guardando…" : "Guardar"}
                                </button>
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {allOutcomes.map(o => {
                                  const on = chosen.includes(o.guid);
                                  const p = raParts(o);
                                  return (
                                    <button
                                      key={o.guid}
                                      onClick={() => toggleSel(key, o.guid)}
                                      title={p.full}
                                      style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999,
                                        cursor: "pointer", fontFamily: "var(--font-mono)",
                                        border: on ? "1.5px solid var(--brand)" : "1.5px solid var(--border)",
                                        background: on ? "var(--brand-light)" : "transparent",
                                        color: on ? "var(--brand)" : "var(--muted)",
                                      }}
                                    >
                                      {on ? <CheckCircle2 size={11} strokeWidth={2.6} /> : <span style={{ width: 11 }} />}
                                      {p.code || (p.title.length > 22 ? p.title.slice(0, 22) + "…" : p.title)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Nueva alineación (add) */}
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
                      Alinear una actividad nueva
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      <select
                        value={newType}
                        onChange={e => setNewType(e.target.value)}
                        style={{ flex: "1 1 150px", minWidth: 0, maxWidth: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontWeight: 600, fontFamily: "var(--font)" }}
                      >
                        {ALIGN_ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input
                        type="text"
                        placeholder="ID de la actividad (objectId)"
                        value={newId}
                        onChange={e => setNewId(e.target.value)}
                        style={{ flex: "1 1 180px", minWidth: 0, maxWidth: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12.5, fontWeight: 500, fontFamily: "var(--font)", outline: "none" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {allOutcomes.map(o => {
                        const on = newSel.includes(o.guid);
                        const p = raParts(o);
                        return (
                          <button
                            key={o.guid}
                            onClick={() => toggleNewSel(o.guid)}
                            title={p.full}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999,
                              cursor: "pointer", fontFamily: "var(--font-mono)",
                              border: on ? "1.5px solid var(--brand)" : "1.5px solid var(--border)",
                              background: on ? "var(--brand-light)" : "transparent",
                              color: on ? "var(--brand)" : "var(--muted)",
                            }}
                          >
                            {on ? <CheckCircle2 size={11} strokeWidth={2.6} /> : <span style={{ width: 11 }} />}
                            {p.code || (p.title.length > 22 ? p.title.slice(0, 22) + "…" : p.title)}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={saveNew}
                      disabled={savingKey === "__new__" || !newId.trim() || newSel.length === 0}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "9px 16px", borderRadius: 10, border: "none",
                        cursor: (savingKey === "__new__" || !newId.trim() || newSel.length === 0) ? "not-allowed" : "pointer",
                        background: (!newId.trim() || newSel.length === 0) ? "var(--bg)" : "linear-gradient(135deg, var(--brand) 0%, #1e40af 100%)",
                        color: (!newId.trim() || newSel.length === 0) ? "var(--muted)" : "#fff",
                        fontSize: 13, fontWeight: 800, fontFamily: "var(--font)",
                      }}
                    >
                      {savingKey === "__new__" ? <Loader2 size={14} strokeWidth={2.6} style={{ animation: "rotateGlow 1s linear infinite" }} /> : <Plus size={14} strokeWidth={2.6} />}
                      {savingKey === "__new__" ? "Alineando…" : "Agregar alineación"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
                  {outcomes.map(o => {
                    const p = raParts(o);
                    return (
                    <div key={o.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10 }}>
                      {p.code && (
                        <span style={{ flex: "0 0 auto", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color: "var(--brand)", background: "var(--brand-light)", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>
                          {p.code}
                        </span>
                      )}
                      <span style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.4, fontWeight: 500 }}>
                        {p.title || "(sin título)"}
                      </span>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          </>)}
        </section>
      </div>
    </div>
  );
}
