import { useMemo, useState } from "react";

import {
  INTERVIEW_QUESTIONS,
  INTERVIEW_SECTIONS,
  classifyEgress,
  type InterviewQuestion,
  type Lang,
  type Profile,
} from "@personal-md/core";

import { send } from "../../lib/protocol.ts";

/**
 * The interview.
 *
 * Two rules shape the whole flow. Nothing is required, because a profile with
 * four facts and one answer is already more useful than an empty one and a
 * mandatory wizard just gets abandoned. And each section saves on its own, so
 * closing the tab halfway through loses nothing.
 *
 * Where a value is withheld from prompts, the field says so inline. This is the
 * exact moment the user decides whether to type their NIF, so it is the moment
 * that has to be honest.
 */

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function LocalOnly() {
  return (
    <span
      title="Stored locally and filled into forms directly. Never included in a prompt sent to Claude."
      className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
    >
      local only
    </span>
  );
}

function OpenQuestion({
  question,
  lang,
  initial,
  onSave,
}: {
  question: InterviewQuestion;
  lang: Lang;
  initial: string;
  onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const words = wordCount(text);
  const dirty = text.trim() !== initial.trim();

  const save = async () => {
    setState("saving");
    try {
      await onSave(text);
      setState("saved");
    } catch {
      setState("idle");
    }
  };

  return (
    <article className="rounded-lg border border-slate-200 p-4">
      <h3 className="font-medium">{question.prompt[lang]}</h3>
      <p className="mt-1 text-xs text-slate-500">{question.why[lang]}</p>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState("idle");
        }}
        rows={6}
        placeholder={
          lang === "es"
            ? "Escríbelo como lo dirías en voz alta."
            : "Write it the way you would say it out loud."
        }
        className="mt-3 w-full rounded border border-slate-300 p-2 text-sm leading-relaxed"
      />

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={words > question.suggestedWords * 1.6 ? "text-amber-700" : "text-slate-500"}>
          {words} {lang === "es" ? "palabras" : "words"}
          <span className="text-slate-400">
            {" "}
            / ~{question.suggestedWords} {lang === "es" ? "sugeridas" : "suggested"}
          </span>
        </span>

        <span className="flex items-center gap-3">
          {/*
            After a successful save the parent refetches, `initial` becomes the
            saved text, and `dirty` goes false - so this one condition covers
            both "already stored" and "just stored".
          */}
          {initial.trim() && !dirty && (
            <span className="text-emerald-700">{lang === "es" ? "guardado" : "saved"}</span>
          )}
          <button
            onClick={() => void save()}
            disabled={!dirty || state === "saving" || !text.trim()}
            className="rounded bg-slate-800 px-3 py-1 text-white disabled:bg-slate-300"
          >
            {state === "saving"
              ? lang === "es"
                ? "Guardando..."
                : "Saving..."
              : lang === "es"
                ? "Guardar"
                : "Save"}
          </button>
        </span>
      </div>
    </article>
  );
}

export default function Interview({
  profile,
  withheldKeys,
  onChanged,
}: {
  profile: Profile | null;
  withheldKeys: string[];
  onChanged: () => Promise<void>;
}) {
  const [lang, setLang] = useState<Lang>("en");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [error, setError] = useState("");

  const withheld = useMemo(() => new Set(withheldKeys), [withheldKeys]);
  const existingFacts = useMemo(
    () => new Map((profile?.facts ?? []).map((f) => [f.key, f.value])),
    [profile],
  );
  const existingAnswers = useMemo(
    () => new Map((profile?.answers ?? []).map((a) => [a.canonicalKey, a.text])),
    [profile],
  );

  const valueOf = (key: string) => draft[key] ?? existingFacts.get(key) ?? "";

  const factsDone = INTERVIEW_SECTIONS.flatMap((s) => s.facts).filter((f) =>
    (existingFacts.get(f.key) ?? "").trim(),
  ).length;
  const factsTotal = INTERVIEW_SECTIONS.reduce((n, s) => n + s.facts.length, 0);
  const answersDone = INTERVIEW_QUESTIONS.filter((q) =>
    (existingAnswers.get(q.canonicalKey) ?? "").trim(),
  ).length;

  const saveSection = async (sectionId: string) => {
    const section = INTERVIEW_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    const facts = section.facts
      .filter((f) => draft[f.key] !== undefined)
      .map((f) => ({ key: f.key, label: f.label.en, value: (draft[f.key] ?? "").trim() }));
    if (facts.length === 0) return;

    setSavingSection(sectionId);
    setError("");
    try {
      await send({ kind: "saveFacts", facts });
      setDraft((d) => {
        const next = { ...d };
        for (const f of facts) delete next[f.key];
        return next;
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save");
    } finally {
      setSavingSection(null);
    }
  };

  const saveAnswer = async (question: InterviewQuestion, text: string) => {
    setError("");
    try {
      await send({
        kind: "saveAnswer",
        canonicalKey: question.canonicalKey,
        question: question.prompt[lang],
        text,
        language: lang,
        genre: question.genre,
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save");
      throw err;
    }
  };

  return (
    <div>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">
            {lang === "es" ? "Entrevista" : "Interview"}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            {lang === "es"
              ? "Nada es obligatorio y cada sección se guarda por separado. Puedes cerrar esto a medias sin perder nada."
              : "Nothing is required, and each section saves on its own. You can close this halfway through without losing anything."}
          </p>
        </div>
        <button
          onClick={() => setLang(lang === "en" ? "es" : "en")}
          className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs"
        >
          {lang === "en" ? "Español" : "English"}
        </button>
      </header>

      <div className="mb-6 flex gap-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <span>
          {lang === "es" ? "Datos" : "Facts"}:{" "}
          <strong className="font-mono text-slate-800">
            {factsDone}/{factsTotal}
          </strong>
        </span>
        <span>
          {lang === "es" ? "Respuestas" : "Answers"}:{" "}
          <strong className="font-mono text-slate-800">
            {answersDone}/{INTERVIEW_QUESTIONS.length}
          </strong>
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </p>
      )}

      <section className="space-y-5">
        {INTERVIEW_SECTIONS.map((section) => {
          const pending = section.facts.some((f) => draft[f.key] !== undefined);
          return (
            <div key={section.id} className="rounded-lg border border-slate-200 p-4">
              <h3 className="font-medium">{section.title[lang]}</h3>
              <p className="mt-1 text-xs text-slate-500">{section.blurb[lang]}</p>

              <div className="mt-3 space-y-3">
                {section.facts.map((fact) => (
                  <label key={fact.key} className="block text-sm">
                    <span className="text-slate-700">
                      {fact.label[lang]}
                      {(withheld.has(fact.key) || classifyEgress(fact.key) === "never") && (
                        <LocalOnly />
                      )}
                    </span>
                    <input
                      type={fact.input === "textarea" ? "text" : fact.input}
                      value={valueOf(fact.key)}
                      placeholder={fact.placeholder}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, [fact.key]: e.target.value }))
                      }
                      className="mt-1 w-full rounded border border-slate-300 p-2 text-sm"
                    />
                    {fact.help && (
                      <span className="mt-1 block text-xs text-slate-500">{fact.help[lang]}</span>
                    )}
                  </label>
                ))}
              </div>

              <button
                onClick={() => void saveSection(section.id)}
                disabled={!pending || savingSection === section.id}
                className="mt-3 rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:bg-slate-300"
              >
                {savingSection === section.id
                  ? lang === "es"
                    ? "Guardando..."
                    : "Saving..."
                  : lang === "es"
                    ? "Guardar sección"
                    : "Save section"}
              </button>
            </div>
          );
        })}
      </section>

      <section className="mt-8">
        <h3 className="text-sm font-medium">
          {lang === "es" ? "Preguntas abiertas" : "Open questions"}
        </h3>
        <p className="mb-4 mt-1 max-w-xl text-xs text-slate-500">
          {lang === "es"
            ? "Estas son las que merece la pena escribir bien: se reutilizan y además le enseñan a la herramienta cómo escribes."
            : "These are the ones worth writing properly. They get reused, and they are also what teaches the tool how you write."}
        </p>

        <div className="space-y-4">
          {INTERVIEW_QUESTIONS.map((question) => (
            <OpenQuestion
              key={question.canonicalKey}
              question={question}
              lang={lang}
              initial={existingAnswers.get(question.canonicalKey) ?? ""}
              onSave={(text) => saveAnswer(question, text)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
