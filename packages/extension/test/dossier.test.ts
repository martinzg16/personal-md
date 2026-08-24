/**
 * What the document says about itself has to be true, so the derivation is
 * tested rather than eyeballed. The issuance sequence is the most persuasive
 * thing on the surface and it is assembled entirely from this module: a clause
 * that appears without the fact behind it is not a copy bug, it is the product
 * telling somebody their file contains something it does not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { emptyProfile, type Profile } from "@personal-md/core";

import { readDossier, scopeNote } from "../lib/document/dossier.ts";

const withFacts = (facts: [string, string][], at = "2026-08-14T09:00:00.000Z"): Profile => ({
  ...emptyProfile(),
  facts: facts.map(([key, value]) => ({
    key,
    label: key,
    value,
    egress: "sendable" as const,
    updatedAt: at,
  })),
});

test("an empty profile claims nothing", () => {
  const d = readDossier(emptyProfile(), [], "es");
  assert.equal(d.holder, null);
  assert.equal(d.language, null);
  assert.equal(d.firstRecordedAt, null);
  assert.equal(d.revisedAt, null);
  assert.equal(d.extent.facts, 0);
  assert.equal(d.complete, false);
  assert.equal(scopeNote(emptyProfile(), d, "es"), "Documento sin contenido. Nada que describir todavía.");
});

test("a draft value counts toward the document on screen", () => {
  const profile = withFacts([["personal.email", "a@b.es"]]);
  const before = readDossier(profile, [], "es");
  const after = readDossier(profile, [], "es", { "personal.full_name": "Ada Byron" });
  assert.equal(before.holder, null);
  assert.equal(after.holder, "Ada Byron");
  assert.equal(after.extent.facts, before.extent.facts + 1);
});

test("a draft never invents a date, because it is not in the file", () => {
  const d = readDossier(emptyProfile(), [], "es", { "personal.full_name": "Ada Byron" });
  assert.equal(d.holder, "Ada Byron");
  // The name is on screen, so the line fills - but nothing has been written, so
  // the document has no first-recorded date to report.
  assert.equal(d.firstRecordedAt, null);
  assert.equal(d.revisedAt, null);
});

test("clearing a field clears it on screen too", () => {
  const profile = withFacts([["personal.full_name", "Ada Byron"]]);
  assert.equal(readDossier(profile, [], "es").holder, "Ada Byron");
  assert.equal(readDossier(profile, [], "es", { "personal.full_name": "" }).holder, null);
});

test("outstanding fields are named, not just counted", () => {
  const d = readDossier(withFacts([["personal.full_name", "Ada Byron"]]), [], "en");
  assert.equal(d.outstanding.some((o) => o.key === "personal.full_name"), false);
  const email = d.outstanding.find((o) => o.key === "personal.email");
  assert.ok(email, "an unwritten field should be listed");
  assert.equal(email.label.en, "Email");
  assert.equal(email.label.es, "Correo");
});

test("the language of issue is only claimed once something is written in it", () => {
  const facts = withFacts([["personal.full_name", "Ada Byron"]]);
  assert.equal(readDossier(facts, [], "es").language, null);

  const withAnswer: Profile = {
    ...facts,
    answers: [
      {
        id: "a1",
        canonicalKey: "skills.strengths",
        askedAs: [],
        text: "Dos palabras",
        language: "es",
        genre: "job_application",
        writtenAt: "2026-08-16T10:00:00.000Z",
        useCount: 0,
      },
    ],
  };
  assert.equal(readDossier(withAnswer, [], "es").language, "spa");
  assert.equal(readDossier(withAnswer, [], "en").language, "eng");
});

test("the scope note drops the clause when the fact is absent", () => {
  const profile = withFacts([["work.current_role", "Product Manager"]]);
  const d = readDossier(profile, [], "en");
  const note = scopeNote(profile, d, "en");
  assert.match(note, /Product Manager/);
  // No years fact, so no years clause, and nothing invented in its place.
  assert.doesNotMatch(note, /years/);
  assert.doesNotMatch(note, /undefined|NaN|null/);
});

test("every clause in the scope note is a capitalised sentence", () => {
  const profile = withFacts([
    ["work.current_role", "Product Manager"],
    ["work.years_experience", "8"],
    ["work.domain", "fintech, tax"],
    ["languages.spoken", "Spanish native, English C1"],
  ]);
  for (const lang of ["es", "en"] as const) {
    const note = scopeNote(profile, readDossier(profile, [], lang), lang);
    // The defect this guards: "...8 years' experience. working in fintech. languages: ..."
    for (const sentence of note.split(". ")) {
      const first = sentence.trim().charAt(0);
      assert.equal(first, first.toUpperCase(), `lower-case sentence start in ${lang}: ${sentence}`);
    }
  }
});

test("a restricted value is reported as restricted while it is still a draft", () => {
  // The condition of access has to be visible at the moment the user is deciding
  // whether to type a NIF at all, not after they have saved it.
  const d = readDossier(emptyProfile(), [], "es", { "personal.nif": "51234567X" });
  assert.equal(d.restricted.some((r) => r.key === "personal.nif"), true);
});
