/**
 * The machine-readable zone.
 *
 * The one object on the surface that reports completeness, and it reports it by
 * being incomplete: every position the user has not filled is a `<`, in a lighter
 * ink, in the same fixed cell it will occupy once it holds a character. Nothing
 * here is a percentage, a bar or a ring. You read the line and you can see what
 * is missing, which is the whole argument for choosing this world.
 *
 * Two details are load-bearing.
 *
 * Forty-four characters must fit on one line at every width, so the size is
 * driven by a container query rather than by breakpoints: `cqw` divides the
 * container by the character count, and the clamp stops it becoming unreadably
 * small on a narrow window or absurdly large on a wide one. A wrapped MRZ is not
 * a styling nit - a machine-readable line that wraps is not machine-readable, and
 * the surface would be telling a lie about its own central object.
 *
 * And focusing a field highlights the span it feeds. That is the correspondence
 * the page exists to teach: the value you are typing is going somewhere specific
 * and you can watch which cells it lands in.
 */

import Scroller from "./Scroller.tsx";
import { MRZ_FIELDS, type Mrz as MrzValue } from "../../lib/document/mrz.ts";

/** Which contiguous spans a data-page field feeds, as [line, start, length]. */
function spansFor(source: string | null): { line: 1 | 2; start: number; length: number }[] {
  if (!source) return [];
  return MRZ_FIELDS.filter((f) => f.source === source).map((f) => ({
    line: f.line,
    start: f.start,
    length: f.length,
  }));
}

function Line({
  value,
  line,
  highlight,
}: {
  value: string;
  line: 1 | 2;
  highlight: string | null;
}) {
  const live = spansFor(highlight).filter((s) => s.line === line);
  const isLive = (index: number): boolean =>
    live.some((s) => index >= s.start - 1 && index < s.start - 1 + s.length);

  // Rendered per character rather than per run, because the runs change on every
  // keystroke and a per-character span keeps the cell grid stable while they do.
  return (
    <div className="pmd-mrz" role="presentation">
      {[...value].map((ch, i) => (
        <span
          key={i}
          className={[
            ch === "<" ? "pmd-mrz-filler" : "",
            isLive(i) ? "pmd-mrz-live" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

export default function Mrz({
  mrz,
  /** The data-page field key currently focused, if any. */
  highlight = null,
  lang,
}: {
  mrz: MrzValue;
  highlight?: string | null;
  lang: "es" | "en";
}) {
  return (
    <div
      // The container the character size is measured against. `min-w-0` because
      // the line inside declares `min-width: max-content`, and without it that
      // contribution escapes upward and widens whatever grid track holds it.
      className="min-w-0"
      style={{ containerType: "inline-size" }}
    >
      <div
        className="border-t border-dashed pt-3"
        style={{ borderColor: "var(--color-laminate-200)" }}
      >
        <div className="pmd-legend pmd-legend--secondary mb-2 flex items-baseline justify-between gap-4">
          <span>
            Zona de lectura mecánica&nbsp;· Machine-readable zone
          </span>
          <span aria-hidden="true">
            {mrz.fillerCount} × &lt;
          </span>
        </div>

        <Scroller
          className="pmd-mrz-scroll"
          style={{
            // Forty-four characters plus tracking across the container, with a
            // floor: below it the block scrolls rather than the type shrinking.
            ["--mrz-size" as string]: "clamp(11px, 1.86cqw, 17px)",
          }}
        >
          <Line value={mrz.line1} line={1} highlight={highlight} />
          <Line value={mrz.line2} line={2} highlight={highlight} />
        </Scroller>

        <p className="pmd-legend pmd-legend--secondary mt-2.5 max-w-[62ch] normal-case tracking-normal">
          {lang === "es" ? (
            <>
              Cada <code className="font-mono">&lt;</code> es un campo que aún no has
              escrito. Los dígitos de control son de verdad — algoritmo 7-3-1 de la
              norma ICAO 9303 — y se calculan sobre lo que la página tiene ahora
              mismo, inscrito o todavía sin inscribir.
            </>
          ) : (
            <>
              Every <code className="font-mono">&lt;</code> is a field you have not
              written yet. The check digits are real — ICAO 9303&rsquo;s 7-3-1
              algorithm — computed over what the page holds right now, recorded or
              not yet recorded.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
