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
  INTERVIEW_DECLARATIONS,
  INTERVIEW_SECTIONS,
  REGISTER_FACT,
  declarationProgress,
  type Lang,
} from "@personal-md/core";

import Bureau from "../../components/document/Bureau.tsx";
import Cover from "../../components/document/Cover.tsx";
import DataPage from "../../components/document/DataPage.tsx";
import Declaration from "../../components/document/Declaration.tsx";
import Exemplars from "../../components/document/Exemplars.tsx";
import Issuance from "../../components/document/Issuance.tsx";
import Observations from "../../components/document/Observations.tsx";
import PageRail, { type RailPage } from "../../components/document/PageRail.tsx";
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

  // The draft is part of what the document currently says, so it goes in here:
  // the machine-readable line has to fill as the user types, not when they save.
  const dossier = useMemo(
    () => readDossier(profile, payload?.mirror?.withheldKeys ?? [], lang, draft),
    [profile, payload, lang, draft],
  );

  const mrz = useMemo(
    () =>
      encodeMrz({
        fullName: dossier.holder ?? "",
        language: dossier.language,
        firstRecordedAt: dossier.firstRecordedAt,
        revisedAt: dossier.revisedAt,
        facts: dossier.extent.facts,
        answers: dossier.extent.declarations,
        words: dossier.extent.words,
      }),
    [dossier],
  );

  const stored = useMemo(
    () => new Map((profile?.facts ?? []).map((f) => [f.key, f])),
    [profile],
  );

  /**
   * Draft wins over stored, so a half-answered page is not overwritten by a
   * refetch. Sections, declaration atoms and the register all live in one map,
   * because they are all ordinary facts and the save path is the same for each.
   */
  const values = useMemo(() => {
    const out: Record<string, string> = {};
    const put = (key: string) => {
      out[key] = draft[key] ?? stored.get(key)?.value ?? "";
    };
    for (const section of INTERVIEW_SECTIONS) for (const f of section.facts) put(f.key);
    for (const d of INTERVIEW_DECLARATIONS) for (const a of d.atoms) put(a.key);
    put(REGISTER_FACT.key);
    return out;
  }, [draft, stored]);

  /**
   * Save an arbitrary set of keys. One message, because it is one decision by
   * the user and it has to be one write on disk - the same rule the confirm-to-
   * learn batch follows.
   */
  const saveKeys = async (id: string, facts: { key: string; label: string }[]) => {
    const pending = facts.filter((f) => draft[f.key] !== undefined);
    if (pending.length === 0) return;

    setSavingSection(id);
    setError("");
    try {
      await send({
        kind: "saveFacts",
        facts: pending.map((f) => ({
          key: f.key,
          label: f.label,
          value: (draft[f.key] ?? "").trim(),
        })),
      });
      setDraft((d) => {
        const next = { ...d };
        for (const f of pending) delete next[f.key];
        return next;
      });
      await load();
      setStamped(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not save");
    } finally {
      setSavingSection(null);
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

  const declarationPages: RailPage[] = INTERVIEW_DECLARATIONS.map((declaration, i) => ({
    id: `d-${i}`,
    folio: folio(INTERVIEW_SECTIONS.length + i),
    // The rail cannot carry a whole question, so it carries it without its
    // punctuation - which is also roughly what the file calls it.
    title: {
      es: declaration.prompt.es.replace(/[¿?.]/g, "").trim(),
      en: declaration.prompt.en.replace(/[?.]/g, "").trim(),
    },
    stamped: declarationProgress(
      declaration,
      (key) => (stored.get(key)?.value ?? "").trim() !== "",
    ).complete,
  }));

  const voicePage: RailPage = {
    id: "voice",
    folio: folio(INTERVIEW_SECTIONS.length + INTERVIEW_DECLARATIONS.length),
    title: { es: "Cómo escribes tú", en: "How you write" },
    // Marked when there is something to model a voice on. The register alone is
    // not enough to claim this page is done, and saying otherwise would hide the
    // one gap that makes drafts read generically.
    stamped: (profile?.answers ?? []).some((a) => a.text.trim()),
  };

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
    const declaration = INTERVIEW_DECLARATIONS.findIndex(
      (d) =>
        !declarationProgress(d, (key) => (stored.get(key)?.value ?? "").trim() !== "").complete,
    );
    if (declaration !== -1) return `d-${declaration}`;
    // Everything is declared; what is left is a voice to model drafts on.
    return (profile?.answers ?? []).some((a) => a.text.trim()) ? null : "voice";
  })();

  /**
   * When any of these keys was last written, from the file.
   *
   * Generalised from sections to any set of keys, because a declaration's stamp
   * is the same idea over a different group: the date on the impression has to be
   * a date the file actually holds, not the moment the page rendered.
   */
  const factSavedAt = (keys: readonly string[]): Date | null => {
    const stamps = keys
      .map((key) => stored.get(key))
      .filter((f): f is NonNullable<typeof f> => Boolean(f && f.value.trim()))
      .map((f) => new Date(f.updatedAt).getTime())
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

    if (page === "voice") {
      return (
        <Exemplars
          answers={profile?.answers ?? []}
          register={values[REGISTER_FACT.key] ?? ""}
          lang={lang}
          savedAt={factSavedAt([REGISTER_FACT.key])}
          justStamped={stamped === "voice"}
          dirty={draft[REGISTER_FACT.key] !== undefined}
          saving={savingSection === "voice"}
          onChange={(value) => {
            setStamped(null);
            setDraft((d) => ({ ...d, [REGISTER_FACT.key]: value }));
          }}
          onSave={() =>
            void saveKeys("voice", [
              { key: REGISTER_FACT.key, label: REGISTER_FACT.label.en },
            ])
          }
        />
      );
    }

    if (page.startsWith("d-")) {
      const index = Number(page.slice(2));
      const declaration = INTERVIEW_DECLARATIONS[index];
      if (!declaration) return null;
      return (
        <Declaration
          key={declaration.canonicalKey}
          declaration={declaration}
          folio={folio(INTERVIEW_SECTIONS.length + index)}
          values={values}
          withheld={withheld}
          lang={lang}
          seed={dossier.holder ?? ""}
          dirty={declaration.atoms.some((a) => draft[a.key] !== undefined)}
          saving={savingSection === declaration.canonicalKey}
          savedAt={factSavedAt(declaration.atoms.map((a) => a.key))}
          justStamped={stamped === declaration.canonicalKey}
          onChange={(key, value) => {
            setStamped(null);
            setDraft((d) => ({ ...d, [key]: value }));
          }}
          onSave={() =>
            void saveKeys(
              declaration.canonicalKey,
              declaration.atoms.map((a) => ({ key: a.key, label: a.label.en })),
            )
          }
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
        savedAt={factSavedAt(section.facts.map((f) => f.key))}
        justStamped={stamped === section.id}
        onChange={(key, value) => {
          setStamped(null);
          setDraft((d) => ({ ...d, [key]: value }));
        }}
        onSave={() =>
          void saveKeys(
            section.id,
            section.facts.map((f) => ({ key: f.key, label: f.label.en })),
          )
        }
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
          pages={[...sectionPages, ...declarationPages, voicePage, ...asidePages]}
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
