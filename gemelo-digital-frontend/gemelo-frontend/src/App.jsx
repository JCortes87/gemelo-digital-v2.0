import React, { useEffect, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { I18nProvider } from "./context/I18nContext";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import LoginScreen from "./components/auth/LoginScreen";
import CesaLoader from "./components/ui/CesaLoader";
import { injectStyles } from "./styles/global";

// Lazy-loaded pages for code splitting
const RoleHome = lazy(() => import("./pages/RoleHome"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const StudentPortal = lazy(() => import("./pages/StudentPortal"));
const CoordinatorDashboard = lazy(() => import("./pages/CoordinatorDashboard"));
const LearningOutcomesAdmin = lazy(() => import("./pages/LearningOutcomesAdmin"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));

// Suspense fallback — usa el loader CESA compartido
function PageLoader() {
  return <CesaLoader subtitle="Cargando página" />;
}

function AppRoutes() {
  const { authUser, authChecked, isDualRole, isStudent, isSuperAdmin } = useAuth();

  if (!authChecked) return <PageLoader />;
  if (!authUser) return <LoginScreen />;

  return (
    <Suspense fallback={<PageLoader />}>
      <a href="#main-content" className="skip-link">
        Saltar al contenido principal
      </a>
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

        {/* Resultados de aprendizaje (Super Admin) — página dedicada */}
        <Route
          path="/outcomes"
          element={
            <ProtectedRoute allowedRoles={["instructor", "admin"]}>
              <ErrorBoundary sectionName="Resultados de Aprendizaje">
                <LearningOutcomesAdmin />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />

        {/* Panel de administración (Super Admin) — uso de la plataforma */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["instructor", "admin"]}>
              <ErrorBoundary sectionName="Panel de Administración">
                <AdminPanel />
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
              <ErrorBoundary sectionName="Visor de desempeño estudiantil">
                <AppRoutes />
              </ErrorBoundary>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
