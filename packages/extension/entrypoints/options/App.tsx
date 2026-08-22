import { useCallback, useEffect, useState } from "react";

import { groupFacts, send } from "../../lib/protocol.ts";
import type { MirrorPayload } from "../../lib/protocol.ts";
import { DEFAULT_PORT, settings } from "../../lib/settings.ts";
import type { ConnectionState } from "../../lib/server-client.ts";

/**
 * Connection state drives the whole first-run experience, so it is rendered as
 * a specific instruction rather than a status colour. Each state has exactly one
 * thing the user can do about it.
 */
function Connection({ state, onRetry }: { state: ConnectionState; onRetry: () => void }) {
  const shell = "rounded-lg border p-4 text-sm";

  if (state.kind === "ok") {
    return (
      <div className={`${shell} border-emerald-300 bg-emerald-50 text-emerald-900`}>
        <strong>Connected</strong> to the personal-md server on port {state.port}.
      </div>
    );
  }

  if (state.kind === "server_down") {
    return (
      <div className={`${shell} border-amber-300 bg-amber-50 text-amber-900`}>
        <strong>The server is not running.</strong>
        <p className="mt-1">
          Everything already in your profile still fills normally - only AI drafting needs the
          server. Start it with:
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-amber-100 p-2 font-mono text-xs">
          npm start --workspace @personal-md/server
        </pre>
        <button className="mt-2 underline" onClick={onRetry}>
          Check again
        </button>
      </div>
    );
  }

  if (state.kind === "no_token") {
    return (
      <div className={`${shell} border-sky-300 bg-sky-50 text-sky-900`}>
        <strong>Almost there.</strong> Paste the server token below. The server prints it on
        startup, and it is also in <code>~/.personal-md/token</code>.
      </div>
    );
  }

  if (state.kind === "unauthorised") {
    return (
      <div className={`${shell} border-rose-300 bg-rose-50 text-rose-900`}>
        <strong>The server rejected that token.</strong> Copy it again from{" "}
        <code>~/.personal-md/token</code> - it changes if you delete the file.
        <button className="mt-2 block underline" onClick={onRetry}>
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className={`${shell} border-rose-300 bg-rose-50 text-rose-900`}>
      <strong>Error:</strong> {state.message}
      <button className="mt-2 block underline" onClick={onRetry}>
        Check again
      </button>
    </div>
  );
}

export default function App() {
  const [payload, setPayload] = useState<MirrorPayload | null>(null);
  const [token, setToken] = useState("");
  const [port, setPort] = useState(DEFAULT_PORT);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setPayload(await send<MirrorPayload>({ kind: "getMirror" }));
    } catch (err) {
      setNote(err instanceof Error ? err.message : "could not reach the background worker");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setToken(await settings.getToken());
      setPort(await settings.getPort());
      await load();
    })();
  }, [load]);

  const saveConnection = async () => {
    await settings.setToken(token);
    await settings.setPort(port);
    setNote("Saved.");
    await load();
  };

  const profile = payload?.mirror?.profile;
  const connection = payload?.connection ?? { kind: "no_token" as const };
  const withheld = new Set(payload?.mirror?.withheldKeys ?? []);

  return (
    <main className="mx-auto max-w-3xl p-8 font-sans text-slate-800">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">personal-md</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your answers live in <code>~/.personal-md/PERSONAL.md</code>. It is a plain markdown
          file - open it in any editor and edit it by hand whenever you like.
        </p>
      </header>

      <section className="mb-8 space-y-3">
        <Connection state={connection} onRetry={load} />

        <div className="rounded-lg border border-slate-200 p-4">
          <h2 className="mb-3 font-medium">Server</h2>
          <label className="block text-sm">
            Token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste from ~/.personal-md/token"
              className="mt-1 w-full rounded border border-slate-300 p-2 font-mono text-xs"
            />
          </label>
          <label className="mt-3 block text-sm">
            Port
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || DEFAULT_PORT)}
              className="mt-1 w-28 rounded border border-slate-300 p-2 font-mono text-xs"
            />
          </label>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => void saveConnection()}
              className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              Save and reconnect
            </button>
            {note && <span className="text-xs text-slate-500">{note}</span>}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Your profile</h2>
          <button onClick={() => void load()} disabled={busy} className="text-sm underline">
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {!profile && <p className="text-sm text-slate-500">Nothing loaded yet.</p>}

        {profile && profile.facts.length === 0 && profile.answers.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600">
            <p className="font-medium text-slate-800">Your profile is empty.</p>
            <p className="mt-1">
              Nothing can be filled or drafted until there is something here. The interview is the
              fastest way to fix that - it asks the facts and the eight or so open questions every
              application asks, once.
            </p>
            <p className="mt-2 text-xs text-slate-500">Interview mode lands in the next step.</p>
          </div>
        )}

        {profile && profile.facts.length > 0 && (
          <div className="space-y-4">
            {groupFacts(profile).map(({ group, facts }) => (
              <div key={group} className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {group}
                </h3>
                <dl className="space-y-1 text-sm">
                  {facts.map((fact) => (
                    <div key={fact.key} className="flex gap-3">
                      <dt className="w-56 shrink-0 text-slate-500">{fact.label}</dt>
                      <dd className="font-mono text-xs">
                        {fact.value || <span className="text-slate-400">empty</span>}
                        {withheld.has(fact.key) && (
                          <span
                            title="Filled locally, never included in a prompt sent to Claude"
                            className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-sans text-slate-600"
                          >
                            local only
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}

        {profile && profile.answers.length > 0 && (
          <div className="mt-6 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Answers ({profile.answers.length})
            </h3>
            {profile.answers.map((answer) => (
              <article key={answer.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="font-mono text-xs text-slate-500">{answer.canonicalKey}</h4>
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    {answer.language} - {answer.genre} - used {answer.useCount}x
                  </span>
                </div>
                {answer.askedAs.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                    {answer.askedAs.map((q) => (
                      <li key={q}>&ldquo;{q}&rdquo;</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 whitespace-pre-wrap text-sm">{answer.text}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {payload?.mirror && (
        <footer className="mt-8 text-xs text-slate-400">
          Mirror fetched {new Date(payload.mirror.fetchedAt).toLocaleString()}. Field filling reads
          this copy, so it keeps working with the server stopped.
        </footer>
      )}
    </main>
  );
}
