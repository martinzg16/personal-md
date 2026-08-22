/**
 * Bundled and injected into a real browser page to verify the scanner and the
 * filler against a real layout engine.
 *
 * jsdom cannot do two of the things that matter most here: it has no layout, so
 * visibility is unknowable, and it cannot run a framework that tracks input
 * values. This harness runs the same modules in a real browser, where both are
 * real. It attaches to window and is driven from the outside.
 */

import { fillField, undoLastFill, beginBatch } from "../lib/fill/apply.ts";
import { matchFields } from "../lib/match/deterministic.ts";
import { buildScanResult, findByStamp, scanFields, isActionable } from "../lib/scan/scanner.ts";
import { deriveAliases, type Profile } from "@personal-md/core";

const profile: Profile = {
  version: 1,
  facts: [
    { key: "personal.full_name", label: "Full name", value: "Martin Zulueta Perez", egress: "sendable", updatedAt: "" },
    { key: "personal.email", label: "Email", value: "martin@example.com", egress: "never", updatedAt: "" },
    { key: "personal.phone", label: "Phone", value: "+34600123456", egress: "never", updatedAt: "" },
    { key: "personal.nif", label: "NIF", value: "12345678Z", egress: "never", updatedAt: "" },
    { key: "personal.city", label: "City", value: "Madrid", egress: "sendable", updatedAt: "" },
    { key: "work.years_experience", label: "Years", value: "6", egress: "sendable", updatedAt: "" },
    { key: "logistics.salary_expectation", label: "Salary", value: "70.000 EUR", egress: "sendable", updatedAt: "" },
    { key: "logistics.remote_preference", label: "Remote", value: "hybrid", egress: "sendable", updatedAt: "" },
    { key: "education.highest_level", label: "Level", value: "Licenciatura", egress: "sendable", updatedAt: "" },
  ],
  answers: [
    {
      id: "a1",
      canonicalKey: "motivation.why_this_role",
      askedAs: ["¿Por qué te interesa esta posición?"],
      text: "Porque llevo seis años decidiendo qué problemas fiscales merece la pena resolver.",
      language: "es",
      genre: "job_application",
      writtenAt: "2026-08-22",
      useCount: 2,
    },
  ],
  index: { aliases: {}, siteMemory: {} },
};
profile.index.aliases = deriveAliases(profile.answers);

declare global {
  interface Window {
    __pmd: unknown;
  }
}

window.__pmd = {
  /** Scan and summarise, including what a real layout engine says is visible. */
  scan() {
    const fields = scanFields(document);
    return {
      result: buildScanResult(fields, document),
      visibleCount: fields.filter((f) => f.visible).length,
      actionableCount: fields.filter(isActionable).length,
      fields: fields.map((f) => ({
        id: f.id,
        name: f.name,
        label: f.label,
        labelSource: f.labelSource,
        category: f.category,
        visible: f.visible,
        disabled: f.disabled,
        readOnly: f.readOnly,
        options: f.options?.map((o) => o.value),
      })),
    };
  },

  match() {
    const fields = scanFields(document);
    const m = matchFields(fields, profile, { domain: location.hostname });
    return {
      fills: m.fills.map((f) => ({
        fieldId: f.fieldId,
        label: f.label,
        value: f.value,
        localOnly: f.localOnly,
        derivedFrom: f.derivedFrom,
      })),
      answers: m.answers.map((a) => ({ fieldId: a.fieldId, key: a.canonicalKey, via: a.via })),
      needsDrafting: m.needsDrafting.map((n) => n.question),
      skipped: m.skipped.length,
    };
  },

  /** Apply every deterministic fill, reporting what the DOM ended up holding. */
  fillAll() {
    beginBatch();
    const fields = scanFields(document);
    const m = matchFields(fields, profile, { domain: location.hostname });
    const applied: { fieldId: string; ok: boolean; domValue: string }[] = [];

    for (const fill of m.fills) {
      const el = findByStamp(fill.fieldId);
      if (!el) continue;
      const outcome = fillField(el, fill.value);
      applied.push({
        fieldId: fill.fieldId,
        ok: outcome.ok,
        domValue: (el as HTMLInputElement).value ?? "",
      });
    }
    return applied;
  },

  undo() {
    return undoLastFill();
  },

  /** Read a value straight out of the DOM, for external assertions. */
  valueOf(name: string) {
    const el = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (!el) return null;
    return el.type === "checkbox" || el.type === "radio" ? String(el.checked) : el.value;
  },

  /** Which radio in a group is selected. */
  checkedRadio(name: string) {
    const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
    return el ? el.value : null;
  },
};
