/**
 * Signing in, in the two places it happens.
 *
 * A six-digit code by email, not a magic link. A link has to come back to a
 * page, and one of the two callers is a Chrome extension where "come back to a
 * page" means a redirect dance through an extension origin. A code is typed
 * wherever you are, works the same in both, and needs no redirect allow-list.
 *
 * Every failure has a name, following `server-client.ts`: the difference
 * between "that code is wrong" and "you have asked for three codes in a
 * minute" is the difference between retyping six digits and waiting, and
 * collapsing them into "something went wrong" is what makes sign-in feel
 * broken.
 *
 * NOTE: the project's magic-link email template must render `{{ .Token }}`.
 * Supabase sends the link template by default, and a user who is shown a link
 * when the screen asks for a code will simply be stuck.
 */

import { type SupabaseClient, createClient } from "@supabase/supabase-js";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isConfigured } from "./config.ts";

/** Where the session is kept. The landing has localStorage; MV3 does not. */
export interface SessionStore {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface ClientOptions {
  storage?: SessionStore;
  /** MV3 workers are killed and restarted; a URL-borne session is meaningless there. */
  detectSessionInUrl?: boolean;
}

export function createBrioClient(options: ClientOptions = {}): SupabaseClient {
  if (!isConfigured()) {
    throw new Error("Supabase is not configured; call isConfigured() before creating a client");
  }
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: options.detectSessionInUrl ?? false,
      ...(options.storage ? { storage: options.storage } : {}),
    },
  });
}

export type CodeRequest =
  | { kind: "sent"; email: string }
  /** Supabase's own throttle, or ours: `max_frequency` in config.toml. */
  | { kind: "rate_limited" }
  | { kind: "bad_email" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

export type CodeCheck =
  | { kind: "signed_in"; accountId: string }
  | { kind: "wrong_code" }
  | { kind: "expired" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

/** Deliberately narrow: an address with an @ and no spaces. Real validation is the code arriving. */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * A dead connection reaches us two different ways, and only one of them is a
 * thrown exception. supabase-js catches the fetch failure itself and hands it
 * back as a returned error with status 0, so checking only the catch block
 * leaks "Failed to fetch" - or Safari's "Load failed" - onto the screen. Found
 * by pointing the client at a hostname that does not resolve.
 */
function isOffline(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const status = (error as { status?: number } | null)?.status;
  if (status === 0) return true;
  const message = (error as { message?: string } | null)?.message ?? "";
  return /failed to fetch|load failed|network request failed|networkerror/i.test(message);
}

export async function requestCode(client: SupabaseClient, email: string): Promise<CodeRequest> {
  const address = email.trim().toLowerCase();
  if (!looksLikeEmail(address)) return { kind: "bad_email" };

  try {
    const { error } = await client.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true },
    });
    if (!error) return { kind: "sent", email: address };
    if (isOffline(error)) return { kind: "offline" };
    if (error.status === 429 || /rate|frequency/i.test(error.message)) return { kind: "rate_limited" };
    return { kind: "error", message: error.message };
  } catch (error) {
    if (isOffline(error)) return { kind: "offline" };
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

export async function submitCode(
  client: SupabaseClient,
  email: string,
  code: string,
): Promise<CodeCheck> {
  const token = code.replace(/\s+/g, "");
  try {
    const { data, error } = await client.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });
    if (error) {
      if (isOffline(error)) return { kind: "offline" };
      if (/expired/i.test(error.message)) return { kind: "expired" };
      if (error.status === 403 || /invalid|token/i.test(error.message)) return { kind: "wrong_code" };
      return { kind: "error", message: error.message };
    }
    const accountId = data.user?.id;
    if (!accountId) return { kind: "error", message: "verified, but no user came back" };
    return { kind: "signed_in", accountId };
  } catch (error) {
    if (isOffline(error)) return { kind: "offline" };
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/** What the UI should say. Kept next to the states so the two cannot drift. */
export const SIGN_IN_MESSAGES = {
  bad_email: "That does not look like an email address.",
  rate_limited: "A code has just gone out. Give it a minute before asking for another.",
  offline: "No connection. Signing in is the only part of Brío that needs one.",
  wrong_code: "That code is not right. Six digits, from the most recent email.",
  expired: "That code has expired. Ask for a new one.",
} as const;
