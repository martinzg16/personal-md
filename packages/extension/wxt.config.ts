import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "personal-md",
    description:
      "Recognises form questions you have answered before and drafts new answers in your own voice, from a PERSONAL.md you own.",
    version: "0.1.0",
    permissions: [
      // The profile mirror, the server token, and per-site dismissals.
      "storage",
    ],
    // Only the companion process on loopback. No remote hosts at all: there is
    // no API key in this extension and nothing it needs to reach on the web.
    host_permissions: ["http://127.0.0.1/*"],
    options_ui: { open_in_tab: true },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
