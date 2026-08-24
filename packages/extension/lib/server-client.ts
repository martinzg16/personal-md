/**
 * Talking to the companion process.
 *
 * Every failure mode is a distinct, named state rather than a generic error. The
 * user-visible difference matters: "the server is not running" needs a start
 * command, "the token is wrong" needs a paste from ~/.personal-md/token, and
 * "no token yet" needs first-run setup. Collapsing those into "something went
 * wrong" is what makes a local-companion design feel broken.
 */

import type { Answer, Genre, Lang, Profile } from "@personal-md/core";

import { settings } from "./settings.ts";

export type ConnectionState =
  | { kind: "ok"; port: number }
  /**
   * The server is up and the token is fine, but the `claude` CLI it drives is
   * signed out - so everything works except drafting. Distinct from every other
   * state because the remedy is a different command in a different place, and
   * because it is worth saying *before* an answer is typed and lost.
   */
  | { kind: "claude_signed_out"; port: number }
  | { kind: "no_token" }
  | { kind: "server_down"; port: number }
  | { kind: "unauthorised"; port: number }
  | { kind: "error"; message: string };

export class ServerError extends Error {
  readonly state: ConnectionState;
  constructor(state: ConnectionState, message: string) {
    super(message);
    this.name = "ServerError";
    this.state = state;
  }
}

async function base(): Promise<string> {
  return `http://127.0.0.1:${await settings.getPort()}`;
}

export interface HealthReport {
  up: boolean;
  /** What /health says about the CLI session. "unknown" when it could not tell. */
  claude: "in" | "out" | "unknown";
}

/**
 * Is the server up, and can it still draft? Deliberately unauthenticated, so it
 * can tell "down" apart from "wrong token" - which is the whole point of /health
 * existing - and now also apart from "signed out of claude".
 *
 * An older server answers /health without the `claude` field. That reads as
 * "unknown" rather than "signed out", so a stale process degrades to the
 * previous behaviour instead of showing a warning nobody can act on.
 */
export async function healthReport(): Promise<HealthReport> {
  try {
    const res = await fetch(`${await base()}/health`, { cache: "no-store" });
    if (!res.ok) return { up: false, claude: "unknown" };
    const body = (await res.json().catch(() => ({}))) as { claude?: { signedIn?: unknown } };
    const signedIn = body.claude?.signedIn;
    return {
      up: true,
      claude: signedIn === "in" || signedIn === "out" ? signedIn : "unknown",
    };
  } catch {
    return { up: false, claude: "unknown" };
  }
}

/** The liveness half of {@link healthReport}, kept for callers that only need it. */
export async function health(): Promise<boolean> {
  try {
    const res = await fetch(`${await base()}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const port = await settings.getPort();
  const token = await settings.getToken();
  if (!token) throw new ServerError({ kind: "no_token" }, "no server token configured yet");

  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new ServerError(
      { kind: "server_down", port },
      `the personal-md server is not running on port ${port}`,
    );
  }

  if (res.status === 401) {
    throw new ServerError(
      { kind: "unauthorised", port },
      "the server rejected the token; copy it again from ~/.personal-md/token",
    );
  }
  if (!res.ok) {
    // Every error route answers with {error, stage}. Reading the field out
    // rather than showing the raw body is the difference between the widget
    // saying what went wrong and the widget showing a JSON blob: this string is
    // rendered to the user verbatim.
    const body = await res.text().catch(() => "");
    let detail = "";
    let stage = "";
    try {
      const parsed = JSON.parse(body) as { error?: unknown; stage?: unknown };
      if (typeof parsed.error === "string") detail = parsed.error.trim();
      if (typeof parsed.stage === "string") stage = parsed.stage;
    } catch {
      detail = body.trim();
    }
    const message = detail || body.trim() || res.statusText || `server returned ${res.status}`;
    // Carried as a state rather than a message so callers can hold the request
    // and resume it, instead of showing the user a dead end.
    if (stage === "claude-signed-out") {
      throw new ServerError({ kind: "claude_signed_out", port }, message);
    }
    throw new ServerError({ kind: "error", message }, message);
  }
  return (await res.json()) as T;
}

export type MatchVia = "alias" | "site-memory" | "model" | "none";

export interface MatchQuestionResponse {
  canonicalKey: string | null;
  via: MatchVia;
  confidence: "exact" | "paraphrase" | "related" | "none";
  answer: { text: string; language: Lang; writtenAt: string; askedAs: string[] } | null;
  reuse: { ok: boolean; reason?: string };
  isNewKey: boolean;
  injectionSuspected: boolean;
  spent: { calls: number; inputTokens: number; outputTokens: number; costUsd: number } | null;
  notes: string[];
}

export interface ImportProposal {
  facts: { key: string; label: string; value: string }[];
  answers: { canonicalKey: string; question: string; text: string; language: "es" | "en"; genre: string }[];
  skills: string[];
  injectionSuspected: boolean;
  notes: string[];
  warnings: string[];
  rejected: string[];
}

export interface DraftResponse {
  draft: string;
  language: Lang;
  length: { words: number; chars: number; withinLimit: boolean; shortened: boolean };
  confidence: { level: "high" | "medium" | "low"; score: number; reasons: string[] };
  provenance: {
    canonicalKey: string;
    askedAs: string;
    writtenAt: string;
    role: string;
    why: string;
    used: boolean;
    excerpt: string;
  }[];
  informationGaps: { missing: string; questionForUser: string }[];
  flags: { injectionSuspected: boolean; thinRetrieval: boolean; ungroundedSuspicion: boolean };
  spent: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  notes: string[];
}

export interface ProfileResponse {
  profile: Profile;
  warnings: string[];
  siteMemory: Record<string, string>;
  withheldKeys: string[];
  ledger: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
}

export const server = {
  health,
  healthReport,

  /** Probe the whole path: process up, then token accepted. */
  async connection(): Promise<ConnectionState> {
    const port = await settings.getPort();
    const report = await healthReport();
    if (!report.up) return { kind: "server_down", port };
    if (!(await settings.getToken())) return { kind: "no_token" };
    try {
      await request<ProfileResponse>("/profile");
      // Checked last: a signed-out CLI is worth reporting only once everything
      // else is known good, otherwise it would mask a wrong token.
      if (report.claude === "out") return { kind: "claude_signed_out", port };
      return { kind: "ok", port };
    } catch (err) {
      if (err instanceof ServerError) return err.state;
      return { kind: "error", message: err instanceof Error ? err.message : "unknown" };
    }
  },

  getProfile: () => request<ProfileResponse>("/profile"),

  putFacts: (facts: { key: string; label: string; value: string }[]) =>
    request<{ ok: true; factCount: number }>("/facts", {
      method: "POST",
      body: JSON.stringify({ facts }),
    }),

  /**
   * Save a confirmed batch of facts and answers as one write.
   *
   * Not putFacts followed by putAnswer. The user confirmed a set in one click,
   * and the server route exists so that set lands atomically - a failure partway
   * must not leave half of it on disk with no way to tell which half.
   */
  learn: (batch: {
    facts: { key: string; label: string; value: string }[];
    answers: {
      canonicalKey: string;
      question: string;
      text: string;
      language: Answer["language"];
      genre: Answer["genre"];
    }[];
  }) =>
    request<{
      ok: true;
      learned: { facts: number; answers: number };
      factCount: number;
      answerCount: number;
    }>("/learn", { method: "POST", body: JSON.stringify(batch) }),

  /** Map a profile onto a proposal. Writes nothing on the server. */
  importProfile: (profile: unknown) =>
    request<{ ok: true; proposal: ImportProposal; model: string }>("/import", {
      method: "POST",
      body: JSON.stringify({ profile }),
    }),

  putAnswer: (input: {
    canonicalKey: string;
    question: string;
    text: string;
    language: Answer["language"];
    genre: Answer["genre"];
  }) =>
    request<{ ok: true; answer: Answer }>("/answers", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  /**
   * Stages A to C of question matching.
   *
   * Only called after the extension's own free local lookups have failed, so
   * this usually means a model call: roughly 10 seconds and about two cents for
   * a question never seen before. The server writes the surface form back, so
   * the same question - in either language - is free from then on.
   */
  matchQuestion: (req: {
    question: string;
    genre: Genre;
    language: Lang;
    maxLength: number | null;
    domain: string;
    signature: string;
  }) =>
    request<MatchQuestionResponse>("/match", { method: "POST", body: JSON.stringify(req) }),

  /**
   * Draft an answer to an open question.
   *
   * The slow, expensive call: Opus, roughly ten seconds, and about two cents once
   * the prompt cache is warm. Only ever reached for a question with no stored
   * answer to reuse.
   */
  draftAnswer: (req: {
    question: string;
    canonicalKey: string | null;
    language: Lang;
    genre: Genre;
    maxWords: number | null;
    maxChars: number | null;
    registerHint: string;
    instruction?: string;
  }) => request<DraftResponse>("/draft", { method: "POST", body: JSON.stringify(req) }),

  rememberSite: (domain: string, signature: string, canonicalKey: string) =>
    request<{ ok: true }>("/site-memory", {
      method: "POST",
      body: JSON.stringify({ domain, signature, canonicalKey }),
    }),
};
