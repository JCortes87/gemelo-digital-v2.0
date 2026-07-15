import React, { createContext, useContext, useState, useEffect } from "react";
import { apiUrl } from "../utils/api";

const AuthContext = createContext(null);

const ROLES_INSTRUCTOR = new Set(["instructor", "coordinador administrativo", "super administrator"]);
const ROLES_STUDENT = new Set(["estudiante ef"]);

// Map a single Brightspace role string to app role
function mapSingleRole(backendRole) {
  if (!backendRole) return null;
  const r = String(backendRole).toLowerCase().trim();
  if (ROLES_STUDENT.has(r) || r.includes("estudiante") || r.includes("student")) return "student";
  if (ROLES_INSTRUCTOR.has(r) || r.includes("instructor") || r.includes("admin") || r.includes("coordinador")) return "instructor";
  console.warn(`[AuthContext] Rol desconocido de Brightspace: "${backendRole}" — asignando "instructor" por defecto`);
  return "instructor";
}

// Determine all app-level roles from backend all_roles array
function mapAllRoles(allRolesArray) {
  if (!Array.isArray(allRolesArray) || !allRolesArray.length) return ["instructor"];
  const appRoles = new Set();
  for (const r of allRolesArray) {
    const mapped = mapSingleRole(r);
    if (mapped) appRoles.add(mapped);
  }
  return appRoles.size > 0 ? Array.from(appRoles) : ["instructor"];
}

export function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [initialOrgUnitId, setInitialOrgUnitId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // Read hash fragment from OAuth callback
        let _sid = null;
        let _hashOu = null;
        const _hash = window.location.hash;
        if (_hash.startsWith("#gemelo:")) {
          const parts = _hash.slice(1).split(":");
          if (parts.length >= 2) {
            _sid    = parts[1] || null;
            _hashOu = parts[2] && Number(parts[2]) > 0 ? Number(parts[2]) : null;
            const _fl = parts[3];
            if (_fl === "1") sessionStorage.setItem("gemelo_first_login", "1");
          }
          window.history.replaceState(null, "", window.location.pathname + window.location.search);

          // Popup OAuth flow: si este tab fue abierto como popup por LoginScreen,
          // le avisamos al padre con el token y cerramos. El padre (main window)
          // almacena el SID y hace reload. De este modo el main window nunca sale
          // de gemelo.cesa.edu.co durante el flujo OAuth.
          if (_sid && window.opener && !window.opener.closed) {
            try {
              window.opener.postMessage(
                { type: "gemelo-auth", sid: _sid, orgUnitId: _hashOu, firstLogin: parts[3] === "1" },
                window.location.origin,
              );
            } catch {}
            // Dar 300ms para que el mensaje llegue antes de cerrar
            setTimeout(() => window.close(), 300);
            return; // No seguir inicializando el contexto en la ventana popup
          }
        }

        if (!_sid) _sid = localStorage.getItem("gemelo_sid");
        if (_sid) {
          localStorage.setItem("gemelo_sid", _sid);
          localStorage.removeItem("gemelo_oauth_pending"); // limpiar bandera de retry
        }

        if (_hashOu) {
          setInitialOrgUnitId(_hashOu);
        }

        // Call /auth/me (el sid va solo en el header Bearer, nunca en la URL)
        const res = await fetch(apiUrl("/auth/me"), {
          credentials: "include",
          headers: _sid ? { "Authorization": `Bearer ${_sid}` } : {},
        });
        const data = await res.json();
        if (data.authenticated) {
          // Initial roles from /auth/me (may be empty on first login before courses fetched)
          let allRolesRaw = data.all_roles || (data.role ? [data.role] : []);

          // Fetch enrolled courses to determine ALL roles from actual enrollments
          // This is the authoritative source: /enrollments/myenrollments/ returns
          // every course with its roleName, so we can detect dual-role users reliably.
          try {
            const coursesRes = await fetch(
              apiUrl(`/brightspace/courses/enrolled?active_only=false&limit=200`),
              {
                credentials: "include",
                headers: _sid ? { "Authorization": `Bearer ${_sid}` } : {},
              }
            );
            if (coursesRes.ok) {
              const coursesData = await coursesRes.json();
              const items = Array.isArray(coursesData?.items) ? coursesData.items : [];
              const rolesFromCourses = [...new Set(
                items.map(c => String(c.roleName || "").trim()).filter(r => r)
              )];
              if (rolesFromCourses.length > 0) {
                // Merge course roles with system roles from /auth/me
                // (system roles like "Super Administrator" don't appear in enrollments)
                allRolesRaw = [...new Set([...allRolesRaw, ...rolesFromCourses])];
              }
            }
          } catch {
            // If courses fetch fails, fall back to roles from /auth/me
          }

          const appRoles = mapAllRoles(allRolesRaw);
          const primaryRole = mapSingleRole(data.role) || appRoles[0];

          // SuperAdmin detection: env var list, backend role, or enrolled roles.
          // El backend detecta el rol de sistema por RoleId numérico y trata
          // igual a "Super Administrator" (105) y "Administrator" (116) —
          // _ADMIN_ROLES en gemelo.py autoriza ambos. Aquí replicamos eso:
          // match exacto de "administrator" (exacto para NO capturar roles de
          // curso como "Coordinador Administrativo").
          const superAdminIds = (import.meta.env?.VITE_SUPERADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
          const _sysRole = String(data.role || "").trim().toLowerCase();
          const isSuperAdmin =
            superAdminIds.includes(String(data.user_id)) ||
            allRolesRaw.some((r) => String(r).toLowerCase().includes("super admin")) ||
            allRolesRaw.some((r) => String(r).trim().toLowerCase() === "administrator") ||
            _sysRole.includes("super admin") ||
            _sysRole === "administrator";
          const user = {
            ...data,
            all_roles: allRolesRaw,
            appRole: primaryRole,
            appRoles, // ["instructor", "student"] for dual-role users
            isDualRole: appRoles.length > 1,
            isInstructor: appRoles.includes("instructor"),
            isStudent: appRoles.includes("student"),
            isSuperAdmin,
          };
          setAuthUser(user);

          const savedOu = sessionStorage.getItem("gemelo_pending_org");
          if (savedOu && Number(savedOu) > 0) {
            // NOTE: Don't remove the key — we need it to survive page
            // reloads (F5). Lazy-loaded pages (StudentPortal/TeacherDashboard)
            // may mount AFTER this effect runs, and their useState
            // initializers read sessionStorage directly. If we delete it
            // here, a hard refresh loses the course selection.
            setInitialOrgUnitId(Number(savedOu));
          }

          const isFirstLogin = sessionStorage.getItem("gemelo_first_login") === "1";
          const alreadyOnboarded = localStorage.getItem("gemelo_onboarded") === "1";
          if (isFirstLogin || !alreadyOnboarded) {
            sessionStorage.removeItem("gemelo_first_login");
            setShowTutorial(true);
          }
        } else if (data.lti_detected) {
          const ou = data.org_unit_id || "";
          if (ou) sessionStorage.setItem("gemelo_pending_org", ou);
          const loginPath = ou
            ? apiUrl(`/auth/brightspace/login?org_unit_id=${ou}`)
            : apiUrl("/auth/brightspace/login");
          window.location.href = loginPath;
          return;
        }
      } catch {
        // offline / error -> show login
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const logout = async () => {
    try {
      const sid = localStorage.getItem("gemelo_sid");
      const hdrs = sid ? { Authorization: `Bearer ${sid}` } : {};
      await fetch(apiUrl("/auth/logout"), { method: "POST", credentials: "include", headers: hdrs });
    } catch {}
    localStorage.removeItem("gemelo_sid");
    sessionStorage.clear();
    // Redirect to root (login) instead of reload to avoid 403 on SPA routes
    window.location.href = window.location.origin + "/";
  };

  const role = authUser?.appRole || "instructor";

  return (
    <AuthContext.Provider value={{
      authUser,
      authChecked,
      role,
      allRoles: authUser?.appRoles || ["instructor"],
      isDualRole: authUser?.isDualRole || false,
      isInstructor: authUser?.isInstructor ?? true,
      isStudent: authUser?.isStudent ?? false,
      isSuperAdmin: authUser?.isSuperAdmin ?? false,
      logout,
      showTutorial,
      setShowTutorial,
      initialOrgUnitId,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
