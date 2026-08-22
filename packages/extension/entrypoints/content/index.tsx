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
import { buildScanResult, findByStamp, scanFields } from "../../lib/scan/scanner.ts";
import type { ScannedField } from "../../lib/scan/types.ts";
import { send } from "../../lib/protocol.ts";
import type { DraftResponse, MirrorPayload } from "../../lib/protocol.ts";
import { settings } from "../../lib/settings.ts";
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
      render();
    }

    /** The row whose fill is currently at the top of the undo stack. */
    let lastAppliedRowId: string | null = null;

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
            }),
          );
        };
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });

    await recompute();

    // Only mount once there is something to say. A page with nothing fillable
    // gets no widget at all, which is most pages.
    if (rows.length === 0) return;
    ui.mount();

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
    });
  },
});
