import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function ProtectedRoute({ children, allowedRoles }) {
  const { authUser, authChecked, allRoles, isDualRole } = useAuth();

  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Manrope', system-ui, sans-serif" }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 24, padding: "40px 48px", textAlign: "center", boxShadow: "0 8px 32px rgba(15,24,39,0.12)", minWidth: 320, maxWidth: 480 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>CESA · G.D 2026.7.10</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Verificando sesión...</div>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <Navigate to="/login" replace />;
  }

  // For dual-role users: check if ANY of their roles matches the allowed roles
  if (allowedRoles) {
    const hasAccess = allRoles.some((r) => allowedRoles.includes(r));
    if (!hasAccess) {
      // Redirect to home (role selector) for dual-role, or to their single view
      return <Navigate to={isDualRole ? "/" : (allRoles.includes("student") ? "/portal" : "/dashboard")} replace />;
    }
  }

  return children;
}
