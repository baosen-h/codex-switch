import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: Number(process.env.VITE_PORT ?? 4173),
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
