/**
 * How a failed `claude` call is translated into an error the user can act on.
 *
 * Offline on purpose: the interesting part is not the call, it is what happens
 * to the CLI's own explanation on the way to the widget. An expired OAuth
 * session exits non-zero with an empty stderr and the reason in `result` on
 * stdout, and that reason used to be thrown away - the widget showed
 * "server returned 502" and nothing else.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ask, authFailure, cliMessage, ClaudeError } from "../src/claude.ts";
import { canLapse, setClaudeAuthForTests } from "../src/claude-auth.ts";

const EXPIRED_SESSION = JSON.stringify({
  is_error: true,
  subtype: "success",
  terminal_reason: "api_error",
  result: "Failed to authenticate: OAuth session expired and could not be refreshed",
});

describe("reading what the CLI said about a failure", () => {
  it("recovers the reason from a failed call's stdout", () => {
    assert.match(cliMessage(EXPIRED_SESSION), /OAuth session expired/);
  });

  it("returns nothing rather than throwing when stdout is not JSON", () => {
    assert.equal(cliMessage("bash: claude: killed\n"), "");
    assert.equal(cliMessage(""), "");
  });

  it("recognises an expired session and names the remedy", () => {
    const err = authFailure(cliMessage(EXPIRED_SESSION));
    assert.ok(err, "an auth failure should be recognised");
    assert.equal(err.kind, "unauthenticated");
    // The exact command matters: `claude login` is not a subcommand - the CLI
    // treats it as a prompt - so telling someone to run it wastes their time.
    assert.match(err.message, /claude auth login/);
  });

  it("leaves an ordinary failure alone, so it is not mislabelled as auth", () => {
    assert.equal(authFailure("Prompt is too long"), null);
    assert.equal(authFailure(""), null);
  });
});

describe("a lapsed session is caught before anything is spent", () => {
  it("refuses without launching the CLI, and names the command that fixes it", async () => {
    setClaudeAuthForTests({ state: "out", account: "someone@example.com", checkedAt: Date.now() });
    const started = Date.now();
    await assert.rejects(
      () => ask({ system: "s", prompt: "p", skipEgressCheck: true }),
      (err: unknown) => {
        assert.ok(err instanceof ClaudeError);
        assert.equal(err.kind, "unauthenticated");
        assert.match(err.message, /claude auth login/);
        return true;
      },
    );
    // A launched CLI costs seconds; this has to be a decision, not an attempt.
    assert.ok(Date.now() - started < 1_000, "should not have spawned the CLI");
    setClaudeAuthForTests(null);
  });

  it("does not block drafting when the check itself cannot answer", async () => {
    // Fail-open: a probe that breaks must degrade to the old behaviour, where
    // the call is attempted and its own error speaks, not to an outage of our
    // own making. Reaching the egress guard proves the precheck let it past.
    setClaudeAuthForTests({ state: "unknown", reason: "cli missing", checkedAt: Date.now() });
    await assert.rejects(
      () => ask({ system: "s", prompt: "NIF 12345678Z", skipEgressCheck: false }),
      (err: unknown) => {
        assert.notEqual((err as ClaudeError).kind, "unauthenticated");
        return true;
      },
    );
    setClaudeAuthForTests(null);
  });
});

describe("which way of being signed in can lapse", () => {
  it("calls an interactive session fragile and a long-lived token durable", () => {
    const at = 0;
    assert.equal(canLapse({ state: "in", method: "claude.ai", checkedAt: at }), true);
    assert.equal(canLapse({ state: "in", method: "oauth_token", checkedAt: at }), false);
    assert.equal(canLapse({ state: "in", method: "apiKey", checkedAt: at }), false);
    // Unknown method is treated as the fragile one: advising the fix costs
    // nothing, and staying silent about it costs a lost draft.
    assert.equal(canLapse({ state: "in", checkedAt: at }), true);
    // Nothing to say about a session that is already gone.
    assert.equal(canLapse({ state: "out", checkedAt: at }), false);
  });
});
