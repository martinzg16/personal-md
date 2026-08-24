/**
 * One field on a page of the document.
 *
 * The dual-language legend is not a flourish. `interview.ts` has stored every
 * label as an `{en, es}` pair since long before this redesign, because the tool
 * has to match a field label on a Spanish government form and on an English ATS
 * with the same fact - and a data page prints both languages for every field by
 * construction. The two fit exactly, which is why there is no language toggle on
 * the labels: both are always printed.
 *
 * Most fields are no longer typed. Where the answer space is bounded, this
 * renders the control an official form has always used for the job: a row of
 * boxes you mark, with the option's clave printed beside it. That is not a
 * costume - it is the fastest way to answer "notice period" and it cannot be
 * misspelled. What stays typed is what genuinely varies: a name, an employer, a
 * metric, a number. Nothing here can be a paragraph; the catalogue's types make
 * a textarea impossible and cap every free line.
 *
 * A withheld value gets an endorsement rather than a pill: a dashed rule under
 * the field in the archival violet, and the field's key listed under
 * OBSERVACIONES on the same page. A document states its conditions; it does not
 * tag them.
 *
 * The ink matters and it was wrong once. This was vermilion, the same ink as the
 * INCOMPLETO endorsement, which made the most reassuring fact on the page - that
 * this value never leaves the machine - look like a failed validation on a field
 * nobody had filled in yet. Vermilion means a limitation on the document; violet
 * means a condition of access.
 */

import type { InterviewFact } from "@personal-md/core";

/**
 * Multi-select values live in one string, because a Fact holds one string and
 * changing that would change the file format. Comma-and-space, which is also
 * how a person would write the same answer into a form by hand.
 */
export const MULTI_SEPARATOR = ", ";

export const splitMulti = (value: string): string[] =>
  value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

export const joinMulti = (parts: readonly string[]): string => parts.join(MULTI_SEPARATOR);

/** How wide the ruled line should be, from the length of answer it expects. */
function widthFor(fact: InterviewFact): React.CSSProperties | undefined {
  if (fact.input === "number") return { maxWidth: "7ch" };
  if (fact.input === "tel") return { maxWidth: "20ch" };
  if (fact.input !== "text" || !fact.maxLength) return undefined;
  // Past about thirty characters the field is prose-shaped and wants the room;
  // below it, the width is information about what the answer should be.
  if (fact.maxLength > 30) return undefined;
  return { maxWidth: `${fact.maxLength + 2}ch` };
}

function Legend({ fact }: { fact: InterviewFact }) {
  return (
    <>
      <span className="pmd-legend block">{fact.label.es}</span>
      <span className="pmd-legend pmd-legend--secondary block">{fact.label.en}</span>
    </>
  );
}

function Help({
  fact,
  id,
  lang,
  restricted,
}: {
  fact: InterviewFact;
  id: string;
  lang: "es" | "en";
  restricted: boolean;
}) {
  if (!fact.help && !restricted) return null;
  return (
    <div className="mt-1.5 flex items-start justify-between gap-3">
      {fact.help ? (
        <span id={id} className="pmd-note max-w-[46ch]" style={{ fontSize: "11.5px" }}>
          {fact.help[lang]}
        </span>
      ) : (
        <span />
      )}
      {restricted && (
        <span
          className="pmd-legend shrink-0 whitespace-nowrap"
          style={{ color: "var(--color-stamp-violet)" }}
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
  );
}

/**
 * A row of marked boxes.
 *
 * Radios and checkboxes both, depending on whether one answer or several are
 * allowed - and both are the real controls underneath, hidden, with the box
 * drawn by the stylesheet. That keeps arrow-key behaviour, the label
 * association, the form semantics and the screen-reader announcement, and only
 * takes over the drawing. A native radio on this page would be the one piece of
 * operating-system furniture inside a printed document.
 */
function Boxes({
  fact,
  value,
  lang,
  onChange,
}: {
  fact: InterviewFact;
  value: string;
  lang: "es" | "en";
  onChange: (value: string) => void;
}) {
  const name = `f-${fact.key.replace(/\./g, "-")}`;
  const multi = fact.input === "multi";
  const chosen = multi ? splitMulti(value) : value.trim() ? [value.trim()] : [];
  const options = fact.options ?? [];
  const atCap = multi && fact.max !== undefined && chosen.length >= fact.max;

  const toggle = (label: string) => {
    if (!multi) {
      // Marking the box that is already marked clears it. Nothing in this
      // interview is required, so every answer has to be retractable without
      // hunting for a "clear" control.
      onChange(chosen[0] === label ? "" : label);
      return;
    }
    if (chosen.includes(label)) {
      onChange(joinMulti(chosen.filter((c) => c !== label)));
      return;
    }
    if (atCap) return;
    onChange(joinMulti([...chosen, label]));
  };

  /*
   * Short options flow; long ones stack.
   *
   * A row of four notice periods reads best wrapped, and it is why these are
   * boxes and not a dropdown. But the register picker's options are whole
   * sentences, and wrapping put two of the three on one line - which asks the
   * reader to work out where one sentence ends and the next begins, on the one
   * page whose entire job is comparing three sentences.
   */
  const stacked = options.some((o) => o.label[lang].length > 40);

  return (
    <div role={multi ? "group" : "radiogroup"} aria-label={fact.label[lang]}>
      <div
        className={
          stacked
            ? "mt-1 flex flex-col gap-y-0.5"
            : "mt-1 flex flex-wrap gap-x-6 gap-y-0.5"
        }
      >
        {options.map((option) => {
          const label = option.label[lang];
          const marked = chosen.includes(label);
          const blocked = !marked && atCap;
          return (
            <label
              key={option.code}
              className={`pmd-mark-option ${blocked ? "cursor-not-allowed" : ""}`}
              style={{ opacity: blocked ? 0.45 : 1 }}
            >
              <input
                type={multi ? "checkbox" : "radio"}
                name={name}
                className="pmd-mark-check"
                checked={marked}
                disabled={blocked}
                onChange={() => toggle(label)}
              />
              <span className="pmd-mark-box" aria-hidden="true">
                <span className="pmd-mark-code">{option.code}</span>
              </span>
              <span className="pmd-mark-label">{label}</span>
            </label>
          );
        })}
      </div>

      {multi && fact.max !== undefined && (
        <p className="pmd-legend pmd-legend--secondary mt-2 tabular-nums">
          {chosen.length} / {fact.max}{" "}
          {lang === "es" ? "como máximo" : "at most"}
        </p>
      )}
    </div>
  );
}

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

  if (fact.input === "choice" || fact.input === "multi") {
    return (
      <div className="min-w-0">
        <div>
          <Legend fact={fact} />
        </div>
        <Boxes fact={fact} value={value} lang={lang} onChange={onChange} />
        <Help fact={fact} id={helpId ?? ""} lang={lang} restricted={restricted} />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block">
        <Legend fact={fact} />
      </label>

      <input
        id={id}
        type={fact.input}
        value={value}
        placeholder={fact.placeholder}
        maxLength={fact.maxLength}
        /*
         * A short value gets a short field.
         *
         * Full width, a number field was an empty rule running the width of the
         * page with nothing in it - it read as a rendering fault rather than as
         * somewhere to put "6". A field on a paper form is as wide as the answer
         * it expects, so the rule is sized from the cap the catalogue declares
         * and only a genuinely long value gets the full measure.
         */
        style={widthFor(fact)}
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

      <Help fact={fact} id={helpId ?? ""} lang={lang} restricted={restricted} />
    </div>
  );
}
