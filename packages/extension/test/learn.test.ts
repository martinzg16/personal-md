/**
 * What a form is allowed to teach the profile.
 *
 * The gate is the interesting part. Capture runs over the same scan the filler
 * uses, so anything the filler refuses must be refused here too - a tool that
 * declines to type your password into a form but quietly files it away has done
 * the worse of the two things.
 */

import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { describe, it } from "node:test";
import type { Profile } from "@personal-md/core";

import { collectPendingFacts, reconcileFacts, batchSize, emptyBatch } from "../lib/learn/pending.ts";
import { readFieldValue } from "../lib/fill/apply.ts";
import { learnKeyFor } from "../lib/scan/bridge.ts";
import { scanFields } from "../lib/scan/scanner.ts";

const docOf = (html: string) => new JSDOM(`<html lang="es"><body>${html}</body></html>`).window.document;

const profileOf = (facts: Record<string, string>): Profile => ({
  facts: Object.entries(facts).map(([key, value]) => ({
    key,
    label: key,
    value,
    egress: "never" as const,
    updatedAt: "2026-08-01",
  })),
  answers: [],
});

describe("what a form can teach the file", () => {
  it("offers a value the file does not have", () => {
    const doc = docOf(`
      <form>
        <label for="c">Ciudad</label><input id="c" name="city" value="Barcelona">
      </form>`);
    const found = collectPendingFacts(scanFields(doc), doc, profileOf({}));
    assert.equal(found.length, 1);
    assert.equal(found[0]?.key, "personal.city");
    assert.equal(found[0]?.value, "Barcelona");
    assert.equal(found[0]?.replaces, undefined);
  });

  it("says what a value would replace, rather than overwriting quietly", () => {
    const doc = docOf(`
      <form>
        <label for="c">Ciudad</label><input id="c" name="city" value="Barcelona">
      </form>`);
    const found = collectPendingFacts(scanFields(doc), doc, profileOf({ "personal.city": "Madrid" }));
    assert.equal(found[0]?.replaces, "Madrid");
  });

  it("does not offer what the file already holds", () => {
    // Confirming what you already know teaches nothing and trains you to click
    // through the panel without reading it.
    const doc = docOf(`
      <form>
        <label for="c">Ciudad</label><input id="c" name="city" value="  madrid ">
      </form>`);
    const found = collectPendingFacts(scanFields(doc), doc, profileOf({ "personal.city": "Madrid" }));
    assert.deepEqual(found, []);
  });

  it("never captures a password, whatever the form calls it", () => {
    const doc = docOf(`
      <form>
        <label for="p">Contraseña</label><input id="p" type="password" value="hunter2">
        <label for="p2">Repite la contraseña</label><input id="p2" type="password" value="hunter2">
      </form>`);
    const found = collectPendingFacts(scanFields(doc), doc, profileOf({}));
    assert.deepEqual(found, []);
  });

  it("never captures card details", () => {
    const doc = docOf(`
      <form>
        <label for="n">Número de tarjeta</label><input id="n" autocomplete="cc-number" value="4111111111111111">
        <label for="v">CVV</label><input id="v" value="123">
      </form>`);
    const found = collectPendingFacts(scanFields(doc), doc, profileOf({}));
    assert.equal(
      found.length,
      0,
      `expected nothing, got ${found.map((f) => f.key).join(", ")}`,
    );
  });

  it("does not capture an open question as a fact", () => {
    // Long-form answers are learned through the drafting path, with a canonical
    // key. Filing one under a fact key would lose the question it answers.
    const doc = docOf(`
      <form>
        <label for="q">¿Por qué te interesa esta posición?</label>
        <textarea id="q" maxlength="2000">Porque llevo seis años en fiscalidad.</textarea>
      </form>`);
    const found = collectPendingFacts(scanFields(doc), doc, profileOf({}));
    assert.deepEqual(found, []);
  });

  it("offers one candidate per fact key, not one per box", () => {
    const doc = docOf(`
      <form>
        <label for="c1">Ciudad</label><input id="c1" name="city" value="Barcelona">
        <label for="c2">Ciudad de residencia</label><input id="c2" name="city2" value="Valencia">
      </form>`);
    const found = collectPendingFacts(scanFields(doc), doc, profileOf({}));
    assert.equal(found.filter((f) => f.key === "personal.city").length, 1);
  });

  it("learns a first name under its own key rather than reverse-engineering one", () => {
    // findFillValue derives a first name from a stored full name, so DIRECT has
    // no entry for it - but a first name the user typed is worth keeping as one.
    assert.equal(learnKeyFor("personal.name.first"), "personal.first_name");
    assert.equal(learnKeyFor("personal.name.last"), "personal.last_name");
    assert.equal(learnKeyFor("auth.password"), null);
  });

  it("skips empty fields", () => {
    const doc = docOf(`
      <form><label for="c">Ciudad</label><input id="c" name="city" value="   "></form>`);
    assert.deepEqual(collectPendingFacts(scanFields(doc), doc, profileOf({})), []);
  });
});

describe("reading a field's current value", () => {
  it("reads a select's visible text, not its code", () => {
    // "ES" is what the page stores; "España" is what the user chose and what
    // belongs in a file they read.
    const doc = docOf(`
      <select id="s"><option value="">--</option><option value="ES" selected>España</option></select>`);
    assert.equal(readFieldValue(doc.getElementById("s") as HTMLElement), "España");
  });

  it("treats an unselected placeholder as no answer", () => {
    const doc = docOf(`<select id="s"><option value="" selected></option><option value="ES">España</option></select>`);
    assert.equal(readFieldValue(doc.getElementById("s") as HTMLElement), "");
  });

  it("reads the checked radio's label from a group", () => {
    const doc = docOf(`
      <input type="radio" id="r1" name="mode" value="remote"><label for="r1">En remoto</label>
      <input type="radio" id="r2" name="mode" value="office" checked><label for="r2">En oficina</label>`);
    assert.equal(readFieldValue(doc.getElementById("r1") as HTMLElement), "En oficina");
  });

  it("returns nothing for a password even when asked directly", () => {
    const doc = docOf(`<input id="p" type="password" value="hunter2">`);
    assert.equal(readFieldValue(doc.getElementById("p") as HTMLElement), "");
  });
});

describe("a batch the user has started interacting with", () => {
  const fact = (key: string, value: string) => ({ fieldId: key, key, label: key, value });

  it("does not re-offer something the user declined", () => {
    const fresh = [fact("personal.city", "Barcelona"), fact("personal.country", "España")];
    const out = reconcileFacts([], fresh, new Set(["personal.city"]), new Map());
    assert.deepEqual(out.map((f) => f.key), ["personal.country"]);
  });

  it("prefers the value the user corrected in the panel over the page's", () => {
    // The page is where the value came from, not the authority on what it means.
    const fresh = [fact("personal.city", "BARCELONA")];
    const out = reconcileFacts([], fresh, new Set(), new Map([["personal.city", "Barcelona"]]));
    assert.equal(out[0]?.value, "Barcelona");
  });

  it("keeps an edited item whose field the user has since cleared", () => {
    const previous = [fact("personal.city", "Barcelona")];
    const out = reconcileFacts(previous, [], new Set(), new Map([["personal.city", "Barcelona"]]));
    assert.equal(out.length, 1);
    assert.equal(out[0]?.value, "Barcelona");
  });

  it("counts facts and answers together", () => {
    assert.equal(batchSize(emptyBatch()), 0);
    assert.equal(
      batchSize({
        facts: [fact("personal.city", "Madrid")],
        answers: [
          { fieldId: "f", canonicalKey: "motivation.why_this_company", question: "q", text: "t" },
        ],
      }),
      2,
    );
  });
});
