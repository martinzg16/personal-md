/**
 * A block that scrolls sideways, and says so only when it does.
 *
 * Two things on this surface are wider than a narrow window and must not shrink
 * to fit: the machine-readable line, which is forty-four characters or it is not
 * a machine-readable line, and the thumb-edge rail, which is fifteen folios. Both
 * scroll. Both therefore need to look like they scroll, because a line clipped
 * flat at the edge of the page does not read as "there is more" - on an MRZ it
 * reads as a wrong check digit, which is precisely the claim the element exists
 * to make.
 *
 * The fade is measured, never assumed. `scrollWidth - clientWidth - scrollLeft`
 * is re-read on scroll and on resize, so a line that fits gets no fade at all and
 * a line scrolled to its end loses the fade once there is nothing left to signal.
 * The rule is inherited: the in-page widget's ledger does the same thing, for the
 * same stated reason - an edge fade on content that fits is a lie about the
 * content.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export default function Scroller({
  className = "",
  wrapperClassName = "",
  track = false,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Classes for the element that holds the scroller and its track together.
   *
   * It exists because `track` introduces a wrapper, and a caller that hides the
   * scroller responsively was hiding only the scroller: the track stayed behind
   * as a stray hairline under a rail that was not there.
   */
  wrapperClassName?: string;
  /**
   * Render a page-edge track beneath the content.
   *
   * The trailing mask is the right cue for a dense line of characters and the
   * wrong one for a row of widely-spaced tabs, where it lands in a gap and says
   * nothing at all. Anything whose items have air between them wants the track.
   */
  track?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);
  const [span, setSpan] = useState({ start: 0, width: 1 });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setFolded(el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
    const total = el.scrollWidth || 1;
    setSpan({ start: el.scrollLeft / total, width: el.clientWidth / total });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    // Re-measured on resize because the fold depends on the container, and this
    // container is sized by a grid track that changes with the window.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const scroller = (
    <div
      {...rest}
      ref={ref}
      onScroll={measure}
      className={`${className} ${folded ? "pmd-folded" : ""}`}
    >
      {children}
    </div>
  );

  if (!track) return scroller;

  return (
    <div className={wrapperClassName}>
      {scroller}
      {/* Only when there is somewhere to scroll to. A track across content that
          fits is the same lie as a fade across content that fits. */}
      {span.width < 0.999 && (
        <div
          className="pmd-rail-track"
          aria-hidden="true"
          style={{
            ["--track-start" as string]: `${(span.start * 100).toFixed(2)}%`,
            ["--track-span" as string]: `${(span.width * 100).toFixed(2)}%`,
          }}
        />
      )}
    </div>
  );
}
