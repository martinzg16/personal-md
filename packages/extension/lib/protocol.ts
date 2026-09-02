/**
 * Messages between the extension surfaces.
 *
 * The background service worker is the only place that talks to the companion
 * server, for two reasons: it holds the token (a content script runs in the same
 * world as a hostile page and must never see it), and it owns the profile mirror
 * so every surface reads one consistent copy.
 */

import type { Fact, Genre, Lang, Profile } from "@personal-md/core";
import type { ConnectionState, DraftResponse, ImportProposal, MatchQuestionResponse } from "./server-client.ts";
import type { ProfileMirror } from "./settings.ts";

export type Request =
  /** Re-fetch from the server and refresh the mirror. */
  | { kind: "refresh" }
  /*
   * A fill happened. Sent for measurement only, and deliberately from here
   * rather than from the content script: a request fired from a third-party
   * page is observable by that page. `count`, never which fields.
   */
  | { kind: "filled"; count: number }
  /** Cheap read of whatever the mirror already holds; works with the server down. */
  | { kind: "getMirror" }
  | { kind: "getConnection" }
  | { kind: "saveFacts"; facts: { key: string; label: string; value: string }[] }
  | {
      kind: "matchQuestion";
      question: string;
      genre: Genre;
      language: Lang;
      maxLength: number | null;
      domain: string;
      signature: string;
    }
  | {
      kind: "draftAnswer";
      question: string;
      canonicalKey: string | null;
      language: Lang;
      genre: Genre;
      maxWords: number | null;
      maxChars: number | null;
      registerHint: string;
      instruction?: string;
    }
  /**
   * Save a confirmed batch. One message, because it is one decision by the user
   * and it has to be one write on disk.
   */
  | {
      kind: "learnBatch";
      facts: { key: string; label: string; value: string }[];
      answers: { canonicalKey: string; question: string; text: string; language: Lang; genre: Genre }[];
    }
  /** Map a read profile onto a proposal. Nothing is stored by this call. */
  | { kind: "importProfile"; profile: unknown }
  | {
      kind: "saveAnswer";
      canonicalKey: string;
      question: string;
      text: string;
      language: Lang;
      genre: Genre;
    };

/**
 * Why a request failed, when the reason changes what the caller should do.
 *
 * Two, and both earn their place. A signed-out CLI is recoverable without
 * losing the request, so the surface that asked can hold it and finish itself.
 * A missing account is recoverable too, but somewhere else entirely - the
 * options page - so the panel has to offer that rather than print a sentence
 * about it. Everything else is still just an error string.
 */
export type FailureReason = "claude_signed_out" | "account_required";

export type Response<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; reason?: FailureReason };

/** An error that survived the trip across the message bridge with its reason. */
export class BridgeError extends Error {
  readonly reason: FailureReason | undefined;
  constructor(message: string, reason?: FailureReason) {
    super(message);
    this.name = "BridgeError";
    this.reason = reason;
  }
}

/** Is this the recoverable "sign in again and it will work" failure? */
export function isSignedOut(err: unknown): boolean {
  return err instanceof BridgeError && err.reason === "claude_signed_out";
}

/** Is this "drafting needs a Brío account", which is fixed in the options page? */
export function isAccountRequired(err: unknown): boolean {
  return err instanceof BridgeError && err.reason === "account_required";
}

export type { ConnectionState, DraftResponse, ImportProposal, MatchQuestionResponse };

export interface MirrorPayload {
  mirror: ProfileMirror | null;
  connection: ConnectionState;
}

/** Typed wrapper so callers do not hand-roll chrome.runtime.sendMessage shapes. */
export async function send<T>(request: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(request)) as Response<T> | undefined;
  if (!res) throw new Error("no response from the extension background worker");
  if (!res.ok) throw new BridgeError(res.error, res.reason);
  return res.data;
}

/** Facts a human should see first, in the order an editor should list them. */
export function groupFacts(profile: Profile): { group: string; facts: Fact[] }[] {
  const groups = new Map<string, Fact[]>();
  for (const fact of profile.facts) {
    const group = fact.key.split(".")[0] ?? "other";
    const list = groups.get(group) ?? [];
    list.push(fact);
    groups.set(group, list);
  }
  const order = ["personal", "contact", "work", "education", "languages", "logistics", "financial"];
  return [...groups.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a[0].localeCompare(b[0]);
    })
    .map(([group, facts]) => ({
      group,
      facts: facts.sort((x, y) => x.key.localeCompare(y.key)),
    }));
}
