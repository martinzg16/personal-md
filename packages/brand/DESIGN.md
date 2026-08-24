# Brío — the design system

**North star: your own file, arriving in someone else's form, saying what it
did.**

Three surfaces share it: the landing, the app, and the panel that sits over other
people's pages. They are one product because the palette, the two faces and the
four keyframes are declared exactly once, in `brio.css`, and because all three
obey the same four rules.

The tokens themselves are in [`brio.css`](./brio.css) with the reasoning attached
to each block. This file is the part that does not fit in a comment: what the
rules are, what they forbid, and what has already been got wrong.

---

## The four rules

### 1. Bone is the ground, ink is the tool

Reading surfaces are warm off-white (`bone-050`), and the user's own words sit on
white cards on top of it. The tool's own chrome — the top bar, the panel over
someone else's page — is near-black (`ink-900`).

The point is that you can always tell, at a glance, whether you are looking at
**your file** or at **Brío talking about it**. The panel is dark for exactly this
reason: it sits over a stranger's page, and a tool that blends into the host page
is a tool you cannot tell apart from the host page's own UI.

`ink-900` is `#121210` — warm, not neutral. Next to bone it reads as the same
room. A true grey reads as a different application.

**Never**: a light-on-light panel; a bone card inside the dark panel; white
(`#fff`) as a page ground. White and bone next to each other collapse into one
plane and the whole hierarchy goes with them.

### 2. Orange is an event, not a decoration

`brio-500` marks two things, and they are the same thing: *something happened
that you have to look at*. The one action worth taking, and a refusal — a payload
blocked before it left, a fill that could not be applied.

**Two orange things competing on a screen means one of them is wrong.**

Amber is the other thing entirely and must not be confused with it: **amber means
nobody is sure yet** — a value that was inferred rather than stored, a draft the
model wrote, a field that already held something. Jade means done.

Lapis (`lapis-500`) is the second voice and appears **on the landing only**,
where there is a second thing to say. It has no job inside the product.

### 3. The serif speaks, the mono measures

- **Instrument Serif** carries statements: headlines, group names, figures, the
  mark. It never carries body copy and never carries a label.
- **Instrument Sans** is everything in between — the argument, the controls, the
  user's own prose.
- **Mono** carries anything a machine produced: dotted keys, counts, costs,
  timestamps, provenance, domains.

You can tell who authored a string by the face it is set in. A key set in the
sans, or a sentence set in the mono, breaks the one signal that makes these
screens skimmable.

The mono is a **system stack**, deliberately. Every mono string in this product
is short, and a fourth webfont for them would cost more than it buys.

`brio-eyebrow` uppercases; `brio-mono` does not. That distinction is load-bearing:
eyebrows label a group, and **keys are lowercase by definition** — uppercasing
`experience.relevant_background` prints an identifier that does not exist in the
file. This has already been got wrong once, on `Card`'s meta slot.

### 4. The dark palette is not an inversion

On ink, jade and amber are different values from the jade and amber used on bone,
because the light-ground versions go muddy there. Both sets are in `brio.css` and
neither is derived from the other.

Same for the accent: `brio-500` clears 5.9:1 on `ink-900` and is fine for a 13px
line, but the panel's failure text runs at 11px, which is what `brio-400` is for.

---

## Two ramps

There are **two type ramps**, not one, and mixing them is a mistake rather than a
liberty.

- **The app and the landing** run 13.5 / 14.5 / 16.5 for text, with the display
  face clamped for headlines. Roomy, because they are full pages you sit with.
- **The panel** runs 10 / 10.5 / 11 / 12 / 13 / 14. Tighter, because it is 392px
  wide and sits over someone else's page — at the app's 14.5/16.5 it reads as
  shouting, and it has to fit a seven-line trace log without becoming a scroll.

Nothing from the panel ramp belongs in the app, and nothing from the app ramp
belongs in the panel. Both are in `DESIGN.md`'s frontmatter as `brio-*` and
`brio-panel-*`.

The landing's simulated host form is on **neither**. It is standing in for a
stranger's ATS, and setting it on Brío's ramp would quietly claim that Brío
designed the form it is filling in. Its sizes are its own on purpose.

---

## Hierarchy without shadows

Below the panel layer this design has **no shadows at all**. Separation is
carried by exactly three things:

1. the **face** a string is set in,
2. the **weight of the hairline** around it,
3. the **space** above it.

That is why there are seven rule weights and it is not excessive: a card inside a
card inside a page needs three distinct hairlines to stay legible without any of
them becoming a border you notice.

It is also why there are only five primitives (`PageHead`, `Card`, `Eyebrow`,
`Mono`, `Pill`, plus `Empty`). A sixth would almost certainly introduce a fourth
signal, and a fourth signal is where a design stops being readable at a glance.

Shadows exist in two places only, both of which are literally floating: the
panel over a host page, and the landing's product-shot frame.

---

## Focus

One ring, `brio-500`, offset by 2px, everywhere.

Unlike the document world this needs no per-ground redeclaration: the accent
clears the 3:1 floor for a non-text indicator on both grounds — 3.6:1 on
`bone-050`, 5.9:1 on `ink-900`. Components supply the matching `ring-offset`
colour so the ring never sits directly on what it is ringing.

The panel avoids taking focus, but everything in it is still reachable. "Never
steals focus" and "cannot be reached by keyboard" are not the same claim.

---

## Motion

Four keyframes and no more: `brio-in` (a row arriving), `brio-rise` (the panel
arriving), `brio-pulse` (work in progress), `brio-flash` (a value that just landed
in a field, seen once and never again).

Everything that appears does so because the user caused it, so the entrance is
short and travels a few pixels: it says "this is new" and gets out of the way.

All four are suppressed under `prefers-reduced-motion`, **including the pulse** —
an indefinitely repeating opacity animation is the one most likely to be actively
unpleasant rather than merely unnecessary.

Nothing loops for decoration. The landing's product shot plays once, on scroll
into view, and holds its end state; under reduced motion it renders the end state
and never plays at all, because the information is in the end state rather than
in the transition.

---

## The mark

The initial, set in the display face, on the one orange disc a surface is
allowed. It is a **glyph, not a path**, so that if the display face ever changes
the mark changes with it instead of quietly becoming a second, older brand.

It is sized from the disc rather than inherited (`fontSize ≈ 0.58 × size`),
because it appears at four different sizes across the three surfaces and an
em-relative glyph would be a different mark in each of them.

---

## Honesty rules

These are design rules here because in this product they are design decisions,
not copy decisions.

- **A number on a surface must be a number somebody measured.** The landing's two
  figures come from the README's live measurement of the CLI path. The prototype
  carried "twelve minutes a form, or eleven seconds — median across 34
  applications"; nobody ran that, so it is not on the page.
- **Two numbers for one idea on one screen is a bug.** The Privacy rail badge and
  the Privacy screen disagreed once — 5 against 3 — because one counted policy
  keys and the other counted keys you hold. They now count the same thing.
- **An empty state names what to do about it.** Never a shrug.
- **A screen with no data source does not get invented data.** `Connections`
  shows the two sources that exist and says plainly that there are two, rather
  than showing four cards where three of them have never synced anything.
  `Activity` shows the file's own history and states, in the screen, that this is
  not a per-fill log — because the format does not hold one.
- **A withheld value is not printed on a history screen.** It is editable on
  Context, where you went to edit it, and masked in the panel, which sits over
  third-party pages. Those are different surfaces with different threat models
  and they are allowed to differ.

---

## Getting it wrong

Real mistakes, kept so they are not made twice.

- **A blanket colour substitution broke a button.** Porting the panel from slate
  to ink mapped `text-slate-900` to `text-paper-050` everywhere. On the quoted
  chip that was right — the chip went dark, so its text goes light. On the
  primary action it produced `bg-paper-050 text-paper-050`: white on white. A
  token's *role* does not survive a find-and-replace; only its value does.
- **A missing `@source` renders as a broken component.** The popup rides the
  app's sheet but lives in a sibling directory, so every class only it used was
  dropped and it rendered as an unstyled full-width block. Tailwind v4 infers
  scan paths from the stylesheet's own directory, and in a monorepo that is never
  enough. Declare them.
- **Two `@theme` blocks merge, they do not scope.** Importing Brío into the
  document's `style.css` silently set the app in Archivo. One sheet per world.
- **`line-clamp` with a fractional line-height leaves a sliver.** Three lines of
  `leading-normal` clipped two pixels of the fourth, which reads as a rendering
  bug rather than as a truncation. Clamp against an integral line-height.
- **A full-page screenshot restarts entrance animations.** The panel photographed
  as a translucent grey box and looked like a broken background; it was mid-
  `brio-rise` with `both` fill. Freeze animation before capturing, and check
  computed styles before believing a screenshot.

---

## Where things are

```
packages/brand/brio.css                     tokens, keyframes, utilities
packages/brand/fonts/                        Instrument Sans + Serif, woff2, OFL
packages/site/src/                           the landing
packages/extension/entrypoints/options/brio.css   the app + popup sheet
packages/extension/components/app/           the app's screens and primitives
packages/extension/components/widget/        the panel
```

Each surface declares its own `@font-face` block pointing at its own copy of the
files, because `url()` resolves against the stylesheet's origin and the three
surfaces have three different ones. `npm run sync-fonts` in each consumer copies
from `packages/brand/fonts`, which is what keeps "its own copy" from meaning "a
different version".

## Looking at it

```bash
npm run site                                    # the landing, :5602
npm run preview --workspace @personal-md/extension   # the app, :5601
```

- `/` — the app
- `/widget.html` — every panel state at once, on a light and a dark ground
- `/?popup=1` — the popup
- `/?empty=1&cover=1` — onboarding, which is what first run actually looks like
- `/?conn=down`, `/?conn=signedout` — the two ways the companion fails
- `/?document=1` — the other world, still building

The empty and failed states are most of what these surfaces are. A fixture that
is always populated and always connected hides every one of them.
