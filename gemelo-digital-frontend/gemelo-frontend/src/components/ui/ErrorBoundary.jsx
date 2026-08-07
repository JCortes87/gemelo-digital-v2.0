import React from "react";
import { AlertTriangle, RotateCcw, Home, Copy, Check } from "lucide-react";

const CRASH_KEY = "gemelo_last_crash";

/**
 * ErrorBoundary — captura errores de render y ofrece recuperación.
 *
 * Mejoras vs. versión anterior:
 *  - Persiste snapshot del error en sessionStorage (message + stack + section
 *    + timestamp + URL). Permite auditar tras un reload.
 *  - Ofrece 3 acciones: Reintentar (limpia estado local), Volver al inicio
 *    (window.location = "/"), Copiar detalles (para reporte a soporte).
 *  - role="alert" para lectores de pantalla.
 *  - No pierde el scroll/URL cuando el usuario elige "reintentar".
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    try {
      const snapshot = {
        section: this.props.sectionName || "app",
        message: String(error?.message || error),
        stack: String(error?.stack || ""),
        componentStack: String(errorInfo?.componentStack || ""),
        url: typeof window !== "undefined" ? window.location.href : "",
        at: new Date().toISOString(),
      };
      sessionStorage.setItem(CRASH_KEY, JSON.stringify(snapshot));
    } catch { /* storage lleno o bloqueado — silencioso */ }
    // Reportar a Sentry si está activo (window.__gemeloSentry lo setea main.jsx
    // solo cuando VITE_SENTRY_DSN está definido). Best-effort.
    try {
      window.__gemeloSentry?.captureException(error, {
        contexts: {
          react: { componentStack: String(errorInfo?.componentStack || "") },
        },
        tags: { section: this.props.sectionName || "app" },
      });
    } catch { /* Sentry no disponible — silencioso */ }
  }

  handleRetry = () => {
    // Un chunk con hash viejo no vuelve a existir por reintentar el render:
    // hay que recargar la página completa para traer el index.html nuevo.
    const msg = String(this.state.error?.message || "");
    if (/dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null, copied: false });
  };

  handleGoHome = () => {
    try { sessionStorage.removeItem(CRASH_KEY); } catch { /* noop */ }
    window.location.href = "/";
  };

  handleCopy = async () => {
    try {
      const raw = sessionStorage.getItem(CRASH_KEY) || JSON.stringify({
        message: String(this.state.error?.message || this.state.error),
        section: this.props.sectionName || "app",
      });
      await navigator.clipboard.writeText(raw);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch { /* noop */ }
  };

  render() {
    if (this.state.hasError) {
      const { fallback, sectionName } = this.props;

      if (fallback) return fallback;

      const btnBase = {
        border: "none", borderRadius: 8, padding: "8px 14px",
        fontSize: 12, fontWeight: 700, cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: 6,
        fontFamily: "'Manrope', system-ui, sans-serif",
      };

      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            padding: "24px 20px",
            border: "1px solid var(--critical-border, #FDA29B)",
            borderRadius: 16,
            background: "var(--critical-bg, #FEF3F2)",
            textAlign: "center",
            fontFamily: "'Manrope', system-ui, sans-serif",
            maxWidth: 520,
            margin: "24px auto",
          }}
        >
          <div style={{ marginBottom: 10, display: "flex", justifyContent: "center", color: "var(--critical, #d92d20)" }}>
            <AlertTriangle size={30} strokeWidth={2} aria-hidden="true" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text, #0F1827)", marginBottom: 6 }}>
            {sectionName ? `Error en ${sectionName}` : "Algo salió mal"}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-strong, #3D465C)", marginBottom: 16, lineHeight: 1.5, wordBreak: "break-word" }}>
            {this.state.error?.message || "Ocurrió un error inesperado."}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{ ...btnBase, background: "var(--brand, #0B5FFF)", color: "#fff" }}
            >
              <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
              Reintentar
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              style={{ ...btnBase, background: "var(--card, #fff)", color: "var(--text, #0F1827)", border: "1px solid var(--border, #E4E8EF)" }}
            >
              <Home size={14} strokeWidth={2.2} aria-hidden="true" />
              Volver al inicio
            </button>
            <button
              type="button"
              onClick={this.handleCopy}
              title="Copiar detalles del error para reporte a soporte"
              style={{ ...btnBase, background: "transparent", color: "var(--muted-strong, #3D465C)", border: "1px solid var(--border, #E4E8EF)" }}
            >
              {this.state.copied
                ? <><Check size={14} strokeWidth={2.4} aria-hidden="true" />Copiado</>
                : <><Copy size={14} strokeWidth={2.2} aria-hidden="true" />Copiar detalles</>}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
