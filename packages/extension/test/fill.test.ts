/**
 * Filling fields so the page notices, and putting it back.
 *
 * The central claim being tested is the framework-safety one: assigning through
 * the prototype's native `value` setter and dispatching a bubbling `input` event
 * is what makes React and friends register the change. jsdom cannot run React,
 * but it can prove the mechanism those frameworks rely on - that a listener
 * fires and sees the new value - and it can prove the reverse, that a plain
 * assignment fires nothing at all.
 */

import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { beforeEach, describe, it } from "node:test";

import { beginBatch, fillField, numericValue, pendingUndoCount, undoLastFill } from "../lib/fill/apply.ts";

let dom: JSDOM;
let doc: Document;

const html = `
<form id="f">
  <input id="text" name="text" type="text" />
  <input id="capped" name="capped" type="text" maxlength="10" />
  <textarea id="area" name="area"></textarea>
  <select id="sel" name="sel">
    <option value="">-</option>
    <option value="bachelor">Licenciatura</option>
    <option value="master">Máster</option>
  </select>
  <input id="check" name="check" type="checkbox" />
  <label for="r1">Presencial</label><input id="r1" name="remote" type="radio" value="onsite" />
  <label for="r2">Híbrido</label><input id="r2" name="remote" type="radio" value="hybrid" />
  <input id="pw" name="pw" type="password" />
  <input id="cc" name="cc" type="text" autocomplete="cc-number" />
  <input id="file" name="file" type="file" />
  <input id="disabled" name="disabled" type="text" disabled />
  <input id="ro" name="ro" type="text" value="keep" readonly />
  <input id="salary" name="salary" type="number" />
</form>
<!-- Outside any form, as React apps often render radios -->
<input id="loose1" name="loose" type="radio" value="a" />
<input id="loose2" name="loose" type="radio" value="b" />
`;

beforeEach(() => {
  dom = new JSDOM(`<body>${html}</body>`);
  doc = dom.window.document;
  beginBatch();
});

const el = (id: string) => doc.getElementById(id) as HTMLElement;

describe("the framework-safety mechanism", () => {
  it("fires a bubbling input event carrying the new value", () => {
    // This is precisely what React's onChange is built on. If this stops
    // working, autofill appears to succeed and then silently reverts.
    const input = el("text") as HTMLInputElement;
    const seen: string[] = [];
    input.addEventListener("input", (e) => {
      seen.push((e.target as HTMLInputElement).value);
    });

    const outcome = fillField(input, "Martin Zulueta");
    assert.equal(outcome.ok, true);
    assert.deepEqual(seen, ["Martin Zulueta"], "no input event, or the wrong value");
    assert.equal(input.value, "Martin Zulueta");
  });

  it("a plain assignment fires nothing, which is the bug being avoided", () => {
    const input = el("text") as HTMLInputElement;
    let fired = 0;
    input.addEventListener("input", () => fired++);
    input.value = "set directly";
    assert.equal(fired, 0, "if this ever fires, the native-setter dance is unnecessary");
  });

  it("goes through the prototype accessor even when an own value property shadows it", () => {
    // A framework that installs its own `value` property on the node is exactly
    // the case starting the prototype walk above the element defends against.
    const input = el("text") as HTMLInputElement;
    let shadowWrites = 0;
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => "shadowed",
      set: () => {
        shadowWrites++;
      },
    });

    fillField(input, "real value");
    assert.equal(shadowWrites, 0, "the shadow setter swallowed the write");
  });

  it("fires input and change on a select, not just change", () => {
    const select = el("sel") as HTMLSelectElement;
    const events: string[] = [];
    for (const type of ["input", "change"]) {
      select.addEventListener(type, () => events.push(type));
    }
    fillField(select, "Licenciatura");
    assert.deepEqual(events, ["input", "change"]);
    assert.equal(select.value, "bachelor");
  });
});

describe("text fields", () => {
  it("fills a textarea", () => {
    const outcome = fillField(el("area"), "two\nlines");
    assert.equal(outcome.ok, true);
    assert.equal((el("area") as HTMLTextAreaElement).value, "two\nlines");
  });

  it("truncates to maxlength and says so", () => {
    const outcome = fillField(el("capped"), "0123456789ABCDEF");
    assert.ok(outcome.ok);
    assert.equal(outcome.applied, "0123456789");
    assert.equal(outcome.truncated, true);
  });
});

describe("selects", () => {
  it("matches on option value", () => {
    fillField(el("sel"), "master");
    assert.equal((el("sel") as HTMLSelectElement).value, "master");
  });

  it("matches on visible option text, case-insensitively", () => {
    fillField(el("sel"), "licenciatura");
    assert.equal((el("sel") as HTMLSelectElement).value, "bachelor");
  });

  it("reports no match rather than picking something wrong", () => {
    const outcome = fillField(el("sel"), "Doctorado");
    assert.deepEqual(outcome, { ok: false, reason: "no-matching-option" });
    assert.equal((el("sel") as HTMLSelectElement).value, "");
  });
});

describe("toggles", () => {
  it("checks a checkbox", () => {
    fillField(el("check"), "yes");
    assert.equal((el("check") as HTMLInputElement).checked, true);
  });

  it("accepts Spanish truthy values", () => {
    fillField(el("check"), "sí");
    assert.equal((el("check") as HTMLInputElement).checked, true);
  });

  it("leaves an already-correct checkbox alone", () => {
    const box = el("check") as HTMLInputElement;
    box.checked = true;
    let clicks = 0;
    box.addEventListener("click", () => clicks++);
    fillField(box, "true");
    assert.equal(clicks, 0, "should not toggle a box that is already right");
  });

  it("selects a radio by value", () => {
    fillField(el("r1"), "hybrid");
    assert.equal((el("r2") as HTMLInputElement).checked, true);
  });

  it("selects a radio by its label text", () => {
    fillField(el("r1"), "Presencial");
    assert.equal((el("r1") as HTMLInputElement).checked, true);
  });

  it("finds radios outside a form", () => {
    // The spike looked these up via element.form, so radios rendered outside a
    // form - normal in React apps - never matched.
    const outcome = fillField(el("loose1"), "b");
    assert.equal(outcome.ok, true);
    assert.equal((el("loose2") as HTMLInputElement).checked, true);
  });
});

describe("fields it refuses to touch", () => {
  for (const [id, label] of [
    ["pw", "a password"],
    ["cc", "an autocomplete=cc-* field"],
    ["file", "a file input"],
  ] as const) {
    it(`refuses ${label}`, () => {
      const outcome = fillField(el(id), "should-not-be-written");
      assert.deepEqual(outcome, { ok: false, reason: "refused" });
      assert.notEqual((el(id) as HTMLInputElement).value, "should-not-be-written");
    });
  }

  it("refuses disabled and read-only fields", () => {
    assert.deepEqual(fillField(el("disabled"), "x"), { ok: false, reason: "disabled" });
    assert.deepEqual(fillField(el("ro"), "x"), { ok: false, reason: "disabled" });
    assert.equal((el("ro") as HTMLInputElement).value, "keep");
  });

  it("does not record a refused fill as undoable", () => {
    fillField(el("pw"), "x");
    assert.equal(pendingUndoCount(), 0);
  });
});

describe("undo", () => {
  it("restores text, including back to empty", () => {
    const input = el("text") as HTMLInputElement;
    input.value = "original";
    fillField(input, "replaced");
    assert.equal(input.value, "replaced");
    assert.equal(undoLastFill(), 1);
    assert.equal(input.value, "original");
  });

  it("restores a checkbox's checked state", () => {
    // The spike snapshotted `.value`, which for a checkbox is the value
    // attribute rather than the checked state, so undo did nothing at all.
    const box = el("check") as HTMLInputElement;
    assert.equal(box.checked, false);
    fillField(box, "true");
    assert.equal(box.checked, true);
    undoLastFill();
    assert.equal(box.checked, false, "undo left the box checked");
  });

  it("restores a radio group to nothing selected", () => {
    // Found in a real browser. A group is filled by calling fillField on its
    // FIRST radio, which clicks a different sibling - so snapshotting only the
    // element passed in meant undo checked the wrong node and did nothing.
    const first = el("r1") as HTMLInputElement;
    assert.equal(doc.querySelector('input[name="remote"]:checked'), null);
    fillField(first, "hybrid");
    assert.equal((el("r2") as HTMLInputElement).checked, true);

    undoLastFill();
    assert.equal(
      doc.querySelector('input[name="remote"]:checked'),
      null,
      "undo left the radio group selected",
    );
  });

  it("restores a radio group to whichever option was selected before", () => {
    const first = el("r1") as HTMLInputElement;
    (el("r1") as HTMLInputElement).checked = true;
    fillField(first, "hybrid");
    assert.equal((el("r2") as HTMLInputElement).checked, true);
    undoLastFill();
    assert.equal((el("r1") as HTMLInputElement).checked, true, "should go back to onsite");
    assert.equal((el("r2") as HTMLInputElement).checked, false);
  });

  it("restores a select", () => {
    const select = el("sel") as HTMLSelectElement;
    select.value = "master";
    fillField(select, "Licenciatura");
    assert.equal(select.value, "bachelor");
    undoLastFill();
    assert.equal(select.value, "master");
  });

  it("undoes a whole batch and then has nothing left to undo", () => {
    fillField(el("text"), "a");
    fillField(el("area"), "b");
    fillField(el("check"), "yes");
    assert.equal(pendingUndoCount(), 3);
    assert.equal(undoLastFill(), 3);
    assert.equal(pendingUndoCount(), 0);
    assert.equal(undoLastFill(), 0);
  });

  it("beginBatch discards the previous batch", () => {
    fillField(el("text"), "a");
    beginBatch();
    assert.equal(pendingUndoCount(), 0);
  });
});

describe("filling a whole batch at once", () => {
  const dom = () =>
    new JSDOM(`<html><body><form>
      <input id="a" value="">
      <input id="b" value="">
      <input id="c" value="keep me">
      <input id="p" type="password" value="">
    </form></body></html>`).window.document;

  it("reverses every field in the batch with one undo", () => {
    // The asymmetry this prevents: filling eight fields in one click and then
    // needing eight clicks to put them back.
    const doc = dom();
    const a = doc.getElementById("a") as HTMLInputElement;
    const b = doc.getElementById("b") as HTMLInputElement;

    beginBatch();
    assert.equal(fillField(a, "Martin").ok, true);
    assert.equal(fillField(b, "Madrid").ok, true);
    assert.equal(a.value, "Martin");
    assert.equal(b.value, "Madrid");

    const restored = undoLastFill();
    assert.equal(restored, 2, "both fields should be restored by one undo");
    assert.equal(a.value, "");
    assert.equal(b.value, "");
  });

  it("still refuses a password inside a batch", () => {
    // The bulk path must not become a way around the last line of defence.
    const doc = dom();
    beginBatch();
    const outcome = fillField(doc.getElementById("p") as HTMLElement, "hunter2");
    assert.deepEqual(outcome, { ok: false, reason: "refused" });
    assert.equal((doc.getElementById("p") as HTMLInputElement).value, "");
  });

  it("undo restores a field's previous value rather than blanking it", () => {
    // The panel excludes non-empty fields from a bulk fill, but fillField itself
    // must still be reversible if one is ever passed in.
    const doc = dom();
    const c = doc.getElementById("c") as HTMLInputElement;
    beginBatch();
    fillField(c, "overwritten");
    assert.equal(c.value, "overwritten");
    undoLastFill();
    assert.equal(c.value, "keep me");
  });
});

describe("a field that will not take the stored value", () => {
  /*
   * From the wild: a stored salary of "70000 EUR" written into Wellfound's
   * <input type="number">. The browser discards the whole string, the field
   * stays empty, and the panel used to report "Filled" over a blank box -
   * while Chrome logged "The specified value ... cannot be parsed" against the
   * extension.
   */
  it("reads the figure out of a written amount", () => {
    const input = el("salary") as HTMLInputElement;
    const outcome = fillField(input, "70000 EUR");
    assert.equal(outcome.ok, true);
    assert.equal(input.value, "70000");
  });

  it("understands both thousand-separator conventions", () => {
    assert.equal(numericValue("70.000 EUR"), "70000");
    assert.equal(numericValue("70,000"), "70000");
    assert.equal(numericValue("1.234,56 €"), "1234.56");
    assert.equal(numericValue("1,234.56"), "1234.56");
    assert.equal(numericValue("45.5"), "45.5");
  });

  it("refuses to guess a magnitude rather than be wrong by a thousand", () => {
    assert.equal(numericValue("45k"), null);
    assert.equal(numericValue("negotiable"), null);
  });

  it("reports a refusal instead of claiming a blank field was filled", () => {
    const input = el("salary") as HTMLInputElement;
    const outcome = fillField(input, "negotiable");
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.equal(outcome.reason, "value-not-accepted");
    assert.equal(input.value, "");
    // Nothing was written, so there is nothing to undo.
    assert.equal(pendingUndoCount(), 0);
  });
});
