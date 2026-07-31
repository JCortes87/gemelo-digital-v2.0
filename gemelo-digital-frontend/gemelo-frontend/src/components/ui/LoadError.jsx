import React, { useState } from "react";
import { AlertTriangle, RotateCcw, Loader2 } from "lucide-react";

/**
 * LoadError — estado de error reutilizable para fallos de carga de datos
 * (complementa a ErrorBoundary, que captura crashes de render).
 *
 * Uso:
 *   {error ? <LoadError message={error} onRetry={() => fetchData()} /> : ...}
 *
 * Props:
 *   message  string   Mensaje a mostrar (se recorta a 300 chars)
 *   onRetry  function Callback del botón "Reintentar" (puede ser async)
 *   compact  bool     Versión pequeña inline (para cards/paneles)
 */
export default function LoadError({ message, onRetry, compact = false }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const msg = String(message || "No se pudo cargar la información.").slice(0, 300);

  if (compact) {
    return (
      <div role="alert" style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "10px 12px", borderRadius: 10,
        background: "var(--critical-bg, #FEF3F2)",
        border: "1px solid var(--critical-border, #FDA29B)",
        fontSize: 12, color: "var(--muted-strong, #3D465C)",
      }}>
        <AlertTriangle size={14} color="var(--critical, #d92d20)" aria-hidden="true" />
        <span style={{ flex: 1, minWidth: 120, wordBreak: "break-word" }}>{msg}</span>
        {onRetry && (
          <button type="button" onClick={handleRetry} disabled={retrying} style={{
            border: "1px solid var(--critical-border, #FDA29B)", borderRadius: 8,
            background: "var(--card, #fff)", color: "var(--critical, #d92d20)",
            fontSize: 11, fontWeight: 800, padding: "4px 10px",
            cursor: retrying ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: "inherit",
          }}>
            {retrying
              ? <Loader2 size={12} className="spin" aria-hidden="true" />
              : <RotateCcw size={12} aria-hidden="true" />}
            Reintentar
          </button>
        )}
      </div>
    );
  }

  return (
    <div role="alert" style={{
      padding: "28px 20px", textAlign: "center",
      border: "1px solid var(--critical-border, #FDA29B)", borderRadius: 14,
      background: "var(--critical-bg, #FEF3F2)", margin: "16px 0",
    }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <AlertTriangle size={26} color="var(--critical, #d92d20)" aria-hidden="true" />
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text, #0F1827)", marginBottom: 4 }}>
        No se pudo cargar la información
      </div>
      <div style={{ fontSize: 12, color: "var(--muted-strong, #3D465C)", marginBottom: 14, wordBreak: "break-word" }}>
        {msg}
      </div>
      {onRetry && (
        <button type="button" onClick={handleRetry} disabled={retrying} style={{
          border: "none", borderRadius: 8, padding: "8px 16px",
          background: "var(--brand, #0B5FFF)", color: "#fff",
          fontSize: 12, fontWeight: 800, cursor: retrying ? "wait" : "pointer",
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "inherit",
        }}>
          {retrying
            ? <Loader2 size={14} className="spin" aria-hidden="true" />
            : <RotateCcw size={14} aria-hidden="true" />}
          {retrying ? "Reintentando..." : "Reintentar"}
        </button>
      )}
    </div>
  );
}
