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
 *  - Claude Code injects ~26k input tokens of its own scaffolding per call, and
 *    that does not go away. What makes it affordable is that essentially all of
 *    it comes back as a prompt-cache READ (measured: fresh_input=10,
 *    cache_read=25,931), billed at roughly a tenth of fresh input - so a call
 *    lands around $0.003 on Haiku rather than $0.03.
 *
 *    The isolated cwd plus --strict-mcp-config plus --settings takes the total
 *    from ~29.9k to ~25.9k: a real 13% saving, worth keeping because it costs
 *    nothing, but not the thing that makes this viable. (An earlier note here
 *    claimed 4.5x, from misreading cache_creation_input_tokens as the total.
 *    See the header of test/claude.live.test.ts.)
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
  readonly kind: "not_installed" | "timeout" | "failed" | "unparseable";
  readonly detail: string;
  constructor(kind: ClaudeError["kind"], message: string, detail = "") {
    super(message);
    this.name = "ClaudeError";
    this.kind = kind;
    this.detail = detail;
  }
}

export interface AskOptions {
  system: string;
  prompt: string;
  model?: ModelAlias;
  /** Generous by default: a long draft at higher effort can genuinely take a while. */
  timeoutMs?: number;
  /** Escape hatch for tests. Never set in production paths. */
  skipEgressCheck?: boolean;
}

interface CliJson {
  is_error?: boolean;
  result?: string;
  subtype?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
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
    // Skip MCP server startup entirely. Part of the 26k -> 5.7k reduction.
    "--strict-mcp-config",
    "--mcp-config",
    isolatedFiles.mcp,
    // Disables hooks and project MCP servers.
    "--settings",
    isolatedFiles.settings,
    "--output-format",
    "json",
  ];

  const started = Date.now();
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("claude", args, {
      // The isolated cwd is the single highest-leverage line in this function.
      cwd: paths.isolated,
      timeout: opts.timeoutMs ?? 120_000,
    }));
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { killed?: boolean; stderr?: string };
    if (e.code === "ENOENT") {
      throw new ClaudeError(
        "not_installed",
        "the `claude` CLI was not found on PATH; install Claude Code or add it to PATH",
      );
    }
    if (e.killed) {
      throw new ClaudeError("timeout", `claude did not respond within the timeout`);
    }
    throw new ClaudeError("failed", "claude exited with an error", (e.stderr ?? "").slice(0, 2000));
  }

  let parsed: CliJson;
  try {
    parsed = JSON.parse(stdout) as CliJson;
  } catch {
    throw new ClaudeError("unparseable", "claude did not return JSON", stdout.slice(0, 2000));
  }

  if (parsed.is_error || typeof parsed.result !== "string") {
    throw new ClaudeError("failed", `claude reported an error (${parsed.subtype ?? "unknown"})`);
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
