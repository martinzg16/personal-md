/**
 * The last thing that runs before a prompt leaves this machine.
 *
 * Layer 1 (fact classification, in core/types.ts) decides which stored values
 * may be rendered into a prompt at all. This is layer 2: a scan of the fully
 * assembled payload, including the page-derived question text and the user's
 * own long-form answers - which may well contain a NIF typed years ago and
 * never classified as anything.
 *
 * It fails closed. On a hit it throws rather than redacting and sending: a
 * partially redacted prompt teaches nothing and may still leak. The error names
 * which pattern matched and never carries the matched value, so the failure can
 * be surfaced and logged without re-leaking what it caught.
 *
 * False positives are the accepted cost of that choice. Blocking a draft is
 * recoverable; sending someone's national ID to an API is not.
 */

export interface EgressHit {
  /** Pattern name only. Never the matched text. */
  pattern: string;
  count: number;
}

export class EgressBlockedError extends Error {
  readonly hits: EgressHit[];
  constructor(hits: EgressHit[]) {
    super(`blocked before sending: ${hits.map((h) => `${h.pattern} x${h.count}`).join(", ")}`);
    this.name = "EgressBlockedError";
    this.hits = hits;
  }
}

/** Luhn check, used to keep 13-19 digit runs from tripping on every long number. */
export function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

interface Rule {
  name: string;
  re: RegExp;
  /** Optional second gate, so a shape match alone is not a hit. */
  confirm?: (match: string) => boolean;
}

const RULES: Rule[] = [
  // Spanish national IDs. The trailing checksum letter excludes I, O, U.
  { name: "nif", re: /\b\d{8}[ -]?[A-HJ-NP-TV-Z]\b/g },
  { name: "nie", re: /\b[XYZ][ -]?\d{7}[ -]?[A-HJ-NP-TV-Z]\b/g },

  // Social security number: 12 digits, optionally grouped 2/8/2.
  { name: "nuss", re: /\b\d{2}[ /-]?\d{8}[ /-]?\d{2}\b/g },

  { name: "iban", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}\b/g },

  // Card numbers, Luhn-confirmed so "300000000000000" does not trip it.
  {
    name: "card_number",
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    confirm: (m) => luhn(m.replace(/[ -]/g, "")),
  },

  // Credentials that should never be in a prompt regardless of whose they are.
  { name: "anthropic_key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { name: "private_key_block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

/** Find every rule that matches. Returns names and counts, never values. */
export function scan(payload: string): EgressHit[] {
  const hits: EgressHit[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let count = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(payload)) !== null) {
      if (!rule.confirm || rule.confirm(m[0])) count++;
      if (m[0].length === 0) rule.re.lastIndex++;
    }
    if (count > 0) hits.push({ pattern: rule.name, count });
  }
  return hits;
}

/**
 * Throw if the payload contains anything that must not leave the machine.
 *
 * Call this immediately before spawning `claude`, on the exact string that will
 * be sent - not on the pieces that went into building it.
 */
export function assertSafeToSend(payload: string): void {
  const hits = scan(payload);
  if (hits.length > 0) throw new EgressBlockedError(hits);
}
