/**
 * Integration test for the extension's server client, against a real running
 * companion process.
 *
 * The options page itself cannot be rendered outside an extension context, but
 * the interesting part is not the markup - it is whether each failure mode comes
 * back as its own named state. "Server not running", "no token yet" and "token
 * rejected" need three different instructions on screen, and collapsing them
 * into one generic error is what makes a local-companion design feel broken.
 * So each one is exercised here against the real server.
 *
 * `chrome.storage.local` is stubbed with a Map, which is all settings.ts uses.
 */

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const store = new Map<string, unknown>();

// Must exist before settings.ts is imported.
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
      set: async (bag: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(bag)) store.set(k, v);
      },
      remove: async (key: string) => void store.delete(key),
    },
  },
};

let server: typeof import("../lib/server-client.ts").server;
let settings: typeof import("../lib/settings.ts").settings;
let stop: () => Promise<void>;
let realToken: string;

before(async () => {
  process.env["PERSONAL_MD_HOME"] = await mkdtemp(join(tmpdir(), "personal-md-ext-"));
  const { start } = await import("../../server/src/server.ts");
  const { loadOrCreateToken } = await import("../../server/src/auth.ts");

  const running = await start(0);
  stop = running.close;
  realToken = await loadOrCreateToken();

  ({ server } = await import("../lib/server-client.ts"));
  ({ settings } = await import("../lib/settings.ts"));
  await settings.setPort(running.port);
});

after(async () => {
  await stop();
  delete process.env["PERSONAL_MD_HOME"];
});

describe("connection states are distinguishable", () => {
  it("reports no_token before setup", async () => {
    store.delete("server.token");
    const state = await server.connection();
    assert.equal(state.kind, "no_token");
  });

  it("reports unauthorised for a wrong token", async () => {
    await settings.setToken("definitely-not-the-token");
    const state = await server.connection();
    assert.equal(state.kind, "unauthorised");
  });

  it("reports ok once the real token is set", async () => {
    await settings.setToken(realToken);
    const state = await server.connection();
    assert.equal(state.kind, "ok");
  });

  it("reports server_down when nothing is listening", async () => {
    const goodPort = await settings.getPort();
    await settings.setPort(1); // nothing listens on port 1
    const state = await server.connection();
    assert.equal(state.kind, "server_down");
    await settings.setPort(goodPort);
  });

  it("health() distinguishes down from unauthorised", async () => {
    assert.equal(await server.health(), true, "server is up, so health should pass");
    await settings.setToken("wrong");
    assert.equal(await server.health(), true, "health must not depend on the token");
    await settings.setToken(realToken);
  });
});

describe("profile round-trip through the extension client", () => {
  it("saves facts and reads them back, flagging withheld keys", async () => {
    await settings.setToken(realToken);
    await server.putFacts([
      { key: "personal.full_name", label: "Full name", value: "Test Person" },
      { key: "work.current_role", label: "Current role", value: "Product Manager" },
      { key: "personal.nif", label: "NIF", value: "12345678Z" },
    ]);

    const res = await server.getProfile();
    const keys = res.profile.facts.map((f) => f.key).sort();
    assert.deepEqual(keys, ["personal.full_name", "personal.nif", "work.current_role"]);

    // The extension needs the value locally to fill the field, and needs to know
    // it is withheld so it can label it "local only" in the editor.
    assert.deepEqual(res.withheldKeys, ["personal.nif"]);
    assert.equal(res.profile.facts.find((f) => f.key === "personal.nif")?.value, "12345678Z");
  });

  it("saves an answer and accumulates a second surface form", async () => {
    await server.putAnswer({
      canonicalKey: "motivation.why_this_company",
      question: "Why do you want to work here?",
      text: "Because the problem is interesting.",
      language: "en",
      genre: "job_application",
    });
    const second = await server.putAnswer({
      canonicalKey: "motivation.why_this_company",
      question: "¿Por qué te interesa esta posición?",
      text: "",
      language: "es",
      genre: "job_application",
    });
    assert.equal(second.answer.askedAs.length, 2);

    // The alias index is what makes the same question free next time.
    const res = await server.getProfile();
    assert.equal(
      res.profile.index.aliases["por que te interesa esta posicion"],
      "motivation.why_this_company",
    );
  });

  it("throws a typed ServerError, not a bare fetch failure", async () => {
    store.delete("server.token");
    await assert.rejects(() => server.getProfile(), /no server token/);
    await settings.setToken(realToken);
  });

  it("surfaces the server's own sentence, not the JSON envelope around it", async () => {
    // Whatever the panel shows the user comes from this message. Routes answer
    // with {error, stage}, so pasting the raw body in would put braces and a
    // status code in front of the one sentence that explains anything - and the
    // sentence that matters most here is "the claude CLI is not signed in".
    await assert.rejects(
      () =>
        server.draftAnswer({
          question: "",
          canonicalKey: null,
          language: "en",
          genre: "other",
          maxWords: null,
          maxChars: null,
          registerHint: "a web form",
        }),
      (err: Error) => {
        assert.equal(err.message, "question is required");
        assert.doesNotMatch(err.message, /[{}]|server returned/, "no envelope in the message");
        return true;
      },
    );
  });
});

describe("the mirror is what makes filling work with the server down", () => {
  it("keeps the last profile readable after the server stops answering", async () => {
    const res = await server.getProfile();
    await settings.setMirror({
      profile: res.profile,
      withheldKeys: res.withheldKeys,
      siteMemory: res.siteMemory,
      fetchedAt: new Date().toISOString(),
    });

    // Simulate the server being gone.
    const goodPort = await settings.getPort();
    await settings.setPort(1);

    assert.equal((await server.connection()).kind, "server_down");

    const mirror = await settings.getMirror();
    assert.ok(mirror, "the mirror should survive the server going away");
    assert.ok(mirror.profile.facts.length > 0, "and still hold the facts needed to fill fields");
    assert.equal(
      mirror.profile.facts.find((f) => f.key === "personal.nif")?.value,
      "12345678Z",
      "including withheld values, which are filled locally and never sent",
    );

    await settings.setPort(goodPort);
  });
});
