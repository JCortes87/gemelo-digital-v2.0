import React, { useEffect } from "react";
import { injectStyles } from "../../styles/global";

/**
 * CesaLoader — pantalla de carga con branding CESA.
 *
 * Se usa consistentemente para:
 *  - Fallback de Suspense entre rutas (App.jsx)
 *  - Carga inicial de datos del curso (TeacherDashboard, StudentPortal, etc.)
 *
 * Animaciones definidas en styles/global.js (cesaLogoBreath, cesaOrbit,
 * cesaShimmerText, cesaDotRise, cesaBarProgress, cesaCardIn).
 *
 * Respeta `prefers-reduced-motion` desactivando todas las animaciones.
 *
 * Props:
 *   title    — encabezado principal (default: "Gemelo Digital")
 *   subtitle — texto en mayúsculas antes de los puntos (default: "Cargando")
 *   footer   — texto pequeño bajo la barra de progreso (opcional)
 */
export default function CesaLoader({
  title = "Gemelo Digital",
  subtitle = "Cargando",
  footer = null,
}) {
  useEffect(() => { injectStyles(); }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={`${subtitle} ${title}`}
      className="cesa-loader-root"
    >
      <div className="cesa-loader-card">
        <div className="cesa-loader-logo-wrap">
          <span className="cesa-loader-ring outer" aria-hidden="true" />
          <span className="cesa-loader-ring" aria-hidden="true" />
          <div className="cesa-loader-logo">CESA</div>
        </div>
        <h1 className="cesa-loader-title">{title}</h1>
        <div className="cesa-loader-subtitle">{subtitle}</div>
        <div className="cesa-loader-dots" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="cesa-loader-bar" aria-hidden="true" />
        {footer && (
          <div style={{
            fontSize: 11, color: "var(--muted)", marginTop: 14,
            fontWeight: 500, lineHeight: 1.5, maxWidth: 320, marginLeft: "auto", marginRight: "auto",
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
