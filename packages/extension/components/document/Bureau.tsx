/**
 * The issuing bureau: the companion process that owns the file on disk.
 *
 * Connection state is rendered as one specific instruction per state rather than
 * as a status colour, which is how the old page did it and the one thing about
 * the old page that was right. What is new is the framing, and it is not
 * decoration: the extension is not the authority here. The file is on disk, the
 * process that owns it is the authority, and when that process is stopped the
 * honest thing to say is which powers are still available - all of them except
 * drafting - rather than "disconnected".
 */

import type { ConnectionState } from "../../lib/server-client.ts";
import { DEFAULT_PORT } from "../../lib/settings.ts";

function Endorsement({
  tone,
  children,
}: {
  tone: "open" | "limited" | "pending" | "refused";
  children: React.ReactNode;
}) {
  const ink = {
    open: "var(--color-stamp-green)",
    limited: "var(--color-intaglio-700)",
    pending: "var(--color-iris-cyan)",
    refused: "var(--color-endorse-600)",
  }[tone];

  return (
    <div
      className="pmd-note border-l-2 pl-4"
      style={{ borderColor: ink, color: "var(--color-intaglio-900)" }}
    >
      {children}
    </div>
  );
}

export default function Bureau({
  state,
  token,
  port,
  note,
  lang,
  onToken,
  onPort,
  onSave,
  onRetry,
}: {
  state: ConnectionState;
  token: string;
  port: number;
  note: string;
  lang: "es" | "en";
  onToken: (value: string) => void;
  onPort: (value: number) => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  const es = lang === "es";

  const body = (() => {
    if (state.kind === "ok") {
      return (
        <Endorsement tone="open">
          <strong>{es ? "En servicio" : "In service"}</strong>{" "}
          {es
            ? `en el puerto ${state.port}. El fichero se lee y se escribe con normalidad.`
            : `on port ${state.port}. The file is being read and written normally.`}
        </Endorsement>
      );
    }

    if (state.kind === "server_down") {
      return (
        <Endorsement tone="limited">
          <strong>{es ? "El proceso no está en marcha." : "The process is not running."}</strong>
          <p className="mt-1.5">
            {es
              ? "Todo lo que ya está en tu fichero se sigue rellenando igual: la copia local no necesita el servidor. Solo la redacción con Claude lo necesita."
              : "Everything already in your file still fills exactly as before - the local mirror needs no server. Only drafting with Claude does."}
          </p>
          <pre
            className="mt-3 overflow-x-auto p-2.5 font-mono text-[11px]"
            style={{
              background: "var(--color-laminate-100)",
              color: "var(--color-intaglio-900)",
              borderRadius: "var(--radius-window)",
              fontStretch: "82%",
            }}
          >
            npm start --workspace @personal-md/server
          </pre>
        </Endorsement>
      );
    }

    if (state.kind === "no_token") {
      return (
        <Endorsement tone="pending">
          <strong>{es ? "Falta la credencial." : "The credential is missing."}</strong>{" "}
          {es ? (
            <>
              Pega abajo el token que el servidor imprime al arrancar. También está en{" "}
              <code className="font-mono text-[12px]">~/.personal-md/token</code>.
            </>
          ) : (
            <>
              Paste the token the server prints on startup below. It is also in{" "}
              <code className="font-mono text-[12px]">~/.personal-md/token</code>.
            </>
          )}
        </Endorsement>
      );
    }

    if (state.kind === "unauthorised") {
      return (
        <Endorsement tone="refused">
          <strong>{es ? "Credencial rechazada." : "Credential refused."}</strong>{" "}
          {es ? (
            <>
              Vuelve a copiarla de <code className="font-mono text-[12px]">~/.personal-md/token</code>:
              cambia si borras el fichero.
            </>
          ) : (
            <>
              Copy it again from <code className="font-mono text-[12px]">~/.personal-md/token</code> - it
              changes if you delete the file.
            </>
          )}
        </Endorsement>
      );
    }

    return (
      <Endorsement tone="refused">
        <strong>{es ? "Error:" : "Error:"}</strong> {state.message}
      </Endorsement>
    );
  })();

  return (
    <article className="pmd-page pmd-page-in">
      <div className="px-7 pb-9 pt-10 sm:px-10 sm:pb-11 sm:pt-12">
        <p className="pmd-legend pmd-legend--secondary">
          {es ? "Autoridad emisora" : "Issuing bureau"}
        </p>
        <h2
          className="mt-1.5 font-sans leading-none"
          style={{ fontSize: "clamp(21px, 3.1vw, 29px)", fontWeight: 700, fontStretch: "104%" }}
        >
          {es ? "Quién guarda el fichero" : "Who holds the file"}
        </h2>
        <p
          className="pmd-note mt-4 max-w-[58ch]"
        >
          {es ? (
            <>
              Tu fichero vive en{" "}
              <code className="font-mono text-[12.5px]">~/.personal-md/PERSONAL.md</code>. Es markdown
              plano: ábrelo en cualquier editor y edítalo a mano cuando quieras.
            </>
          ) : (
            <>
              Your file lives at{" "}
              <code className="font-mono text-[12.5px]">~/.personal-md/PERSONAL.md</code>. It is plain
              markdown - open it in any editor and edit it by hand whenever you like.
            </>
          )}
        </p>

        <div className="my-7 h-px" style={{ background: "var(--color-laminate-200)" }} />

        {body}

        <div className="mt-8 grid gap-x-9 gap-y-6 sm:grid-cols-[minmax(0,1fr)_120px]">
          <label className="block min-w-0">
            <span className="pmd-legend block">Credencial</span>
            <span className="pmd-legend pmd-legend--secondary block">Token</span>
            <input
              type="password"
              value={token}
              onChange={(e) => onToken(e.target.value)}
              placeholder="~/.personal-md/token"
              className="pmd-field pmd-field--exact mt-1"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="pmd-legend block">Puerto</span>
            <span className="pmd-legend pmd-legend--secondary block">Port</span>
            <input
              type="number"
              value={port}
              onChange={(e) => onPort(Number(e.target.value) || DEFAULT_PORT)}
              className="pmd-field mt-1 tabular-nums"
            />
          </label>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button className="pmd-action pmd-action--primary" onClick={onSave}>
            {es ? "Guardar y reconectar" : "Save and reconnect"}
          </button>
          <button className="pmd-action pmd-action--quiet" onClick={onRetry}>
            {es ? "Comprobar de nuevo" : "Check again"}
          </button>
          {note && (
            <span className="pmd-legend pmd-legend--secondary normal-case tracking-[0.02em]">
              {note}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
