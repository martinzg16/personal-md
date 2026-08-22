/**
 * Extension-side settings and the profile mirror.
 *
 * The mirror is the reason short-field filling works at all. Drafting needs the
 * companion server running; recognising a field you have filled before must not.
 * So every successful /profile fetch is written to chrome.storage.local, and the
 * deterministic matcher reads the mirror rather than the network. With the server
 * off, the extension still fills everything it already knows and only AI
 * drafting is unavailable.
 */

import type { Profile } from "@personal-md/core";

import type { PendingBatch } from "./learn/pending.ts";

const KEYS = {
  token: "server.token",
  port: "server.port",
  mirror: "profile.mirror",
  dismissed: "sites.dismissed",
  pending: "learn.pending",
} as const;

export const DEFAULT_PORT = 8787;

export interface ProfileMirror {
  profile: Profile;
  /** Which fact keys the server is withholding from prompts. */
  withheldKeys: string[];
  siteMemory: Record<string, string>;
  fetchedAt: string;
}

async function get<T>(key: string, fallback: T): Promise<T> {
  const bag = await chrome.storage.local.get(key);
  return (bag[key] as T | undefined) ?? fallback;
}

export const settings = {
  getToken: () => get<string>(KEYS.token, ""),
  setToken: (token: string) => chrome.storage.local.set({ [KEYS.token]: token.trim() }),

  getPort: () => get<number>(KEYS.port, DEFAULT_PORT),
  setPort: (port: number) => chrome.storage.local.set({ [KEYS.port]: port }),

  getMirror: () => get<ProfileMirror | null>(KEYS.mirror, null),
  setMirror: (mirror: ProfileMirror) => chrome.storage.local.set({ [KEYS.mirror]: mirror }),
  clearMirror: () => chrome.storage.local.remove(KEYS.mirror),

  /**
   * The batch this domain has noticed but not yet been asked about.
   *
   * Persisted rather than held in the content script because submitting a form
   * usually navigates, which tears the content script down. Losing four things
   * the user was about to be asked about - at the exact moment they finished
   * typing them - would make confirm-to-learn worse than useless.
   *
   * Keyed by domain. It is a record of what one site offered, not a global
   * inbox, and it is cleared once saved or declined.
   */
  getPending: async (domain: string): Promise<PendingBatch | null> => {
    const all = await get<Record<string, PendingBatch>>(KEYS.pending, {});
    return all[domain] ?? null;
  },
  setPending: async (domain: string, batch: PendingBatch): Promise<void> => {
    const all = await get<Record<string, PendingBatch>>(KEYS.pending, {});
    await chrome.storage.local.set({ [KEYS.pending]: { ...all, [domain]: batch } });
  },
  clearPending: async (domain: string): Promise<void> => {
    const all = await get<Record<string, PendingBatch>>(KEYS.pending, {});
    delete all[domain];
    await chrome.storage.local.set({ [KEYS.pending]: all });
  },

  getDismissed: () => get<string[]>(KEYS.dismissed, []),
  async dismissSite(domain: string): Promise<void> {
    const current = await get<string[]>(KEYS.dismissed, []);
    if (!current.includes(domain)) {
      await chrome.storage.local.set({ [KEYS.dismissed]: [...current, domain] });
    }
  },
  async undismissSite(domain: string): Promise<void> {
    const current = await get<string[]>(KEYS.dismissed, []);
    await chrome.storage.local.set({
      [KEYS.dismissed]: current.filter((d) => d !== domain),
    });
  },
};

export const storageKeys = KEYS;
