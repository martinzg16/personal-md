/**
 * First run.
 *
 * The prototype opened on a dropzone — drop in a CV, a passport scan, last
 * year's tax return, and watch it read them. Nothing in this build reads a PDF,
 * so that screen would be a promise the next click breaks. What is here instead
 * is the same shape, the same three steps and the same rule (nothing is written
 * until you confirm it), pointed at the two routes that actually exist.
 *
 * The order is forced rather than chosen. The file lives with the companion, so
 * on a machine where the companion has never run there is no file to put
 * anything into — which makes "start it" step one whether anyone likes it or not.
 * Saying so is better than showing a dropzone that silently fails.
 *
 * Nothing here is required and there is no progress bar. A file with four facts
 * already fills more of a form than an empty one.
 */

import type { Lang } from "@personal-md/core";

import type { ConnectionState } from "../../lib/server-client.ts";
import { RING } from "./primitives.tsx";

const LINKEDIN_ME = "https://www.linkedin.com/in/me/";

const t = {
  es: {
    steps: ["1 · El compañero", "2 · Trae lo que ya tienes", "3 · Confirmas tú"],
    connectTitle: "Primero, arranca el compañero.",
    connectLead:
      "Tu fichero vive en tu máquina y lo escribe un proceso tuyo, no esta extensión. Hasta que esté en marcha no hay dónde guardar nada.",
    connectHow: "En el repositorio:",
    connectThen:
      "Imprime un token al arrancar. Pégalo en Ajustes y esta pantalla continúa sola.",
    toSettings: "Ir a Ajustes",
    bringTitle: "Trae lo que ya tienes.",
    bringLead:
      "Dos caminos, y los dos escriben exactamente lo mismo: una propuesta que tú lees, editas y confirmas antes de que toque el fichero.",
    linkedin: "Leer mi perfil de LinkedIn",
    linkedinBody:
      "Se abre tu perfil y el panel se ofrece a leerlo ahí. Titular, puesto, fechas y tu «Acerca de». Se lee en tu máquina; no se sube a ningún sitio.",
    linkedinAction: "Abrir mi perfil",
    byHand: "Contestar unas preguntas",
    byHandBody:
      "Las mismas preguntas que un formulario te va a hacer igual, pero una sola vez. Nada es obligatorio y cada bloque se guarda solo.",
    byHandAction: "Empezar",
    nothing: "nada se sube a ningún sitio",
    skip: "Mirar el fichero vacío",
  },
  en: {
    steps: ["1 · The companion", "2 · Bring what you have", "3 · You confirm"],
    connectTitle: "First, start the companion.",
    connectLead:
      "Your file lives on your machine and a process of yours writes it, not this extension. Until it is running there is nowhere to put anything.",
    connectHow: "In the repository:",
    connectThen:
      "It prints a token when it starts. Paste that under Settings and this screen carries on by itself.",
    toSettings: "Go to Settings",
    bringTitle: "Bring what you already have.",
    bringLead:
      "Two routes, and both write exactly the same thing: a proposal you read, edit and confirm before it touches the file.",
    linkedin: "Read my LinkedIn profile",
    linkedinBody:
      "Your profile opens and the panel offers to read it there. Headline, role, dates and your About section. Read on your machine; uploaded nowhere.",
    linkedinAction: "Open my profile",
    byHand: "Answer some questions",
    byHandBody:
      "The same questions a form is going to ask you anyway, but once. Nothing is required and every block records on its own.",
    byHandAction: "Start",
    nothing: "nothing is uploaded anywhere",
    skip: "Look at the empty file",
  },
} as const;

function Steps({ at, labels }: { at: number; labels: readonly string[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-2.5">
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-2.5">
          <span
            className={`brio-eyebrow ${i === at ? "text-graphite-900" : "text-graphite-300"}`}
            aria-current={i === at ? "step" : undefined}
          >
            {label}
          </span>
          {i < labels.length - 1 && (
            <span aria-hidden="true" className="h-px w-7 bg-rule-600" />
          )}
        </li>
      ))}
    </ol>
  );
}

function Route({
  title,
  body,
  action,
  onClick,
  primary,
}: {
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rule-400 bg-white p-6">
      <p className="font-display text-[26px] leading-tight text-balance">{title}</p>
      <p className="flex-1 text-[14px] leading-relaxed text-graphite-600 text-pretty">{body}</p>
      <div>
        <button
          type="button"
          onClick={onClick}
          className={`rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition-colors ${RING} ${
            primary
              ? "bg-ink-900 text-bone-050 hover:bg-brio-500"
              : "border border-rule-500 text-graphite-900 hover:border-graphite-900"
          }`}
        >
          {action}
        </button>
      </div>
    </div>
  );
}

export default function Onboarding({
  lang,
  state,
  onGoToSettings,
  onGoToContext,
  onSkip,
}: {
  lang: Lang;
  state: ConnectionState;
  onGoToSettings: () => void;
  onGoToContext: () => void;
  onSkip: () => void;
}) {
  const c = t[lang];
  // Signed out of the CLI still means the companion is answering and the file
  // exists, so onboarding is past step one; only drafting is unavailable.
  const connected = state.kind === "ok" || state.kind === "claude_signed_out";

  return (
    <div className="min-h-screen bg-bone-050 font-sans text-[15px] leading-relaxed text-graphite-900 antialiased">
      <div className="mx-auto max-w-[860px] px-6 pb-24 pt-14 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brio-500 font-display text-[13px] leading-none text-white"
          >
            B
          </span>
          <span className="font-display text-[19px]">Brío</span>
        </div>

        <div className="mt-9">
          <Steps at={connected ? 1 : 0} labels={c.steps} />
        </div>

        {!connected ? (
          <div className="mt-7 max-w-[640px]">
            <h1
              className="font-display font-normal leading-[1.02] tracking-[-0.015em] text-balance"
              style={{ fontSize: "clamp(34px, 5.4vw, 54px)" }}
            >
              {c.connectTitle}
            </h1>
            <p className="mt-4 max-w-[52ch] text-[16.5px] text-graphite-700 text-pretty">
              {c.connectLead}
            </p>

            <div className="mt-8 overflow-hidden rounded-2xl border border-rule-400 bg-white">
              <p className="border-b border-rule-200 px-5 py-3 text-[13.5px] text-graphite-400">
                {c.connectHow}
              </p>
              <pre className="overflow-x-auto bg-ink-900 px-5 py-4 font-mono text-[13px] leading-relaxed text-paper-050">
                npm start
              </pre>
              <p className="px-5 py-4 text-[13.5px] leading-relaxed text-graphite-600 text-pretty">
                {c.connectThen}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={onGoToSettings}
                className={`rounded-full bg-ink-900 px-6 py-3 text-[14px] font-semibold text-bone-050 transition-colors hover:bg-brio-500 ${RING}`}
              >
                {c.toSettings}
              </button>
              <button
                type="button"
                onClick={onSkip}
                className={`rounded-full px-2 py-1 text-[13.5px] text-graphite-400 underline decoration-rule-600 underline-offset-4 transition-colors hover:text-graphite-900 ${RING}`}
              >
                {c.skip}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-7">
            <h1
              className="max-w-[16ch] font-display font-normal leading-[1.02] tracking-[-0.015em] text-balance"
              style={{ fontSize: "clamp(34px, 5.4vw, 54px)" }}
            >
              {c.bringTitle}
            </h1>
            <p className="mt-4 max-w-[54ch] text-[16.5px] text-graphite-700 text-pretty">
              {c.bringLead}
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Route
                primary
                title={c.linkedin}
                body={c.linkedinBody}
                action={c.linkedinAction}
                onClick={() => window.open(LINKEDIN_ME, "_blank", "noopener,noreferrer")}
              />
              <Route
                title={c.byHand}
                body={c.byHandBody}
                action={c.byHandAction}
                onClick={onGoToContext}
              />
            </div>

            <p className="mt-5 flex flex-wrap items-center gap-3">
              <span className="brio-mono text-graphite-400">{c.nothing}</span>
              <button
                type="button"
                onClick={onSkip}
                className={`rounded-full px-2 py-1 text-[13.5px] text-graphite-400 underline decoration-rule-600 underline-offset-4 transition-colors hover:text-graphite-900 ${RING}`}
              >
                {c.skip}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
