/**
 * Live tests. These spend real quota on the user's Claude account, so they are
 * opt-in: run with PERSONAL_MD_LIVE=1.
 *
 *   PERSONAL_MD_LIVE=1 node --test packages/server/test/claude.live.test.ts
 *
 * On per-call overhead. These numbers go stale fast, so they carry dates.
 *
 * Measured 24-ago-2026, CLI 2.1.241, with `ask` passing
 * --disable-slash-commands and --setting-sources project,local:
 *
 *     haiku   23,989 total input   repeat call read=23,979  $0.0028
 *     opus    25,611 total input   repeat call read=25,609  $0.0129
 *
 * Before those two flags, the same day, same machine: 29,358 on haiku and
 * 39,650 on opus, with a real draft prompt putting opus at 41,081-41,102. The
 * difference was the CLI putting the user's whole skill and agent inventory in
 * every prompt - names only on haiku (~14k chars), full descriptions on opus
 * (~34k chars), which was most of the gap between the two models. Both listings
 * come from user-level settings, which is what --setting-sources now excludes.
 *
 * Superseded numbers, kept so the drift stays visible: this header once stated
 * 25,941 total with cache_read=25,931, measured on haiku on 22-ago-2026. (An
 * even earlier note claimed the isolated cwd cut overhead 4.5x, from misreading
 * cache_creation_input_tokens as the total. It does not; that was the
 * cold-cache write portion only.)
 *
 * Prompt caching is still the whole cost story. Three identical opus calls
 * back-to-back before the flags went in: $0.1610, then $0.0199, then $0.0199.
 * A miss is not neutral - it writes the entire prefix at the 1h TTL, which is
 * dearer than fresh input.
 *
 * Two notes on the assertions below:
 *
 *   - The probes call haiku, so the ceiling is a haiku ceiling. That is a cost
 *     decision, not an oversight. It bounds opus only by proxy now: both paths
 *     sit within a few thousand tokens of each other, which was not true before
 *     the flags.
 *
 *   - The cache test used to be able to fail for a reason that was not a
 *     regression. The cached prefix only holds while the prompt is
 *     byte-identical, and the skill/agent inventory was re-read from disk and
 *     from plugin marketplaces on every invocation: on 24-ago-2026 a
 *     local-directory marketplace gained two skills between 11:41 and 11:42
 *     (134 -> 135) and both calls came back with cache_read=0, writing the full
 *     41,079 - $0.39 for a single draft against $0.02 warm. Excluding user
 *     settings is what removed that failure mode. If this test starts failing
 *     again, check first whether the flags still do what they did here.
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
 * Haiku measured at 23,989 on 24-ago-2026, so this leaves ~13% headroom.
 *
 * Deliberately tighter than the 40,000 it replaces. That number was chosen when
 * the prompt carried the user's plugin inventory and could legitimately grow by
 * thousands of tokens between runs; now that it does not, a wide ceiling would
 * wave through exactly the regression worth catching. Losing either flag in
 * claude.ts puts haiku back at 26,030-29,358 and opus at 28,645-39,650, and
 * every one of those trips this.
 *
 * If it goes red after a CLI upgrade, check whether the flags still do what
 * they did before assuming something in this repo pulled a file into the
 * prompt.
 */
const TOTAL_INPUT_CEILING = 27_000;

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
    // Not a micro-optimisation: the ~29k of scaffolding on haiku (~40k on opus)
    // is billed at about a tenth of fresh-input price only while it is a cache
    // read. Miss it and you pay a 1h-TTL write instead, which is dearer than
    // fresh input, not cheaper: $0.0199 -> $0.39 on an opus draft, measured
    // 24-ago-2026.
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
