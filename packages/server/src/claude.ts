/**
 * The bridge to Claude, via the `claude` CLI rather than the Anthropic API.
 *
 * There is no API key anywhere in this project. Inference goes through the CLI,
 * which is already authenticated with the user's own Claude account. The cost of
 * that choice is spelled out here rather than discovered later:
 *
 *  - Latency is ~4.5s per call, almost all of it CLI startup rather than
 *    inference. Fine behind a spinner for drafting a paragraph; far too slow to
 *    put in front of short-field suggestions, which is why those are matched
 *    deterministically and never reach this file.
 *
 *  - Claude Code injects its own scaffolding into every prompt, and it is by
 *    far the largest thing in the request. Our own system prompt and draft
 *    prompt together are ~1.4k tokens; the scaffolding is 25-40k. Re-measured
 *    24-ago-2026 on CLI 2.1.241, with 135 skills and 28 agents enabled in the
 *    user's global config:
 *
 *        haiku   29,358 total input   (skill listing arrives as names only)
 *        opus    39,650 total input   (skill listing arrives with full
 *                                      descriptions - 34k chars on its own)
 *
 *    A real draft prompt puts the opus path at 41,081-41,102. The numbers this
 *    header used to carry (25,941 total, fresh=10, cache_read=25,931) were
 *    measured on haiku on 22-ago-2026. Against them the haiku path has grown
 *    13% in two days and the opus path - the one drafting actually uses - is
 *    53% higher and was never what those numbers described.
 *
 *  - Prompt caching still works, and is still the only reason this is
 *    affordable. Three identical opus calls back-to-back, 24-ago-2026:
 *
 *        #1  fresh=2  write=14,844  read=24,804   $0.1610
 *        #2  fresh=2  write=0       read=39,648   $0.0199
 *        #3  fresh=2  write=0       read=39,648   $0.0199
 *
 *    What the cache does not survive is the scaffolding changing underneath
 *    it. The skill and agent inventory is read live from the user's global
 *    settings and plugin marketplaces on every invocation, so editing a
 *    local-directory marketplace, or a git marketplace refreshing, rewrites
 *    the prefix. Observed that morning: 134 skills at 11:41, 135 at 11:42,
 *    cache_read=0 on both, the full 41,079 written at the 1h-TTL rate - $0.39
 *    for one draft against $0.02 warm. The ledger's first 10 calls average
 *    $0.18, which is what that mix costs in aggregate.
 *
 *    The isolated cwd does not defend against this: the scaffolding comes from
 *    user-level config, not from the cwd. It still earns its keep by keeping
 *    CLAUDE.md and auto-memory out of the prompt. (An older note here claimed
 *    the isolated cwd was a 4.5x saving, from misreading
 *    cache_creation_input_tokens as the total. It is not.)
 *
 *  - Two flags do defend against it, and `ask` now passes both. Measured
 *    24-ago-2026, one call per variant:
 *
 *                                          haiku             opus
 *        (neither)                         29,358            39,650
 *        --disable-slash-commands          26,030            28,645
 *        --setting-sources project,local   26,325            28,850
 *        both together                     23,989            25,611
 *
 *    On opus that is a 35% cut, and the warm cost of a draft goes from $0.0199
 *    to $0.0129. But the token count is the smaller half of the argument.
 *    `--setting-sources project,local` stops the CLI reading user-level
 *    settings, which is where `enabledPlugins` lives - so the skill and agent
 *    listings leave the prompt entirely, and with them the thing that kept
 *    invalidating the cache. Editing a plugin marketplace no longer reprices
 *    the next draft.
 *
 *    `--disable-slash-commands` is still worth its own line on top of that:
 *    some skills ship with the CLI rather than coming from user config, and
 *    that flag is what removes those. Neither flag costs anything here - we ask
 *    for plain text with `--allowedTools ""` and never invoke a skill.
 *
 *  - `--bare` would cut more still, but it forces ANTHROPIC_API_KEY auth and
 *    never reads OAuth or the keychain, so it cannot be used here at all.
 *
 *  - There is no forced tool call and no output_config.format through the CLI,
 *    so structured output is a fenced JSON block, validated, with one repair
 *    retry. This is strictly weaker than a schema-enforced tool call and is the
 *    main thing given up for "no API key".
 *
 *  - Tokens draw on the same subscription quota as the user's own coding work.
 *    Callers record usage in the ledger so that cost is visible, not notional.
 */

import { execFile } from "node:child_process";

import { claudeAuth, forgetClaudeAuth } from "./claude-auth.ts";
import { assertSafeToSend } from "./egress.ts";
import { isolatedFiles, paths } from "./paths.ts";

export type ModelAlias = "opus" | "sonnet" | "haiku";

/** Model per job. Drafting is the product; matching just needs to be cheap. */
export const MODELS: Record<ModelAlias, string> = {
  opus: "claude-opus-5",
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5",
};

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  /**
   * What the same call would have cost at public API list prices. On a
   * subscription nothing is billed per call, so treat this as a quota proxy
   * rather than an invoice.
   */
  costUsd: number;
}

export interface ClaudeResult {
  text: string;
  usage: ClaudeUsage;
  durationMs: number;
  model: string;
}

export class ClaudeError extends Error {
  readonly kind: "not_installed" | "unauthenticated" | "timeout" | "failed" | "unparseable";
  readonly detail: string;
  constructor(kind: ClaudeError["kind"], message: string, detail = "") {
    super(message);
    this.name = "ClaudeError";
    this.kind = kind;
    this.detail = detail;
  }
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AskOptions {
  system: string;
  prompt: string;
  model?: ModelAlias;
  /**
   * Thinking depth.
   *
   * Left unset on every production path, but the reason is narrower than this
   * comment used to claim. It read: passing --effort invalidates the cached
   * prefix, $0.023 warm versus $0.380 with `--effort low`. The $0.380 is what
   * ANY first call with a changed request shape costs - a full cold write at
   * the 1h-TTL rate - so that measurement showed a cold cache, not a price of
   * thinking. Note also that the CLI already applies effort=high to opus by
   * default (visible in the transcripts as `effort: high`) without this flag,
   * and those calls warm to $0.0199. So the honest position as of
   * 24-ago-2026: changing this flag costs one cold write, and whether a
   * steady state at a different effort is cheaper or dearer was not
   * re-measured. Measure two identical calls, not one, before concluding.
   */
  effort?: Effort;
  /** Generous by default: a long draft at higher effort can genuinely take a while. */
  timeoutMs?: number;
  /** Escape hatch for tests. Never set in production paths. */
  skipEgressCheck?: boolean;
}

export interface CliJson {
  is_error?: boolean;
  result?: string;
  subtype?: string;
  /** Set to "api_error" when the CLI never reached the model at all. */
  terminal_reason?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * What the CLI itself said about the failure.
 *
 * A failed call still prints its result JSON on stdout: an expired OAuth
 * session exits 1 with an empty stderr and the reason in `result`. Reporting
 * only the exit status collapsed every one of those into the same opaque
 * "claude exited with an error", so the message is dug out of stdout first.
 */
export function cliMessage(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout) as CliJson;
    return typeof parsed.result === "string" ? parsed.result.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Authentication is the one failure here with a fix the user can act on, so it
 * gets its own kind and carries the remedy in the message. Matched on the text
 * because the CLI reports it as an ordinary non-zero exit.
 */
export function authFailure(said: string): ClaudeError | null {
  if (!/failed to authenticate|oauth|invalid api key|unauthorized/i.test(said)) return null;
  // The probe said "in" recently enough to be trusted, and it was wrong. Throw
  // the answer away so the status light and the next call both re-measure.
  forgetClaudeAuth();
  return new ClaudeError(
    "unauthenticated",
    `claude is not authenticated (${said}); run \`claude auth login\` and try again`,
    said,
  );
}

const execFileAsync = (file: string, args: string[], opts: { cwd: string; timeout: number }) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { cwd: opts.cwd, timeout: opts.timeout, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(Object.assign(err, { stdout, stderr }));
        resolve({ stdout, stderr });
      },
    );
    child.stdin?.end();
  });

/**
 * One Claude call. Args are passed as an array, never through a shell, so
 * nothing in the prompt can be interpreted as a command.
 */
export async function ask(opts: AskOptions): Promise<ClaudeResult> {
  const model = MODELS[opts.model ?? "opus"];

  // Layer 2 of the egress guard. Runs on the exact bytes about to leave the
  // machine, not on the pieces that were used to build them.
  if (!opts.skipEgressCheck) assertSafeToSend(`${opts.system}\n${opts.prompt}`);

  // Refuse before spending, not after. A lapsed session is the one failure that
  // is knowable in advance for ~0.24s and no quota, and finding out afterwards
  // costs a draft the user has already waited for - twice over, since the JSON
  // repair path would retry into the same dead session.
  const auth = await claudeAuth();
  if (auth.state === "out") {
    throw new ClaudeError(
      "unauthenticated",
      "claude is signed out; run `claude auth login` and try again",
      auth.account ? `last signed in as ${auth.account}` : "",
    );
  }

  const args = [
    "-p",
    opts.prompt,
    "--model",
    model,
    "--system-prompt",
    opts.system,
    // No tools: we want text back, not an agent loop.
    "--allowedTools",
    "",
    // Skip MCP server startup entirely. Worth a few hundred tokens and a
    // little latency; it is not where the 40k of scaffolding comes from.
    "--strict-mcp-config",
    "--mcp-config",
    isolatedFiles.mcp,
    // Disables hooks and project MCP servers.
    "--settings",
    isolatedFiles.settings,
    // The two lines that actually hold the prompt down. Between them they cut
    // total input per opus call from 39,650 to 25,611 - 35% - and, more to the
    // point, they take the user's global plugin config out of the prompt, which
    // is what was invalidating the cache. See the header.
    "--disable-slash-commands",
    "--setting-sources",
    "project,local",
    "--output-format",
    "json",
  ];

  if (opts.effort) args.push("--effort", opts.effort);

  const started = Date.now();
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("claude", args, {
      // The isolated cwd is the single highest-leverage line in this function.
      cwd: paths.isolated,
      timeout: opts.timeoutMs ?? 120_000,
    }));
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { killed?: boolean; stdout?: string; stderr?: string };
    if (e.code === "ENOENT") {
      throw new ClaudeError(
        "not_installed",
        "the `claude` CLI was not found on PATH; install Claude Code or add it to PATH",
      );
    }
    if (e.killed) {
      throw new ClaudeError("timeout", `claude did not respond within the timeout`);
    }
    const said = cliMessage(e.stdout ?? "");
    const auth = authFailure(said);
    if (auth) throw auth;
    throw new ClaudeError(
      "failed",
      said ? `claude exited with an error: ${said}` : "claude exited with an error",
      (said || e.stderr || "").slice(0, 2000),
    );
  }

  let parsed: CliJson;
  try {
    parsed = JSON.parse(stdout) as CliJson;
  } catch {
    throw new ClaudeError("unparseable", "claude did not return JSON", stdout.slice(0, 2000));
  }

  if (parsed.is_error || typeof parsed.result !== "string") {
    const said = typeof parsed.result === "string" ? parsed.result.trim() : "";
    const auth = authFailure(said);
    if (auth) throw auth;
    throw new ClaudeError(
      "failed",
      said
        ? `claude reported an error: ${said}`
        : `claude reported an error (${parsed.terminal_reason ?? parsed.subtype ?? "unknown"})`,
      said,
    );
  }

  const u = parsed.usage ?? {};
  return {
    text: parsed.result,
    model,
    durationMs: parsed.duration_ms ?? Date.now() - started,
    usage: {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
      costUsd: parsed.total_cost_usd ?? 0,
    },
  };
}

/** Total input tokens the call consumed, however they were counted. */
export function totalInputTokens(u: ClaudeUsage): number {
  return u.inputTokens + u.cacheCreationInputTokens + u.cacheReadInputTokens;
}

/**
 * Pull a JSON object out of a text response.
 *
 * Needed because there is no forced tool call through the CLI. Tries the whole
 * string, then a fenced block, then the outermost braces - in that order, so a
 * model that answers cleanly costs nothing extra.
 */
export function extractJson(text: string): unknown {
  const attempts: string[] = [text.trim()];

  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n?```/i.exec(text);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(text.slice(first, last + 1));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next shape
    }
  }
  throw new ClaudeError("unparseable", "no JSON object found in the response", text.slice(0, 2000));
}

/**
 * Ask for JSON, validate it, and retry once with the failure quoted back.
 *
 * The retry is the whole reason this wrapper exists: without a schema-enforced
 * tool call, a malformed response is a normal outcome rather than an exception,
 * so it needs a defined recovery rather than a thrown error.
 */
export async function askForJson<T>(
  opts: AskOptions & { validate: (value: unknown) => T },
): Promise<{ value: T; usage: ClaudeUsage; attempts: number; model: string }> {
  const first = await ask(opts);
  try {
    return { value: opts.validate(extractJson(first.text)), usage: first.usage, attempts: 1, model: first.model };
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    const retry = await ask({
      ...opts,
      prompt: [
        opts.prompt,
        "",
        "Your previous reply could not be used. The problem was:",
        why,
        "",
        "Reply again with only a single JSON object and no other text.",
      ].join("\n"),
    });
    const combined: ClaudeUsage = {
      inputTokens: first.usage.inputTokens + retry.usage.inputTokens,
      outputTokens: first.usage.outputTokens + retry.usage.outputTokens,
      cacheCreationInputTokens:
        first.usage.cacheCreationInputTokens + retry.usage.cacheCreationInputTokens,
      cacheReadInputTokens: first.usage.cacheReadInputTokens + retry.usage.cacheReadInputTokens,
      costUsd: first.usage.costUsd + retry.usage.costUsd,
    };
    return {
      value: opts.validate(extractJson(retry.text)),
      usage: combined,
      attempts: 2,
      model: retry.model,
    };
  }
}
