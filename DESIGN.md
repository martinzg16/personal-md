---
name: personal-md
description: A second brain for filling out forms — a source-first ledger of your own file, projected onto someone else's form.
colors:
  slate-900: "oklch(20.8% 0.042 265.755)"
  slate-800: "oklch(27.9% 0.041 260.031)"
  slate-700: "oklch(37.2% 0.044 257.287)"
  slate-500: "oklch(55.4% 0.046 257.417)"
  slate-400: "oklch(70.4% 0.04 256.788)"
  slate-300: "oklch(86.9% 0.022 252.894)"
  slate-200: "oklch(92.9% 0.013 255.508)"
  slate-100: "oklch(96.8% 0.007 247.896)"
  slate-50: "oklch(98.4% 0.003 247.858)"
  sky-400: "oklch(74.6% 0.16 232.661)"
  sky-500: "oklch(68.5% 0.169 237.323)"
  emerald-300: "oklch(84.5% 0.143 164.978)"
  orange-950: "oklch(26.6% 0.079 36.259)"
  orange-400: "oklch(75% 0.183 55.934)"
  orange-300: "oklch(83.7% 0.128 66.29)"
  orange-200: "oklch(90.1% 0.076 70.697)"
  orange-100: "oklch(95.4% 0.038 75.164)"
  orange-50: "oklch(98% 0.016 73.684)"
  amber-500: "oklch(76.9% 0.188 70.08)"
  amber-200: "oklch(92.4% 0.12 95.746)"
  rose-300: "oklch(81% 0.117 11.638)"
typography:
  lead:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "1.375"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "1.25"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "1.375"
  action:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "1.333"
  support:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "1.25"
  label:
    fontFamily: "ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace"
    fontSize: "10px"
    fontWeight: 400
    letterSpacing: "0.06em"
rounded:
  interior: "0.25rem"
  panel: "0.5rem"
  pill: "9999px"
spacing:
  gutter: "1rem"
  row: "0.75rem"
  band: "0.5rem"
  meta: "0.375rem"
components:
  pill:
    backgroundColor: "{colors.slate-900}"
    textColor: "{colors.slate-100}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 0.875rem 0.5rem 0.625rem"
    typography: "{typography.title}"
  panel:
    backgroundColor: "{colors.slate-900}"
    textColor: "{colors.slate-100}"
    rounded: "{rounded.panel}"
    width: "min(380px, calc(100vw - 2rem))"
    height: "min(70vh, 560px)"
  quoted:
    backgroundColor: "{colors.slate-50}"
    textColor: "{colors.slate-900}"
    rounded: "{rounded.interior}"
    padding: "0.25rem 0.5rem"
    typography: "{typography.lead}"
  action-primary:
    backgroundColor: "{colors.slate-100}"
    textColor: "{colors.slate-900}"
    rounded: "{rounded.interior}"
    padding: "0.25rem 0.625rem"
    typography: "{typography.action}"
  action-primary-hover:
    backgroundColor: "#ffffff"
    textColor: "{colors.slate-900}"
  action-primary-disabled:
    backgroundColor: "{colors.slate-700}"
    textColor: "{colors.slate-500}"
  action-quiet:
    textColor: "{colors.slate-300}"
    rounded: "{rounded.interior}"
    padding: "0.25rem 0.625rem"
    typography: "{typography.action}"
  action-quiet-hover:
    backgroundColor: "{colors.slate-700}"
    textColor: "#ffffff"
  caution:
    backgroundColor: "{colors.orange-950}"
    textColor: "{colors.orange-100}"
    rounded: "{rounded.interior}"
    padding: "0.25rem 0.5rem"
    typography: "{typography.action}"
  caution-quote:
    backgroundColor: "{colors.orange-400}"
    textColor: "{colors.orange-50}"
    rounded: "{rounded.interior}"
    padding: "0 0.25rem"
  degraded-banner:
    backgroundColor: "{colors.amber-500}"
    textColor: "{colors.amber-200}"
    padding: "0.5rem 1rem"
    typography: "{typography.support}"
  failure:
    textColor: "{colors.rose-300}"
    typography: "{typography.support}"
  chip-meta:
    backgroundColor: "{colors.slate-700}"
    textColor: "{colors.slate-200}"
    rounded: "{rounded.interior}"
    padding: "0.125rem 0.375rem"
    typography: "{typography.label}"
  draft-editor:
    backgroundColor: "{colors.slate-50}"
    textColor: "{colors.slate-900}"
    rounded: "{rounded.interior}"
    padding: "0.5rem"
    typography: "{typography.body}"
  instruction-field:
    backgroundColor: "{colors.slate-800}"
    textColor: "{colors.slate-200}"
    rounded: "{rounded.interior}"
    padding: "0.25rem 0.5rem"
    typography: "{typography.support}"
---

# Design System: personal-md

## Overview

**Creative North Star: "Your File, Projected"**

This system governs one surface: the in-page widget that appears over third-party
forms. Its thesis is written into the code it governs, at
`packages/extension/components/widget/Widget.tsx:1`:

> this panel is your file, projected onto someone else's form. Rows lead with
> what you wrote and where it came from, naming the host field only as the
> destination - refusing the field-inventory list every autofill extension ships.

That refusal is the whole system. Every other autofill extension enumerates the
host page: a list of the employer's field names, each with a value attached. This
one inverts the reading order. Your value leads, in your words, on a light chip.
Its source in your file follows. The host form's field name is demoted to a
destination in the metadata line — an arrow and a wrapped label, in monospace, at
10px (`Widget.tsx:238`). An earlier build led with the field name; it made four
of five rows read the employer's word first, which is exactly the inventory list
the thesis rejects (`Widget.tsx:268`).

The rule has two documented exceptions, and both prove it rather than weaken it.
A **masked** fact has no readable value to lead with, so the field's identity
leads and the row of dots sits down in the provenance slot: "the loudest element
on the row would be a row of dots" (`Widget.tsx:294`). An **unanswered** row has
no stored value at all, so the question leads — but at 12px `slate-200`, demoted
below the panel title, because at 13px semibold it tied the title for dominance
and "the same panel demoted the host field on three row kinds and promoted it on
this one" (`Widget.tsx:449`).

The visual world is inherited and then inverted. The extension's options page and
popup are white cards on a plain ground with Tailwind slate neutrals and one
accent per state (`packages/extension/entrypoints/options/App.tsx:19`). The widget
takes the same palette and turns it over: dark slate chrome, because the panel
does not live on a ground it controls. Inside that chrome, your own words are
quoted on the one light surface (`Widget.tsx:255`). The light chips are your file;
the dark frame is the tool holding it.

Nothing here is decorative. There is one authored animation, the panel arriving
(`packages/extension/entrypoints/content/widget.css:103`). There are ten
hand-drawn icons on one 16px grid at one stroke weight
(`packages/extension/components/widget/icons.tsx:13`). No gradient, no glass, no
illustration, no colour that does not carry a state.

**Key Characteristics:**

- Source-first reading order: your value, then its provenance, then the destination.
- Dark slate chrome on an uncontrolled ground; light chips for your own words.
- Four states with four meanings, distinguished by content before hue.
- Drawn icons on a single 1.5px stroke grid. No emoji, no glyph font.
- Explicit over ambient: nothing opens, writes, submits, or closes itself.

## Colors

Tailwind's slate ramp, used inverted, with accents that each mean exactly one
thing.

### Primary

- **Tool Slate** (`slate-900`): the chrome. The pill's ground
  (`Widget.tsx:627`) and the panel's ground (`Widget.tsx:639`). Chosen because the
  panel sits on a page whose background is unknown and unknowable: a dark, ringed,
  shadowed rectangle reads as a separate object against a white ATS form and
  against a dark dashboard alike. It is the first binding decision made visual.
- **Your Words** (`slate-50`): the only light surface inside the tool. It backs the
  quoted value (`Widget.tsx:259`) and the draft editor (`Widget.tsx:513`), with
  `slate-900` text on it at 17.1:1. Nothing else in the panel is light.

### Secondary

- **Attention Sky** (`sky-400`, `sky-500` for input borders): the focus ring
  (`Widget.tsx:162`), the drafting pulse dot (`Widget.tsx:480`), the focused
  border on the editor and the instruction field (`Widget.tsx:513`,
  `Widget.tsx:561`). Sky means *this is where the interaction is*, never *this
  went wrong*.

### Tertiary — the state vocabulary

Four states with four meanings. The boundaries between them are load-bearing, and
collapsing two of them was a defect that had to be fixed twice — once by
separating the colours, and then, when that turned out not to be enough, by
separating the content. The record is at `Widget.tsx:197`.

- **Applied Emerald** (`emerald-300`): a row that has been written into the page.
  Replaces the action button entirely — "Filled", "Inserted"
  (`Widget.tsx:343`, `Widget.tsx:398`, `Widget.tsx:527`). Emerald is only ever
  retrospective: it reports a completed write.
- **Caution Orange** (`orange-400/50` border, `orange-950/60` ground,
  `orange-100` text, with the current value quoted on an `orange-400/15` chip):
  *this field already holds …* (`Widget.tsx:207-219`). Also the over-limit word
  count in `orange-200` (`Widget.tsx:517`), the information-gap bullets in
  `orange-300` (`Widget.tsx:544`), and the ungrounded-figure warning. Orange is
  prospective and it is about **your next click**: look before you apply this.
- **Degraded Amber** (`amber-500/10` ground, `amber-500/20` border, `amber-200`
  text): the companion server is not running, so drafting is unavailable and
  everything else still works (`Widget.tsx:670-674`). Amber is a panel-level
  capability report. Nothing is wrong and no action is required.
- **Failure Rose** (`rose-300`): something was attempted and did not happen
  (`Widget.tsx:221-229`, used at `Widget.tsx:339`, `Widget.tsx:486`). Rose always
  names the recovery in its text — "That field is no longer on the page. Reload
  and try again."

### Neutral

- **Chrome Edge** (`slate-700` at 50-80%): the ring around pill and panel, the
  header and footer rules, the row dividers (`Widget.tsx:687`), and the ground of
  metadata chips (`Widget.tsx:318`, `Widget.tsx:500`). All at partial alpha, so
  the seams are felt rather than drawn.
- **Support** (`slate-400`): the subtitle, monospace labels, the footer's "Never
  on this site". 6.96:1 on `slate-900`.
- **Prose on Dark** (`slate-100` / `slate-200` / `slate-300`): the panel title and
  masked-field identity, the unanswered question and instruction field, quiet
  action labels and destinations.

### Named Rules

**The Content-Before-Hue Rule.** Two warm states sit in the same panel — the
row-level caution and the panel-level degradation banner — and the distinction
between them is carried by **what they say**, not by their colour. The code states
why: *"Both were warm, and measured against each other their fills were the same
colour and their text 18 degrees apart in the same family - so a colour-only
distinction was never going to carry it"* (`Widget.tsx:197`). The fix was to give
the caution something the banner structurally cannot have: **the value already in
the field, quoted**. That is also the fact the user needs in order to decide
whether to overwrite. Hue reinforces the split — the caution's ground is a red-brown
`orange-950/60` (rgb 47,21,21), the banner's a near-neutral warm band
(rgb 38,36,39) — but hue is the second signal, not the first.

**The Readable Guard Rule.** The caution is the guard against the failure this
whole design was pointed at, so it is never the smallest thing in the panel. It
carries a border, a filled ground, a 14px icon and 12px text
(`Widget.tsx:209`) — up from an earlier 10px form that was the smallest text in
the panel wearing a status colour. `orange-100` on that ground measures 14.8:1;
the quoted value chip, 12.3:1.

**The One Light Surface Rule.** Inside the dark chrome, `slate-50` is reserved for
text you wrote or are about to send: the quoted value and the draft editor.
Nothing structural, nothing chrome, nothing of the host page's gets a light
ground. The light *is* the signal for "this is yours".

**The Tinted Shadow Rule.** Shadows use `rgba(15,23,42,…)` — the panel's own
slate-900, not black (`Widget.tsx:627`, `Widget.tsx:639`). A pure-black shadow
under a slate panel on a white form reads as a dropped sticker.

## Typography

**Body Font:** the platform UI stack — `ui-sans-serif, system-ui, -apple-system,
"Segoe UI", Roboto, sans-serif` (`widget.css:65`).
**Label/Mono Font:** `ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace`,
applied only through `.pmd-mono` (`widget.css:99`).

**Character:** invisible on purpose. The panel makes no typographic claim, because
a distinctive face would be one more thing competing with the host page's own
type. The only expressive decision is where monospace is allowed, and it is
narrow: **monospace here is for data and measurement, not costume**
(`Widget.tsx:165`).

The root declares its own `font-family`, `font-size`, `line-height`,
`font-weight`, `text-align`, `letter-spacing` and `text-transform`
(`widget.css:65-71`). Every one of those is a property a host page can set on
`body` and have inherit into a shadow root; declaring them all is what stops a
page with `text-transform: uppercase` on its body from shouting the panel's copy.

### Hierarchy

The ramp is compressed — five steps between 10px and 14px — and every size is
written as an arbitrary pixel value rather than Tailwind's rem-based scale.

- **Lead** (400, 14px, `leading-snug`): the quoted value or stored answer, and
  nothing else (`Widget.tsx:256`). The largest text in the panel is always
  something you wrote.
- **Title** (600, 13px, `leading-tight`): the panel heading, "Your file, here"
  (`Widget.tsx:645`). Also the masked fact row's field identity at 500 weight
  (`Widget.tsx:302`) — deliberately the same size, because on that row the field
  name *is* the row's subject.
- **Body** (400, 13px): the draft editor (`Widget.tsx:513`), non-lead quoted text,
  the empty state's first line.
- **Action** (500, 12px / `text-xs`): button labels (`Widget.tsx:190`), the
  caution (`Widget.tsx:209`), the unanswered question (`Widget.tsx:457`).
- **Support** (400, 11px): the subtitle, failure text, the degradation banner, the
  instruction field, the footer's dismissal, the masked value line.
- **Label** (400, 10px, `0.06em` tracking, monospace): provenance keys,
  destinations, word counts, metadata chips (`Widget.tsx:165`). The masked value
  is the one place tracking widens, to `0.08em` (`Widget.tsx:305`), because a run
  of bullet glyphs needs the air.

### Named Rules

**The Pixel Ramp Rule.** Type sizes are declared in px (`text-[13px]`,
`text-[10px]`), not in the rem-based scale. The shadow root isolates the cascade
but not the root font size, and a panel that shrinks to 9px on a host page with
`html { font-size: 12px }` is illegible through no fault of its own.

**The Monospace Is Data Rule.** Monospace marks provenance, destination and
measurement only: source keys, field labels, word counts, the quoted existing
value, the masked value, the instruction field. Never a heading, never a value you
wrote, never body prose.

**The Title Outranks The Page Rule.** No text sourced from the host page is set at
the panel title's weight and size. The unanswered question — the one row kind
where a host-page string legitimately leads — sits at 12px `slate-200`, one step
below the title.

## Layout

A single fixed-position column, bottom-right, at `right: 16px; bottom: 16px`
(`widget.css:54-56`), with `justify-content: flex-end` so both the collapsed pill
and the expanded panel hang off the same right edge.

The panel is `min(380px, calc(100vw - 2rem))` wide and
`max-h-[min(70vh,560px)]` tall (`Widget.tsx:639`) — narrow enough to sit beside a
form rather than over it, capped so it never becomes the page.

Internal rhythm, in four steps:

- **Gutter** 16px (`px-4`): every band's horizontal inset — header, rows, banner,
  footer.
- **Row** 12px (`py-3`): vertical padding on header and each ledger row.
- **Band** 8px (`py-2`): footer and degradation banner, so chrome reads thinner
  than content.
- **Meta** 6px (`mt-1.5`): the gap between a value and its provenance line, and
  between provenance and a caution.

The row is a two-column split: `flex items-start justify-between gap-3` with
`min-w-0 flex-1` on the content side (`Widget.tsx:292`). The action stays
`shrink-0`. The destination label was once a right-rail block above the button; it
squeezed the left column until the source key wrapped and the destination itself
truncated, so it moved inline into the metadata line — "the value leads, but it
needs the room to" (`Widget.tsx:231`).

Only the ledger scrolls (`overflow-y-auto` on the `<ul>`, `Widget.tsx:687`);
header, banner and footer are fixed bands around it.

### Named Rules

**The Nothing Truncates Rule.** Inside a row, text wraps; it does not truncate.
The destination is `break-words` with an `items-start` icon
(`Widget.tsx:240-249`), and the provenance key too (`Widget.tsx:313`). The reason
is specific: *"At 390px a truncating destination clipped the very thing the user
has to read before committing - 'en Expectativa salarial bruta anu...' and, worse,
the question a long-form answer was about to be inserted into. A second line costs
nothing next to confirming the wrong destination."* The one surviving `truncate` is
the header's domain subtitle (`Widget.tsx:646`), which is chrome, not a
commitment.

**The Measured Fold Rule.** The list's bottom mask is applied only when the list
actually overflows, measured from `scrollHeight - clientHeight - scrollTop > 2`
and re-measured on scroll (`Widget.tsx:601-617`, applied at `Widget.tsx:687`).
*"The edge fade is a lie on a list that fits, and it dims the last row of every
small form for no reason."* It also disappears once you reach the bottom, at which
point there is nothing below to signal.

## Elevation & Depth

Two layers only: the page, and the tool. There is no elevation *within* the panel
— no raised cards, no nested shadows. Depth inside the chrome is tonal:
`slate-700` at partial alpha for seams, `slate-50` for the one light surface,
`slate-800/60` for the recessed instruction field.

### Shadow Vocabulary

- **Pill** (`box-shadow: 0 6px 20px -4px rgba(15,23,42,0.5)` + `ring-1
  ring-slate-700/80`): enough lift to read as an object, small enough to be
  ignorable (`Widget.tsx:627`).
- **Panel** (`box-shadow: 0 16px 48px -12px rgba(15,23,42,0.6)` + `ring-1
  ring-slate-700/80`): a deeper, wider cast for the open state (`Widget.tsx:639`).

The 1px ring does the separation work; the shadow only says "above". On a dark
host page the shadow disappears and the ring is what still holds the edge, which
is why both are always present together.

### Named Rules

**The Winnable Ceiling Rule.** `z-index: 2147480000` — high, and deliberately
*not* the 32-bit maximum (`widget.css:58`). A page's own modal deserves to win
sometimes, and a fight for the top is unwinnable anyway.

**The Flat Interior Rule.** Nothing inside the panel casts a shadow. A row is
separated from its neighbour by a `slate-700/50` divider and nothing else.

**The Soft Cut Rule.** The overflow mask ramps to `rgba(0,0,0,0.4)` over 12px, not
to fully transparent over 18px (`widget.css:94-97`). A full fade "caught rows
clipped near the boundary and greyed their entire visible sliver, slicing
horizontally through the glyphs of an already-applied row so that 'done' read as
'broken'."

## Shapes

Three radii, and the count is the point.

- **Pill** (`rounded-full`): the collapsed state, and only the collapsed state.
  Full-round is what makes it read as a dismissable affordance rather than a
  window.
- **Panel** (8px, `rounded-lg`): one radius for the whole tool.
- **Interior** (4px): every button, chip, quoted block and input. `rounded` and
  `rounded-sm` both resolve to `0.25rem` under Tailwind v4, so the interior has
  effectively one radius, not two.

Borders are used sparingly and always to mean something. A left border on the
quoted block (`border-l border-slate-300`, `Widget.tsx:259`) marks it as a
quotation. A full border on the caution (`Widget.tsx:209`) is what lifted it out
of being small coloured text. `border-slate-300` on the draft editor against
`border-slate-700` on the instruction field distinguishes *the thing you will
send* from *the note that steers it*.

Icons are drawn, not typeset: `viewBox="0 0 16 16"`, `stroke-width: 1.5`,
`stroke-linecap`/`linejoin: round`, `fill: none`, `stroke: currentColor`, all from
one shared base object (`icons.tsx:13`). The rationale is environmental, not
aesthetic: the panel renders inside a shadow root on arbitrary pages, "where a
host font can substitute a glyph for something unrecognisable, and where an
emoji's colour would fight the panel's own palette" (`icons.tsx:1`). Because every
icon inherits `currentColor` and 1.5px, an icon can be dropped into any state
colour without a second asset.

### Named Rules

**The Drawn Icon Rule.** Every icon is inline SVG on the 16px grid at 1.5px
stroke, inheriting `currentColor`. No emoji, no icon font, no `<img>`. Emoji and
glyph fonts are both substitutable by the host environment, and a tool whose
padlock renders as a tofu box on someone else's page has lost the argument it was
making.

**The No Sparkle Rule.** The drafting icon is a nib, not a sparkle
(`icons.tsx:44`) — "the sparkle is the category's tell". The panel does not
advertise that a model is involved with the genre's stock glyph.

**The No X Rule.** The header's control is a chevron rotated to point down at the
pill it collapses into, not a cross (`Widget.tsx:661-666`). *"A bare X reads as
'dismiss this', and dismissal is the footer's job - which is a different,
remembered decision."* The `Close` icon was deleted from `icons.tsx` when this
landed; there is no X in the system.

## Components

### Pill (collapsed state)

The entire first viewport. `slate-900` ground, `slate-100` text at 13px/500, the
document mark in `slate-400`, full-round, asymmetric padding (`pl-2.5 pr-3.5`) so
the icon does not float (`Widget.tsx:619-633`). Its label is a count and nothing
else: `"3 from your file"` / `"3 de tu fichero"`, or `"all applied"` once every
row is written. The count is of *unapplied* rows (`Widget.tsx:576`), so it
decrements as you work.

### Panel

`slate-900` ground, `rounded-lg`, `ring-1 ring-slate-700/80`, `overflow-hidden`, a
fixed header, an optional banner, a scrolling ledger, a fixed footer
(`Widget.tsx:635-725`). `role="region"` with a translated `aria-label`. The
header's control is a collapse, not a close.

### Quoted value

Your words on the one light surface: `slate-50` ground, `slate-900` text,
`border-l border-slate-300`, 4px radius, `px-2 py-1`, 14px when leading a row and
13px otherwise (`Widget.tsx:255-266`). This is the component the thesis is built
on. On a readable fact row it is always first.

### Masked fact row

The documented exception. When a value is withheld from prompts and not revealed,
the field identity leads at 13px/500 `slate-100` and the masked value sits below
it at 11px monospace `slate-300` with `0.08em` tracking; the destination is
suppressed, because it would repeat the leading line
(`Widget.tsx:294-316`). `mask()` keeps the last two characters and replaces the
rest with bullets, minimum three (`Widget.tsx:156-159`). Revealing swaps the order
back to value-first.

### Action

Two tones and no third. **Primary** is `slate-100` on `slate-900` going to pure
white on hover — the light-on-dark inversion that makes "Fill" and "Insert" the
brightest thing in the row. **Quiet** is `slate-300` text with a `slate-700/60`
hover ground, for "Draft it", "Redraft" and "Undo". Both are 12px/500, 4px radius,
`px-2.5 py-1`, `transition-colors duration-150`, and both carry the shared focus
ring (`Widget.tsx:170-195`). Disabled states are explicit: primary drops to
`slate-700`/`slate-500`, quiet to `slate-600`, with `cursor-not-allowed`.

### Caution

`orange-400/50` border, `orange-950/60` ground, `orange-100` text at 12px/500, a
14px `Gap` icon, and — when there is one — the field's current value on a
monospace `orange-400/15` chip. Wraps rather than clipping
(`flex-wrap max-w-full`, `Widget.tsx:207-219`). Deliberately the heaviest small
component in the panel.

### Degradation banner

A full-width band between header and ledger: `amber-500/10` ground,
`amber-500/20` bottom border, `amber-200` text at 11px (`Widget.tsx:670-674`).
Its copy states the scope of the loss rather than the fault: *"Drafting needs the
server running. Everything below still works."* The "Draft it" buttons go disabled
at the same time (`Widget.tsx:471`), so the banner and the controls agree.

### Failure line

`rose-300` at 11px with the `Gap` icon, `items-start` so the icon aligns to the
first line of wrapping text (`Widget.tsx:221-229`). Always names the recovery.
Attached to the row that failed, per row.

### Metadata line

A wrapping flex row under the value, `gap-x-2 gap-y-1`: the provenance key in 10px
monospace (`from personal.full_name`, or `worked out from …` when derived), the
destination (arrow + wrapped host field label), the "never sent to Claude" chip
with a padlock when the value is withheld, and a Show/Hide toggle
(`Widget.tsx:312-333`).

### Draft editor

`slate-50` ground, `slate-300` border, `slate-900` text at 13px/relaxed, six rows,
`resize-y`, focus border shifting to `sky-500` (`Widget.tsx:509-514`). Below it, a
live word count in monospace that turns `orange-200` when over the field's limit,
and the Redraft/Insert pair. Below that, the instruction field — `slate-800/60`
ground, `slate-700` border, monospace 11px, placeholder "Tell it what to change"
(`Widget.tsx:557-562`). The dark instruction field against the light editor is the
distinction between *the text that will be submitted* and *the note that changes
it*.

### Provenance chips

`slate-700/70` ground, `slate-200` text, 10px, one per source the draft used,
labelled with the surface form it was asked as plus the date it was written, with
the excerpt on `title` (`Widget.tsx:494-505`). They render **above** the draft
text and appear as soon as they exist. Drafting takes about ten seconds, so
"provenance is shown the moment it exists rather than after the text: the wait is
legible instead of blank, and you can tell it understood the question before it
has finished answering" (`Widget.tsx:413`).

### Drafting indicator

A 6px `sky-400` dot pulsing at 1.4s, the word "Drafting", and the honest
expectation in `slate-400`: "about ten seconds" / "unos diez segundos"
(`Widget.tsx:478-484`).

### Empty state

Not "nothing found" — the panel only mounts when there is something to say, so an
empty ledger means the profile came back empty. "Nothing in your file yet." at
13px, then the fix at 12px `slate-400` on a `max-w-[34ch]` measure: *"The
companion server answered, but the profile came back empty. Check it is pointing
at the right ~/.personal-md."* (`Widget.tsx:676-682`).

### Footer

Undo on the left, present only when there is something to undo, labelled with its
count — "Undo 1" (`Widget.tsx:709-713`). "Never on this site" on the right, in
`slate-400` at 11px, which removes the widget from this domain permanently
(`Widget.tsx:717-723`).

## Do's and Don'ts

### Do:

- **Do** lead every row with the user's own content, and put the host page's field
  name in the destination slot. Depart from this only where there is no readable
  value to lead with, and say so in a comment.
- **Do** give each state its own accent *and* its own content: emerald for
  written, orange for check this, amber for degraded, rose for failed.
- **Do** quote the value already in a field when warning about overwriting it.
  That fact is what the decision needs, and it is what separates the caution from
  the banner.
- **Do** name the recovery in every failure message. "That field is no longer on
  the page. Reload and try again." is the pattern.
- **Do** let row text wrap. Truncation inside a row hides the thing being
  confirmed.
- **Do** declare type sizes in px inside the shadow root.
- **Do** put every new icon on the 16px / 1.5px stroke grid in `icons.tsx` and let
  it inherit `currentColor`.
- **Do** pair the 1px `slate-700/80` ring with any shadow, so separation survives
  a dark host page.
- **Do** define both language strings in the `t` table at `Widget.tsx:68` in the
  same edit as the component that uses them.

### Don't:

- **Don't** distinguish two warm states by hue alone. Measure them against each
  other; if their fills land on the same colour, one of them needs different
  content.
- **Don't** put a status colour on text smaller than 11px. The caution's earlier
  10px form was a defect.
- **Don't** add a second light surface inside the chrome. `slate-50` means "this
  is yours".
- **Don't** use `slate-500` for text on `slate-900`: it measures 3.74:1, below the
  4.5:1 floor. The footer's dismissal link was moved off it to `slate-400`
  (6.96:1). `slate-500` survives only on disabled controls (`Widget.tsx:183`) and
  on the decorative destination arrow (`Widget.tsx:241`).
- **Don't** introduce emoji or an icon font.
- **Don't** add an X. The collapse is a chevron; dismissal is a named footer
  action.
- **Don't** raise `z-index` toward the 32-bit ceiling.
- **Don't** add elevation inside the panel. Dividers and tone, not shadows.
- **Don't** apply a decorative overlay unconditionally. The edge fade is measured
  and conditional for a reason.
- **Don't** add a sparkle, a gradient, or a second animation. There is one
  authored motion moment and it is the panel arriving.

## The Three Binding Decisions, In Code

Three user decisions constrained this design. They are constraints, not
preferences, and each is enforced at a specific line.

### 1. "Unmistakably a tool" — not deferential to the host page

The panel adopts nothing from the page it sits on. Its own ground is `slate-900`
(`Widget.tsx:639`), its own ring and shadow separate it, and its root re-declares
the seven inheritable text properties a host `body` could otherwise push into the
shadow root, plus `color-scheme: dark` (`widget.css:65-72`). The reset that makes
any of this predictable is at `widget.css:22`. The one visual concession — your own
words on light — reinforces the separation rather than weakening it: light is your
data, dark is the tool.

`PRODUCT.md` states the reason: *"You should always know whether you are looking
at your own data or the employer's form — the ambiguity is the wrong property for a
panel showing a NIF."* The masking of withheld values (`Widget.tsx:149`) is the
same argument continued: *"'Never sent to Claude' answers egress; it says nothing
about the screen."*

### 2. A collapsed pill with a count; it NEVER auto-opens

- `open` initialises from `props.initialOpen ?? false` (`Widget.tsx:572`), and
  `initialOpen` is documented as existing only for the visual harness and an
  explicit "open it" action from the popup (`Widget.tsx:60-65`).
- The content script never passes it (`entrypoints/content/index.tsx:233-238`).
- When collapsed, the component returns the pill and nothing else
  (`Widget.tsx:619-633`); the label is a count of unapplied rows
  (`Widget.tsx:576`).
- The widget only mounts at all when the ledger is non-empty:
  `if (rows.length === 0) return;` before `ui.mount()`
  (`entrypoints/content/index.tsx:284-287`). Most pages get no widget.
- The root is `pointer-events: none` with only the pill or panel re-enabling it
  (`widget.css:75`, `Widget.tsx:627`, `Widget.tsx:639`), so the overlay never
  intercepts a click meant for the page.
- Focus is taken only on a genuine open, and only because the open unmounts the
  pill that had focus. `justOpened` gates it (`Widget.tsx:591-599`); a
  harness-driven or popup-driven open does not steal focus.

### 3. The worst failure to design against: "Silently filling something wrong"

Both halves are defended: *silently*, and *wrong*.

- **Nothing is written without a click.** Values reach the DOM only through
  `apply()`, called from `onFill` and `onInsertDraft`
  (`entrypoints/content/index.tsx:239-255`).
- **Every write is attributed on screen** before you click it: source key or
  derivation, and destination (`Widget.tsx:312-316`).
- **A field that already holds a value quotes it back at you**, in orange, at
  readable size (`Widget.tsx:334-338`). The flag comes from `currentValue` on the
  suggestion (`lib/match/deterministic.ts:126`). This is the single most direct
  expression of the binding decision in the whole panel: the overwrite is shown,
  not merely flagged.
- **A failed fill is never silent.** `apply()` sets a row error when the stamped
  element has gone or `fillField` refuses (`entrypoints/content/index.tsx:166-180`). The
  comment records what it fixed: *"This used to return silently … so the click did
  nothing, the row still said Fill, and nothing was said - a quiet failure on the
  exact interaction the whole design is pointed at."*
- **The panel's state never lies about the page.** Undo clears the flag on the one
  row that was actually undone, tracked by `lastAppliedRowId`
  (`entrypoints/content/index.tsx:256-268`). Clearing every row "made the panel report filled
  fields as unfilled and re-offer Fill on them - the panel's own state lying about
  the page, which is the failure this design exists to prevent."
- **Undo is scoped to one click.** `beginBatch()` runs at the start of every fill
  and every draft insert (`entrypoints/content/index.tsx:240`, `entrypoints/content/index.tsx:250`), so
  the undo stack holds exactly the last action.
- **The write is framework-safe**, or it reports failure. Values go through the
  prototype's native `value` setter and a bubbling `input` + `change`
  (`lib/fill/apply.ts:109-123`), because a plain `el.value = x` on a
  React-controlled field reverts on the next render — the classic
  autofill-does-nothing bug (`lib/fill/apply.ts:1`). Undo snapshots record
  `checked` for toggles and the whole radio group's prior selection, because a
  group is filled by clicking a *sibling* of the element that was snapshotted
  (`lib/fill/apply.ts:29-43`, `lib/fill/apply.ts:204-238`).
- **Some fields are refused outright** — password, file, and any
  `autocomplete="cc-*"` / `current-password` / `new-password`
  (`lib/fill/apply.ts:47-54`), enforced at the last point before the DOM as well
  as in the bridge.
- **No synthetic `blur`.** It "can trip validation before the user has finished,
  and it is not needed to register the value" (`lib/fill/apply.ts:118`).
- **The panel does not appear where a mistake is expensive.** `shouldRun` refuses
  non-HTTP URLs, a short conservative list of banking, payment and exchange
  domains, hostname patterns like `bank.`/`pay.`/`checkout.`/`wallet.`/`banca.`,
  and any domain the user has dismissed (`lib/policy.ts:23-76`). The list is short
  on purpose: *"a long blocklist gives the impression of safety it cannot deliver,
  and the real protection is that passwords and card fields are refused
  everywhere"* (`lib/policy.ts:15`).
- **"Never sent to Claude" is a fact about the architecture, not a promise.** The
  chip appears when the fact's egress is `never`
  (`lib/match/deterministic.ts:123`), computed from the key by a genuine
  allowlist — `SENDABLE_KEYS` plus three prefixes, with a credential-shaped-leaf
  veto (`packages/core/src/types.ts:112-153`). An earlier version allowlisted the
  `personal.*` prefix, which made `personal.phone` and `personal.email` sendable
  by accident and would have made any future `personal.<something sensitive>`
  sendable by default. Withheld values are filled by the deterministic matcher,
  which makes no model call at all (`lib/match/deterministic.ts:1-12`). The second
  layer scans the fully assembled payload and **throws** rather than redacting:
  *"a partially redacted prompt teaches nothing and may still leak"*
  (`packages/server/src/egress.ts:97-106`).

## Isolation

The panel renders in a **closed** shadow root (`entrypoints/content/index.tsx:209-215`).
Closed, not open, "so a page script cannot reach into the panel that is holding a
NIF or reading a draft". The stylesheet is injected into that root rather than the
page via WXT's `cssInjectionMode: "ui"` (`entrypoints/content/index.tsx:29-31`), "so nothing
here can restyle the host and nothing there can restyle us".

### The cascade-layer finding

Tailwind's preflight targets `html` and `body`, neither of which exists inside a
shadow root, so the panel needs its own reset. Getting that reset to lose to
Tailwind's utilities took two failures, recorded at `widget.css:3-21`:

1. `.pmd-root * { padding: 0 }` — same specificity as `.px-4` and later in the
   sheet, so it beat every padding utility and the panel rendered flat.
2. The same rules wrapped in `:where()` for zero specificity — **still won**.

The second failure is the finding: **specificity never entered into it.** Tailwind
v4 emits utilities into `@layer utilities`, and unlayered CSS outranks *any*
layered CSS regardless of specificity. So the reset lives in `@layer base`
(`widget.css:22`), a layer Tailwind orders before `utilities`, which makes a
utility always win. `:where()` is kept as well, so the reset also loses to
anything a component sets directly — belt and braces, for two different reasons.

The reset itself is deliberately minimal: `box-sizing`, margin and padding on
block elements, list-style, and `font`/`color`/`letter-spacing`/`background`/
`border`/`appearance` on form controls (`widget.css:23-51`). Form controls need it
most, because a host page's `input { border: 2px solid red }` would otherwise
reach the panel's own inputs.

### The contract in the live DOM

`onMount` prepends a DOM comment to the shadow root before the React host —
`personal-md widget · source-first ledger · seed a21341ab · your file, projected
onto someone else's form` (`entrypoints/content/index.tsx:216-224`). It makes the design
contract "auditable in the live DOM rather than only in source".

### The scan loop

`recompute()` re-scans the page, re-reads the mirror, and rebuilds the ledger
(`entrypoints/content/index.tsx:49-110`). A `MutationObserver` on `document.body` debounces at
700ms — "re-scan on a settled DOM rather than on every mutation" — and disconnects
on context invalidation (`entrypoints/content/index.tsx:289-300`). Row identity is
`kind:fieldId:sourceKey`, and previous rows are carried forward by id, so "a draft
in flight, or an applied row, must survive the page mutating underneath us"
(`entrypoints/content/index.tsx:70-107`).

## Accessibility As Built

- **`role="region"` with a translated `aria-label`** on the open panel:
  `"Your stored answers, applied to {domain}"` / `"Tus respuestas guardadas,
  aplicadas a {domain}"` (`Widget.tsx:636-638`). A region, not a dialog: the panel
  is an annotation of the page, not a modal that owns it.
- **Focus on open.** Opening unmounts the pill, "which would drop focus to the
  host page's body and lose the keyboard user's place". Focus is handed to the
  collapse control instead, and only when the open came from a real interaction
  (`Widget.tsx:591-599`).
- **A visible focus ring on everything interactive.** One shared constant,
  `ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-900`, applied to every
  button, input and textarea (`Widget.tsx:161-163`). The comment states the
  principle: *"A tool that avoids focus must still be reachable."* The offset is
  `slate-900` so the ring reads on the panel's own ground rather than halo-ing into
  the host page.
- **No focus trap.** Tab leaves the panel and continues into the host page's
  order. Escape collapses (`Widget.tsx:582-589`).
- **Measured contrast.** Text colours were checked against the `slate-900` ground.
  A footer link on `slate-500` measured **3.74:1**, below the 4.5:1 floor, and was
  moved to `slate-400` (6.96:1). `slate-500` remains on disabled controls
  (`Widget.tsx:183`), where failing contrast is the intended signal, and on the
  decorative destination arrow (`Widget.tsx:241`), which is `aria-hidden` beside an
  `sr-only` "into". Everything else clears the floor on `slate-900`:
  `emerald-300` 11.7:1, `rose-300` 9.4:1, `slate-300` 12.0:1, `amber-200` on the
  banner ground 12.3:1, `orange-100` on the caution ground 14.8:1, the caution's
  quoted value 12.3:1, and `slate-900` on the light chip 17.1:1.
- **Reduced motion.** `@media (prefers-reduced-motion: reduce)` sets
  `animation: none` on both `.pmd-enter` and `.pmd-pulse` (`widget.css:131-136`).
  The entrance keyframe has a `from` block only and runs with `both`, "so a client
  that never runs the animation still shows a properly placed panel rather than an
  invisible one" (`widget.css:103-120`). Reduced motion therefore yields a correct
  static panel, not a missing one.
- **Screen-reader-only connective text.** The destination renders the arrow icon
  visually and the word "into" / "en" in an `sr-only` span, so the relationship is
  spoken and not only drawn (`Widget.tsx:250`).
- **Icons are `aria-hidden`** from the shared base (`icons.tsx:22`); the icon-only
  collapse control carries both `aria-label` and `title` (`Widget.tsx:657-658`).

## Bilingual By Construction

The panel's language comes from the **form**, not the browser.
`detectPageLanguage(document)` runs once at mount (`entrypoints/content/index.tsx:38`) and the
result is passed down as `lang`, which indexes a single `t` table holding both
languages in full (`Widget.tsx:68-145`). There is no i18n runtime and no
fallback-to-English path: every string exists in both languages or the type does
not compile.

Detection reads `<html lang>` or the `content-language` meta first, then judges
from the page's own text (`lib/policy.ts:120-160`). The sample is deliberately
narrow — `label, legend, h1, h2, h3, p, option, button, [aria-label]` — for a
stated reason: those elements are "exactly the text whose language the answer has
to match, so they are both the cheaper and the better sample". Two rejected
alternatives are recorded: `body.innerText` is undefined in jsdom, so the code was
untestable and silently answered "en", and it forces a layout pass;
`body.textContent` swallows `<script>` bodies whose English identifiers would drag
a Spanish page toward English. A div-built form carrying no `<label>` at all falls
back to the body with scripts and styles stripped, because "an empty carrier
sample must not silently answer 'en'".

The design consequence: a Spanish government form gets a Spanish panel on an
English-locale browser. Copy is written to be short in both languages, since the
metadata line wraps at 10px and Spanish runs longer — `"Filled"` / `"Hecho"`,
`"Undo 1"` / `"Deshacer 1"`. The caution's copy is a sentence fragment in both
languages precisely so the quoted value can complete it: "This field already
holds" + `Barcelona`, "Este campo ya tiene" + `Barcelona`.

Fill-failure copy exists twice, in `Widget.tsx:104` and `entrypoints/content/index.tsx:117`,
because the same message is produced by the panel and by the content script. That
is real duplication in the build and is noted here rather than smoothed over.

## Deliberately Not In The MVP

Each of these is an absence with a reason, not a gap.

- **Whole-form one-click autofill.** There is no "Fill all". Each row has its own
  action, and each click opens its own undo batch (`entrypoints/content/index.tsx:240`). The
  product principle is *"A wrong autofill is worse than no autofill, because it
  gets submitted"*; a single button that writes fifteen fields makes the
  provenance line decorative, and would make the "already holds" caution
  unreadable at the moment it matters. A `fillAll()` exists in the browser test
  harness (`README.md:226`) and nowhere in the panel.
- **Auto-insert.** Nothing reaches the DOM without a click. A ready draft sits in
  an editor you can rewrite; inserting it is a separate action
  (`Widget.tsx:532-536`).
- **Auto-submit.** `fire()` dispatches `input` and `change` only
  (`lib/fill/apply.ts:76-84`). No `submit`, and no synthetic `blur`.
- **Auto-open.** Covered above. `initialOpen` defaults to false and the content
  script never sets it.
- **Auto-save to the file.** Inserting a draft stores nothing: *"Confirm-to-learn
  is its own step, so an inserted draft you then rewrite is not recorded as your
  answer"* (`entrypoints/content/index.tsx:252-254`).
- **Outside-click-to-close.** This one was **removed as a design defect, not
  omitted.** The reasoning is at `Widget.tsx:578-581`: *"the panel annotates the
  page it sits on, so clicking into a field or scrolling the form is working
  *with* it, and a panel that vanishes then is a popover pretending to be a
  tool."* Escape collapses; the header collapses; the footer dismisses the site.
  All three are explicit.
- **A model in the short-field path.** Stage C classification is absent from
  `deterministic.ts` by design: *"this module is the no-network path by design"*
  (`lib/match/deterministic.ts:177-179`).

## Honest Limits

- **Drafting takes about ten seconds, of which ~4.5s is CLI startup before any
  inference.** The panel does not hide this; it prints the expectation ("about ten
  seconds", `Widget.tsx:84`) and shows provenance chips before the text so the
  wait carries information. There is no way to make it faster through the CLI, and
  that is why the short-field path never calls a model at all.
- **~26k input tokens per call**, almost all of it Claude Code's own scaffolding,
  returning as a prompt-cache read at ~99.9%. A classification call costs ~$0.003
  warm; a draft costs ~$0.023 warm and ~$0.163 cold. Setting `--effort` invalidates
  the cached prefix and costs *more*. Nothing in the panel exposes cost, which is a
  deliberate omission and also means a cache regression would be invisible from the
  UI.
- **No structured-output guarantee.** Through the CLI there is no forced tool call
  and no output schema, so JSON returns in a fenced block, validated, with one
  repair retry. The panel's `error` state (`Widget.tsx:486`) is the visible end of
  that: a draft can fail to parse, and the design has to have a row state for it.
- **Masking is a screen treatment only.** `mask()` replaces all but the last two
  characters (`Widget.tsx:156-159`) and defends against shoulder-surfing and screen
  sharing — nothing more. The unmasked value is in the content script's memory
  whether or not it is shown, and it enters the shadow DOM the moment "Show" is
  clicked. What keeps page script out is the *closed* shadow root
  (`entrypoints/content/index.tsx:214`), not the mask. Egress and screen privacy are two
  separate guarantees and only the first is architectural.
- **Escape is captured while the panel is open.** The keydown listener is on
  `document` with `capture: true` (`Widget.tsx:587`), so an Escape meant for the
  host page's own dialog collapses the panel instead while it is open. Explicit,
  scoped to the open state, and still a change to host behaviour.
- **Spacing and radii are rem-based; type is not.** Type sizes are px
  (`text-[13px]`), but `px-4`, `gap-3`, `rounded-lg` and `calc(100vw-2rem)` all
  resolve against the *host document's* root font size, which the shadow root does
  not isolate. On a page with `html { font-size: 12px }` the panel's padding and
  width shrink while its text does not. The code records no decision about this; it
  is named here as a limit, not a rule.
- **One string is duplicated across two files** (fill-failure copy,
  `Widget.tsx:104` and `entrypoints/content/index.tsx:117`).
- **The panel is not responsive below its own minimum.** Width is
  `min(380px, calc(100vw - 2rem))`, so on a 320px viewport the panel is 288px wide
  and the two-column row compresses. There is no separate narrow layout. The
  wrap-never-truncate rule is what keeps that survivable.
- **The empty state's two lines disagree slightly.** The heading says "Nothing in
  your file yet."; the help line says the server answered but the profile came back
  empty and suggests checking the path. The first reads as an expected state, the
  second as a misconfiguration. Both are plausible causes of an empty ledger and
  the panel cannot tell them apart, but the copy does not say so.

---

*Recorded from the built extension: 523 kB packed, 247 offline tests passing.*
