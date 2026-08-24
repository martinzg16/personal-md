/**
 * On-disk layout, and the permissions it is created with.
 *
 * Everything lives under ~/.personal-md rather than inside the repo. The file
 * holds a NIF, a phone number and an address; a gitignored file inside a git
 * repo is one `git add -f`, or one tooling change, away from being public.
 *
 * Paths are resolved lazily through getters rather than captured at module
 * load, so PERSONAL_MD_HOME can be changed after import. That keeps the store
 * testable against a fresh temp directory per test, and lets a launcher point
 * a second instance somewhere else without a rebuild.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { chmod, mkdir } from "node:fs/promises";

export function root(): string {
  return process.env["PERSONAL_MD_HOME"] ?? join(homedir(), ".personal-md");
}

export const paths = {
  get root(): string {
    return root();
  },
  /** The source of truth. Human-readable, hand-editable. */
  get profile(): string {
    return join(root(), "PERSONAL.md");
  },
  /** Values withheld from every prompt. Never rendered into PERSONAL.md. */
  get secrets(): string {
    return join(root(), "secrets.json");
  },
  /** Machine state with no meaning to a reader: site memory, spend ledger. */
  get index(): string {
    return join(root(), "index.json");
  },
  /** Shared secret the extension presents on every request. */
  get token(): string {
    return join(root(), "token");
  },
  /**
   * An empty directory used as the cwd for every `claude` invocation.
   *
   * Keeps CLAUDE.md discovery and auto-memory out of the prompt. That is all it
   * does, and it is worth having for that alone. It never held down the bulk of
   * the per-call input: the skill and agent listings came from the user's global
   * config, which the cwd has no bearing on. Those are now excluded by flags in
   * claude.ts instead, taking total input per call to 23,989 on haiku and 25,611
   * on opus (measured 24-ago-2026, CLI 2.1.241; it was 29,358 and 39,650 before
   * the flags, and this comment once claimed ~25.9k for both). What makes it
   * cheap is the prompt cache. See the header of test/claude.live.test.ts.
   */
  get isolated(): string {
    return join(root(), "isolated");
  },
} as const;

/** Files inside `isolated` that pin the low-overhead invocation. */
export const isolatedFiles = {
  get mcp(): string {
    return join(paths.isolated, "mcp.json");
  },
  get settings(): string {
    return join(paths.isolated, "settings.json");
  },
} as const;

export const MCP_CONFIG = { mcpServers: {} };
export const CLAUDE_SETTINGS = { disableAllHooks: true, enableAllProjectMcpServers: false };

/**
 * Create the directory tree with restrictive permissions.
 *
 * mkdir's `mode` is masked by the process umask, so chmod is applied explicitly
 * afterwards rather than relying on the mode argument alone.
 */
export async function ensureDirs(): Promise<void> {
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await chmod(paths.root, 0o700);
  await mkdir(paths.isolated, { recursive: true, mode: 0o700 });
  await chmod(paths.isolated, 0o700);
}
