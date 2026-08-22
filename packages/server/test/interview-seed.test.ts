/**
 * Drives the whole interview catalogue through the real store and checks what
 * ends up on disk.
 *
 * This is the test that would have caught the egress mistake. The catalogue asks
 * for a NIF, an email, a phone number and a home address, so it is exactly the
 * input that proves the allowlist holds in practice rather than in a unit test.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import {
  INTERVIEW_QUESTIONS,
  INTERVIEW_SECTIONS,
  classifyEgress,
  normaliseQuestion,
} from "@personal-md/core";

import { Store } from "../src/store.ts";
import { paths } from "../src/paths.ts";
import { assertSafeToSend } from "../src/egress.ts";

/** Realistic answers, so the assertions are about behaviour not placeholders. */
const FACT_VALUES: Record<string, string> = {
  "personal.full_name": "Martin Zulueta",
  "personal.email": "martin@example.com",
  "personal.phone": "+34 600 123 456",
  "personal.nif": "12345678Z",
  "personal.city": "Madrid",
  "personal.address_exact": "Calle Falsa 123, 4B, 28001 Madrid",
  "work.current_role": "Product Manager",
  "work.current_employer": "TaxDown",
  "work.years_experience": "6",
  "work.domain": "fintech, tax",
  "work.notice_period": "15 days",
  "logistics.salary_expectation": "70.000 EUR",
  "logistics.availability": "1 month",
  "logistics.remote_preference": "hybrid, 2 days office",
  "logistics.work_authorisation": "EU citizen",
  "languages.spoken": "Spanish native, English C1",
  "education.highest_level": "Licenciatura",
  "education.field": "Business Administration",
  "education.institution": "Universidad Complutense",
};

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
        value: FACT_VALUES[fact.key] ?? "",
        updatedAt: "",
      })),
    );
  }

  // Then each open question, in English, as the interview does.
  for (const question of INTERVIEW_QUESTIONS) {
    await store.recordAnswer({
      canonicalKey: question.canonicalKey,
      question: question.prompt.en,
      text: `A realistic answer to ${question.canonicalKey} with a concrete figure: 300,000 users.`,
      language: "en",
      genre: question.genre,
    });
  }
});

after(() => {
  delete process.env["PERSONAL_MD_HOME"];
});

describe("a completed interview produces a usable profile", () => {
  it("stores every fact and every answer", async () => {
    const { profile } = await store.load();
    const expectedFacts = INTERVIEW_SECTIONS.flatMap((s) => s.facts).length;
    assert.equal(profile.facts.length, expectedFacts);
    assert.equal(profile.answers.length, INTERVIEW_QUESTIONS.length);
  });

  it("keeps every withheld value out of PERSONAL.md", async () => {
    const md = await readFile(paths.profile, "utf8");
    const leaked: string[] = [];
    for (const [key, value] of Object.entries(FACT_VALUES)) {
      if (classifyEgress(key) === "never" && value && md.includes(value)) leaked.push(key);
    }
    assert.deepEqual(leaked, [], `these withheld values were written to the file: ${leaked}`);

    // Specifically the ones an earlier prefix rule got wrong.
    assert.ok(!md.includes("12345678Z"), "NIF leaked");
    assert.ok(!md.includes("martin@example.com"), "email leaked");
    assert.ok(!md.includes("+34 600 123 456"), "phone leaked");
    assert.ok(!md.includes("Calle Falsa 123"), "home address leaked");
  });

  it("still writes the values that shape drafted prose", async () => {
    const md = await readFile(paths.profile, "utf8");
    for (const key of ["work.current_role", "work.years_experience", "logistics.salary_expectation"]) {
      const value = FACT_VALUES[key] as string;
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
    // The realistic drafting payload: sendable facts plus the answers, which is
    // what the guard will actually see. It must not trip on ordinary data.
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
  });

  it("makes every seeded question free to recognise, in both languages", async () => {
    const { profile } = await store.load();

    // English was what the interview submitted, so those aliases exist now.
    for (const question of INTERVIEW_QUESTIONS) {
      assert.equal(
        profile.index.aliases[normaliseQuestion(question.prompt.en)],
        question.canonicalKey,
        `${question.canonicalKey} is not recognisable from its English prompt`,
      );
    }

    // The Spanish surface form is learned the first time it is seen, and from
    // then on resolves for free. Simulate meeting it on a form.
    const first = INTERVIEW_QUESTIONS[0]!;
    await store.recordAnswer({
      canonicalKey: first.canonicalKey,
      question: first.prompt.es,
      text: "",
      language: "es",
      genre: first.genre,
    });

    const after = await store.load();
    assert.equal(
      after.profile.index.aliases[normaliseQuestion(first.prompt.es)],
      first.canonicalKey,
      "the Spanish form should now resolve to the same answer",
    );
    const answer = after.profile.answers.find((a) => a.canonicalKey === first.canonicalKey);
    assert.equal(answer?.askedAs.length, 2, "both surface forms should be remembered");
    assert.ok(answer?.text.includes("300,000"), "an empty submission must not wipe the answer");
  });
});
