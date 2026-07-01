import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import StudentAvatar from "../components/ui/StudentAvatar";
import Breadcrumb from "../components/ui/Breadcrumb";
import LastUpdated from "../components/ui/LastUpdated";
import CommandPalette from "../components/ui/CommandPalette";
import ContextualTip from "../components/ui/ContextualTip";
import SmartAlerts from "../components/dashboard/SmartAlerts";
import CourseTrends from "../components/dashboard/CourseTrends";
import DueDateCalendar from "../components/dashboard/DueDateCalendar";
import AINarrativeSummary from "../components/dashboard/AINarrativeSummary";
import GradePredictions from "../components/dashboard/GradePredictions";
import EvidenceReports from "../components/dashboard/EvidenceReports";
const CoordinatorDashboard = React.lazy(() => import("./CoordinatorDashboard"));
const StudentPortal = React.lazy(() => import("./StudentPortal"));
import useStudentNotes from "../hooks/useStudentNotes";
import useCompactMode from "../hooks/useCompactMode";
import useKeyboardShortcuts from "../hooks/useKeyboardShortcuts";
import useCourseSnapshots from "../hooks/useCourseSnapshots";
import useStudentChat from "../hooks/useStudentChat";
import { exportStudentsCsv, exportCourseReport, STUDENT_CSV_COLUMNS } from "../utils/export";
import { apiUrl, apiGet, mapLimit, API_BASE_URL } from "../utils/api";
import { sanitizeHtml } from "../utils/sanitize";
import { elSpeak, elStop, elListen } from "../utils/speech";
import { COLORS, STATUS_CONFIG, colorForRisk, colorForPct, colorForLearningOutcome } from "../utils/colors";
import {
  toDate, weeksBetween, clamp, normStatus,
  fmtPct, fmtGrade10FromPct, contentRhythmStatus,
  parseFormulaReferences, matchEvidencesByFormula,
  detectCortePeriod, buildCorteGroups,
  flattenOutcomeDescriptions, isVisibleContentItem,
  safeAvg, pickCriticalMacroFromGemelo,
  computeRiskFromPct, suggestRouteForStudent,
} from "../utils/helpers";
import { isStudentRole } from "../utils/roles";
/**
 * =========================
 * Config
 * =========================
 */

const DEFAULT_ORG_UNIT_ID = 0; // Se sobreescribe con el curso del LTI o selección del docente

/**
 * =========================
 * CSS injection
 * =========================
 */
const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    /* ── Layout ── */
    --sidebar-w: 220px;

    /* ── Colors ── */
    --bg: #F2F4F8;
    --bg2: #FAFBFD;
    --card: #FFFFFF;
    --border: #E4E8EF;
    --border2: #CDD3DE;
    --text: #0F1827;
    --muted: #5A6580;
    --brand: #0B5FFF;
    --brand-2: #003EA6;
    --brand-light: #EBF1FF;
    --brand-light2: #D6E4FF;
    --shadow: 0 1px 3px rgba(15,24,39,0.06), 0 4px 16px rgba(15,24,39,0.04);
    --shadow-md: 0 4px 12px rgba(15,24,39,0.08), 0 8px 24px rgba(15,24,39,0.06);
    --shadow-lg: 0 8px 32px rgba(15,24,39,0.12), 0 16px 48px rgba(15,24,39,0.08);
    --radius: 16px;
    --radius-lg: 24px;
    --font: 'Manrope', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', monospace;
    --ok: #12B76A;
    --ok-bg: #ECFDF3;
    --ok-border: #A9EFC5;
    --watch: #E8900A;
    --watch-bg: #FFF8ED;
    --watch-border: #FCD385;
    --critical: #D92D20;
    --critical-bg: #FEF3F2;
    --critical-border: #FDA29B;
    --pending: #8B96A8;
    --pending-bg: #F1F3F7;
    --pending-border: #D1D8E4;
  }

  .dark {
    --bg: #0B1120;
    --bg2: #101828;
    --card: #1A2332;
    --border: #2D3B4F;
    --border2: #3D4F66;
    --text: #F1F5FB;
    --muted: #94A3BB;
    --brand: #3B82F6;
    --brand-light: #172554;
    --brand-light2: #1E3A5F;
    --shadow: 0 1px 4px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.35);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.65);
    --ok: #34D399;
    --ok-bg: #0D2818;
    --ok-border: #166534;
    --watch: #FBBF24;
    --watch-bg: #27200A;
    --watch-border: #854D0E;
    --critical: #F87171;
    --critical-bg: #2A0F0F;
    --critical-border: #991B1B;
    --pending-bg: #1A2332;
    --pending-border: #2D3B4F;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "cv11", "ss01";
  }

  /* ── Sidebar Layout ── */
  .app-sidebar {
    position: fixed;
    left: 0; top: 0; bottom: 0;
    width: var(--sidebar-w);
    background: var(--card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    z-index: 100;
    transition: transform 0.28s cubic-bezier(.4,0,.2,1);
  }
  .app-sidebar.collapsed { transform: translateX(calc(-1 * var(--sidebar-w))); }
  .sidebar-logo {
    padding: 22px 20px 18px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 10px;
  }
  .sidebar-logo-icon {
    width: 36px; height: 36px;
    background: var(--brand);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 16px; font-weight: 900;
    letter-spacing: -0.05em; flex-shrink: 0;
  }
  .sidebar-logo-text { line-height: 1.2; }
  .sidebar-logo-name { font-size: 12px; font-weight: 800; color: var(--text); letter-spacing: 0.02em; }
  .sidebar-logo-sub { font-size: 10px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
  .sidebar-nav { padding: 12px 10px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .sidebar-section-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--muted);
    padding: 8px 10px 4px; margin-top: 8px;
  }
  .sidebar-nav-item {
    display: flex; align-items: center; gap: 9px;
    padding: 9px 12px; border-radius: 10px;
    font-size: 13px; font-weight: 600; color: var(--muted);
    cursor: pointer; transition: all 0.15s ease;
    border: none; background: transparent; width: 100%; text-align: left;
  }
  .sidebar-nav-item:hover { background: var(--bg); color: var(--text); }
  .sidebar-nav-item.active {
    background: var(--brand-light);
    color: var(--brand);
  }
  .sidebar-nav-item.active .snav-icon { color: var(--brand); }
  .sidebar-nav-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: transparent; transition: background 0.15s; flex-shrink: 0;
    margin-left: auto;
  }
  .sidebar-nav-item.active .sidebar-nav-dot { background: var(--brand); }
  .snav-icon { font-size: 16px; flex-shrink: 0; }
  .sidebar-footer {
    padding: 12px 10px 16px;
    border-top: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 4px;
  }
  .sidebar-course-pill {
    padding: 10px 12px; border-radius: 10px;
    background: var(--brand-light); margin-bottom: 8px;
  }
  .sidebar-course-label { font-size: 9px; font-weight: 800; color: var(--brand); text-transform: uppercase; letter-spacing: 0.1em; }
  .sidebar-course-name { font-size: 11px; font-weight: 700; color: var(--text); margin-top: 2px; line-height: 1.3; }

  /* ── Top Bar ── */
  .app-topbar {
    position: fixed;
    left: var(--sidebar-w); right: 0; top: 0;
    height: 56px;
    background: rgba(255,255,255,0.9);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px 0 20px;
    z-index: 50;
    transition: left 0.28s cubic-bezier(.4,0,.2,1);
  }
  .dark .app-topbar { background: rgba(17,24,39,0.9); }
  .app-topbar.sidebar-collapsed { left: 0; }
  .topbar-search {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 7px 12px;
    width: 240px;
    transition: all 0.15s;
  }
  .topbar-search:focus-within {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(11,95,255,0.1);
    width: 280px;
  }
  .topbar-search input {
    border: none; background: transparent; outline: none;
    font-size: 13px; font-weight: 500; color: var(--text);
    font-family: var(--font); flex: 1;
  }
  .topbar-search input::placeholder { color: var(--muted); }
  .topbar-icon-btn {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 9px; border: 1px solid var(--border);
    background: transparent; cursor: pointer;
    color: var(--muted); font-size: 15px;
    transition: all 0.15s; flex-shrink: 0;
  }
  .topbar-icon-btn:hover { background: var(--bg); color: var(--text); }
  .topbar-avatar {
    width: 32px; height: 32px; border-radius: 50%;
    background: var(--brand); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 800; flex-shrink: 0;
    cursor: pointer;
  }

  /* ── Main content offset ── */
  .app-main {
    margin-left: var(--sidebar-w);
    padding-top: 56px;
    min-height: 100vh;
    transition: margin-left 0.28s cubic-bezier(.4,0,.2,1);
  }
  .app-main.sidebar-collapsed { margin-left: 0; }
  .app-content { padding: 24px 28px; max-width: 100%; }

  @media (max-width: 1024px) {
    .app-sidebar { transform: translateX(calc(-1 * var(--sidebar-w))); }
    .app-sidebar.mobile-open { transform: translateX(0); }
    .app-topbar { left: 0; }
    .app-main { margin-left: 0; }
    .sidebar-backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 90; backdrop-filter: blur(2px);
    }
  }

  /* ── Floating AI button ── */
  .ai-fab {
    position: fixed; bottom: 28px; right: 28px;
    z-index: 200;
  }
  .ai-fab-btn {
    width: 56px; height: 56px;
    background: var(--brand);
    border-radius: 50%;
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px;
    box-shadow: 0 4px 20px rgba(11,95,255,0.4), 0 2px 8px rgba(11,95,255,0.2);
    transition: all 0.2s ease;
    position: relative;
  }
  .ai-fab-btn:hover { transform: scale(1.08); box-shadow: 0 8px 28px rgba(11,95,255,0.5); }
  .ai-fab-btn.active { background: var(--brand-2); }
  .ai-fab-tooltip {
    position: absolute; bottom: 68px; right: 0;
    background: var(--card); border: 1px solid var(--border);
    border-radius: 10px; padding: 7px 12px;
    font-size: 11px; font-weight: 700; color: var(--text);
    white-space: nowrap; box-shadow: var(--shadow);
    animation: fadeUp 0.2s ease both;
  }
  .ai-fab-panel {
    position: absolute; bottom: 72px; right: 0;
    width: 380px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    display: flex; flex-direction: column;
    max-height: 520px;
    animation: fadeUp 0.25s cubic-bezier(.4,0,.2,1) both;
  }
  @media (max-width: 480px) { .ai-fab-panel { width: calc(100vw - 48px); right: -4px; } }
  .ai-fab-panel-header {
    padding: 16px 18px;
    background: var(--brand);
    color: #fff;
    display: flex; align-items: center; justify-content: space-between;
    flex-shrink: 0;
  }

  /* ── Student detail upgrades ── */
  .grade-ring-wrap {
    position: relative;
    display: flex; align-items: center; justify-content: center;
  }
  .grade-ring-svg { transform: rotate(-90deg); }
  .grade-ring-label {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .route-card {
    background: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
    border-radius: var(--radius);
    padding: 20px;
    color: #fff;
    position: relative;
    overflow: hidden;
  }
  .route-card::before {
    content: ''; position: absolute;
    top: -40px; right: -40px;
    width: 120px; height: 120px;
    border-radius: 50%;
    background: rgba(255,255,255,0.06);
  }
  .route-step {
    display: flex; gap: 12px; align-items: flex-start;
    padding: 12px 14px; border-radius: 10px;
    background: rgba(255,255,255,0.1);
    margin-bottom: 8px;
  }
  .route-step.done { background: rgba(255,255,255,0.15); }
  .route-step.pending { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); }

  .cesa-loader-wrap {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg);
    z-index: 100;
  }
  .cesa-loader-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 40px 48px;
    text-align: center;
    box-shadow: var(--shadow-lg);
    min-width: 320px;
    max-width: 480px;
  }
  .cesa-loader-title { font-size: 20px; font-weight: 800; color: var(--text); }
  .cesa-loader-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
  .cesa-loader-center { margin: 28px 0; }
  .cesa-loader-foot { font-size: 12px; color: var(--muted); }

  .cesa-water-text {
    position: relative; display: inline-block;
    font-size: 56px; font-weight: 900; letter-spacing: -2px;
    overflow: hidden; height: 72px; line-height: 72px;
  }
  .cesa-water-text__outline {
    color: transparent;
    -webkit-text-stroke: 2px var(--border);
  }
  .cesa-water-text__fill {
    position: absolute; inset: 0;
    color: var(--brand);
    clip-path: inset(100% 0 0 0);
    animation: waterFill 1.8s ease-in-out infinite alternate;
  }
  .cesa-water-text__wave {
    position: absolute; bottom: 0; left: -100%;
    width: 300%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(11,95,255,.08), transparent);
    animation: waveSlide 2s linear infinite;
  }
  @keyframes waterFill {
    0% { clip-path: inset(100% 0 0 0); }
    100% { clip-path: inset(0% 0 0 0); }
  }
  @keyframes waveSlide {
    from { transform: translateX(0); }
    to { transform: translateX(33.33%); }
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .fade-up { animation: fadeUp 0.35s ease both; }
  .fade-up-1 { animation-delay: 0.05s; }
  .fade-up-2 { animation-delay: 0.1s; }
  .fade-up-3 { animation-delay: 0.15s; }
  .fade-up-4 { animation-delay: 0.2s; }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }
  .pulse-dot {
    display: inline-block; width: 8px; height: 8px;
    border-radius: 50%; animation: pulse 1.4s ease infinite;
  }

  @keyframes fillBar {
    from { width: 0%; }
    to { width: var(--target-w); }
  }
  .fill-bar { animation: fillBar 0.7s cubic-bezier(.4,0,.2,1) both; animation-delay: 0.2s; }

  .drawer-enter { animation: drawerIn 0.28s cubic-bezier(.4,0,.2,1) both; }
  @keyframes drawerIn {
    from { transform: translateX(48px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  /* ── Page tab transitions ── */
  @keyframes tabIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .tab-enter { animation: tabIn 0.3s cubic-bezier(.4,0,.2,1) both; }

  /* ── Card hover lift ── */
  .kpi-card { transition: box-shadow 0.18s ease, transform 0.18s ease; }
  .kpi-card:hover { box-shadow: var(--shadow-md) !important; }

  /* ── Sidebar nav hover slide ── */
  .sidebar-nav-item { transition: all 0.15s ease; }
  .sidebar-nav-item:not(.active):hover { transform: translateX(3px); }

  .tr-hover { transition: all 0.15s ease; }
  .tr-hover:hover { background: var(--brand-light) !important; }
  .tr-hover:hover td { color: var(--text) !important; }

  /* ── Responsive: narrow viewport improvements ── */
  @media (max-width: 640px) {
    .app-content { padding: 14px 12px; }
    .kpi-card { padding: 14px; border-radius: 16px; }
    .ai-fab { bottom: 16px; right: 16px; }
    .ai-fab-panel { bottom: 68px; }
    .sidebar-logo-name { font-size: 11px; }
  }
  @media (max-width: 480px) {
    .ai-fab-panel { width: calc(100vw - 36px); right: -4px; }
    .ai-fab-btn { width: 48px; height: 48px; font-size: 18px; }
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 999px;
    font-size: 10px; font-weight: 800; white-space: nowrap;
    letter-spacing: 0.04em; text-transform: uppercase;
  }

  .kpi-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 20px;
    box-shadow: var(--shadow);
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }
  .kpi-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }

  .tag {
    display: inline-flex; align-items: center;
    padding: 3px 9px; border-radius: 6px;
    font-size: 10px; font-weight: 800;
    letter-spacing: 0.03em;
    background: var(--brand-light);
    color: var(--brand);
  }

  .chip {
    display: inline-flex; align-items: center; gap: 4px;
    border: 1px solid var(--border);
    border-radius: 8px; padding: 4px 10px;
    font-size: 12px; font-weight: 700;
    background: var(--card); color: var(--muted);
    cursor: pointer; transition: all 0.15s ease;
  }
  .chip:hover, .chip.active {
    border-color: var(--brand);
    color: var(--brand);
    background: var(--brand-light);
  }

  .btn {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--text);
    border-radius: 10px;
    padding: 8px 14px;
    cursor: pointer;
    font-weight: 700;
    font-size: 13px;
    font-family: var(--font);
    transition: all 0.15s ease;
    display: inline-flex; align-items: center; gap: 6px;
    letter-spacing: -0.01em;
  }
  .btn:hover {
    border-color: var(--brand); color: var(--brand);
    background: var(--brand-light); transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(11,95,255,0.1);
  }
  .btn:active { transform: translateY(0); }
  .btn-primary {
    background: var(--brand); color: #fff; border-color: var(--brand);
    box-shadow: 0 2px 8px rgba(11,95,255,0.3);
  }
  .btn-primary:hover {
    background: var(--brand-2); color: #fff; border-color: var(--brand-2);
    box-shadow: 0 4px 14px rgba(11,95,255,0.4);
  }

  .scenario-card {
    border: 1px solid var(--border);
    border-radius: 10px; padding: 12px;
    display: flex; flex-direction: column; gap: 4px;
    background: var(--card);
  }
  .scenario-card.scenario-risk { border-color: #FECDCA; background: var(--critical-bg); }
  .scenario-card.scenario-base { border-color: var(--border); }
  .scenario-card.scenario-improve { border-color: #A9EFC5; background: var(--ok-bg); }

  .qc-flag {
    font-size: 12px; padding: 8px 12px;
    border-radius: 8px; background: var(--pending-bg);
    border: 1px solid var(--border);
    font-family: var(--font-mono);
    color: var(--muted);
  }

  input[type="text"], input[type="number"] {
    font-family: var(--font);
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  input[type="text"]:focus, input[type="number"]:focus {
    border-color: var(--brand) !important;
    box-shadow: 0 0 0 3px rgba(11,95,255,0.12) !important;
  }
  
  .scroll-y {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .ra-scroll {
    max-height: 260px;
    padding-right: 4px;
  }

  .ra-priority-scroll {
    max-height: 380px;
    padding-right: 4px;
    overflow-y: auto;
  }

  .empty-state {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 8px;
    padding: 40px 20px;
    color: var(--muted);
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    background: var(--card);
  }
  .empty-state-icon { font-size: 36px; opacity: 0.35; }
  .empty-state > span:nth-child(2) { font-size: 14px; font-weight: 700; color: var(--muted); }

  /* ── Course Panel ── */
  .course-panel-overlay {
    position: fixed; inset: 0;
    background: rgba(13,17,23,0.5);
    z-index: 60;
    display: flex; align-items: flex-start; justify-content: flex-end;
    padding: 0;
    backdrop-filter: blur(2px);
    animation: fadeIn 0.2s ease both;
  }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

  .course-panel {
    width: min(480px, 100vw);
    height: 100vh;
    background: var(--card);
    border-left: 1px solid var(--border);
    display: flex; flex-direction: column;
    animation: slideIn 0.28s cubic-bezier(.4,0,.2,1) both;
    box-shadow: -8px 0 40px rgba(0,0,0,0.15);
  }
  @keyframes slideIn {
    from { transform: translateX(40px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }

  .course-item {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.15s ease;
    text-decoration: none;
  }
  .course-item:hover { background: var(--brand-light); }
  .course-item.active { background: var(--brand-light); border-left: 3px solid var(--brand); }
  .course-item-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  }

  /* ── Voice search ── */
  .voice-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--card);
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 15px;
    flex-shrink: 0;
    color: var(--muted);
  }
  .voice-btn:hover { border-color: var(--brand); background: var(--brand-light); color: var(--brand); }
  .voice-btn.listening {
    border-color: var(--critical);
    background: var(--critical-bg);
    color: var(--critical);
    animation: voicePulse 1s ease infinite;
  }
  @keyframes voicePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(217,45,32,0.3); }
    50%       { box-shadow: 0 0 0 6px rgba(217,45,32,0); }
  }

  /* ── Voice hint ── */
  .voice-hint {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 10px;
    border: 1px dashed var(--border);
    background: var(--bg);
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    flex-wrap: wrap;
  }

  /* ── Main Tab Bar ── */
  .main-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0;
  }
  .main-tab {
    padding: 8px 16px 10px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    cursor: pointer;
    border-radius: 8px 8px 0 0;
    border: 1px solid transparent;
    border-bottom: none;
    background: transparent;
    transition: all 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: -1px;
    position: relative;
  }
  .main-tab:hover { color: var(--text); background: var(--card); border-color: var(--border); }
  .main-tab.active {
    color: var(--brand);
    background: var(--card);
    border-color: var(--border);
    border-bottom-color: var(--card);
  }
  .main-tab .tab-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: currentColor; opacity: 0.6;
  }

  /* ── AI Assistant Panel ── */
  .ai-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .ai-status-outer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    transition: all 0.25s;
    min-height: 48px;
  }
  .ai-status-outer.listening {
    border-color: rgba(217,45,32,0.45);
    background: var(--critical-bg);
  }
  .ai-status-outer.thinking {
    border-color: rgba(11,95,255,0.35);
    background: var(--brand-light);
  }
  .ai-status-outer.speaking {
    border-color: rgba(18,183,106,0.35);
    background: var(--ok-bg);
  }
  .ai-status-icon {
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; flex-shrink: 0;
    background: var(--card);
    border: 1px solid var(--border);
  }
  .ai-wave {
    display: flex; align-items: center; gap: 2px; height: 18px;
  }
  .ai-wave-bar {
    width: 3px; border-radius: 2px;
    animation: waveAI 1.1s ease-in-out infinite;
  }
  .ai-wave-bar:nth-child(1) { height: 6px;  animation-delay: 0s; }
  .ai-wave-bar:nth-child(2) { height: 12px; animation-delay: 0.1s; }
  .ai-wave-bar:nth-child(3) { height: 18px; animation-delay: 0.2s; }
  .ai-wave-bar:nth-child(4) { height: 12px; animation-delay: 0.1s; }
  .ai-wave-bar:nth-child(5) { height: 6px;  animation-delay: 0s; }
  @keyframes waveAI {
    0%, 100% { transform: scaleY(0.4); }
    50%       { transform: scaleY(1); }
  }
  .ai-chat {
    background: var(--bg2, var(--bg));
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 10px;
    max-height: 300px;
    min-height: 120px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    scrollbar-width: thin;
  }
  .ai-bubble-wrap { display: flex; flex-direction: column; }
  .ai-bubble-wrap.user { align-items: flex-end; }
  .ai-bubble-wrap.bot  { align-items: flex-start; }
  .ai-bubble {
    max-width: 86%;
    font-size: 12.5px;
    line-height: 1.55;
    padding: 9px 13px;
    border-radius: 8px;
  }
  .ai-bubble.bot {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 2px 12px 12px 12px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  .ai-bubble.user {
    background: var(--brand-light2, var(--brand-light));
    border: 1px solid rgba(11,95,255,0.25);
    border-radius: 12px 2px 12px 12px;
    color: var(--text);
  }
  .ai-meta {
    font-size: 9px; font-weight: 800;
    letter-spacing: 0.07em; text-transform: uppercase;
    color: var(--muted); margin-bottom: 3px;
    display: flex; align-items: center; gap: 6px;
  }
  .ai-voice-badge {
    background: var(--brand-light); color: var(--brand);
    border-radius: 999px; padding: 1px 7px;
    font-size: 9px; font-weight: 700;
  }
  .ai-speak-btn {
    border: 1px solid var(--border);
    background: transparent;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 10px; font-weight: 700;
    color: var(--muted);
    cursor: pointer;
    margin-top: 5px;
    transition: all 0.15s;
  }
  .ai-speak-btn:hover { border-color: var(--ok); color: var(--ok); }
  .ai-speak-btn.active { border-color: var(--ok); color: var(--ok); background: var(--ok-bg); }
  .ai-typing {
    display: flex; align-items: center; gap: 4px; padding: 6px 2px;
  }
  .ai-typing-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--brand);
    animation: waveAI 1.2s ease-in-out infinite;
  }
  .ai-typing-dot:nth-child(2) { animation-delay: 0.15s; }
  .ai-typing-dot:nth-child(3) { animation-delay: 0.3s; }
  .ai-chip-btn {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 13px;
    font-size: 11px; font-weight: 600;
    color: var(--muted);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .ai-chip-btn:hover {
    border-color: var(--brand);
    color: var(--brand);
    background: var(--brand-light);
  }
  .ai-input {
    flex: 1;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 12px; font-weight: 600;
    background: var(--card);
    color: var(--text);
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    font-family: var(--font);
  }
  .ai-input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(11,95,255,0.1);
  }
  .ai-input::placeholder { color: var(--muted); }
  .ai-send-btn {
    background: var(--brand);
    color: #fff;
    border: none;
    border-radius: 10px;
    padding: 10px 18px;
    font-size: 12px; font-weight: 800;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
    font-family: var(--font);
  }
  .ai-send-btn:hover { opacity: 0.85; }
  .ai-toggle {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
  }
  .ai-toggle.active { border-color: var(--ok); background: var(--ok-bg); }
  .ai-toggle-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--muted); transition: background 0.2s;
  }
  .ai-toggle.active .ai-toggle-dot { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
  .ai-stop-btn {
    background: var(--critical-bg);
    border: 1px solid rgba(217,45,32,0.3);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 11px; font-weight: 700;
    color: var(--critical);
    cursor: pointer;
    transition: all 0.15s;
    display: none;
  }
  .ai-stop-btn.visible { display: block; }
  .ai-guide-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  @media (max-width: 640px) {
    .ai-guide-grid { grid-template-columns: 1fr; }
    .main-tabs { overflow-x: auto; }
  }
`;

function injectStyles() {
  if (typeof document === "undefined") return;
  const id = "gemelo-styles";
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = GLOBAL_STYLES;
  document.head.appendChild(el);
}

/**
 * =========================
 * Hook: Media Query
 * =========================
 */
function useMediaQuery(query) {
  const getMatch = () => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  };
  const [matches, setMatches] = React.useState(getMatch);

  React.useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    onChange();

    if (m.addEventListener) m.addEventListener("change", onChange);
    else m.addListener(onChange);

    return () => {
      if (m.removeEventListener) m.removeEventListener("change", onChange);
      else m.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

/**
 * =========================
 * UI Atoms
 * =========================
 */

function StatusBadge({ status }) {
  const s = normStatus(status);
  const cfg = STATUS_CONFIG[s] || {
    bg: "var(--pending-bg)",
    fg: "var(--muted)",
    dot: COLORS.pending,
    label: status || "—",
  };
  return (
    <span
      className="badge"
      style={{
        background: cfg.bg, color: cfg.fg,
        border: `1px solid ${cfg.dot}22`,
        fontWeight: 700, letterSpacing: "0.03em",
        padding: "4px 10px", fontSize: 11,
        borderRadius: 999,
      }}
    >
      <span
        className="pulse-dot"
        style={{ background: cfg.dot, width: 5, height: 5, borderRadius: "50%", display: "inline-block", flexShrink: 0 }}
      />
      {cfg.label}
    </span>
  );
}


// ─────────────────────────────────────────────
// CircularRing — SVG progress ring (CESA Curator style)
// ─────────────────────────────────────────────
const CircularRing = React.memo(function CircularRing({ pct, size = 80, stroke = 8, color, label, sublabel, fontSize }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pctClamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const offset = circ - (circ * pctClamped) / 100;
  const ringColor = color || "var(--brand)";
  const textSize = fontSize || Math.round(size * 0.22);
  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      role="progressbar"
      aria-valuenow={Math.round(pctClamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={sublabel ? `${sublabel}: ${Math.round(pctClamped)}%` : `Progreso ${Math.round(pctClamped)}%`}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--border)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={ringColor} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: textSize, fontWeight: 900, fontFamily: "var(--font-mono)", color: ringColor, lineHeight: 1 }}>{label ?? `${Math.round(pctClamped)}%`}</span>
        {sublabel && <span style={{ fontSize: Math.round(textSize * 0.55), fontWeight: 700, color: "var(--muted)", marginTop: 1 }}>{sublabel}</span>}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
// ThresholdsModal — configurar umbrales de riesgo del curso (#13)
// ─────────────────────────────────────────────
function ThresholdsModal({ current, base, isOverridden, onSave, onReset, onClose }) {
  const [crit, setCrit] = useState(Number(current?.critical ?? 50));
  const [watch, setWatch] = useState(Number(current?.watch ?? 70));
  const valid = watch >= crit;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configurar umbrales de riesgo"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(13,17,23,0.65)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)", background: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 16,
          boxShadow: "var(--shadow-lg)", padding: "20px 22px",
          fontFamily: "var(--font)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
          Umbrales de riesgo del curso
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
          Define los porcentajes a partir de los cuales un estudiante se considera <b>en observación</b> o <b>crítico</b>. Se aplica solo a este curso.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: COLORS.critical, marginBottom: 4 }}>
              <span>Crítico (&lt; %)</span><span style={{ fontFamily: "var(--font-mono)" }}>{crit}%</span>
            </div>
            <input type="range" min={0} max={100} value={crit} onChange={(e) => setCrit(Number(e.target.value))} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: COLORS.watch, marginBottom: 4 }}>
              <span>Observación (&lt; %)</span><span style={{ fontFamily: "var(--font-mono)" }}>{watch}%</span>
            </div>
            <input type="range" min={0} max={100} value={watch} onChange={(e) => setWatch(Number(e.target.value))} style={{ width: "100%" }} />
          </label>
        </div>

        {!valid && (
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.critical, fontWeight: 600 }}>
            El umbral de observación debe ser ≥ al crítico.
          </div>
        )}

        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>
          Por defecto del sistema: crítico {base?.critical ?? 50}% · observación {base?.watch ?? 70}%
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          {isOverridden && (
            <button
              onClick={onReset}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)",
                background: "var(--bg)", color: "var(--muted)", fontSize: 12,
                fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)",
              }}
            >
              Restablecer
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--text)", fontSize: 12,
              fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave({ critical: crit, watch })}
            disabled={!valid}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: valid ? "var(--brand)" : "var(--border)",
              color: "#fff", fontSize: 12, fontWeight: 800,
              cursor: valid ? "pointer" : "not-allowed", fontFamily: "var(--font)",
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, right, children, className = "", style = {}, accent }) {
  return (
    <div
      className={`kpi-card ${className}`}
      style={{
        ...style,
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow)",
        border: `1px solid var(--border)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {accent && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `var(--${accent})`, borderRadius: "var(--radius-lg) var(--radius-lg) 0 0" }} />
      )}
      {(title || right) && (
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16, gap: 12,
            paddingTop: accent ? 4 : 0,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.3 }}>
            {title}
          </div>
          <div style={{ flexShrink: 0 }}>{right}</div>
        </div>
      )}
      {children}
    </div>
  );
}

function Stat({ label, value, sub, valueColor }) {
  return (
    <div>
      {label ? (
        <div style={{
          fontSize: 10, color: "var(--muted)", fontWeight: 800,
          textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4,
        }}>
          {label}
        </div>
      ) : null}
      <div style={{
        fontSize: 30, color: valueColor || "var(--text)", fontWeight: 900,
        lineHeight: 1, letterSpacing: "-0.04em", fontFamily: "var(--font)",
      }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 5, fontWeight: 500, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", width: "100%", margin: "4px 0" }} />;
}

function ProgressBar({ value, color, showLabel = false, animate = true }) {
  const pct = Math.max(0, Math.min(100, Number(value ?? 0)));
  const mountedRef = React.useRef(false);
  const [didMount, setDidMount] = React.useState(false);

  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setDidMount(true);
    }
  }, []);

  const shouldAnimate = animate && didMount;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(148,163,184,0.15)", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div
          className={shouldAnimate ? "fill-bar" : ""}
          style={{
            "--target-w": `${pct}%`,
            width: shouldAnimate ? undefined : `${pct}%`,
            height: "100%",
            background: color || COLORS.brand,
            borderRadius: 999,
            transition: shouldAnimate ? undefined : "none",
          }}
        />
      </div>
      {showLabel && (
        <div style={{ position: "absolute", right: 0, top: -18, fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
          {fmtPct(pct)}
        </div>
      )}
    </div>
  );
}

// Tooltip portal container — renders outside any overflow/transform ancestor
const _tooltipRoot = (() => {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("cesa-tooltip-portal");
  if (!el) {
    el = document.createElement("div");
    el.id = "cesa-tooltip-portal";
    el.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:999999;pointer-events:none;";
    document.body.appendChild(el);
  }
  return el;
})();

function InfoTooltip({ text }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef(null);
  const tooltipRef = React.useRef(null);
  const [pos, setPos] = React.useState({ top: -9999, left: -9999 });

  if (!String(text || "").trim()) return null;

  const TW = 260; // tooltip width
  const GAP = 7;

  const calcPos = React.useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    // center horizontally over the ? button
    let left = r.left + r.width / 2 - TW / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - TW - 10));

    // measure real height after render, default 72px estimate
    const h = (tooltipRef.current?.offsetHeight) || 72;
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    let top;
    if (spaceAbove >= h + GAP + 10 || spaceAbove >= spaceBelow) {
      top = r.top - h - GAP;
    } else {
      top = r.bottom + GAP;
    }
    setPos({ top, left });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    calcPos();
    // re-measure after paint (tooltip may have rendered with wrong height)
    const raf = requestAnimationFrame(calcPos);
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open, calcPos]);

  // Portal content
  const tooltipNode = open && _tooltipRoot
    ? ReactDOM.createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: TW,
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
            borderRadius: 10,
            padding: "9px 12px",
            color: "var(--text)",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.5,
            pointerEvents: "none",
            animation: "fadeUp 0.15s ease both",
          }}
        >
          {text}
        </div>,
        _tooltipRoot
      )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        style={{ display: "inline-flex", flex: "0 0 auto", verticalAlign: "middle" }}
        onMouseEnter={() => { setOpen(true); }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
      >
        <span
          role="button"
          tabIndex={0}
          aria-label="Ver descripción"
          style={{
            display: "inline-flex", width: 16, height: 16, borderRadius: 999,
            alignItems: "center", justifyContent: "center",
            border: "1px solid var(--border2)", color: "var(--muted)",
            fontSize: 10, fontWeight: 900, cursor: "help",
            background: "var(--card)", lineHeight: 1,
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--muted)"; }}
        >
          ?
        </span>
      </span>
      {tooltipNode}
    </>
  );
}

function SortTh({ label, active, dir, onClick, title }) {
  return (
    <th
      onClick={onClick}
      title={title}
      style={{
        padding: "10px 12px",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontSize: 10,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: active ? "var(--brand)" : "var(--muted)",
        transition: "color 0.15s",
      }}
    >
      {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}

function CoverageBars({ donePct, pendingPct, overduePct, openPct }) {
  const d  = Math.max(0, Math.min(100, Number(donePct   ?? 0)));
  const p  = Math.max(0, Math.min(100, Number(pendingPct ?? 0)));
  const ov = Math.max(0, Math.min(100, Number(overduePct ?? 0)));
  // openPct puede pasarse explícitamente; si no, se calcula como residuo
  const op = openPct != null
    ? Math.max(0, Math.min(100, Number(openPct)))
    : Math.max(0, 100 - d - p - ov);

  const BarRow = ({ label, value, color, tooltip }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }} title={tooltip}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          fontSize: 11, color: "var(--muted)", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
          {label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 800, fontFamily: "var(--font-mono)" }}>
          {value.toFixed(1)}%
        </div>
      </div>
      <ProgressBar value={value} color={color} animate={false} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Índice de cumplimiento evaluativo
      </div>
      <BarRow label="Calificado" value={d} color={COLORS.ok}
        tooltip="Ítems con nota numérica publicada en el gradebook." />
      <BarRow label="Pendiente calificación" value={p} color={COLORS.brand}
        tooltip="El estudiante entregó pero el docente aún no ha publicado nota numérica." />
      {op > 0.5 && (
        <BarRow label="Sin entregar (abierto)" value={op} color={COLORS.pending}
          tooltip="Sin nota, sin señal de entrega, y la fecha de vencimiento aún no ha llegado." />
      )}
      <BarRow
        label="Vencido sin registro"
        value={ov}
        color={ov > 0 ? COLORS.critical : "rgba(148,163,184,0.4)"}
        tooltip="Sin nota, sin entrega registrada, y la fecha de vencimiento ya pasó. Requiere acción docente."
      />
    </div>
  );
}



// ─────────────────────────────────────────────────────────────────────────────
// OnboardingTutorial — Tutorial de primera vez para el docente
// Aparece solo una vez (controlado por localStorage "gemelo_onboarded")
// ─────────────────────────────────────────────────────────────────────────────
const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: "Bienvenido a G.D",
    icon: "🎓",
    desc: "Tu asistente académico inteligente para CESA. Monitorea el desempeño de tus estudiantes en tiempo real, identifica riesgos y toma decisiones de acompañamiento basadas en datos.",
    highlight: null,
    voice: (name) => `Bienvenido a G.D${name ? ", " + name : ""}. Tu asistente académico inteligente para el seguimiento de tus estudiantes.`,
  },
  {
    id: "dashboard",
    title: "Dashboard del curso",
    icon: "📊",
    desc: "Ve el panorama completo: nota promedio, estudiantes en riesgo, distribución de calificaciones, cumplimiento evaluativo y resultados de aprendizaje evaluados con rúbricas.",
    highlight: "dashboard",
    voice: () => "El Dashboard te da el panorama completo de tu curso. Aquí ves el promedio, los estudiantes en riesgo y el cumplimiento evaluativo.",
  },
  {
    id: "priority",
    title: "Estudiantes prioritarios",
    icon: "🔴",
    desc: "Identifica automáticamente quiénes necesitan atención urgente: nota crítica, baja cobertura o ítems vencidos sin calificar. Haz clic en un estudiante para ver su gemelo digital completo.",
    highlight: "priority",
    voice: () => "La sección de estudiantes prioritarios te muestra quiénes necesitan atención urgente, con nota crítica o pendientes sin calificar.",
  },
  {
    id: "calendar",
    title: "Calendario de entregas",
    icon: "📅",
    desc: "Visualiza todas las fechas de entrega del curso. Al abrir el detalle de un estudiante, el calendario muestra su estado individual por actividad: entregada ✓, vencida ✗ o pendiente.",
    highlight: null,
    voice: () => "El Calendario de entregas muestra todas las fechas del curso. Puedes ver el estado de cada actividad por estudiante.",
  },
  {
    id: "routes",
    title: "Rutas de atención",
    icon: "🛤️",
    desc: "Cada estudiante tiene una ruta de intervención asignada automáticamente: activar evidencia, recuperación, ajuste dirigido o mantener desempeño. Úsalas para priorizar tus acciones.",
    highlight: "routes",
    voice: () => "Las Rutas de atención te indican qué acción tomar con cada estudiante, desde activar evidencias hasta planes de recuperación.",
  },
  {
    id: "ai",
    title: "Asistente IA con voz",
    icon: "🤖",
    desc: "Consulta en lenguaje natural: '¿Quiénes están en riesgo alto?', '¿Cuál es el promedio?'. También puedes hablar con el micrófono y obtener respuestas en segundos.",
    highlight: "assistant",
    voice: () => "El Asistente de Inteligencia Artificial responde tus preguntas en lenguaje natural. Puedes escribir o usar el micrófono para consultar el estado de tu curso.",
  },
  {
    id: "courses",
    title: "Cursos y roles",
    icon: "📚",
    desc: "Usa 'Mis cursos' en la barra superior para cambiar entre tus cursos activos. Si tienes doble rol (docente y estudiante), desde la pantalla de inicio puedes elegir cómo acceder.",
    highlight: null,
    voice: () => "Puedes cambiar entre tus cursos en cualquier momento usando el botón Mis cursos. Si tienes doble rol, elige tu vista desde la pantalla de inicio. ¡Listo para comenzar!",
  },
];

// Novedades recientes de la plataforma
const UPDATES_STEPS = [
  {
    id: "rebrand_gd",
    title: "Nueva identidad: G.D",
    icon: "🆔",
    tag: "Nuevo",
    desc: "La plataforma adopta una identidad más compacta: 'Gemelo Digital' ahora se muestra como 'G.D' en toda la interfaz, narraciones de voz y reportes PDF. Versión V.260428 (28-04-2026).",
  },
  {
    id: "pdf_informe",
    title: "Descargar Informe PDF Institucional",
    icon: "📄",
    tag: "Nuevo",
    desc: "El botón 'Descargar informe' en la retroalimentación de evidencias genera un PDF institucional CESA con la entrega, la nota semaforizada (cuadro de color al lado del nombre de la entrega), la rúbrica utilizada, el documento subido y el comentario general del docente.",
  },
  {
    id: "fix_priority_names",
    title: "Estudiantes prioritarios: nombres correctos",
    icon: "🔧",
    tag: "Mejorado",
    desc: "Se corrigió la regresión donde los estudiantes prioritarios mostraban su número de ID en lugar del nombre. Ahora los snapshots sincronizan también la lista de clase para resolver siempre el nombre legible.",
  },
  {
    id: "coordinator",
    title: "Panel Coordinador",
    icon: "🏛️",
    tag: "Nuevo",
    desc: "Coordinadores y administradores tienen un panel dedicado para visualizar el desempeño de todos los cursos de un período académico: notas, cobertura y riesgo por asignatura.",
  },
  {
    id: "student_overview",
    title: "Rendimiento General del Estudiante",
    icon: "📊",
    tag: "SuperAdmin",
    desc: "Los SuperAdministradores pueden ver el desempeño completo de cualquier estudiante a través de todas sus asignaturas: notas, cobertura, riesgo y entregas por curso.",
  },
  {
    id: "my_summary",
    title: "Mi Resumen (Portal Estudiante)",
    icon: "📋",
    tag: "Nuevo",
    desc: "Los estudiantes ahora tienen un botón '📊 Mi resumen' en su portal que consolida su desempeño en todos los cursos activos del semestre en una sola vista.",
  },
  {
    id: "calendar_status",
    title: "Calendario con Estado de Entregas",
    icon: "📅",
    tag: "Mejorado",
    desc: "El calendario ahora muestra el estado individual de cada actividad para el estudiante seleccionado: ✓ verde para entregadas y calificadas, ✗ rojo para vencidas sin entrega.",
  },
  {
    id: "superadmin",
    title: "Herramientas SuperAdmin",
    icon: "🔑",
    tag: "SuperAdmin",
    desc: "Los SuperAdministradores pueden suplantar usuarios (docentes o estudiantes), buscar cursos por período académico con selector de semestres, y consultar reportes cruzados.",
  },
];

function UpdatesModal({ onClose }) {
  const [step, setStep] = React.useState(0);
  const current = UPDATES_STEPS[step];
  const isLast = step === UPDATES_STEPS.length - 1;
  const TAG_COLORS = { "Nuevo": "#16a34a", "Mejorado": "var(--brand)", "SuperAdmin": "#7c3aed" };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font)", padding: 20,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--card)", borderRadius: 20,
        padding: "36px 40px", maxWidth: 500, width: "100%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
        position: "relative",
      }}>
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)", padding: 4, lineHeight: 1 }}
        >✕</button>

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            🆕 Novedades · G.D
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 24, justifyContent: "center" }}>
          {UPDATES_STEPS.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              width: i === step ? 22 : 8, height: 8, borderRadius: 99,
              background: i === step ? "var(--brand)" : i < step ? "#16a34a" : "var(--border)",
              transition: "all 0.3s ease", cursor: "pointer",
            }} />
          ))}
        </div>

        <div style={{ textAlign: "center", fontSize: 44, marginBottom: 12, lineHeight: 1 }}>
          {current.icon}
        </div>

        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <span style={{
            display: "inline-block",
            fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
            padding: "3px 10px", borderRadius: 99,
            background: (TAG_COLORS[current.tag] || "var(--brand)") + "1a",
            color: TAG_COLORS[current.tag] || "var(--brand)",
            border: "1px solid " + (TAG_COLORS[current.tag] || "var(--brand)") + "40",
          }}>
            {current.tag}
          </span>
        </div>

        <h2 style={{ fontSize: 21, fontWeight: 900, color: "var(--text)", textAlign: "center", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          {current.title}
        </h2>

        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, textAlign: "center", margin: "0 0 24px" }}>
          {current.desc}
        </p>

        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginBottom: 16, fontWeight: 600 }}>
          {step + 1} de {UPDATES_STEPS.length}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", fontSize: 13, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
            >← Anterior</button>
          )}
          <button
            onClick={() => isLast ? onClose() : setStep(s => s + 1)}
            style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(11,95,255,0.3)" }}
          >
            {isLast ? "¡Entendido! ✓" : "Siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingTutorial({ userName, onFinish }) {
  const [step, setStep] = React.useState(0);
  const [speaking, setSpeaking] = React.useState(false);
  const current = ONBOARDING_STEPS[step];
  const isLast = step === ONBOARDING_STEPS.length - 1;

  const speak = React.useCallback((text) => {
    elSpeak(
      text,
      () => setSpeaking(true),
      () => setSpeaking(false),
    );
  }, []);

  // Auto-speak on step change
  React.useEffect(() => {
    const text = current.voice(userName);
    // Small delay for better UX
    const t = setTimeout(() => speak(text), 300);
    return () => { clearTimeout(t); window.speechSynthesis?.cancel(); };
  }, [step]);

  const handleNext = () => {
    if (isLast) {
      window.speechSynthesis?.cancel();
      localStorage.setItem("gemelo_onboarded", "1");
      onFinish();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = () => {
    window.speechSynthesis?.cancel();
    localStorage.setItem("gemelo_onboarded", "1");
    onFinish();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font)", padding: 20,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "var(--card)", borderRadius: 20,
        padding: "36px 40px", maxWidth: 520, width: "100%",
        boxShadow: "0 24px 80px rgba(0,0,0,0.3)",
        position: "relative",
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24, justifyContent: "center" }}>
          {ONBOARDING_STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 22 : 8, height: 8, borderRadius: 99,
              background: i === step ? "var(--brand)" : i < step ? "var(--ok)" : "var(--border)",
              transition: "all 0.3s ease",
            }} />
          ))}
        </div>

        {/* Icon */}
        <div style={{ textAlign: "center", fontSize: 48, marginBottom: 16, lineHeight: 1 }}>
          {current.icon}
        </div>

        {/* Title */}
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", textAlign: "center", margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          {current.title}
        </h2>

        {/* Description */}
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, textAlign: "center", margin: "0 0 28px" }}>
          {current.desc}
        </p>

        {/* Voice indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 24, height: 24 }}>
          {speaking ? (
            <>
              {[1,2,3,4,5].map(n => (
                <div key={n} style={{
                  width: 4, borderRadius: 2,
                  background: "var(--brand)",
                  animation: "waveAI 1.1s ease-in-out infinite",
                  animationDelay: `${n * 0.1}s`,
                  height: `${8 + n * 4}px`,
                }} />
              ))}
              <span style={{ fontSize: 11, color: "var(--brand)", fontWeight: 700, marginLeft: 6 }}>Hablando…</span>
            </>
          ) : (
            <button
              onClick={() => speak(current.voice(userName))}
              style={{ background: "none", border: "1px solid var(--border)", borderRadius: 99, padding: "4px 14px", fontSize: 11, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
            >
              🔊 Repetir
            </button>
          )}
        </div>

        {/* Step counter */}
        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginBottom: 16, fontWeight: 600 }}>
          {step + 1} de {ONBOARDING_STEPS.length}
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleSkip}
            style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", fontSize: 13, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
          >
            Saltar tutorial
          </button>
          <button
            onClick={handleNext}
            style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "var(--brand)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(11,95,255,0.3)" }}
          >
            {isLast ? "¡Comenzar! 🚀" : "Siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LoginScreen — Pantalla de acceso cuando el usuario no está autenticado
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen({ orgUnitId }) {
  const loginUrl = apiUrl(
    orgUnitId && orgUnitId > 0
      ? `/auth/brightspace/login?org_unit_id=${orgUnitId}`
      : "/auth/brightspace/login"
  );

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font)", padding: 20,
    }}>
      <div style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)", padding: "40px 48px",
        textAlign: "center", maxWidth: 440, width: "100%",
        boxShadow: "var(--shadow-lg)",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 13,
            background: "var(--brand)", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 15, fontWeight: 900, letterSpacing: "-0.03em",
          }}>CESA</div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em" }}>
              G.D
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Vista Docente · V.260428
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border)", margin: "0 0 28px" }} />

        {/* Heading */}
        <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
          Bienvenido
        </h2>
        <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 28px" }}>
          Para acceder a tu tablero, inicia sesión con tu cuenta CESA de Brightspace.
          Serás redirigido a Microsoft para autenticarte.
        </p>

        {/* CTA Button */}
        <a
          href={loginUrl}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            width: "100%", padding: "13px 20px",
            background: "var(--brand)", color: "#fff",
            borderRadius: 12, textDecoration: "none",
            fontSize: 14, fontWeight: 800,
            boxShadow: "0 4px 16px rgba(11,95,255,0.3)",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          {/* Microsoft logo simplified */}
          <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
            <rect x="0"  y="0"  width="10" height="10" fill="#F25022"/>
            <rect x="11" y="0"  width="10" height="10" fill="#7FBA00"/>
            <rect x="0"  y="11" width="10" height="10" fill="#00A4EF"/>
            <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
          </svg>
          Iniciar sesión con Microsoft
        </a>

        {/* Info */}
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 18, lineHeight: 1.5 }}>
          Solo los instructores con cursos activos en Brightspace pueden acceder.
          Si tienes problemas, contacta a soporte CESA.
        </p>

        {/* From LTI note */}
        <div style={{
          marginTop: 20, padding: "10px 14px", borderRadius: 10,
          background: "var(--brand-light)", border: "1px solid var(--brand-light2)",
        }}>
          <p style={{ fontSize: 11, color: "var(--brand)", fontWeight: 700, margin: 0 }}>
            💡 También puedes acceder directamente desde tu curso en Brightspace
            usando el enlace de la herramienta G.D.
          </p>
        </div>
      </div>
    </div>
  );
}

function CesaLoader({ title = "CESA · G.D V.260428", subtitle = "Cargando tablero..." }) {
  React.useEffect(() => {
    injectStyles();
  }, []);

  return (
    <div className="cesa-loader-wrap">
      <div className="cesa-loader-card">
        <div>
          <div className="cesa-loader-title">{title}</div>
          <div className="cesa-loader-sub">{subtitle}</div>
        </div>
        <div className="cesa-loader-center">
          <div className="cesa-water-text" aria-label="Cargando">
            <span className="cesa-water-text__outline">CESA</span>
            <span className="cesa-water-text__fill" aria-hidden="true">
              CESA
            </span>
            <span className="cesa-water-text__wave" aria-hidden="true" />
          </div>
        </div>
        <div className="cesa-loader-foot">Conectando con Brightspace y consolidando evidencias académicas…</div>
      </div>
    </div>
  );
}

// Lista compacta de asignaciones sin RA — usada dentro del AlertsPanel
function UnlinkedItemsList({ items }) {
  const [open, setOpen] = React.useState(false);
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <button
        className="btn"
        style={{ fontSize: 11, padding: "4px 10px", gap: 5 }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        {open ? "▴" : "▾"} Ver actividades sin RA ({list.length})
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {list.map((it, i) => (
            <div
              key={it.gradeObjectId ?? i}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 10px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--bg)",
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {it.name || `Ítem ${it.gradeObjectId}`}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                {it.weightPct != null && (
                  <span className="tag" style={{ background: "var(--watch-bg)", color: "#9A3412", fontSize: 10 }}>
                    {Number(it.weightPct).toFixed(1)}% peso
                  </span>
                )}
                <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                  sin RA
                </span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted)", padding: "4px 2px", fontStyle: "italic" }}>
            💡 Vincula estas actividades a una rúbrica con RA en Brightspace para incluirlas en el análisis de competencias.
          </div>
        </div>
      )}
    </div>
  );
}

function AlertsPanel({ alerts }) {
  const list = Array.isArray(alerts) ? alerts : [];
  const [open, setOpen] = React.useState(false);
  if (!list.length) return null;

  const sevRank = (s) => {
    const x = normStatus(s);
    if (x === "critico") return 0;
    if (x === "en desarrollo" || x === "en seguimiento" || x === "observacion") return 1;
    return 2;
  };

  const sorted = list.slice().sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const countBySev = (sev) => sorted.filter((x) => normStatus(x.severity) === sev).length;
  const cCrit = countBySev("critico");
  const cObs = sorted.filter((x) => ["en desarrollo", "en seguimiento", "observacion"].includes(normStatus(x.severity))).length;
  const cSol = countBySev("solido");

  return (
    <Card>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🔭</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Radar docente</span>
            <span className="tag">{sorted.length}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {cCrit > 0 && (
              <span className="badge" style={{ background: "var(--critical-bg)", color: "#B42318" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.critical, display: "inline-block" }} />
                Críticos: {cCrit}
              </span>
            )}
            {cObs > 0 && (
              <span className="badge" style={{ background: "var(--watch-bg)", color: "#9A3412" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.watch, display: "inline-block" }} />
                Seguimiento: {cObs}
              </span>
            )}
            {cSol > 0 && (
              <span className="badge" style={{ background: "var(--ok-bg)", color: "#1B5E20" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.ok, display: "inline-block" }} />
                Óptimos: {cSol}
              </span>
            )}
          </div>
        </div>
        <button className="btn" style={{ padding: "6px 12px", fontSize: 12 }}>
          {open ? "Ocultar ▴" : "Ver ▾"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((a) => (
            <div
              key={a.id || `${a.title}-${Math.random()}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 14,
                background: "var(--card)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 13 }}>{a.title || "Alerta"}</div>
                <StatusBadge status={a.severity} />
              </div>
              {a.message && <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{a.message}</div>}
              {a.kpis && Object.keys(a.kpis).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                  {Object.entries(a.kpis).map(([k, v]) => (
                    <span
                      key={k}
                      style={{
                        fontSize: 11,
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--muted)",
                      }}
                    >
                      {k}: <strong style={{ color: "var(--text)" }}>{typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(1)) : String(v)}</strong>
                    </span>
                  ))}
                </div>
              )}
              {/* Items sin RA — lista expandible */}
              {Array.isArray(a.items) && a.items.length > 0 && (
                <UnlinkedItemsList items={a.items} />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Drawer({ open, onClose, title, subtitle, extraHeader, children }) {
  React.useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Add a class to <body> when drawer is open so the @media print CSS
  // can hide the background dashboard and only print the drawer content.
  React.useEffect(() => {
    if (!open) return;
    document.body.classList.add("drawer-is-open");
    return () => document.body.classList.remove("drawer-is-open");
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="drawer-print-mode"
      style={{ position: "fixed", inset: 0, background: "rgba(13,17,23,0.5)", display: "flex", justifyContent: "flex-end", zIndex: 200, backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="drawer-enter"
        style={{ width: "min(700px, 97vw)", height: "100%", background: "var(--card)", overflow: "auto", borderLeft: "1px solid var(--border)", color: "var(--text)", display: "flex", flexDirection: "column", gap: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 20px" }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 14, paddingBottom: 6 }}>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "var(--muted)", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
              ← Estudiantes
            </button>
            <span style={{ color: "var(--border2)", fontSize: 11 }}>›</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)" }}>Expediente académico</span>
          </div>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>{title}</div>
              {subtitle && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, fontWeight: 500 }}>{subtitle}</div>}
              {extraHeader && <div style={{ marginTop: 6 }}>{extraHeader}</div>}
            </div>
            <button className="btn" onClick={onClose} style={{ flexShrink: 0, marginTop: 2 }}>✕ Cerrar</button>
          </div>
        </div>
        {/* Content */}
        <div style={{ padding: "16px 20px 28px", flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ProjectionBlock({ projection, thresholds }) {
  if (!projection || !Array.isArray(projection.scenarios) || !projection.scenarios.length) return null;

  if (projection.isFinal) {
    return (
      <Card title="Proyección final" right={<span className="tag">Cobertura 100%</span>}>
        <Stat label="Nota final" value={fmtGrade10FromPct(projection.finalPct)} valueColor={colorForPct(projection.finalPct, thresholds)} />
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          La cobertura del 100% indica que esta es la nota definitiva del curso.
        </div>
      </Card>
    );
  }

  const scenarioMeta = {
    risk: { label: "Escenario riesgo", sub: "si el resto baja", cls: "scenario-risk", icon: "📉" },
    base: { label: "Escenario base", sub: "desempeño actual", cls: "scenario-base", icon: "📊" },
    improve: { label: "Escenario mejora", sub: "si el resto sube", cls: "scenario-improve", icon: "📈" },
  };

  return (
    <Card title="Proyección de nota final" right={<span className="tag">{fmtPct(projection.coveragePct)} calificado</span>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {projection.scenarios.map((s) => {
          const meta = scenarioMeta[s.id] || { label: s.id, sub: "", cls: "scenario-base", icon: "📊" };
          return (
            <div key={s.id} className={`scenario-card ${meta.cls}`}>
              <div style={{ fontSize: 18 }}>{meta.icon}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{meta.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", color: colorForPct(s.projectedFinalPct, thresholds) }}>
                {fmtGrade10FromPct(s.projectedFinalPct)}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {meta.sub} · asume {fmtPct(s.assumptionPendingPct)} pendiente
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Notificación de ítems sin RA vinculado
function NoRaMappingNotice({ evidences, units }) {
  // Evidences with grades but whose gradeObjectId doesn't appear in any unit's evidence list
  const gradedEvIds = new Set(
    (Array.isArray(evidences) ? evidences : [])
      .filter((e) => e.scorePct != null)
      .map((e) => String(e.gradeObjectId))
  );

  // Collect all gradeObjectIds that ARE linked to a RA unit
  const linkedIds = new Set();
  for (const u of (Array.isArray(units) ? units : [])) {
    for (const ev of (u.evidence || [])) {
      if (ev.folderId != null) linkedIds.add(String(ev.folderId));
    }
  }

  // Items with grade but no RA link
  const unlinked = (Array.isArray(evidences) ? evidences : []).filter(
    (e) => e.scorePct != null && !linkedIds.has(String(e.gradeObjectId))
  );

  if (!unlinked.length) return null;

  const [open, setOpen] = React.useState(false);

  return (
    <div style={{
      marginTop: 8,
      border: "1px solid var(--watch-bg)",
      borderColor: "#FED7AA",
      borderRadius: 10,
      background: "var(--watch-bg)",
      overflow: "hidden",
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((v) => !v); }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", cursor: "pointer", userSelect: "none", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#9A3412" }}>
              {unlinked.length} asignación{unlinked.length !== 1 ? "es" : ""} calificada{unlinked.length !== 1 ? "s" : ""} sin Resultado de Aprendizaje
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              Estas evidencias tienen nota pero no están vinculadas a ningún RA en la rúbrica
            </div>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div style={{ borderTop: "1px solid #FED7AA", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {unlinked.map((e, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "var(--card)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.name || `Ítem ${e.gradeObjectId}`}
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                <span className="tag" style={{ background: "var(--watch-bg)", color: "#9A3412" }}>
                  {fmtPct(e.weightPct)} peso
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: colorForPct(e.scorePct, null) }}>
                  {e.scorePct != null ? (e.scorePct / 10).toFixed(1) : "—"}
                </span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted)", padding: "4px 2px" }}>
            💡 Para que aparezcan en el análisis de RA, vincula estas asignaciones a una rúbrica con criterios mapeados en Brightspace.
          </div>
        </div>
      )}
    </div>
  );
}

function QualityFlagsBlock({ flags }) {
  const list = Array.isArray(flags) ? flags.filter((f) => f?.type) : [];
  const [open, setOpen] = React.useState(false);
  if (!list.length) return null;

  const relevant = list.filter((f) => f.type !== "role_not_enabled");
  if (!relevant.length) return null;

  return (
    <Card title={null}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔍</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Flags de calidad del modelo</span>
          <span className="tag" style={{ background: "var(--watch-bg)", color: "var(--watch)" }}>
            {relevant.length}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{open ? "▴" : "▾"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {relevant.map((f, i) => (
            <div key={i} className="qc-flag">
              <strong>{f.type}</strong>
              {f.message && <span style={{ marginLeft: 8, opacity: 0.8 }}>— {f.message}</span>}
              {f.rubricId && <span style={{ marginLeft: 8, opacity: 0.6 }}>rubric:{f.rubricId}</span>}
              {f.unitCode && <span style={{ marginLeft: 8, opacity: 0.6 }}>unit:{f.unitCode}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PendingItemsBlock({ pendingItems, missingValues }) {
  const items = Array.isArray(pendingItems) ? pendingItems : [];
  const missing = Array.isArray(missingValues) ? missingValues : [];
  if (!items.length && !missing.length) return null;

  const [open, setOpen] = React.useState(false);
  const topPending = items.slice(0, 5);

  return (
    <Card title={null}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>⏳</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Evidencias pendientes</span>
          <span className="tag">{items.length + missing.length}</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{open ? "▴" : "▾"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {topPending.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Sin calificar (por peso)
              </div>
              {topPending.map((it, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", flex: 1, minWidth: 0 }}>
                    {it.name || `Ítem ${it.gradeObjectId}`}
                  </div>
                  <span className="tag" style={{ background: "var(--watch-bg)", color: "#9A3412", flexShrink: 0 }}>
                    {fmtPct(it.weightPct)} peso
                  </span>
                </div>
              ))}
              {items.length > 5 && <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "4px 0" }}>+ {items.length - 5} más</div>}
            </div>
          )}
          {missing.length > 0 && (
            <div style={{ marginTop: items.length > 0 ? 12 : 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                No liberados en gradebook ({missing.length})
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Ítems sin valor visible para el estudiante. Revisar configuración de visibilidad.</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function EvidencesTimeline({ evidences, thresholds }) {
  const list = Array.isArray(evidences) ? evidences.filter((e) => e.scorePct !== null && e.scorePct !== undefined) : [];
  if (!list.length) return null;
  const [open, setOpen] = React.useState(false);

  const chartData = list.map((e) => ({
    name: (e.name || "").slice(0, 20),
    pct: Number(e.scorePct ?? 0),
  }));

  return (
    <Card title={null}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14 }}>📋</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Historial de evidencias</span>
          <span className="tag">{list.length} calificadas</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{open ? "▴" : "▾"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ width: "100%", height: 160 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "var(--muted)" }} />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Desempeño"]} />
                <ReferenceLine y={Number(thresholds?.watch || 70)} stroke={COLORS.watch} strokeDasharray="4 4" label={{ value: "70%", fill: COLORS.watch, fontSize: 10 }} />
                <ReferenceLine y={Number(thresholds?.critical || 50)} stroke={COLORS.critical} strokeDasharray="4 4" label={{ value: "50%", fill: COLORS.critical, fontSize: 10 }} />
                <Line type="monotone" dataKey="pct" stroke={COLORS.brand} strokeWidth={2} dot={{ fill: COLORS.brand, r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────
// VoiceAssistant — Panel completo con chat, voz y TTS
// ─────────────────────────────────────────────────────────
function VoiceAssistant({ studentRows, overview, raDashboard, courseInfo, thresholds }) {
  const [msgs, setMsgs] = React.useState(() => [{
    id: 0, role: "bot", fromVoice: false,
    text: `Listo. Tengo cargados los datos de <strong>${courseInfo?.Name || "este curso"}</strong>. Puedo analizar riesgo, evidencias y desempeño por RA. Escríbeme o usa el micrófono 🎙️.`,
  }]);
  const [input, setInput] = React.useState("");
  const [aiStatus, setAiStatus] = React.useState("idle");
  const [voiceOut, setVoiceOut] = React.useState(true);
  const [speed, setSpeed]   = React.useState(1.2);
  const [activeSpeakId, setActiveSpeakId] = React.useState(null);
  const [liveText, setLiveText] = React.useState("");
  const chatRef  = React.useRef(null);
  const synthRef = React.useRef(null);
  const recRef   = React.useRef(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [msgs, aiStatus]);

  // ── Pre-compute course data ──
  const withGrades = (Array.isArray(studentRows) ? studentRows : []).filter((s) => s.currentPerformancePct != null);
  const avg = withGrades.length
    ? (withGrades.reduce((a, s) => a + Number(s.currentPerformancePct) / 10, 0) / withGrades.length).toFixed(2)
    : null;
  const altos  = (Array.isArray(studentRows) ? studentRows : []).filter((s) => computeRiskFromPct(s.currentPerformancePct) === "alto");
  const medios = (Array.isArray(studentRows) ? studentRows : []).filter((s) => computeRiskFromPct(s.currentPerformancePct) === "medio");
  const zeros  = (Array.isArray(studentRows) ? studentRows : []).filter((s) => s.currentPerformancePct == null);
  const top    = withGrades.filter((s) => s.currentPerformancePct / 10 >= 8);
  const courseName = courseInfo?.Name || "el curso";

  // ── Banco de sugerencias (rotación aleatoria cada apertura) ──
  const SUGGESTION_BANK = [
    { icon: "🔴", label: "¿Quiénes están en riesgo alto?" },
    { icon: "📊", label: "¿Cuál es la nota promedio?" },
    { icon: "📉", label: "¿Quién tiene la nota más baja?" },
    { icon: "⚠️", label: "¿Hay estudiantes sin nota?" },
    { icon: "🏆", label: "¿Cuáles son los top 3?" },
    { icon: "🎯", label: "¿Qué RA está más crítico?" },
    { icon: "📋", label: "Dame un resumen del curso" },
    { icon: "🟡", label: "¿Quiénes están en riesgo medio?" },
    { icon: "📦", label: "¿Cuántos aprobaron (≥7.0)?" },
    { icon: "🔍", label: "¿Cuál es la cobertura promedio?" },
    { icon: "⏳", label: "¿Cuántos tienen pendientes sin calificar?" },
    { icon: "🛤️", label: "¿Qué rutas de intervención hay?" },
    { icon: "📅", label: "¿Cómo va el ritmo de contenidos?" },
    { icon: "🧮", label: "¿Cuántos están por debajo de 5.0?" },
    { icon: "🚀", label: "¿Quiénes mejoraron su desempeño?" },
    { icon: "🎓", label: "¿Hay estudiantes sin actividad reciente?" },
  ];
  // Seleccionar 4 aleatorias estables por montaje
  const [visibleChips, setVisibleChipsState] = React.useState(() => {
    const shuffled = [...SUGGESTION_BANK].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  });
  const CHIPS = visibleChips;

  // ── Command processor — respuestas cortas y precisas ──
  // Regla de orden: más específico SIEMPRE antes que más genérico
  function processCmd(cmd) {
    const c = cmd.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const n = studentRows.length;

    // ── Ritmo de contenidos (antes de "contenido" genérico)
    if (c.includes("ritmo") || c.includes("ritmo de contenido")) {
      const kpis = overview?.contentKpis;
      if (!kpis) return "Sin datos de ritmo de contenidos disponibles.";
      return `Contenidos creados: <strong>${kpis.createdCount ?? "—"}</strong> · Mínimo esperado: <strong>${kpis.minExpected ?? "—"}</strong> · Cumplimiento: <strong>${kpis.progressRatio != null ? Math.round(kpis.progressRatio*100)+"%" : "—"}</strong>.`;
    }

    // ── Actividad reciente (antes de cualquier otra rama)
    if (c.includes("actividad reciente") || c.includes("sin actividad") || c.includes("inactiv")) {
      if (!zeros.length) return "Todos los estudiantes han tenido actividad registrada.";
      return `Sin actividad registrada: <strong>${zeros.length}</strong>:<br>${zeros.slice(0,5).map(s => `‣ ${s.displayName.split(",")[0]}`).join("<br>")}${zeros.length > 5 ? `<br>… y ${zeros.length - 5} más` : ""}`;
    }

    // ── RA / Resultados de aprendizaje (ANTES de "critico" genérico y "menor")
    if (c.includes("que ra") || c.includes("cual ra") || c.includes("ra critico") || c.includes("ra mas") ||
        c.includes("resultado de aprendizaje") || c.includes("resultados de aprendizaje") ||
        c.includes("competencia") || (c.includes("ra") && (c.includes("critico") || c.includes("bajo") || c.includes("peor")))) {
      const ras = Array.isArray(raDashboard?.ras) ? raDashboard.ras.filter(r => r.studentsWithData > 0) : [];
      if (!ras.length) return "Sin datos de RA aún. Se requieren evaluaciones con rúbricas calificadas.";
      const sorted = [...ras].sort((a,b) => a.avgPct - b.avgPct);
      return `${sorted.map(r => `${r.avgPct < 50 ? "[Crítico]" : r.avgPct < 70 ? "[Observación]" : "[OK]"} <strong>${r.code}:</strong> ${fmtPct(r.avgPct)}`).join("<br>")}.<br>Foco: <strong>${sorted[0].code}</strong> (menor desempeño).`;
    }

    // ── Por debajo de 5 (ANTES de "menor" o "bajo" genérico que también captura "nota más baja")
    if (c.includes("debajo de 5") || c.includes("menor a 5") || c.includes("menor de 5") ||
        c.includes("5.0") || c.includes("reprobado") || c.includes("cuantos") && c.includes("5")) {
      const rep = withGrades.filter(s => s.currentPerformancePct / 10 < 5);
      return `Con nota menor a 5.0: <strong>${rep.length} de ${n}</strong>.${rep.length ? "<br>" + rep.slice(0,4).map(s=>`‣ ${s.displayName.split(",")[0]} (${fmtGrade10FromPct(s.currentPerformancePct)})`).join("<br>") : ""}`;
    }

    // ── Nota más baja / quién tiene la peor nota
    if ((c.includes("nota") && (c.includes("mas baja") || c.includes("baja") || c.includes("peor") || c.includes("menor nota"))) ||
        c.includes("nota minima") || (c.includes("quien") && c.includes("baj"))) {
      const worst = [...withGrades].sort((a, b) => a.currentPerformancePct - b.currentPerformancePct)[0];
      if (!worst) return "Sin calificaciones registradas aún.";
      return `Nota más baja: <strong>${worst.displayName}</strong> con <strong>${fmtGrade10FromPct(worst.currentPerformancePct)}</strong>.`;
    }

    // ── Riesgo alto (ANTES de riesgo genérico)
    if (c.includes("riesgo alto") || c.includes("alto riesgo") ||
        (c.includes("riesgo") && (c.includes("quienes") || c.includes("quién") || c.includes("quienes estan"))) ) {
      if (!altos.length) return "Ningún estudiante en riesgo alto actualmente.";
      return `Riesgo alto (${altos.length}):<br>${altos.slice(0, 6).map(s => `‣ ${s.displayName.split(",")[0]} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}${altos.length > 6 ? `<br>… y ${altos.length - 6} más` : ""}`;
    }

    // ── Riesgo medio
    if (c.includes("riesgo medio") || c.includes("medio riesgo")) {
      if (!medios.length) return "Ningún estudiante en riesgo medio actualmente.";
      return `Riesgo medio (${medios.length}):<br>${medios.slice(0, 5).map(s => `‣ ${s.displayName.split(",")[0]} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}${medios.length > 5 ? `<br>… y ${medios.length - 5} más` : ""}`;
    }

    // ── Riesgo general
    if (c.includes("riesgo") || c.includes("risk")) {
      const ok = n - altos.length - medios.length - zeros.length;
      return `Riesgo en <strong>${courseName}</strong>:<br>Alto: ${altos.length} · Medio: ${medios.length} · OK: ${ok} · Sin nota: ${zeros.length}.<br>${altos.length > 0 ? `Prioridad: ${altos.slice(0,3).map(s => s.displayName.split(",")[0]).join(", ")}.` : ""}`;
    }

    // ── Alertas críticas
    if (c.includes("alerta")) {
      const crit = altos.filter(s => s.currentPerformancePct != null && s.currentPerformancePct < 50);
      return `Sin nota: <strong>${zeros.length}</strong> · Nota menor a 5: <strong>${crit.length}</strong>.<br>${crit.length ? crit.slice(0,3).map(s => `‣ ${s.displayName.split(",")[0]} (${fmtGrade10FromPct(s.currentPerformancePct)})`).join("<br>") : ""}`;
    }

    // ── Top estudiantes
    if (c.includes("top") || c.includes("mejor") || c.includes("destacado") || (c.includes("cuales") && c.includes("top"))) {
      const sorted = [...withGrades].sort((a, b) => b.currentPerformancePct - a.currentPerformancePct).slice(0, 3);
      if (!sorted.length) return "Sin calificaciones disponibles aún.";
      return `Top 3:<br>${sorted.map((s, i) => `${i+1}. ${s.displayName.split(",")[0]} — ${fmtGrade10FromPct(s.currentPerformancePct)}`).join("<br>")}`;
    }

    // ── Resumen del curso
    if (c.includes("resumen") || c.includes("informe") || c.includes("reporte") || c.includes("como va") || c.includes("dame un")) {
      return `<strong>${courseName}</strong><br>Estudiantes: ${n} · Promedio: ${avg ?? "—"}/10<br>Alto: ${altos.length} · Medio: ${medios.length} · Sin nota: ${zeros.length}`;
    }

    // ── Sin nota
    if (c.includes("sin nota") || c.includes("sin evidencia") || c.includes("ruta 0")) {
      if (!zeros.length) return "Todos los estudiantes tienen nota registrada.";
      return `Sin nota: <strong>${zeros.length}</strong>:<br>${zeros.slice(0,5).map(s => `‣ ${s.displayName.split(",")[0]}`).join("<br>")}${zeros.length > 5 ? `<br>… y ${zeros.length - 5} más` : ""}`;
    }

    // ── Aprobados
    if (c.includes("aprobado") || c.includes("pasando") || c.includes("aprobaron") || c.includes("aprobaron")) {
      const ap = withGrades.filter(s => s.currentPerformancePct / 10 >= 7);
      return `Aprobados (nota mayor o igual a 7.0): <strong>${ap.length} de ${n}</strong> (${n ? Math.round(ap.length/n*100) : 0}%).`;
    }

    // ── Cobertura
    if (c.includes("cobertura") || (c.includes("50") && c.includes("cobertura"))) {
      const avgCov = overview?.courseGradebook?.avgCoveragePct;
      const lowCov = (Array.isArray(studentRows) ? studentRows : []).filter(s => s.coveragePct != null && s.coveragePct < 50);
      return `Cobertura promedio: <strong>${fmtPct(avgCov)}</strong>.${lowCov.length ? `<br>${lowCov.length} est. con cobertura menor al 50%.` : ""}`;
    }

    // ── Promedio (último catch-all de nota)
    if (c.includes("promedio") || c.includes("nota promedio") || c.includes("cual es la nota")) {
      return `Promedio del curso: <strong>${avg ?? "—"}/10</strong> (${withGrades.length} estudiantes con nota).`;
    }

    // ── RA general (logro por RA)
    if (c.includes("ra") || c.includes("logro") || c.includes("aprendizaje")) {
      const ras = Array.isArray(raDashboard?.ras) ? raDashboard.ras.filter(r => r.studentsWithData > 0) : [];
      if (!ras.length) return "Sin datos de RA aún. Se requieren evaluaciones con rúbricas calificadas.";
      const sorted = [...ras].sort((a,b) => a.avgPct - b.avgPct);
      return `${sorted.map(r => `${r.avgPct < 50 ? "[Crítico]" : r.avgPct < 70 ? "[Obs]" : "[OK]"} <strong>${r.code}:</strong> ${fmtPct(r.avgPct)}`).join(" · ")}<br>Foco: <strong>${sorted[0].code}</strong>.`;
    }

    // ── Rutas de intervención
    if (c.includes("ruta") || c.includes("intervencion") || c.includes("prescripcion") || c.includes("plan activo")) {
      const routeCounts = { route_coverage: 0, route_high_risk: 0, route_watch: 0, route_ok: 0 };
      (Array.isArray(studentRows) ? studentRows : []).forEach(s => {
        const rid = s.route?.id || "";
        if (routeCounts[rid] !== undefined) routeCounts[rid]++;
      });
      const total = Object.values(routeCounts).reduce((a,b) => a+b, 0);
      if (!total) return "No hay datos de rutas disponibles aún.";
      return `Rutas activas:<br>` +
        `<strong>Ruta 0</strong> (Activar evidencia): ${routeCounts.route_coverage} est.<br>` +
        `<strong>Ruta 1</strong> (Recuperación): ${routeCounts.route_high_risk} est.<br>` +
        `<strong>Ruta 2</strong> (Ajuste dirigido): ${routeCounts.route_watch} est.<br>` +
        `<strong>Ruta 3</strong> (Mantener desempeño): ${routeCounts.route_ok} est.`;
    }

    return `No encontré esa consulta. Prueba: riesgo alto, riesgo medio, promedio, sin nota, top estudiantes, resultados de aprendizaje, aprobados, cobertura, rutas.`;
  }

  // ── TTS — usa ElevenLabs (alta calidad) con fallback a Web Speech API ──
  function speakText(html, msgId) {
    setAiStatus("speaking"); setActiveSpeakId(msgId);
    elSpeak(
      html,
      () => { setAiStatus("speaking"); setActiveSpeakId(msgId); },
      () => { setAiStatus("idle");     setActiveSpeakId(null); },
    );
  }

  function stopSpeaking() {
    elStop();
    setAiStatus("idle"); setActiveSpeakId(null);
  }

  // ── Send message ──
  function sendMsg(text, fromVoice = false) {
    const t = (text || input).trim();
    if (!t) return;
    setInput("");
    const uid = Date.now();
    setMsgs((prev) => [...prev, { id: uid, role: "user", fromVoice, text: t }]);
    setAiStatus("thinking");
    setTimeout(() => {
      const resp = processCmd(t);
      const bid = Date.now() + 1;
      setMsgs((prev) => [...prev, { id: bid, role: "bot", fromVoice: false, text: resp }]);
      setAiStatus("idle");
      if (voiceOut) speakText(resp, bid);
    }, 500 + Math.random() * 300);
  }

  // ── Mic ──
  const voiceOk = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function toggleMic() {
    if (aiStatus === "speaking") stopSpeaking();
    if (aiStatus === "listening") {
      recRef.current?.stop();
      setAiStatus("idle"); setLiveText("");
      return;
    }
    if (!voiceOk) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "es-CO"; rec.continuous = false; rec.interimResults = true;
    rec.onstart  = () => { setAiStatus("listening"); setLiveText(""); };
    rec.onend    = () => { if (aiStatus === "listening") { setAiStatus("idle"); setLiveText(""); } };
    rec.onerror  = () => { setAiStatus("idle"); setLiveText(""); };
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join("");
      setLiveText(t);
      if (e.results[e.results.length - 1].isFinal) {
        rec.stop(); setAiStatus("thinking"); setLiveText("");
        setTimeout(() => sendMsg(t, true), 300);
      }
    };
    recRef.current = rec; rec.start();
  }

  const SM = {
    idle:      { icon: "🎓", label: "Listo para instrucciones", sub: "Escribe o usa el micrófono", color: "var(--muted)" },
    listening: { icon: "🎙️", label: "Escuchando…", sub: liveText || "Habla en español", color: "var(--critical)" },
    thinking:  { icon: "⚙️", label: "Analizando datos…", sub: "Procesando tu consulta", color: "var(--brand)" },
    speaking:  { icon: "🔊", label: "Respondiendo en voz…", sub: "Haz clic en ⏹ para detener", color: "var(--ok)" },
  };
  const sm = SM[aiStatus] || SM.idle;

  return (
    <div className="ai-panel">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--brand)", boxShadow: "0 0 8px var(--brand)", animation: aiStatus !== "idle" ? "pulse 1.4s ease infinite" : "none" }} />
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Asistente IA Académica</div>
          <span className="tag" style={{ background: "var(--brand-light)", color: "var(--brand)", fontSize: 10 }}>V.260428 · 16/04/2026</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          {studentRows.length} estudiantes · {courseInfo?.Name || "Curso activo"}
        </div>
      </div>

      {/* Status bar */}
      <div className={`ai-status-outer ${aiStatus !== "idle" ? aiStatus : ""}`}>
        <div className="ai-status-icon" style={{ fontSize: 18 }}>{sm.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: sm.color }}>{sm.label}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sm.sub}</div>
        </div>
        {(aiStatus === "listening" || aiStatus === "speaking") && (
          <div className="ai-wave">
            {[1,2,3,4,5].map((n) => (
              <div key={n} className="ai-wave-bar" style={{
                background: aiStatus === "listening" ? "var(--critical)" : "var(--ok)"
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Sugerencias rotativas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Sugerencias</span>
          <button
            onClick={() => {
              const shuffled = [...SUGGESTION_BANK].sort(() => Math.random() - 0.5).slice(0, 6);
              setVisibleChipsState(shuffled);
            }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--muted)", padding: "2px 4px", borderRadius: 4 }}
            title="Nuevas sugerencias"
          >↻ nuevas</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 5 }}>
          {visibleChips.map((c) => (
            <button
              key={c.label}
              className="ai-chip-btn"
              onClick={() => sendMsg(c.label)}
              style={{ textAlign: "left", fontSize: 11, padding: "6px 9px", borderRadius: 8, lineHeight: 1.35 }}
            >
              <span style={{ marginRight: 5 }}>{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="ai-chat" ref={chatRef}>
        {msgs.map((m) => (
          <div key={m.id} className={`ai-bubble-wrap ${m.role}`}>
            <div className="ai-meta">
              {m.role === "bot" ? "Asistente" : "Tú"}
              {m.fromVoice && <span className="ai-voice-badge">🎙️ voz</span>}
            </div>
            <div className={`ai-bubble ${m.role}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.text) }} />
            {m.role === "bot" && (
              <button
                className={`ai-speak-btn${activeSpeakId === m.id ? " active" : ""}`}
                onClick={() => activeSpeakId === m.id ? stopSpeaking() : speakText(m.text, m.id)}
              >
                {activeSpeakId === m.id ? "⏸ Detener" : "🔊 Escuchar"}
              </button>
            )}
          </div>
        ))}
        {aiStatus === "thinking" && (
          <div className="ai-bubble-wrap bot">
            <div className="ai-meta">Asistente</div>
            <div className="ai-bubble bot">
              <div className="ai-typing">
                <div className="ai-typing-dot" /><div className="ai-typing-dot" /><div className="ai-typing-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          className={`voice-btn${aiStatus === "listening" ? " listening" : ""}`}
          onClick={voiceOk ? toggleMic : undefined}
          title={voiceOk ? (aiStatus === "listening" ? "Detener" : "Hablar por voz") : "Micrófono no disponible en este navegador"}
          style={{ height: 40, width: 40, fontSize: 17, flexShrink: 0, opacity: voiceOk ? 1 : 0.4, cursor: voiceOk ? "pointer" : "not-allowed" }}
        >
          {aiStatus === "listening" ? "⏹" : "🎙️"}
        </button>
        <input
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
          placeholder={aiStatus === "listening" ? "🎙️ Escuchando…" : "Pregunta sobre el curso…"}
          style={{ height: 40 }}
        />
        <button className="ai-send-btn" onClick={() => sendMsg()} style={{ height: 40, padding: "0 14px", fontSize: 13 }}>↵</button>
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <button
          className={`ai-toggle${voiceOut ? " active" : ""}`}
          onClick={() => { setVoiceOut((v) => !v); if (aiStatus === "speaking") stopSpeaking(); }}
        >
          <div className="ai-toggle-dot" />
          <span style={{ fontSize: 11, fontWeight: 700, color: voiceOut ? "var(--ok)" : "var(--muted)" }}>
            {voiceOut ? "🔊 Voz activada" : "🔇 Voz desactivada"}
          </span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>TTS:</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: "var(--text)", fontFamily: "var(--font-mono)", outline: "none" }}
          >
            <option value={0.8}>Lenta</option>
            <option value={1.0}>Normal</option>
            <option value={1.2}>Rápida</option>
            <option value={1.5}>Muy rápida</option>
          </select>
          <button className={`ai-stop-btn${aiStatus === "speaking" ? " visible" : ""}`} onClick={stopSpeaking}>⏹ Detener</button>
        </div>
      </div>

      {/* Guide cards */}
      <div className="ai-guide-grid">
        {[
          { icon: "🎙️", color: "var(--brand)", title: "Entrada de Voz", desc: "Presiona el micrófono y habla en español. La transcripción se procesa automáticamente." },
          { icon: "🔊", color: "var(--ok)", title: "Salida de Voz", desc: "Activa la voz y el asistente leerá cada respuesta. Usa '🔊 Escuchar' en mensajes anteriores." },
          { icon: "⚡", color: "var(--watch)", title: "Datos Reales", desc: "Todas las respuestas usan los datos del curso en tiempo real — notas, cobertura, riesgo y RAs." },
        ].map((g) => (
          <div key={g.title} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>{g.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: g.color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{g.title}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{g.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Voice command helpers
// ─────────────────────────────────────────────────────────
function normalizeVoiceText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function includesAny(text, patterns) {
  return patterns.some((p) => text.includes(p));
}

function parseVoiceCommand(rawText) {
  const text = normalizeVoiceText(rawText);
  if (!text) return { type: "unknown", message: "No se reconoció ningún comando." };

  if (includesAny(text, ["resultado de aprendizaje","resultados de aprendizaje","prioridad academica","competencias","subcompetencias","logro por ra"])) {
    return { type: "navigate_section", section: "learning-outcomes", message: "Mostrando resultados de aprendizaje." };
  }
  if (includesAny(text, ["estudiantes prioritarios","prioritarios","mayor riesgo","riesgo mas alto","riesgo alto","en riesgo"])) {
    return { type: "highest_risk_student", message: "Buscando el estudiante con mayor riesgo académico." };
  }
  if (includesAny(text, ["resultado mas bajo","peor resultado","nota mas baja","menor nota","estudiante mas bajo","peor desempe"])) {
    return { type: "lowest_result_student", message: "Buscando el estudiante con menor desempeño." };
  }
  if (includesAny(text, ["estudiantes en riesgo","solo riesgo","muestrame los de riesgo","filtrar riesgo"])) {
    return { type: "filter_students_risk", message: "Filtrando estudiantes en riesgo." };
  }
  if (includesAny(text, ["evidencias","abre evidencias","mostrar evidencias"])) {
    return { type: "open_drawer_tab", tab: "evidencias", message: "Abriendo evidencias." };
  }
  if (includesAny(text, ["unidades","subcompetencias","abre unidades"])) {
    return { type: "open_drawer_tab", tab: "unidades", message: "Abriendo unidades." };
  }
  if (includesAny(text, ["intervencion","prescripcion"])) {
    return { type: "open_drawer_tab", tab: "prescripcion", message: "Abriendo intervención personalizada." };
  }
  if (includesAny(text, ["calidad","flags","calidad del modelo"])) {
    return { type: "open_drawer_tab", tab: "calidad", message: "Abriendo calidad del modelo." };
  }
  if (includesAny(text, ["resumen","volver al resumen"])) {
    return { type: "open_drawer_tab", tab: "resumen", message: "Abriendo resumen del estudiante." };
  }
  if (includesAny(text, ["aprobados","aprobado","pasando"])) {
    return { type: "filter_approved", message: "Mostrando estudiantes aprobados (≥7.0)." };
  }

  const buscarMatch = text.match(/(?:busca|buscar|abrir|abre|mostrar|muestrame)\s+a?\s*([a-zà-ü\s]+)$/i);
  if (buscarMatch?.[1] && buscarMatch[1].trim().length >= 3) {
    return { type: "find_student_by_name", name: buscarMatch[1].trim(), message: `Buscando a ${buscarMatch[1].trim()}.` };
  }
  if (includesAny(text, ["estudiantes","lista de estudiantes"])) {
    return { type: "navigate_section", section: "students", message: "Mostrando listado de estudiantes." };
  }
  if (text.length >= 3) {
    return { type: "text_search", text: rawText, message: `Buscando: ${rawText}` };
  }
  return { type: "unknown", message: "No se entendió el comando. Prueba: 'estudiante con resultado más bajo' o 'resultados de aprendizaje'." };
}

function findLowestResultStudent(rows) {
  const valid = (Array.isArray(rows) ? rows : []).filter(
    (s) => !s?.isLoading && s?.currentPerformancePct != null && !Number.isNaN(Number(s.currentPerformancePct))
  );
  if (!valid.length) return null;
  return valid.slice().sort((a, b) => Number(a.currentPerformancePct) - Number(b.currentPerformancePct))[0];
}

function findHighestRiskStudent(rows) {
  const valid = (Array.isArray(rows) ? rows : []).filter((s) => !s?.isLoading);
  if (!valid.length) return null;
  const riskRank = (s) => {
    const risk = computeRiskFromPct(s?.currentPerformancePct);
    if (risk === "alto") return 0;
    if (risk === "medio") return 1;
    if (risk === "bajo") return 2;
    return 3;
  };
  return valid.slice().sort((a, b) => {
    const rd = riskRank(a) - riskRank(b);
    if (rd !== 0) return rd;
    return Number(a?.currentPerformancePct ?? 999) - Number(b?.currentPerformancePct ?? 999);
  })[0];
}

function findStudentByName(rows, name) {
  const q = normalizeVoiceText(name);
  return (Array.isArray(rows) ? rows : []).find((s) => normalizeVoiceText(s?.displayName).includes(q)) || null;
}

// ─────────────────────────────────────────────────────────
// CoursePanel — lista de cursos del docente
// ─────────────────────────────────────────────────────────
function CoursePanel({ courses, loadingCourses, currentId, onSelect, onClose }) {
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) =>
        String(c.name || "").toLowerCase().includes(q) ||
        String(c.code || "").toLowerCase().includes(q)
    );
  }, [courses, search]);

  // Separate by role first, then by active state
  const instructorCourses = filtered.filter(c => !isStudentRole(c.roleName));
  const studentCourses = filtered.filter(c => isStudentRole(c.roleName));

  const renderSection = (title, list, color, icon) => {
    if (list.length === 0) return null;
    const active = list.filter(c => c.isActive !== false);
    const inactive = list.filter(c => c.isActive === false);
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{
          padding: "10px 16px 6px",
          display: "flex", alignItems: "center", gap: 8,
          borderTop: "1px solid var(--border)",
        }}>
          <span style={{ fontSize: 13 }}>{icon}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {title}
          </span>
          <span className="tag" style={{ background: color + "1A", color: color, marginLeft: "auto" }}>{list.length}</span>
        </div>
        {active.length > 0 && (
          <>
            {active.map((c) => (
              <CourseItem key={c.id} course={c} isActive={true} isCurrent={c.id === currentId} onSelect={onSelect} accent={color} />
            ))}
          </>
        )}
        {inactive.length > 0 && (
          <>
            <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Históricos
            </div>
            {inactive.map((c) => (
              <CourseItem key={c.id} course={c} isActive={false} isCurrent={c.id === currentId} onSelect={onSelect} accent={color} />
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="course-panel-overlay" onClick={onClose}>
      <div className="course-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Mis cursos</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              {loadingCourses
                ? "Cargando…"
                : `${instructorCourses.length} como profesor · ${studentCourses.length} como estudiante`}
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ padding: "6px 12px", fontSize: 12 }}>
            ✕ Cerrar
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código…"
            type="text"
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 10, padding: "8px 12px",
              fontWeight: 600, background: "var(--bg)",
              color: "var(--text)", fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingCourses ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              <div className="pulse-dot" style={{ background: "var(--brand)", width: 10, height: 10, margin: "0 auto 12px" }} />
              Consultando Brightspace…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              Sin resultados para "{search}"
            </div>
          ) : (
            <>
              {renderSection("Como Profesor", instructorCourses, "var(--brand)", "📊")}
              {renderSection("Como Estudiante", studentCourses, "var(--ok)", "🎓")}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CourseItem({ course, isActive, isCurrent, onSelect, accent }) {
  const startYear = course.startDate ? new Date(course.startDate).getFullYear() : null;
  const endYear   = course.endDate   ? new Date(course.endDate).getFullYear()   : null;
  const period = startYear && endYear && startYear !== endYear
    ? `${startYear}–${endYear}` : startYear ? String(startYear) : null;

  const isStudent = isStudentRole(course.roleName);
  const accentColor = accent || (isStudent ? "var(--ok)" : "var(--brand)");

  const handleClick = () => {
    if (isStudent) {
      // Student courses redirect to the student portal
      sessionStorage.setItem("gemelo_pending_org", String(course.id));
      window.location.href = window.location.origin + "/portal";
    } else {
      onSelect(course.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`course-item${isCurrent ? " active" : ""}`}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(); }}
      style={isCurrent ? { borderLeft: `3px solid ${accentColor}` } : undefined}
    >
      <div
        className="course-item-dot"
        style={{ background: isActive ? accentColor : "var(--muted)" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {course.name || `Curso ${course.id}`}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
          {course.code && (
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)", fontWeight: 600 }}>
              {course.code}
            </span>
          )}
          {period && (
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{period}</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        {isCurrent && (
          <span className="tag" style={{ fontSize: 10, padding: "2px 6px", background: accentColor + "1A", color: accentColor }}>Activo</span>
        )}
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>
          {course.id}
        </span>
      </div>
    </div>
  );
}

function StudentCard({ s, onOpen, weakestMacro }) {
  const gradeColor = colorForPct(s.currentPerformancePct, null);
  const covColor   = colorForPct(s.coveragePct, null);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(s)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(s); }}
      className="kpi-card fade-up"
      style={{ cursor: "pointer", borderRadius: 16, padding: "14px 14px 12px" }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {/* Avatar */}
        <StudentAvatar userId={s.userId} name={s.displayName} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.displayName}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--font-mono)", marginTop: 1 }}>ID {s.userId}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <StatusBadge status={s.isLoading ? "cargando" : s.risk} />
          {s.hasPrescription && <span className="tag" style={{ fontSize: 9 }}>📋 Plan activo</span>}
        </div>
      </div>

      {/* Rings + stats row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <CircularRing pct={s.currentPerformancePct ?? 0} size={56} stroke={5} color={gradeColor} label={fmtGrade10FromPct(s.currentPerformancePct)} fontSize={11} />
        <CircularRing pct={s.coveragePct ?? 0} size={56} stroke={5} color={covColor} label={fmtPct(s.coveragePct)} fontSize={10} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>NOTA · COBERTURA</div>
          {(s.mostCriticalMacro || weakestMacro) && (
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              RA crítico: <span style={{ fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                {s.mostCriticalMacro?.code ?? weakestMacro?.code}{!s.mostCriticalMacro && <span style={{ fontSize: 9, opacity: 0.5 }}>~</span>}
              </span>
            </div>
          )}
          {s.route?.title && (
            <div style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.route.title}</div>
          )}
        </div>
      </div>

      <button
        className="btn"
        style={{ width: "100%", fontSize: 12, padding: "7px 0", borderRadius: 10, textAlign: "center" }}
        onClick={(e) => { e.stopPropagation(); onOpen(s); }}
      >
        Ver gemelo digital →
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────

// CoursePanorama removed — cards moved inline

// ─────────────────────────────────────────────────────────────────────────────
// GradeDistributionCard — Barra de distribución de notas (inline en dashboard)
// ─────────────────────────────────────────────────────────────────────────────
function GradeDistributionCard({ studentRows, thresholds }) {
  const rows = Array.isArray(studentRows) ? studentRows : [];
  const withGrades = rows.filter(s => s.currentPerformancePct != null);
  const bands = [
    { label: "9–10", color: "#12B76A", min: 9,   max: 10 },
    { label: "8–9",  color: "#32D583", min: 8,   max: 9  },
    { label: "7–8",  color: "#6CE9A6", min: 7,   max: 8  },
    { label: "6–7",  color: "#FCD385", min: 6,   max: 7  },
    { label: "5–6",  color: "#F79009", min: 5,   max: 6  },
    { label: "<5",   color: "#D92D20", min: 0,   max: 5  },
  ].map(b => ({
    ...b,
    count: withGrades.filter(s => {
      const g = s.currentPerformancePct / 10;
      return b.min === 0 ? g < 5 : g >= b.min && g < b.max;
    }).length,
  }));
  const maxBand = Math.max(...bands.map(b => b.count), 1);
  const bajos  = rows.filter(s => computeRiskFromPct(s.currentPerformancePct) === "bajo");
  const medios = rows.filter(s => computeRiskFromPct(s.currentPerformancePct) === "medio");
  const altos  = rows.filter(s => computeRiskFromPct(s.currentPerformancePct) === "alto");
  const zeros  = rows.filter(s => s.currentPerformancePct == null);

  return (
    <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Distribución de notas <InfoTooltip text="Histograma de notas de los estudiantes en rangos de 1 punto. Los colores reflejan el estado: rojo=crítico (<5), amarillo=seguimiento (5-7), verde=óptimo (≥7). Excluye columnas 'Corte' para evitar doble conteo." /></span>} accent="brand">
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {bands.map(b => (
          <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, fontFamily: "var(--font-mono)", color: "var(--muted)", width: 30, flexShrink: 0 }}>{b.label}</span>
            <div style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--bg)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${b.count ? Math.max(8, Math.round((b.count / maxBand) * 100)) : 0}%`, background: b.color, borderRadius: 5, transition: "width 0.7s cubic-bezier(.4,0,.2,1)" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 900, fontFamily: "var(--font-mono)", color: b.count ? b.color : "var(--muted)", width: 20, textAlign: "right", flexShrink: 0 }}>{b.count}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-around" }}>
        {[
          { label: "OK",       count: bajos.length,  color: "var(--ok)"       },
          { label: "Medio",    count: medios.length,  color: "var(--watch)"    },
          { label: "Alto",     count: altos.length,   color: "var(--critical)" },
          { label: "Sin nota", count: zeros.length,   color: "var(--muted)"    },
        ].map(r => (
          <div key={r.label} style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontFamily: "var(--font-mono)", color: r.color, fontSize: 20, lineHeight: 1 }}>{r.count}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, marginTop: 3 }}>{r.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoutesView — Vista completa de rutas de intervención
// ─────────────────────────────────────────────────────────────────────────────
const ROUTE_DEFS = {
  route_coverage: {
    id: "route_coverage",
    num: 0,
    title: "Ruta 0 — Activar evidencia",
    color: "var(--critical)",
    bg: "var(--critical-bg)",
    border: "var(--critical-border)",
    icon: "📋",
    description: "El estudiante tiene muy poca cobertura de evaluación. La prioridad es identificar evidencias sin calificar y activarlas antes de que el semestre avance.",
    objective: "Subir cobertura por encima del 40% en los próximos 7 días.",
    actions: [
      "Identificar 1 evidencia crítica sin nota y publicarla esta semana",
      "Acordar fecha concreta de entrega con el estudiante",
      "Verificar que el estudiante tenga acceso al material del curso",
    ],
    success: "Cobertura superior al 40% confirmada en gradebook.",
  },
  route_high_risk: {
    id: "route_high_risk",
    num: 1,
    title: "Ruta 1 — Recuperación",
    color: "var(--watch)",
    bg: "var(--watch-bg)",
    border: "var(--watch-border)",
    icon: "🚨",
    description: "El estudiante está en riesgo alto. Su nota actual está por debajo del umbral crítico. Se requiere intervención inmediata con plan estructurado de corto plazo.",
    objective: "Subir nota por encima del umbral crítico en 2 semanas.",
    actions: [
      "Reunión 1:1 de 15 minutos para acordar objetivo semanal",
      "Actividad de refuerzo o re-entrega enfocada en el error principal",
      "Retroalimentación concreta + checklist de mejora",
    ],
    success: "Nota supera el umbral crítico en la siguiente evidencia.",
  },
  route_watch: {
    id: "route_watch",
    num: 2,
    title: "Ruta 2 — Ajuste dirigido",
    color: "var(--brand)",
    bg: "var(--brand-light)",
    border: "var(--brand-light2, #D6E4FF)",
    icon: "🎯",
    description: "El estudiante está en riesgo medio. Su desempeño es insuficiente en algún resultado de aprendizaje específico. El ajuste debe ser puntual y enfocado.",
    objective: "Subir el RA crítico por encima del umbral de observación.",
    actions: [
      "Microtarea guiada (30–45 min) sobre el punto débil identificado",
      "Ejemplo resuelto + plantilla de entrega para orientar al estudiante",
      "Seguimiento en la próxima evidencia del RA crítico",
    ],
    success: "RA crítico supera el 70% en la siguiente evaluación.",
  },
  route_ok: {
    id: "route_ok",
    num: 3,
    title: "Ruta 3 — Mantener desempeño",
    color: "var(--ok)",
    bg: "var(--ok-bg)",
    border: "var(--ok-border)",
    icon: "✅",
    description: "El estudiante tiene buen desempeño. La gestión aquí es de sostenimiento y motivación para que mantenga el ritmo hasta el cierre del semestre.",
    objective: "Sostener nota por encima del umbral de observación.",
    actions: [
      "Reconocer el logro con retroalimentación positiva específica",
      "Mantener entregas a tiempo para no perder cobertura",
      "Extensión opcional: reto avanzado para profundizar competencias",
    ],
    success: "Nota se mantiene por encima del umbral de observación al cierre.",
  },
};

function RoutesView({ studentRows, overview, courseInfo, thresholds, onSelectStudent, isMobile }) {
  const [selectedRoute, setSelectedRoute] = React.useState(null);
  const rows = Array.isArray(studentRows) ? studentRows : [];

  const byRoute = {};
  Object.keys(ROUTE_DEFS).forEach(id => { byRoute[id] = []; });
  rows.forEach(s => {
    const rid = s.route?.id;
    if (rid && byRoute[rid]) byRoute[rid].push(s);
  });

  const totalAssigned = Object.values(byRoute).reduce((a, arr) => a + arr.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Page header */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
          G.D · Rutas de atención
        </div>
        <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {courseInfo?.Name || "Curso activo"}
        </h1>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontWeight: 500 }}>
          {totalAssigned} estudiantes asignados · {Object.values(byRoute).filter(arr => arr.length > 0).length} rutas activas
        </div>
      </div>

      {/* Route cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        {Object.values(ROUTE_DEFS).map(route => {
          const students = byRoute[route.id] || [];
          const isSelected = selectedRoute === route.id;
          return (
            <div key={route.id}
              onClick={() => setSelectedRoute(isSelected ? null : route.id)}
              style={{
                border: `1.5px solid ${isSelected ? route.color : "var(--border)"}`,
                borderRadius: 16,
                background: isSelected ? route.bg : "var(--card)",
                cursor: "pointer",
                transition: "all 0.18s ease",
                overflow: "hidden",
              }}
              onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = route.color; e.currentTarget.style.background = route.bg; }}}
              onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; }}}
            >
              {/* Route header */}
              <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: route.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {route.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: route.color }}>{route.title}</div>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginTop: 1 }}>{route.objective}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "var(--font-mono)", color: route.color, lineHeight: 1 }}>{students.length}</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>est.</div>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>{route.description}</p>
              </div>

              {/* Actions */}
              <div style={{ padding: "10px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7 }}>Acciones docentes</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {route.actions.map((a, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: route.color, flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                      <span style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.45 }}>{a}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8, background: route.color + "14", fontSize: 11, color: route.color, fontWeight: 700 }}>
                  Criterio de éxito: {route.success}
                </div>
              </div>

              {/* Student list (when selected) */}
              {isSelected && students.length > 0 && (
                <div style={{ padding: "0 16px 14px" }}>
                  <div style={{ height: 1, background: "var(--border)", marginBottom: 10 }} />
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7 }}>
                    Estudiantes en esta ruta ({students.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {students.map(s => (
                      <div key={s.userId}
                        onClick={e => { e.stopPropagation(); onSelectStudent?.(s); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 9, background: "var(--card)", border: "1px solid var(--border)", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = route.color}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: route.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: route.color, flexShrink: 0 }}>
                          {(s.displayName || "?").charAt(0)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.displayName}</div>
                          {s.route?.summary && <div style={{ fontSize: 10, color: "var(--muted)" }}>{s.route.summary}</div>}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 900, fontFamily: "var(--font-mono)", color: colorForPct(s.currentPerformancePct, thresholds) }}>{fmtGrade10FromPct(s.currentPerformancePct)}</div>
                          <div style={{ fontSize: 9, color: "var(--muted)" }}>{fmtPct(s.coveragePct)}</div>
                        </div>
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>→</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isSelected && students.length === 0 && (
                <div style={{ padding: "10px 16px 14px", fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                  Ningún estudiante asignado a esta ruta actualmente.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// AppSidebar — Fixed left navigation
// ──────────────────────────────────────────────
function AppSidebar({ activeTab, setActiveTab, currentCourseName, mobileOpen, onClose }) {
  const NAV = [
    { id: "dashboard",  icon: "📊", label: "Dashboard" },
    { id: "routes",     icon: "🛤️", label: "Rutas de atención" },
    { id: "predictions", icon: "🔮", label: "Predicción de notas" },
    { id: "evidences",  icon: "📑", label: "Evidencias" },
    { id: "assistant",  icon: "🤖", label: "Asistente IA" },
  ];
  const NAV_BOTTOM = [
    { id: "help", icon: "💬", label: "Soporte" },
  ];

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={onClose} />
      )}
      <aside className={`app-sidebar${mobileOpen ? " mobile-open" : ""}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" style={{ fontSize: 12, letterSpacing: "0.01em" }}>CESA</div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-name">CESA · G.D</div>
            <div className="sidebar-logo-sub">Vista Docente</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Vistas</div>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item${activeTab === item.id ? " active" : ""}`}
              onClick={() => { setActiveTab(item.id); onClose?.(); }}
            >
              <span className="snav-icon">{item.icon}</span>
              <span>{item.label}</span>
              <span className="sidebar-nav-dot" />
            </button>
          ))}
        </nav>

        {/* Footer — current course */}
        <div className="sidebar-footer">
          {currentCourseName && (
            <div className="sidebar-course-pill">
              <div className="sidebar-course-label">Curso activo</div>
              <div className="sidebar-course-name" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentCourseName}
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>G.D</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", background: "var(--bg)", padding: "2px 7px", borderRadius: 99, border: "1px solid var(--border)" }}>V.260428</span>
          </div>
        </div>
      </aside>
    </>
  );
}

// ──────────────────────────────────────────────
// AppTopbar — Fixed top bar
// ──────────────────────────────────────────────
function AppTopbar({
  isMobile, onOpenSidebar, darkMode, setDarkMode,
  compact, toggleCompact,
  locale, toggleLocale,
  orgUnitInput, setOrgUnitInput, setOrgUnitId,
  handleOpenCoursePanel,
  authUser, isDualRole, onGoHome,
  onOpenPalette, onOpenCoordinator,
  isSuperAdmin, studentRows, onImpersonate,
}) {
  const [showImpersonateMenu, setShowImpersonateMenu] = useState(false);
  const [impersonateSearch, setImpersonateSearch] = useState("");
  return (
    <header className="app-topbar">
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {isMobile && (
          <button
            className="topbar-icon-btn"
            onClick={onOpenSidebar}
            title="Menú"
            style={{ fontSize: 18 }}
          >
            ☰
          </button>
        )}

        {/* Course search */}
        <div className="topbar-search">
          <span style={{ color: "var(--muted)", fontSize: 14 }}>🔍</span>
          <input
            value={orgUnitInput}
            onChange={(e) => setOrgUnitInput(e.target.value)}
            placeholder="ID de curso…"
            type="number"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = Number(orgUnitInput);
                if (v > 0) setOrgUnitId(v);
              }
            }}
          />
        </div>
      </div>

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {onOpenPalette && (
          <button
            className="btn"
            onClick={onOpenPalette}
            title="Paleta de comandos (Ctrl+K)"
            aria-label="Abrir paleta de comandos"
            style={{ padding: "7px 12px", fontSize: 12, borderRadius: 10, gap: 8 }}
          >
            <span>🔎</span>
            {!isMobile && <>
              <span>Comandos</span>
              <span style={{
                fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 4,
                background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)",
              }}>⌘K</span>
            </>}
          </button>
        )}
        {(isDualRole || isSuperAdmin) && (
          <button
            className="btn"
            onClick={onGoHome}
            title="Volver al inicio"
            aria-label="Volver al inicio"
            style={{ padding: "7px 12px", fontSize: 12, borderRadius: 10 }}
          >
            🏠 {isMobile ? "" : "Inicio"}
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={handleOpenCoursePanel}
          style={{ padding: "7px 14px", fontSize: 12, borderRadius: 10 }}
        >
          📚 {isMobile ? "" : "Mis cursos"}
        </button>

        {onOpenCoordinator && (
          <button
            className="topbar-icon-btn"
            onClick={onOpenCoordinator}
            title="Vista de coordinación (agregada)"
            aria-label="Abrir panel de coordinación"
          >
            🏛
          </button>
        )}
        {onImpersonate && (
          <div style={{ position: "relative" }}>
            <button
              className="btn"
              onClick={() => setShowImpersonateMenu((v) => !v)}
              title="Ver como profesor o estudiante"
              style={{
                padding: "7px 12px", fontSize: 12, borderRadius: 10,
                background: "rgba(255, 170, 0, 0.12)",
                color: "#b27300",
                border: "1px solid rgba(255, 170, 0, 0.3)",
              }}
            >
              👁 {isMobile ? "" : "Ver como..."}
            </button>
            {showImpersonateMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200,
                  width: 320, maxHeight: 400, background: "var(--card)",
                  border: "1px solid var(--border)", borderRadius: 12,
                  boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)", marginBottom: 6 }}>
                    👁 Impersonar usuario
                  </div>
                  <input
                    value={impersonateSearch}
                    onChange={(e) => setImpersonateSearch(e.target.value)}
                    placeholder="Buscar estudiante..."
                    autoFocus
                    style={{
                      width: "100%", padding: "8px 10px", fontSize: 12,
                      border: "1px solid var(--border)", borderRadius: 8,
                      background: "var(--bg)", color: "var(--text)",
                      fontFamily: "var(--font)", outline: "none",
                    }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "4px 0", maxHeight: 300 }}>
                  {(Array.isArray(studentRows) ? studentRows : [])
                    .filter((s) => {
                      if (!impersonateSearch.trim()) return true;
                      const q = impersonateSearch.toLowerCase();
                      return (s.displayName || "").toLowerCase().includes(q) ||
                             String(s.userId).includes(q);
                    })
                    .slice(0, 30)
                    .map((s) => (
                      <button
                        key={s.userId}
                        onClick={() => {
                          onImpersonate({ userId: s.userId, name: s.displayName });
                          setShowImpersonateMenu(false);
                          setImpersonateSearch("");
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          width: "100%", padding: "8px 14px", border: "none",
                          background: "transparent", cursor: "pointer",
                          fontSize: 12, fontFamily: "var(--font)",
                          color: "var(--text)", textAlign: "left",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-light)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: "var(--brand-light)", display: "flex",
                          alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 800, color: "var(--brand)", flexShrink: 0,
                        }}>{(s.displayName || "?").charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.displayName}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>ID {s.userId}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#b27300" }}>Ver como</span>
                      </button>
                    ))
                  }
                  {(Array.isArray(studentRows) ? studentRows : []).length === 0 && (
                    <div style={{ padding: "16px 14px", textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
                      Carga un curso primero para ver estudiantes
                    </div>
                  )}
                </div>
                <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--muted)", textAlign: "center" }}>
                  Vista previa del portal del estudiante
                </div>
              </div>
            )}
          </div>
        )}
        <button
          className="topbar-icon-btn"
          onClick={toggleLocale}
          title={locale === "es" ? "Switch to English" : "Cambiar a español"}
          aria-label="Cambiar idioma"
          style={{ fontSize: 10, fontWeight: 800 }}
        >
          {locale === "es" ? "ES" : "EN"}
        </button>
        <button
          className="topbar-icon-btn"
          onClick={toggleCompact}
          title={compact ? "Modo normal" : "Modo compacto (más densidad)"}
          aria-label={compact ? "Desactivar modo compacto" : "Activar modo compacto"}
          style={compact ? { borderColor: "var(--brand)", color: "var(--brand)" } : undefined}
        >
          {compact ? "◱" : "◰"}
        </button>
        <button
          className="topbar-icon-btn"
          onClick={() => setDarkMode((v) => !v)}
          title="Cambiar tema"
          aria-label="Cambiar tema claro/oscuro"
        >
          {darkMode ? "☀️" : "🌙"}
        </button>
        <button
          className="topbar-icon-btn"
          onClick={() => window.print()}
          title="Imprimir vista actual"
          aria-label="Imprimir vista actual"
        >
          🖨
        </button>

        {/* User avatar with initials */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
          <div
            className="topbar-avatar"
            title={authUser?.user_name || "Docente"}
            style={{ cursor: "default" }}
          >
            {authUser?.user_name ? authUser.user_name.trim().charAt(0).toUpperCase() : "D"}
          </div>
          {authUser?.user_name && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {authUser.user_name.split(" ").slice(0,2).join(" ")}
            </span>
          )}
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
            title="Cerrar sesión"
            style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, padding: "4px 8px", fontSize: 10, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────
// FloatingAI — Help menu (tutorial + updates + AI assistant)
// ──────────────────────────────────────────────
function FloatingAI({ onOpenTutorial, onOpenAssistant }) {
  const [open, setOpen] = React.useState(false);
  const [showUpdates, setShowUpdates] = React.useState(false);

  const menuItems = [
    {
      icon: "📖",
      title: "Tutorial",
      desc: "Guía paso a paso de la plataforma",
      onClick: () => { setOpen(false); onOpenTutorial?.(); },
    },
    {
      icon: "🆕",
      title: "Actualizaciones",
      desc: `${UPDATES_STEPS.length} novedades recientes`,
      badge: UPDATES_STEPS.length,
      onClick: () => { setOpen(false); setShowUpdates(true); },
    },
    {
      icon: "🤖",
      title: "Asistente IA",
      desc: "Consultas en lenguaje natural",
      onClick: () => { setOpen(false); onOpenAssistant?.(); },
    },
  ];

  return (
    <>
      {showUpdates && <UpdatesModal onClose={() => setShowUpdates(false)} />}
      <div className="ai-fab">
        {open && (
          <div className="ai-fab-panel" style={{ width: 250, maxHeight: "none" }}>
            <div className="ai-fab-panel-header" style={{ padding: "10px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 14 }}>❓</span>
                <span style={{ fontSize: 12, fontWeight: 800 }}>Centro de ayuda</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}
              >✕</button>
            </div>

            <div style={{ padding: "10px 9px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {menuItems.map((item) => (
                <button
                  key={item.title}
                  onClick={item.onClick}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 14px", borderRadius: 10,
                    border: "1.5px solid var(--border)",
                    background: "var(--bg)", cursor: "pointer",
                    textAlign: "left", fontFamily: "var(--font)",
                    transition: "all 0.13s", position: "relative",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "var(--brand-light)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg)"; }}
                >
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text)" }}>{item.title}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{item.desc}</div>
                  </div>
                  {item.badge != null && (
                    <span style={{
                      fontSize: 9, fontWeight: 900, background: "#16a34a", color: "#fff",
                      padding: "2px 6px", borderRadius: 99, flexShrink: 0,
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          className={`ai-fab-btn${open ? " active" : ""}`}
          onClick={() => setOpen(v => !v)}
          title="Centro de ayuda"
        >
          <span style={{ color: "#fff", fontSize: open ? 20 : 22, fontWeight: 900 }}>{open ? "✕" : "?"}</span>
        </button>
      </div>
    </>
  );
}

/**
 * =========================
 * Main App
 * =========================
 */
export default function TeacherDashboard() {
  useEffect(() => {
    injectStyles();
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
  const [activeSection, setActiveSection] = useState("students");
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

        // Llamar /auth/me con sid como query param (bypass cross-domain cookie)
        const _meUrl = _sid
          ? apiUrl(`/auth/me?sid=${encodeURIComponent(_sid)}`)
          : apiUrl("/auth/me");
        const res = await fetch(_meUrl, {
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
  const [overview, setOverview] = useState(null);
  const [studentsList, setStudentsList] = useState(null);
  const [studentRows, setStudentRows] = useState([]);
  const [raDashboard, setRaDashboard] = useState(null);

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

  // Compact mode
  const { compact, toggleCompact } = useCompactMode();

  // Command palette (Ctrl+K)
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Coordinator panel overlay (renders on top of dashboard, avoids re-fetch)
  const [showCoordinator, setShowCoordinator] = useState(false);

  // SuperAdmin impersonation: view a student's portal
  const [impersonateStudent, setImpersonateStudent] = useState(null); // { userId, name }

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

  // ── Main navigation tabs ──────────────────────────────
  const [activeTab, setActiveTab] = useState("dashboard"); // "dashboard" | "assistant"
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
        apiGet(`/brightspace/courses/enrolled?active_only=false&limit=200`),
        apiGet(`/brightspace/my-course-offerings?active_only=false&limit=50`),
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
        const [ovRes, stRes, raRes, loRes] = await Promise.allSettled([
          apiGet(overviewUrl, { signal: controller.signal }),
          apiGet(`/gemelo/course/${orgUnitId}/students?include=summary`, { signal: controller.signal }),
          apiGet(`/gemelo/course/${orgUnitId}/ra/dashboard`, { signal: controller.signal }),
          apiGet(`/gemelo/course/${orgUnitId}/learning-outcomes`, { signal: controller.signal }),
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

          const sets = Array.isArray(payload?.outcomeSets) ? payload.outcomeSets : [];
          const map = {};
          for (const set of sets) {
            for (const o of set?.Outcomes || []) {
              const desc = String(o?.Description || "").trim();
              const m = desc.match(/^([A-Za-z0-9_.-]+)\s*-\s*(.+)$/);
              if (m) {
                const code = String(m[1]).toUpperCase();
                map[code] = {
                  code,
                  description: desc,
                  title: String(m[2] || "").trim(),
                };
              }
            }
          }
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

          if (Object.keys(atRiskMap).length > 0) {
            setStudentRows((prev) =>
              prev.map((row) => {
                const ar = atRiskMap[row.userId];
                if (!ar) return row;
                const perf = ar.currentPerformancePct ?? null;
                const merged = {
                  ...row,
                  currentPerformancePct: perf,
                  coveragePct: ar.coveragePct ?? row.coveragePct,
                  risk: computeRiskFromPct(perf),
                  notSubmittedWeightPct: Number(ar.overdueUnscoredWeightPct ?? ar.notSubmittedWeightPct ?? 0),
                  overdueWeightPct:      Number(ar.overdueUnscoredWeightPct ?? ar.notSubmittedWeightPct ?? 0),
                  pendingSubmittedWeightPct: Number(ar.pendingUngradedWeightPct ?? ar.pendingSubmittedWeightPct ?? 0),
                  // mostCriticalMacro now included from backend studentsAtRisk
                  mostCriticalMacro: ar.mostCriticalMacro ?? row.mostCriticalMacro ?? null,
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
        setStudentRows((prev) =>
          prev.map((row) => {
            const ar = atRiskMap2[row.userId];
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
              mostCriticalMacro: ar?.mostCriticalMacro ?? row.mostCriticalMacro ?? null,
            };
            merged.route = suggestRouteForStudent(merged, thr);
            return merged;
          })
        );
      } catch (e) {
        if (controller.signal.aborted || !isMounted) return;
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
          apiGet(`/brightspace/course/${orgUnitId}`, { signal: controller.signal }),
          apiGet(`/brightspace/course/${orgUnitId}/content/root`, { signal: controller.signal }),
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
        const g = await apiGet(`/gemelo/course/${orgUnitId}/student/${selectedStudent.userId}`, {
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
      };
    });
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

  valid.sort((a, b) => a.avgPct - b.avgPct);
  return valid[0];
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

    return { createdCount, minExpected, progressRatio };
  }, [contentRoot, courseInfo?.StartDate, courseInfo?.EndDate]);

  const contentRhythmMeta = useMemo(() => {
    return contentRhythmStatus(contentKpis?.progressRatio);
  }, [contentKpis]);
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
    cmds.push({ id: "nav_routes", group: "Navegar", icon: "🛤️", label: "Rutas de atención", hint: "2", action: () => setActiveTab("routes") });
    cmds.push({ id: "nav_assistant", group: "Navegar", icon: "🤖", label: "Asistente IA", hint: "3", action: () => setActiveTab("assistant") });
    // Actions
    cmds.push({ id: "act_courses", group: "Acciones", icon: "📚", label: "Cambiar de curso", action: () => handleOpenCoursePanel() });
    cmds.push({ id: "act_refresh", group: "Acciones", icon: "⟳", label: "Refrescar datos", hint: "R", action: handleRefresh });
    cmds.push({ id: "act_print", group: "Acciones", icon: "🖨", label: "Imprimir vista actual", action: () => window.print() });
    cmds.push({ id: "act_compact", group: "Acciones", icon: compact ? "◱" : "◰", label: compact ? "Desactivar modo compacto" : "Activar modo compacto", action: toggleCompact });
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
  }, [studentRows, compact, darkMode, groupByRisk]);

  // Global keyboard shortcuts
  useKeyboardShortcuts([
    { keys: "ctrl+k", handler: () => setPaletteOpen(true), description: "Abrir paleta" },
    { keys: "/", handler: () => setPaletteOpen(true), description: "Abrir paleta" },
    { keys: "escape", handler: () => { setSelectedStudent(null); setPaletteOpen(false); }, description: "Cerrar" },
    { keys: "1", handler: () => setActiveTab("dashboard"), description: "Dashboard" },
    { keys: "2", handler: () => setActiveTab("routes"), description: "Rutas" },
    { keys: "3", handler: () => setActiveTab("assistant"), description: "Asistente" },
    { keys: "r", handler: handleRefresh, description: "Refrescar" },
    { keys: "c", handler: handleOpenCoursePanel, description: "Cambiar curso" },
    { keys: "?", handler: () => setPaletteOpen(true), description: "Ayuda" },
    { keys: "shift+/", handler: () => setPaletteOpen(true), description: "Ayuda" },
  ], [compact, darkMode, groupByRisk]);

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

  // Sin curso seleccionado → mostrar selector automáticamente
  if (!orgUnitId || orgUnitId === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font)", padding: 20 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "36px 40px", maxWidth: 480, width: "100%", boxShadow: "var(--shadow-lg)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 900 }}>CESA</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "var(--text)" }}>G.D</div>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                Hola, {authUser?.user_name?.split(" ")[0] || "docente"} — selecciona tu curso
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: "var(--border)", marginBottom: 20 }} />
          {/* Header con total */}
          {!loadingCourses && courseList.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, fontWeight: 600 }}>
              {courseSearch
                ? `${courseList.length} resultado${courseList.length !== 1 ? "s" : ""} para "${courseSearch}"`
                : `${courseList.length} cursos recientes · ${courseList.filter(c => c.isActive).length} activos`
              }
            </div>
          )}
          {/* Buscador */}
          {!loadingCourses && courseList.length > 0 && (
            <div style={{ position: "relative", marginBottom: 10 }}>
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
                style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12, fontFamily: "var(--font)", outline: "none", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = "var(--brand)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--muted)" }}>🔍</span>
            </div>
          )}
          {loadingCourses ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>
              Cargando tus cursos…
            </div>
          ) : courseList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 10 }}>
                {courseSearch ? `Sin resultados para "${courseSearch}"` : "No se encontraron cursos."}
              </div>
              {courseSearch && (
                <button
                  onClick={() => {
                    setCourseSearch("");
                    setCourseListLoaded(false);
                    searchCourses("");
                  }}
                  style={{ background: "var(--brand)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          ) : (() => {
            const instructorCourses = courseList.filter(c => !isStudentRole(c.roleName));
            const studentCourses = courseList.filter(c => isStudentRole(c.roleName));

            const CourseBtn = ({ c, color, hoverBg }) => (
              <button key={c.id}
                onClick={() => {
                  if (isStudentRole(c.roleName)) {
                    sessionStorage.setItem("gemelo_pending_org", String(c.id));
                    window.location.href = window.location.origin + "/portal";
                  } else {
                    switchCourse(c.id);
                  }
                }}
                aria-label={`Abrir curso ${c.name}`}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", borderRadius: 10, border: `1.5px solid var(--border)`,
                  background: "var(--bg)", cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s", fontFamily: "var(--font)", width: "100%",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = hoverBg; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg)"; }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>{c.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>ID {c.id}{c.code ? ` · ${c.code}` : ""}</span>
                    {!c.isActive && <span style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 99, padding: "1px 6px", textTransform: "uppercase" }}>Inactivo</span>}
                  </div>
                </div>
                <span style={{ color, fontSize: 16, flexShrink: 0 }}>→</span>
              </button>
            );

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 420, overflowY: "auto" }}>
                {instructorCourses.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>📊</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--brand)" }}>Como Profesor ({instructorCourses.length})</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {instructorCourses.map(c => <CourseBtn key={`i-${c.id}`} c={c} color="var(--brand)" hoverBg="var(--brand-light)" />)}
                    </div>
                  </div>
                )}
                {studentCourses.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 14 }}>🎓</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--ok)" }}>Como Estudiante ({studentCourses.length})</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {studentCourses.map(c => <CourseBtn key={`s-${c.id}`} c={c} color="var(--ok)" hoverBg="var(--ok-bg)" />)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
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
              style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "var(--muted)", cursor: "pointer" }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
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
        onOpenSidebar={() => setSidebarOpen(true)}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        compact={compact}
        toggleCompact={toggleCompact}
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
        studentRows={studentRows}
        onImpersonate={setImpersonateStudent}
      />

      {/* ── Main content ── */}
      <main className="app-main">
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
              <GradePredictions
                studentRows={studentRows}
                onStudentClick={selectStudentById}
                courseInfo={courseInfo}
                variant="full"
              />
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
              <EvidenceReports
                orgUnitId={orgUnitId}
                studentRows={studentRows}
                courseInfo={courseInfo}
                onStudentClick={selectStudentById}
              />
            </Card>
          </div>
        )}

        {/* ── Assistant tab ── */}
        {activeTab === "assistant" && (
          <div className="fade-up tab-enter">
            <VoiceAssistant
              studentRows={studentRows}
              overview={overview}
              raDashboard={raDashboard}
              courseInfo={courseInfo}
              thresholds={thresholds}
            />
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

        {/* ── Alertas inteligentes (fusiona Radar docente + heurísticas locales) ── */}
        <div className="fade-up fade-up-1" style={{ marginBottom: 16 }}>
          <SmartAlerts
            studentRows={studentRows}
            overview={overview}
            courseInfo={courseInfo}
            contentKpis={contentKpis}
            backendAlerts={overview?.alerts}
            onStudentClick={selectStudentById}
          />
        </div>

        {/* ── Resumen semanal IA (narrativa) ── */}
        <div className="fade-up fade-up-1" style={{ marginBottom: 16 }}>
          <ContextualTip
            id="batch4_intro_v3"
            title="✨ Nuevas funciones disponibles"
            description="Tu dashboard ahora tiene resumen narrativo con IA, predicción de notas finales (menú lateral), alertas inteligentes, tendencias históricas y más. Haz Ctrl+K para la paleta de comandos, o presiona ? para ver todos los atajos."
          />
          <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>🤖 Resumen semanal <InfoTooltip text="Resumen narrativo en lenguaje natural del estado del curso. Se genera automáticamente a partir de los datos actuales. Puedes escucharlo con TTS." /></span>} accent="brand">
            <AINarrativeSummary
              studentRows={studentRows}
              overview={overview}
              courseInfo={courseInfo}
              raDashboard={raDashboard}
              contentKpis={contentKpis}
            />
          </Card>
        </div>

        <div
          className="fade-up fade-up-2"
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : isNarrow ? "1fr 1fr" : "minmax(260px,2fr) minmax(180px,1fr) minmax(200px,1.4fr) minmax(180px,1.2fr)",
            gap: 16,
            marginBottom: 16,
            alignItems: "start",
          }}
        >
          <div ref={overviewRef}>
          <Card title="Gestión del curso" right={<StatusBadge status={courseStatus} />} accent="brand">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 16,
                marginBottom: 14,
              }}
            >
              <Stat
                label="Nota promedio (0–10)"
                value={avgPerfPct == null || Number(avgPerfPct) === 0 ? "—" : fmtGrade10FromPct(avgPerfPct)}
                valueColor={colorForPct(avgPerfPct, thresholds)}
                sub={
                  avgCov == null || Number(avgCov) === 0
                    ? "Sin cobertura registrada"
                    : `${fmtPct(covDone)} calificado · ${fmtPct(covPending)} pendiente`
                }
              />
              <Stat
                label="Estudiantes"
                value={studentsCount}
                sub={`${overview?.courseGradebook?.avgGradedItemsCount ?? 0}/${overview?.courseGradebook?.avgTotalItemsCount ?? 0} ítems prom.`}
              />
            </div>

            <Divider />

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                En riesgo (alto + medio)
              </div>
              <InfoTooltip text="Este indicador es un resultado. La gestión del curso se prioriza por acciones docentes: publicación sostenida de contenidos, oportunidad de retroalimentación y cierre evaluativo. Objetivo operativo: mínimo 1 contenido nuevo cada 2 semanas y retroalimentación posterior al vencimiento en máximo 8 días." />
            </div>

            <Stat
              label=""
              value={atRiskPct == null ? "—" : fmtPct(atRiskPct)}
              valueColor={
                atRiskPct != null && atRiskPct > 40
                  ? COLORS.critical
                  : atRiskPct != null && atRiskPct > 20
                  ? COLORS.watch
                  : COLORS.ok
              }
              sub={totalStudents ? `${atRiskCount} de ${totalStudents} estudiantes` : "—"}
            />

            <Divider />

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Ritmo de contenidos del profesor
              </div>
              <InfoTooltip text="Se mide el contenido o módulo actualizados/creados desde el inicio del curso." />
              <div style={{ marginLeft: "auto" }}>
                <span
                  className="badge"
                  style={{ background: contentRhythmMeta.bg, color: contentRhythmMeta.color }}
                >
                  <span
                    className="pulse-dot"
                    style={{ background: contentRhythmMeta.color, width: 6, height: 6 }}
                  />
                  {contentRhythmMeta.label}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div
                style={{
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "var(--card)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Contenidos creados
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>
                  {contentKpis?.createdCount == null ? "—" : contentKpis.createdCount}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  Desde inicio del curso
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "var(--card)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Mínimo esperado
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>
                  {contentKpis?.minExpected == null ? "—" : contentKpis.minExpected}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  Basado en avance del curso
                </div>
              </div>
            </div>

            {contentKpis?.progressRatio != null && (
              <div style={{ marginTop: 10 }}>
                <ProgressBar
                  value={Math.min(100, contentKpis.progressRatio * 100)}
                  color={contentRhythmMeta.color}
                  animate={false}
                  showLabel={false}
                />
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginTop: 6,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Cumplimiento vs mínimo</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800 }}>
                    {Math.round(contentKpis.progressRatio * 100)}%
                  </span>
                </div>
              </div>
            )}

            <Divider />

            <div style={{ marginTop: 14 }}>
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

          {/* ── Riesgo académico + Distribución apilados en 1 columna ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Riesgo académico <InfoTooltip text="Distribución de los estudiantes según su nota actual: Alto (<5.0), Medio (5.0–7.0), Bajo (≥7.0). Calculado solo con notas reales del gradebook, excluye columnas 'Corte'." /></span>} accent="pending">
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={riskData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={82}
                      paddingAngle={3}
                    >
                      {riskData.map((entry) => (
                        <Cell key={entry.key} fill={colorForRisk(entry.key)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => {
                        const v = Number(value || 0);
                        const pct = totalStudents > 0 ? (v / totalStudents) * 100 : 0;
                        return [`${v} (${pct.toFixed(1)}%)`, "Estudiantes"];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
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

            <GradeDistributionCard studentRows={studentRows} thresholds={thresholds} />
          </div>

          <div ref={priorityRef}>
          <Card
            title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Estudiantes prioritarios <InfoTooltip text="Estudiantes que requieren tu atención inmediata: nota crítica (<5), cobertura baja (<60%), ítems vencidos sin calificar o pendientes de calificación. Ordenados por nivel de riesgo." /></span>} accent="critical"
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
                <div style={{ overflowY: "auto", maxHeight: 420, paddingRight: 2, display: "flex", flexDirection: "column", gap: 6 }}>
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
              <div className="empty-state" style={{ minHeight: 160 }}>
                <span className="empty-state-icon">✅</span>
                <span style={{ fontSize: 12 }}>Sin estudiantes críticos</span>
                <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
                  Todos los estudiantes tienen cobertura ≥ 60% y sin ítems vencidos.
                </span>
              </div>
            )}
          </Card>
          </div>

          <div ref={learningOutcomesRef}>
          <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Prioridad académica <InfoTooltip text="Resultados de Aprendizaje (RA) del curso ordenados de menor a mayor desempeño. El RA en primera posición es donde tus estudiantes están más débiles — prioriza refuerzo ahí." /></span>} accent="brand">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {learningOutcomesData
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
                              : <span style={{ fontSize: 9, fontWeight: 800, color: "var(--muted)", background: "var(--bg)", padding: "2px 7px", borderRadius: 99, border: "1px solid var(--border)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sin uso</span>
                            }
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>
                          Peso {m.weightPct ? `${Number(m.weightPct).toFixed(0)}%` : "—"}
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
                            Sin evaluaciones vinculadas a rúbricas aún.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

              {!learningOutcomesData.length && (
                <div className="empty-state">
                  <span className="empty-state-icon">🎯</span>
                  <span style={{ fontSize: 12 }}>Sin datos de RA</span>
                  {Number(avgCov ?? 0) > 0 && (
                    <span style={{ fontSize: 11, color: "var(--watch)", fontWeight: 700, textAlign: "center", padding: "4px 8px", borderRadius: 8, background: "var(--watch-bg)", marginTop: 4 }}>
                      ⚠️ Hay evidencias calificadas pero sin rúbricas vinculadas a RA
                    </span>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        </div>

        {/* ── Analytics section: Trends ── */}
        <div className="fade-up fade-up-3" style={{ marginTop: 20, marginBottom: 16 }}>
          <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Tendencias del curso <InfoTooltip text="Evolución de nota promedio, porcentaje en riesgo y cobertura a lo largo de los últimos días. Los datos se capturan automáticamente cada vez que abres el dashboard." /></span>} accent="brand">
            <CourseTrends snapshots={courseSnapshots} />
          </Card>
        </div>

        {/* ── Calendario de entregas ── */}
        <div className="fade-up fade-up-3" style={{ marginBottom: 16 }}>
          <Card title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Calendario de entregas <InfoTooltip text="Próximas entregas del curso con detección de sobrecarga (3+ en el mismo día). Heatmap semanal al final. Toma los datos directamente del gradebook del curso." /></span>}>
            <DueDateCalendar orgUnitId={orgUnitId} studentRows={studentRows} />
          </Card>
        </div>

        <div ref={studentsRef} className="fade-up fade-up-3" style={{ marginTop: 4 }}>
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
                            <td colSpan={10} style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
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



        </>}

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
                                <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "right" }}>Peso</th>
                                <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "right" }}>Nota</th>
                                <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", textAlign: "center" }}>Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drawerNonCorte.map((e, i) => (
                                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                  <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                                    {e.name || `Ítem ${e.gradeObjectId}`}
                                    {e.dueDate && (
                                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                                        🗓 {fmtDue(e.dueDate)}
                                      </div>
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
                              ))}
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
          <React.Suspense fallback={
            <div style={{ padding: "80px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              Cargando portal del estudiante...
            </div>
          }>
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
          <React.Suspense fallback={
            <div style={{ padding: "80px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              Cargando panel coordinador...
            </div>
          }>
            <CoordinatorDashboard onClose={() => setShowCoordinator(false)} />
          </React.Suspense>
        </div>
      )}
    </div>
  );
}