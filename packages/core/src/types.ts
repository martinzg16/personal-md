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
export type Genre =
  | "job_application"
  | "gov_survey"
  | "personal_info"
  | "survey"
  | "profile"
  | "other";

export const GENRES: readonly Genre[] = [
  "job_application",
  "gov_survey",
  "personal_info",
  "survey",
  "profile",
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

/**
 * The only fact keys whose values may appear in a prompt.
 *
 * This is an allowlist, not a denylist, and the distinction is the point. An
 * earlier version allowlisted the `personal.*` prefix, which made
 * `personal.phone` and `personal.email` sendable by accident, and would have
 * made any future `personal.<something sensitive>` sendable by default too.
 * Fail-closed means a key nobody has thought about yet is withheld.
 *
 * The membership test is narrow: does drafting *prose* need this value? A role,
 * a seniority, a language level and a salary expectation all shape an answer. A
 * phone number, an email and a national ID never do - they are filled verbatim
 * by the deterministic matcher, which makes no model call at all. So they stay
 * out, and nothing is lost by it.
 */
export const SENDABLE_KEYS: readonly string[] = [
  "personal.full_name",
  "personal.city",
  "personal.country",
  "personal.nationality",
  "personal.pronouns",
  "personal.summary",
  "work.current_role",
  "work.current_employer",
  "work.years_experience",
  "work.seniority",
  "work.domain",
  "work.notice_period",
  "education.highest_level",
  "education.field",
  "education.institution",
  "logistics.salary_expectation",
  "logistics.availability",
  "logistics.work_authorisation",
  "logistics.remote_preference",

  /*
   * The declaration atoms.
   *
   * These are the material a draft is assembled from - which project, how many
   * people, which metric, from what to what - so they have to reach the prompt or
   * they were collected for nothing.
   *
   * They are listed one by one rather than admitted by an `experience.*` /
   * `skills.*` prefix, and the verbosity is the point. A wholesale prefix would
   * promote whatever anybody adds under it later, which is exactly the mistake the
   * `personal.*` prefix already made once: it made `personal.phone` sendable by
   * accident. Adding an atom now means adding a line here, deliberately, and
   * `CREDENTIAL_SHAPED` still vetoes anything credential-looking on top.
   */
  "experience.leadership.project",
  "experience.leadership.role",
  "experience.leadership.team_size",
  "experience.leadership.duration",
  "experience.leadership.hardest",
  "experience.failure.kind",
  "experience.failure.what_i_did",
  "experience.failure.changed_after",
  "experience.impact.metric",
  "experience.impact.from",
  "experience.impact.to",
  "experience.impact.window",
  "experience.impact.contribution",
  "skills.strengths.top",
  "skills.strengths.shows_up_as",
  "skills.weaknesses.working_on",
  "skills.weaknesses.doing_about_it",

  /*
   * How the person writes, chosen from three sample sentences rather than typed.
   * It steers a draft's register and contains nothing about them.
   */
  "voice.register",
];

/** Families of keys that are sendable wholesale. */
const SENDABLE_PREFIXES: readonly string[] = ["work.skill.", "languages.", "motivation."];

/** Credential-shaped leaves never ride a sendable prefix. */
const CREDENTIAL_SHAPED = /(nif|nie|dni|passport|nuss|iban|cvv|card|password|token|secret)/;

/**
 * Classify a fact key's egress.
 *
 * Anything not explicitly allowlisted is "never". Callers must not trust a
 * stored egress field: both `parse` and `serialise` recompute from the key, so a
 * hand-edited file cannot promote a NIF to sendable.
 */
export function classifyEgress(key: string): Egress {
  const k = key.trim().toLowerCase();
  if (CREDENTIAL_SHAPED.test(k)) return "never";
  if (SENDABLE_KEYS.includes(k)) return "sendable";
  if (SENDABLE_PREFIXES.some((prefix) => k.startsWith(prefix))) return "sendable";
  return "never";
}
