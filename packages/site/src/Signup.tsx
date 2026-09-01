/**
 * The signup, which is also the sign-in: there is no password to tell them apart.
 *
 * Two fields, one at a time — an address, then the six digits it receives. The
 * screen never claims more than it does: this creates the account that lets one
 * profile reach a second machine, and it says in the same breath that the
 * profile leaves encrypted and that the passphrase is not recoverable. Burying
 * that until after signup would be the one dishonest moment on the page.
 */

import { useState } from "react";

import {
  SIGN_IN_MESSAGES,
  createBrioClient,
  isConfigured,
  looksLikeEmail,
  requestCode,
  submitCode,
} from "@personal-md/identity";

import { identify, track } from "./analytics.ts";

type Stage =
  | { kind: "email" }
  | { kind: "sending" }
  | { kind: "code"; email: string }
  | { kind: "checking"; email: string }
  | { kind: "done" };

const client = isConfigured() ? createBrioClient({ detectSessionInUrl: false }) : null;

export default function Signup() {
  const [stage, setStage] = useState<Stage>({ kind: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const busy = stage.kind === "sending" || stage.kind === "checking";

  async function askForCode(event: React.FormEvent) {
    event.preventDefault();
    if (!client) return;
    setProblem(null);
    if (!looksLikeEmail(email)) {
      setProblem(SIGN_IN_MESSAGES.bad_email);
      return;
    }
    track("signup_started", { placement: "sync" });
    setStage({ kind: "sending" });

    const result = await requestCode(client, email);
    if (result.kind === "sent") {
      track("signup_email_sent");
      setStage({ kind: "code", email: result.email });
      return;
    }
    setStage({ kind: "email" });
    setProblem(
      result.kind === "error" ? result.message : SIGN_IN_MESSAGES[result.kind],
    );
  }

  async function checkCode(event: React.FormEvent) {
    event.preventDefault();
    if (!client || stage.kind !== "code") return;
    const address = stage.email;
    setProblem(null);
    setStage({ kind: "checking", email: address });

    const result = await submitCode(client, address, code);
    if (result.kind === "signed_in") {
      // Bind this browser's whole anonymous history to the account before the
      // event, so the conversion is attributed to the visit that caused it.
      identify(result.accountId);
      track("signup_verified");
      setStage({ kind: "done" });
      return;
    }
    setStage({ kind: "code", email: address });
    setProblem(result.kind === "error" ? result.message : SIGN_IN_MESSAGES[result.kind]);
  }

  if (!client) {
    return (
      <p className="brio-mono text-[11.5px] text-graphite-400">
        accounts are not switched on in this build
      </p>
    );
  }

  if (stage.kind === "done") {
    return (
      <div className="rounded-xl border border-jade-300 bg-jade-100 px-6 py-5">
        <p className="font-display text-[22px] leading-tight text-jade-950">You are in.</p>
        <p className="mt-2 max-w-[52ch] text-[14px] leading-relaxed text-graphite-700 text-pretty">
          Install the extension and sign in with the same address. It will ask you for a
          passphrase once — that is the key your profile is encrypted with, and it never leaves
          your machine, so nobody here can reset it for you.
        </p>
      </div>
    );
  }

  const field =
    "w-full rounded-full border border-rule-500 bg-bone-050 px-5 py-3.5 text-[15px] text-graphite-900 outline-none transition-colors placeholder:text-graphite-400 focus:border-graphite-900";
  const submit =
    "inline-flex shrink-0 items-center rounded-full bg-lapis-500 px-6 py-3.5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-brio-500 disabled:opacity-60";

  return (
    <div>
      {stage.kind === "email" || stage.kind === "sending" ? (
        <form onSubmit={askForCode} className="flex flex-wrap items-center gap-3">
          <label htmlFor="signup-email" className="sr-only">
            Email address
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`${field} sm:max-w-[22rem]`}
          />
          <button type="submit" disabled={busy} className={submit}>
            {busy ? "Sending…" : "Send me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={checkCode} className="flex flex-wrap items-center gap-3">
          <label htmlFor="signup-code" className="sr-only">
            The six-digit code
          </label>
          <input
            id="signup-code"
            // Not type="number": leading zeros survive, and so does the keypad.
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            disabled={busy}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            className={`${field} max-w-[9rem] text-center font-mono tracking-[0.35em]`}
          />
          <button type="submit" disabled={busy || code.length < 6} className={submit}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <span className="brio-mono text-[11.5px] text-graphite-400">
            sent to {stage.email}
          </span>
        </form>
      )}

      {problem ? (
        <p role="alert" className="mt-3 max-w-[52ch] text-[13.5px] text-brio-700 text-pretty">
          {problem}
        </p>
      ) : (
        <p className="mt-3 max-w-[52ch] text-[13px] text-graphite-400 text-pretty">
          No password. A six-digit code by email, and the profile itself leaves your machine
          encrypted with a passphrase only you hold.
        </p>
      )}
    </div>
  );
}
