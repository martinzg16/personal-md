/**
 * Brío — the app.
 *
 * Five places, one file underneath all of them, and one rule shared with the
 * panel: nothing is written until you say so, and everything written is visible.
 *
 * The state here is deliberately boring, because the interesting decisions are
 * all in the screens. Two things are worth knowing:
 *
 *   - `draft` wins over what is stored, so a half-typed section is not wiped by
 *     a refetch landing underneath it. It is cleared key by key on save, not
 *     wholesale, because a second section may be half-typed at the same time.
 *
 *   - a save is one message for one section, because it is one decision by the
 *     user and it has to be one write on disk. This is the same rule the panel's
 *     confirm-to-learn batch follows, for the same reason.
 *
 * The document surface this replaced still exists at ./App.tsx, unmounted. It is
 * a different answer to the same brief and it is worth keeping legible while both
 * are live; switching back is the import below and nothing else.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  INTERVIEW_DECLARATIONS,
  INTERVIEW_SECTIONS,
  REGISTER_FACT,
  type Lang,
} from "@personal-md/core";

import Activity from "../../components/app/Activity.tsx";
import Connections from "../../components/app/Connections.tsx";
import Context from "../../components/app/Context.tsx";
import Onboarding from "../../components/app/Onboarding.tsx";
import Privacy from "../../components/app/Privacy.tsx";
import Settings from "../../components/app/Settings.tsx";
import Shell, { type Tab } from "../../components/app/Shell.tsx";
import { send } from "../../lib/protocol.ts";
import type { MirrorPayload } from "../../lib/protocol.ts";
import { DEFAULT_PORT, settings } from "../../lib/settings.ts";

const EMPTY_LEDGER = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

export default function BrioApp() {
  const [payload, setPayload] = useState<MirrorPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [port, setPort] = useState(DEFAULT_PORT);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState<Lang>("es");

  const [tab, setTab] = useState<Tab>("context");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  /*
   * Whether onboarding has been dismissed for good.
   *
   * `null` while we do not yet know. Rendering the app before that answer
   * arrives would flash onboarding at every returning user, which is the single
   * most common way a first-run experience becomes an irritation.
   */
  const [past, setPast] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      setPayload(await send<MirrorPayload>({ kind: "getMirror" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not reach the background worker");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setToken(await settings.getToken());
      setPort(await settings.getPort());
      setPast(await settings.getOpened());
      await load();
    })();
  }, [load]);

  const profile = payload?.mirror?.profile ?? null;
  const connection = payload?.connection ?? { kind: "no_token" as const };
  const facts = useMemo(() => profile?.facts ?? [], [profile]);
  const answers = useMemo(() => profile?.answers ?? [], [profile]);
  const withheld = useMemo(
    () => new Set(payload?.mirror?.withheldKeys ?? []),
    [payload],
  );

  const stored = useMemo(() => new Map(facts.map((f) => [f.key, f])), [facts]);

  /** Draft first, then what is on disk, for every key the interview knows. */
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

  const dirty = useCallback(
    (keys: readonly string[]) => keys.some((k) => draft[k] !== undefined),
    [draft],
  );

  const onChange = useCallback((key: string, value: string) => {
    setSavedId(null);
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const onSave = useCallback(
    (id: string, group: { key: string; label: string }[]) => {
      void (async () => {
        const pending = group.filter((f) => draft[f.key] !== undefined);
        if (pending.length === 0) return;

        setSavingId(id);
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
          setSavedId(id);
        } catch (err) {
          setError(err instanceof Error ? err.message : "could not save");
        } finally {
          setSavingId(null);
        }
      })();
    },
    [draft, load],
  );

  const leave = useCallback(
    (to: Tab) => {
      void settings.setOpened();
      setPast(true);
      setTab(to);
    },
    [],
  );

  // One frame of nothing rather than a flash of the wrong surface.
  if (!loaded || past === null) return <div className="min-h-screen bg-bone-050" />;

  const empty = facts.length === 0 && answers.length === 0;
  if (!past && empty) {
    return (
      <Onboarding
        lang={lang}
        state={connection}
        onGoToSettings={() => leave("settings")}
        onGoToContext={() => leave("context")}
        onSkip={() => leave("context")}
      />
    );
  }

  /*
   * What the Privacy badge counts.
   *
   * `withheld` is every key the policy would withhold, which includes keys the
   * file does not hold. Counting those made the rail say 5 while the screen it
   * points at said 3 — two numbers for one idea, on the same screen. The badge
   * counts what the screen counts: withheld keys you actually have a value for.
   */
  const heldWithheld = facts.filter((f) => f.value.trim() && withheld.has(f.key)).length;

  const lastEditedAt = ((): Date | null => {
    const stamps = [
      ...facts.map((f) => new Date(f.updatedAt).getTime()),
      ...answers.map((a) => new Date(a.writtenAt).getTime()),
    ].filter((n) => !Number.isNaN(n));
    return stamps.length ? new Date(Math.max(...stamps)) : null;
  })();

  return (
    <Shell
      tab={tab}
      onTab={setTab}
      lang={lang}
      onLang={setLang}
      connection={connection}
      port={port}
      badge={heldWithheld || null}
    >
      {error && (
        <p
          role="alert"
          className="mb-6 rounded-r-md border-l-2 border-brio-500 bg-brio-050 px-4 py-3 text-[13.5px] text-brio-700"
        >
          {error}
        </p>
      )}

      {tab === "context" && (
        <Context
          lang={lang}
          values={values}
          withheld={withheld}
          answers={answers}
          dirty={dirty}
          savingId={savingId}
          savedId={savedId}
          onChange={onChange}
          onSave={onSave}
          factCount={facts.filter((f) => f.value.trim()).length}
          lastEditedAt={lastEditedAt}
        />
      )}

      {tab === "activity" && (
        <Activity
          lang={lang}
          facts={facts}
          answers={answers}
          withheld={withheld}
          siteMemory={payload?.mirror?.siteMemory ?? {}}
        />
      )}

      {tab === "connections" && (
        <Connections lang={lang} onGoToContext={() => setTab("context")} />
      )}

      {tab === "privacy" && (
        <Privacy
          lang={lang}
          facts={facts}
          withheld={withheld}
          ledger={payload?.mirror?.ledger ?? EMPTY_LEDGER}
        />
      )}

      {tab === "settings" && (
        <Settings
          lang={lang}
          state={connection}
          token={token}
          port={port}
          note={note}
          // The companion does not report where it keeps the file, so this is
          // the default it uses rather than a reading of the live one. If
          // PERSONAL_MD_HOME is set, this line is wrong and should be fed from
          // the server instead of guessed.
          filePath={null}
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
      )}
    </Shell>
  );
}
