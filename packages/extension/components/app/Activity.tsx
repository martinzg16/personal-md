/**
 * What has changed in the file, and where it has been used.
 *
 * A caveat worth stating plainly, because it shapes the whole screen: this is
 * the file's own history, not a fill log. `PERSONAL.md` records when each fact
 * was last written and when each answer was written; it does not record "at
 * 11:04 this filled six fields on empleo.arqia.es and you undid one of them".
 *
 * The honest thing to do with that gap is to show what is true and name what is
 * not, rather than to invent a plausible-looking event stream. So: every change,
 * newest first, grouped by the day it happened — and, separately, the sites this
 * file has learned the shape of, which is the closest thing to "where it has
 * been" that the format actually holds.
 *
 * A per-fill event log would be a change to the file format, not to this screen.
 */

import type { Answer, Fact, Lang } from "@personal-md/core";

import { labelFor } from "./labels.ts";
import { Card, Empty, Eyebrow, Mono, Pill } from "./primitives.tsx";
import { PageHead } from "./primitives.tsx";

const t = {
  es: {
    title: "Actividad",
    lead: "Todo lo que ha cambiado en tu fichero, y en qué formularios ha aprendido a reconocerse. Lo edita tu mano o lo confirmas tú: nada entra aquí sin que lo digas.",
    changed: "cambió",
    wrote: "escribiste",
    localOnly: "solo local",
    sites: "Formularios que ya reconoce",
    sitesLead:
      "Cuando confirmas a qué pregunta corresponde un campo, ese formulario queda anotado y la próxima vez no hay que preguntarlo.",
    noSites: "Todavía ninguno. Se anotan solos la primera vez que rellenas un formulario.",
    empty: "Tu fichero aún no ha cambiado nunca.",
    today: "Hoy",
    yesterday: "Ayer",
    caveat:
      "Esto es el historial del fichero, no un registro de rellenos: PERSONAL.md guarda cuándo cambió cada cosa, no cada formulario en el que se usó.",
  },
  en: {
    title: "Activity",
    lead: "Everything that has changed in your file, and the forms it has learned the shape of. Your own hand or your own confirmation put all of it there.",
    changed: "changed",
    wrote: "you wrote",
    localOnly: "local only",
    sites: "Forms it already recognises",
    sitesLead:
      "When you confirm which question a field is asking, that form is noted, and the next time there is nothing to ask.",
    noSites: "None yet. They note themselves the first time you fill a form.",
    empty: "Your file has never changed.",
    today: "Today",
    yesterday: "Yesterday",
    caveat:
      "This is the file's history, not a fill log: PERSONAL.md records when each thing changed, not every form it was used on.",
  },
} as const;

/** Either branch of the copy table. `t.es` alone would only accept Spanish. */
type Copy = (typeof t)[Lang];

interface Event {
  at: Date;
  kind: "fact" | "answer";
  title: string;
  detail: string;
  chips: string[];
}

/** Group by calendar day, newest day first, newest event first inside it. */
function byDay(events: Event[], lang: Lang, c: Copy) {
  const days = new Map<string, Event[]>();
  for (const e of events) {
    const key = e.at.toDateString();
    const bucket = days.get(key);
    if (bucket) bucket.push(e);
    else days.set(key, [e]);
  }

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const label = (key: string) =>
    key === today
      ? c.today
      : key === yesterday
        ? c.yesterday
        : new Date(key).toLocaleDateString(lang, {
            weekday: "long",
            day: "numeric",
            month: "long",
          });

  return [...days.entries()]
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .map(([key, list]) => ({
      key,
      label: label(key),
      events: list.sort((a, b) => b.at.getTime() - a.at.getTime()),
    }));
}

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function Activity({
  lang,
  facts,
  answers,
  withheld,
  siteMemory,
}: {
  lang: Lang;
  facts: readonly Fact[];
  answers: readonly Answer[];
  withheld: Set<string>;
  siteMemory: Record<string, string>;
}) {
  const c = t[lang];

  const events: Event[] = [
    ...facts
      .filter((f) => f.value.trim())
      .map<Event>((f) => ({
        at: new Date(f.updatedAt),
        kind: "fact",
        title: labelFor(f.key, lang, f.label),
        // A withheld value is not printed here. This screen is a history, and a
        // history is exactly the kind of thing somebody scrolls past on a shared
        // screen without thinking about what is in it.
        detail: withheld.has(f.key) ? "" : f.value,
        chips: [f.key, ...(withheld.has(f.key) ? [c.localOnly] : [])],
      })),
    ...answers
      .filter((a) => a.text.trim())
      .map<Event>((a) => ({
        at: new Date(a.writtenAt),
        kind: "answer",
        title: a.askedAs[0] ?? a.canonicalKey,
        detail: a.text,
        chips: [a.canonicalKey, `${words(a.text)} ${lang === "es" ? "palabras" : "words"}`, a.language],
      })),
  ].filter((e) => !Number.isNaN(e.at.getTime()));

  const days = byDay(events, lang, c);

  // domain\tsignature -> canonicalKey. Only the domain is worth showing: the
  // signature is a hash of the form's fields and means nothing to a person.
  const sites = [...new Set(Object.keys(siteMemory).map((k) => k.split("\t")[0] ?? ""))]
    .filter(Boolean)
    .sort();

  return (
    <div className="flex flex-col gap-6">
      <PageHead title={c.title} lead={c.lead} />

      {days.length === 0 ? (
        <Card>
          <Empty>{c.empty}</Empty>
        </Card>
      ) : (
        days.map((day) => (
          <div key={day.key}>
            <Eyebrow>{day.label}</Eyebrow>
            <div className="mt-3 flex flex-col gap-2.5">
              {day.events.map((e, i) => (
                <article
                  key={`${day.key}-${i}`}
                  className="rounded-xl border border-rule-400 bg-white px-4.5 py-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-[15px] font-semibold text-pretty">
                      <span className="text-graphite-400">
                        {e.kind === "answer" ? c.wrote : c.changed}{" "}
                      </span>
                      {e.title}
                    </p>
                    <Mono>
                      {e.at.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}
                    </Mono>
                  </div>
                  {e.detail && (
                    <p className="mt-1.5 line-clamp-3 text-[14px] leading-relaxed text-graphite-600 text-pretty">
                      {e.detail}
                    </p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {e.chips.map((chip) => (
                      <Pill key={chip} tone={chip === c.localOnly ? "withheld" : "neutral"}>
                        {chip}
                      </Pill>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))
      )}

      <Card title={c.sites} meta={`${sites.length}`}>
        <p className="border-b border-rule-100 px-4.5 py-3 text-[13.5px] leading-relaxed text-graphite-400 text-pretty">
          {c.sitesLead}
        </p>
        {sites.length === 0 ? (
          <Empty>{c.noSites}</Empty>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-4.5 py-4">
            {sites.map((s) => (
              <Pill key={s}>{s}</Pill>
            ))}
          </div>
        )}
      </Card>

      <p className="text-[12.5px] leading-relaxed text-graphite-400 text-pretty">{c.caveat}</p>
    </div>
  );
}
