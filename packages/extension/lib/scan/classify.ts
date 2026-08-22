/**
 * Deciding what a field wants.
 *
 * Adapted from the prior spike's classifier, keeping its bilingual pattern set,
 * with three substantive changes:
 *
 *  - Open-question detection. The spike had `text.message` and
 *    `text.description` as ordinary categories, which is not enough: whether a
 *    field wants a paragraph is the single most important distinction in this
 *    tool, because it decides between an instant local fill and a ~4.5s drafted
 *    answer. It is now decided structurally (textarea, long maxlength, a label
 *    ending in a question mark) rather than by keyword alone.
 *
 *  - Categories for the things a job application actually asks and the spike had
 *    no name for: salary expectation, notice period, availability, work
 *    authorisation, years of experience, languages.
 *
 *  - "Nombre y apellidos" now reads as a full name. The spike matched bare
 *    `nombre` to first-name, so the most common Spanish full-name label was
 *    misclassified.
 */

import type { FieldCategory, FormPurpose } from "./types.ts";

interface Rule {
  category: FieldCategory;
  /**
   * Optional. A rule keyed purely on input type must have none: an earlier
   * version gave file.upload `patterns: [/./]`, which matched any field with any
   * text at the highest weight and so won every single field on the page.
   */
  patterns?: RegExp[];
  inputTypes?: string[];
  autocomplete?: string[];
  weight: number;
}

/** Highest weights are the fields we must never touch. */
const RULES: Rule[] = [
  {
    category: "auth.password.confirm",
    patterns: [/confirm.*pass|repeat.*pass|verificar.*(clave|contrase)|repetir.*contrase/i],
    inputTypes: ["password"],
    weight: 12,
  },
  {
    category: "auth.password",
    patterns: [/password|contrase|\bclave\b/i],
    inputTypes: ["password"],
    autocomplete: ["current-password", "new-password"],
    weight: 12,
  },
  {
    category: "financial.card.cvv",
    patterns: [/\bcvv\b|\bcvc\b|security.?code|c(ó|o)digo.?(de.?)?seguridad/i],
    autocomplete: ["cc-csc"],
    weight: 12,
  },
  {
    category: "financial.card.number",
    patterns: [/card.?number|n(ú|u)mero.?(de.?)?tarjeta|cc.?num/i],
    autocomplete: ["cc-number"],
    weight: 12,
  },
  {
    category: "financial.card.expiry",
    patterns: [/expir|caducidad|vencimiento/i],
    autocomplete: ["cc-exp", "cc-exp-month", "cc-exp-year"],
    weight: 11,
  },
  { category: "file.upload", inputTypes: ["file"], weight: 12 },

  { category: "auth.username", patterns: [/username|usuario|user.?name|login/i], autocomplete: ["username"], weight: 8 },

  // Identity
  {
    category: "personal.email",
    patterns: [/e.?mail|correo/i],
    inputTypes: ["email"],
    autocomplete: ["email"],
    weight: 9,
  },
  {
    category: "personal.phone",
    patterns: [/phone|tel(é|e)fono|m(ó|o)vil|mobile|\bcel\b/i],
    inputTypes: ["tel"],
    autocomplete: ["tel", "tel-national"],
    weight: 9,
  },
  {
    category: "personal.name.full",
    // "Nombre y apellidos" is the usual Spanish full-name label and must beat
    // the bare-`nombre` first-name rule, hence the higher weight.
    patterns: [/full.?name|nombre.*apellido|nombre.*completo|your.?name|nombre.?y.?apellidos/i],
    autocomplete: ["name"],
    weight: 9,
  },
  {
    category: "personal.name.first",
    patterns: [/first.?name|given.?name|^nombre$|\bnombre\b(?!.*(apellido|completo|empresa|company|usuario))/i],
    autocomplete: ["given-name"],
    weight: 8,
  },
  {
    category: "personal.name.last",
    patterns: [/last.?name|surname|family.?name|apellidos?/i],
    autocomplete: ["family-name"],
    weight: 8,
  },
  {
    category: "personal.nif",
    patterns: [/\bnif\b|\bnie\b|\bdni\b|\bcif\b|tax.?id|id.?fiscal|documento.?de.?identidad/i],
    weight: 10,
  },
  {
    category: "personal.ssn",
    patterns: [/\bssn\b|social.?security|seguridad.?social|\bnuss\b/i],
    weight: 10,
  },
  {
    category: "personal.birthdate",
    patterns: [/birth|nacimiento|fecha.*nac|\bdob\b|cumplea/i],
    inputTypes: ["date"],
    autocomplete: ["bday"],
    weight: 8,
  },
  { category: "personal.gender", patterns: [/gender|sexo|g(é|e)nero/i], autocomplete: ["sex"], weight: 7 },
  { category: "personal.nationality", patterns: [/nationality|nacionalidad/i], weight: 8 },

  // Address
  {
    category: "address.zip",
    patterns: [/zip|postal|c(ó|o)digo.?postal|\bcp\b/i],
    autocomplete: ["postal-code"],
    weight: 9,
  },
  {
    category: "address.city",
    patterns: [/city|ciudad|localidad|poblaci(ó|o)n|municipio/i],
    autocomplete: ["address-level2"],
    weight: 8,
  },
  {
    category: "address.state",
    patterns: [/state|province|provincia|comunidad|regi(ó|o)n/i],
    autocomplete: ["address-level1"],
    weight: 7,
  },
  {
    category: "address.country",
    patterns: [/country|pa(í|i)s/i],
    autocomplete: ["country", "country-name"],
    weight: 8,
  },
  {
    category: "address.street2",
    patterns: [/address.?(line.?)?2|\bapt\b|suite|piso|planta|puerta|escalera/i],
    autocomplete: ["address-line2"],
    weight: 7,
  },
  {
    category: "address.street",
    patterns: [/street|address|direcci(ó|o)n|calle|domicilio/i],
    autocomplete: ["street-address", "address-line1"],
    weight: 6,
  },

  // Work and applications
  {
    category: "work.salary_expectation",
    patterns: [/salary|expectativa.?salarial|salarial|remuneraci(ó|o)n|pretensiones|compensation/i],
    weight: 9,
  },
  {
    category: "work.notice_period",
    patterns: [/notice.?period|preaviso/i],
    weight: 9,
  },
  {
    category: "work.availability",
    patterns: [/availability|disponibilidad|start.?date|fecha.?de.?incorporaci(ó|o)n|incorporaci(ó|o)n/i],
    weight: 8,
  },
  {
    category: "work.authorisation",
    patterns: [/work.?(authoriz|authoris|permit)|permiso.?de.?trabajo|visa|sponsorship|right.?to.?work/i,
    ],
    weight: 9,
  },
  {
    category: "work.remote_preference",
    patterns: [/remote|teletrabajo|h(í|i)brido|hybrid|on.?site|presencial/i],
    weight: 7,
  },
  {
    category: "work.years_experience",
    patterns: [/years?.?of.?experience|a(ñ|n)os.?de.?experiencia|experience.?\(years\)/i],
    weight: 9,
  },
  { category: "work.title", patterns: [/job.?title|cargo|puesto|position|occupation/i], autocomplete: ["organization-title"], weight: 7 },
  { category: "work.company", patterns: [/company|empresa|organiz|compa(ñ|n)(í|i)a|employer/i], autocomplete: ["organization"], weight: 7 },
  { category: "languages.spoken", patterns: [/languages?|idiomas?|nivel.?de.?ingl(é|e)s/i], weight: 8 },

  // Education
  { category: "education.institution", patterns: [/university|universidad|school|colegio|centro.?(educativo|de.?estudios)|institution/i], weight: 8 },
  { category: "education.level", patterns: [/degree|titulaci(ó|o)n|nivel.?(de.?)?estudios|education.?level|highest.?(level|education)/i], weight: 8 },
  { category: "education.field", patterns: [/field.?of.?study|especialidad|carrera|major/i], weight: 8 },

  { category: "financial.iban", patterns: [/\biban\b|cuenta.?bancaria|bank.?account|n(ú|u)mero.?de.?cuenta/i], weight: 9 },
  { category: "web.linkedin", patterns: [/linkedin/i], weight: 9 },
  { category: "web.url", patterns: [/website|\burl\b|portfolio|sitio.?web|p(á|a)gina.?web/i], inputTypes: ["url"], autocomplete: ["url"], weight: 7 },

  {
    category: "consent.checkbox",
    patterns: [/accept|agree|terms|privacy|consent|acepto|condiciones|privacidad|rgpd|gdpr/i],
    inputTypes: ["checkbox"],
    weight: 7,
  },
];

export interface ClassifyInput {
  name: string;
  htmlId: string;
  label: string;
  placeholder: string;
  ariaLabel: string;
  inputType: string;
  autocomplete: string;
  tag: "input" | "textarea" | "select";
  maxLength: number | null;
}

/**
 * Does this field want a paragraph?
 *
 * Decided structurally rather than by keyword, because the keyword approach
 * misses every question phrased in a way nobody predicted - and that is most of
 * them. A textarea is the strongest signal; a very long maxlength on a text
 * input is the next; a label that is literally a question is the third.
 */
export function isOpenQuestion(input: ClassifyInput): boolean {
  if (input.tag === "textarea") return true;
  if (input.tag === "select") return false;
  if (input.inputType && !["text", "search", ""].includes(input.inputType)) return false;

  if (input.maxLength !== null && input.maxLength >= 200) return true;

  const label = `${input.label} ${input.placeholder} ${input.ariaLabel}`.trim();
  if (!label) return false;

  // A question mark, or an imperative that asks for prose.
  if (/\?\s*$/.test(label)) return true;
  if (
    /^(describe|tell us|explain|why|what|how|cu(é|e)ntanos|describe|explica|por qu(é|e)|qu(é|e)|c(ó|o)mo)\b/i.test(
      label,
    ) &&
    label.split(/\s+/).length >= 4
  ) {
    return true;
  }
  return false;
}

const haystack = (i: ClassifyInput): string =>
  [i.label, i.ariaLabel, i.placeholder, i.name, i.htmlId].filter(Boolean).join(" ");

export function classifyField(input: ClassifyInput): {
  category: FieldCategory;
  confidence: number;
} {
  const text = haystack(input);
  let best: FieldCategory = "unknown";
  let bestScore = 0;
  let bestWeight = 1;

  for (const rule of RULES) {
    let score = 0;

    // An autocomplete token is the page telling us directly, so it outranks
    // every guess we could make from prose.
    if (input.autocomplete && rule.autocomplete?.includes(input.autocomplete)) {
      score += rule.weight * 2;
    }
    if (input.inputType && rule.inputTypes?.includes(input.inputType)) {
      score += rule.weight * 1.5;
    }
    if (rule.patterns?.some((p) => p.test(text))) {
      score += rule.weight;
    }

    if (score > bestScore) {
      bestScore = score;
      best = rule.category;
      bestWeight = rule.weight;
    }
  }

  // An open question wins unless the field is one we must never touch, because
  // a textarea labelled "Address" is still a textarea and drafting it is wrong,
  // but a textarea labelled "Why this role?" must never be treated as a short
  // field and filled with a stored value.
  const forbidden = best.startsWith("auth.") || best.startsWith("financial.card") || best === "file.upload";
  if (!forbidden && isOpenQuestion(input) && bestScore < bestWeight * 2) {
    return { category: "open.question", confidence: 0.75 };
  }

  if (bestScore === 0) return { category: "unknown", confidence: 0 };

  // Normalised against the best achievable score for the winning rule, so
  // confidence means "how many signals agreed" rather than an arbitrary scale.
  return { category: best, confidence: Math.min(bestScore / (bestWeight * 4.5), 1) };
}

const PURPOSE_PATTERNS: { purpose: FormPurpose; patterns: RegExp[] }[] = [
  { purpose: "login", patterns: [/log.?in|sign.?in|iniciar.*sesi(ó|o)n|acceder/i] },
  { purpose: "registration", patterns: [/sign.?up|register|registro|crear.*cuenta|create.*account/i] },
  { purpose: "job_application", patterns: [/apply|application|solicitud|candidatura|empleo|vacante|careers?|jobs?|greenhouse|lever|workday|ashby/i] },
  { purpose: "tax", patterns: [/tax|fiscal|hacienda|impuesto|declaraci(ó|o)n|renta|irpf|aeat|sede\./i] },
  { purpose: "survey", patterns: [/survey|encuesta|questionnaire|cuestionario|feedback/i] },
  { purpose: "checkout", patterns: [/checkout|payment|pago|compra|purchase|order/i] },
  { purpose: "contact", patterns: [/contact|contacto|get.*touch|escr(í|i)benos/i] },
  { purpose: "profile", patterns: [/profile|perfil|account.*settings|mi.*cuenta|configuraci(ó|o)n/i] },
  { purpose: "search", patterns: [/search|buscar|b(ú|u)squeda/i] },
];

export function detectFormPurpose(
  sources: { title: string; url: string; formAction: string; formId: string; formClass: string },
  categories: FieldCategory[],
): FormPurpose {
  const text = [sources.title, sources.url, sources.formAction, sources.formId, sources.formClass]
    .filter(Boolean)
    .join(" ");

  for (const { purpose, patterns } of PURPOSE_PATTERNS) {
    if (patterns.some((p) => p.test(text))) return purpose;
  }

  // Shape-based fallbacks.
  const has = (c: FieldCategory) => categories.includes(c);
  if (has("auth.password") && categories.length <= 3) return "login";
  if (has("auth.password")) return "registration";
  if (has("financial.card.number")) return "checkout";
  if (categories.filter((c) => c === "open.question").length >= 2) return "job_application";

  return "unknown";
}
