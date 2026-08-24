---
version: 1
slug: "entrypoints-options-app-tsx"
primary_target: "entrypoints/options/App.tsx"
related_targets: ["entrypoints/popup/App.tsx","components/document"]
---

# Surface: the document (options page + popup)

**Scope.** The extension's options page, which opens in its own tab, plus the
browser-action popup that shares its stylesheet. Not the in-page widget.

**Visitor mode.** Operate. The visitor is here to seed their own file, and
nothing downstream in the product works until they have. The issuance page at
the end of the rail is the one Experience moment on the surface, and it is a
destination rather than a gate.

**Audience.** As of this build, no longer one person. The user confirmed the
product is going to more people in the near future, so the surface has to
explain itself to somebody arriving cold, in Spanish or in English, who has
never heard of a `PERSONAL.md`. That is what the cover is for.

**Job.** Get facts and answers onto disk with the least ceremony, and make the
file feel worth owning by the end. Two rules survive from the interview this
replaced, because they were right: nothing is required, and every page records
on its own, so closing the tab halfway through loses nothing.

**Action.** Record a folio. There is no submit, no wizard, no final step that
commits everything — twelve folios, each with its own button, each stamped when
written.

**Proof / content.** All of it is the user's own. Nothing on this surface is
authored copy pretending to be their data: the scope note is assembled clause by
clause from facts they typed and drops the clause when the fact is absent, the
guilloché is generated from their name, and the machine-readable line encodes
only what the page currently holds. There is no model call anywhere on this
surface.

**Constraints.**
- Chrome MV3 page under a CSP with no remote origin. Fonts are bundled, not
  fetched; nothing here may depend on the network.
- Bilingual by construction. Field legends print Spanish over English on every
  page, which is what the ICAO form gives for free and what `interview.ts` has
  stored as `{en, es}` pairs since before this redesign. The language toggle now
  chooses only which language the user's own prose is written in.
- It must not resemble a real travel document closely enough to be useful as a
  template for one. No country, no nationality, no crest, no ISO 3166 code; the
  authority is `OWN` and the document code is `PM`.
- Works with the companion process stopped. Only drafting needs it, and the
  bureau page says so in those terms.

**Chosen direction.** A machine-readable personal document. User-pinned over
concept roll `9d81b265`, whose assigned candidate was an archival finding aid.
The world is recorded in DESIGN.md; the direction contract is the first child of
`<body>` in `entrypoints/options/index.html`.

**The memorable moment.** The machine-readable zone. Forty-four characters at
the base of folio 01, every unwritten field a `<`, with real ICAO 9303 check
digits over what the page holds right now. It fills as you type, it is the only
completeness indicator on the surface, and there is no progress bar anywhere.
The issuance sequence's climax is the same line printing itself left to right.

**Unresolved.**
- The in-page widget still wears the old slate palette. It is the third surface
  and it has not been migrated; its behavioural rules were written to be
  palette-independent, so this is a re-skin rather than a redesign, but it is
  outstanding and the two surfaces currently disagree.
- `PRODUCT.md`'s Brand Commitments section still describes the retired
  options-page world ("Tailwind's slate neutrals, white cards on a plain
  ground"). It is now false for this surface.
- The LinkedIn import route exists in the server and is reachable from no
  surface. It is the largest single accelerator this onboarding could have — one
  click turns typing into correcting — and the document has an obvious place for
  it, as a page that arrives pre-filled and asks to be confirmed.
- The issuance sequence spends none of the form's remaining native devices:
  laminate diffraction, a perforated document number through the folios, an
  offset second impression on the endorsement. Logged as ceiling, not defect.
