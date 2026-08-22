/**
 * A data page.
 *
 * The identity section is the data page proper: the portrait window on the left,
 * the ruled field grid on the right, the machine-readable line along the base.
 * The other three sections are the same page without the window and the line,
 * because a passport has one data page and repeating its furniture on four of
 * them would turn the layout into wallpaper.
 *
 * Every section still saves on its own, which was true before this redesign and
 * had to survive it: closing the tab halfway through loses nothing. What changed
 * is that saving now stamps the page.
 */

import { useState } from "react";

import { classifyEgress, type InterviewSection } from "@personal-md/core";

import Field from "./Field.tsx";
import Mrz from "./Mrz.tsx";
import Stamp from "./Stamp.tsx";
import { Band, Rosette } from "./Guilloche.tsx";
import type { Dossier } from "../../lib/document/dossier.ts";
import { AUTHORITY, DOC_CODE, type Mrz as MrzValue } from "../../lib/document/mrz.ts";

const YMD = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** The document's own header block: type, authority, number. Printed, not typed. */
function Header({ dossier }: { dossier: Dossier }) {
  const cell = (label: [string, string], value: string) => (
    <div>
      <span className="pmd-legend block">{label[0]}</span>
      <span className="pmd-legend pmd-legend--secondary block">{label[1]}</span>
      <span className="pmd-data mt-0.5 block text-[13px]">{value}</span>
    </div>
  );

  return (
    <div className="flex flex-wrap items-start gap-x-9 gap-y-4">
      {cell(["Tipo", "Type"], DOC_CODE)}
      {cell(["Autoridad", "Authority"], AUTHORITY)}
      {cell(["N.º de documento", "Document no."], dossier.number)}
      {cell(
        ["Revisado", "Revised"],
        dossier.revisedAt ? YMD.format(dossier.revisedAt).toUpperCase() : "—",
      )}
    </div>
  );
}

export default function DataPage({
  section,
  primary,
  folio,
  values,
  withheld,
  dossier,
  mrz,
  lang,
  dirty,
  saving,
  savedAt,
  justStamped,
  onChange,
  onSave,
}: {
  section: InterviewSection;
  /** True for the identity section: the page that carries the window and the MRZ. */
  primary: boolean;
  folio: string;
  values: Record<string, string>;
  withheld: Set<string>;
  dossier: Dossier;
  mrz: MrzValue;
  lang: "es" | "en";
  dirty: boolean;
  saving: boolean;
  /** When this section's facts were last written, from the file. */
  savedAt: Date | null;
  justStamped: boolean;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
}) {
  // Which field the MRZ should highlight. Only the identity page has a line to
  // highlight, so this is inert elsewhere.
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <article className="pmd-page pmd-page-in overflow-hidden">
      {/* The guilloche band along the head of the page. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-14 overflow-hidden opacity-70">
        <Band seed={dossier.holder ?? ""} width={1000} height={56} />
      </div>

      <div className="relative px-7 pb-8 pt-10 sm:px-10 sm:pb-10 sm:pt-12">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="pmd-legend pmd-legend--secondary tabular-nums">
              {lang === "es" ? "Folio" : "Folio"} {folio}
            </p>
            <h2
              className="mt-1.5 font-sans leading-none"
              style={{
                fontSize: "clamp(21px, 3.1vw, 29px)",
                fontWeight: 700,
                fontStretch: "104%",
                letterSpacing: "0.005em",
              }}
            >
              {section.title.es}
            </h2>
            <p
              className="mt-1 font-sans text-[13px]"
              style={{ color: "var(--color-intaglio-500)", fontStretch: "96%" }}
            >
              {section.title.en}
            </p>
          </div>

          {savedAt && (
            <Stamp
              title={lang === "es" ? "Inscrito" : "Recorded"}
              date={savedAt}
              seed={section.id}
              press={justStamped}
              className="mt-1 shrink-0"
            />
          )}
        </div>

        <p
          className="pmd-note mt-5 max-w-[58ch]"
        >
          {section.blurb[lang]}
        </p>

        <div
          className="my-7 h-px"
          style={{ background: "var(--color-laminate-200)" }}
        />

        {primary ? (
          <div className="grid gap-8 lg:grid-cols-[168px_minmax(0,1fr)]">
            {/* The portrait window. There is no photograph, and inventing one
                would be the first lie on the page - so the window holds the
                rosette generated from the holder's own name, and says so. */}
            <div className="lg:pt-1">
              <div
                className="relative flex aspect-[3/4] w-[168px] items-center justify-center overflow-hidden lg:w-full"
                style={{
                  borderRadius: "var(--radius-window)",
                  background:
                    "linear-gradient(158deg, var(--color-laminate-100), var(--color-laminate-050))",
                  boxShadow: "inset 0 0 0 1px var(--color-laminate-200)",
                }}
              >
                <Rosette seed={dossier.holder ?? ""} size={200} className="opacity-95" />
                {/* The ghost image: the same mark again, small, faint, in the
                    corner - the secondary portrait a data page carries. */}
                <div className="absolute bottom-1.5 right-1.5 opacity-30">
                  <Rosette seed={dossier.holder ?? ""} size={42} />
                </div>
              </div>
              <p className="pmd-legend pmd-legend--secondary mt-2 normal-case tracking-[0.02em] leading-snug">
                {lang === "es"
                  ? "Marca generada a partir de tu nombre. No hay fotografía en este documento."
                  : "Mark generated from your name. There is no photograph in this document."}
              </p>
            </div>

            <div className="min-w-0">
              <Header dossier={dossier} />
              <div
                className="my-6 h-px"
                style={{ background: "var(--color-laminate-200)" }}
              />
              <div className="grid gap-x-9 gap-y-6 sm:grid-cols-2">
                {section.facts.map((fact) => (
                  <Field
                    key={fact.key}
                    fact={fact}
                    value={values[fact.key] ?? ""}
                    restricted={withheld.has(fact.key) || classifyEgress(fact.key) === "never"}
                    lang={lang}
                    onChange={(value) => onChange(fact.key, value)}
                    onFocus={() => setFocused(fact.key)}
                    onBlur={() => setFocused(null)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-x-9 gap-y-6 sm:grid-cols-2">
            {section.facts.map((fact) => (
              <Field
                key={fact.key}
                fact={fact}
                value={values[fact.key] ?? ""}
                restricted={withheld.has(fact.key) || classifyEgress(fact.key) === "never"}
                lang={lang}
                onChange={(value) => onChange(fact.key, value)}
                onFocus={() => setFocused(fact.key)}
                onBlur={() => setFocused(null)}
              />
            ))}
          </div>
        )}

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <button
            className="pmd-action pmd-action--primary"
            disabled={!dirty || saving}
            onClick={onSave}
          >
            {saving
              ? lang === "es"
                ? "Inscribiendo…"
                : "Recording…"
              : lang === "es"
                ? "Inscribir esta página"
                : "Record this page"}
          </button>
          <span className="pmd-legend pmd-legend--secondary normal-case tracking-[0.02em]">
            {dirty
              ? lang === "es"
                ? "Hay cambios sin inscribir en esta página."
                : "This page has unrecorded changes."
              : lang === "es"
                ? "Esta página está al día. Cada folio se inscribe por separado."
                : "This page is up to date. Each folio is recorded on its own."}
          </span>
        </div>

        {primary && (
          <div className="mt-10">
            <Mrz mrz={mrz} highlight={focused} lang={lang} />
          </div>
        )}
      </div>
    </article>
  );
}
