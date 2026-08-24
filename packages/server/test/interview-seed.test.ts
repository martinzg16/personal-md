/**
 * Drives the whole interview catalogue through the real store and checks what
 * ends up on disk.
 *
 * This is the test that would have caught the egress mistake. The catalogue asks
 * for a NIF, an email, a phone number and a home address, so it is exactly the
 * input that proves the allowlist holds in practice rather than in a unit test.
 *
 * It matters more now than it did. The interview stopped asking for prose and
 * started collecting declaration atoms - twenty-odd new keys that all have to be
 * sendable, because a draft assembles from them, while the identity facts beside
 * them all have to stay off disk. Those two requirements point in opposite
 * directions and the atoms were added by hand to `SENDABLE_KEYS`, so the thing
 * worth testing is the whole catalogue at once, driven the way the UI drives it.
 *
 * Values for the atoms are generated from the catalogue rather than listed here,
 * so a future atom is covered by this test the day it is added.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import {
  INTERVIEW_DECLARATIONS,
  INTERVIEW_SECTIONS,
  REGISTER_FACT,
  classifyEgress,
  normaliseQuestion,
  type InterviewFact,
} from "@personal-md/core";

import { Store } from "../src/store.ts";
import { paths } from "../src/paths.ts";
import { assertSafeToSend } from "../src/egress.ts";

/**
 * Realistic answers for the typed fields, so the assertions are about behaviour
 * and not placeholders. The withheld ones are deliberately distinctive strings:
 * every leak assertion below is a substring search for one of them.
 */
const TYPED: Record<string, string> = {
  "personal.full_name": "Martin Zulueta",
  "personal.email": "martin@example.com",
  "personal.phone": "+34 600 123 456",
  "personal.nif": "12345678Z",
  "personal.city": "Madrid",
  "personal.address_exact": "Calle Falsa 123, 4B, 28001 Madrid",
  "work.current_role": "Product Manager",
  "work.current_employer": "TaxDown",
  "work.years_experience": "6",
  "education.field": "Business Administration",
  "education.institution": "Universidad Complutense",
  "experience.leadership.project": "checkout migration",
  "experience.leadership.team_size": "6",
  "experience.impact.metric": "conversion to payment",
  "experience.impact.from": "22%",
  "experience.impact.to": "31%",
};

/** What the UI would store for a field: a marked option, or the typed value. */
function valueFor(fact: InterviewFact): string {
  if (fact.input === "choice") return fact.options?.[0]?.label.en ?? "";
  if (fact.input === "multi") {
    // Two marked, which is what a real answer looks like and also exercises the
    // comma-joined form the file has to round-trip.
    return (fact.options ?? [])
      .slice(0, Math.min(2, fact.max ?? 2))
      .map((o) => o.label.en)
      .join(", ");
  }
  return TYPED[fact.key] ?? "";
}

const everyAtom = (): InterviewFact[] => [
  ...INTERVIEW_DECLARATIONS.flatMap((d) => d.atoms),
  REGISTER_FACT,
];

let store: Store;

before(async () => {
  process.env["PERSONAL_MD_HOME"] = await mkdtemp(join(tmpdir(), "personal-md-interview-"));
  store = new Store();
  await store.init();

  // Facts, section by section, exactly as the UI saves them.
  for (const section of INTERVIEW_SECTIONS) {
    await store.upsertFacts(
      section.facts.map((fact) => ({
        key: fact.key,
        label: fact.label.en,
        value: valueFor(fact),
        updatedAt: "",
      })),
    );
  }

  // Then each declaration's atoms, one write per page, as the UI does.
  for (const declaration of INTERVIEW_DECLARATIONS) {
    if (declaration.atoms.length === 0) continue;
    await store.upsertFacts(
      declaration.atoms.map((atom) => ({
        key: atom.key,
        label: atom.label.en,
        value: valueFor(atom),
        updatedAt: "",
      })),
    );
  }

  await store.upsertFacts([
    {
      key: REGISTER_FACT.key,
      label: REGISTER_FACT.label.en,
      value: valueFor(REGISTER_FACT),
      updatedAt: "",
    },
  ]);

  /*
   * Exemplars, the way they actually arrive now: imported prose the person
   * already wrote, not one typed answer per question. Two of them, under two of
   * the canonical keys, which is a realistic import and not a full set.
   */
  for (const declaration of INTERVIEW_DECLARATIONS.slice(0, 2)) {
    await store.recordAnswer({
      canonicalKey: declaration.canonicalKey,
      question: declaration.prompt.en,
      text: `Prose this person actually wrote about ${declaration.canonicalKey}, with a concrete figure: 300,000 users.`,
      language: "en",
      genre: declaration.genre,
    });
  }
});

after(() => {
  delete process.env["PERSONAL_MD_HOME"];
});

describe("a completed interview produces a usable profile", () => {
  it("stores every fact, every atom and every exemplar", async () => {
    const { profile } = await store.load();
    const expected =
      INTERVIEW_SECTIONS.flatMap((s) => s.facts).length + everyAtom().length;
    assert.equal(profile.facts.length, expected);
    assert.equal(profile.answers.length, 2);
  });

  it("keeps every withheld value out of PERSONAL.md", async () => {
    const md = await readFile(paths.profile, "utf8");
    const leaked: string[] = [];
    for (const [key, value] of Object.entries(TYPED)) {
      if (classifyEgress(key) === "never" && value && md.includes(value)) leaked.push(key);
    }
    assert.deepEqual(leaked, [], `these withheld values were written to the file: ${leaked}`);

    // Specifically the ones an earlier prefix rule got wrong.
    assert.ok(!md.includes("12345678Z"), "NIF leaked");
    assert.ok(!md.includes("martin@example.com"), "email leaked");
    assert.ok(!md.includes("+34 600 123 456"), "phone leaked");
    assert.ok(!md.includes("Calle Falsa 123"), "home address leaked");
  });

  it("writes every declaration atom, because a draft is assembled from them", async () => {
    // The inverse of the leak test, and the reason it exists: an atom the guard
    // withholds never reaches a prompt, so the page that collected it was a waste
    // of the user's time - and nothing would say so.
    const { profile } = await store.load();
    for (const atom of everyAtom()) {
      const stored = profile.facts.find((f) => f.key === atom.key);
      assert.ok(stored, `${atom.key} was not stored at all`);
      assert.equal(
        stored.egress,
        "sendable",
        `${atom.key} was stored as withheld, so drafting cannot use it`,
      );
    }
  });

  it("still writes the values that shape drafted prose", async () => {
    const md = await readFile(paths.profile, "utf8");
    for (const key of [
      "work.current_role",
      "work.years_experience",
      "experience.impact.metric",
      "experience.leadership.project",
    ]) {
      const value = TYPED[key] as string;
      assert.ok(md.includes(value), `${key} should be readable in the file`);
    }
  });

  it("keeps withheld values available for local filling", async () => {
    const { profile } = await store.load();
    const nif = profile.facts.find((f) => f.key === "personal.nif");
    const email = profile.facts.find((f) => f.key === "personal.email");
    assert.equal(nif?.value, "12345678Z", "needed to fill an AEAT form");
    assert.equal(email?.value, "martin@example.com", "needed to fill an email field");
    assert.equal(nif?.egress, "never");
    assert.equal(email?.egress, "never");
  });

  it("survives a prompt built from the sendable half of the profile", async () => {
    // The realistic drafting payload: sendable facts - which now includes every
    // atom - plus the exemplars. It must not trip the guard on ordinary data.
    const { profile } = await store.load();
    const sendable = profile.facts.filter((f) => f.egress === "sendable");
    const payload = [
      "<persona>",
      ...sendable.map((f) => `${f.label}: ${f.value}`),
      "</persona>",
      "<exemplars>",
      ...profile.answers.map((a) => a.text),
      "</exemplars>",
    ].join("\n");

    assert.doesNotThrow(() => assertSafeToSend(payload));
    assert.ok(!payload.includes("12345678Z"));
    assert.ok(!payload.includes("martin@example.com"));
    // And the material is genuinely in there, or the guard passing means nothing.
    assert.ok(payload.includes("conversion to payment"));
    assert.ok(payload.includes("checkout migration"));
  });

  it("makes an imported exemplar free to recognise in both languages", async () => {
    const { profile } = await store.load();
    const seeded = INTERVIEW_DECLARATIONS.slice(0, 2);

    // English was what the import submitted, so those aliases exist now.
    for (const declaration of seeded) {
      assert.equal(
        profile.index.aliases[normaliseQuestion(declaration.prompt.en)],
        declaration.canonicalKey,
        `${declaration.canonicalKey} is not recognisable from its English prompt`,
      );
    }

    // The Spanish surface form is learned the first time it is seen, and from
    // then on resolves for free. Simulate meeting it on a form.
    const first = seeded[0]!;
    await store.recordAnswer({
      canonicalKey: first.canonicalKey,
      question: first.prompt.es,
      text: "",
      language: "es",
      genre: first.genre,
    });

    const later = await store.load();
    assert.equal(
      later.profile.index.aliases[normaliseQuestion(first.prompt.es)],
      first.canonicalKey,
      "the Spanish form should now resolve to the same answer",
    );
    const answer = later.profile.answers.find((a) => a.canonicalKey === first.canonicalKey);
    assert.equal(answer?.askedAs.length, 2, "both surface forms should be remembered");
    assert.ok(answer?.text.includes("300,000"), "an empty submission must not wipe the answer");
  });
});
