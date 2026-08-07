import React, { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { injectStyles } from "../../styles/global";
import { apiUrl } from "../../utils/api";

/**
 * LoginScreen — flujo OAuth via popup window.
 *
 * Por qué popup:
 *   Brightspace redirige al Microsoft SAML login. A veces el RelayState del SAML
 *   no preserva el estado OAuth de vuelta, y el usuario termina en cesa.brightspace.com/d2l/home
 *   en lugar del callback de gemelo. Si el flujo ocurre en la ventana principal, el
 *   usuario pierde gemelo y tiene que navegar manualmente de vuelta.
 *
 *   Con popup el main window siempre se queda en gemelo.cesa.edu.co. Si el popup
 *   termina en d2l/home el usuario solo tiene que cerrar esa ventana. En ese punto
 *   ya tiene sesion en Brightspace, asi que la segunda apertura del popup completa
 *   el OAuth instantaneamente (sin SSO) y envia postMessage al main window.
 *
 * Flujo:
 *   1. Click boton → abre popup con /auth/brightspace/login
 *   2a. OAuth completa (sesion BS activa) → popup carga gemelo/#gemelo:sid:... →
 *       AuthContext detecta window.opener → postMessage("gemelo-auth") → popup.close()
 *       → main window recibe mensaje → guarda sid → reload
 *   2b. Usuario no tiene sesion BS → popup va a Microsoft SSO → termina en d2l/home
 *       → popup cerrado por usuario → main window detecta cierre → muestra boton
 *       "Completar sesion" → segundo popup → flujo 2a (sesion BS ya activa)
 *
 * Fallback:
 *   Si el navegador bloquea popups, redirige la pagina completa como antes.
 */

const OAUTH_PENDING_KEY = "gemelo_oauth_pending";
const POPUP_TIMEOUT_MS  = 120_000; // 2 min maximos esperando al popup

export default function LoginScreen({ orgUnitId }) {
  // 'idle' | 'waiting' | 'redirect' | 'retry'
  const [status, setStatus] = useState("idle");
  const s = useRef({ popup: null, msgH: null, poll: null, timer: null, retries: 0 });

  useEffect(() => {
    injectStyles();

    // Si el usuario volvio manualmente a gemelo despues de un OAuth fallido
    // (termino en d2l/home), detectarlo y mostrar el boton de "Completar sesion"
    // de inmediato para que no tenga que volver a hacer click desde cero.
    const pending = localStorage.getItem(OAUTH_PENDING_KEY);
    if (pending) {
      const elapsed = Date.now() - Number(pending);
      if (elapsed > 2000 && elapsed < POPUP_TIMEOUT_MS) {
        setStatus("retry");
      } else {
        localStorage.removeItem(OAUTH_PENDING_KEY);
      }
    }

    return () => _cleanup(s.current);
  }, []);

  const loginPath = orgUnitId > 0
    ? `/auth/brightspace/login?org_unit_id=${orgUnitId}`
    : "/auth/brightspace/login";
  const loginUrl = apiUrl(loginPath);

  // ── helpers ─────────────────────────────────────────────────────────────────

  function _cleanup(ref) {
    if (ref.msgH)  { window.removeEventListener("message", ref.msgH); ref.msgH = null; }
    if (ref.poll)  { clearInterval(ref.poll);  ref.poll = null; }
    if (ref.timer) { clearTimeout(ref.timer);  ref.timer = null; }
  }

  function _onAuthSuccess(sid) {
    _cleanup(s.current);
    if (s.current.popup && !s.current.popup.closed) s.current.popup.close();
    localStorage.setItem("gemelo_sid", sid);
    localStorage.removeItem(OAUTH_PENDING_KEY);
    window.location.reload();
  }

  function _openPopup() {
    const ref = s.current;
    _cleanup(ref);

    const w = 520, h = 680;
    const left = Math.round((screen.width  - w) / 2);
    const top  = Math.round((screen.height - h) / 2);
    const popup = window.open(
      loginUrl,
      "gemelo-oauth",
      `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`,
    );

    if (!popup) {
      // Popup bloqueado → fallback redirect de pagina completa
      localStorage.setItem(OAUTH_PENDING_KEY, String(Date.now()));
      setStatus("redirect");
      window.location.href = loginUrl;
      return;
    }

    ref.popup = popup;
    localStorage.setItem(OAUTH_PENDING_KEY, String(Date.now()));
    setStatus("waiting");

    // Escuchar postMessage desde el popup (cuando AuthContext detecta window.opener)
    ref.msgH = (event) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "gemelo-auth") return;
      _onAuthSuccess(event.data.sid);
    };
    window.addEventListener("message", ref.msgH);

    // Timeout de seguridad (2 min) → si no recibimos nada, mostrar boton de retry
    ref.timer = setTimeout(() => {
      _cleanup(ref);
      setStatus("retry");
    }, POPUP_TIMEOUT_MS);

    // Polling: detectar cuando el popup se cierra
    ref.poll = setInterval(() => {
      if (!ref.popup || ref.popup.closed) {
        clearInterval(ref.poll); ref.poll = null;
        // Si el mensaje ya llego (msgH ya fue removido) no hacer nada
        if (!ref.msgH) return;
        // El popup se cerro sin completar OAuth → usuario probablemente paso por SSO
        // y termino en d2l/home. Mostrar boton de "Completar sesion".
        _cleanup(ref);
        if (ref.retries < 1) {
          // Primera vez: mostrar el boton de completar en lugar de auto-abrir
          // para no sorprender al usuario con otro popup inmediato.
          ref.retries += 1;
          setStatus("retry");
        } else {
          // Ya intentaron dos veces sin exito → volver a idle
          localStorage.removeItem(OAUTH_PENDING_KEY);
          setStatus("idle");
        }
      }
    }, 500);
  }

  // ── handlers ────────────────────────────────────────────────────────────────

  function handleLogin(e) {
    e.preventDefault();
    s.current.retries = 0;
    _openPopup();
  }

  function handleRetry(e) {
    e.preventDefault();
    _openPopup();
  }

  // ── render ──────────────────────────────────────────────────────────────────

  const cardStyle = {
    background: "var(--card)", border: "1px solid var(--border)",
    borderRadius: 24, padding: "40px 48px",
    textAlign: "center", maxWidth: 440, width: "100%",
    boxShadow: "0 8px 32px rgba(15,24,39,0.12), 0 16px 48px rgba(15,24,39,0.08)",
  };

  const btnBase = {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    width: "100%", padding: "13px 20px",
    borderRadius: 12, textDecoration: "none", border: "none", cursor: "pointer",
    fontSize: 14, fontWeight: 800,
    transition: "opacity 0.15s",
  };

  const msIcon = (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
      <rect x="0"  y="0"  width="10" height="10" fill="#F25022"/>
      <rect x="11" y="0"  width="10" height="10" fill="#7FBA00"/>
      <rect x="0"  y="11" width="10" height="10" fill="#00A4EF"/>
      <rect x="11" y="11" width="10" height="10" fill="#FFB900"/>
    </svg>
  );

  return (
    <main
      role="main"
      aria-label="Inicio de sesion - G.D CESA"
      style={{
        minHeight: "100vh", background: "var(--bg)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Manrope', system-ui, sans-serif", padding: 20,
      }}
    >
      <div role="region" aria-label="Formulario de autenticacion" style={cardStyle}>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 13,
            background: "var(--brand)", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 15, fontWeight: 900, letterSpacing: "-0.03em",
          }}>CESA</div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em" }}>G.D</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              2026.8.7
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: "var(--border)", margin: "0 0 28px" }} />

        {/* ── Estado: esperando al popup ── */}
        {status === "waiting" && (
          <>
            <div style={{ marginBottom: 14, display: "flex", justifyContent: "center", color: "var(--brand)" }}>
              <Loader2 size={30} strokeWidth={2.2} style={{ animation: "rotateGlow 1s linear infinite" }} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
              Autenticando…
            </h2>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 20px" }}>
              Completa el inicio de sesion en la ventana que se acaba de abrir.
              <br />Si no ves la ventana, revisa si fue bloqueada por tu navegador.
            </p>
            <button
              onClick={handleLogin}
              style={{
                ...btnBase,
                background: "var(--border)", color: "var(--muted)",
                fontSize: 12, padding: "9px 16px",
              }}
            >
              Abrir ventana de nuevo
            </button>
          </>
        )}

        {/* ── Estado: retry (popup cerro sin completar OAuth) ── */}
        {status === "retry" && (
          <>
            <div style={{ marginBottom: 14, display: "flex", justifyContent: "center", color: "var(--ok, #12b76a)" }}>
              <CheckCircle2 size={30} strokeWidth={2.2} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
              Ya iniciaste sesion en Microsoft
            </h2>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 20px" }}>
              La autenticacion con Microsoft fue exitosa. Haz clic para completar
              el acceso a G.D.
            </p>
            <button
              onClick={handleRetry}
              style={{
                ...btnBase,
                background: "var(--brand)", color: "#fff",
                boxShadow: "0 4px 16px rgba(11,95,255,0.3)",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              {msIcon}
              Completar acceso a G.D
            </button>
            <button
              onClick={handleLogin}
              style={{
                ...btnBase,
                background: "transparent", color: "var(--muted)",
                fontSize: 12, padding: "9px 16px", marginTop: 8,
                textDecoration: "underline",
              }}
            >
              Iniciar sesion con otra cuenta
            </button>
          </>
        )}

        {/* ── Estado: idle (pantalla inicial) ── */}
        {(status === "idle" || status === "redirect") && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text)", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
              Bienvenido
            </h2>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 28px" }}>
              Para acceder a tu tablero, inicia sesion con tu cuenta CESA de Brightspace.
              Seras redirigido a Microsoft para autenticarte.
            </p>

            <button
              onClick={handleLogin}
              style={{
                ...btnBase,
                background: "var(--brand)", color: "#fff",
                boxShadow: "0 4px 16px rgba(11,95,255,0.3)",
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
              onMouseLeave={e => e.currentTarget.style.opacity = "1"}
            >
              {msIcon}
              Iniciar sesion con Microsoft
            </button>

            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 18, lineHeight: 1.5 }}>
              Docentes y estudiantes con cursos activos en Brightspace pueden acceder.
              Si tienes problemas, contacta a soporte CESA.
            </p>

            <div style={{
              marginTop: 20, padding: "10px 14px", borderRadius: 10,
              background: "var(--brand-light)", border: "1px solid var(--brand-light2, #D6E4FF)",
            }}>
              <p style={{ fontSize: 11, color: "var(--brand)", fontWeight: 700, margin: 0 }}>
                Tambien puedes acceder directamente desde tu curso en Brightspace
                usando el enlace de la herramienta G.D.
              </p>
            </div>
          </>
        )}

      </div>
    </main>
  );
}
