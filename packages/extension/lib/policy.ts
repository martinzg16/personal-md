/**
 * Where the widget is allowed to appear.
 *
 * A content script that injects into every page is the whole premise of the
 * product, so the constraint has to be explicit rather than implied. Three rules,
 * in order:
 *
 *  1. Never on a site where a mistake is expensive. Offering to autofill on a
 *     bank or a payment page is at best noise and at worst dangerous, and the
 *     tool has nothing useful to contribute there anyway.
 *  2. Never on a domain the user has dismissed.
 *  3. Never on a page with nothing fillable, which is most pages.
 */

/**
 * Domains the widget never runs on.
 *
 * Matched on the registrable suffix, so `www.paypal.com` and `checkout.stripe.com`
 * are both covered. Deliberately conservative and deliberately short: a long
 * blocklist gives the impression of safety it cannot deliver, and the real
 * protection is that passwords and card fields are refused everywhere.
 */
const NEVER_RUN_ON: readonly string[] = [
  "paypal.com",
  "stripe.com",
  "checkout.stripe.com",
  "revolut.com",
  "wise.com",
  "n26.com",
  "bbva.es",
  "santander.es",
  "caixabank.es",
  "bankinter.com",
  "ing.es",
  "openbank.es",
  "unicaja.es",
  "sabadell.com",
  "coinbase.com",
  "binance.com",
  "kraken.com",
];

/** Substrings in a hostname that mark it as a banking or payment surface. */
const RISKY_HINTS: readonly RegExp[] = [
  /(^|\.)bank(ing)?\./i,
  /(^|\.)pay(ments?)?\./i,
  /(^|\.)checkout\./i,
  /(^|\.)wallet\./i,
  /(^|\.)banca\./i,
];

export function isSensitiveDomain(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (NEVER_RUN_ON.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  return RISKY_HINTS.some((re) => re.test(hostname.toLowerCase()));
}

export interface RunDecision {
  run: boolean;
  reason?: "sensitive-domain" | "dismissed" | "not-http";
}

export function shouldRun(url: string, dismissed: readonly string[]): RunDecision {
  let host: string;
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) return { run: false, reason: "not-http" };
    host = parsed.hostname;
  } catch {
    return { run: false, reason: "not-http" };
  }

  if (isSensitiveDomain(host)) return { run: false, reason: "sensitive-domain" };
  if (dismissed.includes(host)) return { run: false, reason: "dismissed" };
  return { run: true };
}

/**
 * Map the detected form purpose onto the genre an answer is stored under.
 *
 * Two vocabularies again: purpose describes the page, genre describes the kind of
 * writing. They line up almost exactly, and where they do not, the register is
 * what matters - a tax form and a government survey want the same voice.
 */
export function genreForPurpose(
  purpose: string,
): "job_application" | "gov_survey" | "personal_info" | "survey" | "profile" | "other" {
  switch (purpose) {
    case "job_application":
      return "job_application";
    case "tax":
      return "gov_survey";
    case "survey":
      return "survey";
    case "profile":
      return "profile";
    case "registration":
    case "contact":
      return "personal_info";
    default:
      return "other";
  }
}

/**
 * A short description of the form, for the drafting prompt's register hint.
 *
 * Two things are folded into one string because the prompt takes one: what kind
 * of form this is, and - when the profile holds it - how this person writes.
 * The second half is the whole return on the interview no longer asking anybody
 * to produce a writing sample by hand: they picked one of three sentences, and
 * that choice has to actually reach the draft or it was theatre.
 */
export function registerHintFor(purpose: string, domain: string, register?: string): string {
  const kind =
    purpose === "job_application"
      ? "job application"
      : purpose === "tax"
        ? "government tax form"
        : purpose === "survey"
          ? "survey"
          : purpose === "profile"
            ? "profile page"
            : "web form";
  const form = `${kind} on ${domain}`;
  return register?.trim() ? `${form}; this person writes like: "${register.trim()}"` : form;
}

/** Detect the form's language from the page, which may differ from the browser's. */
export function detectPageLanguage(doc: Document): "es" | "en" {
  const declared = (
    doc.documentElement.getAttribute("lang") ??
    doc.querySelector("meta[http-equiv='content-language']")?.getAttribute("content") ??
    ""
  ).toLowerCase();
  if (declared.startsWith("es")) return "es";
  if (declared.startsWith("en")) return "en";

  // No declaration: judge from the text the form itself carries.
  //
  // Deliberately not body.innerText: it is undefined in jsdom (so this was
  // untestable and silently answered "en"), and it forces a layout pass. Also
  // deliberately not body.textContent, which swallows <script> bodies whose
  // English identifiers would drag a Spanish page toward English.
  //
  // Labels, legends, headings and options are exactly the text whose language
  // the answer has to match, so they are both the cheaper and the better sample.
  const carriers = doc.querySelectorAll("label, legend, h1, h2, h3, p, option, button, [aria-label]");
  const parts: string[] = [];
  for (const el of carriers) {
    parts.push(el.textContent ?? "", el.getAttribute("aria-label") ?? "");
    if (parts.length > 400) break;
  }
  let sample = parts.join(" ").trim();

  // A form built entirely out of divs carries no <label> at all, and that is
  // common enough that an empty carrier sample must not silently answer "en".
  // Fall back to the body with scripts and styles removed.
  if (sample.length < 40 && doc.body) {
    const clone = doc.body.cloneNode(true) as HTMLElement;
    for (const junk of clone.querySelectorAll("script, style, noscript")) junk.remove();
    sample = clone.textContent ?? "";
  }
  sample = sample.slice(0, 4000).toLowerCase();
  const spanish = (sample.match(/\b(de|que|para|con|por|una|más|cómo|qué|dónde|los|las)\b|[¿¡ñáéíóú]/g) ?? [])
    .length;
  const english = (sample.match(/\b(the|and|your|with|for|from|what|which|please|about)\b/g) ?? [])
    .length;
  return spanish > english ? "es" : "en";
}
