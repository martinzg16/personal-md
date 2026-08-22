/**
 * The thumb edge.
 *
 * A closed passport tells you how much of it has been used before you open it:
 * you see the stack, and you see which pages carry a stamp. That is the only
 * progress indicator on this surface, and it replaces the two counters the old
 * page carried ("Facts 4/19, Answers 1/8"), which said the same thing while
 * looking like homework.
 *
 * An empty page is marked with `<` - the MRZ's filler character - so the rail
 * and the machine-readable line use one vocabulary for "nothing here yet".
 */

export interface RailPage {
  id: string;
  folio: string;
  title: { es: string; en: string };
  /** A page with content carries a mark; an empty one carries the filler. */
  stamped: boolean;
  /** Pages that are not part of the record: the bureau, the issuance. */
  aside?: boolean;
}

export default function PageRail({
  pages,
  current,
  onSelect,
  lang,
}: {
  pages: RailPage[];
  current: string;
  onSelect: (id: string) => void;
  lang: "es" | "en";
}) {
  const record = pages.filter((p) => !p.aside);
  const aside = pages.filter((p) => p.aside);

  const item = (page: RailPage) => (
    <li key={page.id}>
      <button
        className="pmd-rail-item"
        aria-current={page.id === current ? "page" : undefined}
        onClick={() => onSelect(page.id)}
      >
        <span
          className="pmd-legend shrink-0 tabular-nums"
          style={{ color: "inherit", opacity: 0.62 }}
          aria-hidden="true"
        >
          {page.folio}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block font-sans text-[12px] font-semibold leading-tight"
            style={{ fontStretch: "88%" }}
          >
            {page.title.es}
          </span>
          <span
            className="block font-sans text-[10.5px] leading-tight opacity-60"
            style={{ fontStretch: "88%" }}
          >
            {page.title.en}
          </span>
        </span>
        {!page.aside && (
          <span
            className="shrink-0 font-mono text-[11px] leading-none"
            style={{
              color: page.stamped
                ? "var(--color-iris-mint)"
                : "color-mix(in oklab, var(--color-laminate-300) 52%, transparent)",
            }}
            aria-hidden="true"
          >
            {page.stamped ? "●" : "<"}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <nav
      aria-label={lang === "es" ? "Páginas del documento" : "Document pages"}
      className="lg:sticky lg:top-8"
    >
      <p className="pmd-legend pmd-legend--dark mb-2 px-3.5">
        Páginas · Pages
      </p>
      <ul className="mb-5">{record.map(item)}</ul>
      <div
        className="mx-3.5 mb-3 h-px"
        style={{ background: "color-mix(in oklab, var(--color-cover-600) 60%, transparent)" }}
      />
      <ul>{aside.map(item)}</ul>
    </nav>
  );
}
