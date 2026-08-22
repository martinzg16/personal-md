/**
 * The data model.
 *
 * The prior spike (~/Documents/GitHub/ai-form-filler) stored one value per
 * category: `personal.email` to `"x@y.com"`. That cannot represent
 * "Why do you want this job?" answered in three paragraphs, which is the whole
 * point of this tool. So there are two record types, not one.
 */

/** Whether a value may be included in a prompt sent to the model. */
export type Egress = "sendable" | "never";

/** Which language an answer is written in. */
export type Lang = "es" | "en";

/**
 * The kind of form an answer was written for. Register differs sharply
 * between these, so it is a first-class retrieval axis rather than a tag:
 * a Spanish government survey answer is the wrong voice model for an
 * English startup application, however well it matches on topic.
 */
export type Genre = "job_application" | "gov_survey" | "personal_info" | "other";

export const GENRES: readonly Genre[] = [
  "job_application",
  "gov_survey",
  "personal_info",
  "other",
];

/**
 * An atomic fact. Short, single-valued, filled deterministically with no
 * model call. This is the only path allowed to touch sensitive values:
 * a NIF is needed in AEAT forms, and it never enters a prompt.
 */
export interface Fact {
  /** Stable dotted key, e.g. "personal.nif", "work.current_role". */
  key: string;
  /** Human label, as shown in the editor and matched against form labels. */
  label: string;
  value: string;
  /**
   * Defaults to "never" for anything not explicitly classified. The spike's
   * equivalent check failed *open* for unknown categories, which is backwards.
   */
  egress: Egress;
  updatedAt: string;
}

/** An open-ended answer. Full text, never truncated. */
export interface Answer {
  id: string;
  /** Key from the open taxonomy, e.g. "motivation.why_this_company". */
  canonicalKey: string;
  /** Every surface form this has been asked as, in any language. */
  askedAs: string[];
  /** The answer itself. No length cap, ever. */
  text: string;
  language: Lang;
  genre: Genre;
  writtenAt: string;
  /** How often it has been reused. Used for ordering, never for relevance. */
  useCount: number;
}

/**
 * Cross-lingual question matching, resolved at write time rather than read
 * time. `aliases` maps a normalised surface form to a canonical key, so a
 * question is classified by the model exactly once and is free forever after.
 */
export interface QuestionIndex {
  /** normalised surface form to canonicalKey */
  aliases: Record<string, string>;
  /** "domain\tfieldSignature" to canonicalKey (site memory) */
  siteMemory: Record<string, string>;
}

export interface Profile {
  version: 1;
  facts: Fact[];
  answers: Answer[];
  index: QuestionIndex;
}

export function emptyProfile(): Profile {
  return { version: 1, facts: [], answers: [], index: { aliases: {}, siteMemory: {} } };
}

/** Fact keys whose values must never be sent to a model. */
export const NEVER_SEND_KEYS: readonly string[] = [
  "personal.nif",
  "personal.nie",
  "personal.dni",
  "personal.passport",
  "personal.nuss",
  "personal.social_security",
  "personal.date_of_birth",
  "personal.address_exact",
  "financial.iban",
  "financial.card_number",
  "financial.card_cvv",
  "financial.account_number",
  "health.conditions",
];

/**
 * Classify a fact key's egress. Unknown keys are "never" on purpose: a new
 * sensitive key added later is withheld by default, not leaked by default.
 */
export function classifyEgress(key: string): Egress {
  const k = key.toLowerCase();
  if (NEVER_SEND_KEYS.includes(k)) return "never";
  if (/(^|[._])(nif|nie|dni|passport|nuss|iban|cvv|card|password|token|secret)([._]|$)/.test(k)) {
    return "never";
  }
  if (/^(personal|work|education|logistics|languages|contact|motivation)\./.test(k)) {
    return "sendable";
  }
  return "never";
}
