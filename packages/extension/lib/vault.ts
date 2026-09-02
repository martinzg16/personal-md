/**
 * Carrying a profile to another machine without handing it over.
 *
 * What is synced is the extension's own mirror (`settings.getMirror`), not the
 * file. The mirror exists precisely so that recognising a field works with the
 * companion stopped, which makes it the one copy that is always current and
 * always available — the file itself is owned by a process that may not be
 * running when a sync is due.
 *
 * The sealing happens here, before anything is handed to the network layer, so
 * there is no window in which a plaintext profile exists inside a request. The
 * database has no column to put one in either; both halves have to be wrong for
 * a profile to leak, which is the point.
 */

import {
  type SealedVault,
  fromVaultRow,
  seal,
  toVaultRow,
  unseal,
} from "@personal-md/identity";

import type { SupabaseClient } from "@supabase/supabase-js";

import { accountClient, readPassphrase } from "./account.ts";
import { type ProfileMirror, settings } from "./settings.ts";

/** The label the user gives a profile. "personal", "freelance", whatever they like. */
export const DEFAULT_VAULT = "personal";

export type SyncResult =
  | { kind: "pushed"; at: string }
  | { kind: "pulled"; at: string }
  | { kind: "nothing_there" }
  | { kind: "nothing_local" }
  | { kind: "locked" }
  | { kind: "unconfigured" }
  | { kind: "signed_out" }
  | { kind: "wrong_passphrase" }
  | { kind: "offline" }
  | { kind: "error"; message: string };

interface VaultRow {
  id: string;
  name: string;
  ciphertext: string;
  iv: string;
  kdf_salt: string;
  kdf_iters: number;
  schema_version: number;
  updated_at: string;
}

function offline(error: unknown): boolean {
  const message = (error as { message?: string } | null)?.message ?? "";
  return /failed to fetch|load failed|network request failed/i.test(message);
}

/** Explicitly discriminated: `in` narrowing on two object literals is not enough here. */
type Ready =
  | { ok: true; client: SupabaseClient; owner: string; passphrase: string }
  | { ok: false; problem: SyncResult };

async function ready(): Promise<Ready> {
  const client = accountClient();
  if (!client) return { ok: false, problem: { kind: "unconfigured" } };
  const { data } = await client.auth.getUser();
  const owner = data.user?.id;
  if (!owner) return { ok: false, problem: { kind: "signed_out" } };
  const passphrase = await readPassphrase();
  if (!passphrase) return { ok: false, problem: { kind: "locked" } };
  return { ok: true, client, owner, passphrase };
}

/** Seal the current mirror and store it under `name`, replacing what was there. */
export async function pushVault(name = DEFAULT_VAULT): Promise<SyncResult> {
  const state = await ready();
  if (!state.ok) return state.problem;

  const mirror = await settings.getMirror();
  if (!mirror) return { kind: "nothing_local" };

  try {
    const sealed = await seal(mirror, state.passphrase);
    const row = toVaultRow(sealed, state.owner, name);
    const { error } = await state.client
      .from("vaults")
      .upsert(row, { onConflict: "owner,name" });
    if (error) return offline(error) ? { kind: "offline" } : { kind: "error", message: error.message };
    return { kind: "pushed", at: row.updated_at };
  } catch (error) {
    if (offline(error)) return { kind: "offline" };
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/** Open the stored vault and make it this machine's mirror. */
export async function pullVault(name = DEFAULT_VAULT): Promise<SyncResult> {
  const state = await ready();
  if (!state.ok) return state.problem;

  try {
    const { data, error } = await state.client
      .from("vaults")
      .select("id,name,ciphertext,iv,kdf_salt,kdf_iters,schema_version,updated_at")
      .eq("name", name)
      .maybeSingle<VaultRow>();
    if (error) return offline(error) ? { kind: "offline" } : { kind: "error", message: error.message };
    if (!data) return { kind: "nothing_there" };

    const sealed: SealedVault = fromVaultRow(data);
    let mirror: ProfileMirror;
    try {
      mirror = await unseal<ProfileMirror>(sealed, state.passphrase);
    } catch {
      // Never "decryption failed": from here it is one thing, a key that does
      // not fit, and the only useful instruction is to try the other passphrase.
      return { kind: "wrong_passphrase" };
    }
    await settings.setMirror(mirror);
    return { kind: "pulled", at: data.updated_at };
  } catch (error) {
    if (offline(error)) return { kind: "offline" };
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

export interface VaultSummary {
  name: string;
  updatedAt: string;
}

/** The names only. Listing profiles must never require the passphrase. */
export async function listVaults(): Promise<VaultSummary[]> {
  const client = accountClient();
  if (!client) return [];
  const { data, error } = await client
    .from("vaults")
    .select("name,updated_at")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  return (data as { name: string; updated_at: string }[]).map((row) => ({
    name: row.name,
    updatedAt: row.updated_at,
  }));
}
