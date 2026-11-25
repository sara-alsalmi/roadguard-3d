import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";


// Deploy path: "/" locally; for GitHub Pages the workflow sets VITE_BASE=/<repo-name>/
const BASE = (process.env.VITE_BASE ?? "/").replace(/\/?$/, "/");

// Cesium needs its Workers / Assets / ThirdParty / Widgets served statically.
export default defineConfig({
  base: BASE,
  define: { CESIUM_BASE_URL: JSON.stringify(BASE + "cesium") },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8000" } },
  build: { chunkSizeWarningLimit: 6000 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
