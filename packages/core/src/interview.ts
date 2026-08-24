/**
 * The interview: what to ask, once, so the profile is not empty.
 *
 * Nothing downstream works against an empty profile - there is nothing to fill
 * and nothing to draft from - so this is the step that makes the tool real.
 *
 * IT NO LONGER ASKS ANYBODY TO WRITE PROSE, AND THAT IS THE POINT.
 *
 * The first version of this asked eight open questions with a target of 100-180
 * words each. That is roughly twelve hundred words of writing before the product
 * has done anything for you, and the honest prediction for a stranger arriving
 * cold is that they answer two and leave. The questions were not wrong about what
 * a draft needs; they were wrong about how to get it.
 *
 * What a draft actually needs from a person is two different things, and only one
 * of them requires writing:
 *
 *  - THE SPECIFICS. Which project, how many people, which metric, from what to
 *    what. These are atoms. They are short, they are bounded, and a model can
 *    assemble prose from them far better than a tired person can at eleven at
 *    night. So they are asked as atoms: a tick box where the answer space is
 *    bounded, a number where it is a number, and a short line only where a
 *    specific genuinely has to be named. There is no textarea anywhere in this
 *    catalogue and the types make one impossible to add by accident.
 *
 *  - THE VOICE. How this person actually writes. This one cannot be tapped, so
 *    it is not asked at all: it comes from prose they have already written,
 *    imported from their own LinkedIn profile as an exemplar, plus one tap
 *    choosing which of three sample sentences sounds most like them. Reading
 *    something somebody already wrote beats asking them to write it again.
 *
 * Everything is stored as an ordinary Fact under a dotted key. That is a
 * deliberate non-decision: the PERSONAL.md format does not change, the file stays
 * hand-editable, the whole interview works with the companion process stopped, and
 * no model call happens while anybody is answering.
 *
 * Two invariants the atoms depend on, both enforced elsewhere and both worth
 * stating here because breaking either would be silent:
 *
 *  - Atoms must be SENDABLE, or drafting cannot use the thing they were collected
 *    for. They are listed explicitly in `SENDABLE_KEYS` rather than riding a
 *    wholesale `experience.*` prefix, because a prefix would quietly promote
 *    whatever anybody adds under it later - which is the exact mistake the
 *    `personal.*` prefix already made once.
 *  - Atoms must NEVER be autofilled into a third-party form. They are not in the
 *    scanner's `DIRECT` category map, so they cannot be, and "I co-led it" can
 *    never end up typed into an employer's text box.
 *
 * Everything is optional and resumable. A profile with four facts and one
 * declaration is more useful than none, so the flow never blocks on completeness.
 */

import type { Genre, Lang } from "./types.ts";

/**
 * How a value is collected.
 *
 * Note what is absent: there is no `textarea`. The only free input is a single
 * line with a hard character cap, for naming a specific. If a future question
 * seems to need a paragraph, it needs decomposing into atoms instead.
 */
export type FactInput = "text" | "number" | "email" | "tel" | "choice" | "multi";

/**
 * One option on a tick-box row or a code table.
 *
 * `code` is what the printed box carries and it is stable forever; `label` is
 * what the box means, and what gets stored. Storing the label rather than the
 * code is deliberate for the facts that get filled into other people's forms -
 * `logistics.availability` ends up typed verbatim into an employer's field, and
 * "1 mes" is a usable answer there where "03" is not.
 */
export interface FactOption {
  code: string;
  label: { en: string; es: string };
}

export interface InterviewFact {
  key: string;
  label: { en: string; es: string };
  /** Shown under the input. Explains why it is asked, not what it is. */
  help?: { en: string; es: string };
  input: FactInput;
  placeholder?: string;
  /** Required for `choice` and `multi`. */
  options?: FactOption[];
  /** For `multi`: the most that may be ticked. Keeps a shape from becoming a list. */
  max?: number;
  /**
   * For `text`: a hard cap, in characters.
   *
   * This is the mechanism that keeps a short line short. Without it, "the metric
   * that moved" becomes a paragraph, and the whole reason for this redesign is
   * that paragraphs are what nobody fills in.
   */
  maxLength?: number;
}

export interface InterviewSection {
  id: string;
  title: { en: string; es: string };
  blurb: { en: string; es: string };
  facts: InterviewFact[];
}

/** Shorthand for the option lists below, which are otherwise mostly punctuation. */
const opts = (...pairs: [string, string, string][]): FactOption[] =>
  pairs.map(([code, es, en]) => ({ code, label: { es, en } }));

/**
 * Facts, grouped the way a person thinks about them rather than the way the keys
 * are namespaced.
 *
 * Every field whose answer space is actually bounded is now a tick box. That is
 * most of them: an availability, a notice period, a remote preference and an
 * education level all have five or six real answers, and typing one of six known
 * strings is slower and less accurate than pointing at it. What stays free text
 * is what genuinely varies - a name, an employer, a job title, a field of study.
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
        maxLength: 80,
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
        maxLength: 12,
      },
      {
        key: "personal.city",
        label: { en: "City", es: "Ciudad" },
        help: {
          en: "City only. A full address is stored separately and never sent.",
          es: "Solo la ciudad. La dirección completa se guarda aparte y nunca se envía.",
        },
        input: "text",
        maxLength: 40,
      },
      {
        key: "personal.address_exact",
        label: { en: "Full address", es: "Dirección completa" },
        help: {
          en: "Filled locally on forms that need it. Never included in a prompt.",
          es: "Se rellena en local en los formularios que la piden. Nunca se envía a un modelo.",
        },
        input: "text",
        maxLength: 120,
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
        maxLength: 60,
        placeholder: "Product Manager",
      },
      {
        key: "work.current_employer",
        label: { en: "Current employer", es: "Empresa actual" },
        input: "text",
        maxLength: 60,
      },
      {
        key: "work.years_experience",
        label: { en: "Years of experience", es: "Años de experiencia" },
        input: "number",
      },
      {
        key: "work.domain",
        label: { en: "Domain you work in", es: "Sector" },
        input: "multi",
        max: 3,
        options: opts(
          ["01", "fintech", "fintech"],
          ["02", "banca y seguros", "banking and insurance"],
          ["03", "impuestos y contabilidad", "tax and accounting"],
          ["04", "salud", "health"],
          ["05", "educación", "education"],
          ["06", "comercio electrónico", "e-commerce"],
          ["07", "movilidad y viajes", "mobility and travel"],
          ["08", "industria y logística", "industry and logistics"],
          ["09", "software para empresas", "enterprise software"],
          ["10", "sector público", "public sector"],
          ["11", "medios y entretenimiento", "media and entertainment"],
          ["12", "energía", "energy"],
        ),
      },
      {
        key: "work.notice_period",
        label: { en: "Notice period", es: "Periodo de preaviso" },
        input: "choice",
        options: opts(
          ["01", "ninguno", "none"],
          ["02", "15 días", "15 days"],
          ["03", "1 mes", "1 month"],
          ["04", "2 meses", "2 months"],
          ["05", "3 meses", "3 months"],
        ),
      },
    ],
  },
  {
    id: "logistics",
    title: { en: "Conditions", es: "Condiciones" },
    blurb: {
      en: "The questions applications ask late, and you answer badly because you are tired. Now they are boxes.",
      es: "Lo que preguntan al final y contestas mal porque ya estás cansado. Ahora son casillas.",
    },
    facts: [
      {
        key: "logistics.salary_expectation",
        label: { en: "Salary expectation", es: "Expectativa salarial" },
        help: {
          en: "A band is enough. Applications almost always accept a range.",
          es: "Con una banda basta. Los formularios casi siempre aceptan un rango.",
        },
        input: "choice",
        options: opts(
          ["01", "menos de 40.000 €", "under €40,000"],
          ["02", "40.000 - 55.000 €", "€40,000 - €55,000"],
          ["03", "55.000 - 70.000 €", "€55,000 - €70,000"],
          ["04", "70.000 - 90.000 €", "€70,000 - €90,000"],
          ["05", "90.000 - 120.000 €", "€90,000 - €120,000"],
          ["06", "más de 120.000 €", "over €120,000"],
        ),
      },
      {
        key: "logistics.availability",
        label: { en: "Availability", es: "Disponibilidad" },
        input: "choice",
        options: opts(
          ["01", "inmediata", "immediately"],
          ["02", "en 15 días", "in 15 days"],
          ["03", "en 1 mes", "in 1 month"],
          ["04", "en 2 meses", "in 2 months"],
          ["05", "en 3 meses o más", "in 3 months or more"],
        ),
      },
      {
        key: "logistics.remote_preference",
        label: { en: "Remote preference", es: "Preferencia de remoto" },
        input: "choice",
        options: opts(
          ["01", "remoto completo", "fully remote"],
          ["02", "híbrido, 1-2 días en oficina", "hybrid, 1-2 days in office"],
          ["03", "híbrido, 3-4 días en oficina", "hybrid, 3-4 days in office"],
          ["04", "presencial", "on site"],
          ["05", "indiferente", "no preference"],
        ),
      },
      {
        key: "logistics.work_authorisation",
        label: { en: "Work authorisation", es: "Permiso de trabajo" },
        input: "choice",
        options: opts(
          ["01", "ciudadanía UE", "EU citizen"],
          ["02", "permiso de trabajo en España", "Spanish work permit"],
          ["03", "permiso de trabajo en Reino Unido", "UK work permit"],
          ["04", "permiso de trabajo en EE. UU.", "US work authorisation"],
          ["05", "necesito patrocinio", "need sponsorship"],
        ),
      },
      {
        key: "languages.spoken",
        label: { en: "Languages", es: "Idiomas" },
        help: {
          en: "Tick what you would put on an application. Levels follow the European scale.",
          es: "Marca lo que pondrías en un formulario. Los niveles siguen la escala europea.",
        },
        input: "multi",
        max: 5,
        options: opts(
          ["01", "español nativo", "Spanish native"],
          ["02", "inglés C2", "English C2"],
          ["03", "inglés C1", "English C1"],
          ["04", "inglés B2", "English B2"],
          ["05", "catalán", "Catalan"],
          ["06", "gallego", "Galician"],
          ["07", "euskera", "Basque"],
          ["08", "francés", "French"],
          ["09", "alemán", "German"],
          ["10", "portugués", "Portuguese"],
          ["11", "italiano", "Italian"],
        ),
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
        input: "choice",
        options: opts(
          ["01", "ESO / secundaria", "secondary school"],
          ["02", "bachillerato", "upper secondary"],
          ["03", "formación profesional", "vocational training"],
          ["04", "grado", "bachelor's degree"],
          ["05", "licenciatura", "licenciatura"],
          ["06", "máster", "master's degree"],
          ["07", "doctorado", "doctorate"],
          ["08", "autodidacta", "self-taught"],
        ),
      },
      {
        key: "education.field",
        label: { en: "Field", es: "Especialidad" },
        input: "text",
        maxLength: 60,
      },
      {
        key: "education.institution",
        label: { en: "Institution", es: "Centro" },
        input: "text",
        maxLength: 80,
      },
    ],
  },
];

/**
 * A declaration: one recurring open question, decomposed into atoms.
 *
 * `canonicalKey` is the key a drafted answer will live under, and it is the same
 * key the old prose question used - so an answer imported or drafted later slots
 * into the identical place in the index, and every alias already learned still
 * resolves. The atoms are the material; the answer is what gets made from them.
 */
export interface InterviewDeclaration {
  canonicalKey: string;
  prompt: { en: string; es: string };
  /** Why this one is worth answering, in the user's terms. */
  why: { en: string; es: string };
  genre: Genre;
  /**
   * The atoms. Empty when `derived` is set.
   */
  atoms: InterviewFact[];
  /**
   * True when nothing needs asking: the answer is assembled from facts the
   * profile already holds. An asked question whose answer we already have is
   * the most expensive kind of question there is.
   */
  derived?: boolean;
  /**
   * For a derived declaration, the keys it is assembled from.
   *
   * Required rather than decorative. Treating "derived" as "always complete"
   * made an entirely empty profile report one declaration on file, which is the
   * document claiming something it does not have - so completeness for a derived
   * declaration is measured against these keys exactly like an asked one is
   * measured against its atoms.
   */
  derivedFrom?: string[];
}

/**
 * The declarations worth collecting.
 *
 * Chosen because they recur across employers rather than because they are
 * interesting: each one asked again in any language resolves to the same
 * canonical key and costs nothing to recognise thereafter.
 */
export const INTERVIEW_DECLARATIONS: InterviewDeclaration[] = [
  {
    canonicalKey: "experience.relevant_background",
    prompt: {
      en: "Tell us about yourself and your background.",
      es: "Háblanos de ti y de tu experiencia.",
    },
    why: {
      en: "Nothing to answer here. This one is assembled from your role, your years, your sector and your education - which you have already given.",
      es: "Aquí no hay nada que contestar. Esta se monta con tu puesto, tus años, tu sector y tu formación, que ya has dado.",
    },
    genre: "job_application",
    derived: true,
    derivedFrom: ["work.current_role", "work.years_experience", "work.domain"],
    atoms: [],
  },
  {
    canonicalKey: "motivation.why_this_company",
    prompt: {
      en: "Why do you want to work here?",
      es: "¿Por qué te interesa esta empresa?",
    },
    why: {
      en: "What is true of every company you would apply to. The line about the specific one gets drafted per form.",
      es: "Lo que es cierto de cualquier empresa a la que te presentarías. La frase concreta se redacta en cada formulario.",
    },
    genre: "job_application",
    atoms: [
      {
        key: "motivation.company.draws",
        label: { en: "What draws you to a company", es: "Qué te atrae de una empresa" },
        input: "multi",
        max: 3,
        options: opts(
          ["01", "el problema que resuelve", "the problem it solves"],
          ["02", "la calidad del producto", "the quality of the product"],
          ["03", "la escala del impacto", "the scale of the impact"],
          ["04", "la gente con la que trabajaría", "the people I would work with"],
          ["05", "autonomía para decidir", "autonomy to decide"],
          ["06", "lo que aprendería", "how much I would learn"],
          ["07", "que se toman en serio el oficio", "that they take the craft seriously"],
          ["08", "que trabajan en remoto de verdad", "that they are genuinely remote"],
        ),
      },
      {
        key: "motivation.company.size",
        label: { en: "Size you work best in", es: "Tamaño en el que trabajas mejor" },
        input: "choice",
        options: opts(
          ["01", "menos de 50 personas", "under 50 people"],
          ["02", "entre 50 y 500", "50 to 500"],
          ["03", "entre 500 y 5.000", "500 to 5,000"],
          ["04", "más de 5.000", "over 5,000"],
          ["05", "indiferente", "no preference"],
        ),
      },
      {
        key: "motivation.company.dealbreakers",
        label: { en: "What rules a company out", es: "Qué descarta una empresa" },
        input: "multi",
        max: 2,
        options: opts(
          ["01", "sin remoto", "no remote"],
          ["02", "cultura de horas", "long-hours culture"],
          ["03", "sin capacidad de decidir sobre el producto", "no product ownership"],
          ["04", "demasiado proceso", "heavy process"],
          ["05", "estrategia poco clara", "unclear strategy"],
        ),
      },
    ],
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
    atoms: [
      {
        key: "motivation.role.more_of",
        label: { en: "You want more of", es: "Quieres más de" },
        input: "multi",
        max: 2,
        options: opts(
          ["01", "decidir de verdad", "real ownership"],
          ["02", "estrategia", "strategy"],
          ["03", "construir con las manos", "hands-on building"],
          ["04", "llevar equipo", "leading people"],
          ["05", "datos y medición", "data and measurement"],
          ["06", "hablar con clientes", "talking to customers"],
        ),
      },
      {
        key: "motivation.role.less_of",
        label: { en: "You want less of", es: "Quieres menos de" },
        input: "multi",
        max: 2,
        options: opts(
          ["01", "apagar fuegos", "firefighting"],
          ["02", "reporting", "reporting"],
          ["03", "reuniones", "meetings"],
          ["04", "mantener lo viejo", "maintaining legacy"],
          ["05", "procesos de selección", "hiring processes"],
        ),
      },
      {
        key: "motivation.role.why_now",
        label: { en: "Why now", es: "Por qué ahora" },
        input: "choice",
        options: opts(
          ["01", "he tocado techo donde estoy", "I have hit the ceiling where I am"],
          ["02", "una reorganización cambió el puesto", "a reorg changed the job"],
          ["03", "el proyecto que me traía terminó", "the project that kept me here ended"],
          ["04", "quiero un alcance mayor", "I want a bigger scope"],
          ["05", "quiero una empresa más pequeña", "I want a smaller company"],
          ["06", "me cambio de ciudad", "I am relocating"],
        ),
      },
    ],
  },
  {
    canonicalKey: "experience.leadership_story",
    prompt: {
      en: "Describe a time you led a project.",
      es: "Describe una vez que lideraste un proyecto.",
    },
    why: {
      en: "The atoms are what a draft cannot invent: which project, how many people, and what was actually hard.",
      es: "Los datos son lo que una redacción no puede inventarse: qué proyecto, cuánta gente y qué fue difícil de verdad.",
    },
    genre: "job_application",
    atoms: [
      {
        key: "experience.leadership.project",
        label: { en: "The project, in a few words", es: "El proyecto, en pocas palabras" },
        input: "text",
        maxLength: 60,
        placeholder: "migración del checkout",
      },
      {
        key: "experience.leadership.role",
        label: { en: "Your part in it", es: "Tu papel" },
        input: "choice",
        options: opts(
          ["01", "lo lideré", "I led it"],
          ["02", "lo co-lideré", "I co-led it"],
          ["03", "lo empujé sin ser el jefe", "I drove it without owning it"],
          ["04", "lo patrociné", "I sponsored it"],
        ),
      },
      {
        key: "experience.leadership.team_size",
        label: { en: "People involved", es: "Personas implicadas" },
        input: "number",
      },
      {
        key: "experience.leadership.duration",
        label: { en: "How long it ran", es: "Cuánto duró" },
        input: "choice",
        options: opts(
          ["01", "semanas", "weeks"],
          ["02", "1 a 3 meses", "1 to 3 months"],
          ["03", "3 a 6 meses", "3 to 6 months"],
          ["04", "6 a 12 meses", "6 to 12 months"],
          ["05", "más de un año", "more than a year"],
        ),
      },
      {
        key: "experience.leadership.hardest",
        label: { en: "The hard part", es: "La parte difícil" },
        input: "choice",
        options: opts(
          ["01", "poner de acuerdo a varios equipos", "aligning several teams"],
          ["02", "nadie sabía qué había que hacer", "nobody knew what was needed"],
          ["03", "riesgo técnico", "technical risk"],
          ["04", "una fecha imposible", "an impossible deadline"],
          ["05", "una persona en contra", "one person against it"],
          ["06", "muy poca gente", "too few people"],
        ),
      },
    ],
  },
  {
    canonicalKey: "experience.conflict_or_failure",
    prompt: {
      en: "Describe something that went wrong, and what you did about it.",
      es: "Describe algo que salió mal y qué hiciste al respecto.",
    },
    why: {
      en: "Hard to invent under time pressure, so worth having on file.",
      es: "Difícil de improvisar con prisa, así que mejor tenerlo en el fichero.",
    },
    genre: "job_application",
    atoms: [
      {
        key: "experience.failure.kind",
        label: { en: "What happened", es: "Qué pasó" },
        input: "choice",
        options: opts(
          ["01", "construimos lo que no había que construir", "we built the wrong thing"],
          ["02", "no llegamos a la fecha", "we missed the date"],
          ["03", "choqué con alguien de peso", "I clashed with a senior stakeholder"],
          ["04", "algo se rompió en producción", "something broke in production"],
          ["05", "una contratación que no salió", "a hire that did not work out"],
          ["06", "tuve que dar marcha atrás", "I had to reverse a decision"],
        ),
      },
      {
        key: "experience.failure.what_i_did",
        label: { en: "What you did", es: "Qué hiciste" },
        input: "multi",
        max: 2,
        options: opts(
          ["01", "lo dije en voz alta y lo asumí", "said it out loud and owned it"],
          ["02", "lo revertí", "rolled it back"],
          ["03", "renegocié el alcance", "renegotiated the scope"],
          ["04", "pedí ayuda", "brought in help"],
          ["05", "cambié cómo lo hacíamos", "changed how we did it"],
          ["06", "reconstruí la confianza uno a uno", "rebuilt trust one to one"],
        ),
      },
      {
        key: "experience.failure.changed_after",
        label: { en: "What changed after", es: "Qué cambió después" },
        input: "choice",
        options: opts(
          ["01", "cambió un proceso", "a process changed"],
          ["02", "cambió cómo comunico", "how I communicate changed"],
          ["03", "cambió cómo estimo", "how I estimate changed"],
          ["04", "cambió quién decide", "who decides changed"],
          ["05", "nada estructural, aprendí yo", "nothing structural, I just learned"],
        ),
      },
    ],
  },
  {
    canonicalKey: "experience.metric_impact",
    prompt: {
      en: "What is the impact you are most proud of? Include the number.",
      es: "¿Cuál es el impacto del que estás más orgulloso? Incluye la cifra.",
    },
    why: {
      en: "The most reusable thing you own. A draft can only use a figure you have written down somewhere.",
      es: "Lo más reutilizable que tienes. Una redacción solo puede usar cifras que hayas escrito en algún sitio.",
    },
    genre: "job_application",
    atoms: [
      {
        key: "experience.impact.metric",
        label: { en: "The metric that moved", es: "La métrica que se movió" },
        input: "text",
        maxLength: 48,
        placeholder: "conversión a pago",
      },
      {
        key: "experience.impact.from",
        label: { en: "From", es: "De" },
        input: "text",
        maxLength: 16,
        placeholder: "22%",
      },
      {
        key: "experience.impact.to",
        label: { en: "To", es: "A" },
        input: "text",
        maxLength: 16,
        placeholder: "31%",
      },
      {
        key: "experience.impact.window",
        label: { en: "Over", es: "En" },
        input: "choice",
        options: opts(
          ["01", "unas semanas", "a few weeks"],
          ["02", "un trimestre", "one quarter"],
          ["03", "dos trimestres", "two quarters"],
          ["04", "un año", "a year"],
          ["05", "más de un año", "more than a year"],
        ),
      },
      {
        key: "experience.impact.contribution",
        label: { en: "Your part", es: "Tu parte" },
        help: {
          en: "Worth being exact. A draft that overstates your part is the kind of thing that gets caught in an interview.",
          es: "Merece la pena ser exacto. Una redacción que exagera tu parte es lo que te pillan en una entrevista.",
        },
        input: "choice",
        options: opts(
          ["01", "era mío", "it was mine"],
          ["02", "lideré al equipo que lo hizo", "I led the team that did it"],
          ["03", "contribuí", "I contributed to it"],
        ),
      },
    ],
  },
  {
    canonicalKey: "skills.strengths",
    prompt: {
      en: "What are you unusually good at?",
      es: "¿En qué eres especialmente bueno?",
    },
    why: {
      en: "Pick the three you would defend in an interview, not the three that sound best.",
      es: "Elige las tres que defenderías en una entrevista, no las tres que suenan mejor.",
    },
    genre: "job_application",
    atoms: [
      {
        key: "skills.strengths.top",
        label: { en: "Your three", es: "Tus tres" },
        input: "multi",
        max: 3,
        options: opts(
          ["01", "enmarcar el problema", "framing the problem"],
          ["02", "decir no", "saying no"],
          ["03", "escribir claro", "writing clearly"],
          ["04", "trabajar con datos", "working with data"],
          ["05", "sacar cosas rápido", "shipping quickly"],
          ["06", "bajar el ruido", "bringing the temperature down"],
          ["07", "profundidad técnica", "technical depth"],
          ["08", "hablar con usuarios", "talking to users"],
          ["09", "poner de acuerdo a la gente", "getting people aligned"],
          ["10", "acompañar a otros", "mentoring"],
          ["11", "ver el riesgo temprano", "spotting risk early"],
          ["12", "terminar lo empezado", "finishing what I start"],
        ),
      },
      {
        key: "skills.strengths.shows_up_as",
        label: { en: "Where it shows", es: "Dónde se nota" },
        input: "choice",
        options: opts(
          ["01", "en cómo llevo un proyecto", "in how I run a project"],
          ["02", "en lo que escribo", "in what I write"],
          ["03", "en cómo decido", "in how I decide"],
          ["04", "en cómo trabajo con la gente", "in how I work with people"],
        ),
      },
    ],
  },
  {
    canonicalKey: "skills.weaknesses",
    prompt: {
      en: "What are you working on improving?",
      es: "¿Qué estás intentando mejorar?",
    },
    why: {
      en: "Answer it once, honestly, and stop rewriting it at eleven at night.",
      es: "Contéstalo una vez, en serio, y deja de reescribirlo a las once de la noche.",
    },
    genre: "job_application",
    atoms: [
      {
        key: "skills.weaknesses.working_on",
        label: { en: "What you are working on", es: "En qué estás trabajando" },
        input: "choice",
        options: opts(
          ["01", "delegar antes", "delegating sooner"],
          ["02", "decir no antes", "saying no earlier"],
          ["03", "terminar antes de empezar otra cosa", "finishing before starting the next thing"],
          ["04", "pedir ayuda antes", "asking for help sooner"],
          ["05", "dar malas noticias más claras", "being clearer with bad news"],
          ["06", "parar a escribirlo", "stopping to write things down"],
          ["07", "tener paciencia con el proceso", "patience with process"],
        ),
      },
      {
        key: "skills.weaknesses.doing_about_it",
        label: { en: "What you are doing about it", es: "Qué estás haciendo" },
        input: "choice",
        options: opts(
          ["01", "he cambiado un hábito", "I changed a habit"],
          ["02", "alguien me lo dice a la cara", "someone calls me out"],
          ["03", "sigo una lista", "I follow a checklist"],
          ["04", "me comprometo a menos", "I commit to less"],
          ["05", "pido feedback a menudo", "I ask for feedback regularly"],
        ),
      },
    ],
  },
];

/**
 * The register: which of three sentences sounds like the person.
 *
 * This is the whole of what replaced "write 150 words so we can learn your
 * voice". It is one tap, and it is honest about what it buys: it steers a draft's
 * register, and it does not reproduce anybody's phrasing. Phrasing comes from
 * prose the person actually wrote, which is what the import is for.
 *
 * The three options are the same claim written three ways, so the choice is about
 * how somebody writes and not about what they did.
 */
export const REGISTER_FACT: InterviewFact = {
  key: "voice.register",
  label: { en: "Which sounds most like you", es: "Cuál se parece más a ti" },
  help: {
    en: "Steers how drafts are written. It does not put words in your mouth - that comes from what you have already written.",
    es: "Orienta cómo se redacta. No te pone palabras en la boca: eso sale de lo que ya has escrito.",
  },
  input: "choice",
  options: opts(
    [
      "01",
      "Lideré la migración y bajamos el tiempo de carga a la mitad.",
      "I led the migration and we cut load time in half.",
    ],
    [
      "02",
      "Migración liderada. Tiempo de carga, a la mitad.",
      "Led the migration. Load time, halved.",
    ],
    [
      "03",
      "Fui responsable de liderar la migración, que permitió reducir el tiempo de carga en un 50 %.",
      "I was responsible for leading the migration, which reduced load time by 50%.",
    ],
  ),
};

/** Every fact key the interview can write, sections and declarations alike. */
export function interviewFactKeys(): string[] {
  return [
    ...INTERVIEW_SECTIONS.flatMap((s) => s.facts.map((f) => f.key)),
    ...INTERVIEW_DECLARATIONS.flatMap((d) => d.atoms.map((a) => a.key)),
    REGISTER_FACT.key,
  ];
}

/** Every canonical key a declaration can seed. */
export function interviewCanonicalKeys(): string[] {
  return INTERVIEW_DECLARATIONS.map((d) => d.canonicalKey);
}

/**
 * How much of a declaration is held, for the completeness readout.
 *
 * One rule for both kinds. An asked declaration is measured against its atoms; a
 * derived one against the keys it is assembled from. There is deliberately no
 * "derived means done" shortcut: that made an empty profile report a declaration
 * on file, and a document that claims what it does not hold is the exact failure
 * this product's principles name.
 */
export function declarationProgress(
  declaration: InterviewDeclaration,
  held: (key: string) => boolean,
): { held: number; total: number; complete: boolean } {
  const keys = declaration.derived
    ? (declaration.derivedFrom ?? [])
    : declaration.atoms.map((a) => a.key);
  const count = keys.filter(held).length;
  return { held: count, total: keys.length, complete: keys.length > 0 && count === keys.length };
}

export const pickLang = <T>(pair: { en: T; es: T }, lang: Lang): T => pair[lang];
