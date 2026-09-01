export {
  EVENTS,
  EVENT_NAMES,
  FUNNEL,
  EventRejected,
  assertValid,
  toRow,
} from "./events.ts";
export type { EventName, EventRecord, EventSource } from "./events.ts";

export {
  KDF_ITERATIONS,
  VAULT_SCHEMA_VERSION,
  VaultUnreadable,
  fromBytea,
  fromVaultRow,
  seal,
  toBytea,
  toVaultRow,
  unseal,
} from "./crypto.ts";
export type { SealedVault } from "./crypto.ts";

export { anonymousId, createTracker, ephemeralStore } from "./tracker.ts";
export type { IdStore, Tracker, TrackerOptions } from "./tracker.ts";

export { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, isConfigured } from "./config.ts";

export {
  SIGN_IN_MESSAGES,
  createBrioClient,
  looksLikeEmail,
  requestCode,
  submitCode,
} from "./account.ts";
export type { ClientOptions, CodeCheck, CodeRequest, SessionStore } from "./account.ts";
