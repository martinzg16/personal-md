/**
 * One client for the whole page.
 *
 * The analytics module and the signup form both need one, and building two gets
 * you supabase-js's own warning: "Multiple GoTrueClient instances detected in
 * the same browser context". It is not cosmetic - both instances write the
 * session under the same storage key, so two token refreshes can race and one
 * can clobber the other's rotated refresh token, which ends as a sign-out
 * nobody asked for.
 *
 * Memoised in a module, so however many places import it - eagerly or through a
 * dynamic import in another chunk - they all get the same instance.
 */

import { createBrioClient } from "@personal-md/identity";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function landingClient(): SupabaseClient {
  // True here, unlike in the extension: GitHub redirects back to this page and
  // the `?code=` in the URL is the session. Nothing else picks it up.
  client ??= createBrioClient({ detectSessionInUrl: true });
  return client;
}
