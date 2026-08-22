import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GENRES,
  INTERVIEW_QUESTIONS,
  INTERVIEW_SECTIONS,
  SENDABLE_KEYS,
  classifyEgress,
  interviewCanonicalKeys,
  interviewFactKeys,
  normaliseQuestion,
} from "../src/index.ts";

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
    for (const q of INTERVIEW_QUESTIONS) {
      assert.ok(q.prompt.en && q.prompt.es, `${q.canonicalKey} prompt is not bilingual`);
      assert.ok(q.why.en && q.why.es, `${q.canonicalKey} rationale is not bilingual`);
    }
  });

  it("declares a real genre and a usable target length for every question", () => {
    for (const q of INTERVIEW_QUESTIONS) {
      assert.ok(GENRES.includes(q.genre), `${q.canonicalKey} has genre ${q.genre}`);
      // Seeded answers double as voice exemplars, so a one-line target would
      // teach the wrong sentence rhythm.
      assert.ok(
        q.suggestedWords >= 80 && q.suggestedWords <= 400,
        `${q.canonicalKey} suggests ${q.suggestedWords} words, which is not a usable exemplar`,
      );
    }
  });

  it("asks each question distinguishably in both languages", () => {
    // Two questions whose normalised forms collide would map to one alias and
    // silently overwrite each other in the index.
    for (const lang of ["en", "es"] as const) {
      const normalised = INTERVIEW_QUESTIONS.map((q) => normaliseQuestion(q.prompt[lang]));
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
