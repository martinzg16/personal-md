/**
 * Signing in, in the two places it happens.
 *
 * GitHub, not a code by email. That was the first design, and it died on a
 * fact rather than a preference: Supabase's built-in mail provider refuses
 * template changes on the free tier — "Email template modification is not
 * available for free tier projects using the default email provider" — so the
 * template cannot be made to render a code at all, and the same provider is
 * rate limited to a couple of messages an hour. Both problems disappear when
 * nothing is emailed.
 *
 * It also happens to fit the harder of the two callers better. An extension has
 * no page for a provider to redirect back to, which is what made a link
 * awkward; `chrome.identity.launchWebAuthFlow` gives it one that Chrome owns.
 *
 * Every failure has a name, following `server-client.ts`: "you closed the
 * window" and "GitHub said no" need different sentences, and collapsing them
 * into "something went wrong" is what makes sign-in feel broken.
 */

import { type SupabaseClient, createClient } from "@supabase/supabase-js";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isConfigured } from "./config.ts";

/** The only provider wired up. Adding a second is a parameter, not a rewrite. */
export const PROVIDER = "github" as const;

/** Where the session is kept. The landing has localStorage; MV3 does not. */
export interface SessionStore {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface ClientOptions {
  storage?: SessionStore;
  /**
   * True on the landing, where the provider redirects back to the page and the
   * `?code=` in the URL is the session. False in the extension, where the
   * redirect is caught by Chrome and exchanged by hand.
   */
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
      // Explicit rather than inherited: the extension exchanges the code
      // itself, and that only works if the verifier was stored on the way out.
      flowType: "pkce",
      ...(options.storage ? { storage: options.storage } : {}),
    },
  });
}

export type SignInStart =
  /** The provider's URL. The caller decides how to open it. */
  | { kind: "go"; url: string }
  | { kind: "offline" }
  | { kind: "error"; message: string };

export type SignInFinish =
  | { kind: "signed_in"; accountId: string; label: string }
  /** The window was closed, or the provider was declined. Not an error to shout about. */
  | { kind: "abandoned" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

function isOffline(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const status = (error as { status?: number } | null)?.status;
  if (status === 0) return true;
  const message = (error as { message?: string } | null)?.message ?? "";
  return /failed to fetch|load failed|network request failed|networkerror/i.test(message);
}

/**
 * Begin. `redirectTo` is the landing's own URL in one caller and
 * `chrome.identity.getRedirectURL()` in the other; both must be on the
 * project's allow-list or the provider bounces the round trip at the end.
 */
export async function startSignIn(
  client: SupabaseClient,
  redirectTo: string,
): Promise<SignInStart> {
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: PROVIDER,
      options: {
        redirectTo,
        // The caller opens it: a page navigates, an extension hands it to Chrome.
        skipBrowserRedirect: true,
        // Only what is needed to tell one account from another.
        scopes: "read:user user:email",
      },
    });
    if (error) {
      return isOffline(error)
        ? { kind: "offline" }
        : { kind: "error", message: error.message };
    }
    if (!data?.url) return { kind: "error", message: "no provider URL came back" };
    return { kind: "go", url: data.url };
  } catch (error) {
    if (isOffline(error)) return { kind: "offline" };
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/** What to call the person on screen, preferring the name they chose. */
export function labelFor(user: {
  email?: string | undefined;
  user_metadata?: Record<string, unknown> | undefined;
}): string {
  const meta = user.user_metadata ?? {};
  const handle = typeof meta["user_name"] === "string" ? meta["user_name"] : undefined;
  const name = typeof meta["name"] === "string" ? meta["name"] : undefined;
  return handle ?? name ?? user.email ?? "signed in";
}

/**
 * Finish, for the caller that catches its own redirect.
 *
 * The landing does not need this: with `detectSessionInUrl` the client picks the
 * code out of the URL on load. The extension does, because Chrome hands the
 * redirect back as a string and there is no page for it to land on.
 */
export async function finishSignIn(
  client: SupabaseClient,
  callbackUrl: string,
): Promise<SignInFinish> {
  let code: string | null;
  try {
    code = new URL(callbackUrl).searchParams.get("code");
  } catch {
    return { kind: "error", message: "the provider came back with something that is not a URL" };
  }
  if (!code) {
    // A refusal at the provider comes back as ?error=access_denied, and the
    // person who clicked "cancel" does not need to read that word.
    return { kind: "abandoned" };
  }

  try {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      return isOffline(error)
        ? { kind: "offline" }
        : { kind: "error", message: error.message };
    }
    const user = data.user;
    if (!user) return { kind: "error", message: "exchanged, but no user came back" };
    return { kind: "signed_in", accountId: user.id, label: labelFor(user) };
  } catch (error) {
    if (isOffline(error)) return { kind: "offline" };
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/** What the UI should say. Kept next to the states so the two cannot drift. */
export const SIGN_IN_MESSAGES = {
  offline: "No connection. Signing in is the only part of Brío that needs one.",
  abandoned: "Sign-in was closed before it finished. Nothing changed.",
} as const;
