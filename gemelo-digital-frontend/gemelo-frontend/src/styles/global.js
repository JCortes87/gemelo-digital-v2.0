// Extracted from App.jsx — CSS injection for global styles
// This is the same GLOBAL_STYLES string, now in its own module.

export { injectStyles };

function injectStyles() {
  if (typeof document === "undefined") return;
  const id = "gemelo-styles";
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = GLOBAL_STYLES;
  document.head.appendChild(el);
}

// Re-export for use in components that need to ensure styles are loaded
export { GLOBAL_STYLES };

const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --sidebar-w: 220px;
    --bg: #F2F4F8;
    --bg2: #FAFBFD;
    --card: #FFFFFF;
    --border: #E4E8EF;
    --border2: #CDD3DE;
    --text: #0F1827;
    --muted: #5A6580;
    --muted-strong: #3D465C;
    --focus-ring: rgba(11,95,255,0.35);
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
    --muted-strong: #C6D2E2;
    --focus-ring: rgba(96,165,250,0.55);
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

  .app-sidebar {
    position: fixed; left: 0; top: 0; bottom: 0;
    width: var(--sidebar-w); background: var(--card);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column; z-index: 100;
    transition: transform 0.28s cubic-bezier(.4,0,.2,1);
  }
  .app-sidebar.collapsed { transform: translateX(calc(-1 * var(--sidebar-w))); }
  .sidebar-logo { padding: 22px 20px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .sidebar-logo-icon { width: 36px; height: 36px; background: var(--brand); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px; font-weight: 900; letter-spacing: -0.05em; flex-shrink: 0; }
  .sidebar-logo-text { line-height: 1.2; }
  .sidebar-logo-name { font-size: 12px; font-weight: 800; color: var(--text); letter-spacing: 0.02em; }
  .sidebar-logo-sub { font-size: 10px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
  .sidebar-nav { padding: 12px 10px; flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .sidebar-section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); padding: 8px 10px 4px; margin-top: 8px; }
  .sidebar-nav-item { display: flex; align-items: center; gap: 9px; padding: 9px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; transition: all 0.15s ease; border: none; background: transparent; width: 100%; text-align: left; }
  .sidebar-nav-item:hover { background: var(--bg); color: var(--text); }
  .sidebar-nav-item.active { background: var(--brand-light); color: var(--brand); }
  .sidebar-nav-item.active .snav-icon { color: var(--brand); }
  .sidebar-nav-dot { width: 5px; height: 5px; border-radius: 50%; background: transparent; transition: background 0.15s; flex-shrink: 0; margin-left: auto; }
  .sidebar-nav-item.active .sidebar-nav-dot { background: var(--brand); }
  .snav-icon { font-size: 16px; flex-shrink: 0; }
  .sidebar-footer { padding: 12px 10px 16px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; }
  .sidebar-course-pill { padding: 10px 12px; border-radius: 10px; background: var(--brand-light); margin-bottom: 8px; }
  .sidebar-course-label { font-size: 9px; font-weight: 800; color: var(--brand); text-transform: uppercase; letter-spacing: 0.1em; }
  .sidebar-course-name { font-size: 11px; font-weight: 700; color: var(--text); margin-top: 2px; line-height: 1.3; }

  .app-topbar { position: fixed; left: var(--sidebar-w); right: 0; top: 0; height: 56px; background: rgba(255,255,255,0.9); backdrop-filter: blur(16px) saturate(180%); -webkit-backdrop-filter: blur(16px) saturate(180%); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 24px 0 20px; z-index: 50; transition: left 0.28s cubic-bezier(.4,0,.2,1); }
  .dark .app-topbar { background: rgba(26,35,50,0.92); }
  .dark .app-sidebar { background: var(--card); border-color: var(--border); }
  .dark .kpi-card { border-color: var(--border); }
  .dark .tr-hover:hover { background: var(--brand-light) !important; }
  .dark input[type="text"], .dark input[type="number"] { background: var(--bg); color: var(--text); border-color: var(--border); }
  .dark .btn { background: var(--card); color: var(--text); border-color: var(--border); }
  .dark .btn:hover { background: var(--brand-light); }
  .dark .chip { background: var(--card); border-color: var(--border); color: var(--muted); }
  .dark .tag { background: var(--brand-light); color: var(--brand); }
  .dark .badge { border-color: rgba(255,255,255,0.1); }
  .dark .topbar-search { background: var(--bg); border-color: var(--border); }
  .dark .topbar-search input { color: var(--text); }
  .dark .topbar-icon-btn { border-color: var(--border); color: var(--muted); }
  .dark .topbar-icon-btn:hover { background: var(--bg); color: var(--text); }
  .dark .sidebar-nav-item:hover { background: var(--bg); }
  .dark .sidebar-nav-item.active { background: var(--brand-light); }
  .dark .course-item:hover { background: var(--brand-light); }
  .dark .scenario-card { background: var(--card); border-color: var(--border); }
  .dark .scenario-card.scenario-risk { background: var(--critical-bg); border-color: var(--critical-border); }
  .dark .scenario-card.scenario-improve { background: var(--ok-bg); border-color: var(--ok-border); }
  .dark .empty-state { background: var(--card); border-color: var(--border); }
  .dark .qc-flag { background: var(--bg); border-color: var(--border); }

  /* ── Compact / Dense Mode ── */
  .compact body { font-size: 13px; }
  .compact .app-content { padding: 16px 20px; }
  .compact .kpi-card { padding: 14px; border-radius: 14px; }
  .compact .sidebar-nav-item { padding: 7px 10px; font-size: 12px; }
  .compact .sidebar-logo { padding: 16px 16px 14px; }
  .compact .app-topbar { height: 48px; }
  .compact .app-main { padding-top: 48px; }
  .compact table th, .compact table td { padding: 6px 8px !important; font-size: 11px !important; }
  .compact .badge { padding: 2px 8px; font-size: 9px; }
  .compact .tag { padding: 2px 7px; font-size: 9px; }
  .compact .btn { padding: 6px 11px; font-size: 12px; }

  /* ── Print Mode: Optimize for printing a student profile ── */
  @media print {
    @page { margin: 1.5cm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { background: #fff !important; color: #000 !important; }

    /* Hide chrome (sidebar, topbar, FABs, buttons, panels) */
    .app-sidebar, .app-topbar, .ai-fab, .sidebar-backdrop,
    .course-panel-overlay, .voice-btn, .topbar-icon-btn,
    .main-tabs, .chip, .ai-panel,
    button:not(.print-visible) {
      display: none !important;
    }

    /* When a drawer is open, ONLY print the drawer content — hide the rest */
    body.drawer-is-open .app-main,
    body.drawer-is-open main.app-main {
      display: none !important;
    }

    /* Reset main content positioning */
    .app-main { margin-left: 0 !important; padding-top: 0 !important; }
    .app-content { padding: 0 !important; max-width: 100% !important; }

    /* Cards: avoid page breaks inside */
    .kpi-card {
      break-inside: avoid;
      page-break-inside: avoid;
      box-shadow: none !important;
      border: 1px solid #ccc !important;
      margin-bottom: 12px !important;
      padding: 14px !important;
    }

    /* Drawer overlay → static, full-width when printing */
    .drawer-print-mode {
      position: static !important;
      inset: auto !important;
      background: #fff !important;
      backdrop-filter: none !important;
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      z-index: auto !important;
    }
    .drawer-print-mode > div {
      position: static !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
      box-shadow: none !important;
      border: none !important;
      animation: none !important;
      transform: none !important;
    }
    .drawer-enter { animation: none !important; transform: none !important; }

    /* Hide cesa-loader animations */
    .cesa-loader-wrap, .cesa-water-text { display: none !important; }

    /* Tables: keep rows together */
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }

    /* Feedback modal print: hide everything except the modal body */
    body.print-feedback-modal > *:not(.feedback-print-root) { display: none !important; }
    body.print-feedback-modal .feedback-print-root {
      position: static !important;
      inset: auto !important;
      background: #fff !important;
      backdrop-filter: none !important;
      padding: 0 !important;
      display: block !important;
    }
    body.print-feedback-modal .feedback-print-card {
      position: static !important;
      max-width: 100% !important;
      max-height: none !important;
      overflow: visible !important;
      box-shadow: none !important;
      border: none !important;
    }
    body.print-feedback-modal .feedback-print-root button { display: none !important; }

    .print-only { display: block !important; }
  }
  .print-only { display: none; }
  .app-topbar.sidebar-collapsed { left: 0; }
  .topbar-search { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 7px 12px; width: 240px; transition: all 0.15s; }
  .topbar-search:focus-within { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(11,95,255,0.1); width: 280px; }
  .topbar-search input { border: none; background: transparent; outline: none; font-size: 13px; font-weight: 500; color: var(--text); font-family: var(--font); flex: 1; }
  .topbar-search input::placeholder { color: var(--muted); }
  .topbar-icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 9px; border: 1px solid var(--border); background: transparent; cursor: pointer; color: var(--muted); font-size: 15px; transition: all 0.15s; flex-shrink: 0; }
  .topbar-icon-btn:hover { background: var(--bg); color: var(--text); }
  .topbar-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--brand); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; cursor: pointer; }

  .app-main { margin-left: var(--sidebar-w); padding-top: 56px; min-height: 100vh; transition: margin-left 0.28s cubic-bezier(.4,0,.2,1); }
  .app-main.sidebar-collapsed { margin-left: 0; }
  .app-content { padding: 24px 28px; max-width: 100%; }

  @media (max-width: 1024px) {
    .app-sidebar { transform: translateX(calc(-1 * var(--sidebar-w))); }
    .app-sidebar.mobile-open { transform: translateX(0); }
    .app-topbar { left: 0; }
    .app-main { margin-left: 0; }
    .sidebar-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 90; backdrop-filter: blur(2px); }
  }

  .ai-fab { position: fixed; bottom: 28px; right: 28px; z-index: 200; }
  .ai-fab-btn { width: 56px; height: 56px; background: var(--brand); border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 4px 20px rgba(11,95,255,0.4), 0 2px 8px rgba(11,95,255,0.2); transition: all 0.2s ease; position: relative; }
  .ai-fab-btn:hover { transform: scale(1.08); box-shadow: 0 8px 28px rgba(11,95,255,0.5); }
  .ai-fab-btn.active { background: var(--brand-2); }
  .ai-fab-tooltip { position: absolute; bottom: 68px; right: 0; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 7px 12px; font-size: 11px; font-weight: 700; color: var(--text); white-space: nowrap; box-shadow: var(--shadow); animation: fadeUp 0.2s ease both; }
  .ai-fab-panel { position: absolute; bottom: 72px; right: 0; width: 380px; background: var(--card); border: 1px solid var(--border); border-radius: 20px; box-shadow: var(--shadow-lg); overflow: hidden; display: flex; flex-direction: column; max-height: 520px; animation: fadeUp 0.25s cubic-bezier(.4,0,.2,1) both; }
  @media (max-width: 480px) { .ai-fab-panel { width: calc(100vw - 48px); right: -4px; } }
  .ai-fab-panel-header { padding: 16px 18px; background: var(--brand); color: #fff; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }

  .grade-ring-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
  .grade-ring-svg { transform: rotate(-90deg); }
  .grade-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .route-card { background: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%); border-radius: var(--radius); padding: 20px; color: #fff; position: relative; overflow: hidden; }
  .route-card::before { content: ''; position: absolute; top: -40px; right: -40px; width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.06); }
  .route-step { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 10px; background: rgba(255,255,255,0.1); margin-bottom: 8px; }
  .route-step.done { background: rgba(255,255,255,0.15); }
  .route-step.pending { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); }

  .cesa-loader-wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--bg); z-index: 100; }
  .cesa-loader-card { background: var(--card); border: 1px solid var(--border); border-radius: 24px; padding: 40px 48px; text-align: center; box-shadow: var(--shadow-lg); min-width: 320px; max-width: 480px; }
  .cesa-loader-title { font-size: 20px; font-weight: 800; color: var(--text); }
  .cesa-loader-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
  .cesa-loader-center { margin: 28px 0; }
  .cesa-loader-foot { font-size: 12px; color: var(--muted); }

  .cesa-water-text { position: relative; display: inline-block; font-size: 56px; font-weight: 900; letter-spacing: -2px; overflow: hidden; height: 72px; line-height: 72px; }
  .cesa-water-text__outline { color: transparent; -webkit-text-stroke: 2px var(--border); }
  .cesa-water-text__fill { position: absolute; inset: 0; color: var(--brand); clip-path: inset(100% 0 0 0); animation: waterFill 1.8s ease-in-out infinite alternate; }
  .cesa-water-text__wave { position: absolute; bottom: 0; left: -100%; width: 300%; height: 100%; background: linear-gradient(90deg, transparent, rgba(11,95,255,.08), transparent); animation: waveSlide 2s linear infinite; }
  @keyframes waterFill { 0% { clip-path: inset(100% 0 0 0); } 100% { clip-path: inset(0% 0 0 0); } }
  @keyframes waveSlide { from { transform: translateX(0); } to { transform: translateX(33.33%); } }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .fade-up { animation: fadeUp 0.35s ease both; }
  .fade-up-1 { animation-delay: 0.05s; }
  .fade-up-2 { animation-delay: 0.1s; }
  .fade-up-3 { animation-delay: 0.15s; }
  .fade-up-4 { animation-delay: 0.2s; }

  @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
  .pulse-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; animation: pulse 1.4s ease infinite; }

  @keyframes fillBar { from { width: 0%; } to { width: var(--target-w); } }
  .fill-bar { animation: fillBar 0.7s cubic-bezier(.4,0,.2,1) both; animation-delay: 0.2s; }

  .drawer-enter { animation: drawerIn 0.28s cubic-bezier(.4,0,.2,1) both; }
  @keyframes drawerIn { from { transform: translateX(48px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

  @keyframes tabIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .tab-enter { animation: tabIn 0.3s cubic-bezier(.4,0,.2,1) both; }

  .kpi-card { transition: box-shadow 0.18s ease, transform 0.18s ease; }
  .kpi-card:hover { box-shadow: var(--shadow-md) !important; }

  .sidebar-nav-item { transition: all 0.15s ease; }
  .sidebar-nav-item:not(.active):hover { transform: translateX(3px); }

  .tr-hover { transition: all 0.15s ease; }
  .tr-hover:hover { background: var(--brand-light) !important; }
  .tr-hover:hover td { color: var(--text) !important; }

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

  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; white-space: nowrap; letter-spacing: 0.04em; text-transform: uppercase; }

  .kpi-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow); transition: box-shadow 0.2s ease, transform 0.2s ease; }
  .kpi-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }

  .tag { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.03em; background: var(--brand-light); color: var(--brand); }

  .chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--border); border-radius: 8px; padding: 4px 10px; font-size: 12px; font-weight: 700; background: var(--card); color: var(--muted); cursor: pointer; transition: all 0.15s ease; }
  .chip:hover, .chip.active { border-color: var(--brand); color: var(--brand); background: var(--brand-light); }

  .btn { border: 1px solid var(--border); background: var(--card); color: var(--text); border-radius: 10px; padding: 8px 14px; cursor: pointer; font-weight: 700; font-size: 13px; font-family: var(--font); transition: all 0.15s ease; display: inline-flex; align-items: center; gap: 6px; letter-spacing: -0.01em; }
  .btn:hover { border-color: var(--brand); color: var(--brand); background: var(--brand-light); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(11,95,255,0.1); }
  .btn:active { transform: translateY(0); }
  .btn-primary { background: var(--brand); color: #fff; border-color: var(--brand); box-shadow: 0 2px 8px rgba(11,95,255,0.3); }
  .btn-primary:hover { background: var(--brand-2); color: #fff; border-color: var(--brand-2); box-shadow: 0 4px 14px rgba(11,95,255,0.4); }

  .scenario-card { border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; background: var(--card); }
  .scenario-card.scenario-risk { border-color: #FECDCA; background: var(--critical-bg); }
  .scenario-card.scenario-base { border-color: var(--border); }
  .scenario-card.scenario-improve { border-color: #A9EFC5; background: var(--ok-bg); }

  .qc-flag { font-size: 12px; padding: 8px 12px; border-radius: 8px; background: var(--pending-bg); border: 1px solid var(--border); font-family: var(--font-mono); color: var(--muted); }

  input[type="text"], input[type="number"] { font-family: var(--font); outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
  input[type="text"]:focus, input[type="number"]:focus { border-color: var(--brand) !important; box-shadow: 0 0 0 3px rgba(11,95,255,0.12) !important; }

  /* === Global keyboard focus ring (a11y quick-win) ===
     Uses :focus-visible so mouse clicks don't show a ring, but Tab always does. */
  :focus { outline: none; }
  button:focus-visible,
  a:focus-visible,
  [role="button"]:focus-visible,
  [role="tab"]:focus-visible,
  [role="menuitem"]:focus-visible,
  [tabindex]:not([tabindex="-1"]):focus-visible,
  .btn:focus-visible,
  .btn-primary:focus-visible,
  .chip:focus-visible,
  .tag:focus-visible,
  .topbar-icon-btn:focus-visible,
  .sidebar-nav-item:focus-visible,
  .course-item:focus-visible,
  .ai-fab-btn:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px var(--focus-ring);
    border-radius: 8px;
  }
  /* Round elements deserve a matching ring */
  .topbar-avatar:focus-visible,
  .ai-fab-btn:focus-visible {
    border-radius: 50%;
  }
  /* Skip-link helper (for future use). Hidden until focused. */
  .skip-link {
    position: absolute; left: 12px; top: -40px; z-index: 10001;
    background: var(--brand); color: #fff;
    padding: 8px 14px; border-radius: 8px;
    font-size: 13px; font-weight: 700;
    transition: top 0.15s ease;
  }
  .skip-link:focus { top: 12px; }
  main[tabindex="-1"]:focus { outline: none; }

  .breadcrumb-link:hover { color: var(--brand); background: var(--brand-light); }

  .scroll-y { overflow-y: auto; overflow-x: hidden; }
  .ra-scroll { max-height: 260px; padding-right: 4px; }
  .ra-priority-scroll { max-height: 380px; padding-right: 4px; overflow-y: auto; }

  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px; color: var(--muted-strong); border: 1px dashed var(--border); border-radius: var(--radius); background: var(--bg2); text-align: center; }
  .empty-state-icon { font-size: 36px; opacity: 0.35; }
  .empty-state > span:nth-child(2) { font-size: 14px; font-weight: 700; color: var(--muted); }

  .course-panel-overlay { position: fixed; inset: 0; background: rgba(13,17,23,0.5); z-index: 60; display: flex; align-items: flex-start; justify-content: flex-end; padding: 0; backdrop-filter: blur(2px); animation: fadeIn 0.2s ease both; }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  .course-panel { width: min(480px, 100vw); height: 100vh; background: var(--card); border-left: 1px solid var(--border); display: flex; flex-direction: column; animation: slideIn 0.28s cubic-bezier(.4,0,.2,1) both; box-shadow: -8px 0 40px rgba(0,0,0,0.15); }
  @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
  .course-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.15s ease; text-decoration: none; }
  .course-item:hover { background: var(--brand-light); }
  .course-item.active { background: var(--brand-light); border-left: 3px solid var(--brand); }
  .course-item-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  .voice-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); cursor: pointer; transition: all 0.15s ease; font-size: 15px; flex-shrink: 0; color: var(--muted); }
  .voice-btn:hover { border-color: var(--brand); background: var(--brand-light); color: var(--brand); }
  .voice-btn.listening { border-color: var(--critical); background: var(--critical-bg); color: var(--critical); animation: voicePulse 1s ease infinite; }
  @keyframes voicePulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(217,45,32,0.3); } 50% { box-shadow: 0 0 0 6px rgba(217,45,32,0); } }
  @keyframes skeletonShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* ==== NEW ANIMATIONS FOR VISUAL REDESIGN ==== */
  @keyframes floatIn { from { opacity: 0; transform: translateY(20px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
  @keyframes slideUpFade { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes shimmerCard { 0% { background-position: -1000px 0; } 100% { background-position: 1000px 0; } }
  @keyframes gradientShift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
  @keyframes iconBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
  @keyframes chartDraw { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }
  @keyframes rotateGlow { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

  /* ══ PageLoader animations (CESA-branded transition loader) ══ */
  @keyframes cesaLogoBreath {
    0%, 100% { transform: scale(1); box-shadow: 0 12px 40px -12px rgba(11, 95, 255, 0.55), 0 0 0 0 rgba(11, 95, 255, 0.35); }
    50%      { transform: scale(1.06); box-shadow: 0 16px 48px -12px rgba(11, 95, 255, 0.65), 0 0 0 14px rgba(11, 95, 255, 0); }
  }
  @keyframes cesaOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes cesaOrbitReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
  @keyframes cesaShimmerText { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes cesaDotRise {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
    40%           { transform: translateY(-8px); opacity: 1; }
  }
  @keyframes cesaBarProgress {
    0%   { transform: translateX(-100%); }
    50%  { transform: translateX(0%); }
    100% { transform: translateX(100%); }
  }
  @keyframes cesaCardIn {
    from { opacity: 0; transform: translateY(12px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .cesa-loader-root {
    min-height: 100vh; background: var(--bg);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Manrope', system-ui, sans-serif;
    position: relative; overflow: hidden;
  }
  .cesa-loader-root::before,
  .cesa-loader-root::after {
    content: ""; position: absolute; border-radius: 50%; pointer-events: none;
    filter: blur(80px); opacity: 0.35;
  }
  .cesa-loader-root::before {
    width: 420px; height: 420px; top: -140px; left: -140px;
    background: radial-gradient(circle, rgba(11, 95, 255, 0.55), transparent 70%);
    animation: cesaLogoBreath 4.5s ease-in-out infinite;
  }
  .cesa-loader-root::after {
    width: 380px; height: 380px; bottom: -120px; right: -120px;
    background: radial-gradient(circle, rgba(96, 165, 250, 0.45), transparent 70%);
    animation: cesaLogoBreath 5.2s ease-in-out infinite 0.6s;
  }
  .cesa-loader-card {
    position: relative; z-index: 1;
    background: var(--card); border: 1px solid var(--border);
    border-radius: 24px; padding: 44px 56px 32px; text-align: center;
    box-shadow: 0 24px 60px -20px rgba(15, 24, 39, 0.18), 0 8px 24px -8px rgba(15, 24, 39, 0.08);
    animation: cesaCardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
    min-width: 300px;
  }
  .cesa-loader-logo-wrap {
    position: relative; width: 96px; height: 96px; margin: 0 auto 22px;
    display: flex; align-items: center; justify-content: center;
  }
  .cesa-loader-logo {
    width: 68px; height: 68px; border-radius: 18px;
    background: linear-gradient(135deg, var(--brand) 0%, #1e40af 100%);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 15px; font-weight: 900; letter-spacing: 0.06em;
    animation: cesaLogoBreath 2.2s ease-in-out infinite;
    position: relative; z-index: 2;
  }
  .cesa-loader-ring {
    position: absolute; inset: 0;
    border-radius: 50%; border: 2px solid transparent;
    border-top-color: var(--brand); border-right-color: var(--brand);
    opacity: 0.7;
    animation: cesaOrbit 1.6s linear infinite;
  }
  .cesa-loader-ring.outer {
    inset: -8px;
    border-top-color: transparent; border-right-color: transparent;
    border-bottom-color: #60a5fa; border-left-color: #60a5fa;
    opacity: 0.5;
    animation: cesaOrbitReverse 2.4s linear infinite;
  }
  .cesa-loader-title {
    font-size: 22px; font-weight: 900; letter-spacing: -0.02em;
    background: linear-gradient(90deg, var(--text) 0%, var(--brand) 40%, var(--text) 80%);
    background-size: 200% 100%;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
    animation: cesaShimmerText 2.6s linear infinite;
    margin: 0 0 6px;
  }
  .cesa-loader-subtitle {
    font-size: 11px; font-weight: 700; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.16em;
    margin: 0 0 18px;
  }
  .cesa-loader-dots { display: inline-flex; gap: 6px; margin-bottom: 16px; }
  .cesa-loader-dots span {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--brand);
    animation: cesaDotRise 1.2s ease-in-out infinite;
  }
  .cesa-loader-dots span:nth-child(2) { animation-delay: 0.15s; background: #3b82f6; }
  .cesa-loader-dots span:nth-child(3) { animation-delay: 0.30s; background: #60a5fa; }
  .cesa-loader-bar {
    position: relative; height: 3px; width: 100%;
    background: var(--bg); border-radius: 99px; overflow: hidden;
  }
  .cesa-loader-bar::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(90deg, transparent 0%, var(--brand) 35%, #60a5fa 65%, transparent 100%);
    animation: cesaBarProgress 1.6s ease-in-out infinite;
  }
  @media (max-width: 480px) {
    .cesa-loader-card { padding: 36px 32px 28px; min-width: 260px; }
    .cesa-loader-logo-wrap { width: 84px; height: 84px; }
    .cesa-loader-logo { width: 58px; height: 58px; font-size: 13px; }
    .cesa-loader-title { font-size: 20px; }
  }
  @media (prefers-reduced-motion: reduce) {
    /* Loader ya cubierto anteriormente */
    .cesa-loader-logo, .cesa-loader-ring, .cesa-loader-ring.outer,
    .cesa-loader-title, .cesa-loader-dots span, .cesa-loader-bar::after,
    .cesa-loader-root::before, .cesa-loader-root::after { animation: none !important; }

    /* Regla global: acorta o elimina todas las animaciones y transiciones
       para usuarios que solicitan menos movimiento. Se mantiene un mínimo
       (0.01ms) para no romper componentes que dependen del evento
       animationend/transitionend. */
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }

    /* Silencia efectos específicos que suelen ser molestos con este ajuste */
    .stagger-children > * { opacity: 1 !important; animation: none !important; }
    .pulse-dot, .ai-fab-btn, .skip-link { animation: none !important; transition: none !important; }
  }

  /* Stagger animation classes — add to a container with .stagger-children, direct children fade in sequentially */
  .stagger-children > * { opacity: 0; animation: floatIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .stagger-children > *:nth-child(1) { animation-delay: 0.02s; }
  .stagger-children > *:nth-child(2) { animation-delay: 0.06s; }
  .stagger-children > *:nth-child(3) { animation-delay: 0.10s; }
  .stagger-children > *:nth-child(4) { animation-delay: 0.14s; }
  .stagger-children > *:nth-child(5) { animation-delay: 0.18s; }
  .stagger-children > *:nth-child(6) { animation-delay: 0.22s; }
  .stagger-children > *:nth-child(7) { animation-delay: 0.26s; }
  .stagger-children > *:nth-child(8) { animation-delay: 0.30s; }
  .stagger-children > *:nth-child(9) { animation-delay: 0.34s; }
  .stagger-children > *:nth-child(n+10) { animation-delay: 0.38s; }

  /* Course card grid — responsive */
  .course-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  @media (max-width: 640px) { .course-grid { grid-template-columns: 1fr; gap: 10px; } }

  /* Visual course card */
  .course-card-v2 {
    position: relative; display: flex; flex-direction: column; padding: 16px;
    border-radius: 14px; border: 1.5px solid var(--border); background: var(--card);
    cursor: pointer; text-align: left; font-family: var(--font); width: 100%;
    transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease, border-color 0.22s ease;
    overflow: hidden; min-height: 128px;
  }
  .course-card-v2::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--brand) 0%, var(--brand-2, var(--brand)) 100%);
    transform: scaleX(0); transform-origin: left; transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .course-card-v2:hover { transform: translateY(-3px); box-shadow: 0 12px 28px -12px rgba(11, 95, 255, 0.28), var(--shadow-md); border-color: var(--brand); }
  .course-card-v2:hover::before { transform: scaleX(1); }
  .course-card-v2.role-student::before { background: linear-gradient(90deg, var(--ok) 0%, #22c55e 100%); }
  .course-card-v2.role-student:hover { border-color: var(--ok); box-shadow: 0 12px 28px -12px rgba(18, 183, 106, 0.28), var(--shadow-md); }
  .course-card-v2.inactive { opacity: 0.65; }

  .course-card-icon {
    width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--brand-light) 0%, rgba(11, 95, 255, 0.08) 100%);
    color: var(--brand); margin-bottom: 12px; transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .course-card-v2:hover .course-card-icon { transform: scale(1.08) rotate(-4deg); }
  .course-card-v2.role-student .course-card-icon {
    background: linear-gradient(135deg, var(--ok-bg) 0%, rgba(18, 183, 106, 0.08) 100%);
    color: var(--ok);
  }

  .course-card-title {
    font-size: 14px; font-weight: 800; color: var(--text); line-height: 1.35;
    margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; text-overflow: ellipsis;
  }
  .course-card-meta { display: flex; align-items: center; gap: 6px; margin-top: auto; flex-wrap: wrap; }
  .course-card-id { font-size: 11px; color: var(--muted); font-family: var(--mono, monospace); font-weight: 600; }
  .course-card-arrow {
    position: absolute; bottom: 14px; right: 14px; color: var(--brand); opacity: 0;
    transform: translateX(-6px); transition: opacity 0.2s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
  }
  .course-card-v2:hover .course-card-arrow { opacity: 1; transform: translateX(0); }
  .course-card-v2.role-student .course-card-arrow { color: var(--ok); }

  /* Section header v2 (icon + title + count) */
  .section-header-v2 { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .section-header-icon-wrap {
    width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, var(--brand-light) 0%, rgba(11, 95, 255, 0.06) 100%);
    color: var(--brand); flex-shrink: 0;
  }
  .section-header-icon-wrap.student { background: linear-gradient(135deg, var(--ok-bg) 0%, rgba(18, 183, 106, 0.06) 100%); color: var(--ok); }
  .section-header-icon-wrap.warn { background: linear-gradient(135deg, rgba(255, 170, 0, 0.14) 0%, rgba(255, 170, 0, 0.04) 100%); color: #f59e0b; }
  .section-header-title { font-size: 15px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; }
  .section-header-count { font-size: 11px; color: var(--muted); font-weight: 700; margin-top: 2px; }

  /* Panel card (RoleHome sections) */
  .home-panel {
    background: var(--card); border: 1px solid var(--border); border-radius: 20px;
    padding: 22px; box-shadow: var(--shadow);
    animation: floatIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .home-panel.superadmin-brand { border-color: rgba(11, 95, 255, 0.35); }
  .home-panel.superadmin-warn { border-color: rgba(255, 170, 0, 0.35); }

  /* Icon chip inline */
  .icon-chip { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; }

  /* Chart wrapper animation */
  .chart-appear { animation: slideUpFade 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }

  /* Loading dots */
  .loading-dots { display: inline-flex; gap: 4px; align-items: center; }
  .loading-dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); animation: pulse 1.2s ease-in-out infinite; }
  .loading-dots span:nth-child(2) { animation-delay: 0.15s; }
  .loading-dots span:nth-child(3) { animation-delay: 0.3s; }

  /* Empty state v2 */
  .empty-v2 {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 40px 20px; text-align: center; color: var(--muted);
    border: 1.5px dashed var(--border); border-radius: 16px; background: var(--bg);
    animation: fadeIn 0.35s ease both;
  }
  .empty-v2-icon {
    width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center;
    background: var(--brand-light); color: var(--brand); margin-bottom: 12px; opacity: 0.75;
  }

  .voice-hint { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 10px; border: 1px dashed var(--border); background: var(--bg); color: var(--muted); font-size: 11px; font-weight: 600; flex-wrap: wrap; }

  .main-tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 0; }
  .main-tab { padding: 8px 16px 10px; font-size: 12px; font-weight: 700; color: var(--muted); cursor: pointer; border-radius: 8px 8px 0 0; border: 1px solid transparent; border-bottom: none; background: transparent; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; margin-bottom: -1px; position: relative; }
  .main-tab:hover { color: var(--text); background: var(--card); border-color: var(--border); }
  .main-tab.active { color: var(--brand); background: var(--card); border-color: var(--border); border-bottom-color: var(--card); }
  .main-tab .tab-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.6; }

  .ai-panel { display: flex; flex-direction: column; gap: 14px; }
  .ai-status-outer { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg); transition: all 0.25s; min-height: 48px; }
  .ai-status-outer.listening { border-color: rgba(217,45,32,0.45); background: var(--critical-bg); }
  .ai-status-outer.thinking { border-color: rgba(11,95,255,0.35); background: var(--brand-light); }
  .ai-status-outer.speaking { border-color: rgba(18,183,106,0.35); background: var(--ok-bg); }
  .ai-status-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; background: var(--card); border: 1px solid var(--border); }
  .ai-wave { display: flex; align-items: center; gap: 2px; height: 18px; }
  .ai-wave-bar { width: 3px; border-radius: 2px; animation: waveAI 1.1s ease-in-out infinite; }
  .ai-wave-bar:nth-child(1) { height: 6px; animation-delay: 0s; }
  .ai-wave-bar:nth-child(2) { height: 12px; animation-delay: 0.1s; }
  .ai-wave-bar:nth-child(3) { height: 18px; animation-delay: 0.2s; }
  .ai-wave-bar:nth-child(4) { height: 12px; animation-delay: 0.1s; }
  .ai-wave-bar:nth-child(5) { height: 6px; animation-delay: 0s; }
  @keyframes waveAI { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
  .ai-chat { background: var(--bg2, var(--bg)); border: 1px solid var(--border); border-radius: 12px; padding: 12px 10px; max-height: 300px; min-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; }
  .ai-bubble-wrap { display: flex; flex-direction: column; }
  .ai-bubble-wrap.user { align-items: flex-end; }
  .ai-bubble-wrap.bot { align-items: flex-start; }
  .ai-bubble { max-width: 86%; font-size: 12.5px; line-height: 1.55; padding: 9px 13px; border-radius: 8px; }
  .ai-bubble.bot { background: var(--card); border: 1px solid var(--border); border-radius: 2px 12px 12px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  .ai-bubble.user { background: var(--brand-light2, var(--brand-light)); border: 1px solid rgba(11,95,255,0.25); border-radius: 12px 2px 12px 12px; color: var(--text); }
  .ai-meta { font-size: 9px; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); margin-bottom: 3px; display: flex; align-items: center; gap: 6px; }
  .ai-voice-badge { background: var(--brand-light); color: var(--brand); border-radius: 999px; padding: 1px 7px; font-size: 9px; font-weight: 700; }
  .ai-speak-btn { border: 1px solid var(--border); background: transparent; border-radius: 999px; padding: 3px 10px; font-size: 10px; font-weight: 700; color: var(--muted); cursor: pointer; margin-top: 5px; transition: all 0.15s; }
  .ai-speak-btn:hover { border-color: var(--ok); color: var(--ok); }
  .ai-speak-btn.active { border-color: var(--ok); color: var(--ok); background: var(--ok-bg); }
  .ai-typing { display: flex; align-items: center; gap: 4px; padding: 6px 2px; }
  .ai-typing-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--brand); animation: waveAI 1.2s ease-in-out infinite; }
  .ai-typing-dot:nth-child(2) { animation-delay: 0.15s; }
  .ai-typing-dot:nth-child(3) { animation-delay: 0.3s; }
  .ai-chip-btn { background: var(--card); border: 1px solid var(--border); border-radius: 999px; padding: 5px 13px; font-size: 11px; font-weight: 600; color: var(--muted); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
  .ai-chip-btn:hover { border-color: var(--brand); color: var(--brand); background: var(--brand-light); }
  .ai-input { flex: 1; border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 12px; font-weight: 600; background: var(--card); color: var(--text); outline: none; transition: border-color 0.15s, box-shadow 0.15s; font-family: var(--font); }
  .ai-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(11,95,255,0.1); }
  .ai-input::placeholder { color: var(--muted); }
  .ai-send-btn { background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-size: 12px; font-weight: 800; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; font-family: var(--font); }
  .ai-send-btn:hover { opacity: 0.85; }
  .ai-toggle { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); cursor: pointer; transition: all 0.15s; user-select: none; }
  .ai-toggle.active { border-color: var(--ok); background: var(--ok-bg); }
  .ai-toggle-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); transition: background 0.2s; }
  .ai-toggle.active .ai-toggle-dot { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
  .ai-stop-btn { background: var(--critical-bg); border: 1px solid rgba(217,45,32,0.3); border-radius: 8px; padding: 6px 12px; font-size: 11px; font-weight: 700; color: var(--critical); cursor: pointer; transition: all 0.15s; display: none; }
  .ai-stop-btn.visible { display: block; }
  .ai-guide-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 640px) {
    .ai-guide-grid { grid-template-columns: 1fr; }
    .main-tabs { overflow-x: auto; }
  }
`;
