/**
 * Drawn icons, one stroke weight, one grid.
 *
 * Deliberately not emoji and not a glyph font: this renders inside a shadow root
 * on arbitrary pages, where a host font can substitute a glyph for something
 * unrecognisable, and where an emoji's colour would fight the panel's own palette.
 */

interface IconProps {
  className?: string;
}

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** The mark: a document with a line lifted out of it. The file, applied. */
export const Mark = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3.5 2.5h6l3 3v8h-9z" />
    <path d="M9.5 2.5v3h3" />
    <path d="M5.5 8.5h5" />
    <path d="M5.5 11h3" />
  </svg>
);

/** Insert into the field: a line entering a bracket. */
export const Insert = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M2 8h7" />
    <path d="M6.5 5.5 9 8l-2.5 2.5" />
    <path d="M11.5 3.5h2.5v9h-2.5" />
  </svg>
);

/** Draft: a nib. Not a sparkle - the sparkle is the category's tell. */
export const Draft = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M11.5 2.5 13.5 4.5 6 12H4v-2z" />
    <path d="M10 4l2 2" />
    <path d="M3 14h10" />
  </svg>
);

/** Undo. */
export const Undo = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 8h7a3 3 0 0 1 0 6H6" />
    <path d="M5.5 5.5 3 8l2.5 2.5" />
  </svg>
);

/** Withheld from prompts: a closed padlock. */
export const Withheld = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);

export const Close = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export const Check = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

/** Something the draft could not fill in. */
export const Gap = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2" />
    <circle cx="8" cy="8" r="2.5" />
  </svg>
);

/** Show a masked value. An eye, drawn on the same grid as the rest. */
export const Reveal = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="1.75" />
  </svg>
);

/** Points at the destination field on the page. */
export const Arrow = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M2.5 8h9" />
    <path d="M8.5 5 11.5 8l-3 3" />
  </svg>
);

export const Chevron = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5.5 3.5 10 8l-4.5 4.5" />
  </svg>
);
