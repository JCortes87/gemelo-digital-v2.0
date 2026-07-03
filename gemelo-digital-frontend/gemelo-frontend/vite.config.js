import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Todo lo que sea API va al backend local (HTTPS con cert autofirmado).
      // secure:false → el proxy de Node acepta el certificado autofirmado.
      "/gemelo": { target: "https://localhost:8000", secure: false },
      "/brightspace": { target: "https://localhost:8000", secure: false },
      "/auth": { target: "https://localhost:8000", secure: false },
      "/lti": { target: "https://localhost:8000", secure: false },
      "/health": { target: "https://localhost:8000", secure: false },
      "/debug": { target: "https://localhost:8000", secure: false },
      "/.well-known": { target: "https://localhost:8000", secure: false },
      "/speech": { target: "https://localhost:8000", secure: false },
    },
    // SPA fallback: redirect all non-API routes to index.html for BrowserRouter
    historyApiFallback: true,
  },
})
