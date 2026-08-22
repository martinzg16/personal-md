import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { Store } from "../src/store.ts";
import { paths } from "../src/paths.ts";
import { loadOrCreateToken, tokenMatches } from "../src/auth.ts";

/**
 * Every test gets its own PERSONAL_MD_HOME. Sharing one directory made an
 * earlier version of this file fail for the wrong reason: facts written by one
 * test leaked into another's assertions and looked like a merge bug.
 *
 * This works because paths.ts resolves the env var lazily on each access.
 */
async function freshStore(): Promise<Store> {
  process.env["PERSONAL_MD_HOME"] = await mkdtemp(join(tmpdir(), "personal-md-test-"));
  const store = new Store();
  await store.init();
  return store;
}

after(() => {
  delete process.env["PERSONAL_MD_HOME"];
});

const perms = async (p: string) => (await stat(p)).mode & 0o777;

describe("store layout", () => {
  it("creates a private directory tree and the isolated cwd", async () => {
    const store = await freshStore();

    assert.equal(await perms(paths.root), 0o700, "root should not be group/world readable");
    assert.equal(await perms(paths.isolated), 0o700);

    // The isolated cwd keeps CLAUDE.md discovery and auto-memory out of every
    // prompt (~29.9k -> ~25.9k total input). Modest, but free.
    const mcp = JSON.parse(await readFile(join(paths.isolated, "mcp.json"), "utf8"));
    const settings = JSON.parse(await readFile(join(paths.isolated, "settings.json"), "utf8"));
    assert.deepEqual(mcp, { mcpServers: {} });
    assert.equal(settings.disableAllHooks, true);
    assert.equal(settings.enableAllProjectMcpServers, false);
  });

  it("starts from an empty profile when no file exists", async () => {
    const store = await freshStore();
    const { profile } = await store.load();
    assert.deepEqual(profile.facts, []);
    assert.deepEqual(profile.answers, []);
  });
});

describe("secrets stay out of PERSONAL.md", () => {
  it("writes a placeholder to the file and the value to secrets.json", async () => {
    const store = await freshStore();
    await store.upsertFacts([
      { key: "personal.full_name", label: "Full name", value: "Test Person", updatedAt: "" },
      { key: "personal.nif", label: "NIF", value: "12345678Z", updatedAt: "" },
    ]);

    const md = await readFile(paths.profile, "utf8");
    assert.ok(!md.includes("12345678Z"), "the NIF leaked into PERSONAL.md");
    assert.ok(md.includes("Test Person"), "a non-sensitive value should be in the file");

    const secrets = JSON.parse(await readFile(paths.secrets, "utf8"));
    assert.equal(secrets["personal.nif"], "12345678Z");
    assert.equal(secrets["personal.full_name"], undefined, "only secrets belong in secrets.json");

    assert.equal(await perms(paths.secrets), 0o600);
    assert.equal(await perms(paths.profile), 0o600);
  });

  it("rehydrates withheld values on load so local filling still works", async () => {
    const store = await freshStore();
    await store.upsertFacts([{ key: "personal.nif", label: "NIF", value: "87654321X", updatedAt: "" }]);

    const { profile } = await store.load();
    const nif = profile.facts.find((f) => f.key === "personal.nif");
    assert.equal(nif?.egress, "never");
    assert.equal(nif?.value, "87654321X", "the value must come back for deterministic filling");
  });
});

describe("hand-editing while the server is running", () => {
  it("preserves an external edit made between two requests", async () => {
    const store = await freshStore();
    await store.upsertFacts([
      { key: "work.current_role", label: "Current role", value: "Product Manager", updatedAt: "" },
    ]);

    // The server has now read the file and is holding an mtime. Simulate Martín
    // opening PERSONAL.md in an editor and adding a row by hand.
    const md = await readFile(paths.profile, "utf8");
    const handEdited = md.replace(
      "| work.current_role | Current role | Product Manager |",
      "| languages.english | English | C1 |\n| work.current_role | Current role | Product Manager |",
    );
    assert.notEqual(handEdited, md, "test fixture did not apply the hand edit");
    await writeFile(paths.profile, handEdited);

    assert.equal(await store.changedOnDisk(), true, "the store should notice the external write");

    // Now a normal request arrives and writes an unrelated fact.
    await store.upsertFacts([
      { key: "personal.email", label: "Email", value: "a@b.com", updatedAt: "" },
    ]);

    const { profile } = await store.load();
    const keys = profile.facts.map((f) => f.key).sort();
    assert.deepEqual(
      keys,
      ["languages.english", "personal.email", "work.current_role"],
      "the hand edit was clobbered by the server write",
    );
    assert.equal(profile.facts.find((f) => f.key === "languages.english")?.value, "C1");
  });

  it("leaves no temp files behind", async () => {
    const store = await freshStore();
    await store.upsertFacts([{ key: "personal.phone", label: "Phone", value: "+34", updatedAt: "" }]);
    const leftovers = (await readdir(paths.root)).filter((f) => f.endsWith(".tmp"));
    assert.deepEqual(leftovers, [], "atomic write should rename, not leave temp files");
  });
});

describe("answers accumulate surface forms", () => {
  it("merges a second language into the same canonical key", async () => {
    const store = await freshStore();

    await store.recordAnswer({
      canonicalKey: "motivation.why_this_company",
      question: "Why do you want to work here?",
      text: "Because the tax problem is interesting.",
      language: "en",
      genre: "job_application",
    });
    await store.recordAnswer({
      canonicalKey: "motivation.why_this_company",
      question: "¿Por qué te interesa esta posición?",
      text: "",
      language: "es",
      genre: "job_application",
    });

    const { profile } = await store.load();
    assert.equal(profile.answers.length, 1, "should merge, not duplicate");
    const answer = profile.answers[0];
    assert.equal(answer?.askedAs.length, 2, "both surface forms should be remembered");
    assert.equal(
      answer?.text,
      "Because the tax problem is interesting.",
      "an empty text must not wipe the stored answer",
    );
    assert.equal(answer?.useCount, 2);

    // Both languages now resolve to the same key for free, with no model call.
    assert.equal(
      profile.index.aliases["por que te interesa esta posicion"],
      "motivation.why_this_company",
    );
    assert.equal(
      profile.index.aliases["why do you want to work here"],
      "motivation.why_this_company",
    );
  });

  it("does not re-add a surface form that differs only in case or accents", async () => {
    const store = await freshStore();
    await store.recordAnswer({
      canonicalKey: "experience.leadership_story",
      question: "Describe a time you led a project",
      text: "I led the migration.",
      language: "en",
      genre: "job_application",
    });
    await store.recordAnswer({
      canonicalKey: "experience.leadership_story",
      question: "  describe a time you led a project?  ",
      text: "",
      language: "en",
      genre: "job_application",
    });
    const { profile } = await store.load();
    const answer = profile.answers.find((a) => a.canonicalKey === "experience.leadership_story");
    assert.equal(answer?.askedAs.length, 1, "near-identical surface forms should collapse");
  });
});

describe("spend ledger", () => {
  it("accumulates so the shared-quota cost is visible", async () => {
    const store = await freshStore();
    await store.recordSpend({ inputTokens: 5700, outputTokens: 300, costUsd: 0.01 });
    await store.recordSpend({ inputTokens: 5700, outputTokens: 400, costUsd: 0.01 });
    const { index } = await store.load();
    assert.equal(index.ledger.calls, 2);
    assert.equal(index.ledger.inputTokens, 11400);
    assert.equal(index.ledger.outputTokens, 700);
  });
});

describe("token", () => {
  it("is stable, private, and compared safely", async () => {
    await freshStore();
    const first = await loadOrCreateToken();
    const second = await loadOrCreateToken();
    assert.equal(first, second, "token should persist across calls");
    assert.ok(first.length >= 32);
    assert.equal(await perms(paths.token), 0o600);

    assert.equal(tokenMatches(first, first), true);
    assert.equal(tokenMatches(first, "wrong"), false);
    assert.equal(tokenMatches(first, undefined), false);
    assert.equal(tokenMatches(first, first + "x"), false);
  });
});

describe("learning a confirmed batch", () => {
  it("saves facts and answers together", async () => {
    const store = await freshStore();
    const { profile } = await store.learn({
      facts: [
        { key: "personal.city", label: "Ciudad", value: "Madrid", updatedAt: "" },
        { key: "work.current_role", label: "Puesto", value: "Product Manager", updatedAt: "" },
      ],
      answers: [
        {
          canonicalKey: "motivation.why_this_company",
          question: "¿Por qué te interesa esta posición?",
          text: "Porque llevo seis años decidiendo qué problemas fiscales merece la pena resolver.",
          language: "es",
          genre: "job_application",
        },
      ],
    });

    assert.equal(profile.facts.length, 2);
    assert.equal(profile.answers.length, 1);

    // Everything is on disk after that one call.
    const reread = await store.load();
    assert.equal(reread.profile.facts.find((f) => f.key === "personal.city")?.value, "Madrid");
    assert.equal(reread.profile.answers[0]?.canonicalKey, "motivation.why_this_company");
    assert.deepEqual(reread.profile.answers[0]?.askedAs, ["¿Por qué te interesa esta posición?"]);
  });

  it("writes nothing at all if any item in the batch fails", async () => {
    // The reason learn() exists. The user confirmed the batch as one decision,
    // so a failure partway must not leave half of it on disk with no way to
    // tell which half. Writes happen after the whole mutation, so a throw
    // inside it leaves the file exactly as it was.
    const store = await freshStore();
    await store.learn({
      facts: [{ key: "personal.city", label: "Ciudad", value: "Madrid", updatedAt: "" }],
    });
    const before = await readFile(paths.profile, "utf8");

    const exploding = {
      canonicalKey: "motivation.why_this_company",
      question: "¿Por qué te interesa esta posición?",
      get text(): string {
        throw new Error("boom");
      },
      language: "es" as const,
      genre: "job_application" as const,
    };

    await assert.rejects(() =>
      store.learn({
        facts: [{ key: "personal.country", label: "País", value: "España", updatedAt: "" }],
        answers: [exploding],
      }),
    );

    // Not the country, not a partial answer, nothing.
    assert.equal(await readFile(paths.profile, "utf8"), before);
    const { profile } = await store.load();
    assert.equal(profile.facts.length, 1);
    assert.equal(profile.answers.length, 0);
  });

  it("merges into what is already there rather than replacing it", async () => {
    const store = await freshStore();
    await store.learn({
      facts: [{ key: "personal.city", label: "Ciudad", value: "Madrid", updatedAt: "" }],
      answers: [
        {
          canonicalKey: "motivation.why_this_company",
          question: "¿Por qué te interesa esta posición?",
          text: "Primera versión.",
          language: "es",
          genre: "job_application",
        },
      ],
    });

    // A second batch naming the same question in English must accumulate the
    // surface form, not start a second answer - that accumulation is what makes
    // the question free to recognise next time, in either language.
    await store.learn({
      facts: [{ key: "personal.country", label: "País", value: "España", updatedAt: "" }],
      answers: [
        {
          canonicalKey: "motivation.why_this_company",
          question: "Why do you want to work here?",
          text: "Segunda versión.",
          language: "es",
          genre: "job_application",
        },
      ],
    });

    const { profile } = await store.load();
    assert.deepEqual(
      profile.facts.map((f) => f.key).sort(),
      ["personal.city", "personal.country"],
    );
    assert.equal(profile.answers.length, 1);
    assert.equal(profile.answers[0]?.text, "Segunda versión.");
    assert.equal(profile.answers[0]?.askedAs.length, 2);
  });

  it("still withholds a sensitive key learned through a batch", async () => {
    // The batch path must not be a way around the egress allowlist. A NIF
    // confirmed here is as withheld as one entered in the editor.
    const store = await freshStore();
    await store.learn({
      facts: [{ key: "personal.nif", label: "NIF", value: "12345678Z", updatedAt: "" }],
    });

    const { profile } = await store.load();
    const nif = profile.facts.find((f) => f.key === "personal.nif");
    assert.equal(nif?.egress, "never");
    // Usable locally...
    assert.equal(nif?.value, "12345678Z");
    // ...but never written into the shareable file.
    const onDisk = await readFile(paths.profile, "utf8");
    assert.ok(!onDisk.includes("12345678Z"), "the NIF must not appear in PERSONAL.md");
  });
});
