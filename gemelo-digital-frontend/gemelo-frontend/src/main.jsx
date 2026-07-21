import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Sentry (error tracking) — opcional ───────────────────────────────────────
// Solo se activa si VITE_SENTRY_DSN está definido en el build. Se carga con
// import() dinámico para que el bundle principal no crezca cuando no hay DSN.
// ErrorBoundary usa window.__gemeloSentry para reportar crashes de render.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
if (SENTRY_DSN) {
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        // Muestreo bajo de performance para no inflar la cuota gratuita
        tracesSampleRate: 0.1,
        // Nunca enviar PII por defecto
        sendDefaultPii: false,
      })
      window.__gemeloSentry = Sentry
    })
    .catch(() => {
      // Sin Sentry la app funciona igual — no es crítico
    })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
