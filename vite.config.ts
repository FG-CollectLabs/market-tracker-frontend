import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiTarget = env.VITE_API_URL ?? "http://localhost:8080";
  const isGhPages = env.VITE_GH_PAGES === "1";
  return {
    base: isGhPages ? "/market-tracker-frontend/" : "/",
    plugins: [react()],
    server: {
      port: 5175,
      proxy: {
        "/v1": { target: apiTarget, changeOrigin: true },
        "/healthz": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
