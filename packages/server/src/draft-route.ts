/**
 * Drafting an answer to an open question.
 *
 * The whole point of the project, and the only place a capable model is worth
 * paying for: matching short fields is a lookup, but writing a paragraph in
 * someone else's voice is not.
 *
 * Two design points worth stating, both corrections of the prior spike:
 *
 *  - Confidence is computed here, not taken from the model. The spike returned
 *    the model's own self-reported confidence with nothing checking it. A
 *    self-assessment is one weak signal among several; how well the question
 *    matched, whether any exemplars were in the right language, and how many
 *    gaps the draft left are all better ones.
 *
 *  - Provenance is real. The model cites slot names, which are mapped back to
 *    stored answers here, so the widget can say "based on your answer to X from
 *    March" and mean it. Slots also mean the prompt never carries internal ids.
 */

import {
  type Answer,
  type Genre,
  type Lang,
  type Profile,
  normaliseAnswerText,
} from "@personal-md/core";

import { askForJson, type ClaudeUsage } from "./claude.ts";
import { DRAFT_SYSTEM, buildDraftPrompt, buildShortenPrompt } from "./draft-prompts.ts";
import { retrieve, resolveSlot, type Retrieval } from "./retrieval.ts";
import type { Store } from "./store.ts";

export interface DraftRequest {
  question: string;
  canonicalKey: string | null;
  language: Lang;
  genre: Genre;
  maxWords: number | null;
  maxChars: number | null;
  registerHint: string;
  /** Extra steer from the user, on a regenerate. */
  instruction?: string;
}

export interface Provenance {
  canonicalKey: string;
  askedAs: string;
  writtenAt: string;
  role: string;
  why: string;
  /** Whether the model reported drawing on it. */
  used: boolean;
  excerpt: string;
}

export interface InformationGap {
  missing: string;
  questionForUser: string;
}

export interface DraftResponse {
  draft: string;
  language: Lang;
  length: { words: number; chars: number; withinLimit: boolean; shortened: boolean };
  confidence: { level: "high" | "medium" | "low"; score: number; reasons: string[] };
  provenance: Provenance[];
  informationGaps: InformationGap[];
  flags: { injectionSuspected: boolean; thinRetrieval: boolean; ungroundedSuspicion: boolean };
  spent: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  notes: string[];
}

interface RawDraft {
  draft: string;
  language: Lang;
  usedSlots: string[];
  gaps: InformationGap[];
  modelConfidence: "high" | "medium" | "low";
  confidenceReason: string;
  injectionSuspected: boolean;
}

const words = (t: string): number => (t.trim() ? t.trim().split(/\s+/).length : 0);

function validateDraft(raw: unknown): RawDraft {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");

  const draft = normaliseAnswerText(str(o["draft"]));
  if (!draft) throw new Error('"draft" must be a non-empty string');

  const gapsRaw = Array.isArray(o["information_gaps"]) ? o["information_gaps"] : [];
  const gaps: InformationGap[] = gapsRaw
    .map((g) => {
      const e = (g ?? {}) as Record<string, unknown>;
      return { missing: str(e["missing"]), questionForUser: str(e["question_for_user"]) };
    })
    .filter((g) => g.missing);

  const conf = str(o["confidence"]);
  return {
    draft,
    language: o["language"] === "es" ? "es" : "en",
    usedSlots: Array.isArray(o["used_slots"]) ? o["used_slots"].map(str).filter(Boolean) : [],
    gaps,
    modelConfidence: conf === "high" || conf === "low" ? conf : "medium",
    confidenceReason: str(o["confidence_reason"]).slice(0, 300),
    injectionSuspected: o["injection_suspected"] === true,
  };
}

/**
 * Score the draft ourselves.
 *
 * The model's own confidence is one input with a small weight. The signals that
 * actually predict a usable draft are structural: did the question resolve to
 * something we had already answered, were there exemplars in the right language,
 * and how much did the model have to leave blank.
 */
function scoreConfidence(
  raw: RawDraft,
  retrieval: Retrieval,
  req: DraftRequest,
  withinLimit: boolean,
): DraftResponse["confidence"] {
  const reasons: string[] = [];
  let score = 0.35;

  const exact = retrieval.exemplars.find(
    (e) => req.canonicalKey && e.answer.canonicalKey === req.canonicalKey,
  );
  if (exact) {
    score += 0.3;
    reasons.push("you have answered this exact question before");
  } else if (!retrieval.thin) {
    score += 0.15;
    reasons.push("drawn from related answers you have written");
  } else {
    score -= 0.1;
    reasons.push("nothing you have written closely matches this question");
  }

  const sameLang = retrieval.exemplars.filter((e) => e.answer.language === req.language).length;
  if (sameLang > 0) {
    score += 0.15;
    reasons.push(`${sameLang} example${sameLang === 1 ? "" : "s"} of how you write in ${req.language}`);
  } else if (retrieval.exemplars.length > 0) {
    score -= 0.1;
    reasons.push(`nothing stored in ${req.language} to match your voice against`);
  }

  if (raw.gaps.length > 0) {
    score -= Math.min(0.3, raw.gaps.length * 0.12);
    reasons.push(`${raw.gaps.length} thing${raw.gaps.length === 1 ? "" : "s"} left blank for you`);
  }
  if (!withinLimit) {
    score -= 0.1;
    reasons.push("longer than the field allows");
  }
  if (raw.modelConfidence === "low") score -= 0.1;
  if (raw.modelConfidence === "high") score += 0.05;

  const clamped = Math.max(0, Math.min(1, score));
  return {
    level: clamped >= 0.7 ? "high" : clamped >= 0.45 ? "medium" : "low",
    score: Math.round(clamped * 100) / 100,
    reasons,
  };
}

/**
 * Does the draft contain a figure that appears nowhere in its sources?
 *
 * A cheap, local check on the one fabrication that matters most on a job
 * application. Reported as a suspicion for the user to look at, never used to
 * suppress the draft: a number can legitimately be spelled differently from its
 * source, so a false positive must not throw work away.
 */
export function suspectUngroundedNumbers(draft: string, sources: string): boolean {
  const inDraft = draft.match(/\d[\d.,]*/g) ?? [];
  if (inDraft.length === 0) return false;
  const haystack = sources.replace(/[.,\s]/g, "");
  return inDraft.some((n) => {
    const bare = n.replace(/[.,]/g, "");
    // Small numbers are usually prose ("two of us"), not claims.
    if (bare.length < 2) return false;
    return !haystack.includes(bare);
  });
}

const excerptOf = (a: Answer): string =>
  a.text.length > 140 ? `${a.text.slice(0, 137).trimEnd()}...` : a.text;

export async function handleDraft(
  store: Store,
  req: DraftRequest,
  profileOverride?: Profile,
): Promise<DraftResponse> {
  const loaded = profileOverride ? null : await store.load();
  const profile = profileOverride ?? loaded!.profile;
  const notes: string[] = [];

  const retrieval = retrieve(profile, {
    question: req.question,
    canonicalKey: req.canonicalKey,
    language: req.language,
    genre: req.genre,
    maxWords: req.maxWords,
  });

  if (retrieval.exemplars.length === 0) {
    notes.push("nothing stored to draft from yet - the interview is the fastest fix");
  }
  if (retrieval.thin) notes.push("no closely related answer found");

  const basePrompt = buildDraftPrompt({
    question: req.question,
    language: req.language,
    genre: req.genre,
    maxWords: req.maxWords,
    maxChars: req.maxChars,
    registerHint: req.registerHint,
    retrieval,
  });

  const prompt = req.instruction?.trim()
    ? [
        basePrompt,
        "",
        "<revision_request>",
        req.instruction.trim(),
        "</revision_request>",
        "Apply <revision_request>. The grounding rules apply to anything you add.",
      ].join("\n")
    : basePrompt;

  // Opus, not Haiku: writing a paragraph in someone else's voice is the one job
  // here where the model tier is the product.
  // Deliberately no `effort`. Measured on this workload, passing --effort makes a
  // draft cost MORE, not less: it changes the request shape enough to invalidate
  // the cached ~26k-token prefix, and a cache write at 1.25x dwarfs whatever
  // thinking tokens a lower effort saves. Costs per draft, same prompt:
  //
  //     cold cache   $0.163
  //     warm cache   $0.023   <- steady state
  //     --effort low $0.380   (cache invalidated on every call)
  //
  // The cache is the whole cost story here, exactly as it is for input overhead.
  const first = await askForJson({
    system: DRAFT_SYSTEM,
    prompt,
    model: "opus",
    validate: validateDraft,
    timeoutMs: 180_000,
  });

  let raw = first.value;
  let usage: ClaudeUsage = first.usage;
  let calls = first.attempts;
  let shortened = false;

  // Length is not schema-enforceable, so it is checked and repaired in code.
  // Capped at one repair: a loop here would be unbounded spend.
  const limitWords = req.maxWords ?? (req.maxChars ? Math.floor(req.maxChars / 6) : null);
  if (limitWords && words(raw.draft) > limitWords) {
    notes.push(`first draft was ${words(raw.draft)} words against a ${limitWords} limit`);
    try {
      const repair = await askForJson({
        system: DRAFT_SYSTEM,
        prompt: `${prompt}\n\n${buildShortenPrompt(raw.draft, words(raw.draft), limitWords)}`,
        model: "opus",
        validate: validateDraft,
        timeoutMs: 180_000,
      });
      if (words(repair.value.draft) < words(raw.draft)) {
        raw = repair.value;
        shortened = true;
      }
      calls += repair.attempts;
      usage = {
        inputTokens: usage.inputTokens + repair.usage.inputTokens,
        outputTokens: usage.outputTokens + repair.usage.outputTokens,
        cacheCreationInputTokens:
          usage.cacheCreationInputTokens + repair.usage.cacheCreationInputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens + repair.usage.cacheReadInputTokens,
        costUsd: usage.costUsd + repair.usage.costUsd,
      };
    } catch {
      notes.push("could not shorten it; showing the long version for you to trim");
    }
  }

  const used = new Set(raw.usedSlots);
  const provenance: Provenance[] = retrieval.exemplars.map((e) => ({
    canonicalKey: e.answer.canonicalKey,
    askedAs: e.answer.askedAs[0] ?? "",
    writtenAt: e.answer.writtenAt,
    role: e.role,
    why: e.why,
    used: used.has(e.slot),
    excerpt: excerptOf(e.answer),
  }));

  for (const slot of raw.usedSlots) {
    if (!resolveSlot(retrieval, slot)) {
      notes.push(`ignored a citation of ${slot}, which was not among the sources`);
    }
  }

  const charLimitOk = req.maxChars === null || raw.draft.length <= req.maxChars;
  const wordLimitOk = limitWords === null || words(raw.draft) <= limitWords;
  const withinLimit = charLimitOk && wordLimitOk;

  const sourceText = [
    ...retrieval.exemplars.map((e) => e.answer.text),
    ...retrieval.facts.map((f) => f.value),
  ].join(" ");

  const spent = {
    calls,
    inputTokens: usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.costUsd,
  };
  await store.recordSpend({
    inputTokens: spent.inputTokens,
    outputTokens: spent.outputTokens,
    costUsd: spent.costUsd,
  });

  if (raw.injectionSuspected) {
    notes.push("the page appeared to contain instructions addressed to the assistant");
  }

  return {
    draft: raw.draft,
    language: raw.language,
    length: { words: words(raw.draft), chars: raw.draft.length, withinLimit, shortened },
    confidence: scoreConfidence(raw, retrieval, req, withinLimit),
    provenance,
    informationGaps: raw.gaps,
    flags: {
      injectionSuspected: raw.injectionSuspected,
      thinRetrieval: retrieval.thin,
      ungroundedSuspicion: suspectUngroundedNumbers(raw.draft, sourceText),
    },
    spent,
    notes,
  };
}
