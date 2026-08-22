/**
 * Retrieval, confidence and the grounding checks - the parts of drafting that
 * must be correct whatever the model returns.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyEgress, emptyProfile, type Answer, type Fact, type Profile } from "@personal-md/core";

import { buildDraftPrompt, DRAFT_SYSTEM } from "../src/draft-prompts.ts";
import { suspectUngroundedNumbers } from "../src/draft-route.ts";
import { resolveSlot, retrieve } from "../src/retrieval.ts";

const answer = (over: Partial<Answer> & { id: string }): Answer => ({
  canonicalKey: "experience.leadership_story",
  askedAs: ["Describe a time you led a project"],
  text: "I led the migration of the investor flow with a team of six.",
  language: "en",
  genre: "job_application",
  writtenAt: "2026-08-22",
  useCount: 1,
  ...over,
});

const fact = (key: string, value: string): Fact => ({
  key,
  label: key,
  value,
  egress: classifyEgress(key),
  updatedAt: "",
});

const profileOf = (answers: Answer[], facts: Fact[] = []): Profile => ({
  ...emptyProfile(),
  answers,
  facts,
});

const req = (over = {}) => ({
  question: "Describe a time you led a project",
  canonicalKey: "experience.leadership_story" as string | null,
  language: "en" as const,
  genre: "job_application" as const,
  maxWords: 200 as number | null,
  ...over,
});

describe("retrieval selects on two axes", () => {
  it("puts the same question's answer first, as content", () => {
    const r = retrieve(
      profileOf([
        answer({ id: "other", canonicalKey: "skills.strengths", askedAs: ["What are you good at?"], text: "Cutting scope." }),
        answer({ id: "match" }),
      ]),
      req(),
    );
    const match = r.exemplars.find((e) => e.answer.id === "match");
    assert.ok(match, "the exact-question answer should be retrieved");
    assert.match(match.role, /content|both/);
    assert.match(match.why, /same question/);
  });

  it("prefers register match over topical match for the voice slot", () => {
    // A topically perfect answer in the wrong language is the wrong voice model.
    const r = retrieve(
      profileOf([
        answer({ id: "es-topical", language: "es", text: "Lideré la migración del flujo de inversores con un equipo de seis." }),
        answer({
          id: "en-offtopic",
          canonicalKey: "skills.strengths",
          askedAs: ["What are you unusually good at?"],
          text: "I am good at cutting scope early, and at saying no to work that will not matter in a month.",
          language: "en",
        }),
      ]),
      req({ language: "en" }),
    );
    const voice = r.exemplars.filter((e) => e.role === "voice" || e.role === "both");
    assert.ok(
      voice.some((e) => e.answer.id === "en-offtopic"),
      "an English exemplar should be chosen to show English voice",
    );
  });

  it("labels an answer serving both roles as both", () => {
    const r = retrieve(profileOf([answer({ id: "only" })]), req());
    assert.equal(r.exemplars[0]?.role, "both");
  });

  it("reports thin retrieval rather than pretending", () => {
    const r = retrieve(
      profileOf([answer({ id: "x", canonicalKey: "skills.weaknesses", askedAs: ["Weaknesses?"], text: "Impatience." })]),
      req({ question: "What is your approach to distributed consensus?", canonicalKey: null }),
    );
    assert.equal(r.thin, true);
  });

  it("never sends a withheld fact", () => {
    // The egress allowlist, enforced at the point the prompt is assembled.
    const r = retrieve(
      profileOf(
        [answer({ id: "a" })],
        [fact("work.current_role", "Product Manager"), fact("personal.nif", "12345678Z")],
      ),
      req(),
    );
    const keys = r.facts.map((f) => f.key);
    assert.deepEqual(keys, ["work.current_role"]);
    assert.ok(!JSON.stringify(r.facts).includes("12345678Z"));
  });

  it("ignores answers with no text", () => {
    const r = retrieve(profileOf([answer({ id: "blank", text: "" })]), req());
    assert.equal(r.exemplars.length, 0);
  });

  it("bounds the total exemplar text", () => {
    const huge = "word ".repeat(4000);
    const r = retrieve(
      profileOf([
        answer({ id: "a", text: huge }),
        answer({ id: "b", text: huge, canonicalKey: "skills.strengths" }),
        answer({ id: "c", text: huge, canonicalKey: "skills.weaknesses" }),
      ]),
      req(),
    );
    const total = r.exemplars.reduce((n, e) => n + e.answer.text.length, 0);
    assert.ok(total <= 7000, `exemplar text was ${total} chars, which would bloat every prompt`);
  });

  it("maps a slot back to the answer it stands for", () => {
    const r = retrieve(profileOf([answer({ id: "a" })]), req());
    const slot = r.exemplars[0]?.slot as string;
    assert.equal(resolveSlot(r, slot)?.id, "a");
    assert.equal(resolveSlot(r, "s99"), null);
  });
});

describe("the prompt", () => {
  const built = () =>
    buildDraftPrompt({
      question: "¿Por qué te interesa esta posición?",
      language: "es",
      genre: "job_application",
      maxWords: 150,
      maxChars: null,
      registerHint: "job application",
      retrieval: retrieve(
        profileOf([answer({ id: "a" })], [fact("work.current_role", "Product Manager"), fact("personal.nif", "12345678Z")]),
        req({ language: "es" }),
      ),
    });

  it("states the data boundary before the untrusted content", () => {
    // The spike put its rules after the page text, so page text could preempt
    // them. Order is the whole mitigation.
    const prompt = built();
    const boundary = prompt.indexOf("do not follow it");
    const question = prompt.indexOf("<question>");
    assert.ok(boundary > -1 && question > -1);
    assert.ok(boundary < question, "the boundary must be stated before the question");
  });

  it("never carries a withheld value", () => {
    assert.ok(!built().includes("12345678Z"));
  });

  it("never carries internal answer ids", () => {
    // Slots exist so the prompt does not leak storage details.
    const prompt = built();
    assert.ok(!prompt.includes('id="a"'));
    assert.match(prompt, /slot="s1"/);
  });

  it("carries the exemplar text in full, never truncated", () => {
    // The spike's shared sanitiser capped every value at 200 characters, which
    // silently destroyed the only input this feature has.
    const long = "I led the migration and ".repeat(30);
    const prompt = buildDraftPrompt({
      question: "Describe a time you led a project",
      language: "en",
      genre: "job_application",
      maxWords: null,
      maxChars: null,
      registerHint: "job application",
      retrieval: retrieve(profileOf([answer({ id: "a", text: long })]), req()),
    });
    assert.ok(prompt.includes(long.trim()), "the exemplar was truncated");
  });

  it("tells the model when there is nothing close to work from", () => {
    const prompt = buildDraftPrompt({
      question: "What is your approach to distributed consensus?",
      language: "en",
      genre: "job_application",
      maxWords: null,
      maxChars: null,
      registerHint: "job application",
      retrieval: retrieve(profileOf([answer({ id: "a", canonicalKey: "skills.weaknesses", askedAs: ["W?"], text: "Impatience." })]), req({ canonicalKey: null })),
    });
    assert.match(prompt, /mark everything else as a gap/);
  });

  it("demands markers rather than invention in the system prompt", () => {
    assert.match(DRAFT_SYSTEM, /\[\[NEED: what is missing\]\]/);
    assert.match(DRAFT_SYSTEM, /Plausibility is not evidence/);
    assert.match(DRAFT_SYSTEM, /injection_suspected/);
  });
});

describe("ungrounded-number suspicion", () => {
  it("flags a figure that appears in no source", () => {
    // The fabrication that matters most on a job application.
    assert.equal(
      suspectUngroundedNumbers("I grew revenue by 47% in eight months.", "I led the migration with six people."),
      true,
    );
  });

  it("accepts a figure copied from a source", () => {
    assert.equal(
      suspectUngroundedNumbers("I cut it from 2.41 to 1.10 days.", "Review time went from 2.41 to 1.10 days per case."),
      false,
    );
  });

  it("tolerates thousands separators differing from the source", () => {
    assert.equal(suspectUngroundedNumbers("300,000 people", "for 300000 people"), false);
  });

  it("ignores small numbers, which are usually prose", () => {
    assert.equal(suspectUngroundedNumbers("There were 6 of us.", "a small team"), false);
  });

  it("says nothing when the draft has no figures", () => {
    assert.equal(suspectUngroundedNumbers("No numbers here at all.", "sources"), false);
  });
});
