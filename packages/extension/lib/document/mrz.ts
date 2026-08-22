/**
 * The machine-readable zone.
 *
 * This is the one object the whole surface is built around, so it is worth being
 * exact about what it is and what it deliberately is not.
 *
 * It is ICAO 9303 TD3 *shape*: two lines of forty-four characters, the same
 * field widths, and the real check-digit algorithm (weights 7-3-1, letters as
 * 10-35, filler as 0). The check digits genuinely verify. That is the craft, and
 * it is also why the line is honest: a character can only appear here if the
 * user typed the value it encodes.
 *
 * It is NOT a passport, and the difference is designed in rather than left to
 * chance. There is no country, no nationality and no ISO 3166 code anywhere:
 * the issuing authority is `PMD`, which is unassigned in alpha-3 and always
 * will be, and the document code is `PM`. Nothing here could be lifted out and
 * used as a template for a real document, which is the only acceptable way to
 * borrow this form.
 *
 * The slots that a passport spends on state facts are repurposed onto facts the
 * product actually holds, and each mapping is a real correspondence rather than
 * a costume:
 *
 *   - the nationality slot carries the *language of issue*, alpha-3, because
 *     which language you write in is the fact this document has that a passport
 *     does not.
 *   - the date-of-birth slot carries the date the file was first written. The
 *     file does have a birthday.
 *   - the expiry slot carries the date it was last revised, because a file you
 *     own does not expire, and pretending otherwise would be the first dishonest
 *     character on the page.
 *   - the personal-number slot carries the extent: facts, answers, words.
 *
 * The sex position stays `<` unconditionally. The product does not ask, so the
 * slot is filler - a visible refusal in the one place on the surface where a
 * refusal is legible as data.
 */

/** Every position the line can hold. `<` is the filler, and it means "not yet". */
export const FILLER = "<";
export const LINE_LENGTH = 44;

/** The issuing authority. Unassigned in ISO 3166-1 alpha-3, deliberately. */
export const AUTHORITY = "PMD";
/** The document code. Not a passport's `P<`. */
export const DOC_CODE = "PM";

export interface MrzInput {
  fullName: string;
  /** ISO 639-2/B-ish alpha-3 for the language answers are written in. */
  language: "spa" | "eng" | null;
  /** When the file was first written. */
  firstRecordedAt: Date | null;
  /** When it last changed. */
  revisedAt: Date | null;
  facts: number;
  answers: number;
  words: number;
}

export interface MrzField {
  /** Position of the first character, 1-indexed, within its line. */
  start: number;
  length: number;
  line: 1 | 2;
  /** The dual-language legend, the way a data page prints it. */
  label: { es: string; en: string };
  /** Which data-page field feeds this span, for the hover correspondence. */
  source: string | null;
}

/**
 * The field map, printed as a legend under the line. It exists as data rather
 * than as markup because the surface highlights the span a field feeds when you
 * focus that field, and a hand-written legend would drift from the encoder.
 */
export const MRZ_FIELDS: MrzField[] = [
  { line: 1, start: 1, length: 2, label: { es: "Tipo", en: "Type" }, source: null },
  { line: 1, start: 3, length: 3, label: { es: "Autoridad", en: "Authority" }, source: null },
  { line: 1, start: 6, length: 39, label: { es: "Nombre", en: "Name" }, source: "personal.full_name" },
  { line: 2, start: 1, length: 9, label: { es: "N.º de documento", en: "Document no." }, source: "personal.full_name" },
  { line: 2, start: 10, length: 1, label: { es: "Dígito", en: "Check" }, source: null },
  { line: 2, start: 11, length: 3, label: { es: "Idioma", en: "Language" }, source: "document.language" },
  { line: 2, start: 14, length: 6, label: { es: "Primer registro", en: "First recorded" }, source: "document.first_recorded" },
  { line: 2, start: 20, length: 1, label: { es: "Dígito", en: "Check" }, source: null },
  { line: 2, start: 21, length: 1, label: { es: "Sin recoger", en: "Not collected" }, source: null },
  { line: 2, start: 22, length: 6, label: { es: "Revisado", en: "Revised" }, source: "document.revised" },
  { line: 2, start: 28, length: 1, label: { es: "Dígito", en: "Check" }, source: null },
  { line: 2, start: 29, length: 14, label: { es: "Extensión", en: "Extent" }, source: "document.extent" },
  { line: 2, start: 43, length: 1, label: { es: "Dígito", en: "Check" }, source: null },
  { line: 2, start: 44, length: 1, label: { es: "Dígito compuesto", en: "Composite" }, source: null },
];

const WEIGHTS = [7, 3, 1];

/** ICAO 9303 4.9: digits are themselves, A-Z are 10-35, filler is zero. */
function charValue(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 55;
  return 0;
}

/**
 * The check digit over a span. A span that is entirely filler yields `0`, which
 * is correct rather than convenient: zero is what the algorithm returns for an
 * empty field, and printing it means the line is always a well-formed line.
 */
export function checkDigit(span: string): string {
  let sum = 0;
  for (let i = 0; i < span.length; i += 1) {
    sum += charValue(span[i] ?? FILLER) * (WEIGHTS[i % 3] ?? 1);
  }
  return String(sum % 10);
}

const pad = (s: string, length: number): string =>
  s.length >= length ? s.slice(0, length) : s + FILLER.repeat(length - s.length);

/**
 * Transliteration to the MRZ's alphabet.
 *
 * ICAO 9303 Part 3 has a full table; what matters here is that Spanish names
 * survive it correctly and visibly. `Ñ` becomes `NXX` and not `N`, because the
 * standard says so and because silently dropping the tilde from someone's own
 * surname on the page that represents them is the wrong kind of quiet.
 */
const TRANSLITERATE: Record<string, string> = {
  Á: "A", À: "A", Ä: "A", Â: "A", Ã: "A", Å: "AA",
  É: "E", È: "E", Ë: "E", Ê: "E",
  Í: "I", Ì: "I", Ï: "I", Î: "I",
  Ó: "O", Ò: "O", Ö: "OE", Ô: "O", Õ: "O", Ø: "OE",
  Ú: "U", Ù: "U", Ü: "UE", Û: "U",
  Ñ: "NXX", Ç: "C", Ý: "Y", "Ł": "L", "Đ": "D", "Þ": "TH", "ß": "SS", "Æ": "AE", "Œ": "OE",
};

export function transliterate(value: string): string {
  return [...value.toUpperCase()]
    .map((ch) => TRANSLITERATE[ch] ?? ch)
    .join("")
    .replace(/[^A-Z ]/g, " ");
}

/**
 * The name field: primary identifier, a double filler, then the secondary,
 * single fillers between components, the whole thing padded to 39.
 *
 * Spanish names carry two surnames, so the split cannot be "last word is the
 * surname" - `Martín Zulueta Ochoa` would file as OCHOA and be wrong in a way
 * the user would notice immediately. Without a structured surname field the
 * honest reading of a Spanish full name is *first token is the given name, the
 * rest is the surname*, and that is what this does. It is stated here because it
 * is a guess, and because the day a `personal.surname` fact exists this function
 * should stop guessing.
 */
export function nameField(fullName: string, length = 39): string {
  const parts = transliterate(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return FILLER.repeat(length);
  if (parts.length === 1) return pad(parts[0] ?? "", length);
  const given = parts[0] ?? "";
  const surnames = parts.slice(1);
  return pad(`${surnames.join(FILLER)}${FILLER}${FILLER}${given}`, length);
}

const yymmdd = (date: Date | null): string => {
  if (!date || Number.isNaN(date.getTime())) return FILLER.repeat(6);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getFullYear() % 100)}${p(date.getMonth() + 1)}${p(date.getDate())}`;
};

/**
 * The document number: nine characters, stable, derived from the name.
 *
 * Not random and not a counter. It has to be the same nine characters every
 * time the same file is rendered, or the number on the page is decoration; and
 * it must not encode anything the user did not type, which a timestamp would.
 * FNV-1a over the transliterated name, in base 36.
 */
export function documentNumber(fullName: string): string {
  const seed = transliterate(fullName).replace(/\s+/g, "");
  if (!seed) return FILLER.repeat(9);
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return pad(hash.toString(36).toUpperCase().padStart(7, "0").slice(0, 7) + "PM", 9);
}

/** The extent slot: F<facts> A<answers> W<words>, filler-padded to fourteen. */
export function extentField(facts: number, answers: number, words: number): string {
  if (facts === 0 && answers === 0) return FILLER.repeat(14);
  const f = `F${String(Math.min(facts, 999)).padStart(3, "0")}`;
  const a = `A${String(Math.min(answers, 99)).padStart(2, "0")}`;
  const w = `W${String(Math.min(words, 99999)).padStart(5, "0")}`;
  return pad(`${f}${a}${w}`, 14);
}

export interface Mrz {
  line1: string;
  line2: string;
  /**
   * The fraction of the line's *own* fields that hold data, 0-1.
   *
   * Measured per field and not per character, which is not a detail: measured
   * per character, a short name leaves the 39-wide name field mostly filler and
   * the document reports itself two-thirds empty for having a short name. The
   * interview's real completeness is a count of facts and answers and it belongs
   * in the extent block, not here. This number only ever says how much of the
   * identity line is real.
   */
  filled: number;
  /** Literal `<` count across both lines - what the eye actually sees. */
  fillerCount: number;
}

export function encodeMrz(input: MrzInput): Mrz {
  const line1 = pad(`${DOC_CODE}${AUTHORITY}${nameField(input.fullName)}`, LINE_LENGTH);

  const docNo = documentNumber(input.fullName);
  const language = (input.language ?? "").toUpperCase().padEnd(3, FILLER).slice(0, 3) || FILLER.repeat(3);
  const first = yymmdd(input.firstRecordedAt);
  const revised = yymmdd(input.revisedAt);
  const extent = extentField(input.facts, input.answers, input.words);

  const docCheck = checkDigit(docNo);
  const firstCheck = checkDigit(first);
  const revisedCheck = checkDigit(revised);
  const extentCheck = checkDigit(extent);

  // The composite runs over the same spans a TD3 composite does: the document
  // number and its digit, the first date and its digit, the second date and its
  // digit, then the personal-number slot and its digit.
  const composite = checkDigit(
    `${docNo}${docCheck}${first}${firstCheck}${revised}${revisedCheck}${extent}${extentCheck}`,
  );

  const line2 = pad(
    `${docNo}${docCheck}${language}${first}${firstCheck}${FILLER}${revised}${revisedCheck}${extent}${extentCheck}${composite}`,
    LINE_LENGTH,
  );

  // Only fields the user can actually fill count. The authority, the document
  // code, the check digits and the refused sex slot are not theirs to complete,
  // so counting them would make an empty document look part-done before it holds
  // anything at all.
  const owned = [line1.slice(5), language, first, revised, extent];
  const held = owned.filter((field) => [...field].some((c) => c !== FILLER)).length;

  return {
    line1,
    line2,
    filled: held / owned.length,
    fillerCount: [...`${line1}${line2}`].filter((c) => c === FILLER).length,
  };
}
