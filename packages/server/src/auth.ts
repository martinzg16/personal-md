/**
 * The server holds the whole profile and can spend Claude quota, so it is not
 * enough to bind to loopback: any process or page on the machine can reach
 * 127.0.0.1. Every request must present a shared token, generated once on first
 * run and pasted into the extension options.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";

import { paths } from "./paths.ts";

export async function loadOrCreateToken(): Promise<string> {
  try {
    const existing = (await readFile(paths.token, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch {
    // fall through and mint a new one
  }
  const token = randomBytes(32).toString("base64url");
  await writeFile(paths.token, `${token}\n`, { mode: 0o600 });
  await chmod(paths.token, 0o600);
  return token;
}

/** Constant-time comparison, so a wrong token leaks nothing by timing. */
export function tokenMatches(expected: string, presented: string | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function bearerFrom(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim();
}
