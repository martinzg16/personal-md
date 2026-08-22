/**
 * Visual harness for the widget, rendered in a real browser with the real
 * compiled stylesheet.
 *
 * The content script cannot run outside an extension context, but the panel's
 * design can be verified faithfully by mounting the component itself with
 * representative state. Every state the widget has is on this page at once,
 * against both a light and a dark host ground, because "legible on any page" is a
 * claim that has to be looked at rather than asserted.
 */

import { createRoot } from "react-dom/client";

import Widget, { type Row } from "../components/widget/Widget.tsx";
import type { PendingBatch } from "../lib/learn/pending.ts";
import type { AnswerSuggestion, FieldSuggestion } from "../lib/match/deterministic.ts";
import type { DraftResponse } from "../lib/server-client.ts";

const fill = (over: Partial<FieldSuggestion>): FieldSuggestion => ({
  fieldId: "f1",
  label: "Nombre y apellidos",
  category: "personal.name.full",
  value: "Martin Zulueta Perez",
  sourceKey: "personal.full_name",
  confidence: 1,
  localOnly: false,
  currentValue: "",
  ...over,
});

const answer: AnswerSuggestion = {
  fieldId: "f9",
  question: "¿Por qué te interesa esta posición?",
  canonicalKey: "motivation.why_this_company",
  text: "Llevo seis años decidiendo qué problemas fiscales merece la pena resolver, y casi siempre eso significa decir no a la mayoría. Lo que me atrae de vosotros es el mismo problema a otra escala, con más gente delante.",
  via: "alias",
  askedAsBefore: ["¿Por qué te interesa esta posición?", "Why do you want to work here?"],
  writtenAt: "2026-07-14",
};

const draft: DraftResponse = {
  draft:
    "I led the migration of our investor flow last year. The old flow asked people for documents we already had, so a third of them dropped out before they finished.\n\nReview time went from 2.41 days per case to 1.10, and the queue went from 13 people to 6. The part I got wrong was shipping the import before the error states, so for two weeks support absorbed the confusion.",
  language: "en",
  length: { words: 71, chars: 372, withinLimit: true, shortened: false },
  confidence: { level: "high", score: 0.85, reasons: ["you have answered this exact question before"] },
  provenance: [
    {
      canonicalKey: "experience.leadership_story",
      askedAs: "Describe a time you led a project",
      writtenAt: "2026-08-22",
      role: "both",
      why: "your answer to this same question",
      used: true,
      excerpt: "I led the migration of our investor flow last year...",
    },
    {
      canonicalKey: "experience.metric_impact",
      askedAs: "What is the impact you are most proud of?",
      writtenAt: "2026-06-02",
      role: "voice",
      why: "written in en, same kind of form",
      used: true,
      excerpt: "Deciding which tax problems are worth solving for 300,000 people...",
    },
  ],
  informationGaps: [
    {
      missing: "the name of the team that took over the queue",
      questionForUser: "Who owns that queue now? I left it vague rather than guess.",
    },
  ],
  flags: { injectionSuspected: false, thinRetrieval: false, ungroundedSuspicion: true },
  spent: { calls: 1, inputTokens: 37211, outputTokens: 160, costUsd: 0.0235 },
  notes: [],
};

const ROWS: Row[] = [
  { kind: "fact", id: "a", suggestion: fill({}), applied: false },
  {
    kind: "fact",
    id: "b",
    suggestion: fill({
      fieldId: "f2",
      label: "NIF / NIE",
      category: "personal.nif",
      value: "12345678Z",
      sourceKey: "personal.nif",
      localOnly: true,
    }),
    applied: false,
  },
  {
    kind: "fact",
    id: "c",
    suggestion: fill({
      fieldId: "f3",
      label: "Nombre",
      category: "personal.name.first",
      value: "Martin",
      sourceKey: "personal.full_name",
      confidence: 0.8,
      derivedFrom: "personal.full_name",
    }),
    applied: false,
  },
  {
    kind: "fact",
    id: "d",
    suggestion: fill({
      fieldId: "f4",
      label: "Expectativa salarial bruta anual",
      category: "work.salary_expectation",
      value: "70.000 EUR",
      sourceKey: "logistics.salary_expectation",
      currentValue: "60.000",
    }),
    applied: false,
  },
  {
    kind: "fact",
    id: "e",
    suggestion: fill({ fieldId: "f5", label: "Ciudad", value: "Madrid", sourceKey: "personal.city" }),
    applied: true,
  },
  {
    kind: "fact",
    id: "e2",
    suggestion: fill({
      fieldId: "f6",
      label: "País",
      value: "España",
      sourceKey: "personal.country",
    }),
    applied: false,
    fillError: "Ninguna opción de ese campo coincide con tu valor guardado.",
  },
  { kind: "answer", id: "f", suggestion: answer, applied: false },
  {
    kind: "unanswered",
    id: "g",
    fieldId: "f10",
    question: "Describe una vez que lideraste un proyecto",
    maxWords: 250,
    draft,
    state: "ready",
    applied: false,
  },
  {
    kind: "unanswered",
    id: "h",
    fieldId: "f11",
    question: "Cuéntanos brevemente sobre ti",
    maxWords: 100,
    draft: null,
    state: "drafting",
    applied: false,
  },
  {
    kind: "unanswered",
    id: "i",
    fieldId: "f12",
    question: "What is the hardest technical trade-off you have made?",
    maxWords: null,
    draft: null,
    state: "idle",
    applied: false,
  },
];

const BATCH: PendingBatch = {
  facts: [
    { fieldId: "f20", key: "personal.city", label: "Ciudad", value: "Barcelona", replaces: "Madrid" },
    { fieldId: "f21", key: "logistics.availability", label: "Disponibilidad", value: "2 semanas" },
    { fieldId: "f22", key: "personal.first_name", label: "Nombre", value: "MARTIN" },
  ],
  answers: [
    {
      fieldId: "f23",
      canonicalKey: "experience.leadership_story",
      question: "Describe una vez que lideraste un proyecto",
      text: "Lideré la migración del flujo de inversores. El flujo antiguo pedía documentos que ya teníamos, así que un tercio abandonaba antes de terminar.",
    },
  ],
};

const noop = () => {};

function Slot({
  title,
  ground,
  children,
}: {
  title: string;
  ground: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ background: ground, padding: "24px", borderRadius: "10px" }}>
      <p
        style={{
          font: "600 11px/1 ui-monospace, monospace",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: ground === "#ffffff" ? "#64748b" : "#94a3b8",
          marginBottom: "16px",
        }}
      >
        {title}
      </p>
      <div className="pmd-root pmd-preview">{children}</div>
    </section>
  );
}

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <div style={{ display: "grid", gap: "24px", padding: "24px", maxWidth: "1180px" }}>
      <Slot title="Expanded, on a light page" ground="#ffffff">
        <Widget
          lang="es"
          domain="careers.example.com"
          rows={ROWS}
          undoCount={1}
          serverUp
          initialOpen
          onFill={noop}
          onDraft={noop}
          onInsertDraft={noop}
          onUndo={noop}
          onDismissSite={noop}
        />
      </Slot>

      <Slot title="Expanded, on a dark page, server stopped" ground="#0b1120">
        <Widget
          lang="en"
          domain="jobs.example.org"
          rows={ROWS.slice(0, 6)}
          undoCount={0}
          serverUp={false}
          initialOpen
          onFill={noop}
          onDraft={noop}
          onInsertDraft={noop}
          onUndo={noop}
          onDismissSite={noop}
        />
      </Slot>

      {/*
        The rows the first two panels push below their own scroll fold: a fill
        that failed, a stored answer, a ready draft, one in flight, and one not
        started. A capture that only ever shows the top of the list cannot be
        reviewed for the states that matter most.
      */}
      <Slot title="Expanded, the rows below the fold" ground="#ffffff">
        <Widget
          lang="es"
          domain="careers.example.com"
          rows={ROWS.slice(5)}
          undoCount={2}
          serverUp
          initialOpen
          onFill={noop}
          onDraft={noop}
          onInsertDraft={noop}
          onUndo={noop}
          onDismissSite={noop}
        />
      </Slot>

      {/*
        The two states no capture had ever shown, because they were always last
        in the list and always below the fold: a draft in flight, and a question
        not started. Also the only place "nothing in your file answers this"
        should appear at all.
      */}
      <Slot title="Drafting, and not yet started" ground="#ffffff">
        <Widget
          lang="es"
          domain="careers.example.com"
          rows={ROWS.slice(8)}
          undoCount={0}
          serverUp
          initialOpen
          onFill={noop}
          onDraft={noop}
          onInsertDraft={noop}
          onUndo={noop}
          onDismissSite={noop}
        />
      </Slot>

      {/*
        The one decision at the end of a long form. Nothing above it was saved
        while it was being filled.
      */}
      {/*
        Fill-all. The bar names what it will skip, because the fields it refuses
        to touch are the whole reason it is safe to press.
      */}
      <Slot title="Fill all, with one field guarded" ground="#ffffff">
        <Widget
          lang="es"
          domain="careers.example.com"
          rows={ROWS}
          undoCount={0}
          serverUp
          initialOpen
          onFillAll={noop}
          onFill={noop}
          onDraft={noop}
          onInsertDraft={noop}
          onUndo={noop}
          onDismissSite={noop}
        />
      </Slot>

      <Slot title="Confirm to learn, after a submit" ground="#ffffff">
        <Widget
          lang="es"
          domain="careers.example.com"
          rows={ROWS}
          undoCount={0}
          serverUp
          initialOpen
          pending={BATCH}
          submitAttempted
          onSaveBatch={async () => true}
          onDeclineItem={noop}
          onEditItem={noop}
          onFill={noop}
          onDraft={noop}
          onInsertDraft={noop}
          onUndo={noop}
          onDismissSite={noop}
        />
      </Slot>

      {/* The same batch offered from inside the ledger, before any submit. */}
      <Slot title="The review strip, mid-form" ground="#ffffff">
        <Widget
          lang="en"
          domain="jobs.example.org"
          rows={ROWS.slice(0, 3)}
          undoCount={0}
          serverUp
          initialOpen
          pending={BATCH}
          onSaveBatch={async () => true}
          onDeclineItem={noop}
          onEditItem={noop}
          onFill={noop}
          onDraft={noop}
          onInsertDraft={noop}
          onUndo={noop}
          onDismissSite={noop}
        />
      </Slot>

      <Slot title="Collapsed, and the empty state" ground="#f1f5f9">
        <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
          <Widget
            lang="en"
            domain="careers.example.com"
            rows={ROWS}
            undoCount={0}
            serverUp
            onFill={noop}
            onDraft={noop}
            onInsertDraft={noop}
            onUndo={noop}
            onDismissSite={noop}
            />
          <Widget
            lang="en"
            domain="unknown.example.com"
            rows={[]}
            undoCount={0}
            serverUp
            initialOpen
            onFill={noop}
            onDraft={noop}
            onInsertDraft={noop}
            onUndo={noop}
            onDismissSite={noop}
            />
        </div>
      </Slot>
    </div>,
  );
}
