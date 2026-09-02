/**
 * The account, from inside the extension.
 *
 * Everything here is optional. Brío fills forms with no account at all, and the
 * only thing signing in buys is carrying a profile to another machine and
 * keeping a work one apart from a personal one. So every function degrades
 * rather than throws when the build has no backend configured, and no code path
 * on the filling side is allowed to await any of it.
 *
 * Two storage rules that are not interchangeable:
 *
 *   - The *session* goes in `chrome.storage.local`, because a sign-in that
 *     evaporated every time the MV3 worker was killed would be worthless.
 *   - The *passphrase* goes in `chrome.storage.session`, which is memory-backed
 *     and dies with the browser. It is the key to the vault; writing it next to
 *     the thing it unlocks would make the encryption theatre.
 */

import {
  type SessionStore,
  type SignInFinish,
  createBrioClient,
  finishSignIn,
  isConfigured,
  labelFor,
  startSignIn,
} from "@personal-md/identity";
import type { SupabaseClient } from "@supabase/supabase-js";

import { identify, track } from "./events.ts";

const SESSION_PREFIX = "account.session.";
const PASSPHRASE_KEY = "account.passphrase";

/** supabase-js writes one key; the prefix keeps it out of the settings namespace. */
export const chromeSessionStore: SessionStore = {
  async getItem(key) {
    const bag = await chrome.storage.local.get(SESSION_PREFIX + key);
    return (bag[SESSION_PREFIX + key] as string | undefined) ?? null;
  },
  async setItem(key, value) {
    await chrome.storage.local.set({ [SESSION_PREFIX + key]: value });
  },
  async removeItem(key) {
    await chrome.storage.local.remove(SESSION_PREFIX + key);
  },
};

let client: SupabaseClient | null = null;

/** Null when this build has no backend, which is a supported state, not a fault. */
export function accountClient(): SupabaseClient | null {
  if (!isConfigured()) return null;
  client ??= createBrioClient({ storage: chromeSessionStore, detectSessionInUrl: false });
  return client;
}

export type AccountState =
  | { kind: "unconfigured" }
  | { kind: "signed_out" }
  | {
      kind: "signed_in";
      accountId: string;
      /** The GitHub handle where possible, an address otherwise. Never a token. */
      label: string;
      /** Whether the vault can be opened right now. */
      unlocked: boolean;
    }
  /** Signed in, but the network said no. Distinct because the remedy is to wait, not to sign in again. */
  | { kind: "offline"; label: string }
  | { kind: "error"; message: string };

export async function accountState(): Promise<AccountState> {
  const supabase = accountClient();
  if (!supabase) return { kind: "unconfigured" };
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { kind: "error", message: error.message };
    const session = data.session;
    if (!session?.user) return { kind: "signed_out" };
    return {
      kind: "signed_in",
      accountId: session.user.id,
      label: labelFor(session.user),
      unlocked: (await readPassphrase()) !== null,
    };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The whole round trip, in one call, because there is nothing for the user to
 * do in the middle.
 *
 * `launchWebAuthFlow` opens a window Chrome owns, waits for the redirect to
 * https://<extension-id>.chromiumapp.org/, and hands it back as a string. That
 * is the only way an extension can finish OAuth: it has no page of its own for
 * a provider to redirect to. Closing that window rejects, and a closed window
 * is a decision, not a fault - so it comes back as `abandoned`.
 */
export async function signIn(): Promise<SignInFinish> {
  const supabase = accountClient();
  if (!supabase) {
    return { kind: "error", message: "accounts are not switched on in this build" };
  }

  const start = await startSignIn(supabase, chrome.identity.getRedirectURL());
  if (start.kind !== "go") {
    return start.kind === "offline" ? { kind: "offline" } : { kind: "error", message: start.message };
  }

  let callback: string | undefined;
  try {
    callback = await chrome.identity.launchWebAuthFlow({ url: start.url, interactive: true });
  } catch {
    return { kind: "abandoned" };
  }
  if (!callback) return { kind: "abandoned" };

  const done = await finishSignIn(supabase, callback);
  if (done.kind === "signed_in") {
    // Bind first, so the step is attributed to the install that reached it.
    identify(done.accountId);
    track("extension_signed_in", { extension_version: chrome.runtime.getManifest().version });
  }
  return done;
}

/**
 * Whether this install may draft.
 *
 * Lives here rather than inline in the background worker so the rule can be
 * exercised without a browser: "no account, no drafting" is a product promise
 * and a promise nobody can run is a comment.
 *
 * Filling is not asked about anywhere. It is deterministic, local, and works
 * with the companion stopped — that half never needs an account and this
 * function is never consulted about it.
 */
export async function mayDraft(): Promise<boolean> {
  return (await accountState()).kind === "signed_in";
}

export async function signOut(): Promise<void> {
  await forgetPassphrase();
  await accountClient()?.auth.signOut();
}

/*
 * The passphrase.
 *
 * chrome.storage.session is memory-backed and cleared when the browser closes,
 * which is exactly the lifetime wanted: unlock once per browser session, never
 * persist to disk. On the rare build where it is unavailable, the passphrase
 * simply is not remembered - the vault still works, it just asks again.
 */

export async function rememberPassphrase(passphrase: string): Promise<void> {
  try {
    await chrome.storage.session.set({ [PASSPHRASE_KEY]: passphrase });
  } catch {
    // Not remembered. Correct behaviour, not an error to surface.
  }
}

export async function readPassphrase(): Promise<string | null> {
  try {
    const bag = await chrome.storage.session.get(PASSPHRASE_KEY);
    return (bag[PASSPHRASE_KEY] as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function forgetPassphrase(): Promise<void> {
  try {
    await chrome.storage.session.remove(PASSPHRASE_KEY);
  } catch {
    // Nothing to forget.
  }
}
