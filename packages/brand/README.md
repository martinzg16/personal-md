# @personal-md/brand

Brío's palette, faces and motion. One declaration, three surfaces.

## What is here

| | |
|---|---|
| `brio.css` | Tokens, keyframes and the two shared utilities. A Tailwind v4 `@theme` block, so it must be `@import`ed *into* a sheet that has already imported `tailwindcss`. |
| `fonts/` | Instrument Sans (variable, 400–700) and Instrument Serif, latin and latin-ext, as woff2. Both OFL. |

## Why the `@font-face` rules are not in here

They cannot be. `url()` inside `@font-face` resolves against the stylesheet's own
origin, and the three surfaces have three different origins:

- the **app** and the **popup** are extension pages, where `/fonts/x.woff2`
  resolves against the extension origin — correct;
- the **panel** renders in a shadow root on *someone else's* page, where that
  same path would resolve against the host and 404 (or, worse, hit whatever the
  host serves there). It declares its faces at mount time against
  `runtime.getURL()`;
- the **site** is a static build with its own asset pipeline and its own hashes.

So each surface owns its own `@font-face` block and points it at its own copy of
the files. `npm run sync-fonts` in each consumer copies them from here, which is
what keeps "its own copy" from meaning "a different version".

## Adding a colour

Don't, if a token already says the thing. The palette is small on purpose: seven
hairline weights exist because this design carries separation entirely with
lines, but there is exactly one accent, and a screen with two accents on it has a
design problem that a new token will not fix.

If you do: add it here, add it to `DESIGN.md`, and use it in at least two places.
A token used once is a hardcoded value with extra steps.
