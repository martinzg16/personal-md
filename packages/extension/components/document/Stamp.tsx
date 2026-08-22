/**
 * The stamp.
 *
 * This replaces the word "saved". The old surface printed `saved` in small green
 * text next to a button, which is the standard and which nobody has ever
 * remembered seeing. A stamp says the same thing and says it as a record: it
 * carries the date, it is off-square, its ink is uneven, and it stays on the page
 * afterwards. It is also true - the date on it is the `updatedAt` the file
 * actually holds.
 *
 * The angle and the ink are derived from the record's key, so a given answer
 * always stamps identically. That is deliberate and it is the difference between
 * a record and an effect: a stamp that jittered to a new angle on every render
 * would be decoration pretending to be evidence.
 */

const INKS = ["", "pmd-stamp--green", "pmd-stamp--violet"] as const;

function seededAngle(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  // -6.5deg to +6.5deg, never zero: a stamp squared to the page reads as a badge.
  const spread = (h % 1100) / 100 - 5.5;
  return spread >= 0 ? spread + 1 : spread - 1;
}

function seededInk(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 17 + seed.charCodeAt(i)) >>> 0;
  return INKS[h % INKS.length] ?? "";
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default function Stamp({
  title,
  date,
  seed,
  /** Play the press. Only true for a stamp that just landed. */
  press = false,
  ink,
  className = "",
}: {
  title: string;
  date: Date | null;
  seed: string;
  press?: boolean;
  /** Override the derived ink. The endorsement stamp is always vermilion. */
  ink?: "endorse";
  className?: string;
}) {
  const angle = seededAngle(seed);
  const inkClass = ink === "endorse" ? "pmd-stamp--endorse" : seededInk(seed);

  return (
    <span
      className={`pmd-stamp ${inkClass} ${press ? "pmd-stamp--press" : ""} ${className}`}
      style={{ ["--stamp-angle" as string]: `${angle.toFixed(2)}deg` }}
    >
      <span className="pmd-stamp__title">{title}</span>
      {date && (
        <span className="pmd-stamp__date">{DATE.format(date).toUpperCase()}</span>
      )}
    </span>
  );
}
