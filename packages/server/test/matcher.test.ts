/**
 * The parts of question matching where code, not the prompt, decides.
 *
 * A model contributes two judgements here - which canonical question this is,
 * and whether some text names a specific employer - and everything consequential
 * is then decided in TypeScript. That split is deliberate: a prompt cannot be
 * relied on to enforce "never paste an answer that mentions the wrong company
 * into this form", but an if-statement can.
 */

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import {
  TAXONOMY,
  TAXONOMY_KEYS,
  freeformKey,
  isValidCanonicalKey,
  normaliseQuestion,
  type Answer,
} from "@personal-md/core";

import { decideReuse, looksLikeCompanyMention } from "../src/matcher.ts";
import { Store } from "../src/store.ts";

const answer = (over: Partial<Answer> = {}): Answer => ({
  id: "a1",
  canonicalKey: "motivation.why_this_company",
  askedAs: ["Why do you want to work here?"],
  text: "Because the tax problem is interesting and I have spent six years on it.",
  language: "en",
  genre: "job_application",
  writtenAt: "2026-08-22",
  useCount: 1,
  ...over,
});

const ctx = (over = {}) => ({
  confidence: "exact" as const,
  maxLength: null,
  language: "en" as const,
  answerMentionsCompany: false,
  ...over,
});

describe("the taxonomy is well formed", () => {
  it("has unique, well-formed keys", () => {
    assert.deepEqual([...new Set(TAXONOMY_KEYS)], [...TAXONOMY_KEYS]);
    for (const key of TAXONOMY_KEYS) {
      assert.match(key, /^[a-z0-9_]+\.[a-z0-9_]+$/, `${key} is malformed`);
      assert.ok(isValidCanonicalKey(key));
    }
  });

  it("describes every entry for the classifier, not for a person", () => {
    for (const q of TAXONOMY) {
      assert.ok(q.description.length > 40, `${q.key} needs a usable description`);
      assert.ok(q.genres.length > 0, `${q.key} has no genre`);
    }
  });

  it("accepts a well-formed freeform key and rejects junk", () => {
    assert.equal(isValidCanonicalKey("freeform.other:hardest_tradeoff"), true);
    assert.equal(isValidCanonicalKey("freeform.other:"), false);
    assert.equal(isValidCanonicalKey("made.up.key"), false);
    assert.equal(isValidCanonicalKey("Motivation.Why"), false);
  });

  it("normalises a model-supplied slug rather than trusting it", () => {
    assert.equal(freeformKey("Hardest Trade-Off!"), "freeform.other:hardest_trade_off");
    assert.equal(freeformKey("  "), null);
    assert.equal(freeformKey("!!!"), null);
  });
});

describe("verbatim reuse", () => {
  it("reuses a stored answer when the question is the same", () => {
    // The good outcome: free, instant, and consistent across applications in a
    // way re-drafting cannot guarantee.
    const decision = decideReuse(answer(), ctx());
    assert.equal(decision.reuse, true);
  });

  it("refuses when the question is only a paraphrase", () => {
    const decision = decideReuse(answer(), ctx({ confidence: "paraphrase" }));
    assert.deepEqual(
      [decision.reuse, "reason" in decision ? decision.reason : null],
      [false, "not-the-same-question"],
    );
  });

  it("refuses across languages", () => {
    const decision = decideReuse(answer({ language: "es" }), ctx({ language: "en" }));
    assert.equal("reason" in decision && decision.reason, "different-language");
  });

  it("refuses when the stored text will not fit the field", () => {
    const decision = decideReuse(answer(), ctx({ maxLength: 20 }));
    assert.equal("reason" in decision && decision.reason, "too-long-for-the-field");
  });

  it("refuses text that still has unfilled gap markers", () => {
    const withGap = answer({ text: "I led a team of [[NEED: team size]] people." });
    const decision = decideReuse(withGap, ctx());
    assert.equal("reason" in decision && decision.reason, "has-unfilled-gaps");
  });

  it("refuses text that names another company", () => {
    // A company name from form A appearing in form B is a real and embarrassing
    // failure, so it blocks reuse and asks for an adaptation instead.
    const decision = decideReuse(answer(), ctx({ answerMentionsCompany: true }));
    assert.equal("reason" in decision && decision.reason, "names-another-company");
  });

  it("refuses when there is nothing stored", () => {
    const missing = decideReuse(null, ctx());
    assert.equal("reason" in missing && missing.reason, "no-stored-answer");

    const blank = decideReuse(answer({ text: "   " }), ctx());
    assert.equal("reason" in blank && blank.reason, "no-stored-answer");
  });

  it("still returns the text when it refuses, so it can be adapted", () => {
    const decision = decideReuse(answer(), ctx({ confidence: "related" }));
    assert.equal(decision.reuse, false);
    assert.ok(decision.text.length > 0, "the drafter needs the text it cannot reuse verbatim");
  });
});

describe("company-mention pre-check", () => {
  it("spots a capitalised organisation mid-sentence", () => {
    assert.equal(looksLikeCompanyMention("I spent six years at Monzo building things."), true);
  });

  it("ignores a sentence-opening capital", () => {
    assert.equal(looksLikeCompanyMention("Because the problem is interesting."), false);
    assert.equal(looksLikeCompanyMention("Six years of product work."), false);
  });

  it("ignores the person's own employer", () => {
    // Their own company appearing in their own answer is not a leak.
    assert.equal(looksLikeCompanyMention("I work at TaxDown on tax filing.", "TaxDown"), false);
  });

  it("is a pre-check, not a verdict: a miss means unknown, not no", () => {
    // Lowercased brand names slip through by design; the model's judgement is
    // what the decision actually gates on.
    assert.equal(looksLikeCompanyMention("i worked at monzo for six years"), false);
  });
});

describe("alias write-back", () => {
  let store: Store;

  before(async () => {
    process.env["PERSONAL_MD_HOME"] = await mkdtemp(join(tmpdir(), "personal-md-match-"));
    store = new Store();
    await store.init();
  });

  after(() => {
    delete process.env["PERSONAL_MD_HOME"];
  });

  it("makes a classified question free to recognise next time", async () => {
    // The economic argument for stage C: pay once, never again.
    await store.recordAnswer({
      canonicalKey: "motivation.why_this_company",
      question: "Why do you want to work here?",
      text: "Because the tax problem is interesting.",
      language: "en",
      genre: "job_application",
    });

    const novel = "¿Qué te atrae de nuestra empresa?";
    const before = await store.load();
    assert.equal(before.profile.index.aliases[normaliseQuestion(novel)], undefined);

    await store.learnAlias("motivation.why_this_company", novel);

    const after = await store.load();
    assert.equal(
      after.profile.index.aliases[normaliseQuestion(novel)],
      "motivation.why_this_company",
      "the new surface form should now resolve locally, with no model call",
    );
  });

  it("does not count a match as a use", async () => {
    // learnAlias runs before the person has done anything with the result, so
    // bumping useCount would make the reuse statistics lie.
    const before = await store.load();
    const useCountBefore = before.profile.answers.find(
      (a) => a.canonicalKey === "motivation.why_this_company",
    )?.useCount;

    await store.learnAlias("motivation.why_this_company", "Why us, in your own words?");

    const after = await store.load();
    const useCountAfter = after.profile.answers.find(
      (a) => a.canonicalKey === "motivation.why_this_company",
    )?.useCount;
    assert.equal(useCountAfter, useCountBefore);
  });

  it("does not duplicate a surface form that differs only in punctuation", async () => {
    const answers = () =>
      store.load().then(
        (l) => l.profile.answers.find((a) => a.canonicalKey === "motivation.why_this_company")!,
      );
    const before = (await answers()).askedAs.length;
    await store.learnAlias("motivation.why_this_company", "why do you want to work here");
    assert.equal((await answers()).askedAs.length, before);
  });

  it("creates a placeholder row for a key with no answer yet, so drafting has a home", async () => {
    await store.learnAlias("experience.technical_decision", "Hardest trade-off you have made?");
    const { profile } = await store.load();
    const row = profile.answers.find((a) => a.canonicalKey === "experience.technical_decision");
    assert.ok(row, "the alias needs a row to hang off");
    assert.equal(row.text, "", "no answer yet");
    assert.equal(row.useCount, 0);
    assert.deepEqual(row.askedAs, ["Hardest trade-off you have made?"]);
  });
});
