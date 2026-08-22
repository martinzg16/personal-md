/**
 * The interview: what to ask, once, so the profile is not empty.
 *
 * Nothing downstream works against an empty profile - there is nothing to fill
 * and nothing to draft from - so this is the step that makes the tool real. It
 * asks two different kinds of thing, and the distinction runs through the whole
 * codebase:
 *
 *  - Facts are short and single-valued. They are filled verbatim by the
 *    deterministic matcher with no model call, which is why a NIF can be useful
 *    here while never appearing in a prompt.
 *
 *  - Open questions are the ones worth drafting. Each seeds an Answer under a
 *    canonical key, and that stored text is later used two ways at once: as
 *    material to draw on, and as an exemplar of how this person actually writes.
 *    That second use is why the interview asks for real prose rather than bullet
 *    points, and why a skipped question is better than a placeholder one.
 *
 * Everything is optional and resumable. A profile with four facts and one answer
 * is already more useful than none, so the flow never blocks on completeness.
 */

import type { Genre, Lang } from "./types.ts";

export type FactInput = "text" | "number" | "email" | "tel" | "textarea";

export interface InterviewFact {
  key: string;
  label: { en: string; es: string };
  /** Shown under the input. Explains why it is asked, not what it is. */
  help?: { en: string; es: string };
  input: FactInput;
  placeholder?: string;
}

export interface InterviewSection {
  id: string;
  title: { en: string; es: string };
  blurb: { en: string; es: string };
  facts: InterviewFact[];
}

/**
 * Facts, grouped the way a person thinks about them rather than the way the
 * keys are namespaced.
 */
export const INTERVIEW_SECTIONS: InterviewSection[] = [
  {
    id: "identity",
    title: { en: "Who you are", es: "Quién eres" },
    blurb: {
      en: "The fields every form starts with. Most of these are filled locally and never sent anywhere.",
      es: "Los campos con los que empieza cualquier formulario. Casi todos se rellenan en local y nunca se envían.",
    },
    facts: [
      {
        key: "personal.full_name",
        label: { en: "Full name", es: "Nombre completo" },
        input: "text",
      },
      { key: "personal.email", label: { en: "Email", es: "Correo" }, input: "email" },
      { key: "personal.phone", label: { en: "Phone", es: "Teléfono" }, input: "tel" },
      {
        key: "personal.nif",
        label: { en: "NIF / NIE", es: "NIF / NIE" },
        help: {
          en: "Needed for Spanish government forms. Stored locally and never included in a prompt.",
          es: "Necesario para trámites con la Administración. Se guarda en local y nunca se envía a un modelo.",
        },
        input: "text",
      },
      {
        key: "personal.city",
        label: { en: "City", es: "Ciudad" },
        help: {
          en: "City only. A full address is stored separately and never sent.",
          es: "Solo la ciudad. La dirección completa se guarda aparte y nunca se envía.",
        },
        input: "text",
      },
      {
        key: "personal.address_exact",
        label: { en: "Full address", es: "Dirección completa" },
        input: "text",
      },
    ],
  },
  {
    id: "work",
    title: { en: "Work", es: "Trabajo" },
    blurb: {
      en: "These do shape drafted answers, so they are included in prompts.",
      es: "Estos sí influyen en las respuestas redactadas, así que se incluyen en los prompts.",
    },
    facts: [
      {
        key: "work.current_role",
        label: { en: "Current role", es: "Puesto actual" },
        input: "text",
        placeholder: "Product Manager",
      },
      {
        key: "work.current_employer",
        label: { en: "Current employer", es: "Empresa actual" },
        input: "text",
      },
      {
        key: "work.years_experience",
        label: { en: "Years of experience", es: "Años de experiencia" },
        input: "number",
      },
      {
        key: "work.domain",
        label: { en: "Domain you work in", es: "Sector" },
        input: "text",
        placeholder: "fintech, tax",
      },
      {
        key: "work.notice_period",
        label: { en: "Notice period", es: "Periodo de preaviso" },
        input: "text",
        placeholder: "15 days",
      },
    ],
  },
  {
    id: "logistics",
    title: { en: "Logistics", es: "Logística" },
    blurb: {
      en: "The questions applications ask late and you answer badly because you are tired.",
      es: "Lo que preguntan al final y contestas mal porque ya estás cansado.",
    },
    facts: [
      {
        key: "logistics.salary_expectation",
        label: { en: "Salary expectation", es: "Expectativa salarial" },
        input: "text",
        placeholder: "70.000 EUR",
      },
      {
        key: "logistics.availability",
        label: { en: "Availability", es: "Disponibilidad" },
        input: "text",
        placeholder: "immediately, 1 month",
      },
      {
        key: "logistics.remote_preference",
        label: { en: "Remote preference", es: "Preferencia de remoto" },
        input: "text",
        placeholder: "hybrid, 2 days office",
      },
      {
        key: "logistics.work_authorisation",
        label: { en: "Work authorisation", es: "Permiso de trabajo" },
        input: "text",
        placeholder: "EU citizen",
      },
      {
        key: "languages.spoken",
        label: { en: "Languages", es: "Idiomas" },
        input: "text",
        placeholder: "Spanish native, English C1",
      },
    ],
  },
  {
    id: "education",
    title: { en: "Education", es: "Formación" },
    blurb: {
      en: "Asked on nearly every application form, and rarely worth retyping.",
      es: "Lo piden en casi todos los formularios y no merece la pena reescribirlo.",
    },
    facts: [
      {
        key: "education.highest_level",
        label: { en: "Highest level", es: "Nivel más alto" },
        input: "text",
        placeholder: "Licenciatura, MSc",
      },
      { key: "education.field", label: { en: "Field", es: "Especialidad" }, input: "text" },
      {
        key: "education.institution",
        label: { en: "Institution", es: "Centro" },
        input: "text",
      },
    ],
  },
];

export interface InterviewQuestion {
  canonicalKey: string;
  prompt: { en: string; es: string };
  /** Why this one is worth answering properly, in the user's terms. */
  why: { en: string; es: string };
  genre: Genre;
  /** Rough target so the seeded answer is a usable voice exemplar. */
  suggestedWords: number;
}

/**
 * The open questions worth seeding.
 *
 * Chosen because they recur across employers rather than because they are
 * interesting: each one asked again in any language resolves to the same
 * canonical key and costs nothing to recognise thereafter.
 */
export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    canonicalKey: "experience.relevant_background",
    prompt: {
      en: "Tell us about yourself and your background.",
      es: "Háblanos de ti y de tu experiencia.",
    },
    why: {
      en: "The most reused answer there is, and the best single example of how you write.",
      es: "La respuesta que más se reutiliza, y el mejor ejemplo de cómo escribes.",
    },
    genre: "job_application",
    suggestedWords: 150,
  },
  {
    canonicalKey: "motivation.why_this_company",
    prompt: {
      en: "Why do you want to work here?",
      es: "¿Por qué te interesa esta empresa?",
    },
    why: {
      en: "Write the part that is true of every company you would apply to. The company-specific line gets drafted per form.",
      es: "Escribe la parte que es cierta para cualquier empresa. La frase concreta se redacta en cada formulario.",
    },
    genre: "job_application",
    suggestedWords: 120,
  },
  {
    canonicalKey: "motivation.why_this_role",
    prompt: {
      en: "Why this role, and why now?",
      es: "¿Por qué este puesto y por qué ahora?",
    },
    why: {
      en: "Asked nearly as often as the company question, and answered badly when rushed.",
      es: "Se pregunta casi tanto como la anterior, y se contesta mal con prisa.",
    },
    genre: "job_application",
    suggestedWords: 120,
  },
  {
    canonicalKey: "experience.leadership_story",
    prompt: {
      en: "Describe a time you led a project.",
      es: "Describe una vez que lideraste un proyecto.",
    },
    why: {
      en: "Include the real numbers. A drafted answer can only reuse figures you have written down somewhere.",
      es: "Incluye las cifras reales. Una respuesta redactada solo puede reutilizar datos que hayas escrito.",
    },
    genre: "job_application",
    suggestedWords: 180,
  },
  {
    canonicalKey: "experience.conflict_or_failure",
    prompt: {
      en: "Describe something that went wrong, and what you did about it.",
      es: "Describe algo que salió mal y qué hiciste al respecto.",
    },
    why: {
      en: "Hard to invent under time pressure, so worth having ready.",
      es: "Difícil de improvisar con prisa, así que mejor tenerlo listo.",
    },
    genre: "job_application",
    suggestedWords: 180,
  },
  {
    canonicalKey: "experience.metric_impact",
    prompt: {
      en: "What is the impact you are most proud of? Include the number.",
      es: "¿Cuál es el impacto del que estás más orgulloso? Incluye la cifra.",
    },
    why: {
      en: "The single most reusable paragraph you own. Concrete figures make every other draft better.",
      es: "El párrafo más reutilizable que tienes. Las cifras concretas mejoran el resto de respuestas.",
    },
    genre: "job_application",
    suggestedWords: 120,
  },
  {
    canonicalKey: "skills.strengths",
    prompt: {
      en: "What are you unusually good at?",
      es: "¿En qué eres especialmente bueno?",
    },
    why: {
      en: "Phrase it the way you would say it out loud, not the way a job ad would.",
      es: "Dilo como lo dirías en voz alta, no como lo diría una oferta de empleo.",
    },
    genre: "job_application",
    suggestedWords: 100,
  },
  {
    canonicalKey: "skills.weaknesses",
    prompt: {
      en: "What are you working on improving?",
      es: "¿Qué estás intentando mejorar?",
    },
    why: {
      en: "Answer it once, honestly, and stop rewriting it at 11pm.",
      es: "Contéstalo una vez, en serio, y deja de reescribirlo a las 11 de la noche.",
    },
    genre: "job_application",
    suggestedWords: 100,
  },
];

/** Every fact key the interview can write. Used to validate the catalogue. */
export function interviewFactKeys(): string[] {
  return INTERVIEW_SECTIONS.flatMap((s) => s.facts.map((f) => f.key));
}

/** Every canonical key the interview can seed. */
export function interviewCanonicalKeys(): string[] {
  return INTERVIEW_QUESTIONS.map((q) => q.canonicalKey);
}

export const pickLang = <T>(pair: { en: T; es: T }, lang: Lang): T => pair[lang];
