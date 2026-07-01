import React from "react";
import {
  Info, CheckCircle2, AlertTriangle, XCircle, Clock,
} from "lucide-react";

/**
 * Sistema unificado de severidades — mapea un `severity` semántico a los
 * tokens del design system y un icono Lucide por defecto.
 *
 * Severidades soportadas:
 *   - "info"     → --brand / --brand-light
 *   - "success"  → --ok / --ok-bg / --ok-border
 *   - "warning"  → --watch / --watch-bg / --watch-border
 *   - "critical" → --critical / --critical-bg / --critical-border
 *   - "pending"  → --pending / --pending-bg / --pending-border
 *   - "neutral"  → --muted / --bg
 *
 * Cualquier consumo que quiera respetar la paleta unificada puede consumir
 * `getSeverityTokens(severity)` en vez de replicar objetos ad-hoc.
 */
export const SEVERITY_TOKENS = {
  info: {
    fg: "var(--brand, #0B5FFF)",
    bg: "var(--brand-light, #EBF1FF)",
    border: "var(--brand, #0B5FFF)",
    Icon: Info,
    label: "Información",
  },
  success: {
    fg: "var(--ok, #12B76A)",
    bg: "var(--ok-bg, #ECFDF3)",
    border: "var(--ok-border, #A9EFC5)",
    Icon: CheckCircle2,
    label: "Éxito",
  },
  warning: {
    fg: "var(--watch, #E8900A)",
    bg: "var(--watch-bg, #FFF8ED)",
    border: "var(--watch-border, #FCD385)",
    Icon: AlertTriangle,
    label: "Advertencia",
  },
  critical: {
    fg: "var(--critical, #D92D20)",
    bg: "var(--critical-bg, #FEF3F2)",
    border: "var(--critical-border, #FDA29B)",
    Icon: XCircle,
    label: "Crítico",
  },
  pending: {
    fg: "var(--pending, #8B96A8)",
    bg: "var(--pending-bg, #F1F3F7)",
    border: "var(--pending-border, #D1D8E4)",
    Icon: Clock,
    label: "Pendiente",
  },
  neutral: {
    fg: "var(--muted-strong, #3D465C)",
    bg: "var(--bg, #F2F4F8)",
    border: "var(--border, #E4E8EF)",
    Icon: Info,
    label: "Neutral",
  },
};

export function getSeverityTokens(severity = "neutral") {
  return SEVERITY_TOKENS[severity] || SEVERITY_TOKENS.neutral;
}

/** Alias tolerante con nombres legacy (`error`, `ok`, `watch`, `risk`, etc.). */
export function normalizeSeverity(input) {
  if (!input) return "neutral";
  const s = String(input).toLowerCase().trim();
  if (s === "error" || s === "danger" || s === "risk") return "critical";
  if (s === "ok" || s === "green") return "success";
  if (s === "watch" || s === "yellow") return "warning";
  if (s === "blue" || s === "brand") return "info";
  if (s === "gray" || s === "grey" || s === "muted") return "pending";
  if (SEVERITY_TOKENS[s]) return s;
  return "neutral";
}

/**
 * StatusBadge — píldora compacta con icono opcional y etiqueta.
 *
 * Props:
 *   - severity: "info" | "success" | "warning" | "critical" | "pending" | "neutral"
 *   - children: label
 *   - icon: componente lucide (opcional, sobrescribe el default de la severidad)
 *   - hideIcon: bool — oculta el icono
 *   - size: "sm" (default) | "md" | "lg"
 *   - solid: bool — variante rellena (bg = severity.fg, text = white)
 *   - as: string tag (default "span")
 *
 * Accesibilidad: se aplica role="status" para severities no urgentes; los que
 * son críticos o warnings obtienen role="alert" para que lectores de pantalla
 * los anuncien inmediatamente cuando aparecen dinámicamente.
 */
export default function StatusBadge({
  severity = "neutral",
  children,
  icon,
  hideIcon = false,
  size = "sm",
  solid = false,
  as: Tag = "span",
  style: styleOverride,
  ...rest
}) {
  const sev = normalizeSeverity(severity);
  const t = getSeverityTokens(sev);
  const IconComp = icon || t.Icon;

  const sizeMap = {
    sm: { fontSize: 10, padY: 3, padX: 9, iconSize: 12, gap: 5, radius: 6 },
    md: { fontSize: 11, padY: 5, padX: 10, iconSize: 13, gap: 6, radius: 8 },
    lg: { fontSize: 12, padY: 7, padX: 12, iconSize: 14, gap: 6, radius: 10 },
  };
  const S = sizeMap[size] || sizeMap.sm;

  const role = sev === "critical" || sev === "warning" ? "alert" : "status";

  const baseStyle = solid
    ? {
        background: t.fg,
        color: "#fff",
        border: `1px solid ${t.fg}`,
      }
    : {
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
      };

  return (
    <Tag
      role={role}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: S.gap,
        padding: `${S.padY}px ${S.padX}px`,
        borderRadius: S.radius,
        fontSize: S.fontSize,
        fontWeight: 800,
        letterSpacing: "0.03em",
        fontFamily: "'Manrope', system-ui, sans-serif",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        ...baseStyle,
        ...styleOverride,
      }}
      {...rest}
    >
      {!hideIcon && IconComp && (
        <IconComp size={S.iconSize} strokeWidth={2.4} aria-hidden="true" />
      )}
      {children}
    </Tag>
  );
}
