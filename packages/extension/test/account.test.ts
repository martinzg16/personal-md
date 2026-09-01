/**
 * The account layer's promises, checked where they can be checked without
 * signing anybody in: that a signed-out build refuses every sync with a named
 * state instead of throwing or hanging, and that the passphrase and the session
 * are kept in two different places on purpose.
 *
 * These once asserted the *unconfigured* build - no project, no client. That
 * path still exists and still matters, but it is now driven by two constants
 * that are filled in, so a test cannot reach it without faking the module. What
 * ships is the signed-out path, so that is what is asserted.
 *
 * What is deliberately not here: anything that needs Supabase Auth to answer.
 * Sealing itself is covered in `@personal-md/identity`, and the schema's
 * guarantees in `supabase/tests`.
 *
 * `chrome.storage` is two Maps, which is all this code uses - and keeping them
 * separate is the point of one of the tests: `session` is memory-backed and
 * dies with the browser, `local` does not.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const local = new Map<string, unknown>();
const session = new Map<string, unknown>();

function area(store: Map<string, unknown>) {
  return {
    get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
    set: async (bag: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(bag)) store.set(k, v);
    },
    remove: async (key: string) => void store.delete(key),
  };
}

// Must exist before the modules under test are imported.
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { local: area(local), session: area(session) },
};

const {
  accountClient,
  accountState,
  chromeSessionStore,
  forgetPassphrase,
  readPassphrase,
  rememberPassphrase,
} = await import("../lib/account.ts");
const { pullVault, pushVault, listVaults } = await import("../lib/vault.ts");

beforeEach(() => {
  local.clear();
  session.clear();
});

describe("a configured build with nobody signed in", () => {
  it("has a client", () => {
    assert.notEqual(accountClient(), null);
  });

  it("reports itself signed out, and answers without a round trip", async () => {
    // No session in storage means no network call: reading this state must work
    // on a plane, because the screen that shows it is not optional.
    const before = Date.now();
    assert.deepEqual(await accountState(), { kind: "signed_out" });
    assert.ok(Date.now() - before < 1000, "answering took long enough to have asked a server");
  });

  it("refuses to sync with a named state, never an exception", async () => {
    // Named, so the card can say "sign in first" rather than "something failed".
    assert.deepEqual(await pushVault(), { kind: "signed_out" });
    assert.deepEqual(await pullVault(), { kind: "signed_out" });
  });

  it("lists no profiles rather than failing", async () => {
    assert.deepEqual(await listVaults(), []);
  });
});

describe("the passphrase", () => {
  it("is kept in session storage, which dies with the browser", async () => {
    await rememberPassphrase("correct horse battery staple");
    assert.equal(await readPassphrase(), "correct horse battery staple");

    // The whole point: it is not in the area that survives a restart.
    assert.equal(local.size, 0);
    assert.equal(session.size, 1);
  });

  it("is forgotten on request", async () => {
    await rememberPassphrase("something");
    await forgetPassphrase();
    assert.equal(await readPassphrase(), null);
  });

  it("reads as absent rather than throwing when session storage is unavailable", async () => {
    const chrome = (globalThis as unknown as { chrome: { storage: Record<string, unknown> } }).chrome;
    const real = chrome.storage.session;
    chrome.storage.session = {
      get: async () => {
        throw new Error("no session storage in this context");
      },
      set: async () => {
        throw new Error("no session storage in this context");
      },
      remove: async () => {
        throw new Error("no session storage in this context");
      },
    };
    try {
      await rememberPassphrase("x");
      assert.equal(await readPassphrase(), null);
      await forgetPassphrase();
    } finally {
      chrome.storage.session = real;
    }
  });
});

describe("the session store handed to supabase-js", () => {
  it("round-trips through local storage under its own prefix", async () => {
    await chromeSessionStore.setItem("sb-auth-token", "{\"a\":1}");
    assert.equal(await chromeSessionStore.getItem("sb-auth-token"), "{\"a\":1}");

    // Prefixed, so a session key can never collide with a settings key.
    assert.deepEqual([...local.keys()], ["account.session.sb-auth-token"]);

    await chromeSessionStore.removeItem("sb-auth-token");
    assert.equal(await chromeSessionStore.getItem("sb-auth-token"), null);
  });

  it("returns null for a key it has never seen", async () => {
    assert.equal(await chromeSessionStore.getItem("nothing"), null);
  });
});
