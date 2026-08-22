/**
 * Working out what a form field is actually called.
 *
 * This is the tedious part of scanning and the part that decides whether
 * anything else works: a field whose label we cannot read is a field we cannot
 * match. Strategies run in descending order of how much the page is *telling*
 * us versus how much we are guessing.
 *
 * Adapted from the prior spike, with four changes:
 *
 *  - `aria-labelledby` is a space-separated *list* of ids. The spike read it as
 *    a single id, so it silently failed on the split-label pattern that ATS
 *    forms use ("Salary" + "expectation" in separate spans).
 *  - Added `<fieldset><legend>`, which is how radio and checkbox groups are
 *    labelled, and the spike returned nothing for those.
 *  - Added table-cell lookup, still common on Spanish government forms.
 *  - Preceding-text search walks up and across rather than requiring an
 *    immediate sibling of a specific tag, because a label wrapped in a div is
 *    the norm, not the exception.
 */

import { cssEscape } from "./dom-util.ts";
import type { LabelSource } from "./types.ts";

export interface ResolvedLabel {
  text: string;
  source: LabelSource;
}

const clean = (s: string | null | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").replace(/[\s*:]+$/, "").trim();

/** Text of an element with any nested form controls removed. */
function textWithoutControls(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const control of clone.querySelectorAll("input, select, textarea, button, script, style")) {
    control.remove();
  }
  return clean(clone.textContent);
}

export function resolveLabel(el: HTMLElement): ResolvedLabel {
  const doc = el.ownerDocument;

  // 1. An explicit association. The page is telling us outright.
  if (el.id) {
    const label = doc.querySelector<HTMLLabelElement>(`label[for="${cssEscape(el.id)}"]`);
    const text = label ? textWithoutControls(label) : "";
    if (text) return { text, source: "label[for]" };
  }

  // 2. A wrapping label. Also explicit.
  const parentLabel = el.closest("label");
  if (parentLabel) {
    const text = textWithoutControls(parentLabel);
    if (text) return { text, source: "wrapping-label" };
  }

  // 3. aria-labelledby: a LIST of ids, joined in order.
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = clean(
      labelledBy
        .split(/\s+/)
        .map((id) => (id ? doc.getElementById(id)?.textContent : ""))
        .filter(Boolean)
        .join(" "),
    );
    if (text) return { text, source: "aria-labelledby" };
  }

  // 4. aria-label on the control itself.
  const ariaLabel = clean(el.getAttribute("aria-label"));
  if (ariaLabel) return { text: ariaLabel, source: "aria-label" };

  // 5. A fieldset legend. How radio and checkbox groups get their question.
  const fieldset = el.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    const text = legend ? textWithoutControls(legend) : "";
    if (text) return { text, source: "fieldset-legend" };
  }

  // 6. Table layouts: the cell to the left, or the header above.
  const cell = el.closest("td, th");
  if (cell) {
    const prevCell = cell.previousElementSibling;
    const text = prevCell ? textWithoutControls(prevCell) : "";
    if (text) return { text, source: "table-cell" };
  }

  // 7. Nearest preceding text. Walk previous siblings, then up a level and
  //    across, a bounded number of times.
  const preceding = findPrecedingText(el);
  if (preceding) return { text: preceding, source: "preceding-text" };

  // 8. Last resort. Weaker than a label, but better than nothing, and the
  //    classifier already reads the placeholder separately.
  const placeholder = clean(el.getAttribute("placeholder"));
  if (placeholder) return { text: placeholder, source: "placeholder" };

  return { text: "", source: "none" };
}

/**
 * The question a radio or checkbox *group* is asking.
 *
 * Deliberately different from `resolveLabel`. An individual radio usually sits
 * inside its own `<label>` carrying the option text ("Presencial"), so the
 * ordinary resolver correctly returns that - which is the wrong answer when what
 * you want is the question the group asks. This skips the wrapping label and
 * looks for the legend first.
 */
export function resolveGroupLabel(el: HTMLElement): ResolvedLabel {
  const doc = el.ownerDocument;

  const fieldset = el.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    const text = legend ? textWithoutControls(legend) : "";
    if (text) return { text, source: "fieldset-legend" };
  }

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = clean(
      labelledBy
        .split(/\s+/)
        .map((id) => (id ? doc.getElementById(id)?.textContent : ""))
        .filter(Boolean)
        .join(" "),
    );
    if (text) return { text, source: "aria-labelledby" };
  }

  // A group is often wrapped in a div whose first child is the question.
  const group = el.closest("[role=\"radiogroup\"], [role=\"group\"], fieldset, .form-group, .field");
  if (group) {
    const preceding = findPrecedingText(group as HTMLElement);
    if (preceding) return { text: preceding, source: "preceding-text" };
  }

  const preceding = findPrecedingText(el);
  if (preceding) return { text: preceding, source: "preceding-text" };

  // Fall back to the ordinary resolver so a lone checkbox still gets a name.
  return resolveLabel(el);
}

/**
 * Search backwards through the document for the closest text that reads like a
 * label. Bounded so a pathological page cannot make this expensive.
 */
function findPrecedingText(el: HTMLElement, maxHops = 6): string {
  let node: Element | null = el;

  for (let hop = 0; hop < maxHops && node; hop++) {
    let sibling: Element | null = node.previousElementSibling;

    while (sibling) {
      // A control means we have walked into the previous field's territory.
      if (sibling.querySelector?.("input, select, textarea")) break;
      const text = textWithoutControls(sibling);
      if (text && text.length <= 120) return text;
      sibling = sibling.previousElementSibling;
    }

    node = node.parentElement;
    // Do not escape the form; page furniture above it is not a label.
    if (!node || node.tagName === "FORM" || node.tagName === "BODY") break;
  }

  return "";
}
