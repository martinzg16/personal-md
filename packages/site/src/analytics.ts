/**
 * Measuring the funnel without contradicting the page it is measuring.
 *
 * The landing's whole argument is that Brío does not quietly send things
 * elsewhere, so the measurement has to be defensible line by line:
 *
 *   - Before consent, the anonymous id lives in memory and dies with the tab.
 *     Nothing is written to the device, so nothing is stored on it — which is
 *     what the cookie law is actually about. Events still flow; they just
 *     cannot be joined across visits.
 *   - After consent, the same id is written to localStorage and carries over,
 *     which is what makes "visited on Tuesday, installed on Friday" a fact
 *     rather than two unrelated rows.
 *   - After a refusal, nothing is ever written and the in-memory id stays.
 *
 * No event carries anything typed into the page. The database enforces that
 * independently, per event, via the property allowlist.
 */

// Two import styles on purpose. `config` and `events` are a handful of bytes
// and are needed to decide anything at all; the client drags supabase-js behind
// it, so it arrives in its own chunk after the page has painted. A landing that
// pays 200 kB up front to measure itself is measuring the wrong thing.
import { isConfigured } from "@personal-md/identity/config";
import type { EventName } from "@personal-md/identity/events";
import type { IdStore, Tracker } from "@personal-md/identity";

const CONSENT_KEY = "brio.consent";
const ID_KEY = "brio.anonymous_id";

export type Consent = "unasked" | "granted" | "declined";

/** Every storage touch is wrapped: private windows throw on read, not just write. */
function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A visitor who blocks storage is measured for this visit only. Fine.
  }
}

export function readConsent(): Consent {
  const stored = readLocal(CONSENT_KEY);
  return stored === "granted" || stored === "declined" ? stored : "unasked";
}

/**
 * The id lives in memory until consent, then in localStorage. The same store
 * object is handed to the tracker for the whole page life, so granting consent
 * promotes the id already in use rather than minting a second one and splitting
 * the visit in two.
 */
function createStore(): IdStore & { promote(): Promise<void> } {
  let inMemory: string | null = null;
  const memory: IdStore = {
    read: async () => inMemory,
    write: async (id) => {
      inMemory = id;
    },
  };
  let persistent = readConsent() === "granted";

  return {
    async read() {
      if (persistent) {
        const stored = readLocal(ID_KEY);
        if (stored) return stored;
      }
      return memory.read();
    },
    async write(id) {
      await memory.write(id);
      if (persistent) writeLocal(ID_KEY, id);
    },
    async promote() {
      persistent = true;
      const held = await memory.read();
      if (held) writeLocal(ID_KEY, held);
    },
  };
}

const store = createStore();

/** Built once, on the first event, and never on a build with no backend. */
let building: Promise<Tracker | null> | null = null;

function tracker(): Promise<Tracker | null> {
  building ??= (async () => {
    if (!isConfigured()) return null;
    const { createBrioClient, createTracker } = await import("@personal-md/identity");
    return createTracker({
      client: createBrioClient({ detectSessionInUrl: false }),
      source: "landing",
      store,
      // Silent in production; the console is enough while building.
      onError: (error) => console.debug("[brio] event not sent", error),
    });
  })();
  return building;
}

/** Never awaited by a click handler: measurement must not delay what it measures. */
export function track(name: EventName, props: Record<string, string | number> = {}): void {
  void tracker().then((t) => t?.track(name, props));
}

export function grantConsent(): void {
  writeLocal(CONSENT_KEY, "granted");
  void store.promote();
}

export function declineConsent(): void {
  writeLocal(CONSENT_KEY, "declined");
}

/** The host only. A full referrer can carry a query string somebody typed. */
export function referrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const host = new URL(document.referrer).host;
    return host === location.host ? undefined : host;
  } catch {
    return undefined;
  }
}

export function identify(accountId: string): void {
  void tracker().then((t) => t?.identify(accountId));
}

/** Synchronous, so the consent strip can decide whether to render at all. */
export const measurementIsOn = isConfigured();
