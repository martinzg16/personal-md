/**
 * Messages between the extension surfaces.
 *
 * The background service worker is the only place that talks to the companion
 * server, for two reasons: it holds the token (a content script runs in the same
 * world as a hostile page and must never see it), and it owns the profile mirror
 * so every surface reads one consistent copy.
 */

import type { Fact, Genre, Lang, Profile } from "@personal-md/core";
import type { ConnectionState, DraftResponse, MatchQuestionResponse } from "./server-client.ts";
import type { ProfileMirror } from "./settings.ts";

export type Request =
  /** Re-fetch from the server and refresh the mirror. */
  | { kind: "refresh" }
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
  | {
      kind: "saveAnswer";
      canonicalKey: string;
      question: string;
      text: string;
      language: Lang;
      genre: Genre;
    };

export type Response<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export type { DraftResponse, MatchQuestionResponse };

export interface MirrorPayload {
  mirror: ProfileMirror | null;
  connection: ConnectionState;
}

/** Typed wrapper so callers do not hand-roll chrome.runtime.sendMessage shapes. */
export async function send<T>(request: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(request)) as Response<T> | undefined;
  if (!res) throw new Error("no response from the extension background worker");
  if (!res.ok) throw new Error(res.error);
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
