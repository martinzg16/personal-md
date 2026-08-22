/**
 * Scanner, label resolution and classification, against a fixture written to
 * look like a real Spanish ATS form rather than a convenient one.
 *
 * jsdom has no layout engine, so `getClientRects` is empty and `offsetParent` is
 * null for everything. That is exactly why the scanner reports `visible` instead
 * of filtering on it - otherwise none of this would be testable outside a
 * browser. Real-browser verification is separate.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { before, describe, it } from "node:test";

import { classifyField, detectFormPurpose, isOpenQuestion } from "../lib/scan/classify.ts";
import { resolveLabel } from "../lib/scan/labels.ts";
import { buildScanResult, resetIdCounter, scanFields, STAMP } from "../lib/scan/scanner.ts";
import type { ScannedField } from "../lib/scan/types.ts";

const fixture = readFileSync(
  join(import.meta.dirname, "fixtures", "job-application.html"),
  "utf8",
);

let dom: JSDOM;
let fields: ScannedField[];
const byName = (name: string) => fields.find((f) => f.name === name);

before(() => {
  dom = new JSDOM(fixture, { url: "https://careers.example.com/apply" });
  // The scanner reads CSS.escape and Element off the document's window, but the
  // module-level helpers use the globals, so point them at this DOM.
  const g = globalThis as unknown as Record<string, unknown>;
  g["CSS"] = dom.window.CSS;
  g["HTMLInputElement"] = dom.window.HTMLInputElement;
  g["HTMLTextAreaElement"] = dom.window.HTMLTextAreaElement;
  g["HTMLSelectElement"] = dom.window.HTMLSelectElement;
  g["Event"] = dom.window.Event;
  resetIdCounter();
  fields = scanFields(dom.window.document);
});

describe("label resolution", () => {
  const expected: [string, string, string][] = [
    ["candidate_full_name", "Nombre y apellidos", "label[for]"],
    ["email", "Correo electrónico", "wrapping-label"],
    ["salary", "Expectativa salarial bruta anual", "aria-labelledby"],
    ["phone", "Teléfono de contacto", "aria-label"],
    ["tax_id", "NIF / NIE", "preceding-text"],
    ["city", "Ciudad", "table-cell"],
    ["yoe", "Años de experiencia", "table-cell"],
    ["remote", "Preferencia de trabajo remoto", "fieldset-legend"],
  ];

  for (const [name, label, source] of expected) {
    it(`reads ${JSON.stringify(label)} via ${source}`, () => {
      const field = byName(name);
      assert.ok(field, `no field named ${name}`);
      assert.equal(field.label, label);
      assert.equal(field.labelSource, source);
    });
  }

  it("joins a split aria-labelledby list", () => {
    // The spike read aria-labelledby as a single id and lost half the label.
    const el = dom.window.document.querySelector<HTMLElement>('[name="salary"]');
    assert.ok(el);
    const { text } = resolveLabel(el);
    assert.equal(text, "Expectativa salarial bruta anual");
  });

  it("strips the control's own text from a wrapping label", () => {
    assert.equal(byName("email")?.label, "Correo electrónico");
  });
});

describe("classification", () => {
  const expected: [string, string][] = [
    ["candidate_full_name", "personal.name.full"],
    ["email", "personal.email"],
    ["phone", "personal.phone"],
    ["salary", "work.salary_expectation"],
    ["tax_id", "personal.nif"],
    ["city", "address.city"],
    ["yoe", "work.years_experience"],
    ["remote", "work.remote_preference"],
    ["education_level", "education.level"],
    ["password", "auth.password"],
    ["cv", "file.upload"],
    ["gdpr", "consent.checkbox"],
  ];

  for (const [name, category] of expected) {
    it(`classifies ${name} as ${category}`, () => {
      assert.equal(byName(name)?.category, category);
    });
  }

  it('reads "Nombre y apellidos" as a full name, not a first name', () => {
    // The spike matched bare `nombre` to first-name, so the commonest Spanish
    // full-name label was misclassified and would fill only the given name.
    assert.equal(byName("candidate_full_name")?.category, "personal.name.full");
  });

  it("still recognises a genuine first-name field", () => {
    const { category } = classifyField({
      name: "first_name",
      htmlId: "",
      label: "Nombre",
      placeholder: "",
      ariaLabel: "",
      inputType: "text",
      autocomplete: "given-name",
      tag: "input",
      maxLength: null,
    });
    assert.equal(category, "personal.name.first");
  });

  it("detects the form purpose", () => {
    const result = buildScanResult(fields, dom.window.document);
    assert.equal(result.purpose, "job_application");
  });
});

describe("open-question detection", () => {
  it("treats every textarea as an open question", () => {
    assert.equal(byName("why_this_role")?.category, "open.question");
    assert.equal(byName("leadership")?.category, "open.question");
  });

  it("treats a long-maxlength text input as an open question", () => {
    // This is the case a keyword classifier misses entirely.
    assert.equal(byName("about")?.category, "open.question");
  });

  it("does not treat a short labelled field as an open question", () => {
    assert.equal(byName("city")?.category, "address.city");
    assert.equal(byName("email")?.category, "personal.email");
  });

  it("recognises a question by its question mark", () => {
    const base = {
      name: "",
      htmlId: "",
      placeholder: "",
      ariaLabel: "",
      inputType: "text",
      autocomplete: "",
      tag: "input" as const,
      maxLength: null,
    };
    assert.equal(isOpenQuestion({ ...base, label: "Why do you want to work here?" }), true);
    assert.equal(isOpenQuestion({ ...base, label: "Ciudad" }), false);
  });

  it("never lets a password or card field be read as an open question", () => {
    // A textarea is a strong signal, but not strong enough to override a field
    // we must refuse to touch.
    const { category } = classifyField({
      name: "password",
      htmlId: "",
      label: "Contraseña",
      placeholder: "",
      ariaLabel: "",
      inputType: "password",
      autocomplete: "new-password",
      tag: "input",
      maxLength: 500,
    });
    assert.equal(category, "auth.password");
  });
});

describe("toggle labels", () => {
  it("labels a lone checkbox from its own wrapping label", () => {
    // Found in a real browser, not here: the original test only asserted the
    // category, so a label of "Contraseña" - scavenged from the previous field -
    // went unnoticed.
    const gdpr = byName("gdpr");
    assert.equal(gdpr?.label, "Acepto la política de privacidad");
    assert.equal(gdpr?.labelSource, "wrapping-label");
  });

  it("labels a radio group from its legend, not from one option", () => {
    const remote = byName("remote");
    assert.equal(remote?.label, "Preferencia de trabajo remoto");
    assert.equal(remote?.labelSource, "fieldset-legend");
  });
});

describe("radio and checkbox groups collapse", () => {
  it("emits one field for a three-option radio group", () => {
    const remotes = fields.filter((f) => f.name === "remote");
    assert.equal(remotes.length, 1, "the spike emitted one field per radio button");
    assert.equal(remotes[0]?.options?.length, 3);
    assert.deepEqual(
      remotes[0]?.options?.map((o) => o.value),
      ["onsite", "hybrid", "remote"],
    );
    assert.equal(remotes[0]?.group, "remote");
  });
});

describe("ids are stable across re-scans", () => {
  it("reuses the existing stamp rather than renumbering", () => {
    // The spike incremented a module-global counter every scan, so a re-scan
    // renumbered every field and any suggestion the widget held went stale.
    const first = scanFields(dom.window.document).map((f) => f.id);
    const second = scanFields(dom.window.document).map((f) => f.id);
    assert.deepEqual(second, first);
  });

  it("stamps the DOM so an element can be found again", () => {
    const field = byName("email");
    assert.ok(field);
    const found = dom.window.document.querySelector(`[${STAMP}="${field.id}"]`);
    assert.equal(found, field.element);
  });
});

describe("fields to leave alone", () => {
  it("reports the honeypot as not visible", () => {
    assert.equal(byName("website_url_hp")?.visible, false);
  });

  it("reports read-only and disabled state", () => {
    assert.equal(byName("ref")?.readOnly, true);
    assert.equal(byName("internal")?.disabled, true);
  });

  it("skips buttons and submits entirely", () => {
    assert.equal(
      fields.some((f) => ["submit", "button", "reset", "image", "hidden"].includes(f.inputType)),
      false,
    );
  });
});

describe("form purpose from shape alone", () => {
  it("calls a password-plus-email pair a login", () => {
    assert.equal(
      detectFormPurpose(
        { title: "", url: "", formAction: "", formId: "", formClass: "" },
        ["auth.password", "personal.email"],
      ),
      "login",
    );
  });

  it("calls two or more open questions a job application", () => {
    assert.equal(
      detectFormPurpose(
        { title: "", url: "", formAction: "", formId: "", formClass: "" },
        ["open.question", "open.question", "personal.email"],
      ),
      "job_application",
    );
  });
});
