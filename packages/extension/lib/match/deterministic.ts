/**
 * Matching scanned fields against the stored profile, with no model call.
 *
 * This is the whole reason short-field filling is instant and works offline. The
 * `claude` CLI takes about 4.5 seconds per call, almost all of it startup, so
 * putting a model in front of "which box wants my email" would make the common
 * case forty times slower than the rare one. Everything here is local lookups
 * against the mirror in chrome.storage.local.
 *
 * It is also the only path allowed to touch withheld values. A NIF is needed on
 * an AEAT form and never enters a prompt: it is filled from here.
 */

import { normaliseQuestion, type Fact, type Profile } from "@personal-md/core";

import { findFillValue, type FillCandidate } from "../scan/bridge.ts";
import type { ScannedField } from "../scan/types.ts";
import { isActionable } from "../scan/scanner.ts";

export interface FieldSuggestion {
  fieldId: string;
  label: string;
  category: ScannedField["category"];
  value: string;
  sourceKey: string;
  confidence: number;
  derivedFrom?: string;
  /** True when the value is withheld from prompts and filled only locally. */
  localOnly: boolean;
  /** Set when the field already holds something, so we do not overwrite blindly. */
  currentValue: string;
}

/** An open question we recognise and already have an answer for. */
export interface AnswerSuggestion {
  fieldId: string;
  question: string;
  canonicalKey: string;
  /** The stored answer, ready to reuse verbatim. */
  text: string;
  /** How the match was made. Only ever local at this stage. */
  via: "alias" | "site-memory";
  askedAsBefore: string[];
  writtenAt: string;
}

export interface MatchResult {
  /** Short fields with a stored value. */
  fills: FieldSuggestion[];
  /** Open questions whose answer we already have. */
  answers: AnswerSuggestion[];
  /** Open questions with nothing stored: these are what drafting is for. */
  needsDrafting: { fieldId: string; question: string; maxLength: number | null }[];
  /** Fields deliberately left alone, with the reason. Shown on request. */
  skipped: { fieldId: string; label: string; reason: string }[];
}

const factMapOf = (profile: Profile): Map<string, Fact> =>
  new Map(profile.facts.map((f) => [f.key, f]));

/** The question text for an open field, preferring the most label-like source. */
export const questionTextOf = (field: ScannedField): string =>
  (field.label || field.ariaLabel || field.placeholder || "").trim();

export function matchFields(
  fields: readonly ScannedField[],
  profile: Profile,
  options: { withheldKeys?: readonly string[]; siteMemory?: Record<string, string>; domain?: string } = {},
): MatchResult {
  const facts = factMapOf(profile);
  const withheld = new Set(options.withheldKeys ?? []);
  const siteMemory = options.siteMemory ?? {};
  const domain = options.domain ?? "";

  const answersByKey = new Map(profile.answers.map((a) => [a.canonicalKey, a]));
  const aliases = profile.index.aliases;

  const result: MatchResult = { fills: [], answers: [], needsDrafting: [], skipped: [] };

  for (const field of fields) {
    if (!isActionable(field)) {
      result.skipped.push({
        fieldId: field.id,
        label: field.label,
        reason: !field.visible ? "not visible" : field.disabled ? "disabled" : "read-only",
      });
      continue;
    }

    if (field.category === "open.question") {
      const question = questionTextOf(field);
      const match = resolveAnswer(question, field, { aliases, siteMemory, domain, answersByKey });

      if (match) result.answers.push(match);
      else if (question) {
        result.needsDrafting.push({
          fieldId: field.id,
          question,
          maxLength: field.maxLength,
        });
      }
      continue;
    }

    const candidate: FillCandidate | null = findFillValue(field.category, facts);
    if (!candidate) {
      result.skipped.push({
        fieldId: field.id,
        label: field.label,
        reason:
          field.category === "unknown" ? "not recognised" : `nothing stored for ${field.category}`,
      });
      continue;
    }

    const suggestion: FieldSuggestion = {
      fieldId: field.id,
      label: field.label,
      category: field.category,
      value: candidate.value,
      sourceKey: candidate.sourceKey,
      confidence: candidate.confidence,
      localOnly:
        withheld.has(candidate.sourceKey) ||
        facts.get(candidate.sourceKey)?.egress === "never",
      currentValue: field.value,
    };
    if (candidate.derivedFrom !== undefined) suggestion.derivedFrom = candidate.derivedFrom;

    result.fills.push(suggestion);
  }

  return result;
}

function resolveAnswer(
  question: string,
  field: ScannedField,
  ctx: {
    aliases: Record<string, string>;
    siteMemory: Record<string, string>;
    domain: string;
    answersByKey: Map<string, Profile["answers"][number]>;
  },
): AnswerSuggestion | null {
  const build = (canonicalKey: string, via: AnswerSuggestion["via"]): AnswerSuggestion | null => {
    const answer = ctx.answersByKey.get(canonicalKey);
    if (!answer?.text.trim()) return null;
    return {
      fieldId: field.id,
      question,
      canonicalKey,
      text: answer.text,
      via,
      askedAsBefore: answer.askedAs,
      writtenAt: answer.writtenAt,
    };
  };

  // Stage A: this exact question, in any language, seen before.
  const normalised = normaliseQuestion(question);
  if (normalised && ctx.aliases[normalised]) {
    const hit = build(ctx.aliases[normalised] as string, "alias");
    if (hit) return hit;
  }

  // Stage B: this field on this site, matched before. Survives a reworded label.
  if (ctx.domain) {
    const key = `${ctx.domain}\t${signatureOf(field)}`;
    const remembered = ctx.siteMemory[key];
    if (remembered) {
      const hit = build(remembered, "site-memory");
      if (hit) return hit;
    }
  }

  // Stage C would be a model call to classify into the taxonomy. Not here: this
  // module is the no-network path by design.
  return null;
}

/**
 * A stable identifier for a field within a site, used for site memory.
 *
 * Built from attributes rather than the label, so remembering survives the label
 * being reworded - which is exactly the case site memory exists to cover.
 */
export function signatureOf(field: ScannedField): string {
  return [field.tag, field.inputType, field.name, field.htmlId, field.autocomplete]
    .map((p) => p || "-")
    .join("|");
}
