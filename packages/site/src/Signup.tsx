/**
 * The signup, which is also the sign-in: there is nothing to tell them apart.
 *
 * One button. The provider redirects back here with a `?code=`, the client
 * picks it up on load, and by the time this component renders again there is a
 * session — so the "you are in" state is not something this form navigates to,
 * it is something it wakes up in.
 *
 * The screen never claims more than it does: it says in the same breath that
 * the account exists to move a profile between machines, that the profile
 * leaves encrypted, and that the passphrase is not recoverable. Burying that
 * until after signup would be the one dishonest moment on the page.
 */

import { useEffect, useState } from "react";

import { SIGN_IN_MESSAGES, isConfigured, startSignIn } from "@personal-md/identity";
import type { User } from "@supabase/supabase-js";

import { identify, track } from "./analytics.ts";
import { landingClient } from "./client.ts";

const client = isConfigured() ? landingClient() : null;

function GitHubMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function Signup() {
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /*
   * A failed round trip comes back as query and fragment parameters on this
   * page, and nothing else reads them — so without this the provider could
   * refuse, and the screen would show the same button as if nothing had
   * happened. The commonest one is a code that has already been spent: GitHub
   * issues them for a single use and a handful of seconds, so a reload of the
   * returning URL fails where the first load succeeded.
   */
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = search.get("error_code") ?? hash.get("error_code");
    if (!code) return;

    const described = search.get("error_description") ?? hash.get("error_description") ?? "";
    setProblem(
      /exchange external code/i.test(described)
        ? "GitHub would not complete that sign-in. If you reloaded this page, the code had already been used — start again from the button."
        : described.replace(/\+/g, " ") || "Sign-in did not complete.",
    );

    // Scrub it, so a refresh does not replay a failure that is already over.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  /*
   * The session may already be there — either from a previous visit or from the
   * redirect this very load is completing — so ask once, and then listen, because
   * detectSessionInUrl finishes after the first render.
   */
  useEffect(() => {
    if (!client) return;
    let live = true;
    void client.auth.getUser().then(({ data }) => {
      if (live && data.user) setUser(data.user);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        identify(session.user.id);
        track("signup_verified");
      }
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!client) {
    return (
      <p className="brio-mono text-[11.5px] text-graphite-400">
        accounts are not switched on in this build
      </p>
    );
  }

  if (user) {
    return (
      <div className="rounded-xl border border-jade-300 bg-jade-100 px-6 py-5">
        <p className="font-display text-[22px] leading-tight text-jade-950">You are in.</p>
        <p className="mt-2 max-w-[54ch] text-[14px] leading-relaxed text-graphite-700 text-pretty">
          Install the extension and sign in with the same GitHub account. It will ask you for a
          passphrase once — that is the key your profile is encrypted with, it never leaves your
          machine, and nobody here can reset it for you.
        </p>
      </div>
    );
  }

  async function go() {
    if (!client) return;
    setProblem(null);
    setBusy(true);
    track("signup_started", { placement: "sync" });

    const result = await startSignIn(client, window.location.href);
    if (result.kind === "go") {
      // Leaving the page, so the busy state is never cleared on this path.
      window.location.assign(result.url);
      return;
    }
    setBusy(false);
    setProblem(result.kind === "error" ? result.message : SIGN_IN_MESSAGES.offline);
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="inline-flex items-center gap-2.5 rounded-full bg-ink-900 px-6 py-3.5 text-[15px] font-semibold text-bone-050 transition-colors duration-150 hover:bg-brio-500 disabled:opacity-60"
      >
        <GitHubMark />
        {busy ? "Opening GitHub…" : "Continue with GitHub"}
      </button>

      {problem ? (
        <p role="alert" className="mt-3 max-w-[54ch] text-[13.5px] text-brio-700 text-pretty">
          {problem}
        </p>
      ) : (
        <p className="mt-3 max-w-[54ch] text-[13px] text-graphite-400 text-pretty">
          No password, and no email to wait for. Brío reads your GitHub handle and nothing else;
          the profile itself leaves your machine encrypted with a passphrase only you hold.
        </p>
      )}
    </div>
  );
}
