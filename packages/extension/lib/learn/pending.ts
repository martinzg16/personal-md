/**
 * What this form could teach the profile, and nothing more.
 *
 * The requirement is that nothing is stored silently. The naive reading of that
 * is a prompt per field, which is unusable on a thirty-field form, so the design
 * is: notice quietly while the form is filled, ask once about everything at the
 * end, write once. This module is the "notice quietly" half - pure functions over
 * a scan and a profile, no DOM writes and no network.
 *
 * Two rules it will not bend:
 *
 *  - Capture is gated by the same policy as filling. If a category is in
 *    NEVER_FILL - passwords, card number, CVV, the login identity - it is not
 *    read here either. A tool that refuses to type your password into a form but
 *    quietly files it away has done the worse of the two things.
 *  - A value identical to the one already stored is not a candidate. Confirming
 *    what you already know teaches nothing and trains you to click through the
 *    panel without reading it, which is how a confirmation step stops working.
 */

import type { Profile } from "@personal-md/core";

import { canFill, learnKeyFor } from "../scan/bridge.ts";
import { readFieldValue } from "../fill/apply.ts";
import { findByStamp } from "../scan/scanner.ts";
import type { ScannedField } from "../scan/types.ts";

/** A fact this form is offering, which the profile does not already hold. */
export interface PendingFact {
  fieldId: string;
  key: string;
  /** The field's own label, which is a better human name than the key. */
  label: string;
  value: string;
  /** What the profile holds today, when this would change it rather than add it. */
  replaces?: string;
}

/** An answer the user inserted and chose to keep. */
export interface PendingAnswer {
  fieldId: string;
  canonicalKey: string;
  question: string;
  text: string;
}

export interface PendingBatch {
  facts: PendingFact[];
  answers: PendingAnswer[];
}

export const emptyBatch = (): PendingBatch => ({ facts: [], answers: [] });

export const batchSize = (b: PendingBatch): number => b.facts.length + b.answers.length;

/**
 * Compare two values for "the profile already knows this".
 *
 * Deliberately loose on case, surrounding space and internal runs of space, and
 * deliberately strict on everything else. "madrid" should not be offered when
 * "Madrid" is stored; "70000" and "70.000 EUR" are different answers and the
 * user should get to choose.
 */
const same = (a: string, b: string): boolean =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Everything on this page that the profile could learn.
 *
 * Reads the live DOM rather than the scan's snapshot, because the whole point is
 * to see what the user typed after the scan ran.
 */
export function collectPendingFacts(
  fields: readonly ScannedField[],
  doc: Document,
  profile: Profile,
): PendingFact[] {
  const stored = new Map(profile.facts.map((f) => [f.key, f.value]));
  const out: PendingFact[] = [];
  const claimed = new Set<string>();

  for (const field of fields) {
    if (!canFill(field.category)) continue;

    const key = learnKeyFor(field.category);
    if (!key) continue;

    // One candidate per fact key. A form with three boxes mapping to the same
    // key would otherwise offer the same fact three times, and the panel would
    // be asking the user to arbitrate a conflict it created itself.
    if (claimed.has(key)) continue;

    const el = findByStamp(field.id, doc);
    if (!el) continue;

    const value = readFieldValue(el).trim();
    if (!value) continue;

    const existing = stored.get(key);
    if (existing !== undefined && same(existing, value)) continue;

    claimed.add(key);
    out.push({
      fieldId: field.id,
      key,
      label: field.label || key,
      value,
      ...(existing?.trim() ? { replaces: existing } : {}),
    });
  }

  return out;
}

/**
 * Merge a freshly collected list into what the user has already been shown.
 *
 * Two things have to survive a recompute. A row the user unticked stays
 * unticked, because re-offering something they declined thirty seconds ago is
 * nagging. And a value the user edited in the panel wins over the one still in
 * the page, because the panel is where they said what they meant.
 */
export function reconcileFacts(
  previous: readonly PendingFact[],
  fresh: readonly PendingFact[],
  declined: ReadonlySet<string>,
  edited: ReadonlyMap<string, string>,
): PendingFact[] {
  return fresh
    .filter((f) => !declined.has(f.key))
    .map((f) => {
      const override = edited.get(f.key);
      return override === undefined ? f : { ...f, value: override };
    })
    .concat(
      // An answer the user typed into the panel for a field they have since
      // cleared is still theirs to save.
      previous.filter(
        (p) => edited.has(p.key) && !declined.has(p.key) && !fresh.some((f) => f.key === p.key),
      ),
    );
}
