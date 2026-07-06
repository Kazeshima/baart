import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderApiPlugin } from "./video/render-api-plugin.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command !== "build" ? [renderApiPlugin()] : [])],
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1421, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "chrome105",
    minify: "esbuild",
    rollupOptions: { input: { main: resolve(root, "index.html"), video: resolve(root, "video.html") } },
  },
}));
