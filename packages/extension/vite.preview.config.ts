/**
 * Visual harness for the options document.
 *
 * The options page cannot run outside an extension context, but its design can be
 * verified faithfully by mounting the real component tree against the real
 * compiled stylesheet with the `chrome` APIs stubbed. This config exists only for
 * that: it is never part of a build, and `wxt build` does not read it.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "test/preview",
  publicDir: "../../public",
  plugins: [react(), tailwindcss()],
  server: { port: 5601, host: "127.0.0.1" },
});
