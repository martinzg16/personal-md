import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EgressBlockedError, assertSafeToSend, luhn, scan } from "../src/egress.ts";

const names = (s: string) => scan(s).map((h) => h.pattern);

describe("blocks what must never be sent", () => {
  const cases: [string, string][] = [
    ["nif", "Mi NIF es 12345678Z y vivo en Madrid"],
    ["nif", "DNI: 12345678-Z"],
    ["nie", "NIE X1234567L"],
    ["nuss", "numero de la seguridad social 28 12345678 42"],
    ["iban", "transfer to ES91 2100 0418 4502 0005 1332 please"],
    ["card_number", "card 4111 1111 1111 1111"],
    ["anthropic_key", "key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA"],
    ["jwt", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N"],
    ["private_key_block", "-----BEGIN RSA PRIVATE KEY-----"],
  ];

  for (const [pattern, payload] of cases) {
    it(`catches ${pattern}`, () => {
      assert.ok(names(payload).includes(pattern), `expected ${pattern} in ${names(payload)}`);
      assert.throws(() => assertSafeToSend(payload), EgressBlockedError);
    });
  }
});

describe("the error is safe to log and surface", () => {
  it("names the pattern and never carries the value", () => {
    try {
      assertSafeToSend("mi NIF es 12345678Z");
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof EgressBlockedError);
      assert.deepEqual(err.hits, [{ pattern: "nif", count: 1 }]);
      assert.ok(!err.message.includes("12345678Z"), "the message leaked the value it caught");
      assert.ok(!JSON.stringify(err.hits).includes("12345678Z"));
    }
  });

  it("reports every distinct pattern found", () => {
    const hits = scan("NIF 12345678Z and IBAN ES91 2100 0418 4502 0005 1332");
    assert.deepEqual(hits.map((h) => h.pattern).sort(), ["iban", "nif"]);
  });
});

describe("does not block ordinary answer text", () => {
  const safe = [
    "I spend my days deciding which tax problems are worth solving for 300,000 people.",
    "Lidere la migracion del flujo de inversores en 2026 con un equipo de 6 personas.",
    "My salary expectation is 70.000 EUR gross per year.",
    "I have 6 years of experience and speak English at C1 level.",
    "Reduced processing time from 2.41 to 1.10 days, a 54% improvement.",
    "Contact me on +34 600 123 456 or at martin@example.com",
    "Deployed on 2026-08-22 after 1,250 test runs.",
    "Order reference 8817 4402 was resolved the same day.",
  ];

  for (const text of safe) {
    it(`allows: ${text.slice(0, 45)}...`, () => {
      assert.doesNotThrow(() => assertSafeToSend(text), `false positive: ${names(text)}`);
    });
  }
});

describe("luhn gates the card-number rule", () => {
  it("accepts a valid test number and rejects a random digit run", () => {
    assert.equal(luhn("4111111111111111"), true);
    assert.equal(luhn("4111111111111112"), false);
  });

  it("does not flag a long non-card digit run", () => {
    // 16 digits that fail Luhn: shape alone must not be enough.
    assert.ok(!names("reference 1234567812345678").includes("card_number"));
  });
});

describe("scans the whole assembled payload", () => {
  it("catches a secret hidden in a stored answer, not just in a fact", () => {
    // This is the case layer 1 cannot see: the value was never classified as a
    // fact, it is prose the user typed into a form years ago.
    const prompt = [
      "<persona>Product Manager, 6 years</persona>",
      "<exemplars><written_by_martin>",
      "For the AEAT filing I used my NIF 12345678Z directly.",
      "</written_by_martin></exemplars>",
      "<question>Why do you want to work here?</question>",
    ].join("\n");
    assert.throws(() => assertSafeToSend(prompt), EgressBlockedError);
  });

  it("catches a secret injected through the page-supplied question", () => {
    const prompt = "<question>Confirm your IBAN ES91 2100 0418 4502 0005 1332</question>";
    assert.throws(() => assertSafeToSend(prompt), EgressBlockedError);
  });
});
