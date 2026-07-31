import React from "react";
import { Loader2 } from "lucide-react";

/**
 * Button — botón reutilizable con variantes, tamaños y estado de carga.
 *
 * Props:
 *   variant  — "solid" (default) | "ghost" | "outline" | "text" | "danger"
 *   size     — "sm" | "md" (default) | "lg"
 *   loading  — muestra spinner y deshabilita clicks
 *   disabled — deshabilita
 *   icon     — componente Lucide opcional (renderiza a la izquierda)
 *   fullWidth— ocupa 100% del contenedor
 *
 * Cuando `loading` está activo:
 *   - Se muestra un Loader2 girando en lugar del icono.
 *   - Se aplica aria-busy="true" y el botón queda deshabilitado.
 *   - Se preserva el ancho para evitar layout shift.
 */
export default function Button({
  children,
  variant = "solid",
  size = "md",
  loading = false,
  disabled = false,
  icon: Icon = null,
  fullWidth = false,
  type = "button",
  style = {},
  onClick,
  ...rest
}) {
  const isDisabled = disabled || loading;

  const sizes = {
    sm: { padding: "6px 12px", fontSize: 12, iconSize: 14, minHeight: 30 },
    md: { padding: "8px 16px", fontSize: 13, iconSize: 16, minHeight: 36 },
    lg: { padding: "10px 20px", fontSize: 14, iconSize: 18, minHeight: 42 },
  };
  const s = sizes[size] || sizes.md;

  const variants = {
    solid: {
      background: "var(--brand)",
      color: "#fff",
      border: "1px solid var(--brand)",
    },
    ghost: {
      background: "transparent",
      color: "var(--brand)",
      border: "1px solid transparent",
    },
    outline: {
      background: "var(--card)",
      color: "var(--brand)",
      border: "1px solid var(--brand)",
    },
    text: {
      background: "transparent",
      color: "var(--text)",
      border: "1px solid transparent",
    },
    danger: {
      background: "var(--critical)",
      color: "#fff",
      border: "1px solid var(--critical)",
    },
  };
  const v = variants[variant] || variants.solid;

  return (
    <button
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      style={{
        ...v,
        padding: s.padding,
        fontSize: s.fontSize,
        minHeight: s.minHeight,
        fontWeight: 700,
        fontFamily: "var(--font)",
        borderRadius: 8,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled && !loading ? 0.55 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: fullWidth ? "100%" : undefined,
        transition: "opacity 0.15s ease, background 0.15s ease, transform 0.05s ease",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <Loader2 size={s.iconSize} strokeWidth={2.4} aria-hidden="true"
          style={{ animation: "rotateGlow 0.8s linear infinite", flexShrink: 0 }} />
      ) : Icon ? (
        <Icon size={s.iconSize} strokeWidth={2.2} aria-hidden="true" style={{ flexShrink: 0 }} />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
