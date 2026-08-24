/**
 * The popup answers one question: is this thing working right now, and on this
 * site? Anything that needs reading or editing belongs in the app, which has
 * room for it.
 *
 * It shares its stylesheet with the app, and that is worth stating because the
 * surface this replaced learned it the hard way: a shared stylesheet is a shared
 * brand, and moving one without the other leaves the second rendering its old
 * classes against the new ground. Change one, look at both.
 *
 * Every state names what still works rather than what broke. "Server stopped"
 * on its own reads as "nothing works", and everything except drafting does.
 */

import { useEffect, useState } from "react";

import { send } from "../../lib/protocol.ts";
import type { MirrorPayload } from "../../lib/protocol.ts";
import { settings } from "../../lib/settings.ts";

const RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-brio-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-050";

export default function BrioPopup() {
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
    if (!connection) return { text: "Comprobando · Checking", good: null };
    switch (connection.kind) {
      case "ok":
        return { text: "En marcha · Running", good: true };
      case "server_down":
        return { text: "Parado · rellenar sigue funcionando", good: false };
      case "no_token":
        return { text: "Falta el token · Token missing", good: false };
      case "unauthorised":
        return { text: "Token rechazado · Refused", good: false };
      case "claude_signed_out":
        return { text: "Claude desconectado · redactar no", good: false };
      default:
        return { text: "Error", good: false };
    }
  })();

  const row = (es: string, en: string, value: number) => (
    <div className="flex items-baseline justify-between gap-4 border-t border-rule-200 py-2">
      <dt className="min-w-0">
        <span className="block text-[13px] font-medium">{es}</span>
        <span className="brio-mono block text-graphite-300">{en}</span>
      </dt>
      <dd className="font-display text-[22px] leading-none tabular-nums">{value}</dd>
    </div>
  );

  return (
    <div className="w-[272px] bg-bone-050 p-3.5 font-sans text-graphite-900 antialiased">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brio-500 font-display text-[13px] leading-none text-white"
        >
          B
        </span>
        <span className="font-display text-[19px] leading-none">Brío</span>
      </div>

      <p
        className={`mt-3 flex items-center gap-2 text-[12.5px] font-semibold ${
          status.good === null
            ? "text-graphite-400"
            : status.good
              ? "text-jade-600"
              : "text-brio-700"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            status.good === null
              ? "bg-graphite-300"
              : status.good
                ? "bg-jade-600"
                : "bg-brio-500"
          }`}
        />
        {status.text}
      </p>

      <dl className="mt-3">
        {row("Datos", "Facts", profile?.facts.length ?? 0)}
        {row("Respuestas", "Answers", profile?.answers.length ?? 0)}
      </dl>

      {domain && (
        <label className="mt-3 flex cursor-pointer items-start gap-2.5 border-t border-rule-200 pt-3">
          <input
            type="checkbox"
            checked={dismissed}
            onChange={() => void toggleSite()}
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 accent-brio-500 ${RING}`}
          />
          <span className="text-[12.5px] leading-snug text-graphite-600">
            No aparecer nunca en{" "}
            <span className="brio-mono text-graphite-900">{domain}</span>
            <span className="brio-mono block text-graphite-300">Never appear on this site</span>
          </span>
        </label>
      )}

      <button
        type="button"
        onClick={() => void chrome.runtime.openOptionsPage()}
        className={`mt-4 w-full rounded-full bg-ink-900 px-4 py-2.5 text-[13px] font-semibold text-bone-050 transition-colors hover:bg-brio-500 ${RING}`}
      >
        Abrir tu fichero
      </button>
    </div>
  );
}
