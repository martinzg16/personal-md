/**
 * The content script: scan the page, decide what the file can do here, and mount
 * the widget.
 *
 * Three constraints shape it. It runs in the same world as a potentially hostile
 * page, so it never holds the server token and never issues a request itself - it
 * asks the background worker. It renders inside a closed shadow root, so no host
 * stylesheet can reach in and no page script can walk into it. And it never opens
 * itself or takes focus: a form you were only skimming should be undisturbed.
 */

import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";

import { detectPageLanguage, genreForPurpose, registerHintFor, shouldRun } from "../../lib/policy.ts";
import { beginBatch, fillField, pendingUndoCount, undoLastFill } from "../../lib/fill/apply.ts";
import { matchFields, signatureOf, type MatchResult } from "../../lib/match/deterministic.ts";
import {
  collectPendingFacts,
  emptyBatch,
  reconcileFacts,
  type PendingBatch,
} from "../../lib/learn/pending.ts";
import { buildScanResult, findByStamp, scanFields } from "../../lib/scan/scanner.ts";
import type { ScannedField } from "../../lib/scan/types.ts";
import { isSignedOut, send } from "../../lib/protocol.ts";
import {
  extractLinkedInProfile,
  isEmptyProfile,
  isOwnProfile,
  isProfilePage,
} from "../../lib/linkedin/extract.ts";
import type { ConnectionState, DraftResponse, ImportProposal, MirrorPayload } from "../../lib/protocol.ts";
import { settings, storageKeys } from "../../lib/settings.ts";
import Widget, { type Row } from "../../components/widget/Widget.tsx";
import "./widget.css";

/**
 * The panel's two faces, declared inside the shadow root.
 *
 * They cannot live in widget.css with the rest of the styling. A `url()` in a
 * stylesheet resolves against that stylesheet's own origin, and this one is
 * injected into a shadow root on somebody else's page — so `/fonts/x.woff2`
 * would ask *their* server for our font, get their 404 page, and fall back
 * silently. `runtime.getURL` is the only thing that names the extension's own
 * origin from in here.
 *
 * Latin and latin-ext only, and no mono: every monospaced string in the panel is
 * a key or a count, and the system mono renders those exactly as well as a
 * bundled face would while costing nothing on every page load.
 */
function brandFaces(doc: Document): HTMLStyleElement {
  const LATIN =
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
  const LATIN_EXT =
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

  const face = (family: string, url: string, weight: string, range: string) =>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};` +
    `font-display:swap;src:url("${url}") format("woff2");unicode-range:${range}}`;

  // Spelled out rather than built from a template: WXT types `getURL` against a
  // union of the paths that actually exist in `public/`, so a computed path is
  // rejected — and that check is worth keeping, because a font URL that 404s
  // fails silently into a fallback face.
  const style = doc.createElement("style");
  style.textContent = [
    face(
      "Instrument Sans",
      browser.runtime.getURL("/fonts/instrumentsans-latin.woff2"),
      "400 700",
      LATIN,
    ),
    face(
      "Instrument Sans",
      browser.runtime.getURL("/fonts/instrumentsans-latin-ext.woff2"),
      "400 700",
      LATIN_EXT,
    ),
    face(
      "Instrument Serif",
      browser.runtime.getURL("/fonts/instrumentserif-latin.woff2"),
      "400",
      LATIN,
    ),
    face(
      "Instrument Serif",
      browser.runtime.getURL("/fonts/instrumentserif-latin-ext.woff2"),
      "400",
      LATIN_EXT,
    ),
  ].join("");
  return style;
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  // Injects the built stylesheet into the shadow root rather than the page, so
  // nothing here can restyle the host and nothing there can restyle us.
  cssInjectionMode: "ui",

  async main(ctx) {
    const decision = shouldRun(location.href, await settings.getDismissed());
    if (!decision.run) return;

    const doc = document;
    const lang = detectPageLanguage(doc);
    const domain = location.hostname;

    let fields: ScannedField[] = [];
    let rows: Row[] = [];
    let serverUp = false;
    let render: () => void = () => {};

    const byId = new Map<string, ScannedField>();

    /** Everything the page offers, crossed with everything the file holds. */
    async function recompute(): Promise<void> {
      fields = scanFields(doc);
      byId.clear();
      for (const f of fields) byId.set(f.id, f);

      refreshImportOffer();

      const payload = await send<MirrorPayload>({ kind: "getMirror" }).catch(() => null);
      serverUp = payload?.connection.kind === "ok";
      const mirror = payload?.mirror;
      if (!mirror) {
        // No profile yet is the case importing exists for, so this must still be
        // able to mount rather than only render into an already-mounted panel.
        rows = [];
        renderAndMount();
        return;
      }

      const match: MatchResult = matchFields(fields, mirror.profile, {
        withheldKeys: mirror.withheldKeys,
        siteMemory: mirror.siteMemory,
        domain,
      });

      // Preserve state across a re-scan: a draft in flight, or an applied row,
      // must survive the page mutating underneath us.
      const previous = new Map(rows.map((r) => [r.id, r]));
      const next: Row[] = [];

      for (const s of match.fills) {
        const id = `fact:${s.fieldId}:${s.sourceKey}`;
        const before = previous.get(id);
        next.push({
          kind: "fact",
          id,
          suggestion: s,
          applied: before?.applied ?? false,
        });
      }
      for (const s of match.answers) {
        const id = `answer:${s.fieldId}:${s.canonicalKey}`;
        const before = previous.get(id);
        next.push({ kind: "answer", id, suggestion: s, applied: before?.applied ?? false });
      }
      for (const q of match.needsDrafting) {
        const id = `open:${q.fieldId}`;
        const before = previous.get(id);
        next.push(
          before?.kind === "unanswered"
            ? before
            : {
                kind: "unanswered",
                id,
                fieldId: q.fieldId,
                question: q.question,
                maxWords: q.maxLength ? Math.floor(q.maxLength / 6) : null,
                draft: null,
                state: "idle",
                applied: false,
              },
        );
      }

      rows = next;
      await recomputePending(mirror.profile);
      renderAndMount();
    }

    /** The row whose fill is currently at the top of the undo stack. */
    let lastAppliedRowId: string | null = null;

    /**
     * Every row filled by the last bulk action.
     *
     * Undo is batch-wide, so a single Undo after "fill all" reverses every field
     * it wrote. Clearing only the last row's flag would leave seven rows saying
     * "Filled" over fields that are now empty again - the panel lying about the
     * page, which is the one thing this design exists to prevent.
     */
    let bulkApplied: string[] = [];

    /*
     * What this form has offered that the file does not hold.
     *
     * Three pieces of state, because a confirmation the user has started
     * interacting with must survive a re-scan: what they declined (never offer
     * it again on this page), what they corrected (their version wins over the
     * page's), and whether a submit has been attempted.
     */
    /*
     * Importing this page as the user's own profile.
     *
     * Offered only on their own LinkedIn profile, and only as an offer. The read
     * happens on a click, in their own logged-in session, over rendered DOM -
     * there is no request to LinkedIn that this extension initiates and no
     * credential anywhere. A profile that is not theirs is refused outright:
     * "it was on screen" is not consent to file someone else's history.
     */
    let importOffer: {
      state: "idle" | "reading" | "error";
      error?: string;
      unreadable?: number;
    } | null = null;

    let batch: PendingBatch = emptyBatch();
    const declined = new Set<string>();
    const edited = new Map<string, string>();
    let submitAttempted = false;

    // Restore anything this domain noticed before a navigation tore us down.
    const restored = await settings.getPending(domain);
    if (restored) batch = restored;

    /** Re-decide whether this page can offer an import. */
    function refreshImportOffer(): void {
      if (!isProfilePage(location.href)) {
        importOffer = null;
        return;
      }
      // Keep an error or an in-flight read on screen rather than resetting it
      // every time the SPA mutates the DOM underneath us.
      if (importOffer && importOffer.state !== "idle") return;
      importOffer = isOwnProfile(doc) ? { state: "idle" } : null;
    }

    async function readThisProfile(): Promise<void> {
      if (!isOwnProfile(doc)) {
        importOffer = { state: "error", error: copy[lang].notYours };
        render();
        return;
      }
      const raw = extractLinkedInProfile(doc, location.href);
      if (isEmptyProfile(raw)) {
        importOffer = { state: "error", error: copy[lang].importEmpty };
        render();
        return;
      }

      importOffer = { state: "reading" };
      render();
      try {
        const { proposal } = await send<{ proposal: ImportProposal }>({
          kind: "importProfile",
          profile: { ...raw, profileUrl: location.href },
        });

        // The proposal becomes a pending batch, so an import is reviewed and
        // edited in the same panel as anything else new. Nothing is written by
        // reading a page.
        batch = {
          facts: proposal.facts.map((f) => ({
            fieldId: `import:${f.key}`,
            key: f.key,
            label: f.label,
            value: f.value,
          })),
          answers: proposal.answers.map((a) => ({
            fieldId: `import:${a.canonicalKey}`,
            canonicalKey: a.canonicalKey,
            question: a.question,
            text: a.text,
          })),
        };
        await settings.setPending(domain, batch);
        importOffer = raw.warnings.length > 0
          ? { state: "idle", unreadable: raw.warnings.length }
          : { state: "idle" };
        submitAttempted = true; // open straight into the review
        renderAndMount();
      } catch (err) {
        importOffer = {
          state: "error",
          error: err instanceof Error ? err.message : copy[lang].importFailed,
        };
        render();
      }
    }

    async function recomputePending(profile: Parameters<typeof collectPendingFacts>[2]): Promise<void> {
      const fresh = collectPendingFacts(fields, doc, profile);
      batch = {
        facts: reconcileFacts(batch.facts, fresh, declined, edited),
        answers: batch.answers,
      };
      if (batch.facts.length === 0 && batch.answers.length === 0) {
        await settings.clearPending(domain);
      } else {
        await settings.setPending(domain, batch);
      }
    }

    const copy = {
      en: {
        notYours: "This is someone else's profile. Only your own is imported.",
        importEmpty: "Nothing readable on this page. Try scrolling it fully first.",
        importFailed: "Could not read this profile.",
        fillFailed: "That field is no longer on the page. Reload and try again.",
        refused: "This kind of field is never filled.",
        noOption: "None of that field's options match your stored value.",
        disabled: "That field is disabled or read-only.",
        notFillable: "That field cannot be filled.",
        notAccepted: "That field would not take your stored value. Fill it yourself.",
        sessionGaveUp: "The Claude session did not come back. Press Draft again once it has.",
      },
      es: {
        notYours: "Este perfil es de otra persona. Solo se importa el tuyo.",
        importEmpty: "No hay nada legible en esta página. Prueba a bajar hasta el final primero.",
        importFailed: "No se pudo leer este perfil.",
        fillFailed: "Ese campo ya no está en la página. Recarga e inténtalo otra vez.",
        refused: "Este tipo de campo nunca se rellena.",
        noOption: "Ninguna opción de ese campo coincide con tu valor guardado.",
        disabled: "Ese campo está desactivado o es de solo lectura.",
        notFillable: "Ese campo no se puede rellenar.",
        notAccepted: "Ese campo no acepta tu valor guardado. Rellénalo tú.",
        sessionGaveUp: "La sesión de Claude no volvió. Vuelve a pulsar Redactar cuando esté.",
      },
    } as const;

    const translate = (key: keyof (typeof copy)["en"]): string => copy[lang][key];

    const reasonText = (reason: string): string =>
      reason === "refused"
        ? translate("refused")
        : reason === "no-matching-option"
          ? translate("noOption")
          : reason === "disabled"
            ? translate("disabled")
            : reason === "value-not-accepted"
              ? translate("notAccepted")
              : translate("notFillable");

    const setRowError = (id: string, message: string): void => {
      rows = rows.map((r) => (r.id === id ? { ...r, fillError: message } : r));
      render();
    };

    const patch = (id: string, change: Partial<Extract<Row, { kind: "unanswered" }>>): void => {
      rows = rows.map((r) => (r.id === id && r.kind === "unanswered" ? { ...r, ...change } : r));
      render();
    };

    const markApplied = (id: string): void => {
      rows = rows.map((r) => (r.id === id ? { ...r, applied: true, fillError: undefined } : r));
      render();
    };

    /**
     * Write one value into the page, through the framework-safe path.
     *
     * A failure has to be visible. This used to return silently when the stamped
     * element had gone or fillField refused, so the click did nothing, the row
     * still said Fill, and nothing was said - a quiet failure on the exact
     * interaction the whole design is pointed at.
     */
    function apply(fieldId: string, value: string, rowId: string): void {
      const el = findByStamp(fieldId, doc);
      if (!el) {
        setRowError(rowId, translate("fillFailed"));
        return;
      }
      const outcome = fillField(el, value);
      if (outcome.ok) {
        lastAppliedRowId = rowId;
        // A single fill starts its own undo batch, so any previous bulk set is
        // no longer what Undo would reverse. Leaving it would make Undo clear
        // the flags of rows it did not touch.
        bulkApplied = [];
        markApplied(rowId);
      } else {
        setRowError(rowId, reasonText(outcome.reason));
      }
      render();
    }

    /**
     * Wait for the CLI session to come back, then say whether it did.
     *
     * Polled rather than pushed because there is nothing to push: signing in
     * happens in a terminal, outside anything the browser can observe. Four
     * seconds is frequent enough to feel immediate after `claude auth login`
     * and rare enough to be free; five minutes is where waiting stops being
     * help and starts being a hang.
     */
    async function waitForSession(): Promise<boolean> {
      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4_000));
        try {
          const state = await send<ConnectionState>({ kind: "getConnection" });
          if (state.kind === "ok") return true;
          if (state.kind === "claude_signed_out") continue;
          // Server down or token trouble: a different problem with a different
          // fix, and not one this wait can resolve.
          return false;
        } catch {
          return false;
        }
      }
      return false;
    }

    async function draft(row: Row, instruction?: string, resumed = false): Promise<void> {
      if (row.kind !== "unanswered") return;
      patch(row.id, { state: "drafting" });

      const field = byId.get(row.fieldId);
      const scan = buildScanResult(fields, doc);
      try {
        const result = await send<DraftResponse>({
          kind: "draftAnswer",
          question: row.question,
          canonicalKey: null,
          language: lang,
          genre: genreForPurpose(scan.purpose),
          maxWords: row.maxWords,
          maxChars: field?.maxLength ?? null,
          registerHint: registerHintFor(scan.purpose, domain),
          ...(instruction ? { instruction } : {}),
        });
        patch(row.id, { draft: result, state: "ready" });
      } catch (err) {
        /*
         * A signed-out CLI is the one failure worth holding the request for.
         * Nothing was spent, the profile is untouched, and the only missing
         * ingredient comes back with one command in a terminal - so the row
         * waits and finishes itself instead of making someone press Draft again
         * and hope they remember what they were asking for.
         *
         * Resumed once, never in a loop: if the very next attempt is refused
         * again, that is a different problem and it gets shown as one.
         */
        if (isSignedOut(err) && !resumed) {
          patch(row.id, { state: "waiting_session" });
          render();
          if (await waitForSession()) return draft(row, instruction, true);
          patch(row.id, { state: "error", error: translate("sessionGaveUp") });
          render();
          return;
        }
        patch(row.id, {
          state: "error",
          error: err instanceof Error ? err.message : "could not draft this",
        });
      }
    }

    const ui = await createShadowRootUi(ctx, {
      name: "personal-md",
      position: "overlay",
      anchor: "body",
      // Closed, so a page script cannot reach into the panel that is holding a
      // NIF or reading a draft.
      mode: "closed",
      onMount(container) {
        // The direction contract, auditable in the live DOM rather than only in
        // source. See the header of Widget.tsx.
        container.prepend(
          doc.createComment(
            " Brío panel · source-first ledger · seed a21341ab · " +
              "your file, projected onto someone else's form ",
          ),
        );

        container.append(brandFaces(doc));

        const host = doc.createElement("div");
        host.className = "pmd-root";
        container.append(host);

        const root: Root = createRoot(host);
        render = () => {
          root.render(
            createElement(Widget, {
              lang,
              domain,
              rows,
              undoCount: pendingUndoCount(),
              serverUp,
              onFill: (row: Row) => {
                beginBatch();
                if (row.kind === "fact") {
                  apply(row.suggestion.fieldId, row.suggestion.value, row.id);
                } else if (row.kind === "answer") {
                  apply(row.suggestion.fieldId, row.suggestion.text, row.id);
                }
              },
              onFillAll: (batchRows: Row[]) => {
                /*
                 * One beginBatch for the whole set, so one Undo puts every one
                 * of them back. Filling them as separate batches would leave the
                 * user undoing eight times to reverse one click, which is the
                 * kind of asymmetry that makes a bulk action feel unsafe.
                 *
                 * Each fill still goes through the same path as a single one, so
                 * a field that has gone from the page, or that the last line of
                 * defence in apply.ts refuses, reports its own failure on its own
                 * row rather than failing the batch silently.
                 */
                beginBatch();
                let last: string | null = null;
                for (const row of batchRows) {
                  if (row.kind !== "fact") continue;
                  const el = findByStamp(row.suggestion.fieldId, doc);
                  if (!el) {
                    setRowError(row.id, translate("fillFailed"));
                    continue;
                  }
                  const outcome = fillField(el, row.suggestion.value);
                  if (outcome.ok) {
                    last = row.id;
                    rows = rows.map((r) =>
                      r.id === row.id ? { ...r, applied: true, fillError: undefined } : r,
                    );
                  } else {
                    setRowError(row.id, reasonText(outcome.reason));
                  }
                }
                // Undo is batch-wide, but the row flag has to be cleared for the
                // whole set - so remember the batch, not just the last row.
                lastAppliedRowId = last;
                bulkApplied = batchRows.filter((r) => r.kind === "fact").map((r) => r.id);
                render();
              },
              onDraft: (row: Row, instruction?: string) => void draft(row, instruction),
              onInsertDraft: (row: Row, text: string) => {
                if (row.kind !== "unanswered") return;
                beginBatch();
                apply(row.fieldId, text, row.id);
                // Nothing is saved to the file here. Confirm-to-learn is its own
                // step, so an inserted draft you then rewrite is not recorded as
                // your answer.
              },
              onUndo: () => {
                // Only the row that was actually undone loses its flag. Clearing
                // every row made the panel report filled fields as unfilled and
                // re-offer Fill on them - the panel's own state lying about the
                // page, which is the failure this design exists to prevent.
                const undone = undoLastFill();
                if (undone > 0) {
                  const ids = new Set(
                    bulkApplied.length > 0
                      ? bulkApplied
                      : lastAppliedRowId
                        ? [lastAppliedRowId]
                        : [],
                  );
                  rows = rows.map((r) => (ids.has(r.id) ? { ...r, applied: false } : r));
                  lastAppliedRowId = null;
                  bulkApplied = [];
                }
                render();
              },
              onDismissSite: () => {
                void settings.dismissSite(domain).then(() => ui.remove());
              },
              pending: batch,
              importOffer,
              onImport: () => void readThisProfile(),
              submitAttempted,
              onSaveBatch: async (confirmed) => {
                try {
                  await send({
                    kind: "learnBatch",
                    facts: confirmed.facts.map((f) => ({
                      key: f.key,
                      label: f.label,
                      value: f.value,
                    })),
                    answers: confirmed.answers.map((a) => ({
                      canonicalKey: a.canonicalKey,
                      question: a.question,
                      text: a.text,
                      language: lang,
                      genre: genreForPurpose(buildScanResult(fields, doc).purpose),
                    })),
                  });
                  // Saved. Clear the batch rather than leaving it to be offered
                  // again - it is in the file now, so the next recompute would
                  // find nothing anyway, and a stale strip saying "3 to save"
                  // after a successful save is the panel lying about the file.
                  batch = emptyBatch();
                  edited.clear();
                  submitAttempted = false;
                  await settings.clearPending(domain);
                  render();
                  return true;
                } catch {
                  // The batch is deliberately left intact: the file did not
                  // change, so neither should what the panel is offering.
                  return false;
                }
              },
              onDeclineItem: (key: string) => {
                declined.add(key);
                edited.delete(key);
                batch = { ...batch, facts: batch.facts.filter((f) => f.key !== key) };
                void settings.setPending(domain, batch);
                render();
              },
              onEditItem: (key: string, value: string) => {
                edited.set(key, value);
                batch = {
                  ...batch,
                  facts: batch.facts.map((f) => (f.key === key ? { ...f, value } : f)),
                };
                void settings.setPending(domain, batch);
                render();
              },
            }),
          );
        };
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    /*
     * Mount only once there is something to say, and re-check on every
     * recompute rather than once at startup.
     *
     * The early version returned outright when the first scan found nothing
     * fillable, which was right for the fill ledger and wrong the moment the
     * panel also had to notice what you typed: a form asking for things the file
     * has never held produces no rows at all, so the widget never mounted, the
     * listeners below were never attached, and everything the user typed was
     * silently unnoticed. The observers now always run; only the UI is
     * conditional.
     */
    let mounted = false;
    const mountIfWorthIt = () => {
      if (mounted) return;
      // An offer to read this profile is reason enough to appear: a LinkedIn
      // profile has no fillable fields at all, so waiting for rows would mean
      // the import could never be offered.
      if (
        rows.length === 0 &&
        batch.facts.length === 0 &&
        batch.answers.length === 0 &&
        !importOffer
      ) {
        return;
      }
      mounted = true;
      ui.mount();
    };

    const renderAndMount = () => {
      mountIfWorthIt();
      if (mounted) render();
    };

    /*
     * Watch before looking.
     *
     * The observer used to be attached *after* the first recompute, and that
     * first recompute awaits a message round-trip to the background worker. On a
     * client-rendered page - Greenhouse, Workday, any React ATS - the form can be
     * rendered entirely inside that await window, so the observer was attached
     * too late to ever see a mutation and nothing triggered a second look. The
     * result was a page with twenty-seven fields and no widget, permanently,
     * until some unrelated DOM change happened to wake it up.
     */
    let settle: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(settle);
      settle = setTimeout(() => void recompute(), 700);
    });
    observer.observe(doc.body, { childList: true, subtree: true });

    await recompute();
    mountIfWorthIt();

    /*
     * A bounded backstop, for the case the observer cannot cover.
     *
     * A single-shot render that completes before observe() is called produces no
     * mutation at all, so there is nothing for the observer to react to. These
     * re-scans stop as soon as there is something to show, and stop regardless
     * after the last one - a widget that keeps polling a page forever is a
     * battery cost with no upside.
     */
    const backstops: ReturnType<typeof setTimeout>[] = [];
    for (const delay of [600, 1800, 4000]) {
      backstops.push(
        setTimeout(() => {
          if (mounted) return;
          void recompute();
        }, delay),
      );
    }

    /*
     * Noticing what the user typed.
     *
     * Debounced, and on the whole document rather than per field, because fields
     * appear and disappear as a multi-step form advances. This only reads values
     * and diffs them against the file - nothing is written anywhere until the
     * user confirms the batch.
     */
    let typeTimer: ReturnType<typeof setTimeout> | undefined;
    const onEdit = () => {
      clearTimeout(typeTimer);
      typeTimer = setTimeout(() => void recompute(), 900);
    };
    doc.addEventListener("input", onEdit, true);
    doc.addEventListener("change", onEdit, true);

    /*
     * A submit was attempted.
     *
     * Not a hook to block on: the page is entitled to navigate, and it usually
     * will. The batch is already persisted per domain by this point, so the
     * decision survives the teardown and the panel offers it again on the way
     * back. Listening for a click on a submit control as well as for the `submit`
     * event, because plenty of forms are a button and a fetch with no form
     * element in sight.
     */
    const noteSubmit = () => {
      submitAttempted = true;
      void settings.setPending(domain, batch);
      renderAndMount();
    };
    doc.addEventListener("submit", noteSubmit, true);
    doc.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement | null;
        const control = target?.closest?.("button, input[type=submit], [role=button]");
        if (!control) return;
        const type = (control.getAttribute("type") ?? "").toLowerCase();
        const text = (control.textContent ?? "").trim().toLowerCase();
        const submitish =
          type === "submit" || /\b(enviar|submit|apply|solicitar|continuar|finish|send)\b/.test(text);
        if (submitish) noteSubmit();
      },
      true,
    );

    /*
     * The profile changed somewhere else.
     *
     * Rows are computed on load, and a page with nothing to offer does not
     * mount. That left a hole: run the interview, or save a batch, in another
     * tab, and every already-open form kept showing nothing - the panel was
     * right when it decided and never learned otherwise. A form open in the
     * background is the normal case, not the edge one, so waiting for the user
     * to reload was the tool failing quietly.
     */
    const onMirrorChanged = (changes: Record<string, chrome.storage.StorageChange>): void => {
      if (!(storageKeys.mirror in changes)) return;
      void recompute();
    };
    chrome.storage.onChanged.addListener(onMirrorChanged);

    ctx.onInvalidated(() => {
      observer.disconnect();
      clearTimeout(settle);
      for (const t of backstops) clearTimeout(t);
      clearTimeout(typeTimer);
      doc.removeEventListener("input", onEdit, true);
      doc.removeEventListener("change", onEdit, true);
      doc.removeEventListener("submit", noteSubmit, true);
      chrome.storage.onChanged.removeListener(onMirrorChanged);
    });
  },
});
