/**
 * A key's human label, in the language the reader is actually reading.
 *
 * `Fact.label` is whatever was stored when the value was written, and the save
 * path stores the English label — so a Spanish surface printing `fact.label`
 * verbatim says "The metric that moved" in the middle of a Spanish sentence.
 * The interview already holds both languages for every key it knows, so this
 * asks it first and only falls back to the stored string.
 *
 * The fallback matters and is not a formality: a key can arrive from a LinkedIn
 * import or from a hand-edited file under a name the interview has never heard
 * of, and printing that name is far better than printing the raw dotted key.
 */

import {
  INTERVIEW_DECLARATIONS,
  INTERVIEW_SECTIONS,
  REGISTER_FACT,
  type Lang,
} from "@personal-md/core";

const INDEX = new Map<string, { es: string; en: string }>();

for (const section of INTERVIEW_SECTIONS) {
  for (const fact of section.facts) INDEX.set(fact.key, fact.label);
}
for (const declaration of INTERVIEW_DECLARATIONS) {
  for (const atom of declaration.atoms) INDEX.set(atom.key, atom.label);
}
INDEX.set(REGISTER_FACT.key, REGISTER_FACT.label);

export function labelFor(key: string, lang: Lang, stored?: string): string {
  return INDEX.get(key)?.[lang] ?? (stored?.trim() ? stored : key);
}
