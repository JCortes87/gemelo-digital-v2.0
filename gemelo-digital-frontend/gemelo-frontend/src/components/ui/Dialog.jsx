import React, { useEffect, useRef } from "react";

/**
 * Dialog genérico — modal accesible con:
 *  - Backdrop dismiss (opcional vía dismissOnBackdrop)
 *  - Escape para cerrar (opcional vía dismissOnEscape)
 *  - Focus trap con Tab / Shift+Tab
 *  - Restauración del foco al elemento previo al cerrar
 *  - role="dialog" + aria-modal + aria-label / aria-labelledby
 *
 * Props:
 *  - open (bool): controla visibilidad
 *  - onClose (fn)
 *  - ariaLabel / ariaLabelledBy (string)
 *  - width (string|number): default "min(640px, 100%)"
 *  - maxHeight (string): default "70vh"
 *  - alignTop (bool): si true, top offset 12vh; si false, centrado vertical
 *  - dismissOnBackdrop (bool): default true
 *  - dismissOnEscape (bool): default true
 *  - initialFocusRef (ref opcional al elemento a enfocar al abrir)
 *  - children
 */
export default function Dialog({
  open,
  onClose,
  ariaLabel,
  ariaLabelledBy,
  width = "min(640px, 100%)",
  maxHeight = "70vh",
  alignTop = true,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  initialFocusRef,
  children,
}) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;

    const t = setTimeout(() => {
      const target = initialFocusRef?.current
        || dialogRef.current?.querySelector(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        || dialogRef.current;
      target?.focus?.();
    }, 30);

    return () => {
      clearTimeout(t);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        try { prev.focus(); } catch (_e) { /* noop */ }
      }
      previousFocusRef.current = null;
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  const handleKeyDown = (e) => {
    if (e.key === "Escape" && dismissOnEscape) {
      e.preventDefault();
      onClose?.();
      return;
    }
    if (e.key === "Tab") {
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={dismissOnBackdrop ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(13,17,23,0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: alignTop ? "flex-start" : "center",
        justifyContent: "center",
        paddingTop: alignTop ? "12vh" : 20,
        paddingBottom: 20,
        paddingLeft: 20,
        paddingRight: 20,
        animation: "fadeIn 0.15s ease both",
        cursor: dismissOnBackdrop ? "pointer" : "default",
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width,
          maxHeight,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          cursor: "default",
          outline: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
