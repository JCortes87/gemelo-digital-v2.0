// Sidebar y topbar del dashboard docente (extraído de TeacherDashboard.jsx, #15).
import { useState } from "react";
import { useI18n } from "../../context/I18nContext";
import { apiUrl } from "../../utils/api";
export function AppSidebar({ activeTab, setActiveTab, currentCourseName, mobileOpen, onClose }) {
  const { t } = useI18n();
  const NAV = [
    { id: "dashboard",  icon: "📊", label: t("nav.dashboard", "Dashboard") },
    { id: "students",   icon: "👥", label: t("nav.students", "Estudiantes") },
    { id: "calendar",   icon: "📅", label: t("nav.calendar", "Calendario") },
    { id: "trends",     icon: "📈", label: t("nav.trends", "Tendencias") },
    { id: "routes",     icon: "🛤️", label: t("nav.routes", "Rutas de atención") },
    { id: "predictions", icon: "🔮", label: t("nav.predictions", "Predicción de notas") },
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
        className={`app-sidebar${mobileOpen ? " mobile-open" : ""}`}
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
            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", background: "var(--bg)", padding: "2px 7px", borderRadius: 99, border: "1px solid var(--border)" }}>2026.7.10</span>
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
  isMobile, sidebarOpen, onOpenSidebar, darkMode, setDarkMode,
  locale, toggleLocale,
  orgUnitInput, setOrgUnitInput, setOrgUnitId,
  handleOpenCoursePanel,
  authUser, isDualRole, onGoHome,
  onOpenPalette, onOpenCoordinator,
  isSuperAdmin, studentRows, onImpersonate,
  adminView, onAdminViewChange,
}) {
  const [showImpersonateMenu, setShowImpersonateMenu] = useState(false);
  const [impersonateSearch, setImpersonateSearch] = useState("");
  const { t } = useI18n();
  return (
    <header className="app-topbar">
      {/* Left */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {isMobile && (
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={onOpenSidebar}
            title={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
            aria-label={sidebarOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
            aria-expanded={sidebarOpen ? "true" : "false"}
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

      {/* Right */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Solo superadmin: alternar vista profesor / estudiante */}
        {onAdminViewChange && (
          <div
            role="tablist"
            aria-label="Cambiar entre vista profesor y vista estudiante"
            style={{
              display: "inline-flex", gap: 2, padding: 3, borderRadius: 10,
              background: "var(--bg)", border: "1px solid var(--border)",
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
              <span>{t("topbar.commands", "Comandos")}</span>
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
            🏠 {isMobile ? "" : t("topbar.home", "Inicio")}
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={handleOpenCoursePanel}
          style={{ padding: "7px 14px", fontSize: 12, borderRadius: 10 }}
        >
          📚 {isMobile ? "" : t("topbar.myCourses", "Mis cursos")}
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
              👁 {isMobile ? "" : t("topbar.viewAs", "Ver como...")}
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
// BugReportModal — reporte de errores al administrador
// ──────────────────────────────────────────────
// El correo del administrador que recibe los reportes de error.
