import React from "react";

/**
 * Simple breadcrumb navigation component.
 *
 * Usage:
 *   <Breadcrumb items={[
 *     { label: "Inicio", onClick: () => navigate("/") },
 *     { label: "Dashboard", onClick: () => navigate("/dashboard") },
 *     { label: "Curso X" },
 *   ]} />
 */
export default function Breadcrumb({ items = [], style = {} }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <nav
      aria-label="Ruta de navegación"
      className="breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--muted-strong)",
        marginBottom: 8,
        flexWrap: "wrap",
        ...style,
      }}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const isClickable = !isLast && typeof item.onClick === "function";

        return (
          <React.Fragment key={i}>
            {isClickable ? (
              <button
                type="button"
                className="breadcrumb-link"
                onClick={item.onClick}
                aria-label={typeof item.label === "string" ? `Ir a ${item.label}` : undefined}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--muted-strong)",
                  padding: "8px 12px",
                  minHeight: 32,
                  borderRadius: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  transition: "color 0.15s, background 0.15s",
                }}
              >
                {item.icon && <span style={{ marginRight: 4, display: "inline-flex" }}>{item.icon}</span>}
                {item.label}
              </button>
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                style={{
                  padding: "8px 12px",
                  color: isLast ? "var(--text)" : "var(--muted-strong)",
                  fontWeight: isLast ? 800 : 600,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {item.icon && <span style={{ marginRight: 4, display: "inline-flex" }}>{item.icon}</span>}
                {item.label}
              </span>
            )}
            {!isLast && (
              <span aria-hidden="true" style={{ color: "var(--border2, #CDD3DE)", fontSize: 12 }}>›</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
