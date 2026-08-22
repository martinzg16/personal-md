/**
 * The cover.
 *
 * The first viewport, and it exists for exactly one reason: the surface has to
 * establish that this is a document before it asks for a NIF. A form that opens
 * on a field grid has to earn that trust with copy; a closed cover does it with
 * one look and one click.
 *
 * It is shown once. `chrome.storage` records that it has been opened, and every
 * return visit lands on the data page - onboarding that replays itself is the
 * thing `onboard` warns about most.
 *
 * There is no country, no crest and no nationality anywhere on it. The mark is
 * the holder's own generated rosette, the authority is PERSONAL.md, and the
 * document code is PM. This is a machine-readable personal document that borrows
 * a passport's grammar; it is deliberately not a passport, and nothing on this
 * cover could be lifted out and used as a template for one.
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
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div
        className={`relative w-full max-w-[640px] ${turning ? "pmd-turn" : ""}`}
        style={{ backfaceVisibility: "hidden" }}
      >
        <div
          className="relative overflow-hidden px-10 py-16 sm:px-16 sm:py-20"
          style={{
            borderRadius: "14px",
            background:
              "linear-gradient(158deg, var(--color-cover-700) 0%, var(--color-cover-850) 46%, var(--color-cover-900) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.09), inset 0 0 0 1px rgba(0,0,0,0.35), 0 30px 70px -20px rgba(0,0,0,0.8)",
          }}
        >
          {/* Blind embossing: the mark is pressed into the cover rather than
              printed on it, so it carries no ink at all - only the highlight and
              shadow a press leaves. Foil is reserved for the lettering. */}
          <div
            className="pointer-events-none absolute -right-16 -top-16 opacity-[0.16]"
            style={{
              filter:
                "drop-shadow(0 1px 0 rgba(255,255,255,0.28)) drop-shadow(0 -1px 0 rgba(0,0,0,0.6))",
              color: "var(--color-cover-600)",
            }}
          >
            <Rosette seed={holder ?? ""} size={340} />
          </div>

          <div className="relative">
            <p className="pmd-legend pmd-legend--dark">
              Documento personal legible por máquina
            </p>
            <p className="pmd-legend pmd-legend--dark">
              Machine-readable personal document
            </p>

            <h1
              className="mt-7 font-sans"
              style={{
                color: "var(--color-foil-300)",
                fontSize: "clamp(30px, 6vw, 46px)",
                fontWeight: 700,
                fontStretch: "112%",
                letterSpacing: "0.06em",
                lineHeight: 1,
                // Foil: a stamped metal edge is a hard specular line, not a
                // gradient wash, so the highlight is a tight background-clip band
                // rather than a soft glow.
                background:
                  "linear-gradient(174deg, #f4e3a8 0%, var(--color-foil-500) 38%, #8f6d15 58%, var(--color-foil-300) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                textShadow: "0 1px 0 rgba(0,0,0,0.45)",
              }}
            >
              PERSONAL.md
            </h1>

            <div
              className="mt-8 h-px w-24"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-foil-500), transparent)",
              }}
            />

            <p
              className="pmd-prose mt-7 max-w-[40ch]"
              style={{ color: "var(--color-laminate-200)", fontSize: "15px" }}
            >
              {lang === "es"
                ? "Aquí escribes tus datos y tus respuestas una vez. A partir de entonces el fichero es tuyo, en tu disco, en markdown, y se rellena solo en los formularios de los demás."
                : "You write your facts and your answers here once. After that the file is yours, on your own disk, in markdown, and it fills itself into other people's forms."}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              <button className="pmd-action pmd-action--foil" onClick={onOpen}>
                {lang === "es" ? "Abrir" : "Open"}
              </button>
              <span className="pmd-legend pmd-legend--dark normal-case tracking-[0.04em]">
                {lang === "es"
                  ? "Nada es obligatorio. Cada campo se guarda solo."
                  : "Nothing is required. Every field saves on its own."}
              </span>
            </div>
          </div>

          {/* The chip. A biometric document prints this symbol on its cover, and
              here it is honest in a way it rarely is: there really is a machine
              -readable line inside. Drawn, never an emoji or an icon font. */}
          <svg
            width="30"
            height="24"
            viewBox="0 0 30 24"
            className="absolute bottom-9 right-10 sm:bottom-11 sm:right-16"
            style={{ color: "var(--color-foil-500)", opacity: 0.7 }}
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
  );
}
