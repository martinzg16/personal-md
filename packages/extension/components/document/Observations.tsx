/**
 * Observaciones — the file as it actually stands.
 *
 * A passport's observations page is where endorsements and conditions are typed
 * after the fact, so it is the right place for the two things the data pages
 * cannot show: every condition of access in one list, and the complete contents
 * of the file including anything that arrived from a form rather than from this
 * surface.
 *
 * The values here are printed as stored, not as typed. This is the page you come
 * to when you want to know what is really in the file, so a value that was
 * confirmed on some employer's form three weeks ago appears here the same as one
 * typed on folio 01.
 */

import { groupFacts } from "../../lib/protocol.ts";
import type { Dossier } from "../../lib/document/dossier.ts";
import type { Lang, Profile } from "@personal-md/core";

const GROUP_TITLES: Record<string, { es: string; en: string }> = {
  personal: { es: "Datos personales", en: "Personal" },
  contact: { es: "Contacto", en: "Contact" },
  work: { es: "Trabajo", en: "Work" },
  education: { es: "Formación", en: "Education" },
  languages: { es: "Idiomas", en: "Languages" },
  logistics: { es: "Condiciones", en: "Logistics" },
  financial: { es: "Económico", en: "Financial" },
};

const WRITTEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default function Observations({
  profile,
  dossier,
  withheld,
  fetchedAt,
  lang,
  busy,
  onRefresh,
}: {
  profile: Profile | null;
  dossier: Dossier;
  withheld: Set<string>;
  fetchedAt: string | null;
  lang: Lang;
  busy: boolean;
  onRefresh: () => void;
}) {
  const es = lang === "es";
  const facts = profile?.facts.filter((f) => f.value.trim()) ?? [];
  const answers = profile?.answers.filter((a) => a.text.trim()) ?? [];

  return (
    <article className="pmd-page pmd-page-in">
      <div className="px-7 pb-10 pt-10 sm:px-10 sm:pb-12 sm:pt-12">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="pmd-legend pmd-legend--secondary">Observaciones · Observations</p>
            <h2
              className="mt-1.5 font-sans leading-none"
              style={{ fontSize: "clamp(21px, 3.1vw, 29px)", fontWeight: 700, fontStretch: "104%" }}
            >
              {es ? "Lo que hay en el fichero" : "What is in the file"}
            </h2>
          </div>
          <button className="pmd-action pmd-action--quiet" onClick={onRefresh} disabled={busy}>
            {busy
              ? es
                ? "Leyendo…"
                : "Reading…"
              : es
                ? "Volver a leer el fichero"
                : "Re-read the file"}
          </button>
        </div>

        {/* The conditions, first, because they are the thing worth knowing before
            anything else on this page. */}
        <div
          className="mt-7 border-l-2 pl-4"
          style={{ borderColor: "var(--color-endorse-600)" }}
        >
          <p className="pmd-legend" style={{ color: "var(--color-endorse-600)" }}>
            {es ? "Condiciones de acceso" : "Conditions of access"}
          </p>
          {dossier.restricted.length === 0 ? (
            <p className="pmd-note mt-1.5 max-w-[58ch]">
              {es
                ? "Todavía no hay ningún valor restringido en el fichero."
                : "There are no restricted values in the file yet."}
            </p>
          ) : (
            <>
              <p className="pmd-note mt-1.5 max-w-[62ch]">
                {es
                  ? "Estos valores se rellenan en local, por coincidencia exacta, sin ninguna llamada al modelo. Nunca aparecen en un prompt enviado a Claude."
                  : "These values are filled locally, by exact match, with no model call at all. They never appear in a prompt sent to Claude."}
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {dossier.restricted.map((r) => (
                  <li key={r.key} className="pmd-data text-[12px]">
                    {r.label[lang]}
                    <span
                      className="pmd-legend pmd-legend--secondary ml-1.5 lowercase tracking-normal"
                      style={{ textTransform: "none" }}
                    >
                      {r.key}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {facts.length === 0 && answers.length === 0 && (
          <p className="pmd-note mt-8 max-w-[54ch]">
            {es
              ? "El fichero está vacío. Nada se puede rellenar ni redactar hasta que haya algo aquí: empieza por el folio 01."
              : "The file is empty. Nothing can be filled or drafted until there is something here - start at folio 01."}
          </p>
        )}

        {facts.length > 0 && (
          <div className="mt-9">
            <p className="pmd-legend mb-4">
              {es ? "Datos inscritos" : "Recorded facts"} · {facts.length}
            </p>
            <div className="grid gap-x-10 gap-y-7 lg:grid-cols-2">
              {groupFacts({ ...(profile as Profile), facts }).map(({ group, facts: rows }) => (
                <section key={group}>
                  <h3 className="pmd-legend">
                    {GROUP_TITLES[group]?.es ?? group}
                    <span className="pmd-legend--secondary">
                      {" · "}
                      {GROUP_TITLES[group]?.en ?? group}
                    </span>
                  </h3>
                  <dl className="mt-2.5">
                    {rows.map((fact) => (
                      <div
                        key={fact.key}
                        className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-x-4 py-2"
                        style={{ borderTop: "1px solid var(--color-laminate-200)" }}
                      >
                        <dt
                          className="pmd-legend pmd-legend--secondary"
                          style={{ textTransform: "none", letterSpacing: "0.02em" }}
                        >
                          {fact.label}
                        </dt>
                        <dd className="pmd-data min-w-0 break-words text-[12.5px]">
                          {fact.value}
                          {withheld.has(fact.key) && (
                            <span
                              className="pmd-legend ml-2 align-middle"
                              style={{ color: "var(--color-endorse-600)" }}
                            >
                              {es ? "no se transmite" : "not transmitted"}
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </div>
        )}

        {answers.length > 0 && (
          <div className="mt-10">
            <p className="pmd-legend mb-4">
              {es ? "Respuestas redactadas" : "Written answers"} · {answers.length}
            </p>
            <div className="grid gap-5">
              {answers.map((answer) => (
                <section
                  key={answer.id}
                  className="pt-4"
                  style={{ borderTop: "1px solid var(--color-laminate-200)" }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
                    <h3
                      className="pmd-legend"
                      style={{ textTransform: "none", letterSpacing: "0.03em" }}
                    >
                      {answer.canonicalKey}
                    </h3>
                    <span className="pmd-legend pmd-legend--secondary tabular-nums">
                      {answer.language.toUpperCase()} · {answer.genre.replace(/_/g, " ")} ·{" "}
                      {WRITTEN.format(new Date(answer.writtenAt))} ·{" "}
                      {es ? "usada" : "used"} {answer.useCount}×
                    </span>
                  </div>
                  {answer.askedAs.length > 0 && (
                    <ul className="mt-1.5">
                      {answer.askedAs.map((q) => (
                        <li
                          key={q}
                          className="pmd-legend pmd-legend--secondary"
                          style={{ textTransform: "none", letterSpacing: "0.02em" }}
                        >
                          &ldquo;{q}&rdquo;
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="pmd-prose mt-2.5 max-w-[68ch] whitespace-pre-wrap">
                    {answer.text}
                  </p>
                </section>
              ))}
            </div>
          </div>
        )}

        {fetchedAt && (
          <p className="pmd-legend pmd-legend--secondary mt-10 max-w-[62ch] normal-case tracking-[0.02em] leading-relaxed">
            {es ? "Copia local leída el" : "Local mirror read"}{" "}
            {new Date(fetchedAt).toLocaleString(es ? "es-ES" : "en-GB")}.{" "}
            {es
              ? "Rellenar campos usa esta copia, así que sigue funcionando con el proceso parado."
              : "Field filling reads this copy, so it keeps working with the process stopped."}
          </p>
        )}
      </div>
    </article>
  );
}
