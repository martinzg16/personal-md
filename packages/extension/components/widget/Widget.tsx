/**
 * THESIS: this panel is your file, projected onto someone else's form. Rows lead
 *   with what you wrote and where it came from, naming the host field only as the
 *   destination - refusing the field-inventory list every autofill extension ships.
 * OWN-WORLD: inherited slate system, inverted. Dark slate chrome so the tool is
 *   never mistaken for the host page and stays legible on any ground; your own
 *   words quoted on light chips inside it. One accent per state. Drawn 1.5px icons.
 * STORY: you see what your file can do here, you see where each answer came from,
 *   you click to apply it, and you can always undo exactly what you applied.
 * FIRST VIEWPORT: a collapsed pill, bottom-right, naming a count. Nothing opens
 *   itself and nothing takes focus until you open it - opening then hands focus
 *   to the collapse control, because opening unmounts the pill that held it. The
 *   panel replaces the pill rather than sitting above it: same corner, one thing
 *   on screen at a time.
 * FORM: source-first ledger; candidate 6 of 7 on the resonance-ordered list;
 *   seed key a21341ab.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { DraftResponse } from "../../lib/protocol.ts";
import type { AnswerSuggestion, FieldSuggestion } from "../../lib/match/deterministic.ts";
import { batchSize, type PendingBatch, type PendingFact } from "../../lib/learn/pending.ts";
import { Arrow, Check, Chevron, Dismiss, Draft, Gap, Insert, Mark, Reveal, Undo, Withheld } from "./icons.tsx";

export type Lang = "es" | "en";

/** One row of the ledger: something in the file, and what it can do here. */
export type Row =
  | { kind: "fact"; id: string; suggestion: FieldSuggestion; applied: boolean; fillError?: string }
  | {
      kind: "answer";
      id: string;
      suggestion: AnswerSuggestion;
      applied: boolean;
      fillError?: string;
    }
  | {
      kind: "unanswered";
      id: string;
      fieldId: string;
      question: string;
      maxWords: number | null;
      draft: DraftResponse | null;
      state: "idle" | "drafting" | "ready" | "error";
      error?: string;
      applied: boolean;
      fillError?: string;
    };

export interface WidgetProps {
  lang: Lang;
  domain: string;
  rows: Row[];
  undoCount: number;
  serverUp: boolean;
  onFill: (row: Row) => void;
  onDraft: (row: Row, instruction?: string) => void;
  onInsertDraft: (row: Row, text: string) => void;
  onUndo: () => void;
  onDismissSite: () => void;
  /**
   * What this form has offered that the file does not already hold, noticed
   * quietly while it was filled. Null when there is nothing to ask about.
   */
  pending?: PendingBatch | null;
  /** Save the batch as one write. Resolves false if the server refused it. */
  onSaveBatch?: (batch: PendingBatch) => Promise<boolean>;
  /** Drop one item from the batch, and do not offer it again on this page. */
  onDeclineItem?: (key: string) => void;
  /** The user corrected a value in the panel; the panel's version wins. */
  onEditItem?: (key: string, value: string) => void;
  /**
   * A submit was attempted. Switches an already-open panel to the confirm view;
   * a collapsed panel stays collapsed and says so on the pill instead, because
   * nothing here opens itself.
   */
  submitAttempted?: boolean;
  /**
   * Start expanded. Off by default and deliberately so: the panel never opens
   * itself on a page you may only be skimming. Used by the visual harness, and
   * by an explicit "open it" action from the popup.
   */
  initialOpen?: boolean;
}

const t = {
  en: {
    pill: (n: number) => `${n} from your file`,
    pillSave: (n: number) => (n === 1 ? "1 thing to save" : `${n} things to save`),
    pillDone: "all applied",
    title: "Your file, here",
    subtitle: (d: string) => `applied to ${d}`,
    region: (d: string) => `Your stored answers, applied to ${d}`,
    into: "into",
    from: "from",
    answered: "you answered this",
    noSource: "nothing in your file answers this",
    fill: "Fill",
    insert: "Insert",
    draft: "Draft it",
    redraft: "Redraft",
    drafting: "Drafting",
    draftingNote: "about ten seconds",
    filled: "Filled",
    inserted: "Inserted",
    undo: (n: number) => `Undo ${n}`,
    never: "Never on this site",
    collapse: "Collapse",
    more: "more",
    less: "less",
    words: "words",
    localOnly: "never sent to Claude",
    reveal: "Show",
    hide: "Hide",
    derivedFrom: "worked out from",
    ungrounded: "a figure here is in nothing you have written",
    basedOn: "Based on",
    serverDown: "Drafting needs the server running. Everything below still works.",
    empty: "Nothing in your file yet.",
    emptyHelp: "Run the interview from the extension's options to fill it, and this panel will start recognising these fields.",
    tellIt: "Tell it what to change",
    checkFirst: "This field already holds",
    draftFailed: "Could not draft this.",
    reviewLead: (n: number) => `${n} new from this form`,
    review: "Review",
    confirmTitle: (n: number) => (n === 1 ? "Save 1 thing to your file?" : `Save ${n} things to your file?`),
    confirmNote: "Nothing here is saved until you say so. Edit anything that is not right.",
    replaces: "replaces",
    save: "Save",
    saveNone: "Save nothing",
    back: "Back",
    saving: "Saving",
    saved: "Saved to your file",
    saveFailed: "Could not save. Your file is unchanged.",
    answerFor: "your answer to",
  },
  es: {
    pill: (n: number) => `${n} de tu fichero`,
    pillSave: (n: number) => (n === 1 ? "1 cosa por guardar" : `${n} cosas por guardar`),
    pillDone: "todo aplicado",
    title: "Tu fichero, aquí",
    subtitle: (d: string) => `aplicado a ${d}`,
    region: (d: string) => `Tus respuestas guardadas, aplicadas a ${d}`,
    into: "en",
    from: "de",
    answered: "ya lo contestaste",
    noSource: "nada en tu fichero contesta esto",
    fill: "Rellenar",
    insert: "Insertar",
    draft: "Redactar",
    redraft: "Rehacer",
    drafting: "Redactando",
    draftingNote: "unos diez segundos",
    filled: "Hecho",
    inserted: "Insertado",
    undo: (n: number) => `Deshacer ${n}`,
    never: "Nunca en este sitio",
    collapse: "Plegar",
    more: "más",
    less: "menos",
    words: "palabras",
    localOnly: "nunca se envía a Claude",
    reveal: "Ver",
    hide: "Ocultar",
    derivedFrom: "deducido de",
    ungrounded: "hay una cifra que no está en nada que hayas escrito",
    basedOn: "A partir de",
    serverDown: "Redactar necesita el servidor. Lo de abajo sigue funcionando.",
    empty: "Tu fichero aún está vacío.",
    emptyHelp: "Haz la entrevista desde las opciones de la extensión y este panel empezará a reconocer estos campos.",
    tellIt: "Dile qué cambiar",
    checkFirst: "Este campo ya tiene",
    draftFailed: "No se pudo redactar.",
    reviewLead: (n: number) => `${n} cosas nuevas de este formulario`,
    review: "Revisar",
    confirmTitle: (n: number) =>
      n === 1 ? "¿Guardar 1 cosa en tu fichero?" : `¿Guardar ${n} cosas en tu fichero?`,
    confirmNote: "Nada de esto se guarda hasta que lo digas. Edita lo que no esté bien.",
    replaces: "sustituye a",
    save: "Guardar",
    saveNone: "No guardar nada",
    back: "Volver",
    saving: "Guardando",
    saved: "Guardado en tu fichero",
    saveFailed: "No se pudo guardar. Tu fichero no ha cambiado.",
    answerFor: "tu respuesta a",
  },
} as const;

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/**
 * Hide a withheld value behind a reveal.
 *
 * "Never sent to Claude" answers egress; it says nothing about the screen. This
 * panel sits over third-party pages by design, which is the whole reason the
 * tool is meant to look like a tool - so a national ID is masked until asked for.
 */
const mask = (value: string): string => {
  const visible = value.trim().slice(-2);
  return `${"•".repeat(Math.max(3, value.trim().length - 2))}${visible}`;
};

/** Shared focus treatment. A tool that avoids focus must still be reachable. */
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900";

/** Small caps label. Monospace here is for data and measurement, not costume. */
function Label({ children }: { children: React.ReactNode }) {
  return <span className="pmd-mono text-[10px] tracking-[0.06em] text-slate-400">{children}</span>;
}

function Action({
  onClick,
  children,
  tone = "primary",
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "primary" | "quiet";
  disabled?: boolean;
}) {
  const styles =
    tone === "primary"
      ? "bg-slate-100 text-slate-900 hover:bg-white disabled:bg-slate-700 disabled:text-slate-500"
      : "text-slate-300 hover:text-white hover:bg-slate-700/60 disabled:text-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors duration-150 disabled:cursor-not-allowed ${FOCUS} ${styles}`}
    >
      {children}
    </button>
  );
}

/**
 * The guard against inserting over something.
 *
 * Distinguished from the server-stopped banner by content first, not by hue.
 * Both were warm, and measured against each other their fills were the same
 * colour and their text 18 degrees apart in the same family - so a colour-only
 * distinction was never going to carry it. This one quotes what is already in
 * the field, which the banner never can, and which is the fact the user
 * actually needs to decide whether to overwrite.
 */
function Caution({ children, quote }: { children: React.ReactNode; quote?: string }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded border border-orange-400/50 bg-orange-950/60 px-2 py-1 text-[12px] font-medium leading-snug text-orange-100">
      <Gap className="h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
      {quote && (
        <span className="pmd-mono rounded bg-orange-400/15 px-1 text-[11px] text-orange-50">
          {quote}
        </span>
      )}
    </span>
  );
}

/** A thing that went wrong on this row. Rose, and it names the recovery. */
function Failure({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-rose-300">
      <Gap className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Where this row will write.
 *
 * Inline in the metadata line rather than stacked above the button. As a
 * right-rail block it squeezed the left column until the source key wrapped and
 * the destination itself truncated - the value leads, but it needs the room to.
 */
function Destination({ label, lang }: { label: string; lang: Lang }) {
  return (
    <span className="pmd-mono inline-flex min-w-0 items-start gap-1 text-[10px] leading-relaxed tracking-[0.06em] text-slate-300">
      <Arrow className="mt-[3px] h-3 w-3 shrink-0 text-slate-500" />
      {/*
        Wraps; never truncates. At 390px a truncating destination clipped the
        very thing the user has to read before committing - "en Expectativa
        salarial bruta anu..." and, worse, the question a long-form answer was
        about to be inserted into. A second line costs nothing next to
        confirming the wrong destination.
      */}
      <span className="min-w-0 break-words">{label}</span>
      <span className="sr-only"> {t[lang].into}</span>
    </span>
  );
}

/** Your own words, quoted. The one light surface inside the tool's dark chrome. */
function Quoted({ children, lead }: { children: React.ReactNode; lead?: boolean }) {
  return (
    <p
      className={`rounded-sm border-l border-slate-300 bg-slate-50 px-2 py-1 leading-snug text-slate-900 ${
        lead ? "text-[14px]" : "text-[13px]"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * A fact row, source-first.
 *
 * Your value leads and carries its source; the host form's field name is the
 * destination on the action side. An earlier version led with the field name,
 * which made four of five rows read employer's word first - the field-inventory
 * list the THESIS says this refuses.
 */
function FactRow({
  row,
  lang,
  onFill,
}: {
  row: Extract<Row, { kind: "fact" }>;
  lang: Lang;
  onFill: () => void;
}) {
  const c = t[lang];
  const s = row.suggestion;
  const [shown, setShown] = useState(false);
  const hidden = s.localOnly && !shown;

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/*
            Value-first applies to values you can read. While a sensitive value
            is masked, the loudest element on the row would be a row of dots -
            so the field's own identity leads instead, and the mask sits where
            the provenance does. Revealing it swaps them back.
          */}
          {hidden ? (
            <>
              <p className="text-[13px] font-medium leading-snug text-slate-100">
                {s.label || s.category}
              </p>
              <p className="pmd-mono mt-1 text-[11px] tracking-[0.08em] text-slate-300">
                {mask(s.value)}
              </p>
            </>
          ) : (
            <Quoted lead>{s.value}</Quoted>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="pmd-mono max-w-full break-words text-[10px] leading-relaxed tracking-[0.06em] text-slate-400">
              {s.derivedFrom ? `${c.derivedFrom} ${s.derivedFrom}` : `${c.from} ${s.sourceKey}`}
            </span>
            {!hidden && <Destination label={s.label || s.category} lang={lang} />}
            {s.localOnly && (
              <span className="inline-flex items-center gap-1 rounded bg-slate-700/70 px-1.5 py-0.5 text-[10px] text-slate-200">
                <Withheld className="h-3 w-3" />
                {c.localOnly}
              </span>
            )}
            {s.localOnly && (
              <button
                type="button"
                onClick={() => setShown(!shown)}
                className={`inline-flex items-center gap-1 rounded px-1 text-[10px] text-slate-300 hover:text-white ${FOCUS}`}
              >
                <Reveal className="h-3 w-3" />
                {shown ? c.hide : c.reveal}
              </button>
            )}
          </div>
          {s.currentValue && (
            <p className="mt-1.5">
              <Caution quote={s.currentValue}>{c.checkFirst}</Caution>
            </p>
          )}
          {row.fillError && <Failure>{row.fillError}</Failure>}
        </div>

        {row.applied ? (
          <span className="inline-flex shrink-0 items-center gap-1 px-1 pt-1 text-xs text-emerald-300">
            <Check className="h-3.5 w-3.5" />
            {c.filled}
          </span>
        ) : (
          <Action onClick={onFill}>
            <Insert className="h-3.5 w-3.5" />
            {c.fill}
          </Action>
        )}
      </div>
    </li>
  );
}

function AnswerRow({
  row,
  lang,
  onInsert,
}: {
  row: Extract<Row, { kind: "answer" }>;
  lang: Lang;
  onInsert: () => void;
}) {
  const c = t[lang];
  const s = row.suggestion;
  const [open, setOpen] = useState(false);
  const long = s.text.length > 130;

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Quoted lead>{open || !long ? s.text : `${s.text.slice(0, 127)}...`}</Quoted>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Label>
              {c.answered}
              {s.writtenAt ? ` · ${s.writtenAt}` : ""}
            </Label>
            <Destination label={s.question} lang={lang} />
            {long && (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className={`inline-flex items-center gap-0.5 rounded px-1 text-[10px] text-slate-300 hover:text-white ${FOCUS}`}
              >
                <Chevron className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
                {open ? c.less : c.more}
              </button>
            )}
          </div>
          {row.fillError && <Failure>{row.fillError}</Failure>}
        </div>

        {row.applied ? (
          <span className="inline-flex shrink-0 items-center gap-1 px-1 pt-1 text-xs text-emerald-300">
            <Check className="h-3.5 w-3.5" />
            {c.inserted}
          </span>
        ) : (
          <Action onClick={onInsert}>
            <Insert className="h-3.5 w-3.5" />
            {c.insert}
          </Action>
        )}
      </div>
    </li>
  );
}

/**
 * The row with no source.
 *
 * Drafting takes about ten seconds, so provenance is shown the moment it exists
 * rather than after the text: the wait is legible instead of blank, and you can
 * tell it understood the question before it has finished answering.
 */
function UnansweredRow({
  row,
  lang,
  serverUp,
  onDraft,
  onInsert,
}: {
  row: Extract<Row, { kind: "unanswered" }>;
  lang: Lang;
  serverUp: boolean;
  onDraft: (instruction?: string) => void;
  onInsert: (text: string) => void;
}) {
  const c = t[lang];
  const [edited, setEdited] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");

  const text = edited ?? row.draft?.draft ?? "";
  const limit = row.maxWords;
  const over = limit !== null && wordCount(text) > limit;

  useEffect(() => {
    if (row.state === "ready") setEdited(null);
  }, [row.draft?.draft, row.state]);

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/*
            This row kind genuinely leads with the question: there is no stored
            value to put first, and the question is what the user reads to judge
            whether a draft is on target. But at 13px semibold it tied the panel
            title for dominance, so the same panel demoted the host field on
            three row kinds and promoted it on this one. Subordinate to the
            title, still the subject of its own row.
          */}
          <p className="text-[12px] font-medium leading-snug text-slate-200">{row.question}</p>
          {/*
            Only while idle. This line explains why the row offers Draft instead
            of Fill - but rendered unconditionally it sat directly above "based
            on" and two provenance chips, telling the user nothing in their file
            answered this while naming the two answers it came from.
          */}
          {row.state === "idle" && (
            <p className="mt-1">
              <Label>{c.noSource}</Label>
            </p>
          )}
        </div>
        {row.state === "idle" && (
          <Action onClick={() => onDraft()} tone="quiet" disabled={!serverUp}>
            <Draft className="h-3.5 w-3.5" />
            {c.draft}
          </Action>
        )}
      </div>

      {row.state === "drafting" && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-300">
          <span className="pmd-pulse h-1.5 w-1.5 rounded-full bg-sky-400" />
          {c.drafting}
          <span className="text-slate-400">- {c.draftingNote}</span>
        </div>
      )}

      {row.state === "error" && <Failure>{row.error ?? c.draftFailed}</Failure>}
      {row.fillError && <Failure>{row.fillError}</Failure>}

      {row.draft && row.state === "ready" && (
        <div className="mt-2">
          {row.draft.provenance.filter((p) => p.used).length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <Label>{c.basedOn}</Label>
              {row.draft.provenance
                .filter((p) => p.used)
                .map((p) => (
                  <span
                    key={p.canonicalKey + p.askedAs}
                    title={p.excerpt}
                    className="rounded bg-slate-700/70 px-1.5 py-0.5 text-[10px] text-slate-200"
                  >
                    {p.askedAs || p.canonicalKey}
                    {p.writtenAt ? ` · ${p.writtenAt}` : ""}
                  </span>
                ))}
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setEdited(e.target.value)}
            rows={6}
            className={`w-full resize-y rounded-sm border border-slate-300 bg-slate-50 p-2 text-[13px] leading-relaxed text-slate-900 ${FOCUS} focus-visible:border-sky-500`}
          />

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className={`pmd-mono text-[10px] ${over ? "text-orange-200" : "text-slate-400"}`}>
              {wordCount(text)} {c.words}
              {limit !== null && <span className="text-slate-400/70"> / {limit}</span>}
            </span>
            <div className="flex items-center gap-1.5">
              <Action onClick={() => onDraft(instruction || undefined)} tone="quiet">
                <Draft className="h-3.5 w-3.5" />
                {c.redraft}
              </Action>
              {row.applied ? (
                <span className="inline-flex items-center gap-1 px-2 text-xs text-emerald-300">
                  <Check className="h-3.5 w-3.5" />
                  {c.inserted}
                </span>
              ) : (
                <Action onClick={() => onInsert(text)} disabled={!text.trim()}>
                  <Insert className="h-3.5 w-3.5" />
                  {c.insert}
                </Action>
              )}
            </div>
          </div>

          {row.draft.informationGaps.length > 0 && (
            <ul className="mt-2 space-y-1">
              {row.draft.informationGaps.map((g) => (
                <li key={g.missing} className="flex gap-1.5 text-[11px] text-slate-300">
                  <Gap className="mt-0.5 h-3 w-3 shrink-0 text-orange-300" />
                  <span>{g.questionForUser || g.missing}</span>
                </li>
              ))}
            </ul>
          )}

          {row.draft.flags.ungroundedSuspicion && (
            <p className="mt-2">
              <Caution>{c.ungrounded}</Caution>
            </p>
          )}

          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={c.tellIt}
            className={`pmd-mono mt-2 w-full rounded-sm border border-slate-700 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-400 ${FOCUS} focus-visible:border-sky-500`}
          />
        </div>
      )}
    </li>
  );
}

/**
 * One thing the form is offering to teach the file.
 *
 * The value is editable in place. The page is where it came from, not the
 * authority on what it means - a form that made you type "MADRID" in caps should
 * not put that in a file you read, and the fix has to be here rather than in an
 * editor you open later.
 */
function PendingFactRow({
  item,
  lang,
  onDecline,
  onEdit,
}: {
  item: PendingFact;
  lang: Lang;
  onDecline: () => void;
  onEdit: (value: string) => void;
}) {
  const c = t[lang];
  return (
    <li className="flex items-start gap-2 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium leading-snug text-slate-200">{item.label}</p>
        <input
          value={item.value}
          onChange={(e) => onEdit(e.target.value)}
          aria-label={item.label}
          className={`mt-1 w-full rounded-sm border border-slate-300 bg-slate-50 px-1.5 py-1 text-[13px] text-slate-900 ${FOCUS} focus-visible:border-sky-500`}
        />
        <p className="pmd-mono mt-1 text-[10px] tracking-[0.06em] text-slate-400">
          {item.key}
          {item.replaces && (
            <>
              {" · "}
              <span className="text-orange-200">
                {c.replaces} {item.replaces}
              </span>
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onDecline}
        aria-label={`${c.saveNone}: ${item.label}`}
        title={c.saveNone}
        className={`mt-5 shrink-0 rounded p-1 text-slate-400 transition-colors duration-150 hover:bg-slate-700/60 hover:text-white ${FOCUS}`}
      >
        <Dismiss className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export default function Widget(props: WidgetProps) {
  const { lang, domain, rows, undoCount, serverUp } = props;
  const c = t[lang];
  const [open, setOpen] = useState(props.initialOpen ?? false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const justOpened = useRef(false);

  const unapplied = useMemo(() => rows.filter((r) => !r.applied).length, [rows]);

  const batch = props.pending ?? null;
  const toSave = batch ? batchSize(batch) : 0;
  const [view, setView] = useState<"ledger" | "confirm">("ledger");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /*
   * A submit was attempted. If the panel is already open, this is the moment the
   * batch is worth showing - the user has finished typing. If it is collapsed it
   * stays collapsed: the panel does not open itself, and the pill carries the
   * count instead. Submitting usually navigates, which is why the batch is
   * persisted rather than held here.
   */
  useEffect(() => {
    if (props.submitAttempted && toSave > 0 && open) setView("confirm");
  }, [props.submitAttempted, toSave, open]);

  // Escape collapses it. An outside click deliberately does not: the panel
  // annotates the page it sits on, so clicking into a field or scrolling the
  // form is working *with* it, and a panel that vanishes then is a popover
  // pretending to be a tool. Collapse and per-site dismissal are both explicit.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // Opening unmounts the pill, which would drop focus to the host page's body
  // and lose the keyboard user's place. Hand it to the collapse control instead,
  // and only when the open came from a real interaction.
  useEffect(() => {
    if (open && justOpened.current) {
      justOpened.current = false;
      closeRef.current?.focus();
    }
  }, [open]);

  /*
   * Whether anything is below the fold. Measured rather than assumed, and
   * remeasured on scroll so the indicator disappears once you reach the bottom -
   * at which point there is nothing left to signal.
   */
  const listRef = useRef<HTMLUListElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  const measureOverflow = () => {
    const el = listRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight - el.clientHeight - el.scrollTop > 2);
  };

  useEffect(measureOverflow, [rows, open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          justOpened.current = true;
          setOpen(true);
        }}
        className={`pmd-enter pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full bg-slate-900 py-2 pl-2.5 pr-3.5 text-[13px] font-medium text-slate-100 shadow-[0_6px_20px_-4px_rgba(15,23,42,0.5)] ring-1 ring-slate-700/80 transition-colors duration-150 hover:bg-slate-800 ${FOCUS}`}
      >
        <Mark className="h-4 w-4 text-slate-400" />
        {toSave > 0 ? c.pillSave(toSave) : unapplied > 0 ? c.pill(unapplied) : c.pillDone}
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label={c.region(domain)}
      className="pmd-enter pointer-events-auto flex max-h-[min(84vh,760px)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg bg-slate-900 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.6)] ring-1 ring-slate-700/80"
    >
      <header className="flex items-start justify-between gap-3 border-b border-slate-700/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Mark className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold leading-tight text-slate-100">{c.title}</h2>
            <p className="truncate text-[11px] leading-tight text-slate-400">
              {c.subtitle(domain)}
            </p>
          </div>
        </div>
        {/* Collapses to the pill. Destroying the widget for this page is the
            footer's "Never on this site", which says so. */}
        <button
          ref={closeRef}
          type="button"
          onClick={() => setOpen(false)}
          aria-label={c.collapse}
          title={c.collapse}
          className={`-mr-1 -mt-1 rounded p-1 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-100 ${FOCUS}`}
        >
          {/*
            A chevron, pointing down at the pill it collapses into. A bare X
            reads as "dismiss this", and dismissal is the footer's job - which
            is a different, remembered decision.
          */}
          <Chevron className="h-4 w-4 rotate-90" />
        </button>
      </header>

      {!serverUp && (
        <p className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-200">
          {c.serverDown}
        </p>
      )}

      {view === "confirm" && batch ? (
        <>
          <div className="border-b border-slate-700/70 px-4 py-3">
            <p className="text-[13px] font-semibold leading-snug text-slate-100">
              {c.confirmTitle(toSave)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{c.confirmNote}</p>
          </div>

          <div className="relative min-h-0">
          <ul
            ref={listRef}
            onScroll={measureOverflow}
            className="divide-y divide-slate-700/50 overflow-y-auto"
          >
            {batch.facts.map((item) => (
              <PendingFactRow
                key={item.key}
                item={item}
                lang={lang}
                onDecline={() => props.onDeclineItem?.(item.key)}
                onEdit={(value) => props.onEditItem?.(item.key, value)}
              />
            ))}
            {batch.answers.map((item) => (
              <li key={item.canonicalKey} className="px-4 py-2.5">
                <p className="text-[12px] font-medium leading-snug text-slate-200">
                  {c.answerFor} {item.question}
                </p>
                <Quoted>{item.text}</Quoted>
                <p className="pmd-mono mt-1 text-[10px] tracking-[0.06em] text-slate-400">
                  {item.canonicalKey}
                </p>
              </li>
            ))}
          </ul>
          {overflowing && (
            <div
              aria-hidden
              className="pmd-more pointer-events-none absolute inset-x-0 bottom-0 flex h-7 items-end justify-center pb-1"
            >
              <Chevron className="h-3.5 w-3.5 rotate-90 text-slate-400" />
            </div>
          )}
          </div>

          {saveError && (
            <p className="px-4 pb-1">
              <Failure>{saveError}</Failure>
            </p>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-slate-700/70 px-4 py-2.5">
            <Action onClick={() => setView("ledger")} tone="quiet">
              {c.back}
            </Action>
            {saved ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                {c.saved}
              </span>
            ) : (
              <Action
                onClick={() => {
                  if (!props.onSaveBatch) return;
                  setSaving(true);
                  setSaveError(null);
                  void props
                    .onSaveBatch(batch)
                    .then((ok) => {
                      setSaved(ok);
                      // Naming the file's state is the point: a failed save must
                      // never look like a quiet success.
                      if (!ok) setSaveError(c.saveFailed);
                      if (ok) setView("ledger");
                    })
                    .catch(() => setSaveError(c.saveFailed))
                    .finally(() => setSaving(false));
                }}
                disabled={saving || toSave === 0}
              >
                {saving ? (
                  <>
                    <span className="pmd-pulse h-1.5 w-1.5 rounded-full bg-sky-400" />
                    {c.saving}
                  </>
                ) : (
                  <>
                    <Mark className="h-3.5 w-3.5" />
                    {c.save} {toSave}
                  </>
                )}
              </Action>
            )}
          </div>
        </>
      ) : rows.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-slate-200">{c.empty}</p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[12px] leading-relaxed text-slate-400">
            {c.emptyHelp}
          </p>
        </div>
      ) : (
        <div className="relative min-h-0">
        <ul
          ref={listRef}
          onScroll={measureOverflow}
          className="divide-y divide-slate-700/50 overflow-y-auto"
        >
          {rows.map((row) =>
            row.kind === "fact" ? (
              <FactRow key={row.id} row={row} lang={lang} onFill={() => props.onFill(row)} />
            ) : row.kind === "answer" ? (
              <AnswerRow key={row.id} row={row} lang={lang} onInsert={() => props.onFill(row)} />
            ) : (
              <UnansweredRow
                key={row.id}
                row={row}
                lang={lang}
                serverUp={serverUp}
                onDraft={(instruction) => props.onDraft(row, instruction)}
                onInsert={(text) => props.onInsertDraft(row, text)}
              />
            ),
          )}
        </ul>
        {/* Overlays the edge; never modifies a row. */}
        {overflowing && (
          <div
            aria-hidden
            className="pmd-more pointer-events-none absolute inset-x-0 bottom-0 flex h-7 items-end justify-center pb-1"
          >
            <Chevron className="h-3.5 w-3.5 rotate-90 text-slate-400" />
          </div>
        )}
        </div>
      )}

      {/*
        The way into the confirm view, and the only thing that ever announces a
        pending batch inside the ledger. Deliberately a strip you choose to enter
        rather than a panel that takes over: you may be mid-form, and the batch
        keeps until you are done.
      */}
      {view === "ledger" && toSave > 0 && (
        <button
          type="button"
          onClick={() => setView("confirm")}
          className={`flex items-center justify-between gap-3 border-t border-slate-700/70 bg-slate-800/60 px-4 py-2 text-left transition-colors duration-150 hover:bg-slate-800 ${FOCUS}`}
        >
          <span className="text-[12px] text-slate-200">{c.reviewLead(toSave)}</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-slate-100">
            {c.review}
            <Chevron className="h-3.5 w-3.5" />
          </span>
        </button>
      )}

      <footer className="flex items-center justify-between gap-3 border-t border-slate-700/70 px-4 py-2">
        {undoCount > 0 ? (
          <Action onClick={props.onUndo} tone="quiet">
            <Undo className="h-3.5 w-3.5" />
            {c.undo(undoCount)}
          </Action>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={props.onDismissSite}
          className={`rounded px-1 text-[11px] text-slate-400 transition-colors hover:text-slate-200 ${FOCUS}`}
        >
          {c.never}
        </button>
      </footer>
    </div>
  );
}
