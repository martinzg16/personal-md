import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KDF_ITERATIONS,
  VaultUnreadable,
  fromBytea,
  fromVaultRow,
  seal,
  toBytea,
  toVaultRow,
  unseal,
} from "../src/index.ts";

/** A profile with values that would be unmistakable if any of them escaped. */
const profile = {
  facts: {
    full_name: "Martín Zulueta",
    nif: "12345678Z",
    email: "martin@example.com",
  },
  answers: [
    { question: "Why do you want to work here?", text: "Because the product is honest about what it does." },
  ],
};

const PASSPHRASE = "a passphrase with spaces and acentuación";

describe("sealing a vault", () => {
  it("comes back exactly as it went in", async () => {
    const sealed = await seal(profile, PASSPHRASE);
    assert.deepEqual(await unseal(sealed, PASSPHRASE), profile);
  });

  it("refuses the wrong passphrase, and says nothing about why", async () => {
    const sealed = await seal(profile, PASSPHRASE);
    await assert.rejects(() => unseal(sealed, "not the passphrase"), VaultUnreadable);
  });

  it("uses a fresh salt and IV every time, so the same profile never looks the same twice", async () => {
    const a = await seal(profile, PASSPHRASE);
    const b = await seal(profile, PASSPHRASE);
    assert.notEqual(toBytea(a.ciphertext), toBytea(b.ciphertext));
    assert.notEqual(toBytea(a.iv), toBytea(b.iv));
    assert.notEqual(toBytea(a.kdfSalt), toBytea(b.kdfSalt));
  });

  it("derives at or above the floor the database enforces", async () => {
    const sealed = await seal(profile, PASSPHRASE);
    assert.ok(sealed.kdfIters >= 600_000);
    assert.equal(sealed.kdfIters, KDF_ITERATIONS);
  });

  it("will not open a vault that claims a weaker derivation", async () => {
    const sealed = await seal(profile, PASSPHRASE);
    await assert.rejects(
      () => unseal({ ...sealed, kdfIters: 1000 }, PASSPHRASE),
      VaultUnreadable,
    );
  });

  /*
   * The test this whole design exists for. If it ever fails, something is being
   * uploaded in the clear.
   */
  it("puts nothing readable in the row that goes over the wire", async () => {
    const sealed = await seal(profile, PASSPHRASE);
    const row = toVaultRow(sealed, "11111111-1111-1111-1111-111111111111", "personal");
    const wire = JSON.stringify(row);

    const secrets = [
      "Martín Zulueta",
      "12345678Z",
      "martin@example.com",
      "Because the product is honest",
      "full_name",
      "question",
      PASSPHRASE,
    ];
    for (const secret of secrets) {
      assert.ok(!wire.includes(secret), `"${secret}" is present in the payload`);
      // ...and not hidden in the hex either.
      const asHex = Buffer.from(secret, "utf8").toString("hex");
      assert.ok(!wire.includes(asHex), `"${secret}" is present in the payload as hex`);
    }

    // The label the user chose is the one thing that does travel in the clear.
    assert.ok(wire.includes("personal"));
  });

  it("survives the trip through bytea and back", async () => {
    const sealed = await seal(profile, PASSPHRASE);
    const row = toVaultRow(sealed, "11111111-1111-1111-1111-111111111111", "personal");
    const returned = fromVaultRow({
      ciphertext: row.ciphertext,
      iv: row.iv,
      kdf_salt: row.kdf_salt,
      kdf_iters: row.kdf_iters,
      schema_version: row.schema_version,
    });
    assert.deepEqual(await unseal(returned, PASSPHRASE), profile);
  });
});

describe("bytea encoding", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 127, 128, 255]);
    assert.equal(toBytea(bytes), "\\x00010f107f80ff");
    assert.deepEqual(fromBytea(toBytea(bytes)), bytes);
  });

  it("rejects a malformed payload rather than guessing", () => {
    assert.throws(() => fromBytea("\\x0"));
    assert.throws(() => fromBytea("\\xzz"));
  });
});
