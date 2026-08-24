/**
 * Drawn at 1.5px on a 16-unit grid, round caps, `currentColor` throughout, so an
 * icon takes the colour of the sentence it sits in rather than carrying one of
 * its own.
 */

export function Check({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

export function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 3.5 10 8l-4.5 4.5" />
    </svg>
  );
}

/**
 * The mark: the initial, set in the display face, on the one orange disc a
 * surface is allowed. It is a glyph rather than a path because the wordmark and
 * the mark are then the same letterform — if the display face ever changes, the
 * mark changes with it instead of quietly becoming a different brand.
 */
export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brio-500 font-display leading-none text-white ${className ?? ""}`}
      /*
       * Sized from the disc rather than inherited, because this sits inside
       * sentences at four different sizes and an em-relative glyph would be a
       * different mark in each of them. The ratio is the one the letterform
       * wants: much above 0.6 and the B's bowl touches the disc.
       */
      style={{ width: size, height: size, fontSize: Math.round(size * 0.58) }}
    >
      <span style={{ transform: "translateY(0.03em)" }}>B</span>
    </span>
  );
}
