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
npm test                  # 94 offline tests
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

## Layout

```
packages/core        the PERSONAL.md format: types, parse, serialise
packages/server      companion process, claude bridge, egress guard
packages/extension   Chrome MV3 extension (WXT + React + Tailwind)
```
