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

import { normaliseQuestion } from "@personal-md/core";

import { trackOnce } from "../lib/events.ts";
import { server, ServerError, type ConnectionState } from "../lib/server-client.ts";
import { settings, type ProfileMirror } from "../lib/settings.ts";
import type { FailureReason, Request, Response } from "../lib/protocol.ts";

/** Fetch from the server and refresh the mirror. Returns the fresh mirror. */
async function refreshMirror(): Promise<ProfileMirror> {
  const res = await server.getProfile();
  const mirror: ProfileMirror = {
    profile: res.profile,
    withheldKeys: res.withheldKeys,
    siteMemory: res.siteMemory,
    ledger: res.ledger,
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

/**
 * In-flight classifications, keyed by normalised question.
 *
 * A page with the same question in two places - or a widget that re-renders
 * mid-request - would otherwise fire stage C twice and pay twice for an
 * identical answer. Collapsing them onto one promise is the cheapest possible
 * guard. Deliberately not a persistent cache: once the server writes the alias
 * back, the *local* lookup handles every later encounter for free, so there is
 * nothing left for a cache here to earn.
 */
const inFlight = new Map<string, Promise<unknown>>();

async function classifyOnce(
  request: Extract<Request, { kind: "matchQuestion" }>,
): Promise<unknown> {
  const key = `${request.domain}\t${normaliseQuestion(request.question)}`;
  const running = inFlight.get(key);
  if (running) return running;

  const promise = server
    .matchQuestion({
      question: request.question,
      genre: request.genre,
      language: request.language,
      maxLength: request.maxLength,
      domain: request.domain,
      signature: request.signature,
    })
    .then(async (result) => {
      // A classification usually changes the profile (a new alias, sometimes a
      // placeholder row), so the mirror is now stale.
      if (result.via === "model") await refreshQuietly();
      return result;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

async function handle(request: Request): Promise<unknown> {
  switch (request.kind) {
    case "filled": {
      void trackOnce("first_fill", { field_count: request.count });
      return null;
    }

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

    case "matchQuestion":
      return classifyOnce(request);

    case "draftAnswer": {
      const draft = await server.draftAnswer({
        question: request.question,
        canonicalKey: request.canonicalKey,
        language: request.language,
        genre: request.genre,
        maxWords: request.maxWords,
        maxChars: request.maxChars,
        registerHint: request.registerHint,
        ...(request.instruction ? { instruction: request.instruction } : {}),
      });
      // Drafting does not change the profile - nothing is saved until the user
      // accepts - so the mirror is deliberately left alone here.
      return draft;
    }

    case "importProfile":
      // A proposal only. The mirror is untouched because nothing was written.
      return server.importProfile(request.profile);

    case "learnBatch": {
      const result = await server.learn({ facts: request.facts, answers: request.answers });
      // Write-through: the panel that just saved these should stop offering them.
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

/**
 * The extension icon as a session light.
 *
 * A lapsed CLI session used to be invisible until a draft died on it. The badge
 * is the cheapest surface that reaches someone who is not looking: it needs no
 * panel open and no form in front of them. Deliberately quiet - one mark, no
 * notification - because nothing is broken except drafting.
 */
async function paintSessionBadge(signedIn: "in" | "out" | "unknown"): Promise<void> {
  const out = signedIn === "out";
  try {
    await chrome.action.setBadgeText({ text: out ? "!" : "" });
    if (out) await chrome.action.setBadgeBackgroundColor({ color: "#9a3412" });
    await chrome.action.setTitle({
      title: out
        ? "Brío · la sesión de Claude ha caducado; ejecuta claude auth login\nBrío · the Claude session has lapsed; run claude auth login"
        : "Brío",
    });
  } catch {
    // An icon that cannot be painted is not a reason to fail anything.
  }
}

/** Look, and show what was found. Safe to call from anywhere. */
async function checkSession(): Promise<void> {
  const report = await server.healthReport();
  // A server that is down says nothing about the session: clearing the badge
  // would be a lie, keeping it would be too, so only a definite answer paints.
  if (report.up) await paintSessionBadge(report.claude);
}

/**
 * The watch interval.
 *
 * Five minutes is the trade: the worker is woken rarely, and the worst case is
 * knowing five minutes late rather than at the next draft. An alarm rather than
 * a timer because MV3 tears this worker down whenever it is idle.
 */
const SESSION_ALARM = "claude-session";

function watchSession(): void {
  void chrome.alarms.create(SESSION_ALARM, { periodInMinutes: 5 });
  void checkSession();
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SESSION_ALARM) void checkSession();
});

/** The reason, if this failure is one a surface can act on rather than just report. */
function reasonFor(err: unknown): FailureReason | undefined {
  if (err instanceof ServerError && err.state.kind === "claude_signed_out") {
    // Paint immediately: waiting for the next alarm would leave the icon
    // claiming everything is fine while a draft has just been refused.
    void paintSessionBadge("out");
    return "claude_signed_out";
  }
  return undefined;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    try {
      const data = await handle(message as Request);
      sendResponse({ ok: true, data } satisfies Response);
    } catch (err) {
      const reason = reasonFor(err);
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : "unknown error",
        ...(reason ? { reason } : {}),
      } satisfies Response);
    }
  })();
  // Keep the message channel open for the async reply.
  return true;
});

// Warm the mirror on install and on browser start, so the first form the user
// opens does not have to wait on a network round trip.
chrome.runtime.onInstalled.addListener(() => {
  void refreshQuietly();
  watchSession();
});
chrome.runtime.onStartup.addListener(() => {
  void refreshQuietly();
  watchSession();
});

export default defineBackground(() => {
  void refreshQuietly();
  watchSession();
});
