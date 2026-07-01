import React, { useState, useEffect } from "react";

/**
 * Shows "Actualizado hace X min · ⟳ Refrescar" badge.
 * Props:
 *   timestamp: Date | number | null  (when data was last fetched)
 *   onRefresh: () => void             (callback when refresh clicked)
 *   loading: boolean                  (shows spinner while refreshing)
 */
export default function LastUpdated({ timestamp, onRefresh, loading = false }) {
  const [now, setNow] = useState(() => Date.now());

  // Re-render every 30s so "hace X min" stays fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const relative = formatRelative(timestamp, now);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderRadius: 99,
        border: "1px solid var(--border)",
        background: "var(--bg)",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--muted)",
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: loading ? "var(--watch)" : "var(--ok)",
        animation: loading ? "pulse 1.2s ease infinite" : "none",
      }} />
      <span>{loading ? "Actualizando..." : relative}</span>
      {onRefresh && !loading && (
        <button
          onClick={onRefresh}
          title="Actualizar ahora (trae datos en vivo de Brightspace)"
          aria-label="Actualizar ahora"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--brand)",
            fontSize: 12,
            fontWeight: 800,
            padding: "0 2px",
          }}
        >
          ⟳
        </button>
      )}
    </div>
  );
}

function formatRelative(ts, now) {
  if (!ts) return "Sin datos";
  const t = ts instanceof Date ? ts.getTime() : Number(ts);
  if (!t || Number.isNaN(t)) return "Sin datos";
  const diffMs = Math.max(0, now - t);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 10) return "Actualizado ahora";
  if (sec < 60) return `Hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Hace ${hr} h`;
  const days = Math.floor(hr / 24);
  return `Hace ${days}d`;
}
