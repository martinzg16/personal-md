import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Brío",
    description:
      "Recognises form questions you have answered before and drafts new answers in your own voice, from a PERSONAL.md you own.",
    version: "0.1.0",
    permissions: [
      // The profile mirror, the server token, and per-site dismissals.
      "storage",
      // A periodic check of whether the CLI session is still alive, so a lapsed
      // one shows on the icon instead of being discovered by a failed draft.
      // MV3 stops any timer with the worker, so this has to be an alarm.
      "alarms",
    ],
    // Only the companion process on loopback. No remote hosts at all: there is
    // no API key in this extension and nothing it needs to reach on the web.
    host_permissions: ["http://127.0.0.1/*"],
    options_ui: { open_in_tab: true },
    /*
     * The panel's two faces, and nothing else.
     *
     * A content script's shadow root can only load a font the manifest has made
     * reachable from the host page. Narrowed to the four files rather than the
     * whole of `public/`, and `use_dynamic_url` rotates the token per session so
     * a page cannot probe for a stable extension id by asking for a known asset.
     */
    web_accessible_resources: [
      {
        resources: ["/fonts/instrument*.woff2"],
        matches: ["<all_urls>"],
        use_dynamic_url: true,
      },
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
