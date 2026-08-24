import { loadOrCreateToken } from "./auth.ts";
import { canLapse, claudeAuth } from "./claude-auth.ts";
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

/*
 * Say whether drafting can actually work, at the one moment someone is looking
 * at this output. A lapsed CLI session is invisible until a draft dies on it,
 * and the fix needs a terminal - which is where this line already is.
 */
const auth = await claudeAuth();
console.log("");
if (auth.state === "out") {
  console.log("! claude is signed out, so drafting will fail. Run: claude auth login");
} else if (auth.state === "unknown") {
  console.log(`? could not check the claude session (${auth.reason ?? "unknown"}); drafting may fail`);
} else {
  console.log(`claude: signed in${auth.account ? ` as ${auth.account}` : ""} (${auth.method ?? "unknown method"})`);
  if (canLapse(auth)) {
    // Naming the fix here, next to the fact, is the only way it gets found: the
    // person reading this line is already in a terminal.
    console.log("  this kind of session can expire mid-use. To stop that happening:");
    console.log("    claude setup-token   then export CLAUDE_CODE_OAUTH_TOKEN=... before starting this server");
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void close().then(() => process.exit(0));
  });
}
