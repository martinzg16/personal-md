/**
 * A visa page: one open question.
 *
 * The eight open questions are the ones worth writing properly - they get reused
 * verbatim and they are what teaches the tool how this person writes - so each
 * gets a whole page rather than a card in a stack of eight. A page you have
 * written on carries its stamp afterwards, at a fixed angle derived from the
 * question's canonical key, the way a used visa page does.
 *
 * The prose is set in Literata, which appears nowhere else on the surface. That
 * is the surface's one typographic rule you can read without being told: the
 * machine face is for what a machine reads, and this face is for the person
 * talking.
 */

import { useState } from "react";

import type { InterviewQuestion, Lang } from "@personal-md/core";

import Stamp from "./Stamp.tsx";
import { Band } from "./Guilloche.tsx";

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function VisaPage({
  question,
  folio,
  initial,
  writtenAt,
  lang,
  seed,
  onSave,
}: {
  question: InterviewQuestion;
  folio: string;
  initial: string;
  writtenAt: Date | null;
  lang: Lang;
  /** The holder's name, for the page's own guilloche band. */
  seed: string;
  onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [pressed, setPressed] = useState(false);

  const words = wordCount(text);
  const over = words > question.suggestedWords * 1.6;
  const dirty = text.trim() !== initial.trim();

  const save = async () => {
    setSaving(true);
    try {
      await onSave(text);
      // The press plays only on a stamp that just landed, never on a re-render.
      setPressed(true);
    } catch {
      /* The error is surfaced by the parent, which owns the message. */
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="pmd-page pmd-page-in overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-11 overflow-hidden opacity-60">
        <Band seed={`${seed}:${question.canonicalKey}`} width={1000} height={44} />
      </div>

      <div className="relative px-7 pb-9 pt-10 sm:px-10 sm:pb-11 sm:pt-12">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="pmd-legend pmd-legend--secondary tabular-nums">
              Folio {folio}
            </p>
            <p className="pmd-legend mt-2">
              {lang === "es" ? "Pregunta" : "Question"}
            </p>
            <h2
              className="mt-1 max-w-[30ch] font-sans leading-[1.08]"
              style={{
                fontSize: "clamp(22px, 3.4vw, 33px)",
                fontWeight: 700,
                fontStretch: "102%",
              }}
            >
              {question.prompt[lang]}
            </h2>
          </div>

          {writtenAt && (
            <Stamp
              title={lang === "es" ? "Redactado" : "Written"}
              date={writtenAt}
              seed={question.canonicalKey}
              press={pressed}
              // Scaled up, because at chip size a stamp reads as a status badge
              // and the whole point of it is that it reads as an impression.
              className="mt-2 shrink-0 origin-top-right scale-[1.2]"
            />
          )}
        </div>

        <p
          className="pmd-note mt-5 max-w-[56ch]"
        >
          {question.why[lang]}
        </p>

        <div className="my-7 h-px" style={{ background: "var(--color-laminate-200)" }} />

        <label className="block">
          <span className="pmd-legend block">
            {lang === "es" ? "Con tus palabras" : "In your own words"}
          </span>
          <span className="pmd-legend pmd-legend--secondary block">
            {lang === "es" ? "In your own words" : "Con tus palabras"}
          </span>
          <textarea
            className="pmd-prose mt-2"
            rows={9}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPressed(false);
            }}
            placeholder={
              lang === "es"
                ? "Escríbelo como lo dirías en voz alta."
                : "Write it the way you would say it out loud."
            }
          />
        </label>

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4">
          <span
            className="pmd-legend tabular-nums"
            style={{ color: over ? "var(--color-endorse-600)" : undefined }}
          >
            {words} {lang === "es" ? "palabras" : "words"}
            <span className="pmd-legend--secondary">
              {" "}
              / ~{question.suggestedWords} {lang === "es" ? "sugeridas" : "suggested"}
            </span>
          </span>

          <span className="flex items-center gap-3">
            {initial.trim() && !dirty && (
              <span className="pmd-legend pmd-legend--secondary">
                {lang === "es" ? "Está en el fichero" : "On file"}
              </span>
            )}
            <button
              className="pmd-action pmd-action--primary"
              disabled={!dirty || saving || !text.trim()}
              onClick={() => void save()}
            >
              {saving
                ? lang === "es"
                  ? "Sellando…"
                  : "Stamping…"
                : lang === "es"
                  ? "Sellar la página"
                  : "Stamp the page"}
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}
