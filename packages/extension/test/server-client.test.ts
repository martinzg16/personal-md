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
let ServerError: typeof import("../lib/server-client.ts").ServerError;
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

  ({ server, ServerError } = await import("../lib/server-client.ts"));
  ({ settings } = await import("../lib/settings.ts"));
  await settings.setPort(running.port);

  /*
   * Pin the CLI session state for the whole file.
   *
   * /health now reports it, so without this every connection assertion would
   * quietly depend on whether the machine running the tests happens to be
   * signed in to Claude - which is exactly the flakiness this suite exists to
   * catch elsewhere. "unknown" is the neutral value: it changes no outcome.
   */
  const { setClaudeAuthForTests } = await import("../../server/src/claude-auth.ts");
  setClaudeAuthForTests({ state: "unknown", reason: "pinned by the test suite", checkedAt: Date.now() });
});

after(async () => {
  const { setClaudeAuthForTests } = await import("../../server/src/claude-auth.ts");
  setClaudeAuthForTests(null);
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

  it("reports claude_signed_out when the CLI session has lapsed", async () => {
    // The state exists so this is visible *before* an answer is typed into a
    // form and lost to a 502. Everything else here is healthy on purpose: the
    // point is that a lapsed session is its own state, not a generic error.
    const { setClaudeAuthForTests } = await import("../../server/src/claude-auth.ts");
    await settings.setToken(realToken);
    setClaudeAuthForTests({ state: "out", checkedAt: Date.now() });
    try {
      assert.equal((await server.connection()).kind, "claude_signed_out");
    } finally {
      setClaudeAuthForTests({ state: "unknown", reason: "pinned by the test suite", checkedAt: Date.now() });
    }
  });

  it("stays ok when the session cannot be checked, rather than crying wolf", async () => {
    const { setClaudeAuthForTests } = await import("../../server/src/claude-auth.ts");
    await settings.setToken(realToken);
    setClaudeAuthForTests({ state: "unknown", reason: "no cli", checkedAt: Date.now() });
    try {
      assert.equal((await server.connection()).kind, "ok");
    } finally {
      setClaudeAuthForTests({ state: "unknown", reason: "pinned by the test suite", checkedAt: Date.now() });
    }
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

describe("a signed-out CLI is recoverable, not a dead end", () => {
  it("refuses a draft as its own state, so the caller can hold the request", async () => {
    // No quota is spent: the server checks the session before it invokes the
    // CLI, which is the whole point of the precheck existing.
    const { setClaudeAuthForTests } = await import("../../server/src/claude-auth.ts");
    await settings.setToken(realToken);
    setClaudeAuthForTests({ state: "out", checkedAt: Date.now() });
    try {
      await assert.rejects(
        () =>
          server.draftAnswer({
            question: "Why do you want to work here?",
            canonicalKey: null,
            language: "en",
            genre: "job_application",
            maxWords: null,
            maxChars: null,
            registerHint: "a job application form",
          }),
        (err: unknown) => {
          assert.ok(err instanceof ServerError);
          assert.equal(err.state.kind, "claude_signed_out");
          assert.match(err.message, /claude auth login/);
          return true;
        },
      );
    } finally {
      setClaudeAuthForTests({ state: "unknown", reason: "pinned by the test suite", checkedAt: Date.now() });
    }
  });

  it("reports /health so the badge can be painted before a draft is asked for", async () => {
    const { setClaudeAuthForTests } = await import("../../server/src/claude-auth.ts");
    setClaudeAuthForTests({ state: "out", checkedAt: Date.now() });
    try {
      assert.equal((await server.healthReport()).claude, "out");
    } finally {
      setClaudeAuthForTests({ state: "unknown", reason: "pinned by the test suite", checkedAt: Date.now() });
    }
  });
});
