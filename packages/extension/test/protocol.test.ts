/**
 * The message bridge has to carry *why*, not just that it failed.
 *
 * The widget holds a draft and resumes it only for one specific failure - a
 * signed-out CLI. That decision is made in the content script, on the far side
 * of chrome.runtime.sendMessage, so if the reason does not survive the crossing
 * the retry silently stops existing and the request is lost again. Hence a test
 * on the crossing itself rather than on either end.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

type Sent = { ok: false; error: string; reason?: string } | { ok: true; data: unknown };
let reply: Sent | undefined;

(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: { sendMessage: async () => reply },
};

const { BridgeError, isSignedOut, send } = await import("../lib/protocol.ts");

describe("failure reasons survive the message bridge", () => {
  it("keeps a signed-out reason recognisable on the far side", async () => {
    reply = { ok: false, error: "claude is signed out; run `claude auth login` and try again", reason: "claude_signed_out" };
    await assert.rejects(
      () => send({ kind: "getConnection" }),
      (err: unknown) => {
        assert.ok(err instanceof BridgeError);
        assert.ok(isSignedOut(err));
        return true;
      },
    );
  });

  it("does not mistake an ordinary failure for a recoverable one", async () => {
    reply = { ok: false, error: "claude did not respond within the timeout" };
    await assert.rejects(
      () => send({ kind: "getConnection" }),
      (err: unknown) => {
        assert.equal(isSignedOut(err), false);
        return true;
      },
    );
  });

  it("treats a plain Error as not recoverable", () => {
    assert.equal(isSignedOut(new Error("claude is signed out")), false);
  });
});
