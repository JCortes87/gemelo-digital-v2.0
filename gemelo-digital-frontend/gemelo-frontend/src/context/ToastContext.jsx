import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { X } from "lucide-react";
import { getSeverityTokens, normalizeSeverity } from "../components/ui/StatusBadge";

/**
 * Mapeo tipo-de-toast → severity del design system.
 * Los tipos legacy ("info"/"success"/"warning"/"error") se mantienen en la
 * API pública para no romper llamadas existentes.
 */
const TYPE_TO_SEVERITY = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "critical",
};

const ToastContext = createContext(null);

let _toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, { type = "info", duration = 5000 } = {}) => {
    const id = ++_toastId;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = {
    info: (msg, opts) => addToast(msg, { ...opts, type: "info" }),
    success: (msg, opts) => addToast(msg, { ...opts, type: "success" }),
    warning: (msg, opts) => addToast(msg, { ...opts, type: "warning" }),
    error: (msg, opts) => addToast(msg, { ...opts, type: "error", duration: opts?.duration || 8000 }),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/* ── Toast Container + individual Toast ── */

function Toast({ toast, onRemove }) {
  const severity = normalizeSeverity(TYPE_TO_SEVERITY[toast.type] || toast.type);
  const tokens = getSeverityTokens(severity);
  const Icon = tokens.Icon;

  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(() => onRemove(toast.id), toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onRemove]);

  const isUrgent = severity === "critical" || severity === "warning";

  return (
    <div
      role={isUrgent ? "alert" : "status"}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", borderRadius: 12,
        background: tokens.bg,
        border: `1px solid ${tokens.border}`,
        color: tokens.fg,
        fontSize: 13, fontWeight: 600,
        fontFamily: "'Manrope', system-ui, sans-serif",
        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        animation: "fadeUp 0.3s ease both",
        maxWidth: 420,
        wordBreak: "break-word",
      }}
    >
      <Icon size={18} strokeWidth={2.2} style={{ flexShrink: 0 }} aria-hidden="true" />
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Cerrar"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: tokens.fg, opacity: 0.6, padding: "2px 4px",
          flexShrink: 0, display: "flex", alignItems: "center",
        }}
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

function ToastContainer({ toasts, onRemove }) {
  // Always mounted so screen readers can pick up the live region even when
  // the first notification arrives. Non-visible while empty.
  return (
    <div
      role="region"
      aria-label="Notificaciones"
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: "fixed", top: 16, right: 16, zIndex: 99999,
        display: "flex", flexDirection: "column", gap: 8,
        pointerEvents: toasts.length ? "auto" : "none",
      }}
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}
