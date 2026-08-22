/**
 * The background service worker: the only surface that holds the server token
 * and the only one that talks to the companion process.
 *
 * A content script shares a world with a potentially hostile page, so it never
 * sees the token and never issues a request of its own. It asks the worker.
 *
 * MV3 tears this worker down after a short idle period, so nothing here keeps
 * state in module scope beyond caches that can be rebuilt. The durable state is
 * the mirror in chrome.storage.local.
 */

import { server, type ConnectionState } from "../lib/server-client.ts";
import { settings, type ProfileMirror } from "../lib/settings.ts";
import type { Request, Response } from "../lib/protocol.ts";

/** Fetch from the server and refresh the mirror. Returns the fresh mirror. */
async function refreshMirror(): Promise<ProfileMirror> {
  const res = await server.getProfile();
  const mirror: ProfileMirror = {
    profile: res.profile,
    withheldKeys: res.withheldKeys,
    siteMemory: res.siteMemory,
    fetchedAt: new Date().toISOString(),
  };
  await settings.setMirror(mirror);
  return mirror;
}

/**
 * Refresh if we can, but never fail because the server is down: a stale mirror
 * is far more useful than none, since it still fills known fields.
 */
async function refreshQuietly(): Promise<void> {
  try {
    await refreshMirror();
  } catch {
    // Leave the existing mirror in place.
  }
}

async function handle(request: Request): Promise<unknown> {
  switch (request.kind) {
    case "refresh":
      return refreshMirror();

    case "getMirror": {
      const [mirror, connection] = await Promise.all([
        settings.getMirror(),
        server.connection() as Promise<ConnectionState>,
      ]);
      return { mirror, connection };
    }

    case "getConnection":
      return server.connection();

    case "saveFacts": {
      const result = await server.putFacts(request.facts);
      // Write-through, so the next field match sees the new value immediately.
      await refreshQuietly();
      return result;
    }

    case "saveAnswer": {
      const result = await server.putAnswer({
        canonicalKey: request.canonicalKey,
        question: request.question,
        text: request.text,
        language: request.language,
        genre: request.genre,
      });
      await refreshQuietly();
      return result;
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      const data = await handle(message as Request);
      sendResponse({ ok: true, data } satisfies Response);
    } catch (err) {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : "unknown error",
      } satisfies Response);
    }
  })();
  // Keep the message channel open for the async reply.
  return true;
});

// Warm the mirror on install and on browser start, so the first form the user
// opens does not have to wait on a network round trip.
chrome.runtime.onInstalled.addListener(() => void refreshQuietly());
chrome.runtime.onStartup.addListener(() => void refreshQuietly());

export default defineBackground(() => {
  void refreshQuietly();
});
