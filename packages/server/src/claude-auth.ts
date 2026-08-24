/**
 * Is the `claude` CLI signed in right now?
 *
 * This exists because of a real failure: two drafts died with
 * "Failed to authenticate: OAuth session expired and could not be refreshed",
 * and the only way to find out was after the fact, from an opaque 502, with the
 * written answer already lost. The session can lapse between one draft and the
 * next, so the state has to be checkable before the expensive call rather than
 * inferred from its wreckage.
 *
 * `claude auth status --json` is the right instrument for it: it reports
 * `loggedIn` without running any inference, so it spends no quota, and it
 * answers in ~0.24s warm against ~5-40s for a draft. Cheap enough to ask before
 * every call and to hang a status light off.
 *
 * The result is three-valued on purpose. "unknown" is not a synonym for signed
 * out: if the check itself cannot run - CLI missing, output shape changed under
 * us - the answer must not be to block drafting. A broken probe should degrade
 * to the old behaviour, where the call is attempted and its own error speaks,
 * never to a self-inflicted outage.
 */

import { execFile } from "node:child_process";

import { paths } from "./paths.ts";

export type SignedIn = "in" | "out" | "unknown";

export interface ClaudeAuth {
  state: SignedIn;
  /** How the CLI is authenticated ("claude.ai", "apiKey"...). Absent when unknown. */
  method?: string;
  /** Which account, for a UI that has to say *whose* session lapsed. */
  account?: string;
  /** Why the probe could not answer. Only set when state is "unknown". */
  reason?: string;
  checkedAt: number;
}

interface StatusJson {
  loggedIn?: boolean;
  authMethod?: string;
  email?: string;
}

/**
 * How long an answer is trusted - and deliberately not the same both ways.
 *
 * "Signed in" holds for a minute: long enough that a page full of fields costs
 * one probe rather than twenty, short enough that a session going stale surfaces
 * while the user is still on the form rather than at the next restart.
 *
 * "Signed out" holds for seconds, because by then someone is *waiting* on the
 * answer changing. A held draft resumes as soon as this stops saying no, so a
 * minute of cached refusal would add a minute of staring at a panel after the
 * `claude auth login` that already fixed it. The asymmetry is the difference
 * between a retry that feels automatic and one that feels broken.
 */
const TTL_IN_MS = 60_000;
const TTL_OUT_MS = 5_000;
const PROBE_TIMEOUT_MS = 15_000;

function ttlFor(state: SignedIn): number {
  return state === "in" ? TTL_IN_MS : TTL_OUT_MS;
}

let cached: ClaudeAuth | null = null;

const probe = () =>
  new Promise<string>((resolve, reject) => {
    const child = execFile(
      "claude",
      ["auth", "status", "--json"],
      { cwd: paths.isolated, timeout: PROBE_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        // A non-zero exit still prints usable JSON in some states, so stdout is
        // preferred over the exit code and only an empty stdout is a failure.
        if (err && !stdout.trim()) return reject(err);
        resolve(stdout);
      },
    );
    child.stdin?.end();
  });

/** Read the signed-in state, reusing a recent answer unless `force` is set. */
export async function claudeAuth(opts: { force?: boolean } = {}): Promise<ClaudeAuth> {
  const now = Date.now();
  if (!opts.force && cached && now - cached.checkedAt < ttlFor(cached.state)) return cached;

  let out: string;
  try {
    out = await probe();
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const reason =
      e.code === "ENOENT" ? "the `claude` CLI was not found on PATH" : (e.message ?? "the check failed");
    return (cached = { state: "unknown", reason, checkedAt: now });
  }

  let parsed: StatusJson;
  try {
    parsed = JSON.parse(out) as StatusJson;
  } catch {
    return (cached = { state: "unknown", reason: "`claude auth status` did not return JSON", checkedAt: now });
  }

  if (typeof parsed.loggedIn !== "boolean") {
    return (cached = { state: "unknown", reason: "`claude auth status` did not report loggedIn", checkedAt: now });
  }

  return (cached = {
    state: parsed.loggedIn ? "in" : "out",
    ...(parsed.authMethod ? { method: parsed.authMethod } : {}),
    ...(parsed.email ? { account: parsed.email } : {}),
    checkedAt: now,
  });
}

/**
 * Drop the cached answer.
 *
 * Called when a call fails on authentication, so the next probe measures rather
 * than repeating a stale "signed in" for the rest of the minute - that lag is
 * exactly what would let a second draft be typed into a session that is already
 * gone.
 */
export function forgetClaudeAuth(): void {
  cached = null;
}

/**
 * Can this way of being signed in lapse on its own?
 *
 * An interactive `claude.ai` session is the fragile one: it expires and, when
 * the refresh also fails, drafting dies with no warning. A long-lived token
 * (`claude setup-token`, exported as CLAUDE_CODE_OAUTH_TOKEN) reports
 * "oauth_token" instead and does not lapse, and an API key does not either. The
 * distinction is worth naming because it is the difference between mitigating
 * this failure and removing it.
 */
export function canLapse(auth: ClaudeAuth): boolean {
  return auth.state === "in" && (auth.method ?? "claude.ai") === "claude.ai";
}

/** Test seam. Never used in production paths. */
export function setClaudeAuthForTests(value: ClaudeAuth | null): void {
  cached = value;
}
