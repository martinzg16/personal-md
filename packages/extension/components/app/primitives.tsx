/**
 * The pieces every app screen is built from.
 *
 * Five of them, and the constraint is deliberate: this surface has no shadows
 * below the panel layer, so hierarchy is carried by exactly three things — the
 * face a string is set in, the weight of the hairline around it, and the space
 * above it. A sixth primitive would almost certainly be a fourth signal, and a
 * fourth signal is where a design stops being readable at a glance.
 */

export const RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-brio-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bone-050";

/** The screen's own statement, and what it is measuring. */
export function PageHead({
  title,
  lead,
  aside,
}: {
  title: string;
  lead?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0">
        <h1
          className="font-display font-normal leading-[1.05] tracking-[-0.015em] text-balance"
          style={{ fontSize: "clamp(32px, 4vw, 44px)" }}
        >
          {title}
        </h1>
        {lead && (
          <p className="mt-2 max-w-[58ch] text-[14.5px] text-graphite-500 text-pretty">{lead}</p>
        )}
      </div>
      {aside}
    </div>
  );
}

/** A bordered white plane. Everything on these screens sits on one of these. */
export function Card({
  title,
  meta,
  children,
  action,
}: {
  title?: string;
  meta?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-rule-400 bg-white">
      {(title || meta || action) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-rule-200 px-4.5 py-3.5">
          {title && <h2 className="font-display text-[22px] leading-tight">{title}</h2>}
          {/*
            `brio-mono`, not `brio-eyebrow`. This slot carries dotted keys as
            often as it carries counts, and a key is lowercase by definition —
            uppercasing `experience.relevant_background` prints an identifier
            that does not exist in the file.
          */}
          {meta && <span className="brio-mono text-graphite-300">{meta}</span>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Mono, uppercase, quiet. Names a group of things rather than a thing. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="brio-eyebrow text-graphite-300">{children}</p>;
}

/** A key, a count, a cost, a timestamp — anything a machine produced. */
export function Mono({
  children,
  tone = "quiet",
}: {
  children: React.ReactNode;
  tone?: "quiet" | "faint";
}) {
  return (
    <span className={`brio-mono ${tone === "faint" ? "text-graphite-200" : "text-graphite-300"}`}>
      {children}
    </span>
  );
}

/**
 * A pill that states a condition.
 *
 * Four tones and each one means one thing. `withheld` is the only one that is
 * ever load-bearing — it is the difference between a value that can reach a
 * prompt and one that cannot — so it is the only one that is not grey.
 */
export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "withheld" | "caution" | "done";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "bg-bone-250 text-graphite-500",
    withheld: "bg-brio-200 text-brio-700",
    caution: "bg-amber-150 text-amber-700",
    done: "bg-jade-100 text-jade-600",
  } as const;
  return (
    <span className={`brio-mono shrink-0 rounded-full px-2 py-0.5 ${tones[tone]}`}>{children}</span>
  );
}

/** Nothing here yet, and what to do about it. Never a shrug. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4.5 py-8 text-center text-[14px] text-graphite-400 text-pretty">{children}</p>
  );
}
