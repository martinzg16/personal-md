# personal-md

A second brain for filling out forms.

You fill out the same questions over and over: job applications, personal-info
forms, government surveys. The facts get retyped. The open-ended answers get
rewritten from scratch every time, worse each time, because the good version is
buried in an email from four months ago.

This recognises a question you have answered before — in either language — offers
the answer you already wrote, drafts genuinely new ones in your own voice, and
keeps all of it in a `PERSONAL.md` you own and can edit in any editor.

## How it is put together

Three pieces, because a browser extension cannot execute local commands:

```
Chrome MV3 extension  ──HTTP──▶  localhost:8787  ──spawn──▶  claude CLI
  scans and fills forms          owns PERSONAL.md            your own account,
  Shadow DOM widget              parses/serialises it         no API key
  mirrors the profile            splits out secrets
```

The extension keeps its own copy of the profile in `chrome.storage.local`. That
is deliberate: **recognising and filling a field you have filled before must work
with the server stopped.** Only AI drafting needs the companion process running.

## No API key

Inference goes through the `claude` CLI using your existing Claude account. There
is no Anthropic API key anywhere in this project.

What that costs, measured rather than assumed:

| | |
|---|---|
| Latency | ~4.5s per call, almost all CLI startup, not inference |
| Input tokens per call | ~25,900 — Claude Code injects its own scaffolding |
| Of which prompt-cache read | ~99.9% (fresh input: 10 tokens) |
| Actual cost | **~$0.003 per call** on Haiku |

The ~26k of scaffolding does not go away, but it comes back as a cache read
billed at roughly a tenth of fresh input, which is what makes this affordable.
A live test pins that: if `cache_read` ever drops to zero, every call silently
costs about ten times more.

Two consequences worth knowing:

- **Tokens draw on the same subscription quota as your own coding work.** The
  euro cost is negligible; the quota consumption is real and shared.
- **No structured-output guarantee.** Through the CLI there is no forced tool
  call and no `output_config.format`, so JSON comes back in a fenced block,
  validated, with one repair retry. Strictly weaker than a schema-enforced tool
  call, and the main thing given up for "no API key".

`--bare` would cut overhead further but forces `ANTHROPIC_API_KEY` auth and never
reads OAuth or the keychain, so it cannot be used here.

## Matching a question you have answered before

Cross-lingual matching without a vector database, by canonicalising at *write*
time rather than read time. Three stages, cheapest first:

| Stage | Mechanism | Cost | Catches |
|---|---|---|---|
| A | Normalised alias lookup | free, offline | Any question seen before, in any language |
| B | Site memory, keyed on field attributes | free, offline | A reworded label on a site you have used |
| C | `claude -p --model claude-haiku-4-5` classify into a taxonomy | ~10s, ~$0.02 | Everything genuinely new |

Stage C's result is **written back as an alias immediately**, so each question is
paid for at most once, ever. Measured on a real run:

```
first:  via=model  key=motivation.why_this_company  cost=$0.0197
second: via=alias                                   cost=$0
```

Verified live: `¿Por qué te gustaría formar parte de nuestro equipo?` resolves to
the same key as `Why do you want to work here?` — two questions sharing almost no
tokens, so no lexical scoring reaches it. Scope is preserved rather than
collapsed: `un proyecto que salió mal` goes to `conflict_or_failure`, not
`leadership_story`.

**Whether a stored answer may be reused unchanged is decided in code, not by the
prompt.** The model contributes a judgement it is good at (does this text name a
specific employer?); TypeScript makes the decision. Reuse is refused for a
different language, text that will not fit the field's limit, text with unfilled
`[[NEED:]]` markers, and text naming another company — the last because a company
name from form A appearing in form B is a real and embarrassing failure. The text
is still returned when reuse is refused, so drafting can adapt it.

## Drafting an answer you have not written yet

The feature everything else is groundwork for. Opus, because writing a paragraph
in someone else's voice is the one job here where the model tier *is* the product.

Retrieval selects on **two axes**, not one:

- **Content** — answers containing the facts and stories this question needs.
  Topical, and requires real topical evidence: genre agreement alone does not
  qualify something as material.
- **Voice** — answers whose register matches: same language, same kind of form,
  similar length. A brilliant topical match written in Spanish for a government
  survey is the wrong voice model for an English startup application.

An answer can serve both roles and is labelled accordingly, because the model
needs to know whether it is being shown material or an example of how you write.
No embeddings: with a few hundred answers, and the canonical key already
resolving the common case exactly, lexical overlap plus language and genre
filters is free, instant and offline.

**Grounding is the load-bearing constraint.** Every concrete claim must come from
the supplied material; anything missing becomes an explicit `[[NEED: ...]]`
marker rather than a plausible invention. A fabricated employer or metric does
not merely read badly — it gets submitted on a job application. Confidence is
computed locally from structural signals (did the question resolve to something
you had answered, were there exemplars in the right language, how many gaps were
left), not taken from the model's self-report.

Measured cost per draft, same prompt:

| | |
|---|---|
| Cold cache (first draft of a session) | $0.163 |
| **Warm cache (steady state)** | **$0.023** |
| With `--effort low` | $0.380 |

That last row is not a typo. Setting `--effort` changes the request shape enough
to invalidate the cached ~26k-token prefix, and the resulting cache write costs
far more than the thinking tokens a lower effort saves. The prompt cache is the
entire cost story, for output as well as input.

## Your data

`~/.personal-md/`, mode 700, outside any git repo — because the file holds a NIF,
a phone number and an address, and a gitignored file inside a repo is one
`git add -f` away from being public.

```
PERSONAL.md    the source of truth. Plain markdown. Edit it by hand whenever.
secrets.json   values withheld from every prompt. Mode 600.
index.json     machine state: site memory, token ledger.
token          the shared secret the extension presents. Mode 600.
isolated/      empty cwd for `claude`, to keep CLAUDE.md out of prompts.
```

**Sensitive facts stay useful without being sent.** A NIF is needed in Spanish
government forms and never enters a prompt: it is filled by the deterministic
local matcher, which makes no model call at all.

Egress is fail-closed in three layers:

1. Every fact carries an `egress` classification derived **from its key** by a
   genuine **allowlist** — `SENDABLE_KEYS`. The membership test is narrow: does
   drafting *prose* need this value? A role, a seniority and a salary expectation
   do. A phone number, an email and a national ID never do, because they are
   filled verbatim by the deterministic matcher, so they stay out and nothing is
   lost. Anything nobody has thought about yet is withheld by default. Both
   `parse` and `serialise` recompute from the key and never trust the stored
   field, so a hand-edited file cannot promote a NIF to sendable.
2. The fully assembled payload is scanned immediately before spawning `claude` —
   including page-supplied question text and your own stored answers, which may
   contain a NIF you typed years ago. On a hit it **throws** rather than
   redacting: a partially redacted prompt teaches nothing and may still leak.
3. Values from `password` fields are never captured, and request bodies are never
   logged.

The server binds to 127.0.0.1 **and** requires a token. Loopback alone is not a
boundary — any process or page on the machine can reach it.

## Running it

```bash
npm install
npm start                 # companion server; prints the token to paste
npm run build             # builds the extension into packages/extension/.output
```

Then load `packages/extension/.output/chrome-mv3` as an unpacked extension in
Chrome, open the options page, and paste the token.

```bash
npm test                  # the offline suite, across all three packages
npm run typecheck
PERSONAL_MD_LIVE=1 node --test packages/server/test/claude.live.test.ts
```

Live tests are opt-in because they spend real quota on your account.

## Known issue: dev-dependency advisories

`npm audit` reports 10 vulnerabilities (3 critical, 4 high). All of them are in
`wxt` → `web-ext-run` → `firefox-profile` / `fx-runner` → `shell-quote`,
`adm-zip`, `tmp`.

This is accepted, not overlooked:

- It is **dev-only**. `npm ls --omit=dev` shows none of it in the dependency
  tree, and it contributes zero bytes to the shipped extension.
- It is WXT's **Firefox launcher**, which this project never invokes — the build
  targets Chrome MV3 only.
- `npm audit fix` offers no non-breaking fix; the only remedy is a WXT major
  bump. `overrides` pinning the three packages was tried and npm did not apply
  them in this workspace layout, so the config was removed rather than left in
  place implying protection it does not provide.

Revisit when WXT ships a release that updates `web-ext-run`.

## Verifying in a real browser

jsdom cannot prove two of the things that matter most: it has no layout engine,
so visibility is unknowable, and it cannot exercise the framework-value-tracking
that the filler is designed around. Both bugs found in this area were found in a
real browser, not in the unit tests.

There is a fixture server and an injectable harness for that:

```bash
node_modules/.bin/esbuild packages/extension/test/browser-harness.ts \
  --bundle --format=iife --platform=browser \
  --outfile=packages/extension/test/.harness.js
node packages/extension/test/serve-fixtures.mjs      # http://127.0.0.1:5599
```

Open the page, inject `/.harness.js`, then drive `window.__pmd`: `scan()`,
`match()`, `fillAll()`, `undo()`. The fixture is a Spanish ATS form written to be
awkward on purpose — labels attached six different ways, a split
`aria-labelledby`, a radio group in a `fieldset`, a honeypot, and a password
field that must stay empty.

## Layout

```
packages/core        the PERSONAL.md format: types, parse, serialise
packages/server      companion process, claude bridge, egress guard
packages/extension   Chrome MV3 extension (WXT + React + Tailwind)
```
