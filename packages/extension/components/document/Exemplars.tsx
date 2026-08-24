/**
 * The voice page: where drafts learn how you write.
 *
 * Removing every textarea removed something real, and this page is where that
 * debt is paid rather than hidden. Prose served two purposes in the old
 * interview: it was material, and it was an exemplar of how this person writes.
 * The atoms replaced the material. Nothing replaces an exemplar except an
 * exemplar - so instead of asking anybody to write one, the tool reads one they
 * already wrote.
 *
 * That import already exists end to end: the content script recognises your own
 * LinkedIn profile, reads the rendered page, and the server maps it into a
 * proposal you confirm row by row. It was reachable from nowhere. This page is
 * the front door to it, and it is honest that the reading happens over there -
 * an options page cannot see linkedin.com, and pretending otherwise with a paste
 * box would just be a textarea wearing a different hat.
 *
 * Under it, the one thing that can be asked in a tap: which of three sentences
 * sounds most like you. It buys register, not phrasing, and the page says so.
 */

import { REGISTER_FACT, type Answer, type Lang } from "@personal-md/core";

import Field from "./Field.tsx";
import Stamp from "./Stamp.tsx";

const WRITTEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const words = (text: string): number => (text.trim() ? text.trim().split(/\s+/).length : 0);

export default function Exemplars({
  answers,
  register,
  lang,
  savedAt,
  justStamped,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  /** Prose on file, whatever its origin: imported, or a draft you accepted. */
  answers: readonly Answer[];
  register: string;
  lang: Lang;
  savedAt: Date | null;
  justStamped: boolean;
  dirty: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const es = lang === "es";
  const held = answers.filter((a) => a.text.trim());
  const totalWords = held.reduce((n, a) => n + words(a.text), 0);

  return (
    <article className="pmd-page pmd-page-in">
      <div className="relative px-7 pb-10 pt-10 sm:px-10 sm:pb-12 sm:pt-12">
        <p className="pmd-legend pmd-legend--secondary absolute right-7 top-5 sm:right-10 sm:top-6">
          {es ? "Voz · Voice" : "Voz · Voice"}
        </p>

        <div className="flex items-start justify-between gap-6">
          <h2
            className="max-w-[26ch] font-sans leading-none"
            style={{ fontSize: "clamp(21px, 3.1vw, 29px)", fontWeight: 700, fontStretch: "104%" }}
          >
            {es ? "Cómo escribes tú" : "How you write"}
          </h2>
          {register.trim() && (
            <Stamp
              title={es ? "Registrado" : "Registered"}
              date={savedAt}
              seed="voice.register"
              press={justStamped}
              className="mt-1 shrink-0"
            />
          )}
        </div>

        <p className="pmd-note mt-4 max-w-[60ch]">
          {es
            ? "Una redacción puede montar los hechos que has declarado, pero no puede adivinar cómo hablas. Para eso hace falta algo que hayas escrito tú - y lo más rápido no es escribirlo otra vez, es traer lo que ya existe."
            : "A draft can assemble the facts you declared, but it cannot guess how you talk. That needs something you actually wrote - and the fastest way to get it is not writing it again, it is bringing across what already exists."}
        </p>

        {/* -------------------------------------------------- what is on file */}
        <div
          className="mt-7 py-4"
          style={{
            borderTop: "1px solid var(--color-laminate-200)",
            borderBottom: "1px solid var(--color-laminate-200)",
          }}
        >
          <p
            className="pmd-legend"
            style={{
              color: held.length
                ? "var(--color-stamp-green)"
                : "var(--color-stamp-violet)",
            }}
          >
            {es ? "Muestras en el fichero" : "Samples on file"}
          </p>

          {held.length === 0 ? (
            <p className="pmd-note mt-1.5 max-w-[58ch]">
              {es
                ? "Ninguna todavía. Las redacciones saldrán correctas y algo genéricas hasta que haya al menos una."
                : "None yet. Drafts will come back accurate and a little generic until there is at least one."}
            </p>
          ) : (
            <>
              <p className="pmd-data mt-1.5">
                {held.length}{" "}
                {es
                  ? held.length === 1
                    ? "muestra"
                    : "muestras"
                  : held.length === 1
                    ? "sample"
                    : "samples"}{" "}
                · {totalWords.toLocaleString(es ? "es-ES" : "en-GB")}{" "}
                {es ? "palabras" : "words"}
              </p>
              <ul className="mt-3 grid gap-1.5">
                {held.map((answer) => (
                  <li key={answer.id} className="flex flex-wrap items-baseline gap-x-3">
                    <span
                      className="pmd-legend pmd-legend--secondary"
                      style={{ textTransform: "none", letterSpacing: "0.03em" }}
                    >
                      {answer.canonicalKey}
                    </span>
                    <span className="pmd-legend pmd-legend--secondary tabular-nums">
                      {answer.language.toUpperCase()} · {words(answer.text)}{" "}
                      {es ? "palabras" : "words"} ·{" "}
                      {WRITTEN.format(new Date(answer.writtenAt))}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* --------------------------------------------------------- the import */}
        <div className="mt-8">
          <p className="pmd-legend">
            {es ? "Traer lo que ya escribiste" : "Bring across what you already wrote"}
          </p>
          <ol className="mt-2.5 grid max-w-[60ch] gap-2">
            {[
              es
                ? "Abre tu propio perfil de LinkedIn en otra pestaña."
                : "Open your own LinkedIn profile in another tab.",
              es
                ? "El panel de personal.md aparece abajo a la derecha y ofrece leer la página."
                : "The personal.md panel appears bottom right and offers to read the page.",
              es
                ? "Revisas fila por fila lo que propone y confirmas lo que quieras. No se guarda nada sin un clic."
                : "You review what it proposes row by row and confirm what you want. Nothing is stored without a click.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="pmd-data shrink-0 text-[12px]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="pmd-note">{step}</span>
              </li>
            ))}
          </ol>
          <p className="pmd-note mt-3.5 max-w-[60ch]" style={{ fontSize: "12px" }}>
            {es
              ? "Se lee la página que tú ya tienes abierta, en tu sesión. No hay credencial guardada, no se pide nada a LinkedIn por nuestra cuenta, y se niega a leer un perfil que no sea el tuyo."
              : "It reads the page you already have open, in your own session. There is no stored credential, nothing is requested from LinkedIn on our initiative, and it refuses to read a profile that is not yours."}
          </p>
        </div>

        {/* -------------------------------------------------------- the register */}
        <div className="mt-9 border-t pt-7" style={{ borderColor: "var(--color-laminate-200)" }}>
          <Field
            fact={REGISTER_FACT}
            value={register}
            restricted={false}
            lang={lang}
            onChange={onChange}
            onFocus={() => undefined}
            onBlur={() => undefined}
          />

          <div className="mt-7 flex flex-wrap items-center gap-4">
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
            <span className="pmd-legend pmd-legend--secondary normal-case tracking-[0.02em]">
              {es
                ? "Orienta el registro de las redacciones. No copia tus frases."
                : "Steers the register of drafts. It does not copy your phrasing."}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
