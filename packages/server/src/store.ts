/**
 * The store: PERSONAL.md plus its two sidecar files.
 *
 * The concurrency model is worth stating, because it is what makes hand-editing
 * safe. Every mutation is expressed as a function from Profile to Profile, and
 * `update()` always re-reads the file immediately before applying it. There is
 * no field-level merge and no last-write-wins on stale state: if the file
 * changed while the server held an older copy, the mutation is simply applied
 * on top of the newer content. A hand edit made between two requests survives,
 * and so does the request's own change.
 *
 * Writes go to a temp file and are renamed into place, so a crash mid-write
 * cannot leave a half-written PERSONAL.md.
 */

import { randomBytes } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  type Answer,
  type Fact,
  type Profile,
  classifyEgress,
  emptyProfile,
  normaliseAnswerText,
  normaliseQuestion,
  parse,
  serialise,
} from "@personal-md/core";

import { CLAUDE_SETTINGS, MCP_CONFIG, ensureDirs, isolatedFiles, paths } from "./paths.ts";

/** Machine state. No meaning to a human, so it stays out of PERSONAL.md. */
export interface IndexFile {
  /** "domain\tfieldSignature" to canonicalKey */
  siteMemory: Record<string, string>;
  /** Cumulative token spend, so the shared-quota cost is visible not theoretical. */
  ledger: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  /** Per-fact timestamps are in PERSONAL.md; this is for answers. */
  updatedAt: string;
}

const emptyIndex = (): IndexFile => ({
  siteMemory: {},
  ledger: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  updatedAt: "",
});

/** One answer, as confirmed by the user rather than as stored. */
export interface AnswerInput {
  canonicalKey: string;
  question: string;
  text: string;
  language: Answer["language"];
  genre: Answer["genre"];
}

export interface LoadedProfile {
  profile: Profile;
  warnings: string[];
  index: IndexFile;
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return { ...fallback, ...(JSON.parse(await readFile(path, "utf8")) as object) } as T;
  } catch {
    return fallback;
  }
}

/** Write via temp + rename so a crash cannot truncate the real file. */
async function writeAtomic(path: string, data: string, mode: number): Promise<void> {
  const tmp = join(dirname(path), `.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(tmp, data, { mode });
  await rename(tmp, path);
}

export class Store {
  /** mtime of PERSONAL.md as of the last read, in ms. */
  private lastMtimeMs = -1;

  async init(): Promise<void> {
    await ensureDirs();
    await writeAtomic(isolatedFiles.mcp, JSON.stringify(MCP_CONFIG), 0o600);
    await writeAtomic(isolatedFiles.settings, JSON.stringify(CLAUDE_SETTINGS), 0o600);
  }

  /** True when the file changed underneath us since the last read. */
  async changedOnDisk(): Promise<boolean> {
    try {
      const s = await stat(paths.profile);
      return s.mtimeMs !== this.lastMtimeMs;
    } catch {
      return this.lastMtimeMs !== -1;
    }
  }

  async load(): Promise<LoadedProfile> {
    let md = "";
    try {
      md = await readFile(paths.profile, "utf8");
      this.lastMtimeMs = (await stat(paths.profile)).mtimeMs;
    } catch {
      this.lastMtimeMs = -1;
    }

    const { profile, warnings } = md ? parse(md) : { profile: emptyProfile(), warnings: [] };
    const index = await readJson<IndexFile>(paths.index, emptyIndex());
    const secrets = await readJson<Record<string, string>>(paths.secrets, {});

    // Rehydrate withheld values. PERSONAL.md only ever held a placeholder.
    for (const fact of profile.facts) {
      if (fact.egress === "never") fact.value = secrets[fact.key] ?? "";
    }

    return { profile, warnings, index };
  }

  /**
   * Apply a mutation to the freshest state on disk and persist the result.
   *
   * The re-read is not an optimisation; it is the whole concurrency story. See
   * the note at the top of this file.
   */
  async update(mutate: (p: Profile, i: IndexFile) => void): Promise<LoadedProfile> {
    const current = await this.load();
    mutate(current.profile, current.index);

    // Split secrets back out before anything is written.
    const secrets: Record<string, string> = {};
    for (const fact of current.profile.facts) {
      fact.egress = classifyEgress(fact.key);
      if (fact.egress === "never" && fact.value) secrets[fact.key] = fact.value;
    }

    current.index.updatedAt = new Date().toISOString();

    await writeAtomic(paths.profile, serialise(current.profile), 0o600);
    await writeAtomic(paths.secrets, JSON.stringify(secrets, null, 2), 0o600);
    await writeAtomic(paths.index, JSON.stringify(current.index, null, 2), 0o600);

    this.lastMtimeMs = (await stat(paths.profile)).mtimeMs;
    return current;
  }

  // ------------------------------------------------------------- mutations

  /**
   * Apply facts to a profile in memory. No write.
   *
   * Separated from upsertFacts so a confirmed batch of facts *and* answers can
   * share a single write - see learn().
   */
  private applyFacts(profile: Profile, incoming: readonly Omit<Fact, "egress">[]): void {
    const now = new Date().toISOString().slice(0, 10);
    for (const raw of incoming) {
      const key = raw.key.trim();
      if (!key) continue;
      const existing = profile.facts.find((f) => f.key === key);
      const fact: Fact = {
        key,
        label: raw.label || existing?.label || key,
        value: raw.value,
        egress: classifyEgress(key),
        updatedAt: raw.updatedAt || now,
      };
      if (existing) Object.assign(existing, fact);
      else profile.facts.push(fact);
    }
  }

  async upsertFacts(incoming: readonly Omit<Fact, "egress">[]): Promise<LoadedProfile> {
    return this.update((profile) => this.applyFacts(profile, incoming));
  }

  /**
   * Record an answer, merging into an existing one for the same canonical key.
   *
   * `askedAs` accumulates rather than replaces: that list is what makes the same
   * question free to recognise next time, in either language, so a surface form
   * seen once is never thrown away.
   */
  async recordAnswer(input: AnswerInput): Promise<LoadedProfile> {
    return this.update((profile) => this.applyAnswer(profile, input));
  }

  /** Apply one answer to a profile in memory. No write. */
  private applyAnswer(profile: Profile, input: AnswerInput): void {
    const text = normaliseAnswerText(input.text);
    const existing = profile.answers.find((a) => a.canonicalKey === input.canonicalKey);
    const surface = input.question.trim();

    if (existing) {
      const seen = new Set(existing.askedAs.map(normaliseQuestion));
      if (surface && !seen.has(normaliseQuestion(surface))) existing.askedAs.push(surface);
      if (text) {
        existing.text = text;
        existing.writtenAt = new Date().toISOString().slice(0, 10);
      }
      existing.useCount += 1;
      return;
    }

    profile.answers.push({
      id: randomBytes(4).toString("hex"),
      canonicalKey: input.canonicalKey,
      askedAs: surface ? [surface] : [],
      text,
      language: input.language,
      genre: input.genre,
      writtenAt: new Date().toISOString().slice(0, 10),
      useCount: 1,
    });
  }

  /**
   * Save a batch of confirmed items in one write.
   *
   * This is what "nothing is stored silently" needs on the server. The widget
   * collects new values quietly while a long form is filled and asks once, at
   * the end, about all of them together - so the answer to that one question has
   * to land as one write. Calling upsertFacts and then recordAnswer would
   * re-read and re-serialise PERSONAL.md per item, and a failure partway through
   * would leave some of a batch the user confirmed as a whole on disk and the
   * rest gone, with no way for them to tell which.
   */
  async learn(batch: {
    facts?: readonly Omit<Fact, "egress">[];
    answers?: readonly AnswerInput[];
  }): Promise<LoadedProfile> {
    return this.update((profile) => {
      if (batch.facts?.length) this.applyFacts(profile, batch.facts);
      for (const answer of batch.answers ?? []) this.applyAnswer(profile, answer);
    });
  }

  /**
   * Remember that a question was asked this way, without touching the answer.
   *
   * Distinct from recordAnswer on purpose. This runs when stage C classifies a
   * never-seen question, which happens *before* the person has done anything
   * with the result - so bumping useCount would count a match as a use. The
   * point is only that the surface form is now known, making this question free
   * to recognise from here on.
   */
  async learnAlias(canonicalKey: string, surfaceForm: string): Promise<LoadedProfile> {
    const surface = surfaceForm.trim();
    return this.update((profile) => {
      if (!surface) return;
      const existing = profile.answers.find((a) => a.canonicalKey === canonicalKey);

      if (existing) {
        const seen = new Set(existing.askedAs.map(normaliseQuestion));
        if (!seen.has(normaliseQuestion(surface))) existing.askedAs.push(surface);
        return;
      }

      // No answer yet for this key. Record the question anyway, with empty text,
      // so the alias exists and drafting has somewhere to put its result.
      profile.answers.push({
        id: randomBytes(4).toString("hex"),
        canonicalKey,
        askedAs: [surface],
        text: "",
        language: "en",
        genre: "other",
        writtenAt: new Date().toISOString().slice(0, 10),
        useCount: 0,
      });
    });
  }

  async rememberSite(domain: string, signature: string, canonicalKey: string): Promise<void> {
    await this.update((_p, index) => {
      index.siteMemory[`${domain}\t${signature}`] = canonicalKey;
    });
  }

  async recordSpend(usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }): Promise<void> {
    await this.update((_p, index) => {
      index.ledger.calls += 1;
      index.ledger.inputTokens += usage.inputTokens;
      index.ledger.outputTokens += usage.outputTokens;
      index.ledger.costUsd += usage.costUsd;
    });
  }
}
