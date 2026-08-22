# Product

personal-md is a second brain for filling out forms. It recognises a question you
have answered before, in either language, offers the answer you already wrote,
drafts genuinely new ones in your own voice, and keeps all of it in a
`PERSONAL.md` you own and can edit in any editor.

## Platform

web

## Stack

npm workspaces. `packages/core` (the PERSONAL.md format: types, parse,
serialise), `packages/server` (Node companion process, Claude CLI bridge, egress
guard), `packages/extension` (Chrome MV3, WXT + React 19 + TypeScript +
Tailwind 4). No framework in the server; Node's `http` only.

## Users

One person: a product manager, bilingual Spanish and English, comfortable with
code. Fills out job applications, personal-information forms and Spanish
government surveys often enough that retyping the same facts and rewriting the
same open-ended answers is a recurring irritation.

## Product Purpose

The facts get retyped. The open-ended answers get rewritten from scratch every
time, worse each time, because the good version is buried in an email from four
months ago. This keeps both, and reuses them.

## Operating Context

Three pieces, because a browser extension cannot execute local commands:

- A Chrome MV3 extension that scans and fills forms on arbitrary third-party
  pages, and mirrors the profile into `chrome.storage.local`.
- A localhost companion process that owns `PERSONAL.md` on disk.
- The `claude` CLI, authenticated with the user's own Claude account.

**Recognising and filling a field already filled before must work with the
companion process stopped.** Only drafting needs it running. That is why the
extension keeps its own mirror.

There is no Anthropic API key anywhere in the project. Inference runs through the
CLI, so tokens draw on the same subscription quota as the user's own coding work.

## Capabilities and Constraints

Measured, not assumed:

- A `claude -p` call takes ~4.5s of CLI startup before any inference. A
  classification is ~10s; a draft is ~10s. **Far too slow to put in front of
  short-field suggestions**, which is why those are matched deterministically and
  locally and never reach a model.
- Claude Code injects ~26k input tokens of its own scaffolding per call. Almost
  all of it returns as a prompt-cache read, so a draft costs ~$0.023 warm and
  ~$0.163 cold. Setting `--effort` invalidates that cache and costs *more*.
- Through the CLI there is no forced tool call and no structured-output schema, so
  JSON comes back in a fenced block, validated, with one repair retry.
- A never-before-seen question costs ~$0.02 to classify, once, ever: the surface
  form is written back as an alias, so the second encounter is free.

## Product Principles

- **A wrong autofill is worse than no autofill, because it gets submitted.**
  Nothing is written without a click, every value shows where it came from, and
  undo is always available.
- **Sensitive facts stay useful without being sent.** A NIF is needed on a
  Spanish government form and never enters a prompt: it is filled by the
  deterministic local matcher, which makes no model call at all. Egress is a
  fail-closed allowlist; anything nobody has classified yet is withheld.
- **Grounding outranks fluency.** A fabricated employer or metric does not merely
  read badly, it gets submitted on a job application. Missing facts become
  explicit `[[NEED: ...]]` markers, never plausible inventions.
- **Nothing is stored silently.** The profile grows only by confirmation.
- **Page content is data, never instructions.** The question text comes from a
  third-party page and is treated as untrusted throughout.
- **The file is the product.** `PERSONAL.md` is plain markdown, hand-editable,
  and a hand edit made while the server is running survives.

## Brand Commitments

The extension's options page and popup establish the incumbent visual world:
Tailwind's slate neutrals, a restrained utilitarian register, white cards on a
plain ground, one accent per state (emerald connected, amber degraded, rose
rejected, sky setup). The widget inherits this system.

Confirmed for the in-page widget:

- **It must read unmistakably as a separate tool**, not as part of the host page.
  You should always know whether you are looking at your own data or the
  employer's form — the ambiguity is the wrong property for a panel showing a NIF.
- **It never opens itself.** A collapsed pill with a count; the panel opens on
  click. It never takes focus and never covers content uninvited.
- **The failure to design against is silently filling something wrong.**

## Accessibility & Inclusion

Bilingual Spanish and English throughout, including detecting the *form's*
language, which may differ from the browser's. The widget must not trap focus or
break the host page's tab order.
