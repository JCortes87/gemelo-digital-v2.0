// Estilos CSS del dashboard docente (extraído de TeacherDashboard.jsx, #15).
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

export function injectStyles() {
  if (typeof document === "undefined") return;
  const id = "gemelo-styles";
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = GLOBAL_STYLES;
  document.head.appendChild(el);
}
