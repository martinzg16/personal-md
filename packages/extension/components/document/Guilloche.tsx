/**
 * The security print, rendered.
 *
 * Two components, one geometry module. Both draw themselves in on mount when
 * asked to, because the issuance sequence needs the print to arrive before the
 * type does - a document is printed with its background first, and watching that
 * happen is most of what makes the sequence feel like an issuance rather than a
 * page load.
 *
 * Both are `aria-hidden`. A guilloche carries no information; it is the one
 * purely decorative thing on the surface, and saying so in the markup is more
 * honest than inventing a label for it.
 */

import { useMemo } from "react";

import { band, rosette } from "../../lib/document/guilloche.ts";

const INKS = ["var(--color-iris-cyan)", "var(--color-iris-lilac)", "var(--color-iris-mint)"];

export function Rosette({
  seed,
  size,
  draw = false,
  className = "",
}: {
  seed: string;
  size: number;
  /** Animate the print arriving. Used once, by the issuance sequence. */
  draw?: boolean;
  className?: string;
}) {
  const figure = useMemo(() => rosette(seed, size), [seed, size]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`pmd-guilloche ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {figure.paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={INKS[i % INKS.length]}
          strokeWidth={0.45}
          // Opacity falls off outward so the rosette has a dense core, the way an
          // engine-turned plate does where the passes overlap most.
          opacity={0.62 - i * 0.055}
          style={
            draw
              ? {
                  strokeDasharray: figure.length,
                  ["--draw-length" as string]: figure.length,
                  animation: `pmd-draw 900ms cubic-bezier(0.33, 0, 0.2, 1) ${i * 70}ms both`,
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}

export function Band({
  seed,
  width,
  height,
  draw = false,
  className = "",
}: {
  seed: string;
  width: number;
  height: number;
  draw?: boolean;
  className?: string;
}) {
  const figure = useMemo(() => band(seed, width, height), [seed, width, height]);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`pmd-guilloche ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {figure.paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={INKS[i % INKS.length]}
          strokeWidth={0.5}
          opacity={0.5 - i * 0.05}
          style={
            draw
              ? {
                  strokeDasharray: figure.length,
                  ["--draw-length" as string]: figure.length,
                  animation: `pmd-draw 1100ms cubic-bezier(0.33, 0, 0.2, 1) ${i * 90}ms both`,
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}
