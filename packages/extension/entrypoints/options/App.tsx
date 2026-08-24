/**
 * The document.
 *
 * This surface is where a profile comes from, so everything downstream is empty
 * until something happens here - and the old version of this page was a settings
 * form with an "Interview" tab bolted onto it, which is the wrong shape for the
 * most important thing the product does.
 *
 * It is now one document with numbered folios: four data pages of facts, eight
 * visa pages of open questions, an observations page holding the file as it
 * stands, the issuing bureau, and the issuance sequence at the end. The two rules
 * that shaped the old interview survive intact, because they were right:
 *
 *   - nothing is required, since a document with four facts and one answer is
 *     already more useful than an empty one, and a mandatory wizard just gets
 *     abandoned;
 *   - every page records on its own, so closing the tab halfway through loses
 *     nothing.
 *
 * What the language toggle controls has narrowed, and that is a consequence of
 * the form rather than a decision taken separately. Field labels are printed in
 * both languages on every page, the way a data page prints them, so there is
 * nothing left to swap: the toggle now sets only which language the user's own
 * prose is written in, which is the one thing it was ever really choosing.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  INTERVIEW_QUESTIONS,
  INTERVIEW_SECTIONS,
  type Lang,
} from "@personal-md/core";

import Bureau from "../../components/document/Bureau.tsx";
import Cover from "../../components/document/Cover.tsx";
import DataPage from "../../components/document/DataPage.tsx";
import Issuance from "../../components/document/Issuance.tsx";
import Observations from "../../components/document/Observations.tsx";
import PageRail, { type RailPage } from "../../components/document/PageRail.tsx";
import VisaPage from "../../components/document/VisaPage.tsx";
import { readDossier } from "../../lib/document/dossier.ts";
import { encodeMrz } from "../../lib/document/mrz.ts";
import { send } from "../../lib/protocol.ts";
import type { MirrorPayload } from "../../lib/protocol.ts";
import { DEFAULT_PORT, settings } from "../../lib/settings.ts";

const folio = (n: number) => String(n + 1).padStart(2, "0");

export default function App() {
  const [payload, setPayload] = useState<MirrorPayload | null>(null);
  const [token, setToken] = useState("");
  const [port, setPort] = useState(DEFAULT_PORT);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<Lang>("es");

  // `null` while we do not yet know whether the cover has been opened. Rendering
  // the cover before that answer arrives would flash it at every returning user.
  const [opened, setOpened] = useState<boolean | null>(null);
  const [turning, setTurning] = useState(false);

  const [page, setPage] = useState("s-identity");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [stamped, setStamped] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setPayload(await send<MirrorPayload>({ kind: "getMirror" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not reach the background worker");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setToken(await settings.getToken());
      setPort(await settings.getPort());
      setOpened(await settings.getOpened());
      await load();
    })();
  }, [load]);

  const profile = payload?.mirror?.profile ?? null;
  const connection = payload?.connection ?? { kind: "no_token" as const };
  const withheld = useMemo(
    () => new Set(payload?.mirror?.withheldKeys ?? []),
    [payload],
  );

  const dossier = useMemo(
    () => readDossier(profile, payload?.mirror?.withheldKeys ?? [], lang),
    [profile, payload, lang],
  );

  const mrz = useMemo(
    () =>
      encodeMrz({
        fullName: dossier.holder ?? "",
        language: dossier.language,
        firstRecordedAt: dossier.firstRecordedAt,
        revisedAt: dossier.revisedAt,
        facts: dossier.extent.facts,
        answers: dossier.extent.answers,
        words: dossier.extent.words,
      }),
    [dossier],
  );

  const stored = useMemo(
    () => new Map((profile?.facts ?? []).map((f) => [f.key, f])),
    [profile],
  );
  const answers = useMemo(
    () => new Map((profile?.answers ?? []).map((a) => [a.canonicalKey, a])),
    [profile],
  );

  /** Draft wins over stored, so a half-typed field is not overwritten by a refetch. */
  const values = useMemo(() => {
    const out: Record<string, string> = {};
    for (const section of INTERVIEW_SECTIONS) {
      for (const fact of section.facts) {
        out[fact.key] = draft[fact.key] ?? stored.get(fact.key)?.value ?? "";
      }
    }
    return out;
  }, [draft, stored]);

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
      await load();
      // The press plays once, on the page that was just recorded.
      setStamped(sectionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save");
    } finally {
      setSavingSection(null);
    }
  };

  const saveAnswer = async (index: number, text: string) => {
    const question = INTERVIEW_QUESTIONS[index];
    if (!question) return;
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save");
      // Rethrown so the page keeps the text on screen rather than reporting a
      // stamp that never landed.
      throw err;
    }
  };

  const openCover = () => {
    setTurning(true);
    void settings.setOpened();
    window.setTimeout(() => setOpened(true), 560);
  };

  if (opened === null) {
    // One frame of nothing rather than a flash of the wrong surface.
    return <div className="min-h-screen" />;
  }

  if (!opened) {
    return (
      <Cover holder={dossier.holder} onOpen={openCover} turning={turning} lang={lang} />
    );
  }

  const sectionPages: RailPage[] = INTERVIEW_SECTIONS.map((section, i) => ({
    id: `s-${section.id}`,
    folio: folio(i),
    title: section.title,
    stamped: section.facts.some((f) => (stored.get(f.key)?.value ?? "").trim() !== ""),
  }));

  const questionPages: RailPage[] = INTERVIEW_QUESTIONS.map((question, i) => ({
    id: `q-${i}`,
    folio: folio(INTERVIEW_SECTIONS.length + i),
    // The rail cannot carry a whole question, so it carries the subject the
    // canonical key names - which is also what the file calls it.
    title: {
      es: question.prompt.es.replace(/[¿?.]/g, "").trim(),
      en: question.prompt.en.replace(/[?.]/g, "").trim(),
    },
    stamped: (answers.get(question.canonicalKey)?.text ?? "").trim() !== "",
  }));

  const asidePages: RailPage[] = [
    {
      id: "observations",
      folio: "—",
      title: { es: "Observaciones", en: "Observations" },
      stamped: false,
      aside: true,
    },
    {
      id: "bureau",
      folio: "—",
      title: { es: "Autoridad emisora", en: "Issuing bureau" },
      stamped: false,
      aside: true,
    },
  ];

  const issuancePage: RailPage = {
    id: "issuance",
    folio: "★",
    title: { es: "Expedición", en: "Issuance" },
    stamped: dossier.complete,
    aside: true,
  };

  /**
   * Where to send someone who asks what is still missing.
   *
   * Facts first, then questions, in the document's own order - so the answer is
   * always the earliest folio that still has something on it to do.
   */
  const outstandingPage = ((): string | null => {
    const first = dossier.outstanding[0];
    if (first) {
      const section = INTERVIEW_SECTIONS.find((s) =>
        s.facts.some((f) => f.key === first.key),
      );
      if (section) return `s-${section.id}`;
    }
    const question = INTERVIEW_QUESTIONS.findIndex(
      (q) => (answers.get(q.canonicalKey)?.text ?? "").trim() === "",
    );
    return question === -1 ? null : `q-${question}`;
  })();

  const sectionSavedAt = (sectionId: string): Date | null => {
    const section = INTERVIEW_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return null;
    const stamps = section.facts
      .map((f) => stored.get(f.key))
      .filter((f) => f && f.value.trim())
      .map((f) => new Date(f!.updatedAt).getTime())
      .filter((t) => !Number.isNaN(t));
    return stamps.length ? new Date(Math.max(...stamps)) : null;
  };

  const body = () => {
    if (page === "observations") {
      return (
        <Observations
          profile={profile}
          dossier={dossier}
          withheld={withheld}
          fetchedAt={payload?.mirror?.fetchedAt ?? null}
          lang={lang}
          busy={busy}
          onRefresh={() => void load()}
        />
      );
    }

    if (page === "bureau") {
      return (
        <Bureau
          state={connection}
          token={token}
          port={port}
          note={note}
          lang={lang}
          onToken={setToken}
          onPort={setPort}
          onSave={() => {
            void (async () => {
              await settings.setToken(token);
              await settings.setPort(port);
              setNote(lang === "es" ? "Guardado." : "Saved.");
              await load();
            })();
          }}
          onRetry={() => void load()}
        />
      );
    }

    if (page === "issuance") {
      return (
        <Issuance
          profile={profile}
          dossier={dossier}
          lang={lang}
          outstandingPage={outstandingPage}
          onGoTo={setPage}
        />
      );
    }

    if (page.startsWith("q-")) {
      const index = Number(page.slice(2));
      const question = INTERVIEW_QUESTIONS[index];
      if (!question) return null;
      const existing = answers.get(question.canonicalKey);
      return (
        <VisaPage
          // Keyed so switching pages resets the local text rather than carrying
          // one question's draft onto the next.
          key={question.canonicalKey}
          question={question}
          folio={folio(INTERVIEW_SECTIONS.length + index)}
          initial={existing?.text ?? ""}
          writtenAt={existing?.writtenAt ? new Date(existing.writtenAt) : null}
          lang={lang}
          seed={dossier.holder ?? ""}
          onSave={(text) => saveAnswer(index, text)}
        />
      );
    }

    const sectionId = page.slice(2);
    const index = INTERVIEW_SECTIONS.findIndex((s) => s.id === sectionId);
    const section = INTERVIEW_SECTIONS[index];
    if (!section) return null;

    return (
      <DataPage
        key={section.id}
        section={section}
        primary={index === 0}
        folio={folio(index)}
        values={values}
        withheld={withheld}
        dossier={dossier}
        mrz={mrz}
        lang={lang}
        dirty={section.facts.some((f) => draft[f.key] !== undefined)}
        saving={savingSection === section.id}
        savedAt={sectionSavedAt(section.id)}
        justStamped={stamped === section.id}
        onChange={(key, value) => {
          setStamped(null);
          setDraft((d) => ({ ...d, [key]: value }));
        }}
        onSave={() => void saveSection(section.id)}
      />
    );
  };

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-7 sm:px-7 sm:py-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1
            className="font-sans leading-none"
            style={{
              color: "var(--color-foil-300)",
              fontSize: "17px",
              fontWeight: 700,
              fontStretch: "112%",
              letterSpacing: "0.07em",
            }}
          >
            PERSONAL.md
          </h1>
          <p className="pmd-legend pmd-legend--dark mt-1.5">
            {dossier.holder
              ? `${dossier.holder} · ${dossier.number}`
              : "Documento sin titular · Unissued document"}
          </p>
        </div>

        <div className="flex items-center gap-5">
          <span className="pmd-legend pmd-legend--dark hidden sm:inline">
            {lang === "es" ? "Escribes en" : "You write in"}
          </span>
          {/* Two states, both always visible, because this is a choice about the
              user's own prose and not a mode they should have to discover. */}
          <div
            className="flex overflow-hidden"
            style={{
              borderRadius: "2px",
              boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-cover-600) 90%, transparent)",
            }}
          >
            {(["es", "en"] as const).map((id) => (
              <button
                key={id}
                onClick={() => setLang(id)}
                aria-pressed={lang === id}
                className="pmd-action"
                style={{
                  background:
                    lang === id ? "var(--color-cover-600)" : "transparent",
                  color:
                    lang === id
                      ? "var(--color-laminate-050)"
                      : "color-mix(in oklab, var(--color-laminate-200) 62%, transparent)",
                  padding: "6px 12px",
                }}
              >
                {id === "es" ? "Español" : "English"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <p
          className="mb-6 border-l-2 px-4 py-3 font-sans text-[13px]"
          style={{
            borderColor: "var(--color-endorse-400)",
            background: "color-mix(in oklab, var(--color-endorse-600) 16%, transparent)",
            color: "var(--color-endorse-100)",
          }}
        >
          {error}
        </p>
      )}

      {/*
        `minmax(0,1fr)` on the single-column layout too, not just the two-column
        one. An implicit `auto` track is sized by its content's max-content width,
        and the widest thing in here is a forty-four character machine-readable
        line that declares `min-width: max-content` on purpose - so on a 336px
        viewport the track grew to 699px and the whole document overflowed
        sideways. The track has to refuse to grow; the line scrolls inside itself.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-9">
        <PageRail
          pages={[...sectionPages, ...questionPages, ...asidePages]}
          feature={issuancePage}
          current={page}
          onSelect={setPage}
          lang={lang}
        />
        <main className="min-w-0">{body()}</main>
      </div>
    </div>
  );
}
