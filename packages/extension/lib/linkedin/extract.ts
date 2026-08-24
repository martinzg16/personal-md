/**
 * Reading your own LinkedIn profile, from the page you are already looking at.
 *
 * Not a fetcher and not a scraper. This runs in the content script on a profile
 * page the user has open in their own logged-in session, and only when they ask
 * for it. There is no stored credential, no request to LinkedIn we initiate, and
 * no crawl - it reads rendered DOM, which is the same thing the tool does to a
 * job application form.
 *
 * Two consequences shape the code.
 *
 * LinkedIn's markup is generated and changes without notice, so every field has
 * more than one strategy and nothing throws on a miss. What it *cannot* read it
 * records in `warnings`, because the failure mode to avoid is importing three
 * fields out of twelve and reporting success - the user would have no way to
 * know what was lost.
 *
 * And it refuses to read a profile that is not the user's own. Importing a third
 * party's employment history and hometown into a personal file is not a feature,
 * and "it was on screen" is not consent.
 */

/** One job, as the page presents it. */
export interface RawPosition {
  title: string;
  company: string;
  dates: string | null;
  /** Prose the user wrote about the role. The most useful part for voice. */
  description: string | null;
}

export interface RawEducation {
  school: string;
  /** LinkedIn runs degree and field together in one line; kept unsplit. */
  credential: string | null;
}

export interface RawLinkedInProfile {
  name: string | null;
  headline: string | null;
  location: string | null;
  about: string | null;
  positions: RawPosition[];
  education: RawEducation[];
  skills: string[];
  /** What could not be read. Surfaced to the user rather than swallowed. */
  warnings: string[];
}

const clean = (s: string | null | undefined): string | null => {
  if (!s) return null;
  // LinkedIn duplicates most visible strings into an aria-hidden span and a
  // visually-hidden one, so textContent yields "MadridMadrid" constantly.
  const flat = s.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  const half = flat.slice(0, Math.floor(flat.length / 2)).trim();
  if (half && half.length > 2 && flat === `${half}${half}`) return half;
  if (half && half.length > 2 && flat === `${half} ${half}`) return half;
  return flat;
};

/** Prefer the visible copy of a doubled string. */
function visibleText(el: Element | null): string | null {
  if (!el) return null;
  const preferred = el.querySelector('[aria-hidden="true"]');
  return clean((preferred ?? el).textContent);
}

/**
 * Is this the signed-in user's own profile?
 *
 * Detected from affordances LinkedIn only renders on your own page. Deliberately
 * a whitelist of positive signals rather than a guess from the URL: /in/<slug>
 * looks identical for everyone, and defaulting to "probably yours" would import
 * a stranger's history the first time it was wrong.
 */
export function isOwnProfile(doc: Document): boolean {
  const signals = [
    'a[href*="/edit/forms/"]',
    'button[aria-label*="Edit intro"]',
    'button[aria-label*="Editar presentaci"]',
    'a[href*="/public-profile/settings"]',
    'button[aria-label*="Add profile section"]',
    'button[aria-label*="Añadir secci"]',
    'a[href*="/in/me/"]',
  ];
  if (signals.some((s) => doc.querySelector(s))) return true;

  // "Open to" / "Disponible para" is an own-profile-only control.
  const buttons = [...doc.querySelectorAll("button, a")];
  return buttons.some((b) => {
    const t = (b.textContent ?? "").trim().toLowerCase();
    return t === "open to" || t === "disponible para" || t.startsWith("add profile section");
  });
}

/** Is this a LinkedIn profile page at all? */
export const isProfilePage = (url: string): boolean =>
  /^https:\/\/([a-z]+\.)?linkedin\.com\/in\/[^/]+/i.test(url);

/**
 * Find a profile section by its anchor.
 *
 * LinkedIn marks each section with a `<div id="about">`-style anchor whose
 * enclosing <section> holds the content. The anchor id has been stable far
 * longer than any class name, which is why it is the primary strategy; the
 * heading-text fallback covers a localised page that has changed the ids.
 */
function findSection(doc: Document, id: string, headings: string[]): Element | null {
  const anchor = doc.getElementById(id);
  const viaAnchor = anchor?.closest("section");
  if (viaAnchor) return viaAnchor;

  for (const section of doc.querySelectorAll("section")) {
    const heading = visibleText(section.querySelector("h2"))?.toLowerCase() ?? "";
    if (headings.some((h) => heading.includes(h))) return section;
  }
  return null;
}

/** The repeated entity rows inside a section. */
function entityRows(section: Element): Element[] {
  const modern = [...section.querySelectorAll('[data-view-name="profile-component-entity"]')];
  if (modern.length > 0) return modern;
  // Older layout: a plain list under the section.
  const items = [...section.querySelectorAll(":scope > div > ul > li, :scope > ul > li")];
  return items;
}

export function extractLinkedInProfile(doc: Document, url: string): RawLinkedInProfile {
  const warnings: string[] = [];

  const name = visibleText(doc.querySelector("main h1")) ?? visibleText(doc.querySelector("h1"));
  if (!name) warnings.push("could not read your name");

  // The headline is the line directly under the name in the top card.
  const topCard = doc.querySelector("main section");
  const headline =
    visibleText(topCard?.querySelector(".text-body-medium") ?? null) ??
    visibleText(doc.querySelector(".text-body-medium.break-words") ?? null);
  if (!headline) warnings.push("could not read your headline");

  const location =
    visibleText(topCard?.querySelector(".text-body-small.inline") ?? null) ??
    visibleText(doc.querySelector('[class*="top-card"] [class*="text-body-small"]') ?? null);
  if (!location) warnings.push("could not read your location");

  // --- About -----------------------------------------------------------------
  const aboutSection = findSection(doc, "about", ["about", "acerca de", "extracto"]);
  const about = aboutSection
    ? visibleText(
        aboutSection.querySelector('[class*="inline-show-more-text"]') ??
          aboutSection.querySelector(":scope > div:last-child"),
      )
    : null;
  if (!about) warnings.push("could not read your About section");

  // --- Experience ------------------------------------------------------------
  const expSection = findSection(doc, "experience", ["experience", "experiencia"]);
  const positions: RawPosition[] = [];
  if (!expSection) {
    warnings.push("could not find your Experience section");
  } else {
    for (const row of entityRows(expSection)) {
      const lines = [...row.querySelectorAll("span, div")]
        .map((n) => visibleText(n))
        .filter((t): t is string => !!t && t.length > 1);
      const unique = [...new Set(lines)];
      const title = unique[0] ?? null;
      const company = unique[1] ?? null;
      if (!title) continue;
      const dates = unique.find((l) => /\d{4}/.test(l) && /[-–·]|present|actualidad/i.test(l)) ?? null;
      // The description is the longest line: a sentence, not a label.
      const description = unique.filter((l) => l.length > 80).sort((a, b) => b.length - a.length)[0] ?? null;
      positions.push({
        title,
        company: company ?? "",
        dates,
        description,
      });
    }
    if (positions.length === 0) warnings.push("your Experience section was empty or unreadable");
  }

  // --- Education -------------------------------------------------------------
  const eduSection = findSection(doc, "education", ["education", "educación", "formación"]);
  const education: RawEducation[] = [];
  if (!eduSection) {
    warnings.push("could not find your Education section");
  } else {
    for (const row of entityRows(eduSection)) {
      const lines = [...new Set(
        [...row.querySelectorAll("span, div")].map((n) => visibleText(n)).filter((t): t is string => !!t && t.length > 1),
      )];
      const school = lines[0];
      if (!school) continue;
      education.push({ school, credential: lines[1] ?? null });
    }
  }

  // --- Skills ----------------------------------------------------------------
  const skillsSection = findSection(doc, "skills", ["skills", "aptitudes", "conocimientos"]);
  const skills: string[] = [];
  if (!skillsSection) {
    warnings.push("could not find your Skills section (it may be on a separate page)");
  } else {
    for (const row of entityRows(skillsSection)) {
      const first = visibleText(row.querySelector("span, div"));
      // Skip the endorsement counts that sit in the same rows.
      if (first && first.length > 1 && !/^\d+$/.test(first) && !/endorsement|validacion/i.test(first)) {
        skills.push(first);
      }
    }
  }

  return {
    name,
    headline,
    location,
    about,
    positions: positions.slice(0, 8),
    education: education.slice(0, 5),
    skills: [...new Set(skills)].slice(0, 30),
    warnings,
  };
}

/** Nothing worth importing. Used to refuse rather than send an empty payload. */
export const isEmptyProfile = (p: RawLinkedInProfile): boolean =>
  !p.headline && !p.about && p.positions.length === 0 && p.education.length === 0 && p.skills.length === 0;
