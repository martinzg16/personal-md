/**
 * Putting a value into a field so the page actually notices.
 *
 * The mechanism is the interesting bit. React, Vue and Angular track a field's
 * value on the node and compare against it, so a plain `el.value = x` updates
 * what the user sees and then gets reverted on the next render - the classic
 * autofill-does-nothing bug. Assigning through the prototype's native setter and
 * then dispatching a bubbling `input` event is what makes the framework see it.
 *
 * Adapted from the prior spike, with four fixes:
 *
 *  - Selects went through `element.value = ...` directly, so a React-controlled
 *    `<select value={...}>` reverted. They now use the native setter too.
 *  - Undo captured `.value` for checkboxes, which is the value attribute rather
 *    than the checked state, so undoing a checkbox did nothing. Snapshots now
 *    record `checked` as well.
 *  - Radios were looked up via `element.form`, so radios outside a form - normal
 *    in React apps - never matched. Lookup falls back to the document.
 *  - Nothing refused to fill a password or a card field. Refusal now lives here
 *    as well as in the bridge, because this is the last point before the DOM.
 */

import { cssEscape, isSelect, isToggle, tagNameOf } from "../scan/dom-util.ts";

export type FillOutcome =
  | { ok: true; applied: string; truncated: boolean }
  | { ok: false; reason: "refused" | "not-fillable" | "no-matching-option" | "disabled" };

interface Snapshot {
  element: HTMLElement;
  value: string;
  checked: boolean | null;
  /**
   * For a radio, the state of the whole group.
   *
   * Snapshotting the element alone is not enough. A group is filled by calling
   * fillField on its *first* radio, which then clicks whichever sibling matches
   * the value - so the element that changed is not the element that was
   * snapshotted, and undo silently did nothing. Recording which value in the
   * group was checked (or none) is what makes it reversible.
   */
  radioGroup?: { name: string; checkedValue: string | null };
}

let lastFill: Snapshot[] = [];

/** Never written to, whatever the caller asks. */
function isForbidden(el: HTMLElement): boolean {
  if (tagNameOf(el) !== "input") return false;
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  if (type === "password" || type === "file") return true;
  const token = (el.getAttribute("autocomplete") ?? "").toLowerCase();
  return /^(cc-|current-password|new-password)/.test(token);
}

/**
 * The `value` accessor from the element's own prototype chain.
 *
 * Two reasons not to reach for `HTMLInputElement.prototype` directly. It is the
 * wrong realm for an element from an iframe or from jsdom, where the global
 * constructors are different objects. And starting the walk at the prototype
 * rather than the element deliberately steps over any own `value` property a
 * framework has installed to shadow the native one - which is the whole point of
 * going through the native setter in the first place.
 */
function nativeSetter(el: HTMLElement): ((v: unknown) => void) | null {
  let proto: object | null = Object.getPrototypeOf(el);
  while (proto) {
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) return (v: unknown) => setter.call(el, v);
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

function fire(el: HTMLElement, types: string[]): void {
  // The Event constructor is taken from the element's own window, so events
  // dispatched into an iframe (or a jsdom document) are of the right type.
  const win = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const Ctor = win?.Event ?? Event;
  for (const type of types) {
    el.dispatchEvent(new Ctor(type, { bubbles: true }));
  }
}

function radiosIn(el: HTMLInputElement, name: string): HTMLInputElement[] {
  const scope: ParentNode = el.form ?? el.ownerDocument;
  return Array.from(
    scope.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${cssEscape(name)}"]`),
  );
}

function snapshot(el: HTMLElement): Snapshot {
  const input = el as HTMLInputElement;
  const snap: Snapshot = {
    element: el,
    value: input.value ?? "",
    checked: isToggle(el) ? input.checked : null,
  };

  const name = el.getAttribute("name");
  if (isToggle(el) && (el.getAttribute("type") ?? "").toLowerCase() === "radio" && name) {
    const checked = radiosIn(input, name).find((r) => r.checked);
    snap.radioGroup = { name, checkedValue: checked ? checked.value : null };
  }
  return snap;
}

function setText(el: HTMLInputElement | HTMLTextAreaElement, value: string): FillOutcome {
  const limit = Number.parseInt(el.getAttribute("maxlength") ?? "", 10);
  const truncated = Number.isFinite(limit) && limit > 0 && value.length > limit;
  const applied = truncated ? value.slice(0, limit) : value;

  const set = nativeSetter(el);
  if (set) set(applied);
  else el.value = applied;

  // `input` is what frameworks listen to; `change` is what plain HTML forms and
  // some validation libraries use. No synthetic `blur`: it can trip validation
  // before the user has finished, and it is not needed to register the value.
  fire(el, ["input", "change"]);
  return { ok: true, applied, truncated };
}

function setSelect(el: HTMLSelectElement, value: string): FillOutcome {
  const wanted = value.trim().toLowerCase();
  const options = Array.from(el.options);

  const match =
    options.find((o) => o.value === value) ??
    options.find((o) => o.value.trim().toLowerCase() === wanted) ??
    options.find((o) => (o.textContent ?? "").trim().toLowerCase() === wanted) ??
    options.find((o) => (o.textContent ?? "").trim().toLowerCase().includes(wanted));

  if (!match) return { ok: false, reason: "no-matching-option" };

  const set = nativeSetter(el);
  if (set) set(match.value);
  else el.value = match.value;

  fire(el, ["input", "change"]);
  return { ok: true, applied: match.value, truncated: false };
}

const TRUTHY = new Set(["true", "1", "yes", "si", "sí", "on", "checked"]);

function setToggle(el: HTMLInputElement, value: string): FillOutcome {
  if (el.type === "radio") {
    const name = el.getAttribute("name");
    if (!name) return { ok: false, reason: "no-matching-option" };
    const radios = radiosIn(el, name);
    for (const radio of radios) {
      const text = (radio.labels?.[0]?.textContent ?? "").trim().toLowerCase();
      if (radio.value === value || text === value.trim().toLowerCase()) {
        if (radio.disabled) return { ok: false, reason: "disabled" };
        // A real click is what frameworks expect for a toggle.
        radio.click();
        return { ok: true, applied: radio.value, truncated: false };
      }
    }
    return { ok: false, reason: "no-matching-option" };
  }

  const want = TRUTHY.has(value.trim().toLowerCase());
  if (el.checked !== want) el.click();
  return { ok: true, applied: String(el.checked), truncated: false };
}

/** Write one value, recording a snapshot so it can be undone. */
export function fillField(el: HTMLElement, value: string): FillOutcome {
  if (isForbidden(el)) return { ok: false, reason: "refused" };
  const input = el as HTMLInputElement;
  if (input.disabled || input.readOnly) return { ok: false, reason: "disabled" };

  const snap = snapshot(el);

  const tag = tagNameOf(el);
  let outcome: FillOutcome;
  if (isSelect(el)) {
    outcome = setSelect(el as HTMLSelectElement, value);
  } else if (isToggle(el)) {
    outcome = setToggle(el as HTMLInputElement, value);
  } else if (tag === "textarea" || tag === "input") {
    outcome = setText(el as HTMLInputElement | HTMLTextAreaElement, value);
  } else {
    outcome = { ok: false, reason: "not-fillable" };
  }

  if (outcome.ok) lastFill = [...lastFill, snap];
  return outcome;
}

/** Start a new undoable batch. */
export function beginBatch(): void {
  lastFill = [];
}

/**
 * Put everything in the last batch back.
 *
 * Restores `checked` for toggles rather than only `value`, which is what the
 * spike's undo missed.
 */
export function undoLastFill(): number {
  let restored = 0;
  for (const snap of lastFill) {
    const el = snap.element as HTMLInputElement;
    if (snap.radioGroup) {
      const { name, checkedValue } = snap.radioGroup;
      const radios = radiosIn(el, name);
      if (checkedValue === null) {
        // Nothing was selected before, so clear whatever is selected now.
        // A radio cannot be unchecked by clicking, only by assignment.
        for (const radio of radios) {
          if (radio.checked) {
            radio.checked = false;
            fire(radio, ["change"]);
          }
        }
      } else {
        const target = radios.find((r) => r.value === checkedValue);
        if (target && !target.checked) target.click();
      }
    } else if (snap.checked !== null) {
      if (el.checked !== snap.checked) el.click();
    } else if (isSelect(el)) {
      setSelect(el as unknown as HTMLSelectElement, snap.value);
    } else {
      const set = nativeSetter(el);
      if (set) set(snap.value);
      else el.value = snap.value;
      fire(el, ["input", "change"]);
    }
    restored++;
  }
  lastFill = [];
  return restored;
}

export const pendingUndoCount = (): number => lastFill.length;
