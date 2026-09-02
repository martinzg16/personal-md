import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { EVENTS, EVENT_NAMES, EventRejected, FUNNEL, assertValid, toRow } from "../src/index.ts";
import type { EventRecord } from "../src/index.ts";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations");

const base: EventRecord = {
  name: "landing_viewed",
  source: "landing",
  anonymousId: "11111111-1111-1111-1111-111111111111",
  occurredAt: "2026-09-01T10:00:00.000Z",
  props: {},
};

describe("the event allowlist", () => {
  it("accepts a property the event declares", () => {
    assert.doesNotThrow(() => assertValid({ ...base, props: { referrer_host: "example.com" } }));
  });

  it("refuses one it does not", () => {
    assert.throws(
      () => assertValid({ ...base, props: { email: "martin@example.com" } }),
      EventRejected,
    );
  });

  it("refuses a property borrowed from a different event", () => {
    assert.throws(() => assertValid({ ...base, props: { placement: "hero" } }), EventRejected);
  });

  it("builds the row PostgREST expects", () => {
    assert.deepEqual(toRow({ ...base, props: { referrer_host: "example.com" } }), {
      anonymous_id: "11111111-1111-1111-1111-111111111111",
      account_id: null,
      name: "landing_viewed",
      source: "landing",
      occurred_at: "2026-09-01T10:00:00.000Z",
      props: { referrer_host: "example.com" },
    });
  });
});

describe("the funnel", () => {
  it("has one event per step, in order and with no gaps", () => {
    const steps = FUNNEL.map((name) => EVENTS[name].step);
    assert.deepEqual(steps, Array.from({ length: steps.length }, (_, i) => i + 1));
  });
});

/*
 * The taxonomy exists twice - here and in the migration the database validates
 * against - because one of the two has to be the thing Postgres can enforce.
 * Two copies drift. This is what stops them.
 */
describe("the taxonomy matches the database", () => {
  const sql = readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(migrations, f), "utf8"))
    .join("\n");

  const seeded = new Map<string, { step: number; props: string[] }>();
  for (const [, name, step, props] of sql.matchAll(
    /\('([a-z_]+)',\s*(\d+),\s*'\{([^}]*)\}'\)/g,
  )) {
    seeded.set(name!, {
      step: Number(step),
      props: props!
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    });
  }

  it("seeds every event the code can send", () => {
    assert.deepEqual([...seeded.keys()].sort(), [...EVENT_NAMES].sort());
  });

  it("agrees on every step and every allowed property", () => {
    for (const name of EVENT_NAMES) {
      const row = seeded.get(name);
      assert.ok(row, `${name} is missing from the migration`);
      assert.equal(row.step, EVENTS[name].step, `${name} has a different step in SQL`);
      assert.deepEqual(
        row.props.sort(),
        [...EVENTS[name].props].sort(),
        `${name} allows different properties in SQL`,
      );
    }
  });
});
