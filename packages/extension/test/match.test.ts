/**
 * Deterministic matching: scanned fields against the stored profile, with no
 * model call anywhere.
 *
 * Fields are constructed directly rather than scanned, because jsdom has no
 * layout and would report everything as invisible - and `visible` is precisely
 * what the matcher gates on. Scanning is covered in scan.test.ts.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyEgress, emptyProfile, type Answer, type Fact, type Profile } from "@personal-md/core";
import { deriveAliases } from "@personal-md/core";

import { matchFields, signatureOf } from "../lib/match/deterministic.ts";
import { splitName } from "../lib/scan/bridge.ts";
import type { FieldCategory, ScannedField } from "../lib/scan/types.ts";

let seq = 0;

function field(category: FieldCategory, over: Partial<ScannedField> = {}): ScannedField {
  return {
    id: `f${++seq}`,
    element: null as unknown as HTMLElement,
    tag: "input",
    inputType: "text",
    name: "",
    htmlId: "",
    label: "",
    labelSource: "label[for]",
    placeholder: "",
    autocomplete: "",
    ariaLabel: "",
    value: "",
    required: false,
    disabled: false,
    readOnly: false,
    maxLength: null,
    visible: true,
    category,
    confidence: 1,
    group: null,
    ...over,
  };
}

function fact(key: string, value: string, label = key): Fact {
  return { key, label, value, egress: classifyEgress(key), updatedAt: "2026-08-22" };
}

function answer(canonicalKey: string, text: string, askedAs: string[]): Answer {
  return {
    id: canonicalKey.slice(0, 6),
    canonicalKey,
    askedAs,
    text,
    language: "en",
    genre: "job_application",
    writtenAt: "2026-08-22",
    useCount: 1,
  };
}

function profileWith(facts: Fact[], answers: Answer[] = []): Profile {
  const p: Profile = { ...emptyProfile(), facts, answers };
  p.index.aliases = deriveAliases(answers);
  return p;
}

describe("short fields fill from stored facts", () => {
  const profile = profileWith([
    fact("personal.email", "martin@example.com", "Email"),
    fact("personal.nif", "12345678Z", "NIF"),
    fact("work.current_role", "Product Manager", "Current role"),
    fact("personal.full_name", "Martin Zulueta Perez", "Full name"),
  ]);

  it("matches a category to the fact key that answers it", () => {
    const { fills } = matchFields([field("personal.email"), field("work.title")], profile);
    assert.deepEqual(
      fills.map((f) => [f.category, f.value, f.sourceKey]),
      [
        ["personal.email", "martin@example.com", "personal.email"],
        ["work.title", "Product Manager", "work.current_role"],
      ],
    );
  });

  it("fills a withheld value locally and flags it", () => {
    // The point of the whole egress design: a NIF is usable here precisely
    // because this path makes no model call.
    const { fills } = matchFields([field("personal.nif")], profile);
    assert.equal(fills[0]?.value, "12345678Z");
    assert.equal(fills[0]?.localOnly, true, "must be labelled as never-sent");
  });

  it("does not flag an ordinary value as local-only", () => {
    const { fills } = matchFields([field("work.title")], profile);
    assert.equal(fills[0]?.localOnly, false);
  });

  it("reports what the field already contains rather than overwriting blindly", () => {
    const { fills } = matchFields(
      [field("personal.email", { value: "old@example.com" })],
      profile,
    );
    assert.equal(fills[0]?.currentValue, "old@example.com");
  });

  it("derives a first and last name from the stored full name", () => {
    const { fills } = matchFields(
      [field("personal.name.first"), field("personal.name.last")],
      profile,
    );
    assert.deepEqual(
      fills.map((f) => [f.value, f.confidence, f.derivedFrom]),
      [
        ["Martin", 0.8, "personal.full_name"],
        // Two surnames, the Spanish convention: "last token" would be wrong.
        ["Zulueta Perez", 0.8, "personal.full_name"],
      ],
    );
  });

  it("prefers a stored first name over a derived one", () => {
    const withFirst = profileWith([
      ...profile.facts,
      fact("personal.first_name", "Martín", "First name"),
    ]);
    const { fills } = matchFields([field("personal.name.first")], withFirst);
    assert.equal(fills[0]?.value, "Martín");
    assert.equal(fills[0]?.confidence, 1);
  });

  it("says nothing rather than guessing when nothing is stored", () => {
    const { fills, skipped } = matchFields([field("address.zip")], profile);
    assert.equal(fills.length, 0, "a wrong autofill gets submitted; silence does not");
    assert.match(skipped[0]?.reason ?? "", /nothing stored/);
  });
});

describe("fields it will not fill", () => {
  const profile = profileWith([fact("personal.email", "martin@example.com")]);

  for (const category of [
    "auth.password",
    "financial.card.number",
    "financial.card.cvv",
    "file.upload",
    "consent.checkbox",
    "unknown",
  ] as FieldCategory[]) {
    it(`refuses ${category}`, () => {
      const { fills } = matchFields([field(category)], profile);
      assert.equal(fills.length, 0);
    });
  }

  it("skips fields that are not on screen or not editable, with a reason", () => {
    const { fills, skipped } = matchFields(
      [
        field("personal.email", { visible: false }),
        field("personal.email", { disabled: true }),
        field("personal.email", { readOnly: true }),
      ],
      profile,
    );
    assert.equal(fills.length, 0);
    assert.deepEqual(
      skipped.map((s) => s.reason),
      ["not visible", "disabled", "read-only"],
    );
  });
});

describe("open questions", () => {
  const stored = answer("motivation.why_this_company", "Because the tax problem is interesting.", [
    "Why do you want to work here?",
    "¿Por qué te interesa esta posición?",
  ]);
  const profile = profileWith([], [stored]);

  it("reuses a stored answer when the question was seen before", () => {
    const { answers } = matchFields(
      [field("open.question", { tag: "textarea", label: "Why do you want to work here?" })],
      profile,
    );
    assert.equal(answers.length, 1);
    assert.equal(answers[0]?.text, stored.text);
    assert.equal(answers[0]?.via, "alias");
  });

  it("recognises the same question asked in the other language, for free", () => {
    // No model call: this is the payoff of canonicalising at write time.
    const { answers } = matchFields(
      [field("open.question", { tag: "textarea", label: "¿Por qué te interesa esta posición?" })],
      profile,
    );
    assert.equal(answers[0]?.canonicalKey, "motivation.why_this_company");
    assert.equal(answers[0]?.via, "alias");
  });

  it("matches through punctuation and case differences", () => {
    const { answers } = matchFields(
      [field("open.question", { tag: "textarea", label: "  why do you want to work here  " })],
      profile,
    );
    assert.equal(answers.length, 1);
  });

  it("falls back to site memory when the label was reworded", () => {
    const f = field("open.question", {
      tag: "textarea",
      label: "Tell us what draws you to us",
      name: "why_us",
      htmlId: "why_us",
    });
    const { answers } = matchFields([f], profile, {
      domain: "careers.example.com",
      siteMemory: { [`careers.example.com\t${signatureOf(f)}`]: "motivation.why_this_company" },
    });
    assert.equal(answers[0]?.via, "site-memory");
    assert.equal(answers[0]?.text, stored.text);
  });

  it("routes an unrecognised question to drafting rather than guessing", () => {
    const { answers, needsDrafting } = matchFields(
      [
        field("open.question", {
          tag: "textarea",
          label: "What is the hardest technical trade-off you have made?",
          maxLength: 1500,
        }),
      ],
      profile,
    );
    assert.equal(answers.length, 0);
    assert.equal(needsDrafting.length, 1);
    assert.equal(needsDrafting[0]?.maxLength, 1500, "the length limit must reach the drafter");
  });

  it("treats an empty stored answer as no answer", () => {
    const blank = profileWith([], [answer("skills.strengths", "", ["What are you good at?"])]);
    const { answers, needsDrafting } = matchFields(
      [field("open.question", { tag: "textarea", label: "What are you good at?" })],
      blank,
    );
    assert.equal(answers.length, 0);
    assert.equal(needsDrafting.length, 1);
  });
});

describe("site-memory signatures", () => {
  it("are stable when only the label changes", () => {
    // Which is the entire reason site memory exists.
    const before = field("open.question", { name: "why", htmlId: "why", label: "Why us?" });
    const after = { ...before, label: "What draws you to us?" };
    assert.equal(signatureOf(before), signatureOf(after));
  });

  it("differ between two different fields", () => {
    const a = field("open.question", { name: "why", htmlId: "why" });
    const b = field("open.question", { name: "led", htmlId: "led" });
    assert.notEqual(signatureOf(a), signatureOf(b));
  });
});

describe("splitName", () => {
  it("keeps both Spanish surnames together", () => {
    assert.deepEqual(splitName("Martin Zulueta Perez"), {
      first: "Martin",
      last: "Zulueta Perez",
    });
  });

  it("handles a two-part name", () => {
    assert.deepEqual(splitName("Ada Lovelace"), { first: "Ada", last: "Lovelace" });
  });

  it("returns null for a single token, rather than inventing a surname", () => {
    assert.equal(splitName("Madonna"), null);
    assert.equal(splitName(""), null);
  });
});
