import React from "react";
import { AlertTriangle } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { fallback, sectionName } = this.props;

      if (fallback) return fallback;

      return (
        <div style={{
          padding: "24px 20px",
          border: "1px solid var(--critical-border, #FDA29B)",
          borderRadius: 16,
          background: "var(--critical-bg, #FEF3F2)",
          textAlign: "center",
          fontFamily: "'Manrope', system-ui, sans-serif",
        }}>
          <div style={{ marginBottom: 10, display: "flex", justifyContent: "center", color: "var(--critical, #d92d20)" }}>
            <AlertTriangle size={30} strokeWidth={2} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text, #0F1827)", marginBottom: 6 }}>
            {sectionName ? `Error en ${sectionName}` : "Algo salió mal"}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted, #5A6580)", marginBottom: 16, lineHeight: 1.5 }}>
            {this.state.error?.message || "Ocurrió un error inesperado."}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: "var(--brand, #0B5FFF)", color: "#fff",
              border: "none", borderRadius: 8, padding: "8px 16px",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
