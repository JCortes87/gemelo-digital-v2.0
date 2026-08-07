// Sidebar y topbar del dashboard docente (extraído de TeacherDashboard.jsx, #15).
import { useState } from "react";
import { useI18n } from "../../context/I18nContext";
import { apiUrl } from "../../utils/api";
export function AppSidebar({ activeTab, setActiveTab, currentCourseName, mobileOpen, collapsed, onClose }) {
  const { t } = useI18n();
  const NAV = [
    { id: "dashboard",  icon: "📊", label: t("nav.dashboard", "Dashboard") },
    { id: "students",   icon: "👥", label: t("nav.students", "Estudiantes") },
    { id: "calendar",   icon: "📅", label: t("nav.calendar", "Calendario") },
    { id: "trends",     icon: "📈", label: t("nav.trends", "Tendencias") },
    { id: "routes",     icon: "🛤️", label: t("nav.routes", "Rutas de atención") },
    { id: "predictions", icon: "🔮", label: t("nav.predictions", "Predicción de calificaciones") },
    { id: "evidences",  icon: "📑", label: t("nav.evidences", "Evidencias") },
    { id: "learning-outcomes", icon: "🎯", label: t("nav.learningOutcomes", "Resultados de aprendizaje") },
    { id: "assistant",  icon: "🤖", label: t("nav.assistant", "Asistente IA") },
  ];
  const NAV_BOTTOM = [
    { id: "help", icon: "💬", label: t("nav.support", "Soporte") },
  ];

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        id="app-sidebar"
        aria-label="Navegación principal"
        className={`app-sidebar${mobileOpen ? " mobile-open" : ""}${collapsed ? " collapsed" : ""}`}
      >
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" style={{ fontSize: 12, letterSpacing: "0.01em" }}>CESA</div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-name">CESA · G.D</div>
            <div className="sidebar-logo-sub">{t("nav.teacherView", "Vista Docente")}</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav" aria-label="Vistas del docente">
          <div className="sidebar-section-label" id="sidebar-views-label">{t("nav.views", "Vistas")}</div>
          <ul
            aria-labelledby="sidebar-views-label"
            style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}
          >
            {NAV.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`sidebar-nav-item${isActive ? " active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => { setActiveTab(item.id); onClose?.(); }}
                  >
                    <span className="snav-icon" aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    <span className="sidebar-nav-dot" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer — current course */}
        <div className="sidebar-footer">
          {currentCourseName && (
            <div className="sidebar-course-pill">
              <div className="sidebar-course-label">{t("nav.activeCourse", "Curso activo")}</div>
              <div className="sidebar-course-name" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentCourseName}
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>G.D</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", background: "var(--bg)", padding: "2px 7px", borderRadius: 99, border: "1px solid var(--border)" }}>2026.8.7</span>
          </div>
        </div>
      </aside>
    </>
  );
}

// ──────────────────────────────────────────────
// AppTopbar — Fixed top bar
// ──────────────────────────────────────────────
export function AppTopbar({
  isMobile, showSidebarToggle, sidebarCollapsed, sidebarVisible,
  onOpenSidebar, darkMode, setDarkMode,
  locale, toggleLocale,
  orgUnitInput, setOrgUnitInput, setOrgUnitId,
  handleOpenCoursePanel,
  authUser, isDualRole, onGoHome,
  onOpenPalette, onOpenCoordinator,
  isSuperAdmin,
  adminView, onAdminViewChange,
}) {
  const [showMainMenu, setShowMainMenu] = useState(false);
  const { t } = useI18n();
  return (
    <header className={`app-topbar${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
        {(showSidebarToggle || isMobile) && (
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={onOpenSidebar}
            title={sidebarVisible ? "Ocultar menú" : "Mostrar menú"}
            aria-label={sidebarVisible ? "Ocultar menú de navegación" : "Mostrar menú de navegación"}
            aria-expanded={sidebarVisible ? "true" : "false"}
            aria-controls="app-sidebar"
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
            placeholder={t("topbar.courseIdPlaceholder", "ID de curso…")}
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

      {/* Centro: solo superadmin — alternar vista profesor / estudiante */}
      {onAdminViewChange && (
        <div
          role="tablist"
          aria-label="Cambiar entre vista profesor y vista estudiante"
          style={{
            display: "inline-flex", gap: 2, padding: 3, borderRadius: 10,
            background: "var(--bg)", border: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          {[
            { key: "teacher", icon: "👨‍🏫", label: t("topbar.teacherView", "Vista profesor") },
            { key: "student", icon: "🎓", label: t("topbar.studentView", "Vista estudiante") },
          ].map((v) => {
            const active = (adminView || "teacher") === v.key;
            return (
              <button
                key={v.key}
                role="tab"
                aria-selected={active}
                onClick={() => onAdminViewChange(v.key)}
                title={v.label}
                style={{
                  border: "none", cursor: "pointer",
                  fontSize: 11, fontWeight: 700, fontFamily: "var(--font)",
                  padding: "5px 10px", borderRadius: 8,
                  display: "inline-flex", alignItems: "center", gap: 5,
                  background: active ? "var(--brand)" : "transparent",
                  color: active ? "#fff" : "var(--muted-strong)",
                  transition: "background 0.15s",
                }}
              >
                <span aria-hidden="true">{v.icon}</span>
                {!isMobile && <span>{v.label}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, justifyContent: "flex-end" }}>
        {/* Menú agrupado (comandos, inicio, cursos, coordinación, idioma, tema, imprimir) */}
        <div style={{ position: "relative" }}>
          <button
            className="topbar-icon-btn"
            onClick={() => setShowMainMenu((v) => !v)}
            title="Más opciones"
            aria-label="Abrir menú de opciones"
            aria-expanded={showMainMenu ? "true" : "false"}
            style={{ width: "auto", padding: "0 8px", gap: 3 }}
          >
            <span aria-hidden="true" style={{ fontSize: 15 }}>⚙️</span>
            <span
              aria-hidden="true"
              style={{
                fontSize: 8, lineHeight: 1,
                transform: showMainMenu ? "rotate(180deg)" : "none",
                transition: "transform 0.15s",
              }}
            >
              ▼
            </span>
          </button>
          {showMainMenu && (
            <>
              <div
                onClick={() => setShowMainMenu(false)}
                style={{ position: "fixed", inset: 0, zIndex: 190 }}
                aria-hidden="true"
              />
              <div
                role="menu"
                style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 200,
                  width: 235, background: "var(--card)",
                  border: "1px solid var(--border)", borderRadius: 12,
                  boxShadow: "var(--shadow-lg)", padding: 6,
                  display: "flex", flexDirection: "column", gap: 2,
                }}
              >
                {[
                  ...(onOpenPalette ? [{
                    key: "palette", icon: "🔎", label: t("topbar.commands", "Comandos"), hint: "⌘K",
                    action: () => { setShowMainMenu(false); onOpenPalette(); },
                  }] : []),
                  ...((isDualRole || isSuperAdmin) ? [{
                    key: "home", icon: "🏠", label: t("topbar.home", "Inicio"),
                    action: () => { setShowMainMenu(false); onGoHome(); },
                  }] : []),
                  {
                    key: "courses", icon: "📚", label: t("topbar.myCourses", "Mis cursos"),
                    action: () => { setShowMainMenu(false); handleOpenCoursePanel(); },
                  },
                  ...(onOpenCoordinator ? [{
                    key: "coordinator", icon: "🏛", label: t("topbar.coordination", "Panel de coordinación"),
                    action: () => { setShowMainMenu(false); onOpenCoordinator(); },
                  }] : []),
                  {
                    key: "locale", icon: "🌐",
                    label: `${t("topbar.language", "Idioma")}: ${locale === "es" ? "Español" : "English"}`,
                    action: () => toggleLocale(),
                  },
                  {
                    key: "theme", icon: darkMode ? "☀️" : "🌙",
                    label: darkMode ? t("topbar.lightMode", "Tema claro") : t("topbar.darkMode", "Tema oscuro"),
                    action: () => setDarkMode((v) => !v),
                  },
                  {
                    key: "print", icon: "🖨", label: t("topbar.print", "Imprimir vista"),
                    action: () => { setShowMainMenu(false); window.print(); },
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    role="menuitem"
                    onClick={item.action}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "100%", padding: "8px 10px", border: "none",
                      background: "transparent", cursor: "pointer",
                      fontSize: 12, fontWeight: 600, fontFamily: "var(--font)",
                      color: "var(--text)", textAlign: "left", borderRadius: 8,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span aria-hidden="true" style={{ width: 18, textAlign: "center" }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.hint && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 4,
                        background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)",
                      }}>{item.hint}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

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
// BugReportModal — reporte de errores al administrador
// ──────────────────────────────────────────────
// El correo del administrador que recibe los reportes de error.
