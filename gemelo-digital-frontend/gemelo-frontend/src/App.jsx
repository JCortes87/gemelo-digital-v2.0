import React, { useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { I18nProvider } from "./context/I18nContext";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import LoginScreen from "./components/auth/LoginScreen";
import { injectStyles } from "./styles/global";

// Lazy-loaded pages for code splitting
const RoleHome = lazy(() => import("./pages/RoleHome"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const StudentPortal = lazy(() => import("./pages/StudentPortal"));
const CoordinatorDashboard = lazy(() => import("./pages/CoordinatorDashboard"));

// Suspense fallback — CESA-branded animated loader
function PageLoader() {
  return (
    <div role="status" aria-label="Cargando página" className="cesa-loader-root">
      <div className="cesa-loader-card">
        <div className="cesa-loader-logo-wrap">
          <span className="cesa-loader-ring outer" aria-hidden="true" />
          <span className="cesa-loader-ring" aria-hidden="true" />
          <div className="cesa-loader-logo">CESA</div>
        </div>
        <h1 className="cesa-loader-title">Gemelo Digital</h1>
        <div className="cesa-loader-subtitle">Cargando</div>
        <div className="cesa-loader-dots" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="cesa-loader-bar" aria-hidden="true" />
      </div>
    </div>
  );
}

function AppRoutes() {
  const { authUser, authChecked, isDualRole, isStudent, isSuperAdmin } = useAuth();

  if (!authChecked) return <PageLoader />;
  if (!authUser) return <LoginScreen />;

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Teacher/Admin dashboard */}
        <Route
          path="/dashboard/*"
          element={
            <ProtectedRoute allowedRoles={["instructor", "admin"]}>
              <ErrorBoundary sectionName="Dashboard Docente">
                <TeacherDashboard />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />

        {/* Coordinator dashboard (any non-student can access) */}
        <Route
          path="/coordinator"
          element={
            <ProtectedRoute allowedRoles={["instructor", "admin"]}>
              <ErrorBoundary sectionName="Panel Coordinador">
                <CoordinatorDashboard />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />

        {/* Student portal */}
        <Route
          path="/portal/*"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <ErrorBoundary sectionName="Portal Estudiante">
                <StudentPortal />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />

        {/* Login page */}
        <Route path="/login" element={<LoginScreen />} />

        {/* Home — role selector for dual-role/superadmin, auto-redirect for single-role */}
        <Route
          path="/"
          element={
            isDualRole || isSuperAdmin
              ? <RoleHome />
              : <Navigate to={isStudent ? "/portal" : "/dashboard"} replace />
          }
        />

        {/* Catch-all */}
        <Route
          path="*"
          element={
            isDualRole || isSuperAdmin
              ? <Navigate to="/" replace />
              : <Navigate to={isStudent ? "/portal" : "/dashboard"} replace />
          }
        />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  useEffect(() => {
    injectStyles();
  }, []);

  return (
    <BrowserRouter>
      <I18nProvider>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <ErrorBoundary sectionName="G.D">
                <AppRoutes />
              </ErrorBoundary>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
