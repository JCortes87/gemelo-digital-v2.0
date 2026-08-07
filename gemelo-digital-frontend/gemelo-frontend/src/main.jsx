import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Recuperación automática tras un deploy ───────────────────────────────────
// Cada deploy cambia el hash de los chunks JS. Un navegador que aún tiene el
// index.html anterior (típico dentro del iframe LTI de Brightspace) pide un
// chunk que ya no existe y el import dinámico falla con "error loading
// dynamically imported module". Vite emite 'vite:preloadError' en ese caso:
// recargamos una sola vez para traer el index.html nuevo. El guard de
// sessionStorage evita un bucle de recargas si el error persistiera por otra
// causa (ahí sí se deja pasar al ErrorBoundary).
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'gemelo_chunk_reload_at'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 60_000) return
  sessionStorage.setItem(KEY, String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

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
