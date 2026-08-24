/**
 * Expedición — the issuance.
 *
 * The end of onboarding, and the only place on the surface where something is
 * performed rather than operated. The document prints itself: the security
 * background draws, the legends strike, the values type in, the machine-readable
 * line runs left to right, the scope note writes itself, and the stamp lands.
 *
 * Three rules kept it from becoming a celebration screen.
 *
 * It is honest. Every line is a value the user typed or a count of them; the
 * scope note is assembled clause by clause in `dossier.ts` and a missing fact
 * drops its clause rather than being filled with something plausible. An
 * incomplete document is stamped INCOMPLETO in vermilion and told exactly which
 * fields are still empty. A sequence this persuasive, over data this personal,
 * has to be incapable of overstating what is in the file.
 *
 * It is skippable and it is replayable. The first is because nobody should have
 * to sit through six seconds twice; the second is because this is also the page
 * you come back to, so it has to be a place and not an event.
 *
 * And it ends on the finished document rather than on a "done" screen. What is on
 * screen when the sequence stops is the brief itself, and it stays there.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { Lang, Profile } from "@personal-md/core";

import Scroller from "./Scroller.tsx";
import Stamp from "./Stamp.tsx";
import { Band, Rosette } from "./Guilloche.tsx";
import { scopeNote, type Dossier } from "../../lib/document/dossier.ts";
import { encodeMrz, type Mrz } from "../../lib/document/mrz.ts";

/**
 * The stages, in the order a document is actually produced. Named rather than
 * numbered so the timeline below reads as a description of the printing.
 */
const STAGE = {
  blank: 0,
  print: 1,
  legends: 2,
  values: 3,
  zone: 4,
  note: 5,
  stamped: 6,
} as const;

type Stage = (typeof STAGE)[keyof typeof STAGE];

/** Cumulative milliseconds. Tuned against the real thing being watched, not to a grid. */
const TIMELINE: [Stage, number][] = [
  [STAGE.print, 90],
  [STAGE.legends, 1050],
  [STAGE.values, 1560],
  [STAGE.zone, 3260],
  [STAGE.note, 4620],
  [STAGE.stamped, 5460],
];

const MRZ_CHAR_MS = 13;

/** When the zone starts printing, and when the whole sequence is over. */
const ZONE_AT = TIMELINE.find(([stage]) => stage === STAGE.zone)?.[1] ?? 0;
const END = (TIMELINE.at(-1)?.[1] ?? 0) + 400;

const YMD = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** The line pair, revealed character by character from the left. */
function ZoneLines({ mrz, reveal }: { mrz: Mrz; reveal: number }) {
  const line = (value: string, offset: number) => (
    <div className="pmd-mrz">
      {[...value].map((ch, i) => (
        <span
          key={i}
          className={ch === "<" ? "pmd-mrz-filler" : undefined}
          // Hidden rather than absent, so the 44 cells never reflow as they fill.
          style={{ visibility: offset + i < reveal ? "visible" : "hidden" }}
        >
          {ch}
        </span>
      ))}
    </div>
  );

  return (
    <Scroller
      className="pmd-mrz-scroll"
      style={{ ["--mrz-size" as string]: "clamp(11px, 1.86cqw, 17px)" }}
    >
      {line(mrz.line1, 0)}
      {line(mrz.line2, mrz.line1.length)}
    </Scroller>
  );
}

/** One printed row of the brief. */
function Row({
  es,
  en,
  children,
  index,
  visible,
}: {
  es: string;
  en: string;
  children: React.ReactNode;
  index: number;
  visible: boolean;
}) {
  return (
    <div
      className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)]"
      style={{ borderTop: "1px solid var(--color-laminate-200)" }}
    >
      <div>
        <span className="pmd-legend block">{es}</span>
        <span className="pmd-legend pmd-legend--secondary block">{en}</span>
      </div>
      <div
        className={visible ? "pmd-print" : "opacity-0"}
        style={visible ? { animationDelay: `${index * 118}ms` } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export default function Issuance({
  profile,
  dossier,
  lang,
  outstandingPage,
  onGoTo,
}: {
  profile: Profile | null;
  dossier: Dossier;
  lang: Lang;
  /**
   * The page holding the first thing still missing, resolved by the caller.
   * Null when the document is complete. This used to be hard-coded to the
   * identity page, which sent the user to a finished page whenever what was
   * actually missing was on folio 03.
   */
  outstandingPage: string | null;
  onGoTo: (pageId: string) => void;
}) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  const [stage, setStage] = useState<Stage>(reduced ? STAGE.stamped : STAGE.blank);
  const [reveal, setReveal] = useState(0);
  // Bumping this re-runs the whole timeline. A key would remount the page and
  // redraw the guilloche from scratch, which is exactly what a replay wants.
  const [run, replay] = useReducer((n: number) => n + 1, 0);
  const frame = useRef(0);

  const mrz = useMemo(
    () =>
      encodeMrz({
        fullName: dossier.holder ?? "",
        language: dossier.language,
        firstRecordedAt: dossier.firstRecordedAt,
        revisedAt: dossier.revisedAt,
        facts: dossier.extent.facts,
        answers: dossier.extent.declarations,
        words: dossier.extent.words,
      }),
    [dossier],
  );

  const zoneLength = mrz.line1.length + mrz.line2.length;

  const finish = () => {
    cancelAnimationFrame(frame.current);
    setStage(STAGE.stamped);
    setReveal(zoneLength);
  };

  /*
   * One clock, read rather than scheduled.
   *
   * The first version scheduled ninety-odd `setTimeout`s - one per stage plus one
   * per character of the zone. Two things were wrong with that. A backgrounded
   * tab throttles timers to about one a second, so coming back to this tab
   * mid-sequence showed a document frozen a third of the way through printing.
   * And every frame's state was decided when the timer was created rather than
   * from the elapsed time, so nothing could ever self-correct.
   *
   * Derived from one timestamp on every frame instead, the sequence is always
   * showing the state that belongs to the time that has actually passed. A tab
   * that was hidden for a minute comes back to a finished document, which is the
   * right answer, and a slow frame no longer desynchronises the zone from the
   * rows it belongs to.
   */
  useEffect(() => {
    if (reduced) {
      setStage(STAGE.stamped);
      setReveal(zoneLength);
      return;
    }

    setStage(STAGE.blank);
    setReveal(0);

    let start = 0;
    const tick = (now: number) => {
      if (start === 0) start = now;
      const elapsed = now - start;

      let reached: Stage = STAGE.blank;
      for (const [next, at] of TIMELINE) if (elapsed >= at) reached = next;
      setStage(reached);
      setReveal(
        Math.max(0, Math.min(zoneLength, Math.floor((elapsed - ZONE_AT) / MRZ_CHAR_MS))),
      );

      if (elapsed < END) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [run, reduced, zoneLength]);

  const es = lang === "es";
  const printed = stage >= STAGE.values;
  const { extent } = dossier;

  const data = (value: string) => <span className="pmd-data">{value}</span>;

  let row = 0;

  return (
    <article className="pmd-page pmd-page-in overflow-hidden" style={{ containerType: "inline-size" }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 overflow-hidden">
        {stage >= STAGE.print && (
          <Band seed={dossier.holder ?? ""} width={1000} height={64} draw={!reduced} />
        )}
      </div>

      <div className="relative px-7 pb-10 pt-11 sm:px-10 sm:pb-12 sm:pt-14">
        <p className="pmd-legend pmd-legend--secondary absolute right-7 top-5 sm:right-10 sm:top-6">
          Expedición · Issuance
        </p>

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h2
              className="max-w-[24ch] font-sans leading-[1.02]"
              style={{
                fontSize: "clamp(26px, 4.4vw, 42px)",
                fontWeight: 700,
                fontStretch: "104%",
              }}
            >
              {dossier.holder ?? (es ? "Documento sin titular" : "Unissued document")}
            </h2>
          </div>

          {stage >= STAGE.stamped && (
            <Stamp
              title={
                dossier.complete
                  ? es
                    ? "Expedido"
                    : "Issued"
                  : es
                    ? "Incompleto"
                    : "Incomplete"
              }
              date={dossier.revisedAt}
              seed={dossier.complete ? "issued" : "incomplete"}
              ink={dossier.complete ? undefined : "endorse"}
              press
              className="mt-2 shrink-0 scale-[1.35] origin-top-right"
            />
          )}
        </div>

        <div className="mt-8 grid gap-9 lg:grid-cols-[minmax(0,1fr)_170px]">
          <div className="min-w-0">
            <Row es="Titular" en="Holder" index={row++} visible={printed}>
              {data(dossier.holder ?? "—")}
            </Row>
            <Row es="N.º de documento" en="Document no." index={row++} visible={printed}>
              {data(dossier.number)}
            </Row>
            <Row es="Idioma de redacción" en="Language of issue" index={row++} visible={printed}>
              {data(dossier.language ? dossier.language.toUpperCase() : "—")}
            </Row>
            <Row es="Primer registro" en="First recorded" index={row++} visible={printed}>
              {data(dossier.firstRecordedAt ? YMD.format(dossier.firstRecordedAt) : "—")}
            </Row>
            <Row es="Revisado" en="Revised" index={row++} visible={printed}>
              {data(dossier.revisedAt ? YMD.format(dossier.revisedAt) : "—")}
            </Row>
            <Row es="Extensión" en="Extent" index={row++} visible={printed}>
              {data(
                `${extent.facts}/${extent.factsTotal} ${es ? "datos" : "facts"} · ${extent.declarations}/${extent.declarationsTotal} ${es ? "declaraciones" : "declarations"} · ${extent.exemplars} ${es ? "muestras" : "samples"} · ${(extent.bytes / 1024).toFixed(1)} kB`,
              )}
            </Row>
            <Row es="Condiciones de acceso" en="Conditions of access" index={row++} visible={printed}>
              {dossier.restricted.length === 0 ? (
                data(es ? "Sin restricciones" : "No restrictions")
              ) : (
                <div>
                  <span className="pmd-data" style={{ color: "var(--color-stamp-violet)" }}>
                    {dossier.restricted.length}{" "}
                    {es
                      ? dossier.restricted.length === 1
                        ? "registro no se transmite"
                        : "registros no se transmiten"
                      : dossier.restricted.length === 1
                        ? "record is never transmitted"
                        : "records are never transmitted"}
                  </span>
                  <p className="pmd-legend pmd-legend--secondary mt-1.5 normal-case tracking-[0.02em]">
                    {dossier.restricted.map((r) => r.label[lang]).join(" · ")}
                  </p>
                </div>
              )}
            </Row>
            <Row es="Ámbito y contenido" en="Scope and content" index={row++} visible={printed}>
              {/* Assembled by the tool from the holder's values, so it is the
                  tool's voice and not theirs - Archivo, not the reading face. */}
              <p
                className={`pmd-note max-w-[52ch] ${stage >= STAGE.note ? "pmd-print" : "opacity-0"}`}
                style={{ color: "var(--color-intaglio-900)" }}
              >
                {scopeNote(profile, dossier, lang)}
              </p>
            </Row>
            <Row es="Depósito" en="Repository" index={row++} visible={printed}>
              <span className="pmd-data pmd-data--verbatim">~/.personal-md/PERSONAL.md</span>
            </Row>
          </div>

          <div className="lg:pt-2">
            <div
              className="relative flex aspect-[3/4] w-[170px] items-center justify-center overflow-hidden"
              style={{
                borderRadius: "var(--radius-window)",
                background:
                  "linear-gradient(158deg, var(--color-laminate-100), var(--color-laminate-050))",
                boxShadow: "inset 0 0 0 1px var(--color-laminate-200)",
              }}
            >
              {stage >= STAGE.print && (
                <Rosette seed={dossier.holder ?? ""} size={200} draw={!reduced} />
              )}
            </div>
          </div>
        </div>

        <div className="mt-9 border-t border-dashed pt-4" style={{ borderColor: "var(--color-laminate-200)" }}>
          <p className="pmd-legend pmd-legend--secondary mb-2">
            Zona de lectura mecánica · Machine-readable zone
          </p>
          <ZoneLines mrz={mrz} reveal={reveal} />
        </div>

        {/* The honest close. An incomplete document names what is missing rather
            than congratulating anybody, and hands over a way to go and fix it. */}
        {stage >= STAGE.stamped && (
          <div className="pmd-print mt-8">
            {dossier.complete ? (
              <p className="pmd-note max-w-[58ch]">
                {es
                  ? "El documento está completo. Desde ahora, cuando un formulario pregunte algo que ya has contestado, la respuesta que sale es esta - la tuya, con su procedencia."
                  : "The document is complete. From here, when a form asks something you have already answered, this is the answer that comes back - yours, with its provenance."}
              </p>
            ) : (
              <div>
                <p className="pmd-note max-w-[58ch]">
                  {es
                    ? `Quedan ${dossier.outstanding.length} ${dossier.outstanding.length === 1 ? "campo" : "campos"} sin rellenar y ${extent.declarationsTotal - extent.declarations} ${extent.declarationsTotal - extent.declarations === 1 ? "declaración" : "declaraciones"} sin sellar${extent.exemplars === 0 ? ", y ninguna muestra de tu forma de escribir" : ""}. El documento sirve igual: lo que está escrito se rellena, y los `
                    : `${dossier.outstanding.length} ${dossier.outstanding.length === 1 ? "field is" : "fields are"} still empty and ${extent.declarationsTotal - extent.declarations} ${extent.declarationsTotal - extent.declarations === 1 ? "declaration is" : "declarations are"} unstamped${extent.exemplars === 0 ? ", and there is no sample of how you write" : ""}. The document works anyway: what is written gets filled, and the `}
                  <code className="font-mono text-[12.5px]">&lt;</code>
                  {es
                    ? " de la zona de lectura son exactamente lo que falta."
                    : " in the machine-readable zone are exactly what is missing."}
                </p>
                {dossier.outstanding.length > 0 && (
                  <p className="pmd-note mt-3 max-w-[64ch]" style={{ fontSize: "12.5px" }}>
                    {dossier.outstanding
                      .slice(0, 8)
                      .map((f) => f.label[lang])
                      .join(" · ")}
                    {dossier.outstanding.length > 8 &&
                      ` · +${dossier.outstanding.length - 8}`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {stage < STAGE.stamped ? (
            <button className="pmd-action pmd-action--quiet" onClick={finish}>
              {es ? "Saltar" : "Skip"}
            </button>
          ) : (
            <>
              <button className="pmd-action pmd-action--quiet" onClick={replay}>
                {es ? "Volver a expedir" : "Issue again"}
              </button>
              {!dossier.complete && outstandingPage && (
                <button
                  className="pmd-action pmd-action--primary"
                  onClick={() => onGoTo(outstandingPage)}
                >
                  {es ? "Ir a lo que falta" : "Go to what is missing"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
