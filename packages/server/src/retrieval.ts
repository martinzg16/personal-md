/**
 * Choosing what to put in front of the model before drafting.
 *
 * Two axes, not one, and this is the part the prior spike missed entirely. It
 * shipped the whole knowledge base on every call, ordered by use count - which
 * is uncorrelated with relevance to *this* question - and then truncated every
 * value to 200 characters through a shared sanitiser, destroying the one input
 * the feature depends on.
 *
 * The two axes:
 *
 *  - Content sources: answers containing the facts and stories this question
 *    needs. Topical.
 *  - Voice exemplars: answers whose register matches - same language, same kind
 *    of form, similar length. A brilliant topical match written in Spanish for a
 *    government survey is the wrong voice model for an English startup
 *    application.
 *
 * A single answer can serve both roles and is labelled accordingly, because the
 * model needs to know whether it is being shown material to draw on or an
 * example of how the person writes.
 *
 * No embeddings. With a few hundred stored answers, and the canonical key
 * already resolving the common case exactly, lexical overlap plus genre and
 * language filters is enough - and it is free, instant and offline. Revisit at a
 * few thousand answers.
 */

import type { Answer, Fact, Genre, Lang, Profile } from "@personal-md/core";

/** Total characters of exemplar text allowed into one prompt. */
const MAX_EXEMPLAR_CHARS = 7000;
const MAX_CONTENT = 3;
const MAX_VOICE = 3;

export type ExemplarRole = "content" | "voice" | "both";

export interface Exemplar {
  /** Stable slot name used in the prompt, never the real id. */
  slot: string;
  answer: Answer;
  role: ExemplarRole;
  /** Why this one was picked. Surfaced as provenance in the widget. */
  why: string;
}

export interface Retrieval {
  exemplars: Exemplar[];
  /** Facts the egress allowlist permits in a prompt. */
  facts: Fact[];
  /** True when nothing topically relevant was found. */
  thin: boolean;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "at", "by", "from",
  "your", "you", "our", "we", "us", "is", "are", "was", "were", "be", "been", "do", "does",
  "did", "how", "what", "why", "when", "where", "who", "which", "that", "this", "it", "as",
  "el", "la", "los", "las", "un", "una", "de", "del", "y", "o", "en", "para", "por", "con",
  "que", "qué", "cual", "cuál", "como", "cómo", "cuando", "cuándo", "donde", "dónde",
  "tu", "tus", "su", "sus", "nos", "nuestra", "nuestro", "es", "son", "fue", "ha", "has",
  "sobre", "una", "al", "lo", "se", "te", "me", "mi",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/** Overlap of meaningful tokens, normalised by the smaller set. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  return hits / Math.min(a.size, b.size);
}

const LENGTH_BANDS: [number, number][] = [
  [0, 60],
  [60, 200],
  [200, 600],
  [600, Number.MAX_SAFE_INTEGER],
];

const bandOf = (words: number): number =>
  LENGTH_BANDS.findIndex(([lo, hi]) => words >= lo && words < hi);

const wordCount = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

export interface RetrievalRequest {
  question: string;
  /** Resolved by matching, when it resolved to anything. */
  canonicalKey: string | null;
  language: Lang;
  genre: Genre;
  /** The field's own limit, used to pick voice exemplars of the right size. */
  maxWords: number | null;
}

export function retrieve(profile: Profile, req: RetrievalRequest): Retrieval {
  const usable = profile.answers.filter((a) => a.text.trim().length > 0);
  const questionTokens = tokens(req.question);

  // ---- content: what to draw on -------------------------------------------
  const MIN_TOPICAL = 0.08;

  const scored = usable
    .map((answer) => {
      const answerTokens = tokens(`${answer.askedAs.join(" ")} ${answer.text}`);
      const topical = overlap(questionTokens, answerTokens);

      // An exact canonical match is the strongest possible signal: this is
      // literally the same question, previously answered.
      const isExact = Boolean(req.canonicalKey && answer.canonicalKey === req.canonicalKey);

      // Genre agreement is a *voice* signal and only a tie-breaker here. It must
      // not make something eligible as content on its own: an answer about
      // weaknesses is not material for a question about consensus algorithms
      // merely because both were asked on a job application. Letting the bonus
      // create eligibility also made `thin` never fire.
      const bonus = !isExact && topical > 0 && answer.genre === req.genre ? 0.15 : 0;

      return {
        answer,
        topical,
        isExact,
        score: isExact ? topical + 10 : topical + bonus,
        why: isExact
          ? "your answer to this same question"
          : bonus > 0
            ? "similar wording, on the same kind of form"
            : "similar wording",
      };
    })
    .filter((s) => s.isExact || s.topical >= MIN_TOPICAL)
    .sort((a, b) => b.score - a.score);

  const content = scored.slice(0, MAX_CONTENT);

  // ---- voice: how the person writes ---------------------------------------
  // Register match beats topical match here, deliberately. Prefer the same
  // language, then the same genre, then a similar length to what this field
  // wants, and only then recency.
  const targetBand = req.maxWords ? bandOf(req.maxWords) : 2;
  const voiceRanked = usable
    .map((answer) => {
      let score = 0;
      const reasons: string[] = [];
      if (answer.language === req.language) {
        score += 3;
        reasons.push(`written in ${answer.language}`);
      }
      if (answer.genre === req.genre) {
        score += 2;
        reasons.push("same kind of form");
      }
      const band = bandOf(wordCount(answer.text));
      score += Math.max(0, 1.5 - Math.abs(band - targetBand) * 0.5);
      if (band === targetBand) reasons.push("similar length");
      // Longer answers show more of the person's rhythm than a one-liner.
      score += Math.min(wordCount(answer.text) / 400, 0.5);
      return { answer, score, why: reasons.join(", ") || "the closest match available" };
    })
    .sort((a, b) => b.score - a.score);

  // ---- merge, label and bound ---------------------------------------------
  const exemplars: Exemplar[] = [];
  const byId = new Map<string, Exemplar>();
  let budget = MAX_EXEMPLAR_CHARS;
  let slot = 1;

  const add = (answer: Answer, role: ExemplarRole, why: string): void => {
    const existing = byId.get(answer.id);
    if (existing) {
      if (existing.role !== role) existing.role = "both";
      return;
    }
    if (answer.text.length > budget) return;
    budget -= answer.text.length;
    const exemplar: Exemplar = { slot: `s${slot++}`, answer, role, why };
    byId.set(answer.id, exemplar);
    exemplars.push(exemplar);
  };

  for (const c of content) add(c.answer, "content", c.why);
  for (const v of voiceRanked.slice(0, MAX_VOICE)) add(v.answer, "voice", v.why);

  return {
    exemplars,
    // Only the allowlisted facts. A withheld value never reaches a prompt; it is
    // filled verbatim by the deterministic matcher instead.
    facts: profile.facts.filter((f) => f.egress === "sendable" && f.value.trim()),
    thin: content.length === 0,
  };
}

/** Map a slot name the model cited back to the real answer. */
export function resolveSlot(retrieval: Retrieval, slot: string): Answer | null {
  return retrieval.exemplars.find((e) => e.slot === slot)?.answer ?? null;
}
