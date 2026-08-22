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
 *   itself, nothing takes focus. The panel opens on click, above the pill.
 * FORM: source-first ledger; candidate 6 of 7 on the resonance-ordered list;
 *   seed key a21341ab.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { DraftResponse } from "../../lib/protocol.ts";
import type { AnswerSuggestion, FieldSuggestion } from "../../lib/match/deterministic.ts";
import { Arrow, Check, Chevron, Close, Draft, Gap, Insert, Mark, Reveal, Undo, Withheld } from "./icons.tsx";

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
   * Start expanded. Off by default and deliberately so: the panel never opens
   * itself on a page you may only be skimming. Used by the visual harness, and
   * by an explicit "open it" action from the popup.
   */
  initialOpen?: boolean;
}

const t = {
  en: {
    pill: (n: number) => `${n} from your file`,
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
    empty: "Your file could not be read.",
    emptyHelp: "The companion server answered, but the profile came back empty. Check it is pointing at the right ~/.personal-md.",
    tellIt: "Tell it what to change",
    checkFirst: "This field already has a value",
    fillFailed: "That field is no longer on the page. Reload and try again.",
    draftFailed: "Could not draft this.",
  },
  es: {
    pill: (n: number) => `${n} de tu fichero`,
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
    empty: "No se pudo leer tu fichero.",
    emptyHelp: "El servidor respondió, pero el perfil vino vacío. Comprueba que apunta al ~/.personal-md correcto.",
    tellIt: "Dile qué cambiar",
    checkFirst: "Este campo ya tiene un valor",
    fillFailed: "Ese campo ya no está en la página. Recarga e inténtalo otra vez.",
    draftFailed: "No se pudo redactar.",
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
 * Amber belongs to degradation (the server banner), so this gets its own
 * treatment and a readable size: it is the guard against the failure this whole
 * design was pointed at, and it was previously the smallest text in the panel
 * wearing a status colour.
 */
function Caution({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-orange-400/40 bg-orange-400/10 px-1.5 py-0.5 text-[11px] font-medium text-orange-200">
      <Gap className="h-3 w-3 shrink-0" />
      {children}
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
    <span className="pmd-mono inline-flex min-w-0 items-center gap-1 text-[10px] tracking-[0.06em] text-slate-300">
      <Arrow className="h-3 w-3 shrink-0 text-slate-500" />
      <span className="truncate">{label}</span>
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
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Quoted lead>{hidden ? mask(s.value) : s.value}</Quoted>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="pmd-mono max-w-full truncate text-[10px] tracking-[0.06em] text-slate-400">
              {s.derivedFrom ? `${c.derivedFrom} ${s.derivedFrom}` : `${c.from} ${s.sourceKey}`}
            </span>
            <Destination label={s.label || s.category} lang={lang} />
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
              <Caution>{c.checkFirst}</Caution>
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
    <li className="px-4 py-3">
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
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug text-slate-100">{row.question}</p>
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

export default function Widget(props: WidgetProps) {
  const { lang, domain, rows, undoCount, serverUp } = props;
  const c = t[lang];
  const [open, setOpen] = useState(props.initialOpen ?? false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const justOpened = useRef(false);

  const pending = useMemo(() => rows.filter((r) => !r.applied).length, [rows]);

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
        {pending > 0 ? c.pill(pending) : c.pillDone}
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label={c.region(domain)}
      className="pmd-enter pointer-events-auto flex max-h-[min(70vh,560px)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg bg-slate-900 shadow-[0_16px_48px_-12px_rgba(15,23,42,0.6)] ring-1 ring-slate-700/80"
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
          <Close className="h-4 w-4" />
        </button>
      </header>

      {!serverUp && (
        <p className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-200">
          {c.serverDown}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-slate-200">{c.empty}</p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[12px] leading-relaxed text-slate-400">
            {c.emptyHelp}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-700/50 overflow-y-auto pmd-fade">
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
