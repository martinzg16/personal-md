/**
 * What the document knows about itself.
 *
 * Everything on the data page and everything the issuance sequence narrates is
 * derived here, from the profile and from nothing else. That constraint is the
 * reason this file exists rather than the values being read inline in the
 * components: the closing sequence is the most persuasive thing on the surface,
 * and a persuasive summary that overstates what is in the file would be the
 * exact failure `PRODUCT.md` names - "a fabricated employer or metric does not
 * merely read badly, it gets submitted on a job application".
 *
 * So the scope note is assembled by concatenation, not by a model, and every
 * clause is dropped when the fact behind it is absent. There is no template with
 * blanks to fill and no plausible default. A thin file produces a short sentence,
 * and that is the honest outcome.
 */

import {
  INTERVIEW_QUESTIONS,
  INTERVIEW_SECTIONS,
  classifyEgress,
  type Lang,
  type Profile,
} from "@personal-md/core";

import { documentNumber } from "./mrz.ts";

export interface Extent {
  facts: number;
  factsTotal: number;
  answers: number;
  answersTotal: number;
  words: number;
  bytes: number;
}

export interface Restriction {
  key: string;
  label: { es: string; en: string };
}

export interface Dossier {
  /** The holder's own name, or null while the document is unissued. */
  holder: string | null;
  number: string;
  /** Alpha-3 for the language the answers are written in. */
  language: "spa" | "eng" | null;
  firstRecordedAt: Date | null;
  revisedAt: Date | null;
  extent: Extent;
  /** Fields whose values are never transmitted, as printed conditions. */
  restricted: Restriction[];
  /** Interview facts still empty. Named, because "incomplete" alone is useless. */
  outstanding: Restriction[];
  /** Whether every interview fact and answer is present. */
  complete: boolean;
}

const words = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

const parseDate = (iso: string | undefined): Date | null => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** The label pair for an interview fact key, or the key itself if it is unknown. */
function labelFor(key: string): { es: string; en: string } {
  for (const section of INTERVIEW_SECTIONS) {
    for (const fact of section.facts) {
      if (fact.key === key) return fact.label;
    }
  }
  return { es: key, en: key };
}

export function readDossier(
  profile: Profile | null,
  withheldKeys: readonly string[],
  lang: Lang,
): Dossier {
  const facts = profile?.facts ?? [];
  const answers = profile?.answers ?? [];
  const held = new Map(facts.filter((f) => f.value.trim()).map((f) => [f.key, f]));

  const interviewKeys = INTERVIEW_SECTIONS.flatMap((s) => s.facts.map((f) => f.key));
  const factsTotal = interviewKeys.length;
  const factsHeld = interviewKeys.filter((key) => held.has(key)).length;

  const answered = answers.filter((a) => a.text.trim());
  const totalWords = answered.reduce((n, a) => n + words(a.text), 0);

  // The dates the document reports are the extremes of what is actually on
  // disk, so an untouched file has no dates at all rather than today's.
  const stamps = [
    ...facts.filter((f) => f.value.trim()).map((f) => parseDate(f.updatedAt)),
    ...answered.map((a) => parseDate(a.writtenAt)),
  ].filter((d): d is Date => d !== null);

  const withheld = new Set(withheldKeys);
  const restricted = [...held.keys()]
    .filter((key) => withheld.has(key) || classifyEgress(key) === "never")
    .sort()
    .map((key) => ({ key, label: labelFor(key) }));

  const outstanding = interviewKeys
    .filter((key) => !held.has(key))
    .map((key) => ({ key, label: labelFor(key) }));

  const holder = held.get("personal.full_name")?.value.trim() || null;

  return {
    holder,
    number: documentNumber(holder ?? ""),
    // The language of issue is only claimed once something has been written in
    // it. An empty document has no language, which is why this is nullable.
    language: answered.length === 0 ? null : lang === "es" ? "spa" : "eng",
    firstRecordedAt: stamps.length ? new Date(Math.min(...stamps.map((d) => d.getTime()))) : null,
    revisedAt: stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : null,
    extent: {
      facts: factsHeld,
      factsTotal,
      answers: answered.length,
      answersTotal: INTERVIEW_QUESTIONS.length,
      words: totalWords,
      // What the file costs on disk, near enough: the values and the prose. Not
      // the markdown scaffolding, which is not the user's content.
      bytes:
        facts.reduce((n, f) => n + f.key.length + f.value.length + 6, 0) +
        answered.reduce((n, a) => n + a.text.length + a.canonicalKey.length + 8, 0),
    },
    restricted,
    outstanding,
    complete: factsHeld === factsTotal && answered.length === INTERVIEW_QUESTIONS.length,
  };
}

/**
 * The scope-and-content note: one sentence about this file, in the holder's own
 * facts, assembled clause by clause.
 *
 * Each clause is present only if its fact is. Nothing here is phrased as a
 * claim about the person - it reports what the document contains, which is the
 * only thing the tool is in a position to know.
 */
export function scopeNote(profile: Profile | null, dossier: Dossier, lang: Lang): string {
  const value = (key: string): string | null =>
    (profile?.facts ?? []).find((f) => f.key === key)?.value.trim() || null;

  const role = value("work.current_role");
  const years = value("work.years_experience");
  const domain = value("work.domain");
  const languages = value("languages.spoken");
  const { answers, words: totalWords } = dossier.extent;

  const clauses: string[] = [];

  if (lang === "es") {
    if (role) clauses.push(years ? `${role}, ${years} años de experiencia` : role);
    if (domain) clauses.push(`sector ${domain}`);
    if (languages) clauses.push(`idiomas: ${languages}`);
    if (answers > 0) {
      clauses.push(
        `${answers} ${answers === 1 ? "respuesta" : "respuestas"} redactadas, ${totalWords.toLocaleString("es-ES")} palabras`,
      );
    }
    if (clauses.length === 0) return "Documento sin contenido. Nada que describir todavía.";
    return `${clauses.join(". ")}.`;
  }

  if (role) clauses.push(years ? `${role}, ${years} years' experience` : role);
  if (domain) clauses.push(`working in ${domain}`);
  if (languages) clauses.push(`languages: ${languages}`);
  if (answers > 0) {
    clauses.push(
      `${answers} written ${answers === 1 ? "answer" : "answers"}, ${totalWords.toLocaleString("en-GB")} words`,
    );
  }
  if (clauses.length === 0) return "Empty document. Nothing to describe yet.";
  return `${clauses.join(". ")}.`;
}
