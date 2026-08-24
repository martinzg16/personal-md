/**
 * The cover.
 *
 * The first viewport, and it exists for one reason: the surface has to establish
 * that this is a document before it asks anybody for a NIF. A page that opens on
 * a field grid has to earn that with copy. A closed booklet does it in one look.
 *
 * It is shown once - `chrome.storage` records that it has been opened and every
 * return lands on the data page, because onboarding that replays itself is the
 * fastest way to make a first run into an irritation.
 *
 * The first build of this made it a 640px card floating in the middle of the
 * ground, which read as a modal and not as an object. What fixed it was
 * physicality: the booklet is portrait at a real passport's proportion, it has a
 * spine on its left, and the block of pages is visible along its right edge. The
 * composition inside is centred and symmetrical, which is what every cover of
 * this kind has always done and the reason one is recognisable at a glance.
 *
 * There is no country, no crest and no nationality on it. The mark is the
 * holder's own generated rosette, the authority is OWN, and the document code is
 * PM. This borrows a travel document's grammar and is deliberately not one:
 * nothing here could be lifted out and used as a template for a real document.
 */

import { Rosette } from "./Guilloche.tsx";

export default function Cover({
  holder,
  onOpen,
  turning,
  lang,
}: {
  holder: string | null;
  onOpen: () => void;
  /** True for the 620ms the cover is turning. */
  turning: boolean;
  lang: "es" | "en";
}) {
  const es = lang === "es";

  return (
    <div className="grid min-h-screen place-items-center px-5 py-10 sm:px-8">
      <div className="grid w-full max-w-[1000px] items-center gap-8 sm:gap-12 lg:grid-cols-[minmax(0,400px)_minmax(0,470px)] lg:gap-20">
        {/* ------------------------------------------------------- the booklet */}
        {/*
          Capped in the axis that overflows. Sized by width alone, the booklet was
          476px tall on an 812px phone and pushed the headline and the one action
          below the fold - a first viewport whose only action you have to scroll to
          find. A 88:125 page is 1.42x as tall as it is wide, so a height budget
          converts to a width: 28vh wide is 40vh tall, which leaves the headline,
          the paragraph and the button inside the fold on a small phone.
        */}
        <div
          className={`relative mx-auto w-full max-w-[min(400px,28vh)] sm:max-w-[min(400px,42vh)] lg:max-w-[min(400px,55vh)] ${turning ? "pmd-turn" : ""}`}
          style={{ perspective: "1800px" }}
        >
          {/* The block of pages, along the right edge. Thin laminate slivers, so
              the booklet has a thickness you can count rather than a border. */}
          <div
            className="absolute inset-y-5 -right-[5px] rounded-r-[2px]"
            style={{
              width: "6px",
              // The pages are in shadow inside a closed cover: a dim, mostly dark
              // stack with the odd lit edge. At laminate brightness this was a
              // silver bar down the right of the booklet that read as a rendering
              // artefact rather than as paper.
              background:
                "repeating-linear-gradient(90deg, rgba(206,214,201,0.34) 0 1px, rgba(0,0,0,0.5) 1px 2.5px)",
              boxShadow: "1px 0 3px rgba(0,0,0,0.55)",
              opacity: 0.8,
            }}
            aria-hidden="true"
          />

          <div
            className="relative overflow-hidden"
            style={{
              aspectRatio: "88 / 125",
              borderRadius: "12px 5px 5px 12px",
              background:
                "radial-gradient(128% 88% at 22% 6%, var(--color-cover-700) 0%, var(--color-cover-850) 52%, var(--color-cover-900) 100%)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.1), inset 0 0 0 1px rgba(0,0,0,0.42), 0 34px 74px -18px rgba(0,0,0,0.85)",
            }}
          >
            {/* The grain, at cover scale rather than the body's. */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.55]"
              style={{ backgroundImage: "var(--grain)" }}
              aria-hidden="true"
            />

            {/* The spine: a darker band with the crease highlight on its inner
                edge, which is the only place on the cover that catches light. */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0"
              style={{
                width: "17px",
                background:
                  "linear-gradient(90deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.24) 58%, rgba(255,255,255,0.055) 96%, transparent 100%)",
              }}
              aria-hidden="true"
            />

            <div className="relative flex h-full flex-col items-center justify-between px-7 py-9 text-center sm:px-9 sm:py-11">
              <div>
                <p className="pmd-legend pmd-legend--dark">
                  Autoridad&nbsp;· Authority&nbsp;·&nbsp;OWN
                </p>
                <p className="pmd-legend pmd-legend--dark mt-1.5">
                  Documento personal legible por máquina
                </p>
                <p className="pmd-legend pmd-legend--dark">
                  Machine-readable personal document
                </p>
              </div>

              {/* Blind embossing: pressed into the cover, carrying no ink at all -
                  only the highlight and shadow a die leaves. Foil is kept for the
                  lettering, so the mark and the name are different operations. */}
              <div
                className="pointer-events-none w-[62%]"
                style={{
                  color: "var(--color-cover-600)",
                  opacity: 0.85,
                  filter:
                    "drop-shadow(0 1px 0 rgba(255,255,255,0.16)) drop-shadow(0 -1px 0 rgba(0,0,0,0.7))",
                }}
                aria-hidden="true"
              >
                <Rosette seed={holder ?? ""} size={220} className="h-auto w-full" />
              </div>

              <div className="flex flex-col items-center">
                <span
                  className="font-sans"
                  style={{
                    fontSize: "clamp(19px, 5.6vw, 27px)",
                    fontWeight: 700,
                    fontStretch: "116%",
                    letterSpacing: "0.055em",
                    lineHeight: 1,
                    // Foil is a raking specular, not a wash: several hard stops
                    // across the lettering, so the metal turns along the line.
                    background:
                      "linear-gradient(101deg, #7d5d0f 0%, #e9d38d 15%, #fff6ce 27%, #c9a227 44%, #8a6a14 58%, #f2e0a6 78%, #ac871c 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.55))",
                  }}
                >
                  PERSONAL.md
                </span>

                {/* The chip. A biometric document prints this on its cover, and
                    here it is honest in a way it rarely is: there really is a
                    machine-readable line inside. Drawn, never an emoji. */}
                <svg
                  width="30"
                  height="24"
                  viewBox="0 0 30 24"
                  className="mt-5"
                  style={{ color: "var(--color-foil-500)", opacity: 0.72 }}
                  aria-hidden="true"
                >
                  <rect
                    x="0.75"
                    y="6.75"
                    width="12.5"
                    height="10.5"
                    rx="1.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M6 12h5M6 9.5h5M6 14.5h5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  {[0, 1, 2].map((i) => (
                    <path
                      key={i}
                      d={`M${17 + i * 4} ${12 - (3 + i * 2.6)}a${3 + i * 2.6} ${3 + i * 2.6} 0 0 1 0 ${(3 + i * 2.6) * 2}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      opacity={1 - i * 0.22}
                    />
                  ))}
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------------- the pitch */}
        <div className="text-center lg:text-left">
          <h1
            className="mx-auto max-w-[19ch] font-sans lg:mx-0"
            style={{
              color: "var(--color-laminate-050)",
              fontSize: "clamp(28px, 4.6vw, 44px)",
              fontWeight: 700,
              fontStretch: "104%",
              lineHeight: 1.04,
              letterSpacing: "-0.005em",
            }}
          >
            {es ? (
              <>
                Escribe tus respuestas
                <br />
                una vez.
              </>
            ) : (
              <>
                Write your answers
                <br />
                once.
              </>
            )}
          </h1>

          <p
            className="pmd-note mx-auto mt-5 max-w-[44ch] lg:mx-0"
            style={{ color: "var(--color-laminate-200)", fontSize: "15px" }}
          >
            {es
              ? "A partir de entonces, cuando un formulario pregunte algo que ya has contestado, sale tu respuesta - la tuya, en tus palabras, con su procedencia. El fichero es markdown plano, está en tu disco y lo puedes editar a mano."
              : "From then on, when a form asks something you have already answered, your answer comes back - yours, in your words, with its provenance. The file is plain markdown, on your own disk, and you can edit it by hand."}
          </p>

          <div className="mt-9 flex flex-col items-center gap-4 lg:items-start">
            <button className="pmd-action pmd-action--foil" onClick={onOpen}>
              {es ? "Abrir el documento" : "Open the document"}
            </button>
            <span className="pmd-legend pmd-legend--dark normal-case tracking-[0.03em]">
              {es
                ? "Nada es obligatorio. Cada página se guarda por separado."
                : "Nothing is required. Every page saves on its own."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
