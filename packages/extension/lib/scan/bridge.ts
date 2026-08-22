/**
 * The bridge between what a field *is* and what we *stored*.
 *
 * The prior spike had no equivalent: it used one vocabulary for both, so a form
 * asking for "First name" could only be filled from a stored value literally
 * keyed "first name". Keeping the two vocabularies separate is what lets a
 * stored `personal.full_name` fill a first-name box, and what lets the fill
 * policy be stated once, in one place, for every field the page might present.
 */

import type { Fact } from "@personal-md/core";

import type { FieldCategory } from "./types.ts";

/**
 * Categories we refuse to fill, whatever is stored.
 *
 * Passwords and card details are obvious. `file.upload` is here because a file
 * input cannot be filled programmatically anyway and offering to would be a lie.
 * `auth.username` is excluded because guessing a login identity wrong is worse
 * than leaving it blank.
 */
const NEVER_FILL: readonly FieldCategory[] = [
  "auth.password",
  "auth.password.confirm",
  "auth.username",
  "financial.card.number",
  "financial.card.expiry",
  "financial.card.cvv",
  "file.upload",
  "consent.checkbox",
  "open.question",
  "unknown",
];

export const canFill = (category: FieldCategory): boolean => !NEVER_FILL.includes(category);

/** Direct category-to-fact-key mappings. */
const DIRECT: Partial<Record<FieldCategory, string>> = {
  "personal.email": "personal.email",
  "personal.phone": "personal.phone",
  "personal.name.full": "personal.full_name",
  "personal.nif": "personal.nif",
  "personal.ssn": "personal.nuss",
  "personal.birthdate": "personal.date_of_birth",
  "personal.nationality": "personal.nationality",
  "address.city": "personal.city",
  "address.country": "personal.country",
  "address.street": "personal.address_exact",
  "address.zip": "personal.postal_code",
  "address.state": "personal.province",
  "work.company": "work.current_employer",
  "work.title": "work.current_role",
  "work.years_experience": "work.years_experience",
  "work.notice_period": "work.notice_period",
  "work.salary_expectation": "logistics.salary_expectation",
  "work.availability": "logistics.availability",
  "work.authorisation": "logistics.work_authorisation",
  "work.remote_preference": "logistics.remote_preference",
  "languages.spoken": "languages.spoken",
  "education.level": "education.highest_level",
  "education.field": "education.field",
  "education.institution": "education.institution",
  "financial.iban": "financial.iban",
  "web.linkedin": "contact.linkedin",
  "web.url": "contact.website",
};

export interface FillCandidate {
  value: string;
  /** The fact key the value came from, for provenance in the widget. */
  sourceKey: string;
  /** Lower when the value was derived rather than stored verbatim. */
  confidence: number;
  /** Set when the value was computed from another fact. */
  derivedFrom?: string;
}

/**
 * Split a full name into given and family parts.
 *
 * Spanish names usually carry two surnames, so "everything after the first
 * token" is the right split here and "last token" would be wrong. It is a
 * heuristic either way, which is why the confidence it returns is lower than a
 * verbatim stored value - the widget shows that, and the user can correct it.
 */
export function splitName(full: string): { first: string; last: string } | null {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0] as string, last: parts.slice(1).join(" ") };
}

/**
 * Find a value for a field from the stored facts.
 *
 * Returns null rather than guessing. A wrong autofill is worse than no autofill:
 * it gets submitted.
 */
export function findFillValue(
  category: FieldCategory,
  facts: ReadonlyMap<string, Fact>,
): FillCandidate | null {
  if (!canFill(category)) return null;

  const direct = DIRECT[category];
  if (direct) {
    const fact = facts.get(direct);
    if (fact?.value.trim()) {
      return { value: fact.value.trim(), sourceKey: direct, confidence: 1 };
    }
  }

  // Derived: first and last name come out of the stored full name.
  if (category === "personal.name.first" || category === "personal.name.last") {
    const stored = facts.get(
      category === "personal.name.first" ? "personal.first_name" : "personal.last_name",
    );
    if (stored?.value.trim()) {
      return { value: stored.value.trim(), sourceKey: stored.key, confidence: 1 };
    }

    const full = facts.get("personal.full_name")?.value ?? "";
    const split = splitName(full);
    if (split) {
      return {
        value: category === "personal.name.first" ? split.first : split.last,
        sourceKey: "personal.full_name",
        confidence: 0.8,
        derivedFrom: "personal.full_name",
      };
    }
  }

  // A street-address box on a form that only stored a city is not a match.
  return null;
}

/**
 * The key a value typed into this kind of field should be *learned* under.
 *
 * Not the same question as factKeyFor, which asks what would fill the field.
 * Filling derives a first name from a stored full name, so DIRECT has no entry
 * for it - but a first name the user actually typed is worth keeping under its
 * own key rather than being reverse-engineered into a full name.
 *
 * Everything canFill refuses is refused here too; that check is the caller's,
 * and it is not optional.
 */
const LEARN_ONLY: Partial<Record<FieldCategory, string>> = {
  "personal.name.first": "personal.first_name",
  "personal.name.last": "personal.last_name",
};

export const learnKeyFor = (category: FieldCategory): string | null =>
  DIRECT[category] ?? LEARN_ONLY[category] ?? null;

/** For the options page and the widget: what key would fill this category. */
export const factKeyFor = (category: FieldCategory): string | null => DIRECT[category] ?? null;
