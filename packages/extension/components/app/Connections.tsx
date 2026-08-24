/**
 * Where more could come from.
 *
 * The prototype for this screen showed four cards — Gmail, an HR system, a bank,
 * a Drive folder — three of which do not exist. They are not built here, and a
 * card saying "synced 2h ago" under a source that has never synced anything is
 * the exact failure this product is otherwise organised against.
 *
 * So this screen lists what can actually top the file up today, which is two
 * things, and then says plainly that it is two things. That is a thinner screen
 * than the mock and a truer one, and when a third source ships it goes here and
 * the closing note gets shorter.
 *
 * Every entry states what it reads before it states what it does, because "what
 * would this see" is the question somebody is really asking when they look at a
 * list like this.
 */

import type { Lang } from "@personal-md/core";

import { Card, Mono, PageHead, Pill, RING } from "./primitives.tsx";

const t = {
  es: {
    title: "De dónde sale",
    lead: "Fuentes que pueden llenar tu fichero sin que lo escribas a mano. Cada una dice qué lee, y nada de lo que lee puede enviarse hasta que un dato esté clasificado como enviable.",
    linkedin: "Tu perfil de LinkedIn",
    linkedinReads:
      "Tu titular, tu puesto actual, tus fechas y el texto de tu «Acerca de». Solo el tuyo: el panel comprueba que el perfil abierto es tuyo antes de ofrecerlo.",
    linkedinHow:
      "Abre tu propio perfil de LinkedIn. El panel te ofrece leerlo, y lo que saque pasa por la misma confirmación que todo lo demás antes de guardarse.",
    linkedinState: "disponible en el panel",
    hand: "Tu mano",
    handReads: "Lo que escribas en Contexto, y el propio PERSONAL.md si lo abres en un editor.",
    handHow:
      "El fichero es markdown plano y es tuyo. Edítalo a las dos de la mañana si quieres; el compañero lo relee y no pierde nada.",
    handState: "siempre",
    open: "Ir a Contexto",
    onlyTwo: "Solo hay dos",
    onlyTwoBody:
      "No hay integración con correo, con nóminas ni con el banco, y esta pantalla no va a fingir que la hay. Lo tercero que entra en tu fichero eres tú confirmando algo que un formulario te acaba de preguntar, y eso ocurre en el panel, no aquí.",
  },
  en: {
    title: "Where more comes from",
    lead: "Sources that can fill your file without you typing it. Each states what it reads, and nothing it reads is sendable until a value is classified as sendable.",
    linkedin: "Your LinkedIn profile",
    linkedinReads:
      "Your headline, your current role, your dates and the text of your About section. Only yours: the panel checks the open profile is your own before it offers.",
    linkedinHow:
      "Open your own LinkedIn profile. The panel offers to read it, and whatever it finds goes through the same confirmation as everything else before it lands.",
    linkedinState: "available in the panel",
    hand: "Your own hand",
    handReads: "Whatever you type under Context, and PERSONAL.md itself if you open it in an editor.",
    handHow:
      "The file is plain markdown and it is yours. Edit it by hand at 2am; the companion re-reads it and loses nothing.",
    handState: "always",
    open: "Go to Context",
    onlyTwo: "There are only two",
    onlyTwoBody:
      "There is no mail, payroll or bank integration, and this screen is not going to pretend otherwise. The third thing that ends up in your file is you, confirming something a form just asked you — and that happens in the panel, not here.",
  },
} as const;

function Source({
  name,
  state,
  reads,
  how,
  action,
}: {
  name: string;
  state: string;
  reads: string;
  how: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-rule-400 bg-white p-4.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15.5px] font-semibold">{name}</p>
        <Pill tone="done">{state}</Pill>
      </div>
      <p className="text-[13.5px] leading-relaxed text-graphite-600 text-pretty">{reads}</p>
      <p className="text-[13px] leading-relaxed text-graphite-400 text-pretty">{how}</p>
      {action && <div className="mt-0.5 flex justify-end">{action}</div>}
    </div>
  );
}

export default function Connections({
  lang,
  onGoToContext,
}: {
  lang: Lang;
  onGoToContext: () => void;
}) {
  const c = t[lang];

  return (
    <div className="flex flex-col gap-6">
      <PageHead title={c.title} lead={c.lead} />

      <div className="grid gap-3 md:grid-cols-2">
        <Source
          name={c.linkedin}
          state={c.linkedinState}
          reads={c.linkedinReads}
          how={c.linkedinHow}
          action={<Mono>linkedin.com/in/…</Mono>}
        />
        <Source
          name={c.hand}
          state={c.handState}
          reads={c.handReads}
          how={c.handHow}
          action={
            <button
              type="button"
              onClick={onGoToContext}
              className={`rounded-full border border-rule-400 px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-graphite-900 ${RING}`}
            >
              {c.open}
            </button>
          }
        />
      </div>

      <Card title={c.onlyTwo}>
        <p className="px-4.5 py-4 text-[14px] leading-relaxed text-graphite-600 text-pretty">
          {c.onlyTwoBody}
        </p>
      </Card>
    </div>
  );
}
