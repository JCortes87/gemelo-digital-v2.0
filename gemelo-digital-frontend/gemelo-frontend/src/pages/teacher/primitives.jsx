// Átomos de UI del dashboard docente (extraído de TeacherDashboard.jsx, #15).
import React, { useState } from "react";
import ReactDOM from "react-dom";
import { normStatus, fmtPct } from "../../utils/helpers";
import { COLORS, STATUS_CONFIG } from "../../utils/colors";
/**
 * =========================
 * UI Atoms
 * =========================
 */

export function StatusBadge({ status }) {
  const s = normStatus(status);
  const cfg = STATUS_CONFIG[s] || {
    bg: "var(--pending-bg)",
    fg: "var(--muted)",
    dot: COLORS.pending,
    label: status || "—",
  };
  return (
    <span
      className="badge"
      style={{
        background: cfg.bg, color: cfg.fg,
        border: `1px solid ${cfg.dot}22`,
        fontWeight: 700, letterSpacing: "0.03em",
        padding: "4px 10px", fontSize: 11,
        borderRadius: 999,
      }}
    >
      <span
        className="pulse-dot"
        style={{ background: cfg.dot, width: 5, height: 5, borderRadius: "50%", display: "inline-block", flexShrink: 0 }}
      />
      {cfg.label}
    </span>
  );
}


// ─────────────────────────────────────────────
// CircularRing — SVG progress ring (CESA Curator style)
// ─────────────────────────────────────────────
export const CircularRing = React.memo(function CircularRing({ pct, size = 80, stroke = 8, color, label, sublabel, fontSize }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pctClamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const offset = circ - (circ * pctClamped) / 100;
  const ringColor = color || "var(--brand)";
  const textSize = fontSize || Math.round(size * 0.22);
  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      role="progressbar"
      aria-valuenow={Math.round(pctClamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={sublabel ? `${sublabel}: ${Math.round(pctClamped)}%` : `Progreso ${Math.round(pctClamped)}%`}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--border)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={ringColor} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: textSize, fontWeight: 900, fontFamily: "var(--font-mono)", color: ringColor, lineHeight: 1 }}>{label ?? `${Math.round(pctClamped)}%`}</span>
        {sublabel && <span style={{ fontSize: Math.round(textSize * 0.55), fontWeight: 700, color: "var(--muted)", marginTop: 1 }}>{sublabel}</span>}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
// ThresholdsModal — configurar umbrales de riesgo del curso (#13)
// ─────────────────────────────────────────────
export function ThresholdsModal({ current, base, isOverridden, onSave, onReset, onClose }) {
  const [crit, setCrit] = useState(Number(current?.critical ?? 50));
  const [watch, setWatch] = useState(Number(current?.watch ?? 70));
  const valid = watch >= crit;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Configurar umbrales de riesgo"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(13,17,23,0.65)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 100%)", background: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 16,
          boxShadow: "var(--shadow-lg)", padding: "20px 22px",
          fontFamily: "var(--font)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>
          Umbrales de riesgo del curso
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
          Define los porcentajes a partir de los cuales un estudiante se considera <b>en observación</b> o <b>crítico</b>. Se aplica solo a este curso.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: COLORS.critical, marginBottom: 4 }}>
              <span>Crítico (&lt; %)</span><span style={{ fontFamily: "var(--font-mono)" }}>{crit}%</span>
            </div>
            <input type="range" min={0} max={100} value={crit} onChange={(e) => setCrit(Number(e.target.value))} style={{ width: "100%" }} />
          </label>
          <label style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: COLORS.watch, marginBottom: 4 }}>
              <span>Observación (&lt; %)</span><span style={{ fontFamily: "var(--font-mono)" }}>{watch}%</span>
            </div>
            <input type="range" min={0} max={100} value={watch} onChange={(e) => setWatch(Number(e.target.value))} style={{ width: "100%" }} />
          </label>
        </div>

        {!valid && (
          <div style={{ marginTop: 10, fontSize: 11, color: COLORS.critical, fontWeight: 600 }}>
            El umbral de observación debe ser ≥ al crítico.
          </div>
        )}

        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 12 }}>
          Por defecto del sistema: crítico {base?.critical ?? 50}% · observación {base?.watch ?? 70}%
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
          {isOverridden && (
            <button
              onClick={onReset}
              style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)",
                background: "var(--bg)", color: "var(--muted)", fontSize: 12,
                fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)",
              }}
            >
              Restablecer
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--text)", fontSize: 12,
              fontWeight: 700, cursor: "pointer", fontFamily: "var(--font)",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave({ critical: crit, watch })}
            disabled={!valid}
            style={{
              padding: "8px 14px", borderRadius: 8, border: "none",
              background: valid ? "var(--brand)" : "var(--border)",
              color: "#fff", fontSize: 12, fontWeight: 800,
              cursor: valid ? "pointer" : "not-allowed", fontFamily: "var(--font)",
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export function Card({ title, right, children, className = "", style = {}, accent }) {
  return (
    <div
      className={`kpi-card ${className}`}
      style={{
        ...style,
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow)",
        border: `1px solid var(--border)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {accent && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `var(--${accent})`, borderRadius: "var(--radius-lg) var(--radius-lg) 0 0", zIndex: 1 }} />
      )}
      {(title || right) && (
        <div
          style={{
            // Banda de encabezado tipo dashboard: fondo suave de borde a borde
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12,
            background: "var(--bg)",
            margin: "-20px -20px 14px",
            padding: accent ? "13px 16px 10px" : "10px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em", lineHeight: 1.3, flex: 1, textAlign: "center" }}>
            {title}
          </div>
          {right != null && <div style={{ flexShrink: 0 }}>{right}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GaugeMeter — medidor semicircular tipo velocímetro (0–100%).
// Zonas de color configurables; aguja apunta al valor.
// ─────────────────────────────────────────────────────────────────────────────
export function GaugeMeter({ pct = 0, size = 180, zones, centerLabel, centerColor, sublabel }) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const stroke = 14;
  const w = size;
  const h = Math.round(size * 0.60);
  const cx = w / 2;
  const cy = h - 8;
  const r = w / 2 - stroke / 2 - 4;

  // 0% apunta a la izquierda, 100% a la derecha (barrido horario de 180°)
  const polar = (angleDeg, radius) => {
    const rad = (Math.PI * angleDeg) / 180;
    return [cx - radius * Math.cos(rad), cy - radius * Math.sin(rad)];
  };
  const arcPath = (fromPct, toPct) => {
    const [x1, y1] = polar((fromPct / 100) * 180, r);
    const [x2, y2] = polar((toPct / 100) * 180, r);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const zs = Array.isArray(zones) && zones.length
    ? zones
    : [
        { to: 20, color: "var(--ok)" },
        { to: 40, color: "var(--watch)" },
        { to: 100, color: "var(--critical)" },
      ];
  const needleAngle = (clamped / 100) * 180;
  const [nx, ny] = polar(needleAngle, r - stroke / 2 - 3);

  const bounds = [0, ...zs.map((z) => z.to)];
  const segments = zs.map((z, i) => ({ from: bounds[i], to: z.to, color: z.color }));

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Medidor: ${clamped.toFixed(0)}%`}>
        {segments.map((s) => (
          <path key={`${s.from}-${s.to}`} d={arcPath(s.from, s.to)} fill="none" stroke={s.color} strokeWidth={stroke} opacity={0.85} />
        ))}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text)" strokeWidth={3} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={5} fill="var(--text)" />
      </svg>
      {centerLabel != null && (
        <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "var(--font-mono)", lineHeight: 1.1, color: centerColor || "var(--text)", marginTop: 2 }}>
          {centerLabel}
        </div>
      )}
      {sublabel && (
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, textAlign: "center" }}>{sublabel}</div>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, valueColor }) {
  return (
    <div>
      {label ? (
        <div style={{
          fontSize: 10, color: "var(--muted)", fontWeight: 800,
          textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4,
        }}>
          {label}
        </div>
      ) : null}
      <div style={{
        fontSize: 30, color: valueColor || "var(--text)", fontWeight: 900,
        lineHeight: 1, letterSpacing: "-0.04em", fontFamily: "var(--font)",
      }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 5, fontWeight: 500, lineHeight: 1.4 }}>{sub}</div> : null}
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: "var(--border)", width: "100%", margin: "4px 0" }} />;
}

export function ProgressBar({ value, color, showLabel = false, animate = true }) {
  const pct = Math.max(0, Math.min(100, Number(value ?? 0)));
  const mountedRef = React.useRef(false);
  const [didMount, setDidMount] = React.useState(false);

  React.useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setDidMount(true);
    }
  }, []);

  const shouldAnimate = animate && didMount;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(148,163,184,0.15)", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div
          className={shouldAnimate ? "fill-bar" : ""}
          style={{
            "--target-w": `${pct}%`,
            width: shouldAnimate ? undefined : `${pct}%`,
            height: "100%",
            background: color || COLORS.brand,
            borderRadius: 999,
            transition: shouldAnimate ? undefined : "none",
          }}
        />
      </div>
      {showLabel && (
        <div style={{ position: "absolute", right: 0, top: -18, fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>
          {fmtPct(pct)}
        </div>
      )}
    </div>
  );
}

// Tooltip portal container — renders outside any overflow/transform ancestor
const _tooltipRoot = (() => {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("cesa-tooltip-portal");
  if (!el) {
    el = document.createElement("div");
    el.id = "cesa-tooltip-portal";
    el.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:999999;pointer-events:none;";
    document.body.appendChild(el);
  }
  return el;
})();

export function InfoTooltip({ text }) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef(null);
  const tooltipRef = React.useRef(null);
  const [pos, setPos] = React.useState({ top: -9999, left: -9999 });

  if (!String(text || "").trim()) return null;

  const TW = 260; // tooltip width
  const GAP = 7;

  const calcPos = React.useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    // center horizontally over the ? button
    let left = r.left + r.width / 2 - TW / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - TW - 10));

    // measure real height after render, default 72px estimate
    const h = (tooltipRef.current?.offsetHeight) || 72;
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    let top;
    if (spaceAbove >= h + GAP + 10 || spaceAbove >= spaceBelow) {
      top = r.top - h - GAP;
    } else {
      top = r.bottom + GAP;
    }
    setPos({ top, left });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    calcPos();
    // re-measure after paint (tooltip may have rendered with wrong height)
    const raf = requestAnimationFrame(calcPos);
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open, calcPos]);

  // Portal content
  const tooltipNode = open && _tooltipRoot
    ? ReactDOM.createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: TW,
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)",
            borderRadius: 10,
            padding: "9px 12px",
            color: "var(--text)",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.5,
            pointerEvents: "none",
            animation: "fadeUp 0.15s ease both",
          }}
        >
          {text}
        </div>,
        _tooltipRoot
      )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        style={{ display: "inline-flex", flex: "0 0 auto", verticalAlign: "middle" }}
        onMouseEnter={() => { setOpen(true); }}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
      >
        <span
          role="button"
          tabIndex={0}
          aria-label="Ver descripción"
          style={{
            display: "inline-flex", width: 16, height: 16, borderRadius: 999,
            alignItems: "center", justifyContent: "center",
            border: "1px solid var(--border2)", color: "var(--muted)",
            fontSize: 10, fontWeight: 900, cursor: "help",
            background: "var(--card)", lineHeight: 1,
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border2)"; e.currentTarget.style.color = "var(--muted)"; }}
        >
          ?
        </span>
      </span>
      {tooltipNode}
    </>
  );
}

export function SortTh({ label, active, dir, onClick, title }) {
  return (
    <th
      onClick={onClick}
      title={title}
      style={{
        padding: "10px 12px",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontSize: 10,
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: active ? "var(--brand)" : "var(--muted)",
        transition: "color 0.15s",
      }}
    >
      {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </th>
  );
}

export function CoverageBars({ donePct, pendingPct, overduePct, openPct }) {
  const d  = Math.max(0, Math.min(100, Number(donePct   ?? 0)));
  const p  = Math.max(0, Math.min(100, Number(pendingPct ?? 0)));
  const ov = Math.max(0, Math.min(100, Number(overduePct ?? 0)));
  // openPct puede pasarse explícitamente; si no, se calcula como residuo
  const op = openPct != null
    ? Math.max(0, Math.min(100, Number(openPct)))
    : Math.max(0, 100 - d - p - ov);

  const BarRow = ({ label, value, color, tooltip }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }} title={tooltip}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          fontSize: 11, color: "var(--muted)", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.04em",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
          {label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 800, fontFamily: "var(--font-mono)" }}>
          {value.toFixed(1)}%
        </div>
      </div>
      <ProgressBar value={value} color={color} animate={false} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Índice de actividades evaluadas y retroalimentadas
      </div>
      <BarRow label="Calificado" value={d} color={COLORS.ok}
        tooltip="Ítems con nota numérica publicada en el gradebook." />
      <BarRow label="Pendiente calificación" value={p} color={COLORS.brand}
        tooltip="El estudiante entregó pero el docente aún no ha publicado nota numérica." />
      {op > 0.5 && (
        <BarRow label="Sin entregar (abierto)" value={op} color={COLORS.pending}
          tooltip="Sin nota, sin señal de entrega, y la fecha de vencimiento aún no ha llegado." />
      )}
      <BarRow
        label="Vencido sin registro"
        value={ov}
        color={ov > 0 ? COLORS.critical : "rgba(148,163,184,0.4)"}
        tooltip="Sin nota, sin entrega registrada, y la fecha de vencimiento ya pasó. Requiere acción docente."
      />
    </div>
  );
}



// ─────────────────────────────────────────────────────────────────────────────
// OnboardingTutorial — Tutorial de primera vez para el docente
// Aparece solo una vez (controlado por localStorage "gemelo_onboarded")
// ─────────────────────────────────────────────────────────────────────────────
