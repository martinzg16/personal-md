/**
 * The public demo's data, and its mounting.
 *
 * Deliberately a different file from widget-preview.tsx. The local harness uses
 * realistic data - the owner's own name, their actual stored salary - because
 * that is what makes a layout bug obvious. None of that belongs on a hosted
 * page, so this file carries an invented person and nothing else.
 */

import { createRoot } from "react-dom/client";

import Widget, { type Row } from "../components/widget/Widget.tsx";
import type { AnswerSuggestion, FieldSuggestion } from "../lib/match/deterministic.ts";
import type { PendingBatch } from "../lib/learn/pending.ts";
import type { DraftResponse } from "../lib/server-client.ts";

const fill = (over: Partial<FieldSuggestion>): FieldSuggestion => ({
  fieldId: "f1",
  label: "Nombre y apellidos",
  category: "personal.name.full",
  value: "Ana Beltrán Ríos",
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
  text: "Llevo seis años haciendo que los informes de facturación digan la verdad, y casi siempre eso ha significado borrar cosas en lugar de añadirlas.",
  via: "alias",
  askedAsBefore: ["¿Por qué te interesa esta posición?", "Why do you want to work here?"],
  writtenAt: "2026-07-14",
};

const draft: DraftResponse = {
  draft:
    "Rehice el cierre mensual del equipo de facturación. El proceso antiguo pedía tres informes que nadie abría, así que los quité antes de tocar nada más.\n\nEl cierre pasó de nueve días a cuatro. Lo que hice mal fue lanzar el nuevo motor de conciliación antes de los estados de error, así que durante dos semanas soporte absorbió la confusión.",
  language: "es",
  length: { words: 64, chars: 341, withinLimit: true, shortened: false },
  confidence: { level: "high", score: 0.85, reasons: ["ya has contestado esta misma pregunta"] },
  provenance: [
    {
      canonicalKey: "experience.leadership_story",
      askedAs: "Describe una vez que lideraste un proyecto",
      writtenAt: "2026-08-22",
      role: "both",
      why: "tu respuesta a esta misma pregunta",
      used: true,
      excerpt: "Rehice el cierre mensual del equipo de facturación...",
    },
    {
      canonicalKey: "experience.metric_impact",
      askedAs: "¿Cuál es el impacto del que estás más orgullosa?",
      writtenAt: "2026-06-02",
      role: "voice",
      why: "escrito en es, mismo tipo de formulario",
      used: true,
      excerpt: "El cierre pasó de nueve días a cuatro...",
    },
  ],
  informationGaps: [],
  flags: { injectionSuspected: false, thinRetrieval: false, ungroundedSuspicion: false },
  spent: { calls: 1, inputTokens: 26014, outputTokens: 152, costUsd: 0.0231 },
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
      value: "00000000X",
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
      value: "Ana",
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
      value: "48.000 EUR",
      sourceKey: "logistics.salary_expectation",
      currentValue: "42.000",
    }),
    applied: false,
  },
  {
    kind: "fact",
    id: "e",
    suggestion: fill({ fieldId: "f5", label: "Ciudad", value: "Valencia", sourceKey: "personal.city" }),
    applied: true,
  },
  {
    kind: "fact",
    id: "e2",
    suggestion: fill({ fieldId: "f6", label: "País", value: "España", sourceKey: "personal.country" }),
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
];

const BATCH: PendingBatch = {
  facts: [
    { fieldId: "p1", key: "personal.city", label: "Ciudad", value: "Valencia", replaces: "Madrid" },
    { fieldId: "p2", key: "logistics.availability", label: "Disponibilidad", value: "2 semanas" },
  ],
  answers: [
    {
      fieldId: "p3",
      canonicalKey: "experience.leadership_story",
      question: "Describe una vez que lideraste un proyecto",
      text: "Rehice el cierre mensual del equipo de facturación. Pasó de nueve días a cuatro.",
    },
  ],
};

const noop = () => {};
const base = {
  onFill: noop,
  onDraft: noop,
  onInsertDraft: noop,
  onUndo: noop,
  onDismissSite: noop,
} as const;

const PANELS: Record<string, React.ReactElement> = {
  ledger: (
    <Widget lang="es" domain="careers.example.com" rows={ROWS} undoCount={1} serverUp initialOpen {...base} />
  ),
  degraded: (
    <Widget
      lang="en"
      domain="jobs.example.org"
      rows={ROWS.slice(0, 5)}
      undoCount={0}
      serverUp={false}
      initialOpen
      {...base}
    />
  ),
  drafting: (
    <Widget lang="es" domain="careers.example.com" rows={ROWS.slice(6)} undoCount={0} serverUp initialOpen {...base} />
  ),
  confirm: (
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
      {...base}
    />
  ),
  pill: <Widget lang="es" domain="careers.example.com" rows={ROWS} undoCount={0} serverUp {...base} />,
};

for (const [name, element] of Object.entries(PANELS)) {
  const host = document.querySelector(`[data-panel="${name}"]`);
  if (host) createRoot(host).render(element);
}
