import { loadOrCreateToken } from "./auth.ts";
import { paths } from "./paths.ts";
import { DEFAULT_PORT, start } from "./server.ts";

const port = Number(process.env["PERSONAL_MD_PORT"] ?? DEFAULT_PORT);

const { close } = await start(port);
const token = await loadOrCreateToken();

console.log(`personal-md server listening on http://127.0.0.1:${port}`);
console.log(`profile: ${paths.profile}`);
console.log("");
console.log("Paste this token into the extension options page:");
console.log(`  ${token}`);
console.log("");
console.log("(it is also at " + paths.token + ")");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void close().then(() => process.exit(0));
  });
}
