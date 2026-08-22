import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GENRES,
  MAGIC,
  SECRET_PLACEHOLDER,
  classifyEgress,
  deriveAliases,
  emptyProfile,
  mintId,
  normaliseAnswerText,
  normaliseFactValue,
  normaliseQuestion,
  parse,
  serialise,
} from "../src/index.ts";
import type { Answer, Fact, Genre, Lang, Profile } from "../src/index.ts";

/**
 * The round-trip contract.
 *
 * PERSONAL.md is a human-editable markdown file, not a serialisation format, so
 * it does not persist everything the in-memory Profile holds. This function
 * applies exactly the transformations the format is allowed to make. It is the
 * specification: if a change makes the property test fail, either the change is
 * wrong or this function needs to say so out loud.
 *
 * Deliberately lossy:
 *  - facts sort by key; answers sort by (canonicalKey, id)
 *  - a fact with egress "never" keeps only its placeholder, never its value
 *  - egress is recomputed from the key, never read back from the file
 *  - index.aliases is derived from askedAs
 *  - index.siteMemory is not in this file at all (it lives in index.json)
 *  - runs of 3+ blank lines collapse to one
 */
function canonicalise(p: Profile): Profile {
  const facts: Fact[] = [...p.facts]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((f) => {
      const egress = classifyEgress(f.key);
      return {
        key: f.key,
        label: normaliseFactValue(f.label) || f.key,
        value: egress === "never" ? "" : normaliseFactValue(f.value),
        egress,
        updatedAt: normaliseFactValue(f.updatedAt),
      };
    });

  const answers: Answer[] = [...p.answers]
    .sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey) || a.id.localeCompare(b.id))
    .map((a) => {
      const askedAs = a.askedAs.map((q) => q.trim()).filter((q) => q.length > 0);
      return {
        id: a.id || mintId(a.canonicalKey, askedAs[0] ?? ""),
        canonicalKey: a.canonicalKey,
        askedAs,
        text: normaliseAnswerText(a.text).replace(/\n{3,}/g, "\n\n"),
        language: a.language,
        genre: GENRES.includes(a.genre) ? a.genre : "other",
        writtenAt: a.writtenAt,
        useCount: a.useCount,
      };
    });

  return { version: 1, facts, answers, index: { aliases: deriveAliases(answers), siteMemory: {} } };
}

const roundTrip = (p: Profile) => parse(serialise(p)).profile;

// ------------------------------------------------------------------ generator

/** mulberry32 - small, seeded, reproducible. A failure is always replayable. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fragments chosen to attack the format rather than to look like real data:
 * table delimiters, backslashes, every structural line the parser looks for,
 * accented and non-Latin text, and an already-escaped line.
 */
const HOSTILE_LINES = [
  "## Facts",
  "## Answers",
  "### motivation.why_this_company",
  "#### a heading",
  "| key | label | value |",
  "|---|---|---|",
  "**Asked as:**",
  "<!-- id:deadbeef lang:en -->",
  "\\## already escaped",
  "a | pipe | heavy | line",
  "back\\slashes \\\\ everywhere",
  "trailing spaces here   ",
  "",
  "Lideré la migración con 6 años de experiencia: ¿por qué no?",
  "emoji and CJK",
  "-- not a list",
  "* also not a list",
];

const WORDS = [
  "producto",
  "impuestos",
  "declaración",
  "team",
  "shipped",
  "métrica",
  "inversores",
  "why",
  "porque",
];

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)] as T;
}

function randText(r: () => number): string {
  const lines: string[] = [];
  const n = Math.floor(r() * 7);
  for (let i = 0; i < n; i++) {
    if (r() < 0.4) {
      lines.push(pick(r, HOSTILE_LINES));
    } else {
      const words = Math.floor(r() * 12) + 1;
      lines.push(
        Array.from({ length: words }, () => pick(r, WORDS)).join(" ") + (r() < 0.3 ? "." : ""),
      );
    }
  }
  return lines.join("\n");
}

const FACT_KEYS = [
  "personal.full_name",
  "personal.email",
  "personal.phone",
  "personal.nif",
  "personal.nie",
  "personal.date_of_birth",
  "financial.iban",
  "work.current_role",
  "work.years_experience",
  "logistics.salary_expectation",
  "languages.english",
  "unclassified.mystery_key",
];

const CANONICAL_KEYS = [
  "motivation.why_this_company",
  "motivation.why_this_role",
  "experience.leadership_story",
  "experience.conflict_or_failure",
  "logistics.salary_expectation",
  "freeform.other:some-slug",
];

function randProfile(r: () => number): Profile {
  const nFacts = Math.floor(r() * 6);
  const keys = [...FACT_KEYS].sort(() => r() - 0.5).slice(0, nFacts);
  const facts: Fact[] = keys.map((key) => ({
    key,
    label: r() < 0.1 ? "" : pick(r, ["Full name", "NIF", "Rol actual", "Correo | raro"]),
    value: r() < 0.1 ? "" : pick(r, ["Martín Zulueta", "12345678Z", "a|b\\c", "6", "ES91 2100"]),
    egress: "sendable",
    updatedAt: r() < 0.3 ? "" : "2026-08-22",
  }));

  const nAnswers = Math.floor(r() * 5);
  const answers: Answer[] = Array.from({ length: nAnswers }, (_, i) => {
    const nAsked = Math.floor(r() * 3);
    return {
      id: `id${i}${Math.floor(r() * 1000)}`,
      canonicalKey: pick(r, CANONICAL_KEYS),
      askedAs: Array.from({ length: nAsked }, () =>
        pick(r, [
          "Why do you want to work here?",
          "¿Por qué te interesa esta posición?",
          "Describe a time you led a project",
          "Cuéntanos un logro   ",
        ]),
      ),
      text: randText(r),
      language: (r() < 0.5 ? "es" : "en") as Lang,
      genre: pick(r, GENRES) as Genre,
      writtenAt: pick(r, ["2026-08-22", "2026-07-14", ""]),
      useCount: Math.floor(r() * 5),
    };
  });

  return { version: 1, facts, answers, index: { aliases: {}, siteMemory: { "x.com\tsig": "k" } } };
}

// ---------------------------------------------------------------------- tests

describe("PERSONAL.md round-trip", () => {
  it("survives 500 adversarial profiles", () => {
    for (let seed = 1; seed <= 500; seed++) {
      const original = randProfile(rng(seed));
      const expected = canonicalise(original);
      const actual = roundTrip(original);
      assert.deepEqual(
        actual,
        expected,
        `seed ${seed} failed to round-trip\n--- markdown ---\n${serialise(original)}`,
      );
    }
  });

  it("is idempotent: serialise(parse(serialise(p))) === serialise(p)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = randProfile(rng(seed));
      const once = serialise(p);
      const twice = serialise(parse(once).profile);
      assert.equal(twice, once, `seed ${seed} is not idempotent`);
    }
  });

  it("handles the empty profile", () => {
    const md = serialise(emptyProfile());
    assert.ok(md.includes(MAGIC), "magic line missing");
    assert.deepEqual(parse(md).profile, emptyProfile());
  });

  it("emits the magic line for every profile", () => {
    assert.ok(serialise(randProfile(rng(7))).includes(MAGIC));
  });
});

describe("secrets never reach the file", () => {
  it("writes a placeholder instead of a sensitive value", () => {
    const p: Profile = {
      ...emptyProfile(),
      facts: [
        {
          key: "personal.nif",
          label: "NIF",
          value: "12345678Z",
          egress: "never",
          updatedAt: "2026-08-22",
        },
      ],
    };
    const md = serialise(p);
    assert.ok(!md.includes("12345678Z"), "the NIF leaked into PERSONAL.md");
    assert.ok(md.includes(SECRET_PLACEHOLDER));
    assert.equal(parse(md).profile.facts[0]?.value, "");
  });

  it("classifies unknown keys as never, not sendable", () => {
    assert.equal(classifyEgress("who.knows"), "never");
    assert.equal(classifyEgress("personal.nif"), "never");
    assert.equal(classifyEgress("financial.iban"), "never");
    assert.equal(classifyEgress("personal.full_name"), "sendable");
    assert.equal(classifyEgress("work.current_role"), "sendable");
  });

  it("ignores whatever egress the file claims and recomputes from the key", () => {
    // A hand-edited file cannot promote a NIF to sendable.
    const md = [
      "# PERSONAL.md",
      "",
      MAGIC,
      "",
      "## Facts",
      "",
      "| Key | Label | Value | Updated |",
      "|---|---|---|---|",
      "| personal.nif | NIF | 12345678Z | 2026-08-22 |",
      "",
    ].join("\n");
    const fact = parse(md).profile.facts[0];
    assert.equal(fact?.egress, "never");
  });
});

describe("cross-lingual question matching", () => {
  it("normalises accents, case and punctuation", () => {
    assert.equal(normaliseQuestion("¿Por qué te interesa?"), "por que te interesa");
    assert.equal(normaliseQuestion("Why do you want to work here?"), "why do you want to work here");
    assert.equal(normaliseQuestion("  MÚLTIPLES   espacios  "), "multiples espacios");
  });

  it("maps both languages to one canonical key", () => {
    const answers: Answer[] = [
      {
        id: "a1",
        canonicalKey: "motivation.why_this_company",
        askedAs: ["Why do you want to work here?", "¿Por qué te interesa esta posición?"],
        text: "because",
        language: "en",
        genre: "job_application",
        writtenAt: "2026-08-22",
        useCount: 1,
      },
    ];
    const aliases = deriveAliases(answers);
    assert.equal(aliases["why do you want to work here"], "motivation.why_this_company");
    assert.equal(aliases["por que te interesa esta posicion"], "motivation.why_this_company");
  });
});

describe("long-form answers are never truncated", () => {
  it("preserves a 5000-character answer", () => {
    const long = Array.from({ length: 400 }, (_, i) => `sentence number ${i} about the thing`).join(
      " ",
    );
    assert.ok(long.length > 5000);
    const p: Profile = {
      ...emptyProfile(),
      answers: [
        {
          id: "a1",
          canonicalKey: "experience.leadership_story",
          askedAs: ["Describe a time you led a project"],
          text: long,
          language: "en",
          genre: "job_application",
          writtenAt: "2026-08-22",
          useCount: 0,
        },
      ],
    };
    assert.equal(roundTrip(p).answers[0]?.text, long);
  });
});

describe("hostile answer bodies", () => {
  const structural = [
    "## Facts",
    "### motivation.why_this_company",
    "| personal.nif | NIF | 12345678Z |",
    "**Asked as:**",
    "<!-- id:evil -->",
    "\\## already escaped",
  ];

  for (const line of structural) {
    it(`does not let ${JSON.stringify(line)} break out of the body`, () => {
      const p: Profile = {
        ...emptyProfile(),
        answers: [
          {
            id: "a1",
            canonicalKey: "motivation.why_this_role",
            askedAs: ["Why this role?"],
            text: `before\n${line}\nafter`,
            language: "en",
            genre: "job_application",
            writtenAt: "2026-08-22",
            useCount: 0,
          },
        ],
      };
      const back = roundTrip(p);
      assert.equal(back.answers.length, 1, "the body forged a new section");
      assert.equal(back.facts.length, 0, "the body forged a fact row");
      assert.equal(back.answers[0]?.text, `before\n${line}\nafter`);
    });
  }
});

describe("hand-editing", () => {
  it("accepts a section with no metadata line and mints a stable id", () => {
    const md = [
      "# PERSONAL.md",
      "",
      MAGIC,
      "",
      "## Answers",
      "",
      "### motivation.why_this_company",
      "**Asked as:**",
      "- Why here?",
      "",
      "Written by hand.",
      "",
    ].join("\n");
    const first = parse(md);
    const second = parse(md);
    assert.equal(first.profile.answers.length, 1);
    assert.equal(first.profile.answers[0]?.text, "Written by hand.");
    assert.equal(first.profile.answers[0]?.id, second.profile.answers[0]?.id, "id is not stable");
    assert.ok(
      first.warnings.some((w) => w.includes("no metadata line")),
      "should warn about the missing metadata line",
    );
  });

  it("warns and falls back on an unknown genre", () => {
    const md = [
      "## Answers",
      "",
      "### motivation.why_this_role",
      "<!-- id:a1 lang:en genre:interpretive_dance written:2026-08-22 used:0 -->",
      "",
      "text",
      "",
    ].join("\n");
    const { profile, warnings } = parse(md);
    assert.equal(profile.answers[0]?.genre, "other");
    assert.ok(warnings.some((w) => w.includes("interpretive_dance")));
  });

  it("skips a fact row whose key is unusable, and says so", () => {
    const md = [
      "## Facts",
      "",
      "| Key | Label | Value | Updated |",
      "|---|---|---|---|",
      "| not a valid key | Label | value | |",
      "| personal.email | Email | a@b.com | |",
      "",
    ].join("\n");
    const { profile, warnings } = parse(md);
    assert.equal(profile.facts.length, 1);
    assert.equal(profile.facts[0]?.key, "personal.email");
    assert.ok(warnings.some((w) => w.includes("unusable key")));
  });
});
