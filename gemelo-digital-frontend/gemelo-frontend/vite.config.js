import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Análisis del bundle: `ANALYZE=1 npm run build` genera dist/stats.html
    // con el treemap de qué pesa cada dependencia. No afecta el build normal.
    process.env.ANALYZE
      ? visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true })
      : null,
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Vendors pesados en chunks propios: cambian con poca frecuencia,
        // así el navegador los cachea entre deploys (el hash solo cambia
        // cuando actualizamos la dependencia, no en cada release nuestro).
        // Nota: Vite 8 (Rolldown) exige la forma de función.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("recharts") || /node_modules[\\/]d3-/.test(id)) {
            return "vendor-recharts";
          }
          if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
  },
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
