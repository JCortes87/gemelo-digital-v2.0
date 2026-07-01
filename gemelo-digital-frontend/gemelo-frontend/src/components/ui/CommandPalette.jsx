import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, ChevronRight } from "lucide-react";

/**
 * Command palette modal (like Ctrl+K in VSCode/Linear).
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   commands: [{ id, label, hint, icon, group, action }]
 *
 * The user types to filter, arrow keys to navigate, Enter to execute,
 * Escape to close.
 */
export default function CommandPalette({ open, onClose, commands = [] }) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const hay = `${c.label} ${c.hint || ""} ${c.group || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, commands]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIdx];
      if (cmd) {
        cmd.action?.();
        onClose?.();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose?.();
    } else if (e.key === "Tab") {
      // Focus trap — keep Tab cycling within the dialog
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

  if (!open) return null;

  // Group commands by `group` field
  const grouped = {};
  filtered.forEach((c, originalIdx) => {
    const g = c.group || "General";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push({ ...c, _originalIdx: filtered.indexOf(c) });
  });

  return (
    <div
      role="dialog"
      aria-label="Paleta de comandos"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(13,17,23,0.65)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh", paddingLeft: 20, paddingRight: 20,
        animation: "fadeIn 0.15s ease both",
      }}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: "min(640px, 100%)",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          maxHeight: "70vh",
        }}
      >
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
        }}>
          <Search size={18} strokeWidth={2.2} style={{ color: "var(--muted)" }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un comando o busca un estudiante..."
            aria-label="Buscar comando"
            style={{
              flex: 1, border: "none", outline: "none",
              background: "transparent", color: "var(--text)",
              fontSize: 15, fontWeight: 500,
              fontFamily: "var(--font)",
            }}
          />
          <span style={{
            fontSize: 9, fontWeight: 800, color: "var(--muted)",
            padding: "3px 7px", borderRadius: 5,
            background: "var(--bg)", border: "1px solid var(--border)",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>ESC</span>
        </div>

        {/* Results list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              Sin resultados para "{query}"
            </div>
          ) : (
            Object.entries(grouped).map(([groupName, items]) => (
              <div key={groupName}>
                <div style={{
                  padding: "8px 18px 4px",
                  fontSize: 10, fontWeight: 800, color: "var(--muted)",
                  textTransform: "uppercase", letterSpacing: "0.08em",
                }}>
                  {groupName}
                </div>
                {items.map((cmd) => {
                  const isActive = cmd._originalIdx === activeIdx;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action?.();
                        onClose?.();
                      }}
                      onMouseEnter={() => setActiveIdx(cmd._originalIdx)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        width: "100%", padding: "10px 18px",
                        background: isActive ? "var(--brand-light)" : "transparent",
                        border: "none", cursor: "pointer", textAlign: "left",
                        fontSize: 13, fontFamily: "var(--font)",
                        color: isActive ? "var(--brand)" : "var(--text)",
                      }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0, display: "flex", alignItems: "center" }}>
                        {cmd.icon
                          ? (typeof cmd.icon === "function"
                              ? <cmd.icon size={16} strokeWidth={2.2} />
                              : cmd.icon)
                          : <ChevronRight size={16} strokeWidth={2.4} />}
                      </span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{cmd.label}</span>
                      {cmd.hint && (
                        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                          {cmd.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: "8px 18px",
          borderTop: "1px solid var(--border)",
          fontSize: 10, color: "var(--muted)", fontWeight: 600,
          display: "flex", gap: 14,
        }}>
          <span>↑↓ Navegar</span>
          <span>↵ Seleccionar</span>
          <span>Esc Cerrar</span>
          <span style={{ marginLeft: "auto" }}>{filtered.length} resultado{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
