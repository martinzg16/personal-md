/**
 * Talking to the companion process.
 *
 * Every failure mode is a distinct, named state rather than a generic error. The
 * user-visible difference matters: "the server is not running" needs a start
 * command, "the token is wrong" needs a paste from ~/.personal-md/token, and
 * "no token yet" needs first-run setup. Collapsing those into "something went
 * wrong" is what makes a local-companion design feel broken.
 */

import type { Answer, Profile } from "@personal-md/core";

import { settings } from "./settings.ts";

export type ConnectionState =
  | { kind: "ok"; port: number }
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

/**
 * Is the server up? Deliberately unauthenticated, so it can tell "down" apart
 * from "wrong token" - which is the whole point of /health existing.
 */
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
    const detail = await res.text().catch(() => "");
    throw new ServerError(
      { kind: "error", message: detail || res.statusText },
      `server returned ${res.status}: ${detail || res.statusText}`,
    );
  }
  return (await res.json()) as T;
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

  /** Probe the whole path: process up, then token accepted. */
  async connection(): Promise<ConnectionState> {
    const port = await settings.getPort();
    if (!(await health())) return { kind: "server_down", port };
    if (!(await settings.getToken())) return { kind: "no_token" };
    try {
      await request<ProfileResponse>("/profile");
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

  rememberSite: (domain: string, signature: string, canonicalKey: string) =>
    request<{ ok: true }>("/site-memory", {
      method: "POST",
      body: JSON.stringify({ domain, signature, canonicalKey }),
    }),
};
