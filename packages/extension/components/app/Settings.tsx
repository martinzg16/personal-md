/**
 * The configuration, and the one place the companion is set up.
 *
 * The connection block leads rather than closing the page, because when somebody
 * opens Settings it is usually because drafting stopped working, and the answer
 * is almost always here. Each connection state names its own remedy: "server
 * down" and "signed out of the CLI" are different problems with different fixes
 * in different places, and collapsing them into one red dot is how a tool
 * teaches you to shrug at its error messages.
 */

import type { Lang } from "@personal-md/core";

import type { ConnectionState } from "../../lib/server-client.ts";
import { Card, Mono, PageHead, RING } from "./primitives.tsx";

const t = {
  es: {
    title: "Ajustes",
    lead: "El compañero es lo único configurable. Todo lo demás vive en tu fichero.",
    connection: "El compañero",
    token: "Token",
    tokenHelp:
      "Lo imprime el compañero al arrancar. Vive solo en esta extensión y nunca lo ve una página.",
    port: "Puerto",
    save: "Guardar",
    retry: "Reintentar",
    saved: "Guardado.",
    file: "Tu fichero",
    fileHelp: "Markdown plano, permisos 700, fuera de cualquier repositorio git.",
    language: "Idioma",
    languageHelp:
      "Detecta el idioma del formulario, que puede no ser el del navegador. Esto solo elige en cuál escribe tus borradores.",
    model: "Modelo",
    modelHelp:
      "Va por tu propia suscripción a través del CLI. No hay ninguna clave de API guardada en ningún sitio.",
    states: {
      ok: "En marcha.",
      claude_signed_out:
        "El compañero responde, pero el CLI de claude está desconectado. Rellenar sigue funcionando; redactar no. Ejecuta `claude` en una terminal y vuelve a entrar.",
      no_token: "Falta el token. Arranca el compañero y pega aquí el que imprime.",
      server_down: "No responde nada en ese puerto. Arráncalo con `npm start`.",
      unauthorised: "El token no vale. Copia otra vez el que imprime el compañero.",
      error: "No se pudo comprobar.",
    },
  },
  en: {
    title: "Settings",
    lead: "The companion is the only thing to configure. Everything else lives in your file.",
    connection: "The companion",
    token: "Token",
    tokenHelp:
      "The companion prints it when it starts. It lives only in this extension and no page ever sees it.",
    port: "Port",
    save: "Save",
    retry: "Retry",
    saved: "Saved.",
    file: "Your file",
    fileHelp: "Plain markdown, mode 700, outside any git repo.",
    language: "Language",
    languageHelp:
      "It detects the form's language, which may differ from the browser's. This only picks which one your drafts are written in.",
    model: "Model",
    modelHelp:
      "Runs on your own subscription through the CLI. There is no API key stored anywhere.",
    states: {
      ok: "Running.",
      claude_signed_out:
        "The companion answers, but the claude CLI is signed out. Filling still works; drafting does not. Run `claude` in a terminal and sign in again.",
      no_token: "No token yet. Start the companion and paste the one it prints.",
      server_down: "Nothing is answering on that port. Start it with `npm start`.",
      unauthorised: "That token is not accepted. Copy the companion's again.",
      error: "Could not check.",
    },
  },
} as const;

function Setting({
  label,
  help,
  value,
}: {
  label: string;
  help: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-rule-100 px-4.5 py-4 last:border-b-0">
      <div className="min-w-0 max-w-[58ch]">
        <p className="text-[14.5px] font-semibold">{label}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-graphite-400 text-pretty">{help}</p>
      </div>
      <div className="shrink-0">{value}</div>
    </div>
  );
}

export default function Settings({
  lang,
  state,
  token,
  port,
  note,
  filePath,
  onToken,
  onPort,
  onSave,
  onRetry,
}: {
  lang: Lang;
  state: ConnectionState;
  token: string;
  port: number;
  note: string;
  /** Where the companion says the file is, or null while it is unreachable. */
  filePath: string | null;
  onToken: (v: string) => void;
  onPort: (v: number) => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  const c = t[lang];
  const up = state.kind === "ok";
  const input =
    `rounded-md border border-rule-400 bg-bone-100 px-2.5 py-2 font-mono text-[13px] ` +
    `text-graphite-900 transition-colors focus:border-graphite-400 ${RING}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHead title={c.title} lead={c.lead} />

      <Card title={c.connection} meta={`:${port}`}>
        <p
          className={`flex items-start gap-2.5 border-b border-rule-100 px-4.5 py-3.5 text-[13.5px] leading-relaxed text-pretty ${
            up ? "text-jade-600" : "text-brio-700"
          }`}
        >
          <span
            aria-hidden="true"
            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${up ? "bg-jade-600" : "bg-brio-500"}`}
          />
          {c.states[state.kind]}
        </p>

        <Setting
          label={c.token}
          help={c.tokenHelp}
          value={
            <input
              value={token}
              onChange={(e) => onToken(e.target.value)}
              // A token is a credential; it is not printed in the clear on a
              // screen that might be shared, and the field says what it is.
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-label={c.token}
              className={`${input} w-[240px]`}
            />
          }
        />

        <Setting
          label={c.port}
          help=""
          value={
            <input
              value={port}
              onChange={(e) => onPort(Number(e.target.value) || port)}
              inputMode="numeric"
              aria-label={c.port}
              className={`${input} w-[100px]`}
            />
          }
        />

        <div className="flex items-center justify-end gap-3 border-t border-rule-200 bg-bone-100 px-4.5 py-3">
          {note && <Mono>{note}</Mono>}
          <button
            type="button"
            onClick={onRetry}
            className={`rounded-full border border-rule-400 px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-graphite-900 ${RING}`}
          >
            {c.retry}
          </button>
          <button
            type="button"
            onClick={onSave}
            className={`rounded-full bg-ink-900 px-4 py-1.5 text-[13px] font-semibold text-bone-050 transition-colors hover:bg-brio-500 ${RING}`}
          >
            {c.save}
          </button>
        </div>
      </Card>

      <Card>
        <Setting
          label={c.file}
          help={c.fileHelp}
          value={<Mono>{filePath ?? "~/.personal-md/PERSONAL.md"}</Mono>}
        />
        <Setting label={c.language} help={c.languageHelp} value={<Mono>es + en</Mono>} />
        <Setting
          label={c.model}
          help={c.modelHelp}
          value={
            <Mono>
              {state.kind === "claude_signed_out"
                ? lang === "es"
                  ? "desconectado"
                  : "signed out"
                : "claude CLI"}
            </Mono>
          }
        />
      </Card>
    </div>
  );
}
