/**
 * Walking the page and describing every field on it.
 *
 * Adapted from the prior spike, with three fixes:
 *
 *  - Stable ids. The spike incremented a module-global counter on every scan, so
 *    re-scanning a page gave the same element a new id and re-stamped the DOM.
 *    Any suggestion held by the widget silently pointed at nothing. Ids are now
 *    read back from the existing stamp when there is one.
 *
 *  - Radio and checkbox groups. The spike emitted one field per radio button, so
 *    a single question with five options looked like five questions. Options
 *    sharing a name now collapse into one logical field carrying its options.
 *
 *  - Visibility is reported, not filtered. The spike dropped invisible fields
 *    inside the scan, which made the whole thing untestable outside a browser
 *    (jsdom has no layout, so everything reads as invisible). The content script
 *    filters on the flag instead.
 */

import { classifyField, detectFormPurpose } from "./classify.ts";
import { cssEscape } from "./dom-util.ts";
import { resolveGroupLabel, resolveLabel } from "./labels.ts";
import { stripElement, type ScanResult, type ScannedField, type SelectOption } from "./types.ts";

export const STAMP = "data-pmd-field";

const NON_FIELD_INPUT_TYPES = new Set(["hidden", "submit", "reset", "button", "image"]);

let counter = 0;

/** Reuse the stamp if the element already has one, so ids survive a re-scan. */
function idFor(el: HTMLElement): string {
  const existing = el.getAttribute(STAMP);
  if (existing) return existing;
  const id = `pmd-${++counter}`;
  el.setAttribute(STAMP, id);
  return id;
}

function isFieldElement(
  el: Element,
): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const tag = el.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  return !NON_FIELD_INPUT_TYPES.has((el as HTMLInputElement).type.toLowerCase());
}

/**
 * Best-effort visibility.
 *
 * Deliberately tolerant: a false "visible" costs a suggestion the user ignores,
 * while a false "invisible" hides a field they wanted filled. Under jsdom there
 * is no layout at all, so this returns false for everything - which is why it is
 * reported rather than filtered on.
 */
export function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute("hidden")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;

  const win = el.ownerDocument.defaultView;
  if (win) {
    const style = win.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number.parseFloat(style.opacity || "1") === 0) return false;
  }

  const rects = typeof el.getClientRects === "function" ? el.getClientRects() : null;
  if (rects && rects.length > 0) return true;

  // Fall back to offsetParent for elements laid out but not measurable here.
  return el.offsetParent !== null;
}

const optionsOf = (select: HTMLSelectElement): SelectOption[] =>
  Array.from(select.options).map((o) => ({ value: o.value, text: (o.textContent ?? "").trim() }));

function maxLengthOf(el: HTMLInputElement | HTMLTextAreaElement): number | null {
  const raw = el.getAttribute("maxlength");
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function scanFields(root: ParentNode = document): ScannedField[] {
  const fields: ScannedField[] = [];
  /** name -> index in `fields`, for collapsing radio and checkbox groups. */
  const groups = new Map<string, number>();

  for (const el of root.querySelectorAll<HTMLElement>("input, textarea, select")) {
    if (!isFieldElement(el)) continue;

    const tag = el.tagName.toLowerCase() as ScannedField["tag"];
    const input = el as HTMLInputElement;
    const inputType = tag === "input" ? input.type.toLowerCase() : tag;
    const name = el.getAttribute("name") ?? "";
    const isOption = inputType === "radio" || inputType === "checkbox";

    // One logical question per radio/checkbox name: fold this element's value
    // into the existing entry as an option rather than emitting a new field.
    if (isOption && name && groups.has(name)) {
      const field = fields[groups.get(name) as number];
      if (field) {
        const { text } = resolveLabel(el);
        field.options = [
          ...(field.options ?? []),
          { value: input.value, text: text || input.value },
        ];
        if (input.checked) field.value = input.value;
      }
      continue;
    }

    // Which resolver depends on whether this toggle is one of several.
    //
    // For a radio in a group the wrapping label is the *option* text
    // ("Presencial"), so the group's question has to come from the legend. For a
    // lone checkbox the wrapping label IS the question ("Acepto la politica de
    // privacidad"), and skipping it made the resolver walk backwards out of the
    // label and pick up the previous field's label instead.
    const groupSize =
      isOption && name
        ? root.querySelectorAll(`input[name="${cssEscape(name)}"]`).length
        : 1;
    const { text: label, source: labelSource } =
      isOption && groupSize > 1 ? resolveGroupLabel(el) : resolveLabel(el);
    const placeholder = el.getAttribute("placeholder") ?? "";
    const ariaLabel = el.getAttribute("aria-label") ?? "";
    const autocomplete = (el.getAttribute("autocomplete") ?? "").toLowerCase();
    const maxLength =
      tag === "input" || tag === "textarea"
        ? maxLengthOf(el as HTMLInputElement | HTMLTextAreaElement)
        : null;

    const { category, confidence } = classifyField({
      name,
      htmlId: el.id ?? "",
      label,
      placeholder,
      ariaLabel,
      inputType,
      autocomplete,
      tag,
      maxLength,
    });

    const field: ScannedField = {
      id: idFor(el),
      element: el,
      tag,
      inputType,
      name,
      htmlId: el.id ?? "",
      label,
      labelSource,
      placeholder,
      autocomplete,
      ariaLabel,
      value: isOption ? (input.checked ? input.value : "") : (input.value ?? ""),
      required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
      disabled: (el as HTMLInputElement).disabled === true,
      readOnly: (el as HTMLInputElement).readOnly === true,
      maxLength,
      visible: isVisible(el),
      category,
      confidence,
      group: isOption && name ? name : null,
    };

    if (tag === "select") field.options = optionsOf(el as HTMLSelectElement);
    if (isOption) {
      const { text } = resolveLabel(el);
      field.options = [{ value: input.value, text: text || input.value }];
    }

    if (isOption && name) groups.set(name, fields.length);
    fields.push(field);
  }

  return fields;
}

/** A field worth offering to the user: on screen, and editable. */
export const isActionable = (f: ScannedField): boolean =>
  f.visible && !f.disabled && !f.readOnly;

export function buildScanResult(fields: ScannedField[], doc: Document = document): ScanResult {
  const form = fields[0]?.element.closest("form") ?? null;
  const win = doc.defaultView;

  return {
    url: win?.location.href ?? "",
    domain: win?.location.hostname ?? "",
    title: doc.title,
    purpose: detectFormPurpose(
      {
        title: doc.title,
        url: win?.location.href ?? "",
        formAction: form?.getAttribute("action") ?? "",
        formId: form?.id ?? "",
        formClass: form?.className ?? "",
      },
      fields.map((f) => f.category),
    ),
    fields: fields.map(stripElement),
  };
}

export function findByStamp(id: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${STAMP}="${cssEscape(id)}"]`);
}

/** Test seam: reset the id counter so ids are predictable per test. */
export function resetIdCounter(): void {
  counter = 0;
}
