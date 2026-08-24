/**
 * One field on the data page.
 *
 * The dual-language legend is not a flourish. `interview.ts` has stored every
 * label as an `{en, es}` pair since long before this redesign, because the tool
 * has to match a field label on a Spanish government form and on an English ATS
 * with the same fact - and a data page prints both languages for every field by
 * construction. The two things fit exactly, which is why the language toggle that
 * used to swap these labels is gone: both are always printed, and the remaining
 * choice is only which language the user writes their prose in.
 *
 * A withheld value gets an endorsement rather than a pill: a dashed vermilion
 * rule under the field, and the field's key listed under OBSERVACIONES on the
 * same page. A document states its conditions; it does not tag them.
 */

import type { InterviewFact } from "@personal-md/core";

export default function Field({
  fact,
  value,
  restricted,
  lang,
  onChange,
  onFocus,
  onBlur,
}: {
  fact: InterviewFact;
  value: string;
  restricted: boolean;
  lang: "es" | "en";
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const id = `f-${fact.key.replace(/\./g, "-")}`;
  const helpId = fact.help ? `${id}-help` : undefined;

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block">
        <span className="pmd-legend block">{fact.label.es}</span>
        <span className="pmd-legend pmd-legend--secondary block">{fact.label.en}</span>
      </label>

      <input
        id={id}
        type={fact.input === "textarea" ? "text" : fact.input}
        value={value}
        placeholder={fact.placeholder}
        aria-describedby={helpId}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className={[
          "pmd-field mt-1",
          restricted ? "pmd-field--endorsed" : "",
          // Caps are a display transform and never touch the stored value - but
          // an email has to read back exactly as typed, so it opts out entirely.
          fact.input === "email" ? "pmd-field--exact" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        spellCheck={false}
        autoComplete="off"
      />

      <div className="mt-1.5 flex items-start justify-between gap-3">
        {fact.help ? (
          <span
            id={helpId}
            className="pmd-legend pmd-legend--secondary max-w-[46ch] normal-case tracking-[0.02em] leading-relaxed"
          >
            {fact.help[lang]}
          </span>
        ) : (
          <span />
        )}

        {restricted && (
          <span
            className="pmd-legend shrink-0 whitespace-nowrap"
            style={{ color: "var(--color-endorse-600)" }}
            title={
              lang === "es"
                ? "Se rellena en local. Nunca se incluye en un prompt enviado a Claude."
                : "Filled locally. Never included in a prompt sent to Claude."
            }
          >
            {lang === "es" ? "No se transmite" : "Not transmitted"}
          </span>
        )}
      </div>
    </div>
  );
}
