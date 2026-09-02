/**
 * Sending an event, and the id it is sent under.
 *
 * Two rules are encoded here rather than left to whoever calls this next:
 *
 *   1. Never read back what you wrote. `anon` has INSERT on `events` and no
 *      SELECT at all, so chaining `.select()` onto the insert turns a working
 *      write into a 403. `supabase/tests/schema.test.sql` asserts that.
 *   2. A failed event is never a failed user action. Measurement that can break
 *      the thing it measures is worse than no measurement, so every send is
 *      swallowed and, at most, reported to `onError`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { type EventName, type EventRecord, type EventSource, toRow } from "./events.ts";

/**
 * Where the anonymous id lives. The landing has localStorage, the extension has
 * chrome.storage, and neither belongs in this file.
 */
export interface IdStore {
  read(): Promise<string | null>;
  write(id: string): Promise<void>;
}

/** In-memory, for a visitor who has not consented to being remembered. */
export function ephemeralStore(): IdStore {
  let held: string | null = null;
  return {
    read: async () => held,
    write: async (id) => {
      held = id;
    },
  };
}

export async function anonymousId(store: IdStore): Promise<string> {
  const existing = await store.read();
  if (existing) return existing;
  const minted = crypto.randomUUID();
  await store.write(minted);
  return minted;
}

export interface TrackerOptions {
  client: SupabaseClient;
  source: EventSource;
  store: IdStore;
  /** Called when a send fails. Left undefined, failures are silent by design. */
  onError?: (error: unknown) => void;
}

export interface Tracker {
  track(name: EventName, props?: Record<string, string | number>): Promise<void>;
  /**
   * Bind every future event, and this browser's whole anonymous history, to an
   * account. Called once, just after a successful sign-in: it is what lets a
   * visit from three days ago be joined to today's install.
   */
  identify(accountId: string): Promise<void>;
  currentId(): Promise<string>;
}

export function createTracker({ client, source, store, onError }: TrackerOptions): Tracker {
  let accountId: string | undefined;

  const report = (error: unknown) => {
    if (onError) onError(error);
  };

  return {
    currentId: () => anonymousId(store),

    async track(name, props = {}) {
      try {
        const record: EventRecord = {
          name,
          source,
          anonymousId: await anonymousId(store),
          occurredAt: new Date().toISOString(),
          props,
          ...(accountId ? { accountId } : {}),
        };
        // No .select(): see rule 1 above.
        const { error } = await client.from("events").insert(toRow(record));
        if (error) report(error);
      } catch (error) {
        report(error);
      }
    },

    async identify(id) {
      accountId = id;
      try {
        const anon = await anonymousId(store);
        // DO NOTHING rather than DO UPDATE: the pair never changes once made,
        // and an upsert that updates would need an UPDATE grant this role is
        // deliberately not given.
        const { error } = await client
          .from("identities")
          .upsert(
            { anonymous_id: anon, account_id: id },
            { onConflict: "anonymous_id", ignoreDuplicates: true },
          );
        if (error) report(error);
      } catch (error) {
        report(error);
      }
    },
  };
}
