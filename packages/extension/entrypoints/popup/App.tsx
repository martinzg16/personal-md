import { useEffect, useState } from "react";

import { send } from "../../lib/protocol.ts";
import type { MirrorPayload } from "../../lib/protocol.ts";
import { settings } from "../../lib/settings.ts";

/**
 * The popup answers one question: is this thing working right now, and on this
 * site? Anything that needs reading or editing belongs in the options page,
 * which has room for it.
 */
export default function App() {
  const [payload, setPayload] = useState<MirrorPayload | null>(null);
  const [domain, setDomain] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void (async () => {
      setPayload(await send<MirrorPayload>({ kind: "getMirror" }).catch(() => null));
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url?.startsWith("http")) {
        const host = new URL(tab.url).hostname;
        setDomain(host);
        setDismissed((await settings.getDismissed()).includes(host));
      }
    })();
  }, []);

  const toggleSite = async () => {
    if (!domain) return;
    if (dismissed) await settings.undismissSite(domain);
    else await settings.dismissSite(domain);
    setDismissed(!dismissed);
  };

  const profile = payload?.mirror?.profile;
  const connection = payload?.connection;

  const status = (() => {
    if (!connection) return { text: "Checking...", tone: "text-slate-500" };
    switch (connection.kind) {
      case "ok":
        return { text: "Server connected", tone: "text-emerald-700" };
      case "server_down":
        return { text: "Server stopped - filling still works", tone: "text-amber-700" };
      case "no_token":
        return { text: "Setup needed", tone: "text-sky-700" };
      case "unauthorised":
        return { text: "Token rejected", tone: "text-rose-700" };
      default:
        return { text: "Error", tone: "text-rose-700" };
    }
  })();

  return (
    <div className="w-72 p-4 font-sans text-slate-800">
      <h1 className="text-sm font-semibold">personal-md</h1>
      <p className={`mt-1 text-xs ${status.tone}`}>{status.text}</p>

      <dl className="mt-3 space-y-1 text-xs text-slate-600">
        <div className="flex justify-between">
          <dt>Facts</dt>
          <dd className="font-mono">{profile?.facts.length ?? 0}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Answers</dt>
          <dd className="font-mono">{profile?.answers.length ?? 0}</dd>
        </div>
      </dl>

      {domain && (
        <label className="mt-3 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={dismissed} onChange={() => void toggleSite()} />
          <span>
            Never show on <span className="font-mono">{domain}</span>
          </span>
        </label>
      )}

      <button
        onClick={() => void chrome.runtime.openOptionsPage()}
        className="mt-4 w-full rounded bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700"
      >
        Open profile editor
      </button>
    </div>
  );
}
