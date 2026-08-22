import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { loadOrCreateToken } from "../src/auth.ts";
import { start } from "../src/server.ts";

let base: string;
let token: string;
let close: () => Promise<void>;

/** Port 0 lets the OS pick a free one, so the suite cannot collide with a real server. */
before(async () => {
  process.env["PERSONAL_MD_HOME"] = await mkdtemp(join(tmpdir(), "personal-md-http-"));
  const started = await start(0);
  close = started.close;
  base = `http://127.0.0.1:${started.port}`;
  token = await loadOrCreateToken();
});

after(async () => {
  await close();
  delete process.env["PERSONAL_MD_HOME"];
});

const auth = (extra: RequestInit = {}): RequestInit => ({
  ...extra,
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...extra.headers },
});

describe("auth", () => {
  it("serves /health without a token so the extension can tell down from unauthorised", async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; service: string };
    assert.equal(body.ok, true);
    assert.equal(body.service, "personal-md");
  });

  it("rejects every other route without a token", async () => {
    for (const path of ["/profile", "/ledger"]) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 401, `${path} should require a token`);
    }
  });

  it("rejects a wrong token", async () => {
    const res = await fetch(`${base}/profile`, { headers: { authorization: "Bearer nope" } });
    assert.equal(res.status, 401);
  });

  it("never echoes the token back", async () => {
    const res = await fetch(`${base}/health`);
    const text = await res.text();
    assert.ok(!text.includes(token), "the token must not appear in a response body");
  });
});

describe("profile round-trip over HTTP", () => {
  it("stores facts and reports which keys are withheld", async () => {
    const post = await fetch(
      `${base}/facts`,
      auth({
        method: "POST",
        body: JSON.stringify({
          facts: [
            { key: "personal.full_name", label: "Full name", value: "Test Person" },
            { key: "personal.nif", label: "NIF", value: "12345678Z" },
          ],
        }),
      }),
    );
    assert.equal(post.status, 200);

    const res = await fetch(`${base}/profile`, auth());
    const body = (await res.json()) as {
      profile: { facts: { key: string; value: string; egress: string }[] };
      withheldKeys: string[];
    };

    assert.deepEqual(body.withheldKeys, ["personal.nif"]);
    const nif = body.profile.facts.find((f) => f.key === "personal.nif");
    // The value is returned to the extension for deterministic local filling.
    // It is withheld from prompts, not from the client that owns it.
    assert.equal(nif?.value, "12345678Z");
    assert.equal(nif?.egress, "never");
  });

  it("records an answer and returns it", async () => {
    const res = await fetch(
      `${base}/answers`,
      auth({
        method: "POST",
        body: JSON.stringify({
          canonicalKey: "motivation.why_this_company",
          question: "Why do you want to work here?",
          text: "Because the tax problem is interesting.",
          language: "en",
          genre: "job_application",
        }),
      }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { answer: { askedAs: string[]; text: string } };
    assert.deepEqual(body.answer.askedAs, ["Why do you want to work here?"]);
  });

  it("validates input", async () => {
    const bad = await fetch(`${base}/facts`, auth({ method: "POST", body: JSON.stringify({}) }));
    assert.equal(bad.status, 400);

    const noKey = await fetch(
      `${base}/answers`,
      auth({ method: "POST", body: JSON.stringify({ text: "orphan" }) }),
    );
    assert.equal(noKey.status, 400);
  });

  it("404s an unknown route rather than leaking a stack trace", async () => {
    const res = await fetch(`${base}/nope`, auth());
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error.includes("no route"));
  });
});

describe("cors", () => {
  it("allows the extension origin", async () => {
    const origin = "chrome-extension://abcdefghijklmnop";
    const res = await fetch(`${base}/health`, { headers: { origin } });
    assert.equal(res.headers.get("access-control-allow-origin"), origin);
  });

  it("does not allow an arbitrary web origin", async () => {
    const res = await fetch(`${base}/health`, { headers: { origin: "https://evil.example" } });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  it("answers preflight", async () => {
    const res = await fetch(`${base}/profile`, {
      method: "OPTIONS",
      headers: { origin: "chrome-extension://abcdefghijklmnop" },
    });
    assert.equal(res.status, 204);
  });
});

describe("POST /learn", () => {
  it("saves a confirmed batch of facts and answers in one request", async () => {
    const res = await fetch(
      `${base}/learn`,
      auth({
        method: "POST",
        body: JSON.stringify({
          facts: [{ key: "logistics.availability", label: "Availability", value: "2 weeks" }],
          answers: [
            {
              canonicalKey: "experience.leadership_story",
              question: "Describe a time you led a project",
              text: "I led the migration of our investor flow.",
              language: "en",
              genre: "job_application",
            },
          ],
        }),
      }),
    );

    assert.equal(res.status, 200);
    const body = (await res.json()) as { learned: { facts: number; answers: number } };
    assert.deepEqual(body.learned, { facts: 1, answers: 1 });

    const profile = (await (await fetch(`${base}/profile`, auth())).json()) as {
      profile: { facts: { key: string }[]; answers: { canonicalKey: string }[] };
    };
    assert.ok(profile.profile.facts.some((f) => f.key === "logistics.availability"));
    assert.ok(
      profile.profile.answers.some((a) => a.canonicalKey === "experience.leadership_story"),
    );
  });

  it("rejects the whole batch when one answer is malformed", async () => {
    // Dropping the bad item and saving the rest would be the quiet, helpful
    // thing to do, and it is exactly wrong: the user confirmed a set, and
    // saving a subset of it without saying so is the failure this tool is
    // built to avoid.
    const before = (await (await fetch(`${base}/profile`, auth())).json()) as {
      profile: { facts: { key: string }[] };
    };

    const res = await fetch(
      `${base}/learn`,
      auth({
        method: "POST",
        body: JSON.stringify({
          facts: [{ key: "education.field", label: "Field", value: "Economics" }],
          answers: [{ question: "no canonical key here", text: "x", language: "en" }],
        }),
      }),
    );

    assert.equal(res.status, 400);
    const after = (await (await fetch(`${base}/profile`, auth())).json()) as {
      profile: { facts: { key: string }[] };
    };
    // The good fact in the same batch was not saved either.
    assert.ok(!after.profile.facts.some((f) => f.key === "education.field"));
    assert.equal(after.profile.facts.length, before.profile.facts.length);
  });

  it("refuses an empty batch rather than reporting a successful no-op", async () => {
    const res = await fetch(`${base}/learn`, auth({ method: "POST", body: JSON.stringify({}) }));
    assert.equal(res.status, 400);
  });
});
