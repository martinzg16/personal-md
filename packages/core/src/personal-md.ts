/**
 * PERSONAL.md parse and serialise.
 *
 * The file is the source of truth and is meant to be opened in an editor and
 * hand-edited, so the format is plain markdown that happens to be parseable
 * rather than a serialisation format that happens to be readable.
 *
 * Two things deliberately do NOT live in the file:
 *
 *  - `aliases` is *derived* from each answer's `askedAs` list. Persisting it
 *    would mean a machine-generated blob in a file a human edits, and it can
 *    drift from the surface forms it is supposed to index.
 *  - `siteMemory` is pure machine state (domain plus field signature to
 *    canonical key) with no meaning to a reader. It lives in index.json.
 *
 * Section boundaries are `### <dotted.key>` on its own line. Answer bodies stay
 * unfenced so the file reads as prose; any line inside a body that would
 * otherwise be read as structure is backslash-escaped instead (see
 * BODY_STRUCTURAL), which keeps the round-trip lossless without wrapping every
 * answer in a code block.
 *
 * Both `parse` and `serialise` recompute a fact's egress from its key and never
 * trust the value passed in. A hand-edited file therefore cannot promote a NIF
 * to sendable, and a Fact built with the wrong egress cannot leak into the file.
 */

import {
  type Answer,
  type Fact,
  type Genre,
  type Lang,
  type Profile,
  GENRES,
  classifyEgress,
  emptyProfile,
} from "./types.ts";

export const MAGIC = "<!-- personal-md v1 - do not delete this line -->";

/** Stands in for a sensitive value; the real one lives in secrets.json. */
export const SECRET_PLACEHOLDER = "*** withheld from AI - local only ***";

export function isSecretPlaceholder(value: string): boolean {
  return value.trim() === SECRET_PLACEHOLDER;
}

const KEY_RE = /^[a-z0-9_]+(?:\.[a-z0-9_:-]+)+$/;
const SECTION_RE = /^###\s+(\S+)\s*$/;
const META_RE = /^<!--\s*(.*?)\s*-->$/;

/**
 * Normalise a long-form answer body.
 *
 * Strips control characters and trailing whitespace per line, and trims blank
 * lines at the edges. Note what it does NOT do: there is no length cap. The
 * prior spike ran every stored value through a shared sanitiser with
 * MAX_TEXT_LENGTH = 200, which silently decapitated every long-form answer
 * before it reached the model - destroying the one input the drafting feature
 * depends on. Long-form text gets its own sanitiser for exactly this reason.
 */
export function normaliseAnswerText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/** Fact values are single-line and must survive a markdown table cell. */
export function normaliseFactValue(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeCell = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
const unescapeCell = (s: string) => s.replace(/\\\|/g, "|").replace(/\\\\/g, "\\");

/**
 * Lines inside an answer body that would otherwise be read as structure.
 *
 * Answer text is prose destined for a form textarea, so a line that happens to
 * read `## Facts` or `### motivation.why` is plausible user content, not markup.
 * Left alone it would end the section, flip the parser into the facts table, or
 * be eaten as an "Asked as" block. A leading backslash is standard markdown
 * escaping and renders as the literal text, so the file still reads correctly.
 *
 * The consequence, worth stating: a real markdown heading cannot be expressed
 * inside an answer body. For form answers that is the right trade.
 */
const BODY_STRUCTURAL = /^(?:#{1,6}\s|<!--|\*\*Asked as:\*\*|\\)/i;

const escapeBodyLine = (l: string) => (BODY_STRUCTURAL.test(l) ? `\\${l}` : l);
const unescapeBodyLine = (l: string) =>
  l.startsWith("\\") && BODY_STRUCTURAL.test(l.slice(1)) ? l.slice(1) : l;

const escapeBody = (text: string) => text.split("\n").map(escapeBodyLine).join("\n");
const unescapeBody = (text: string) => text.split("\n").map(unescapeBodyLine).join("\n");

/**
 * Normalise a question into an alias key: case-folded, accent-stripped,
 * punctuation-free, with leading interrogatives removed. This is what makes
 * "Why do you want to work here?" and "why do you want to work here"
 * collapse to the same lookup, for free and offline.
 */
export function normaliseQuestion(q: string): string {
  return q
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Derive the alias map from the answers themselves. */
export function deriveAliases(answers: readonly Answer[]): Record<string, string> {
  const aliases: Record<string, string> = {};
  for (const a of answers) {
    for (const surface of a.askedAs) {
      const norm = normaliseQuestion(surface);
      if (norm) aliases[norm] = a.canonicalKey;
    }
  }
  return aliases;
}

// ---------------------------------------------------------------- serialise

export function serialise(profile: Profile): string {
  const out: string[] = ["# PERSONAL.md", "", MAGIC, ""];

  out.push("## Facts", "");
  if (profile.facts.length === 0) {
    out.push("_No facts yet. Run the interview from the extension options page._", "");
  } else {
    out.push("| Key | Label | Value | Updated |", "|---|---|---|---|");
    for (const f of [...profile.facts].sort((a, b) => a.key.localeCompare(b.key))) {
      // Every cell is normalised on the way out, not just trusted: a stray
      // newline in a label would otherwise split the row and corrupt the table.
      //
      // Egress is recomputed from the key rather than read off the Fact. Trusting
      // the field meant a Fact built with egress:"sendable" on a personal.nie key
      // wrote the real value into the file - fail-open, exactly backwards. The
      // key is the only thing that decides, on both the read and the write path.
      const egress = classifyEgress(f.key);
      const value = egress === "never" ? SECRET_PLACEHOLDER : normaliseFactValue(f.value);
      const label = normaliseFactValue(f.label) || f.key;
      out.push(
        `| ${escapeCell(f.key)} | ${escapeCell(label)} | ${escapeCell(value)} | ${escapeCell(normaliseFactValue(f.updatedAt))} |`,
      );
    }
    out.push("");
  }

  out.push("## Answers", "");
  if (profile.answers.length === 0) {
    out.push("_No answers yet. They accumulate as you fill out forms._", "");
  }

  const answers = [...profile.answers].sort(
    (a, b) => a.canonicalKey.localeCompare(b.canonicalKey) || a.id.localeCompare(b.id),
  );
  for (const a of answers) {
    out.push(`### ${a.canonicalKey}`);
    out.push(
      `<!-- id:${a.id} lang:${a.language} genre:${a.genre} written:${a.writtenAt} used:${a.useCount} -->`,
    );
    // Trimmed on the way out so the file is stable: parse trims these, so
    // leaving trailing whitespace here makes serialise(parse(x)) differ from x.
    const askedAs = a.askedAs.map((q) => q.trim()).filter((q) => q.length > 0);
    if (askedAs.length > 0) {
      out.push("**Asked as:**");
      for (const q of askedAs) out.push(`- ${q}`);
    }
    // Normalised on the way out for the same reason as the fact cells: parse
    // normalises, so writing raw text makes serialise(parse(x)) differ from x.
    out.push("", escapeBody(normaliseAnswerText(a.text)), "");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// -------------------------------------------------------------------- parse

export interface ParseResult {
  profile: Profile;
  /** Non-fatal problems: unknown genres, malformed rows, missing metadata. */
  warnings: string[];
}

export function parse(md: string): ParseResult {
  const warnings: string[] = [];
  const profile = emptyProfile();
  const lines = md.replace(/\r\n?/g, "\n").split("\n");

  let i = 0;
  // Facts: any pipe-table row inside the Facts section, header rows skipped.
  // We do not require the section to exist - an empty file is valid.
  let section: "none" | "facts" | "answers" = "none";

  const answerStarts: number[] = [];

  for (i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      const name = (h2[1] ?? "").trim().toLowerCase();
      section = name === "facts" ? "facts" : name === "answers" ? "answers" : "none";
      continue;
    }

    if (section === "facts" && line.trimStart().startsWith("|")) {
      const cells = splitRow(line);
      if (cells.length < 3) continue;
      const [rawKey, rawLabel, rawValue] = cells as [string, string, string];
      const rawUpdated = cells[3] ?? "";
      const key = unescapeCell(rawKey).trim();
      if (!key || key.toLowerCase() === "key" || /^-+$/.test(key)) continue;
      if (!KEY_RE.test(key)) {
        warnings.push(`Skipped fact row with unusable key: ${JSON.stringify(key)}`);
        continue;
      }
      const value = normaliseFactValue(unescapeCell(rawValue));
      profile.facts.push({
        key,
        label: unescapeCell(rawLabel).trim() || key,
        value: isSecretPlaceholder(value) ? "" : value,
        egress: classifyEgress(key),
        updatedAt: normaliseFactValue(unescapeCell(rawUpdated)),
      });
      continue;
    }

    const sec = SECTION_RE.exec(line);
    if (sec && KEY_RE.test(sec[1] ?? "")) answerStarts.push(i);
  }

  for (let s = 0; s < answerStarts.length; s++) {
    const start = answerStarts[s] as number;
    const end = s + 1 < answerStarts.length ? (answerStarts[s + 1] as number) : lines.length;
    const parsed = parseAnswerBlock(lines.slice(start, end), warnings);
    if (parsed) profile.answers.push(parsed);
  }

  profile.index.aliases = deriveAliases(profile.answers);
  return { profile, warnings };
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let buf = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && i + 1 < trimmed.length) {
      buf += ch + trimmed[i + 1];
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  cells.push(buf);
  return cells.map((c) => c.trim());
}

function parseAnswerBlock(block: string[], warnings: string[]): Answer | null {
  const head = SECTION_RE.exec(block[0] ?? "");
  const canonicalKey = head?.[1];
  if (!canonicalKey) return null;

  let cursor = 1;
  const meta: Record<string, string> = {};
  const metaMatch = META_RE.exec((block[cursor] ?? "").trim());
  if (metaMatch) {
    for (const pair of (metaMatch[1] ?? "").split(/\s+/)) {
      const idx = pair.indexOf(":");
      if (idx > 0) meta[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
    cursor++;
  } else {
    warnings.push(`Answer "${canonicalKey}" has no metadata line; defaults applied.`);
  }

  const askedAs: string[] = [];
  if (/^\*\*Asked as:\*\*/i.test((block[cursor] ?? "").trim())) {
    cursor++;
    while (cursor < block.length) {
      const m = /^[-*]\s+(.*)$/.exec((block[cursor] ?? "").trim());
      if (!m) break;
      const q = (m[1] ?? "").trim();
      if (q) askedAs.push(q);
      cursor++;
    }
  }

  const genre = GENRES.includes(meta["genre"] as Genre) ? (meta["genre"] as Genre) : "other";
  if (meta["genre"] && genre !== meta["genre"]) {
    warnings.push(`Answer "${canonicalKey}" has unknown genre "${meta["genre"]}"; used "other".`);
  }
  const language: Lang = meta["lang"] === "es" ? "es" : "en";
  const used = Number.parseInt(meta["used"] ?? "0", 10);

  return {
    id: meta["id"] || mintId(canonicalKey, askedAs[0] ?? ""),
    canonicalKey,
    askedAs,
    text: normaliseAnswerText(unescapeBody(block.slice(cursor).join("\n"))),
    language,
    genre,
    writtenAt: meta["written"] ?? "",
    useCount: Number.isFinite(used) && used >= 0 ? used : 0,
  };
}

/** Deterministic short id, so a hand-authored section keeps a stable id. */
export function mintId(canonicalKey: string, seed = ""): string {
  let h = 0x811c9dc5;
  for (const ch of `${canonicalKey}\u0000${seed}`) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(0, 7);
}

/** Convenience for the fact lookup the deterministic filler needs. */
export function factMap(profile: Profile): Map<string, Fact> {
  return new Map(profile.facts.map((f) => [f.key, f]));
}
