import { useEffect, useState } from "react";

import { send } from "../../lib/protocol.ts";
import type { MirrorPayload } from "../../lib/protocol.ts";
import { settings } from "../../lib/settings.ts";

/**
 * The popup answers one question: is this thing working right now, and on this
 * site? Anything that needs reading or editing belongs in the options page,
 * which has room for it.
 *
 * It is dressed as the call slip - the small paper you fill in to ask for a
 * document rather than the document itself. That is the honest shape for it: it
 * holds the extent and the endorsement and nothing you can edit, and the one
 * action on it opens the real thing.
 *
 * It shares `options/style.css`, which is what forced this rewrite: when that
 * sheet became a burgundy ground with a laminate plane, the popup's Tailwind
 * slate classes were still written for white cards, so a change two directories
 * away left this surface as grey text on a dark red field. A shared stylesheet is
 * a shared brand, and both surfaces have to be moved together.
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

  /*
   * One line per state, each naming what still works rather than what broke -
   * the same rule the options page's bureau panel follows, because "server
   * stopped" on its own reads as "nothing works" and everything except drafting
   * does.
   */
  const status = (() => {
    if (!connection) return { text: "Comprobando · Checking", ink: "var(--color-intaglio-500)" };
    switch (connection.kind) {
      case "ok":
        return { text: "En servicio · In service", ink: "var(--color-stamp-green)" };
      case "server_down":
        return {
          text: "Proceso parado · rellenar sigue funcionando",
          ink: "var(--color-intaglio-700)",
        };
      case "no_token":
        return { text: "Falta la credencial · Credential missing", ink: "var(--color-stamp-blue)" };
      case "unauthorised":
        return { text: "Credencial rechazada · Refused", ink: "var(--color-endorse-600)" };
      case "claude_signed_out":
        return {
          text: "Sesión de Claude caducada · redactar no funciona",
          ink: "var(--color-intaglio-700)",
        };
      default:
        return { text: "Error", ink: "var(--color-endorse-600)" };
    }
  })();

  const row = (es: string, en: string, value: number) => (
    <div
      className="flex items-baseline justify-between gap-4 py-1.5"
      style={{ borderTop: "1px solid var(--color-laminate-200)" }}
    >
      <dt>
        <span className="pmd-legend block">{es}</span>
        <span className="pmd-legend pmd-legend--secondary block">{en}</span>
      </dt>
      <dd className="pmd-data tabular-nums">{value}</dd>
    </div>
  );

  return (
    <div className="w-[268px] p-3">
      <div className="pmd-page px-4 pb-4 pt-4">
        <div className="relative">
          {/*
            The wordmark leads and the identity line follows it. Set above it, the
            identity line was an eyebrow - the one pattern the floor bans outright,
            and the exact thing that was stripped off all four folios in the same
            pass that built this. A line under a heading is a subtitle; the same
            line over it is a kicker.
          */}
          <h1
            className="font-sans leading-none"
            style={{ fontSize: "15px", fontWeight: 700, fontStretch: "108%", letterSpacing: "0.03em" }}
          >
            PERSONAL.md
          </h1>
          <p className="pmd-legend pmd-legend--secondary mt-1.5">
            PM · OWN · Documento personal legible por máquina
          </p>

          <p className="pmd-legend mt-2.5" style={{ color: status.ink }}>
            {status.text}
          </p>

          <dl className="mt-3.5">
            {row("Datos", "Facts", profile?.facts.length ?? 0)}
            {row("Respuestas", "Answers", profile?.answers.length ?? 0)}
          </dl>

          {domain && (
            <label
              className="mt-3.5 flex cursor-pointer items-start gap-2 pt-3"
              style={{ borderTop: "1px solid var(--color-laminate-200)" }}
            >
              <input
                type="checkbox"
                checked={dismissed}
                onChange={() => void toggleSite()}
                className="pmd-endorse-check"
              />
              <span className="pmd-endorse-box mt-0.5" aria-hidden="true" />
              <span className="pmd-legend pmd-legend--secondary normal-case tracking-[0.02em] leading-snug">
                No aparecer nunca en{" "}
                <span className="pmd-data pmd-data--verbatim text-[10px]">{domain}</span>
                <span className="block">Never appear on this site</span>
              </span>
            </label>
          )}

          <button
            onClick={() => void chrome.runtime.openOptionsPage()}
            className="pmd-action pmd-action--primary mt-4 w-full"
          >
            Abrir el documento
          </button>
        </div>
      </div>
    </div>
  );
}
