import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { renderApiPlugin } from "./render-api-plugin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  root,
  plugins: [react(), renderApiPlugin()],
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1421, strictPort: true, watch: { ignored: ["**/src-tauri/**", "**/video-output/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "chrome105", minify: "esbuild" },
});
