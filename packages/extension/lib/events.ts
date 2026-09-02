/**
 * The extension's half of the funnel.
 *
 * The landing measures up to the moment somebody signs up; everything after
 * that happens in here, and without these three the funnel stops exactly where
 * the product starts. The two halves join through the account: each context
 * carries its own anonymous id, and both point at the same `account_id` in
 * `identities` once you sign in.
 *
 * Three rules, all of them the same rule in different places: measurement must
 * never be able to break, delay, or leak anything.
 *
 *   - Nothing is awaited by a caller. A send that hangs must not hang a fill.
 *   - Nothing is emitted from a content script. A request fired from an
 *     arbitrary third-party page is observable by that page, and would put a
 *     network call on every site you visit. The content script tells the
 *     background worker; the worker sends.
 *   - No event carries a value, a field name or a URL. `first_fill` says how
 *     many, never which - and the database enforces that independently.
 */

import { type EventName, type IdStore, createTracker } from "@personal-md/identity";

import { accountClient } from "./account.ts";

const ID_KEY = "measure.anonymous_id";
const ONCE_PREFIX = "measure.once.";

const store: IdStore = {
  async read() {
    const bag = await chrome.storage.local.get(ID_KEY);
    return (bag[ID_KEY] as string | undefined) ?? null;
  },
  async write(id) {
    await chrome.storage.local.set({ [ID_KEY]: id });
  },
};

function tracker() {
  const client = accountClient();
  if (!client) return null;
  return createTracker({
    client,
    source: "extension",
    store,
    onError: (error) => console.debug("[brio] event not sent", error),
  });
}

/** Fire and forget, always. Never awaited, never thrown from. */
export function track(name: EventName, props: Record<string, string | number> = {}): void {
  try {
    void tracker()?.track(name, props);
  } catch {
    // A funnel is not worth an exception on the path of something real.
  }
}

/**
 * Once per install, for the steps that only mean anything the first time.
 * "First fill" counted every time would not be a first fill.
 */
export async function trackOnce(
  name: EventName,
  props: Record<string, string | number> = {},
): Promise<void> {
  const key = ONCE_PREFIX + name;
  try {
    const bag = await chrome.storage.local.get(key);
    if (bag[key]) return;
    await chrome.storage.local.set({ [key]: true });
  } catch {
    return;
  }
  track(name, props);
}

/** Bind this install's anonymous history to the account, just after signing in. */
export function identify(accountId: string): void {
  try {
    void tracker()?.identify(accountId);
  } catch {
    // Same rule.
  }
}
