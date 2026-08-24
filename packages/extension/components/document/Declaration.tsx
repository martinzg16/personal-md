/**
 * A declaration: one recurring open question, answered by pointing at things.
 *
 * This replaces the page that asked for 100-180 words in a textarea. The
 * question at the top is unchanged and deliberately so - it is still the thing
 * an employer will ask, and it is still the canonical key an answer files
 * under - but underneath it there is no longer a blank box. There are atoms:
 * the specifics a draft cannot invent, each collected with the narrowest control
 * that fits.
 *
 * The page is honest about the trade. It says what it will do with the atoms and
 * it does not pretend an answer already exists: a declaration is material, and
 * the prose gets written later, over the actual form, where the question's real
 * wording and its length limit are known. That was always the better moment to
 * write it - the old flow asked people to guess the wording in advance and then
 * rewrite it anyway.
 *
 * A derived declaration asks nothing at all. `experience.relevant_background` -
 * "tell us about yourself" - is assembled from the role, the years, the sector
 * and the education already on file, so the page says so and moves on. An asked
 * question whose answer the profile already holds is the most expensive kind.
 */

import { classifyEgress, declarationProgress, type InterviewDeclaration, type Lang } from "@personal-md/core";

import Field from "./Field.tsx";
import Stamp from "./Stamp.tsx";
import { Band } from "./Guilloche.tsx";

export default function Declaration({
  declaration,
  folio,
  values,
  withheld,
  lang,
  seed,
  dirty,
  saving,
  savedAt,
  justStamped,
  onChange,
  onSave,
}: {
  declaration: InterviewDeclaration;
  folio: string;
  values: Record<string, string>;
  withheld: Set<string>;
  lang: Lang;
  /** The holder's name, for the page's own guilloche band. */
  seed: string;
  dirty: boolean;
  saving: boolean;
  savedAt: Date | null;
  justStamped: boolean;
  onChange: (key: string, value: string) => void;
  onSave: () => void;
}) {
  const es = lang === "es";
  const progress = declarationProgress(declaration, (key) => (values[key] ?? "").trim() !== "");

  return (
    <article className="pmd-page pmd-page-in overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-11 overflow-hidden opacity-60">
        <Band seed={`${seed}:${declaration.canonicalKey}`} width={1000} height={44} />
      </div>

      <div className="relative px-7 pb-9 pt-10 sm:px-10 sm:pb-11 sm:pt-12">
        <p
          className="pmd-legend pmd-legend--secondary absolute right-7 top-5 tabular-nums sm:right-10 sm:top-6"
          aria-label={`Folio ${folio}`}
        >
          Folio {folio}
        </p>

        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h2
              className="max-w-[30ch] font-sans leading-[1.08]"
              style={{
                fontSize: "clamp(22px, 3.4vw, 33px)",
                fontWeight: 700,
                fontStretch: "102%",
              }}
            >
              {declaration.prompt[lang]}
            </h2>
          </div>

          {savedAt && !declaration.derived && (
            <Stamp
              title={es ? "Declarado" : "Declared"}
              date={savedAt}
              seed={declaration.canonicalKey}
              press={justStamped}
              className="mt-2 shrink-0 origin-top-right scale-[1.2]"
            />
          )}
        </div>

        <p className="pmd-note mt-5 max-w-[58ch]">{declaration.why[lang]}</p>

        {declaration.derived ? (
          <div
            className="mt-7 py-4"
            style={{
              borderTop: "1px solid var(--color-laminate-200)",
              borderBottom: "1px solid var(--color-laminate-200)",
            }}
          >
            <p className="pmd-legend" style={{ color: "var(--color-stamp-green)" }}>
              {es ? "No hay nada que declarar" : "Nothing to declare"}
            </p>
            <p className="pmd-note mt-1.5 max-w-[58ch]">
              {es
                ? "Esta respuesta se monta con lo que ya has puesto en los folios 01 a 04. Si los has rellenado, esta página está hecha."
                : "This answer is assembled from what you already put on folios 01 to 04. If those are filled in, this page is done."}
            </p>
          </div>
        ) : (
          <>
            <div className="my-7 h-px" style={{ background: "var(--color-laminate-200)" }} />

            {/*
              Two columns, with the tap rows spanning both.
              A row of options needs the full measure or it wraps into a ragged
              block; a short answer does not, and stacking those full width made
              "from" and "to" read as two unrelated rules a hundred pixels apart
              instead of as the pair they are.
            */}
            <div className="grid gap-x-9 gap-y-7 sm:grid-cols-2">
              {declaration.atoms.map((atom) => {
                const wide = atom.input === "choice" || atom.input === "multi";
                return (
                  <div key={atom.key} className={wide ? "sm:col-span-2" : undefined}>
                    <Field
                      fact={atom}
                      value={values[atom.key] ?? ""}
                      restricted={withheld.has(atom.key) || classifyEgress(atom.key) === "never"}
                      lang={lang}
                      onChange={(value) => onChange(atom.key, value)}
                      onFocus={() => undefined}
                      onBlur={() => undefined}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <button
                className="pmd-action pmd-action--primary"
                disabled={!dirty || saving}
                onClick={onSave}
              >
                {saving
                  ? es
                    ? "Sellando…"
                    : "Stamping…"
                  : es
                    ? "Sellar la página"
                    : "Stamp the page"}
              </button>
              <span className="pmd-legend pmd-legend--secondary tabular-nums">
                {progress.held}/{progress.total}{" "}
                {es ? "casillas" : "boxes"}
              </span>
              {dirty && (
                <span className="pmd-legend pmd-legend--secondary normal-case tracking-[0.02em]">
                  {es
                    ? "Hay cambios sin sellar en esta página."
                    : "This page has unstamped changes."}
                </span>
              )}
            </div>

            <p className="pmd-note mt-7 max-w-[62ch]" style={{ fontSize: "12px" }}>
              {es
                ? "Con esto no se escribe la respuesta todavía. Se redacta cuando un formulario haga la pregunta de verdad, con su redacción y su límite de caracteres, usando estos datos y lo que ya has escrito en otro sitio."
                : "This does not write the answer yet. It gets drafted when a form actually asks the question, in its own wording and within its own character limit, from these facts and from what you have already written elsewhere."}
            </p>
          </>
        )}
      </div>
    </article>
  );
}
