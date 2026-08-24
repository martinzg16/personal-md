/**
 * Live tests. These spend real quota on the user's Claude account, so they are
 * opt-in: run with PERSONAL_MD_LIVE=1.
 *
 *   PERSONAL_MD_LIVE=1 node --test packages/server/test/claude.live.test.ts
 *
 * On per-call overhead. These numbers go stale fast, so they carry dates.
 *
 * Re-measured 24-ago-2026, CLI 2.1.241, 135 skills and 28 agents enabled in
 * the user's global config. Six back-to-back haiku calls through `ask`:
 *
 *     total input 29,358-29,431
 *     repeat of a byte-identical call:  fresh=10  write=0  read=29,348  $0.0032
 *     new prompt, same scaffolding:     fresh=10  write=~6.4k  read=22,934
 *
 * And three back-to-back opus calls, which is the path drafting actually uses:
 *
 *     #1  fresh=2  write=14,844  read=24,804  total=39,650  $0.1610
 *     #2  fresh=2  write=0       read=39,648  total=39,650  $0.0199
 *     #3  fresh=2  write=0       read=39,648  total=39,650  $0.0199
 *
 * Superseded numbers, kept so the drift is visible: this header used to state
 * 25,941 total with cache_read=25,931, measured on haiku on 22-ago-2026. Two
 * days later haiku is +13% and opus is +53% against that figure. (An even
 * earlier note claimed the isolated cwd cut overhead 4.5x, from misreading
 * cache_creation_input_tokens as the total. It does not; that was the
 * cold-cache write portion only.)
 *
 * Where the growth is: the CLI puts the user's whole skill and agent inventory
 * in every prompt. On haiku that listing is names only (~14k chars); on opus it
 * carries full descriptions (~34k chars), which is most of the ~10k-token gap
 * between the two models. Both come from user-level config, so the isolated cwd
 * does nothing about them.
 *
 * Two consequences for the assertions below:
 *
 *   - The ceiling is a HAIKU ceiling, because that is what these probes call.
 *     Opus is already at 39,650-41,102 and would break a 40,000 ceiling. That
 *     is deliberate, not an oversight: asserting it on opus would spend real
 *     subscription quota on every live run. If drafting cost matters, measure
 *     opus by hand rather than trusting this file to catch it.
 *
 *   - The cache test can fail for a reason that is not a regression. The cached
 *     prefix only holds while the skill/agent inventory is byte-identical
 *     between calls, and that inventory is re-read from disk and from plugin
 *     marketplaces on every invocation. On 24-ago-2026 a local-directory
 *     marketplace gained two skills between 11:41 and 11:42 (134 -> 135) and
 *     both calls came back with cache_read=0, writing the full 41,079 at the
 *     1h-TTL rate: $0.39 for a single draft against $0.02 warm. If this test
 *     fails, check whether a plugin changed underneath it before concluding
 *     that the code did.
 */

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { ask, askForJson, extractJson, readCliResult, totalInputTokens } from "../src/claude.ts";
import { Store } from "../src/store.ts";

const LIVE = process.env["PERSONAL_MD_LIVE"] === "1";

/**
 * Haiku measured at 29,358-29,431 total input per call on 24-ago-2026, up from
 * 25,941 on 22-ago-2026. The ceiling keeps ~26% headroom over that, which is
 * enough for CLI version drift and for a few more skills appearing in the
 * user's global config, while still catching a real regression such as a
 * CLAUDE.md or a memory file being pulled into every prompt.
 *
 * It does not bound the opus drafting path, which is already past it. See the
 * file header.
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

/**
 * The CLI reports its own failures in-band - exit 0, is_error, reason in
 * `result` - so this mapping is the only thing standing between a real cause and
 * a shrug. The payloads below are trimmed from actual CLI output.
 */
describe("reading the CLI envelope", () => {
  it("returns the text on success", () => {
    const read = readCliResult({ is_error: false, result: "PONG", subtype: "success" });
    assert.equal(read.ok, true);
    assert.equal(read.ok && read.text, "PONG");
  });

  it("names an expired login instead of repeating the CLI's misleading subtype", () => {
    // Captured 24-ago-2026 on CLI 2.1.241. Note subtype: "success" on a failure -
    // the old code printed "claude reported an error (success)" from it.
    const read = readCliResult({
      is_error: true,
      subtype: "success",
      terminal_reason: "api_error",
      result: "Failed to authenticate: OAuth session expired and could not be refreshed",
    });
    assert.equal(read.ok, false);
    if (read.ok) return;
    assert.equal(read.error.kind, "not_authenticated");
    assert.match(read.error.message, /not signed in/);
    assert.match(read.error.message, /claude auth login/, "the message must say how to fix it");
    assert.doesNotMatch(read.error.message, /success/, "the CLI's subtype is not a cause");
    assert.match(read.error.detail, /OAuth session expired/, "keep the CLI's own words too");
  });

  it("quotes the reason for a failure it does not recognise", () => {
    const read = readCliResult({
      is_error: true,
      subtype: "error_max_turns",
      result: "Something went sideways\nsecond line",
    });
    assert.equal(read.ok, false);
    if (read.ok) return;
    assert.equal(read.error.kind, "failed");
    assert.match(read.error.message, /Something went sideways/);
    assert.doesNotMatch(read.error.message, /second line/, "message is one line; detail has both");
  });

  it("falls back to the subtype when there is no reason at all", () => {
    const read = readCliResult({ is_error: true, subtype: "error_during_execution" });
    assert.equal(read.ok, false);
    if (read.ok) return;
    assert.equal(read.error.kind, "failed");
    assert.match(read.error.message, /error_during_execution/);
  });

  it("treats a missing result as a failure rather than an empty draft", () => {
    const read = readCliResult({ is_error: false });
    assert.equal(read.ok, false);
  });
});
