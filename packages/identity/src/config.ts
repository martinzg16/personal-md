/**
 * Where the backend is, and the key that reaches it.
 *
 * Both values are committed on purpose. The publishable key is designed to be
 * public — it is in the landing's JavaScript the moment anyone opens it, and in
 * the extension bundle the moment anyone unzips it. What protects the data is
 * row level security, not the secrecy of this string. The key that must never
 * appear here is the service role one, which nothing in this repository uses.
 *
 * Reachable on its own as `@personal-md/identity/config` so a caller can ask
 * whether the backend exists without pulling supabase-js into its first
 * payload. On the landing that is the difference between a 207 kB bundle and a
 * 426 kB one.
 *
 * Filling these in is the single step that turns the account layer on. Until
 * then `isConfigured()` is false and every caller degrades on purpose rather
 * than throwing: an unconfigured build still fills forms, which is the part
 * that never needed a server.
 */

export const SUPABASE_URL = "";
export const SUPABASE_PUBLISHABLE_KEY = "";

export function isConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_PUBLISHABLE_KEY.length > 0;
}
