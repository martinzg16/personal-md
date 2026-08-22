/**
 * The canonical question taxonomy.
 *
 * This is what makes cross-lingual matching cheap. Rather than comparing an
 * incoming question against every stored question - O(N) semantics on every form
 * open - a question is classified once into a small closed set, and the surface
 * form is then remembered as an alias. "Why do you want to work here?" and
 * "¿Por qué te interesa esta posición?" both land on
 * `motivation.why_this_company`, and from then on both are free.
 *
 * The set is closed enough to classify against and open enough to grow: the
 * classifier may mint `freeform.other:<slug>` for a recurring question that fits
 * nothing here, which is how the taxonomy extends without a migration.
 *
 * Descriptions are written for the classifier, not for a person. They state what
 * a truthful answer would contain, because that is the test for whether two
 * differently-worded questions are the same question.
 */

import type { Genre } from "./types.ts";

export interface CanonicalQuestion {
  key: string;
  /** Written for the model: what a truthful answer to this contains. */
  description: string;
  /** Where this question typically appears. Used to bias, never to exclude. */
  genres: Genre[];
}

export const FREEFORM_PREFIX = "freeform.other:";

export const TAXONOMY: CanonicalQuestion[] = [
  {
    key: "experience.relevant_background",
    description:
      "A summary of who the person is professionally and what they have done. Covers 'tell us about yourself', 'describe your background', 'introduce yourself'.",
    genres: ["job_application", "profile"],
  },
  {
    key: "motivation.why_this_company",
    description:
      "Why the person wants to work at this particular organisation. About the company, not the role.",
    genres: ["job_application"],
  },
  {
    key: "motivation.why_this_role",
    description:
      "Why the person wants this particular job or function, and why now. About the role, not the company.",
    genres: ["job_application"],
  },
  {
    key: "experience.leadership_story",
    description:
      "A specific occasion when the person led something: a project, a team, an initiative. Expects a narrative with an outcome.",
    genres: ["job_application"],
  },
  {
    key: "experience.conflict_or_failure",
    description:
      "A specific occasion when something went wrong, was difficult, or involved disagreement, and what the person did about it.",
    genres: ["job_application"],
  },
  {
    key: "experience.metric_impact",
    description:
      "The measurable impact the person has had. Expects a concrete number or outcome they are proud of.",
    genres: ["job_application"],
  },
  {
    key: "experience.technical_decision",
    description:
      "A specific technical or product trade-off the person made, the options considered, and why they chose as they did.",
    genres: ["job_application"],
  },
  {
    key: "skills.strengths",
    description: "What the person is unusually good at, or considers their strongest skills.",
    genres: ["job_application"],
  },
  {
    key: "skills.weaknesses",
    description:
      "What the person is working on improving, finds hard, or considers a development area.",
    genres: ["job_application"],
  },
  {
    key: "skills.relevant_to_role",
    description:
      "Why the person's specific skills or experience fit this role's requirements. A match argument rather than a general strengths list.",
    genres: ["job_application"],
  },
  {
    key: "logistics.salary_expectation",
    description: "What the person expects to be paid, as a figure or a range.",
    genres: ["job_application"],
  },
  {
    key: "logistics.availability",
    description: "When the person can start, or their notice period.",
    genres: ["job_application"],
  },
  {
    key: "logistics.location",
    description:
      "Where the person is based, whether they can work from a given location, or their remote and relocation preferences.",
    genres: ["job_application"],
  },
  {
    key: "logistics.work_authorisation",
    description:
      "Whether the person is legally allowed to work in a given place, and whether they need sponsorship or a visa.",
    genres: ["job_application"],
  },
  {
    key: "gov.employment_status",
    description:
      "The person's employment situation for an official form: employed, self-employed, unemployed, student.",
    genres: ["gov_survey", "personal_info"],
  },
  {
    key: "gov.household_composition",
    description:
      "Who lives in the person's household, dependants, or family situation, for an official form.",
    genres: ["gov_survey", "personal_info"],
  },
  {
    key: "gov.income_source",
    description:
      "Where the person's income comes from, for an official or tax form: salary, self-employment, investments, property.",
    genres: ["gov_survey", "personal_info"],
  },
  {
    key: "feedback.general",
    description:
      "Open-ended feedback, comments, or anything else the person wants to add. The catch-all box at the end of a form.",
    genres: ["survey", "job_application", "other"],
  },
];

export const TAXONOMY_KEYS: readonly string[] = TAXONOMY.map((q) => q.key);

const SLUG_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export const isFreeformKey = (key: string): boolean => key.startsWith(FREEFORM_PREFIX);

/** A key is valid if it is in the taxonomy, or a well-formed freeform key. */
export function isValidCanonicalKey(key: string): boolean {
  if (TAXONOMY_KEYS.includes(key)) return true;
  if (!isFreeformKey(key)) return false;
  return SLUG_RE.test(key.slice(FREEFORM_PREFIX.length));
}

/** Build a freeform key from a model-supplied slug, or null if unusable. */
export function freeformKey(slug: string): string | null {
  const clean = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!clean || !SLUG_RE.test(clean)) return null;
  return `${FREEFORM_PREFIX}${clean}`;
}

/** Compact rendering of the taxonomy for a prompt. */
export function taxonomyForPrompt(): string {
  return TAXONOMY.map((q) => `${q.key}: ${q.description}`).join("\n");
}

export const describeKey = (key: string): string =>
  TAXONOMY.find((q) => q.key === key)?.description ??
  (isFreeformKey(key) ? `A recurring question the person has answered before (${key}).` : key);
