/**
 * The product shot, rendered rather than screenshotted.
 *
 * The design called for a 1440x900 image here. An image would be a lie within a
 * week — it is the one asset nobody updates when the panel changes — so this is
 * the scene built out of the same tokens as the panel itself: a form, and Brío
 * narrating what it just did to it.
 *
 * It plays once, when it first scrolls into view, and then holds the finished
 * state. It does not loop: a landing page that keeps replaying an animation in
 * the corner of your eye while you read the copy underneath it is competing with
 * itself. Under `prefers-reduced-motion` the finished state is what renders, with
 * no play at all — the information is in the end state, not the transition.
 *
 * The markup here deliberately does *not* import the extension's Widget. That
 * component is bound to the extension's protocol types, a shadow-root stylesheet
 * and a live server connection; dragging it onto a static marketing page would
 * couple the two builds for the sake of eighty lines of presentational markup.
 * What keeps the two from drifting is that both are drawn entirely from the
 * tokens in @personal-md/brand, so a palette change moves both at once.
 */

import { useEffect, useRef, useState } from "react";

import { Check, Chevron, Mark } from "./icons.tsx";

/** The invented person, kept the same across every surface of this product. */
const STORED =
  "Llevo ocho años decidiendo qué problemas fiscales merece la pena resolver, que casi siempre significa decir no a la mayoría. Me interesa Arqia porque el problema es del mismo tipo: gente que necesita entender una decisión que le afecta al bolsillo.";

const DRAFT =
  "En 2024 lideré la migración del flujo de declaración a un motor de reglas nuevo. Fijamos la fecha por la campaña, no por el estado del trabajo, y llegamos con el 80% migrado y el 20% conviviendo con el sistema viejo. Los dos primeros días el soporte se dobló y congelamos despliegues. Lo que aprendí no fue a estimar mejor: fue que una fecha de campaña no admite un plan que dependa de que nada salga mal.";

interface Step {
  field: string;
  headline: string;
  value: string;
  note: string;
  /** Written by the model, from facts you confirmed. Marked, always. */
  draft?: boolean;
  /** The form already held something and this replaced it. */
  replace?: boolean;
  /** Matched and typed without a model call. Never left the machine. */
  local?: boolean;
}

const STEPS: Step[] = [
  {
    field: "name",
    headline: "Filled Nombre completo",
    value: "Martín Zulueta Ochoa",
    note: "personal.full_name · from your CV",
  },
  {
    field: "email",
    headline: "Filled Correo electrónico",
    value: "martin.zulueta@example.es",
    note: "personal.email",
    local: true,
  },
  {
    field: "nif",
    headline: "Typed your NIF locally",
    value: "•••••••7X",
    note: "personal.nif · matched without a model",
    local: true,
  },
  {
    field: "city",
    headline: "Corrected Ciudad de residencia",
    value: "Madrid",
    note: "the form had MADRID",
    replace: true,
  },
  {
    field: "salary",
    headline: "Filled Expectativa salarial",
    value: "72.000 € brutos anuales",
    note: "worked out from logistics.salary_expectation",
  },
  {
    field: "why",
    headline: "Reused your answer from March",
    value: STORED,
    note: "motivation.why_this_company · unchanged, it still fits",
  },
  {
    field: "fail",
    headline: "Drafted one you had not written",
    value: DRAFT,
    note: "grounded in 2 past answers · 148 / 150 words",
    draft: true,
  },
];

interface FieldDef {
  id: string;
  label: string;
  placeholder: string;
  long?: boolean;
  /** What the form already held before Brío touched it. */
  preset?: string;
}

const FIELDS: FieldDef[] = [
  { id: "name", label: "Nombre completo", placeholder: "Nombre y apellidos" },
  { id: "email", label: "Correo electrónico", placeholder: "tu@correo.com" },
  { id: "nif", label: "DNI / NIF", placeholder: "00000000A" },
  { id: "city", label: "Ciudad de residencia", placeholder: "Ciudad", preset: "MADRID" },
  { id: "salary", label: "Expectativa salarial bruta anual", placeholder: "Indica un importe" },
  {
    id: "why",
    label: "¿Por qué te gustaría formar parte de nuestro equipo?",
    placeholder: "Escribe tu respuesta",
    long: true,
  },
  {
    id: "fail",
    label: "Cuéntanos un proyecto que salió mal y qué aprendiste",
    placeholder: "Escribe tu respuesta",
    long: true,
  },
];

const NEEDS = [
  "¿Cuánto se retrasó el cierre de campaña? The draft needs the figure and your file does not have it.",
  "This form asks for disponibilidad and your file is silent.",
];

/** Plays the fill once the scene is actually on screen, and only once. */
function usePlayOnce(ref: React.RefObject<HTMLElement | null>, total: number) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reduced motion gets the end state immediately: the point of the scene is
  // what the panel says, and every line of that is present when it is finished.
  const [shown, setShown] = useState(reduced ? total : 0);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;

    let timer: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        // A beat before the first line, so the scene is read as a form that was
        // sitting there rather than as a loading state.
        let n = 0;
        const tick = () => {
          n += 1;
          setShown(n);
          if (n < total) timer = window.setTimeout(tick, 420);
        };
        timer = window.setTimeout(tick, 520);
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [ref, reduced, total]);

  return { shown, done: shown >= total, reduced };
}

export default function Scene() {
  const ref = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const { shown, done } = usePlayOnce(ref, STEPS.length);

  /*
   * Follow the log down as it writes, the way the real panel does. Without this
   * the scene ends on line four of seven and the thing worth seeing — the two it
   * refused to guess — never comes into view.
   */
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, done]);

  const filled = new Map(STEPS.slice(0, shown).map((s) => [s.field, s.value]));
  const trace = STEPS.slice(0, shown);
  const filledCount = trace.filter((s) => !s.draft).length;

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-[14px] border border-rule-400 bg-white shadow-[0_30px_60px_-40px_rgba(18,18,16,0.4)]"
      /*
       * Decorative: the scene restates, in pictures, the three claims the cards
       * underneath make in words. A screen reader that reads those cards has
       * everything this conveys, and reading out a seven-line trace log plus a
       * seven-field form in between the hero and the argument would bury them.
       */
      role="img"
      aria-label="Brío filling a job application: seven fields filled, one answer drafted, two questions it refused to guess."
    >
      <div className="flex items-center gap-3 border-b border-rule-400 bg-bone-300 px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-[#d5cbbd]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#d5cbbd]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#d5cbbd]" />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-md border border-rule-400 bg-white px-2.5 py-1 font-mono text-[11px] text-graphite-400">
          empleo.arqia.es/vacantes/product-manager/solicitud
        </span>
      </div>

      {/*
        A fixed height with the form clipped inside it, rather than a box that
        grows to fit seven fields. This is standing in for a screenshot, and a
        screenshot has a bottom edge: letting the frame run to 1100px to show a
        form nobody is going to read would leave the panel — the only thing on
        this page worth looking at — stranded at the bottom of it.
      */}
      <div className="relative h-[600px] overflow-hidden bg-white">
        <div className="max-w-[560px] px-6 pb-16 pt-7 sm:px-10">
          <p className="brio-eyebrow text-graphite-200">Arqia · Empleo</p>
          <p className="mt-2.5 font-display text-[26px] leading-tight sm:text-[32px]">
            Product Manager — Madrid
          </p>
          <p className="mt-1.5 text-[13px] text-graphite-400">
            Paso 2 de 3 · Datos personales y preguntas abiertas
          </p>
          <div className="my-6 h-px bg-rule-250" />

          <div className="flex flex-col gap-4">
            {FIELDS.map((f) => {
              const value = filled.get(f.id) ?? f.preset ?? "";
              const isNew = STEPS[shown - 1]?.field === f.id;
              return (
                <div key={f.id} className="flex flex-col gap-1.5">
                  <p className="text-[12.5px] font-semibold text-graphite-600 text-pretty">
                    {f.label}
                  </p>
                  <div
                    className={`rounded-md border border-rule-500 px-3 py-2.5 text-[14px] leading-relaxed ${
                      f.long ? "min-h-[96px]" : "min-h-10"
                    } ${isNew ? "brio-flash" : ""}`}
                  >
                    {value ? (
                      <span className="whitespace-pre-wrap text-graphite-900">{value}</span>
                    ) : (
                      <span className="text-graphite-200">{f.placeholder}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <span className="mt-7 inline-flex rounded-md bg-ink-900 px-5 py-2.5 text-[13.5px] font-semibold text-white">
            Enviar candidatura
          </span>
        </div>

        {/*
          The frame has a bottom edge and the form is longer than it. Fading into
          it says "this continues"; a hard crop at a half-drawn input says "this
          is broken".
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent"
        />

        {/*
          Absolute inside the frame rather than fixed: fixed would pin it to the
          viewport and let it walk out of the browser window it is supposed to be
          sitting in. Below `lg` it is hidden entirely — a 380px panel over a
          360px phone is not a smaller version of this scene, it is a different
          one, and the three cards underneath make the same argument in words.
        */}
        <div className="pointer-events-none absolute bottom-5 right-5 top-5 hidden w-[380px] items-end justify-end lg:flex">
          <div className="brio-rise flex max-h-full w-full flex-col overflow-hidden rounded-[14px] bg-ink-900 text-paper-050 shadow-[0_24px_60px_-18px_rgba(18,18,16,0.7)]">
            <div className="flex items-start justify-between gap-3 border-b border-ink-700 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Mark size={26} />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-tight">
                    {done ? `${filledCount} filled, 1 drafted, 2 for you` : "Filling this form"}
                  </p>
                  <p className="brio-mono mt-0.5 truncate text-graphite-300">
                    {done
                      ? "empleo.arqia.es · every line reversible"
                      : "empleo.arqia.es · nothing submitted"}
                  </p>
                </div>
              </div>
              <Chevron className="mt-0.5 h-4 w-4 shrink-0 rotate-90 text-graphite-300" />
            </div>

            <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto">
              {trace.map((t) => (
                <div
                  key={t.field}
                  className="brio-in flex items-start gap-2.5 border-b border-ink-800 px-4 py-3"
                >
                  <Check className="mt-0.5 h-[15px] w-[15px] shrink-0 text-jade-300" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] leading-snug">{t.headline}</p>
                    {/*
                      An integral line-height, not `leading-normal`. A clamp at
                      three lines of a fractional line-height leaves a two-pixel
                      sliver of the fourth line showing under the cut, which
                      reads as a rendering bug rather than as a truncation.
                    */}
                    <p className="mt-1.5 line-clamp-3 rounded-md bg-ink-800 px-2.5 py-1.5 text-[13px] leading-[19px] text-paper-200">
                      {t.value}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="brio-mono text-graphite-300">{t.note}</span>
                      {t.draft && (
                        <span className="brio-mono rounded-full bg-amber-950 px-1.5 py-px text-amber-300">
                          drafted
                        </span>
                      )}
                      {t.replace && (
                        <span className="brio-mono rounded-full bg-amber-950 px-1.5 py-px text-amber-300">
                          replaced what the form held
                        </span>
                      )}
                      {t.local && (
                        <span className="brio-mono rounded-full bg-jade-950 px-1.5 py-px text-jade-300">
                          never sent
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="brio-mono shrink-0 pt-0.5 font-semibold text-graphite-300">
                    Undo
                  </span>
                </div>
              ))}

              {!done && (
                <p className="flex items-center gap-2.5 px-4 py-3 text-[13px] text-paper-400">
                  <span className="brio-pulse h-[7px] w-[7px] rounded-full bg-brio-500" />
                  {shown < 3
                    ? "reading the form — 14 fields, 7 it knows"
                    : "drafting the open question · about ten seconds"}
                </p>
              )}

              {done && (
                <div className="border-t border-ink-700 bg-ink-850 px-4 py-3.5">
                  <p className="text-[13px] font-semibold text-amber-300">
                    2 it refused to guess
                  </p>
                  <p className="mt-1 text-[12.5px] leading-normal text-graphite-300 text-pretty">
                    It would rather ask than invent. Answer here and it goes into the form and
                    into your file.
                  </p>
                  <ul className="mt-2.5 flex flex-col gap-2">
                    {NEEDS.map((q) => (
                      <li key={q} className="text-[13px] leading-snug text-pretty">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-ink-700 bg-ink-850 px-4 py-2.5">
              <span className="brio-mono whitespace-nowrap font-semibold text-graphite-300">
                {done ? "Undo everything" : "Stop"}
              </span>
              <span className="brio-mono whitespace-nowrap text-ink-600">nothing submitted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
