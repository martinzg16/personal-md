/**
 * Small DOM helpers that must not depend on browser globals.
 *
 * `CSS.escape` is the specific reason this file exists. It is available in every
 * browser this extension targets, but not in jsdom and not in Node, so reaching
 * for the global directly made every scanner module untestable outside a real
 * browser. Escaping an attribute value is also too important to skip: an id
 * containing a quote would otherwise break out of the selector.
 */

interface MaybeCSS {
  CSS?: { escape?: (value: string) => string };
}

/**
 * Escape a string for use inside a CSS selector.
 *
 * Uses the platform implementation when there is one. The fallback follows the
 * same rule the spec does for the cases that matter here: escape anything that
 * is not a safe identifier character, and escape a leading digit by code point
 * so `#1foo` cannot be produced.
 */
export function cssEscape(value: string): string {
  const platform = (globalThis as MaybeCSS).CSS?.escape;
  if (typeof platform === "function") return platform(value);

  let out = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i] as string;
    const code = value.codePointAt(i) as number;

    if (i === 0 && code >= 0x30 && code <= 0x39) {
      out += `\\${code.toString(16)} `;
      continue;
    }
    out += /[a-zA-Z0-9_-]/.test(ch) ? ch : `\\${ch}`;
  }
  return out;
}

/**
 * Tag checks by name rather than `instanceof`.
 *
 * Elements from a jsdom document are not instances of the *global* HTMLElement
 * constructors, and in a browser an element from an iframe is not an instance of
 * the parent frame's either. Comparing tag names sidesteps both.
 */
export const tagNameOf = (el: Element): string => el.tagName.toLowerCase();

export const isTextControl = (el: Element): boolean => {
  const tag = tagNameOf(el);
  return tag === "textarea" || (tag === "input" && !isToggle(el));
};

export const isToggle = (el: Element): boolean => {
  if (tagNameOf(el) !== "input") return false;
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  return type === "checkbox" || type === "radio";
};

export const isSelect = (el: Element): boolean => tagNameOf(el) === "select";
