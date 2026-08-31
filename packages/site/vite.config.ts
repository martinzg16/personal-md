import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages serves this under /personal-md/, not at the root. The workflow
  // sets BASE_PATH; dev and any root-served host keep "/".
  base: process.env.BASE_PATH ?? "/",
  server: { port: 5602, host: "127.0.0.1" },
  build: { outDir: "dist" },
});
