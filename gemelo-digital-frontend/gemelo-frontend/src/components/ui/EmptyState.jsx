import React from "react";
import { Inbox } from "lucide-react";

/**
 * EmptyState — placeholder consistente para secciones sin datos.
 *
 * Reemplaza el patrón anterior de `.empty-state` con "—" por algo con
 * icono, título, descripción y opcionalmente un CTA.
 *
 * Props:
 *   icon        — componente Lucide (default: Inbox)
 *   title       — encabezado breve (default: "Sin datos")
 *   description — texto secundario (opcional)
 *   action      — { label, onClick } opcional para un botón principal
 *   compact     — versión reducida (padding menor, sin icono grande)
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title = "Sin datos",
  description = null,
  action = null,
  compact = false,
  style = {},
}) {
  return (
    <div
      role="status"
      className="empty-state"
      style={{
        padding: compact ? "20px 16px" : "40px 20px",
        gap: compact ? 6 : 10,
        ...style,
      }}
    >
      {!compact && (
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            color: "var(--muted-strong)",
            marginBottom: 4,
          }}
        >
          <Icon size={24} strokeWidth={2} />
        </div>
      )}
      <div
        style={{
          fontSize: compact ? 13 : 14,
          fontWeight: 800,
          color: "var(--text)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>
      {description && (
        <div
          style={{
            fontSize: compact ? 11 : 12,
            color: "var(--muted-strong)",
            fontWeight: 500,
            lineHeight: 1.5,
            maxWidth: 360,
            textAlign: "center",
          }}
        >
          {description}
        </div>
      )}
      {action && typeof action.onClick === "function" && (
        <button
          type="button"
          onClick={action.onClick}
          className="btn btn-primary"
          style={{
            marginTop: 8,
            padding: "8px 16px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 8,
            border: "1px solid var(--brand)",
            background: "var(--brand)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
