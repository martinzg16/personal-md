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
import { send } from "../../lib/protocol.ts";
import type { DraftResponse, MirrorPayload } from "../../lib/protocol.ts";
import { settings, storageKeys } from "../../lib/settings.ts";
import Widget, { type Row } from "../../components/widget/Widget.tsx";
import "./widget.css";

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

      const payload = await send<MirrorPayload>({ kind: "getMirror" }).catch(() => null);
      serverUp = payload?.connection.kind === "ok";
      const mirror = payload?.mirror;
      if (!mirror) {
        rows = [];
        render();
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

    /*
     * What this form has offered that the file does not hold.
     *
     * Three pieces of state, because a confirmation the user has started
     * interacting with must survive a re-scan: what they declined (never offer
     * it again on this page), what they corrected (their version wins over the
     * page's), and whether a submit has been attempted.
     */
    let batch: PendingBatch = emptyBatch();
    const declined = new Set<string>();
    const edited = new Map<string, string>();
    let submitAttempted = false;

    // Restore anything this domain noticed before a navigation tore us down.
    const restored = await settings.getPending(domain);
    if (restored) batch = restored;

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
        fillFailed: "That field is no longer on the page. Reload and try again.",
        refused: "This kind of field is never filled.",
        noOption: "None of that field's options match your stored value.",
        disabled: "That field is disabled or read-only.",
        notFillable: "That field cannot be filled.",
      },
      es: {
        fillFailed: "Ese campo ya no está en la página. Recarga e inténtalo otra vez.",
        refused: "Este tipo de campo nunca se rellena.",
        noOption: "Ninguna opción de ese campo coincide con tu valor guardado.",
        disabled: "Ese campo está desactivado o es de solo lectura.",
        notFillable: "Ese campo no se puede rellenar.",
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
        markApplied(rowId);
      } else {
        setRowError(rowId, reasonText(outcome.reason));
      }
      render();
    }

    async function draft(row: Row, instruction?: string): Promise<void> {
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
            " personal-md widget · source-first ledger · seed a21341ab · " +
              "your file, projected onto someone else's form ",
          ),
        );

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
                if (undone > 0 && lastAppliedRowId) {
                  const id = lastAppliedRowId;
                  rows = rows.map((r) => (r.id === id ? { ...r, applied: false } : r));
                  lastAppliedRowId = null;
                }
                render();
              },
              onDismissSite: () => {
                void settings.dismissSite(domain).then(() => ui.remove());
              },
              pending: batch,
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
      if (rows.length === 0 && batch.facts.length === 0 && batch.answers.length === 0) return;
      mounted = true;
      ui.mount();
    };

    const renderAndMount = () => {
      mountIfWorthIt();
      if (mounted) render();
    };

    await recompute();
    mountIfWorthIt();

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

    // Single-page apps swap forms without a navigation. Re-scan on a settled DOM
    // rather than on every mutation.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void recompute(), 700);
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(typeTimer);
      doc.removeEventListener("input", onEdit, true);
      doc.removeEventListener("change", onEdit, true);
      doc.removeEventListener("submit", noteSubmit, true);
      chrome.storage.onChanged.removeListener(onMirrorChanged);
    });
  },
});
