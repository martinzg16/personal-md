import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GENRES,
  INTERVIEW_DECLARATIONS,
  INTERVIEW_SECTIONS,
  REGISTER_FACT,
  SENDABLE_KEYS,
  classifyEgress,
  declarationProgress,
  interviewCanonicalKeys,
  interviewFactKeys,
  normaliseQuestion,
  type InterviewFact,
} from "../src/index.ts";

/** Every fact the catalogue can present, sections and declarations alike. */
const everyFact = (): InterviewFact[] => [
  ...INTERVIEW_SECTIONS.flatMap((s) => s.facts),
  ...INTERVIEW_DECLARATIONS.flatMap((d) => d.atoms),
  REGISTER_FACT,
];

const KEY_RE = /^[a-z0-9_]+(?:\.[a-z0-9_:-]+)+$/;

describe("egress is a genuine allowlist", () => {
  it("withholds anything not explicitly listed", () => {
    for (const key of ["who.knows", "personal.mystery", "new.thing", "custom.field_2026"]) {
      assert.equal(classifyEgress(key), "never", `${key} should be withheld by default`);
    }
  });

  it("withholds contact details, which drafting never needs", () => {
    // These used to be sendable purely because the rule allowlisted the
    // personal.* prefix. They are filled verbatim by the deterministic matcher,
    // so withholding them costs nothing.
    for (const key of ["personal.email", "personal.phone", "personal.address_exact"]) {
      assert.equal(classifyEgress(key), "never", `${key} must not reach a prompt`);
    }
  });

  it("withholds every credential shape, even on a sendable prefix", () => {
    for (const key of [
      "personal.nif",
      "personal.nie",
      "financial.iban",
      "work.skill.password_cracking",
      "languages.token_ring",
      "motivation.my_secret",
    ]) {
      assert.equal(classifyEgress(key), "never", `${key} must not reach a prompt`);
    }
  });

  it("allows the values that actually shape prose", () => {
    for (const key of [
      "work.current_role",
      "work.years_experience",
      "logistics.salary_expectation",
      "education.highest_level",
      "personal.full_name",
      "work.skill.sql",
    ]) {
      assert.equal(classifyEgress(key), "sendable", `${key} should be usable when drafting`);
    }
  });

  it("keeps SENDABLE_KEYS self-consistent", () => {
    for (const key of SENDABLE_KEYS) {
      assert.ok(KEY_RE.test(key), `${key} is not a well-formed key`);
      assert.equal(classifyEgress(key), "sendable", `${key} is listed but classified never`);
    }
  });
});

describe("the interview catalogue is well formed", () => {
  it("uses well-formed, unique fact keys", () => {
    const keys = interviewFactKeys();
    assert.deepEqual([...new Set(keys)], keys, "duplicate fact key in the catalogue");
    for (const key of keys) assert.ok(KEY_RE.test(key), `${key} is not a well-formed key`);
  });

  it("uses well-formed, unique canonical keys", () => {
    const keys = interviewCanonicalKeys();
    assert.deepEqual([...new Set(keys)], keys, "duplicate canonical key in the catalogue");
    for (const key of keys) assert.ok(KEY_RE.test(key), `${key} is not a well-formed key`);
  });

  it("is fully bilingual", () => {
    for (const section of INTERVIEW_SECTIONS) {
      assert.ok(section.title.en && section.title.es, `${section.id} title is not bilingual`);
      assert.ok(section.blurb.en && section.blurb.es, `${section.id} blurb is not bilingual`);
      for (const fact of section.facts) {
        assert.ok(fact.label.en && fact.label.es, `${fact.key} label is not bilingual`);
        if (fact.help) {
          assert.ok(fact.help.en && fact.help.es, `${fact.key} help is not bilingual`);
        }
      }
    }
    for (const d of INTERVIEW_DECLARATIONS) {
      assert.ok(d.prompt.en && d.prompt.es, `${d.canonicalKey} prompt is not bilingual`);
      assert.ok(d.why.en && d.why.es, `${d.canonicalKey} rationale is not bilingual`);
    }
    // Every option on every tick box, too. A half-translated option list is the
    // easiest thing in this catalogue to miss and the most visible once shipped.
    for (const fact of everyFact()) {
      for (const option of fact.options ?? []) {
        assert.ok(
          option.label.en && option.label.es,
          `${fact.key} option ${option.code} is not bilingual`,
        );
      }
    }
  });

  it("declares a real genre for every declaration", () => {
    for (const d of INTERVIEW_DECLARATIONS) {
      assert.ok(GENRES.includes(d.genre), `${d.canonicalKey} has genre ${d.genre}`);
    }
  });

  it("asks for no prose anywhere", () => {
    // This is the redesign, expressed as a test. The catalogue asked for eight
    // answers of 100-180 words each, which is twelve hundred words of writing
    // before the product does anything for you. Nothing here may reintroduce
    // that: a free line is capped, and the only uncapped inputs are the typed
    // ones a browser already constrains.
    for (const fact of everyFact()) {
      assert.notEqual(fact.input as string, "textarea", `${fact.key} is a textarea`);
      if (fact.input === "text") {
        assert.ok(fact.maxLength, `${fact.key} is a free line with no cap`);
        assert.ok(
          fact.maxLength <= 120,
          `${fact.key} allows ${fact.maxLength} characters, which is a paragraph`,
        );
      }
    }
  });

  it("gives every tick box a real, unambiguous set of options", () => {
    for (const fact of everyFact()) {
      if (fact.input !== "choice" && fact.input !== "multi") {
        assert.equal(fact.options, undefined, `${fact.key} carries options it cannot show`);
        continue;
      }
      const options = fact.options ?? [];
      assert.ok(options.length >= 2, `${fact.key} offers ${options.length} options`);
      const codes = options.map((o) => o.code);
      assert.deepEqual([...new Set(codes)], codes, `${fact.key} repeats an option code`);
      for (const lang of ["en", "es"] as const) {
        const labels = options.map((o) => o.label[lang]);
        assert.deepEqual(
          [...new Set(labels)],
          labels,
          `${fact.key} repeats an option label in ${lang}`,
        );
      }
      if (fact.input === "multi") {
        assert.ok(fact.max && fact.max >= 1, `${fact.key} is multi-select with no cap`);
        assert.ok(
          fact.max < options.length,
          `${fact.key} caps at ${fact.max} of ${options.length}, which is not a choice`,
        );
      }
    }
  });

  it("keeps every atom sendable, or it was collected for nothing", () => {
    // An atom the egress guard withholds can never reach a draft, so the whole
    // reason for asking it disappears silently.
    for (const declaration of INTERVIEW_DECLARATIONS) {
      for (const atom of declaration.atoms) {
        assert.equal(
          classifyEgress(atom.key),
          "sendable",
          `${atom.key} is withheld, so drafting cannot use it`,
        );
      }
    }
    assert.equal(classifyEgress(REGISTER_FACT.key), "sendable");
  });

  it("never asks an atom that a form could be autofilled with", () => {
    // "I co-led it" typed into an employer's box would be worse than no autofill.
    // Atoms are safe because the scanner's DIRECT map does not name them, and
    // this test pins the namespaces that map deliberately avoids.
    const fillable = /^(personal|address|contact|financial)\./;
    for (const declaration of INTERVIEW_DECLARATIONS) {
      for (const atom of declaration.atoms) {
        assert.ok(!fillable.test(atom.key), `${atom.key} sits in a fillable namespace`);
      }
    }
  });

  it("derives a declaration from named keys instead of asking for it", () => {
    const derived = INTERVIEW_DECLARATIONS.filter((d) => d.derived);
    assert.ok(derived.length > 0, "nothing is derived, so the catalogue got longer not shorter");

    const asked = new Set(
      INTERVIEW_SECTIONS.flatMap((s) => s.facts.map((f) => f.key)),
    );
    for (const d of derived) {
      assert.equal(d.atoms.length, 0, `${d.canonicalKey} is derived but still asks`);
      assert.ok(d.derivedFrom?.length, `${d.canonicalKey} is derived from nothing`);
      // It can only be derived from something the interview actually collects.
      for (const key of d.derivedFrom ?? []) {
        assert.ok(asked.has(key), `${d.canonicalKey} derives from ${key}, which is never asked`);
      }
    }
  });

  it("never reports a declaration on an empty profile", () => {
    // A derived declaration used to count as complete unconditionally, so a
    // profile holding nothing at all reported one declaration on file. The
    // document may not claim what it does not hold, derived or otherwise.
    for (const d of INTERVIEW_DECLARATIONS) {
      assert.equal(
        declarationProgress(d, () => false).complete,
        false,
        `${d.canonicalKey} is complete on an empty profile`,
      );
      assert.equal(declarationProgress(d, () => true).complete, true);
    }
  });

  it("asks each question distinguishably in both languages", () => {
    // Two questions whose normalised forms collide would map to one alias and
    // silently overwrite each other in the index.
    for (const lang of ["en", "es"] as const) {
      const normalised = INTERVIEW_DECLARATIONS.map((d) => normaliseQuestion(d.prompt[lang]));
      assert.deepEqual(
        [...new Set(normalised)],
        normalised,
        `two ${lang} prompts normalise to the same alias`,
      );
    }
  });
});

describe("the interview is honest about what leaves the machine", () => {
  it("explains itself wherever it asks for a withheld value", () => {
    // If the interview asks for a NIF or a home address without saying it stays
    // local, the user has no way to know - and this is exactly the moment they
    // are deciding whether to type it.
    const sensitive = ["personal.nif", "personal.address_exact"];
    for (const section of INTERVIEW_SECTIONS) {
      for (const fact of section.facts) {
        if (!sensitive.includes(fact.key)) continue;
        const copy = `${fact.help?.en ?? ""} ${section.blurb.en}`.toLowerCase();
        assert.ok(
          /local|never sent|never included/.test(copy),
          `${fact.key} is withheld but the interview never says so`,
        );
      }
    }
  });

  it("does not ask for anything the egress guard would then block", () => {
    // A fact the guard rejects on sight would make every draft fail, so the
    // catalogue must not invite one.
    for (const key of interviewFactKeys()) {
      if (classifyEgress(key) !== "sendable") continue;
      assert.ok(
        !/nif|nie|iban|passport|card|password/.test(key),
        `${key} is sendable but looks like a credential`,
      );
    }
  });
});
