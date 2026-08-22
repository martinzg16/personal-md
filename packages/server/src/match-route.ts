/**
 * The /match request handler, split out because it is the first place in the
 * server where local lookups, a model call, and a write-back all meet.
 *
 * The staging is the point. Every question arrives here having already failed the
 * extension's free local lookups, so stage A and B are re-run server-side only
 * because the server holds the authoritative profile (the extension may be
 * working from a stale mirror). Stage C is the only part that spends anything, it
 * runs at most once per genuinely new question, and its result is written back as
 * an alias immediately - so the second time this question appears anywhere, in
 * either language, it costs nothing.
 */

import {
  normaliseQuestion,
  type Answer,
  type Genre,
  type Lang,
  type Profile,
} from "@personal-md/core";

import { classifyQuestion, decideReuse, looksLikeCompanyMention } from "./matcher.ts";
import type { MatchConfidence, ReuseBlocker } from "./matcher.ts";
import type { Store } from "./store.ts";

export interface MatchRequest {
  question: string;
  genre: Genre;
  language: Lang;
  maxLength: number | null;
  domain: string;
  /** Field signature, so a successful match can be remembered for this site. */
  signature: string;
}

export interface MatchResponse {
  canonicalKey: string | null;
  /** Which stage resolved it. "none" when nothing matched. */
  via: "alias" | "site-memory" | "model" | "none";
  confidence: MatchConfidence;
  /** Present when there is stored text for the matched key. */
  answer: { text: string; language: Lang; writtenAt: string; askedAs: string[] } | null;
  /** Whether the stored text can go straight into the field. */
  reuse: { ok: boolean; reason?: ReuseBlocker };
  /** True when the model minted a new freeform key for this question. */
  isNewKey: boolean;
  /** True when the page tried to address the model. */
  injectionSuspected: boolean;
  /** What this request cost, so the caller can show it. */
  spent: { calls: number; inputTokens: number; outputTokens: number; costUsd: number } | null;
  notes: string[];
}

const answerFor = (profile: Profile, key: string | null): Answer | null =>
  key ? (profile.answers.find((a) => a.canonicalKey === key) ?? null) : null;

const shape = (a: Answer | null): MatchResponse["answer"] =>
  a && a.text.trim()
    ? { text: a.text, language: a.language, writtenAt: a.writtenAt, askedAs: a.askedAs }
    : null;

export async function handleMatch(store: Store, req: MatchRequest): Promise<MatchResponse> {
  const question = req.question.trim();
  const notes: string[] = [];

  if (!question) {
    return {
      canonicalKey: null,
      via: "none",
      confidence: "none",
      answer: null,
      reuse: { ok: false, reason: "no-stored-answer" },
      isNewKey: false,
      injectionSuspected: false,
      spent: null,
      notes: ["empty question"],
    };
  }

  const { profile, index } = await store.load();
  const employer = profile.facts.find((f) => f.key === "work.current_employer")?.value ?? "";

  const finish = (
    key: string | null,
    via: MatchResponse["via"],
    confidence: MatchConfidence,
    extra: Partial<MatchResponse> = {},
  ): MatchResponse => {
    const answer = answerFor(profile, key);
    const decision = decideReuse(answer, {
      confidence,
      maxLength: req.maxLength,
      language: req.language,
      answerMentionsCompany: answer ? looksLikeCompanyMention(answer.text, employer) : false,
    });
    return {
      canonicalKey: key,
      via,
      confidence,
      answer: shape(answer),
      reuse: decision.reuse ? { ok: true } : { ok: false, reason: decision.reason },
      isNewKey: false,
      injectionSuspected: false,
      spent: null,
      notes,
      ...extra,
    };
  };

  // Stage A: this exact question, in any language, already known.
  const normalised = normaliseQuestion(question);
  const aliasHit = profile.index.aliases[normalised];
  if (aliasHit) {
    notes.push("matched from a surface form already stored");
    return finish(aliasHit, "alias", "exact");
  }

  // Stage B: this field on this site, matched before. Survives a reworded label.
  const memoryKey = `${req.domain}\t${req.signature}`;
  const remembered = index.siteMemory[memoryKey];
  if (remembered) {
    notes.push("matched from site memory");
    return finish(remembered, "site-memory", "exact");
  }

  // Stage C: the only stage that costs anything.
  const known = profile.answers.filter((a) => a.text.trim()).map((a) => a.canonicalKey);
  const { classification, usage, attempts } = await classifyQuestion({
    question,
    genre: req.genre,
    language: req.language,
    known,
  });

  const spent = {
    calls: attempts,
    inputTokens: usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.costUsd,
  };
  await store.recordSpend({
    inputTokens: spent.inputTokens,
    outputTokens: spent.outputTokens,
    costUsd: spent.costUsd,
  });

  if (classification.injectionSuspected) {
    notes.push("the page appeared to contain instructions addressed to the assistant");
  }
  if (attempts > 1) notes.push(`took ${attempts} attempts to return usable JSON`);

  if (!classification.canonicalKey) {
    notes.push("no canonical question fits this one");
    return {
      canonicalKey: null,
      via: "none",
      confidence: "none",
      answer: null,
      reuse: { ok: false, reason: "no-stored-answer" },
      isNewKey: false,
      injectionSuspected: classification.injectionSuspected,
      spent,
      notes,
    };
  }

  // Write the surface form back before returning. This is what makes the same
  // question free the next time it appears, which is the economic argument for
  // classifying at all.
  await store.learnAlias(classification.canonicalKey, question);
  if (classification.confidence === "exact" || classification.confidence === "paraphrase") {
    await store.rememberSite(req.domain, req.signature, classification.canonicalKey);
    notes.push("remembered for this site, so a reworded label still matches");
  }

  // Re-read: learnAlias may have created a placeholder answer row.
  const after = await store.load();
  const answer = answerFor(after.profile, classification.canonicalKey);
  const decision = decideReuse(answer, {
    confidence: classification.confidence,
    maxLength: req.maxLength,
    language: req.language,
    answerMentionsCompany: answer ? looksLikeCompanyMention(answer.text, employer) : false,
  });

  notes.push(
    classification.isNew
      ? "recorded as a new kind of question"
      : `classified as ${classification.canonicalKey}`,
  );

  return {
    canonicalKey: classification.canonicalKey,
    via: "model",
    confidence: classification.confidence,
    answer: shape(answer),
    reuse: decision.reuse ? { ok: true } : { ok: false, reason: decision.reason },
    isNewKey: classification.isNew,
    injectionSuspected: classification.injectionSuspected,
    spent,
    notes,
  };
}
