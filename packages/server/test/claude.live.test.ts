/**
 * Live tests. These spend real quota on the user's Claude account, so they are
 * opt-in: run with PERSONAL_MD_LIVE=1.
 *
 *   PERSONAL_MD_LIVE=1 node --test packages/server/test/claude.live.test.ts
 *
 * On per-call overhead, and a measurement mistake worth recording so nobody
 * repeats it:
 *
 * An early hand measurement read `cache_creation_input_tokens` (5,730) as the
 * total input for a call and concluded the isolated cwd cut overhead 4.5x. It
 * does not. That figure was the cold-cache *write* portion only. Measured
 * properly, across three identical back-to-back calls:
 *
 *     fresh_input=10   cache_write=0   cache_read=25,931   total=25,941
 *
 * So the real picture is:
 *   - Claude Code injects ~26k input tokens of scaffolding per call.
 *   - Essentially all of it is a cache READ, billed at roughly a tenth of fresh
 *     input, which is why a call costs ~$0.003 on Haiku rather than ~$0.03.
 *   - The isolated cwd plus --strict-mcp-config plus --settings takes it from
 *     ~29.9k to ~25.9k. A real 13% saving, not a 4.5x one. Worth keeping
 *     because it is free, but it is not the thing that makes this affordable.
 *     Prompt caching is.
 *
 * The two invariants pinned below follow from that. Total input must not blow
 * out (which would mean something large is being pulled into the prompt), and
 * repeated calls must actually hit the cache - if cache_read ever goes to zero,
 * every call silently costs ~10x more.
 */

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { ask, askForJson, extractJson, totalInputTokens } from "../src/claude.ts";
import { Store } from "../src/store.ts";

const LIVE = process.env["PERSONAL_MD_LIVE"] === "1";

/**
 * Measured at ~25.9k total input per call. The ceiling leaves room for CLI
 * version drift while still catching a real regression, such as a CLAUDE.md or
 * a memory file being pulled into every prompt.
 */
const TOTAL_INPUT_CEILING = 40_000;

before(async () => {
  process.env["PERSONAL_MD_HOME"] = await mkdtemp(join(tmpdir(), "personal-md-live-"));
  await new Store().init();
});

after(() => {
  delete process.env["PERSONAL_MD_HOME"];
});

describe("claude CLI bridge (live)", { skip: LIVE ? false : "set PERSONAL_MD_LIVE=1 to run" }, () => {
  it("returns text using the account, with no API key configured", async () => {
    assert.equal(
      process.env["ANTHROPIC_API_KEY"],
      undefined,
      "this test is meaningless if an API key is set",
    );
    const res = await ask({
      system: "Reply with exactly one word and no punctuation.",
      prompt: "Say the word PONG.",
      model: "haiku",
    });
    assert.match(res.text.trim(), /PONG/i);
    assert.ok(res.usage.outputTokens > 0, "usage should be reported");
  });

  it("keeps total per-call input within budget", async () => {
    const res = await ask({
      system: "Reply with exactly one word.",
      prompt: "Say OK.",
      model: "haiku",
    });
    const total = totalInputTokens(res.usage);
    console.log(
      `      total input ${total} (fresh ${res.usage.inputTokens}, ` +
        `write ${res.usage.cacheCreationInputTokens}, read ${res.usage.cacheReadInputTokens}) ` +
        `cost $${res.usage.costUsd.toFixed(4)}`,
    );
    assert.ok(
      total < TOTAL_INPUT_CEILING,
      `total input grew to ${total} tokens (ceiling ${TOTAL_INPUT_CEILING}). ` +
        "Something large is being pulled into every prompt - check that the cwd is " +
        "still the isolated directory and that no CLAUDE.md sits above it.",
    );
  });

  it("hits the prompt cache on a repeat call, which is what makes this cheap", async () => {
    // Not a micro-optimisation: the ~26k of scaffolding is billed at about a
    // tenth of fresh-input price only while it is a cache read. If this ever
    // fails, every call in the app just got roughly 10x more expensive.
    const opts = {
      system: "Reply with exactly one word.",
      prompt: "Say OK.",
      model: "haiku" as const,
    };
    await ask(opts);
    const second = await ask(opts);

    console.log(
      `      repeat call: read ${second.usage.cacheReadInputTokens}, ` +
        `fresh ${second.usage.inputTokens}, cost $${second.usage.costUsd.toFixed(4)}`,
    );
    assert.ok(
      second.usage.cacheReadInputTokens > 1000,
      "an identical repeat call served almost nothing from cache; per-call cost " +
        "is now dominated by fresh input tokens",
    );
    assert.ok(
      second.usage.inputTokens < 2000,
      `fresh input on a repeat call was ${second.usage.inputTokens}; the cached ` +
        "prefix is being invalidated between calls",
    );
  });

  it("drafts from supplied facts without inventing new ones", async () => {
    const res = await ask({
      model: "haiku",
      system: [
        "You draft answers to form questions using only the facts given.",
        "Never introduce an employer, metric, date or name that is not in the facts.",
        "Reply with the answer text only.",
      ].join("\n"),
      prompt: [
        "<facts>",
        "Role: Product Manager at TaxDown",
        "Years of experience: 6",
        "</facts>",
        "<question>What is your current role and how long have you been doing this?</question>",
      ].join("\n"),
    });
    assert.match(res.text, /6|six/i, "should use the supplied number");
    assert.match(res.text, /product manager/i);
  });

  it("returns validated JSON through askForJson", async () => {
    const { value, attempts } = await askForJson({
      model: "haiku",
      system: "You classify questions. Reply with a single JSON object and nothing else.",
      prompt: [
        'Classify this question into one of: motivation.why_this_company, experience.leadership_story.',
        'Reply as {"canonical_key": "..."}.',
        "<question>Why do you want to work here?</question>",
      ].join("\n"),
      validate: (v) => {
        const o = v as { canonical_key?: unknown };
        if (typeof o.canonical_key !== "string") throw new Error("canonical_key must be a string");
        return { canonicalKey: o.canonical_key };
      },
    });
    assert.equal(value.canonicalKey, "motivation.why_this_company");
    console.log(`      askForJson attempts: ${attempts}`);
  });

  it("blocks a prompt containing a NIF before spawning claude", async () => {
    await assert.rejects(
      ask({ system: "s", prompt: "My NIF is 12345678Z", model: "haiku" }),
      /blocked before sending/,
    );
  });
});

// These need no network and always run.
describe("JSON extraction", () => {
  it("reads a bare object", () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  });

  it("reads a fenced block", () => {
    assert.deepEqual(extractJson('Sure!\n```json\n{"a":2}\n```\n'), { a: 2 });
  });

  it("reads an object buried in prose", () => {
    assert.deepEqual(extractJson('Here you go: {"a":3} hope that helps'), { a: 3 });
  });

  it("throws when there is no object at all", () => {
    assert.throws(() => extractJson("no json here"), /no JSON object/);
  });
});
