/**
 * Sealing a profile so the server cannot read it.
 *
 * The account exists to connect a profile to the extension across devices. That
 * is only compatible with "nothing personal leaks" if the thing that travels is
 * ciphertext and the key never does. So: a passphrase the user types, a key
 * derived from it on the device, AES-GCM, and a row that carries the parameters
 * needed to derive the same key again and nothing else.
 *
 * WebCrypto only, no dependency, because this has to run identically in the
 * landing, in an MV3 service worker, and under `node --test`.
 *
 * The cost, stated where it is implemented: there is no recovery. A forgotten
 * passphrase is a lost vault. Any escrow that could rescue it could also read
 * it, which is the property being bought here.
 */

/** OWASP's floor for PBKDF2-SHA256 at the time of writing, and the DB's CHECK. */
export const KDF_ITERATIONS = 600_000;
const SALT_BYTES = 16;
/** 96 bits is the size AES-GCM is specified for; anything else weakens it. */
const IV_BYTES = 12;

export const VAULT_SCHEMA_VERSION = 1;

export interface SealedVault {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  kdfSalt: Uint8Array;
  kdfIters: number;
  schemaVersion: number;
}

export class VaultUnreadable extends Error {
  constructor() {
    // Deliberately incurious: distinguishing "wrong passphrase" from "corrupt
    // ciphertext" tells an attacker which of the two they achieved.
    super("this vault could not be opened with that passphrase");
    this.name = "VaultUnreadable";
  }
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt anything JSON-serialisable. A fresh salt and IV every time. */
export async function seal(payload: unknown, passphrase: string): Promise<SealedVault> {
  const kdfSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, kdfSalt, KDF_ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
    kdfSalt,
    kdfIters: KDF_ITERATIONS,
    schemaVersion: VAULT_SCHEMA_VERSION,
  };
}

export async function unseal<T = unknown>(vault: SealedVault, passphrase: string): Promise<T> {
  if (vault.kdfIters < KDF_ITERATIONS) {
    // A vault claiming fewer rounds than the floor is either ancient or forged;
    // either way it is not opened at the current floor's expense.
    throw new VaultUnreadable();
  }
  const key = await deriveKey(passphrase, vault.kdfSalt, vault.kdfIters);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: vault.iv as BufferSource },
      key,
      vault.ciphertext as BufferSource,
    );
  } catch {
    throw new VaultUnreadable();
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/*
 * bytea over PostgREST.
 *
 * PostgREST takes and returns bytea as Postgres' hex format - a "\x" prefix and
 * two characters per byte - so the boundary needs these two, and nothing in the
 * rest of the code should be handling hex by hand.
 */

export function toBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

export function fromBytea(value: string): Uint8Array {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  if (hex.length % 2 !== 0) throw new Error("bytea payload has an odd number of hex digits");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("bytea payload is not hexadecimal");
    bytes[i] = byte;
  }
  return bytes;
}

/** The row a sealed vault becomes. Note there is no field for plaintext to hide in. */
export function toVaultRow(vault: SealedVault, owner: string, name: string) {
  return {
    owner,
    name,
    ciphertext: toBytea(vault.ciphertext),
    iv: toBytea(vault.iv),
    kdf_salt: toBytea(vault.kdfSalt),
    kdf_iters: vault.kdfIters,
    schema_version: vault.schemaVersion,
    updated_at: new Date().toISOString(),
  };
}

export function fromVaultRow(row: {
  ciphertext: string;
  iv: string;
  kdf_salt: string;
  kdf_iters: number;
  schema_version: number;
}): SealedVault {
  return {
    ciphertext: fromBytea(row.ciphertext),
    iv: fromBytea(row.iv),
    kdfSalt: fromBytea(row.kdf_salt),
    kdfIters: row.kdf_iters,
    schemaVersion: row.schema_version,
  };
}
