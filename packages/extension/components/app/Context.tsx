/**
 * What the file knows.
 *
 * The interview's own sections and declarations, printed as one list rather than
 * paged through — because the question this screen answers is "what does it have
 * on me", and that question is answered by seeing all of it at once, not by
 * navigating to it a folio at a time.
 *
 * Every field is editable in place and every section records on its own, which
 * is the one rule from the old interview worth keeping intact: closing the tab
 * halfway through loses nothing. Nothing is required, either. A file with four
 * facts and one answer already fills more of a form than an empty one, and a
 * mandatory wizard just gets abandoned.
 */

import {
  INTERVIEW_DECLARATIONS,
  INTERVIEW_SECTIONS,
  REGISTER_FACT,
  type Lang,
} from "@personal-md/core";
import type { Answer } from "@personal-md/core";

import { Card, Empty, Mono, Pill, PageHead, RING } from "./primitives.tsx";

export interface ContextProps {
  lang: Lang;
  /** Current value for every interview key: draft first, then what is stored. */
  values: Record<string, string>;
  /** Keys the server withholds from prompts. */
  withheld: Set<string>;
  answers: readonly Answer[];
  /** Which section ids have an unsaved edit in them. */
  dirty: (keys: readonly string[]) => boolean;
  savingId: string | null;
  savedId: string | null;
  onChange: (key: string, value: string) => void;
  onSave: (id: string, facts: { key: string; label: string }[]) => void;
  factCount: number;
  lastEditedAt: Date | null;
}

const t = {
  es: {
    title: "Tu contexto",
    lead: (f: number, a: number) =>
      `${f} ${f === 1 ? "dato" : "datos"} · ${a} ${a === 1 ? "respuesta" : "respuestas"}`,
    edited: (d: string) => `última edición ${d}`,
    never: "sin editar todavía",
    save: "Guardar",
    saving: "Guardando",
    saved: "Guardado",
    localOnly: "solo local",
    voice: "Tu voz",
    voiceMeta: (n: number) => `${n} ${n === 1 ? "respuesta" : "respuestas"}`,
    noAnswers:
      "Aún no hay respuestas largas. Se guardan solas cuando confirmas una que has escrito en un formulario.",
    alsoMatched: "también reconoce:",
    used: (n: number) => `usada ${n}×`,
    register: "Cómo escribes tú",
    empty: "vacío",
  },
  en: {
    title: "Your context",
    lead: (f: number, a: number) =>
      `${f} ${f === 1 ? "fact" : "facts"} · ${a} ${a === 1 ? "answer" : "answers"}`,
    edited: (d: string) => `last hand-edit ${d}`,
    never: "never hand-edited",
    save: "Save",
    saving: "Saving",
    saved: "Saved",
    localOnly: "local only",
    voice: "Your voice",
    voiceMeta: (n: number) => `${n} ${n === 1 ? "answer" : "answers"}`,
    noAnswers:
      "No long answers yet. They save themselves when you confirm one you have written into a form.",
    alsoMatched: "also matched:",
    used: (n: number) => `used ${n}×`,
    register: "How you write",
    empty: "empty",
  },
} as const;

/** Either branch of the copy table. `t.es` alone would only accept Spanish. */
type Copy = (typeof t)[Lang];

/** "3 days ago", in whichever language the user writes in. */
function ago(date: Date | null, lang: Lang, c: Copy): string {
  if (!date) return c.never;
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const rel = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  return c.edited(days < 1 ? rel.format(0, "day") : rel.format(-days, "day"));
}

function SaveBar({
  c,
  dirty,
  saving,
  saved,
  onSave,
}: {
  c: Copy;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  // Nothing to save and nothing just saved: no bar at all. A permanently
  // present disabled Save is a control that has taught you to ignore it.
  if (!dirty && !saved) return null;
  return (
    <div className="flex items-center justify-end gap-3 border-t border-rule-200 bg-bone-100 px-4.5 py-2.5">
      {saved && !dirty ? (
        <Pill tone="done">{c.saved}</Pill>
      ) : (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className={`rounded-full bg-ink-900 px-4 py-1.5 text-[13px] font-semibold text-bone-050 transition-colors hover:bg-brio-500 disabled:opacity-60 ${RING}`}
        >
          {saving ? c.saving : c.save}
        </button>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  withheld,
  lang,
  c,
  onChange,
}: {
  label: string;
  value: string;
  withheld: boolean;
  lang: Lang;
  c: Copy;
  onChange: (v: string) => void;
}) {
  const long = value.length > 90;
  const shared =
    `w-full rounded-md border border-rule-400 bg-bone-100 px-2.5 py-2 text-[14.5px] ` +
    `text-graphite-900 transition-colors placeholder:text-graphite-200 focus:border-graphite-400 ${RING}`;

  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5 border-b border-rule-100 px-4.5 py-3 last:border-b-0">
      <label className="flex w-[190px] shrink-0 items-center gap-2 pt-2 text-[13.5px] text-graphite-400">
        <span className="min-w-0">{label}</span>
        {withheld && <Pill tone="withheld">{c.localOnly}</Pill>}
      </label>
      <div className="min-w-[200px] flex-1">
        {long ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className={`${shared} resize-y leading-relaxed`}
            placeholder={c.empty}
            lang={lang}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={shared}
            placeholder={c.empty}
            lang={lang}
          />
        )}
      </div>
    </div>
  );
}

export default function Context(props: ContextProps) {
  const { lang, values, withheld } = props;
  const c = t[lang];

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title={c.title}
        lead={`${c.lead(props.factCount, props.answers.length)} · ${ago(props.lastEditedAt, lang, c)}`}
      />

      {[...INTERVIEW_SECTIONS].map((section) => {
        const keys = section.facts.map((f) => f.key);
        const restricted = keys.filter((k) => withheld.has(k)).length;
        return (
          <Card
            key={section.id}
            title={section.title[lang]}
            meta={
              restricted
                ? `${c.lead(keys.length, 0).split(" · ")[0]} · ${restricted} ${c.localOnly}`
                : (c.lead(keys.length, 0).split(" · ")[0] ?? "")
            }
          >
            {section.facts.map((f) => (
              <Field
                key={f.key}
                label={f.label[lang]}
                value={values[f.key] ?? ""}
                withheld={withheld.has(f.key)}
                lang={lang}
                c={c}
                onChange={(v) => props.onChange(f.key, v)}
              />
            ))}
            <SaveBar
              c={c}
              dirty={props.dirty(keys)}
              saving={props.savingId === section.id}
              saved={props.savedId === section.id}
              onSave={() =>
                props.onSave(
                  section.id,
                  section.facts.map((f) => ({ key: f.key, label: f.label.en })),
                )
              }
            />
          </Card>
        );
      })}

      {INTERVIEW_DECLARATIONS.filter((d) => d.atoms.length > 0).map((declaration) => {
        const keys = declaration.atoms.map((a) => a.key);
        return (
          <Card
            key={declaration.canonicalKey}
            title={declaration.prompt[lang]}
            meta={declaration.canonicalKey}
          >
            {declaration.atoms.map((a) => (
              <Field
                key={a.key}
                label={a.label[lang]}
                value={values[a.key] ?? ""}
                withheld={withheld.has(a.key)}
                lang={lang}
                c={c}
                onChange={(v) => props.onChange(a.key, v)}
              />
            ))}
            <SaveBar
              c={c}
              dirty={props.dirty(keys)}
              saving={props.savingId === declaration.canonicalKey}
              saved={props.savedId === declaration.canonicalKey}
              onSave={() =>
                props.onSave(
                  declaration.canonicalKey,
                  declaration.atoms.map((a) => ({ key: a.key, label: a.label.en })),
                )
              }
            />
          </Card>
        );
      })}

      <Card title={c.voice} meta={c.voiceMeta(props.answers.length)}>
        <div className="border-b border-rule-100">
          <Field
            label={c.register}
            value={values[REGISTER_FACT.key] ?? ""}
            withheld={withheld.has(REGISTER_FACT.key)}
            lang={lang}
            c={c}
            onChange={(v) => props.onChange(REGISTER_FACT.key, v)}
          />
        </div>

        {props.answers.length === 0 ? (
          <Empty>{c.noAnswers}</Empty>
        ) : (
          props.answers.map((a) => (
            <article key={a.id} className="border-b border-rule-100 px-4.5 py-4 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[14.5px] font-semibold text-pretty">{a.askedAs[0] ?? a.canonicalKey}</p>
                <Mono>
                  {a.language} · {c.used(a.useCount)} ·{" "}
                  {new Date(a.writtenAt).toLocaleDateString(lang)}
                </Mono>
              </div>
              {/*
                Their prose, quoted and left alone: no clamp, no "read more". The
                whole premise of the file is that the good version of this
                paragraph is not buried somewhere, and truncating it here would
                bury it again.
              */}
              <p
                lang={a.language}
                className="mt-2 border-l-2 border-rule-300 pl-3 text-[14.5px] leading-relaxed whitespace-pre-wrap text-graphite-700 text-pretty"
              >
                {a.text}
              </p>
              {a.askedAs.length > 1 && (
                <p className="mt-2">
                  <Mono tone="faint">
                    {c.alsoMatched} {a.askedAs.slice(1).join(" · ")}
                  </Mono>
                </p>
              )}
            </article>
          ))
        )}

        <SaveBar
          c={c}
          dirty={props.dirty([REGISTER_FACT.key])}
          saving={props.savingId === "voice"}
          saved={props.savedId === "voice"}
          onSave={() =>
            props.onSave("voice", [{ key: REGISTER_FACT.key, label: REGISTER_FACT.label.en }])
          }
        />
      </Card>
    </div>
  );
}
