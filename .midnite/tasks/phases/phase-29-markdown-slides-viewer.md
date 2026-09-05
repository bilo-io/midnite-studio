# Phase 29 — Markdown slides, everywhere markdown already renders

**Refined: x1** · 2026-09-05 · file-map precision, testing & verification, out-of-scope tightening

The app rendered markdown in three places when this phase was written — [`markdown-preview.tsx`](../../../packages/app/src/features/files/preview/markdown-preview.tsx)
(Files preview, Phase 16), and [`pr-detail.tsx`](../../../packages/app/src/features/reviews/pr-detail.tsx) /
[`comment-thread.tsx`](../../../packages/app/src/features/reviews/comment-thread.tsx) (Reviews, Phase 20) —
all three the same `react-markdown` + `remark-gfm` pattern, and none of them offering anything beyond
a scrolling `.prose` block. This phase gives all three a second way to read: a fullscreen,
heading-paginated slide deck, one press away, ported from the sibling `midnite` app's presentation
feature rather than built from scratch.

*Refine note (2026-09-05): there are **nine** `react-markdown` render sites in `packages/app/src`
now, not three. Themes A–E landed against the original three; the six that arrived later are
Theme F below, which is what keeps the phase's own title ("everywhere markdown already renders")
true rather than aspirational. Shared markdown helpers also moved into
`packages/app/src/features/markdown/` (`external-link.tsx`, `prose.ts`'s `MARKDOWN_PROSE_CLASSES`)
after this doc was written — a new surface takes its prose classes from there, not from a copy.*

Crib: `~/Dev/midnite/packages/web/lib/slides/markdown.ts` (`markdownToDeck` — a headings-only
tokenizer: an h1 becomes a cover/title slide, every h2–h6 starts a new slide, and the prose/list/
code/table content under a heading becomes an ordered list of reveal "steps"; it does **not** split
on `---`) and `~/Dev/midnite/packages/web/components/slides/deck.tsx` (397 LOC — the typewriter
reveal, the step-by-step bullet reveal, the keyboard set, the `?` help overlay, native Fullscreen).
The CRUD half of that subsystem — `deck-editor.tsx`, `deck-source-editor.tsx`, `deck-card.tsx`,
`lib/slides/store.ts` and its localStorage-backed deck list — is **not** cribbed: this app already
has the markdown in hand (a file on disk, a PR description, a comment body) and needs no separate
authoring surface, deck list, or persistence layer to view it as slides.

**Builds on.** Phase 16 (`file-preview.tsx`'s extension-based dispatch and `markdown-preview.tsx` —
the surface this phase adds a button to, not replaces), Phase 20 (`pr-detail.tsx` and
`comment-thread.tsx`, the two Reviews surfaces that already render markdown), Phase 23 Theme B
(`useCommandHandlers()`'s reactive `{enabled, disabledReason}` shape, already used for `sync.fetch`,
`commit.focus` and others — Theme E's new command follows it rather than inventing a second
convention), and the existing `z-dialog` fixed-overlay convention already shared by
[`confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx),
[`prompt-dialog.tsx`](../../../packages/app/src/components/prompt-dialog.tsx) and
[`merge-dialog.tsx`](../../../packages/app/src/features/reviews/merge-dialog.tsx).

**Scope guardrails.** **A viewer, not an editor.** No CRUD, no deck list, no localStorage
persistence — closing the modal forgets the deck; reopening the same file rebuilds it from source,
every time. **No new highlighting library.** Code fences inside a slide render through the shiki
instance [`code-preview.tsx`](../../../packages/app/src/features/files/preview/code-preview.tsx) already
owns, not midnite's `highlight.js` — this app has shiki everywhere else a code block appears, and a
second highlighter would only disagree with it cosmetically. **The modal never leaves the Electron
window.** A frameless custom title bar (Phase 3) makes the OS Fullscreen API a real risk to the
traffic-light controls; an in-app `z-dialog` overlay sidesteps that entirely and costs nothing midnite
didn't already have to build for the browser tab chrome it was itself hiding from. **Present always
shows.** Even a one-line comment gets the button — a one-slide deck is a valid deck, not an error
state to special-case around.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The deck engine (M) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

Pure, DOM-free and testable, in a new `features/slides/` directory. Everything else renders off its
output, so it lands first.

- [x] `packages/app/src/features/slides/deck-parser.ts`: a headings-only tokenizer/parser ported from
      midnite's `markdownToDeck` — an h1 becomes a cover/title slide, every h2–h6 starts a new slide,
      and paragraphs/list items/code fences/GFM tables under a heading become an ordered array of
      "steps". No `---` splitting, matching the crib exactly.
      *As built:* the export is `parseDeck(markdown: string): Deck` — the doc's original wording
      never named it, and [Phase 48](phase-48-apply-suggested-changes.md) now reuses this same
      mdast walk, so the name is load-bearing outside this phase.
- [x] `DeckSlide` / `DeckStep` types exported alongside the parser. No zod schema — this never
      crosses the IPC boundary, it is renderer-only data derived from a string the caller already
      has.
      *As built:* three types, not two — `type DeckStep = { markdown: string }`,
      `type DeckSlide = { title: string; steps: DeckStep[]; cover?: boolean }`, and the top-level
      `type Deck = { title: string; slides: DeckSlide[] }` that `parseDeck` actually returns.
- [x] Each step's inline formatting (bold/italic/code/links) is a raw markdown fragment rendered
      through the app's existing `react-markdown` + `remark-gfm` pipeline per step, **not** midnite's
      hand-rolled `formatInline`/`dangerouslySetInnerHTML` — the app already depends on both and
      `markdown-preview.tsx` proves the pattern works.
- [x] A doc with no headings at all parses to a single slide holding the whole content — the
      substrate for the "present always shows" guardrail.
- [x] Vitest in `deck-parser.test.ts`: h1-only doc → one cover slide; three h2s → three slides;
      nested h3–h6 all start new slides too (not just h2); a heading-less doc → one slide; GFM tables
      and code fences under a heading land as steps in source order.

### B — The deck presenter (L) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] `packages/app/src/features/slides/deck.tsx`: renders one `DeckSlide` at a time — a typewriter
      reveal for the title, then a step-by-step bullet reveal for its steps, a rebuild of midnite's
      reveal-state machine operating over React-rendered markdown fragments rather than `innerHTML`
      slicing (there is no `sliceHtml`/`visibleLen` equivalent needed once steps are real React
      nodes, not strings being typed out character-by-character — confirm this simplification holds
      once built, since it is the one real fidelity gap against the crib; see Decisions below).
- [x] Keyboard: arrows/space/enter advance a step then a slide; Backspace/PageUp reverses; Home/End
      jump to the first/last slide; `?` toggles a help overlay listing every shortcut; `Escape`
      closes the modal (not the OS Fullscreen API — see the scope guardrail).
- [x] A slide-position rail (dots or an "N / total" readout), the visual half of midnite's
      `deck-rail.tsx` — no drag-reorder, since nothing here is being authored.
- [x] `packages/app/src/features/slides/help-overlay.tsx`: the `?`-triggered shortcut list, styled to
      the app's own overlay conventions rather than midnite's.
- [x] Code fences inside a slide render through shiki (matching `code-preview.tsx`'s highlighter
      instance), confirmed in Theme A but re-verified here against real multi-line fences at
      presentation size.
      *As built:* this is its own component, `features/slides/slide-code.tsx`, which reads the
      fence language off react-markdown's `language-(\w+)` class.
      [Phase 64](phase-64-offline-monaco-and-themes.md) Themes B/G list `slide-code.tsx:44` as one
      of the Shiki-pinned surfaces it re-themes — **do not re-pin a theme here**, that phase owns it.

*As built, Theme B is four files, not two.* The presenter split into
[`deck.tsx`](../../../packages/app/src/features/slides/deck.tsx) (the frame),
[`use-deck-nav.ts`](../../../packages/app/src/features/slides/use-deck-nav.ts) (the slide/step
reducer plus the `instant` flag), [`use-title-typewriter.ts`](../../../packages/app/src/features/slides/use-title-typewriter.ts)
(the reveal timing) and [`slide-code.tsx`](../../../packages/app/src/features/slides/slide-code.tsx).
Both hooks carry their own vitest file; the split is what let the two reveal bugs recorded in the
decisions below be pinned to a reducer case rather than to the whole presenter.

### C — The fullscreen host (S) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] `packages/app/src/features/slides/slides-store.ts`: a small Zustand store —
      `deck: { content: string; label?: string } | null` (the currently open deck; `null` is closed)
      and `activeMarkdown: { content: string; label?: string } | null` (whichever markdown surface is
      currently in view, kept live by Theme D). `present(source)` opens the deck directly from a
      source (a button click); `presentActive()` opens it from `activeMarkdown` (used when there was
      no click to hand content directly — Theme E); `close()`.
      *As built:* a fourth action, `setActiveMarkdown(source: MarkdownSource | null)`, is what the
      surfaces actually call — `present`/`presentActive`/`close`/`setActiveMarkdown`. The source
      shape is the exported `type MarkdownSource = { content: string; label?: string }`, which
      `PresentButton` takes as its one prop. The store is **not** persisted, per the guardrail.
- [x] `packages/app/src/features/slides/slides-modal.tsx`: the `fixed inset-0 z-dialog` convention
      already shared by `confirm-dialog.tsx` / `prompt-dialog.tsx` / `merge-dialog.tsx`, mounted once
      from [`app.tsx`](../../../packages/app/src/app.tsx) beside the existing `<DialogHost>` — reads `deck`
      off the store and renders nothing while it is `null`.
      *As built, and changed by later phases — do not "restore" any of this:* the mount sits
      **outside** `</DialogHost>`, wrapped `<ErrorBoundary label="Slides" silent>` →
      `<Suspense fallback={null}>` → `<SlidesModal />`, and the component is `lazy()`-loaded
      ([Phase 36](phase-36-performance-diet.md)'s entry-chunk diet). It registers an **occluder** so the
      browser pane's `WebContentsView` hides behind it, asserted by case 6 of
      [`components/occluder-coverage.test.tsx`](../../../packages/app/src/components/occluder-coverage.test.tsx).
      [Phase 58](phase-58-notes-and-the-menu.md) Decision 5 deliberately did **not** migrate it onto
      the new `Modal` primitive (it is opaque `bg-background`, not a backdrop dialog), and
      [Phase 68](phase-68-where-focus-goes.md) lists it as already-correct for focus return.
- [x] Reuses the existing [`use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts)
      (already extracted, already used by `popover.tsx`) rather than a fourth hand-rolled trap.
- [x] Deliberately **not** folded into `DialogHost`'s own API — that host's whole point is "only one
      of confirm/prompt/menu open at a time," and a fullscreen deck is a different shape than any of
      the three it already arbitrates between.

### D — Wired into every markdown surface (M) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] `markdown-preview.tsx` / `file-preview.tsx`: a "Present" icon button in the shared preview
      header, beside the existing show-source toggle, calling
      `present({ content: rawMarkdown, label: fileName })`. A mount-time effect also sets
      `activeMarkdown` so Theme E's command works without a click.
      *As built, and the split matters:* the **button** lives in
      [`file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx) (the
      header owner), the **`activeMarkdown` claim** lives in
      [`markdown-preview.tsx`](../../../packages/app/src/features/files/preview/markdown-preview.tsx)
      (a `useEffect` keyed on `[content, label]`, cleared on unmount, and a no-op when `label` is
      `undefined` — so a caller with no filename never claims the slot). Do not move either half:
      the header is the only place with a toolbar, and the claim has to follow the *rendered*
      markdown, which disappears when `showSource` is on.
- [x] `pr-detail.tsx`: the same button beside the PR/review description body, with the same
      `activeMarkdown` effect.
- [x] `comment-thread.tsx`: the same button per comment/reply — always shown, per the "present always
      shows" guardrail — but does **not** claim `activeMarkdown`. A thread can hold many short
      markdown bodies visible at once; only the two description-level surfaces are unambiguous
      enough to be "the" markdown a keyboard-invoked command should target. Recorded as a resolved
      decision below.
- [x] Icon: a `react-icons/lu` glyph (`LuPresentation`, or the nearest actual match in the set) via
      the existing `IconComponent` / `IconButton` primitives
      ([`icon-button.tsx`](../../../packages/app/src/components/icon-button.tsx)), per the repo's icon
      convention.
      *As built:* the three call sites do **not** each import `LuPresentation` — a single shared
      [`present-button.tsx`](../../../packages/app/src/features/slides/present-button.tsx) exports
      `PresentButton({ source, className }: { source: MarkdownSource; className?: string })` and
      owns the glyph, the `label="Present as slides"` tooltip copy and the `present()` call. A new
      surface (Theme F) renders `<PresentButton source={…} />` and adds no icon import of its own.
      Note the **palette** entry uses a different glyph — `LuSparkles`, in
      [`features/palette/command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts)
      — because `LuPresentation` reads as a chart in a 16px palette row.

*Themes A–D have landed (2026-08-28) — the viewer is feature-complete end to end: Present opens a
fullscreen deck from Files preview, a PR/review description, or a comment body, with the full
typewriter/keyboard/help-overlay presentation and shiki-highlighted code fences. Theme E below adds
the unbound `CommandId` registry entry, which has no user-visible effect until Phase 23's palette
exists to read it.*

### E — Command registry entry (S) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] A new `CommandId` (`markdown.presentAsSlides`, a label, a palette `group`) added to `COMMANDS`
      in [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — no chord bound.
      Phase 23's palette UI is not built yet, and every obvious free chord is already scarce; this is
      a registry entry waiting for a surface, the same position `repo.open`/`repo.close` were in
      before Phase 23 Theme B gave them handlers. Grouped under `'view'` (surface-agnostic display
      toggles), not `'files'` — the command fires from Reviews descriptions too, not just Files.
      *As built, and the surface has since arrived:* the entry is exactly
      `{ id: 'markdown.presentAsSlides', label: 'Present as Slides', group: 'view' }` with **no**
      `chord` key. [Phase 23](phase-23-command-palette.md)'s palette shipped after this doc was
      written and already consumes it — the command has a glyph in
      `features/palette/command-icons.ts` and an entry in `features/palette/safety.ts` marking it
      safe to run straight from the palette. Leaving it chord-free is still the right call and is
      now a *decision*, not a placeholder: see the resolution at the foot of this doc.
- [x] A `useCommandHandlers()` arm reading `useSlidesStore().activeMarkdown`, following the exact
      reactive shape every other conditional command already uses: enabled with a `run` calling
      `presentActive()` when `activeMarkdown` is set, `{ enabled: false, disabledReason: 'No
      markdown in view' }` otherwise.
- [x] A test on the handler arm: toggling `activeMarkdown` flips `enabled`, and `run()` calls
      `presentActive()` rather than re-deriving or re-fetching content itself — asserted with a spy
      on `presentActive` directly, in `use-command-handlers.test.ts` beside the other command arms.

*Themes A–E landed 2026-08-28. The viewer works end to end from the three surfaces that existed
then, `deck-parser.test.ts` / `use-deck-nav.test.ts` / `use-title-typewriter.test.ts` /
`help-overlay.test.tsx` / `e2e/slides.spec.ts` / `e2e/slides-shots.spec.ts` are all written, and
`docs/screenshots/phase-29-slides/` holds all six images. What is left is Theme F — the six
markdown surfaces that arrived **after** this phase and still have no Present button — and Theme G,
the one honest verification gap.*

### F — The surfaces that arrived later (S)

Six of the nine `react-markdown` render sites in `packages/app/src` have no Present button, because
they did not exist on 2026-08-28. The phase's title claims "everywhere markdown already renders";
this theme is what makes that sentence true again. It is renderer-only, adds no dependency, no
channel and no store field — every item is one `<PresentButton source={…} />` plus, for the two
description-level surfaces, one `setActiveMarkdown` effect.

**The rule for which surfaces claim `activeMarkdown`** (unchanged from Theme D, applied to the new
six): a surface claims the slot **iff** it renders exactly one *document-level* body at a time.
Description-level → claims. Conversation/comment list → button only, never claims. This is the
existing `pr-detail.tsx` vs `comment-thread.tsx` split, extended by symmetry rather than re-argued.

- [ ] [`features/issues/issue-detail.tsx`](../../../packages/app/src/features/issues/issue-detail.tsx):
      a `<PresentButton source={{ content: issue.body, label: \`Issue #${issue.number}\` }} />` in
      the same header row `pr-detail.tsx:286` uses, **and** the `setActiveMarkdown` effect — this is
      a description-level surface, so it claims the slot. Guard the effect the way
      `markdown-preview.tsx` does: skip when the body is empty/`undefined`, clear on unmount.
- [ ] [`features/reviews/pr-conversation.tsx`](../../../packages/app/src/features/reviews/pr-conversation.tsx):
      a `<PresentButton source={{ content: comment.body, label: 'Comment' }} className="ml-auto" />`
      per rendered comment, matching `comment-thread.tsx:273` exactly. **Does not** claim
      `activeMarkdown` — it is a list of bodies.
- [ ] [`features/issues/issue-conversation.tsx`](../../../packages/app/src/features/issues/issue-conversation.tsx):
      the same per-comment button, same reason, same non-claim.
- [ ] [`features/version/version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx):
      a `<PresentButton source={{ content: notes, label: \`Release ${version}\` }} />` beside the
      panel heading, **and** the claim effect — release notes are a single document body, and they
      are the one surface in the app a human would plausibly actually present.
- [ ] **`features/commit/commit-message.tsx` gets nothing** — it stays out, for the reason already
      in *Not in this phase*: it renders a commit body with trailer styling and SHA/issue
      linkification, not a document. Re-stated here as an item so an executor doing this theme does
      not "finish the set" by adding a seventh.
- [ ] All four new call sites take `MARKDOWN_PROSE_CLASSES` from
      [`features/markdown/prose.ts`](../../../packages/app/src/features/markdown/prose.ts) — they
      already do; this item is a check that the theme did not introduce a copy.
- [ ] Bundle guard: `e2e/perf/bundle-budget.spec.ts` already tracks `react-markdown` as its own
      chunk and [Phase 36](phase-36-performance-diet.md) Theme C pulled it out of the entry chunk.
      `PresentButton` imports `slides-store` (tiny) and `IconButton`, **not** `deck.tsx` — the
      presenter stays behind `app.tsx`'s `lazy()` boundary. Adding four buttons must not move the
      budget; if the spec's numbers shift, the import graph is wrong, not the budget.
- [ ] One Playwright case per claiming surface in `e2e/slides.spec.ts` (Issue detail, release
      notes): Present opens a deck whose cover title matches the body's h1; and one asserting a
      conversation comment's button opens a deck **without** changing what
      `markdown.presentAsSlides` targets.

### G — Verification: run what is already written (S)

Every artifact the original Verification list asks for **exists**. Nothing here writes a new suite;
this theme runs them, records the result, and closes the two real gaps.

- [ ] Run `moon run :typecheck :lint :test` and record it green. This is the phase's only
      outstanding blanket gate.
- [ ] Run the two slides specs against the current tree — `packages/app/e2e/slides.spec.ts` (4
      cases) and `packages/app/e2e/slides-shots.spec.ts` (6 cases). Neither is in
      `playwright.ci.config.ts`'s `KNOWN_RED` list (which holds exactly one entry,
      `**/e2e/graph-themes.spec.ts`) and neither carries a `@linux-red` tag, so both are already
      **blocking** in CI: a red here is a regression, not a known gap.
- [ ] Confirm the six committed images in `docs/screenshots/phase-29-slides/` still match what the
      app renders — they predate [Phase 64](phase-64-offline-monaco-and-themes.md)'s theme registry,
      which re-themes `slide-code.tsx`'s Shiki pin, so the `mid-presentation-*.png` pair is the one
      most likely to have drifted. If they have, regenerate via `slides-shots.spec.ts` rather than
      by hand.
- [ ] **The real gap:** `deck-parser.test.ts` has no case for a **fenced code block containing a
      markdown heading** (` ```md ` with a `## …` line in it). The parser walks mdast, so a heading
      inside a `code` node is not a `heading` node and cannot start a slide — but nothing asserts
      that today, and it is the one input that would silently shred a deck built from this repo's
      own phase docs. Add it as a ninth case.
- [ ] **The second real gap:** nothing asserts that `presentActive()` is a no-op when
      `activeMarkdown` is `null`. `use-command-handlers.test.ts` covers the *command* being
      disabled, but the store action itself is callable. Add one case to a new
      `features/slides/slides-store.test.ts` — `present`/`presentActive`/`close`/`setActiveMarkdown`
      round-trip, and `presentActive()` with an empty slot leaves `deck` `null`.
- [ ] **Open, for a human:** present one of this repo's own largest phase docs as a stress test —
      slide count, and whether a single slide's content can ever overflow the viewport. This is the
      item the original Verification list carried; it stays human because "does it read well" is not
      an assertion.

## Files this phase touches

Reconciled against the tree on 2026-09-05. Themes A–E are recorded here **as built**, not as
originally planned — four of the files below are ones the first draft never named.

| Area | Files |
|------|-------|
| Contract | `CommandId`/`COMMANDS` only in [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — no IPC channel, no zod schema, no domain type. `packages/git-engine` and `packages/desktop` are untouched by every theme, F and G included. |
| Main | **None.** |
| Renderer — new (A–E, landed) | [`features/slides/deck-parser.ts`](../../../packages/app/src/features/slides/deck-parser.ts) · [`deck.tsx`](../../../packages/app/src/features/slides/deck.tsx) · [`use-deck-nav.ts`](../../../packages/app/src/features/slides/use-deck-nav.ts) **(unplanned)** · [`use-title-typewriter.ts`](../../../packages/app/src/features/slides/use-title-typewriter.ts) **(unplanned)** · [`slide-code.tsx`](../../../packages/app/src/features/slides/slide-code.tsx) **(unplanned)** · [`present-button.tsx`](../../../packages/app/src/features/slides/present-button.tsx) **(unplanned)** · [`help-overlay.tsx`](../../../packages/app/src/features/slides/help-overlay.tsx) · [`slides-store.ts`](../../../packages/app/src/features/slides/slides-store.ts) · [`slides-modal.tsx`](../../../packages/app/src/features/slides/slides-modal.tsx) |
| Renderer — wiring (A–E, landed) | [`features/files/preview/markdown-preview.tsx`](../../../packages/app/src/features/files/preview/markdown-preview.tsx) (claims `activeMarkdown`; **no button**), [`features/files/preview/file-preview.tsx`](../../../packages/app/src/features/files/preview/file-preview.tsx) (the button, `:208`), [`features/reviews/pr-detail.tsx`](../../../packages/app/src/features/reviews/pr-detail.tsx) (both), [`features/reviews/comment-thread.tsx`](../../../packages/app/src/features/reviews/comment-thread.tsx) (button only), [`app.tsx`](../../../packages/app/src/app.tsx) (`lazy()` + `ErrorBoundary` + `Suspense`, `:1606-1608`, **outside** `DialogHost`) |
| Renderer — Theme F (net-new wiring) | [`features/issues/issue-detail.tsx`](../../../packages/app/src/features/issues/issue-detail.tsx) (button + claim) · [`features/version/version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx) (button + claim) · [`features/reviews/pr-conversation.tsx`](../../../packages/app/src/features/reviews/pr-conversation.tsx) (button only) · [`features/issues/issue-conversation.tsx`](../../../packages/app/src/features/issues/issue-conversation.tsx) (button only) |
| Renderer — keybindings | [`services/keybindings/use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts) (`:318-320`), and — arrived with Phase 23, **do not re-add** — [`features/palette/command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts), [`features/palette/safety.ts`](../../../packages/app/src/features/palette/safety.ts) |
| Shared primitives (read, **unchanged**) | [`components/icon-button.tsx`](../../../packages/app/src/components/icon-button.tsx), [`components/use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts), [`features/markdown/prose.ts`](../../../packages/app/src/features/markdown/prose.ts), [`features/markdown/external-link.tsx`](../../../packages/app/src/features/markdown/external-link.tsx) |
| Deliberately unchanged | [`features/commit/commit-message.tsx`](../../../packages/app/src/features/commit/commit-message.tsx) — a ninth `react-markdown` site that stays button-free (Theme F, last item) · `slide-code.tsx`'s Shiki pin — owned by [Phase 64](phase-64-offline-monaco-and-themes.md) Themes B/G · `slides-modal.tsx`'s overlay shape — [Phase 58](phase-58-notes-and-the-menu.md) Decision 5 kept it off the `Modal` primitive |
| Tests (written, A–E) | [`features/slides/deck-parser.test.ts`](../../../packages/app/src/features/slides/deck-parser.test.ts) (8 cases) · [`use-deck-nav.test.ts`](../../../packages/app/src/features/slides/use-deck-nav.test.ts) · [`use-title-typewriter.test.ts`](../../../packages/app/src/features/slides/use-title-typewriter.test.ts) · [`help-overlay.test.tsx`](../../../packages/app/src/features/slides/help-overlay.test.tsx) · a `use-command-handlers.test.ts` arm (2 cases, `:304`) · [`components/occluder-coverage.test.tsx`](../../../packages/app/src/components/occluder-coverage.test.tsx) case 6 · [`e2e/slides.spec.ts`](../../../packages/app/e2e/slides.spec.ts) (4) · [`e2e/slides-shots.spec.ts`](../../../packages/app/e2e/slides-shots.spec.ts) (6) |
| Tests (net-new, F/G) | `features/slides/slides-store.test.ts` (**net-new**, Theme G) · two cases appended to `deck-parser.test.ts` and `e2e/slides.spec.ts` |
| Screenshots | `docs/screenshots/phase-29-slides/{trigger,mid-presentation,help-overlay}-{light,dark}.png` — all six committed, generated by `slides-shots.spec.ts` |
| Docs | [`.midnite/tasks/outstanding.md`](../outstanding.md) if anything gets deferred out mid-build |

## Verification

Assertion-level. Items marked *(written)* have their spec on disk already — Theme G runs them; it
does not write them again.

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean — trivially, only `packages/app` and one `CommandId` entry in
      `packages/shared` are touched; `git-engine` and `desktop` are untouched.
- [ ] *(written — `deck-parser.test.ts`, 8 cases)* `parseDeck` over: h1-only → one cover slide;
      h1 + three h2s → cover plus three; nested h3–h6 each start a slide; heading-less → one slide
      holding everything; a list → one step **per item**; GFM tables and fences as steps in source
      order; content before the first heading dropped; a numbered heading cleaned, but a cover
      heading not.
- [ ] **Net-new (G):** a fenced block whose *contents* contain `## …` produces **one** `code` step,
      not a new slide — mdast makes this true, and nothing asserts it.
- [ ] *(written — `use-deck-nav.test.ts`)* `next` on the last step of a slide advances the slide and
      sets `instant`; `next` on a mid-slide step advances the step and leaves `instant` **untouched**
      (the regression recorded in the decisions below).
- [ ] *(written — `use-title-typewriter.test.ts`)* `done` is `false` on the first render, before any
      effect has run — a keydown landing in that gap must not read a mid-type title as finished.
- [ ] *(written — `help-overlay.test.tsx`, `occluder-coverage.test.tsx` case 6)* the overlay renders
      its shortcut list; `SlidesModal` registers exactly one occluder while open and zero after
      unmount.
- [ ] *(written — `use-command-handlers.test.ts:304`)* `markdown.presentAsSlides` is
      `{enabled:false, disabledReason:'No markdown in view'}` with an empty slot, and `run()`
      delegates to `presentActive()` rather than re-deriving content.
- [ ] **Net-new (G):** `presentActive()` with `activeMarkdown === null` leaves `deck` at `null` —
      the store action's own guard, not just the command's.
- [ ] *(written — `e2e/slides.spec.ts`, 4 cases)* Present from Files gives a cover slide, a step
      reveal and slide navigation; `?` toggles the help overlay without closing the deck; `Escape`
      closes the deck and returns focus to the file preview; Present from a PR description opens the
      same deck.
- [ ] **Net-new (F):** Present from an Issue detail and from the release-notes panel each open a
      deck whose cover title is the body's h1; a conversation comment's button opens a deck but
      leaves `markdown.presentAsSlides`'s target unchanged.
- [ ] *(written — `e2e/slides-shots.spec.ts`, 6 cases → `docs/screenshots/phase-29-slides/`)* the
      Files-preview trigger, a mid-presentation slide with a highlighted code fence, and the help
      overlay, in both themes. Theme G re-checks these against the current tree rather than assuming
      the committed PNGs still match.
- [ ] Both slides specs stay **out** of `playwright.ci.config.ts`'s `KNOWN_RED` list and carry no
      `@linux-red` tag — they are blocking in CI today and Theme F must not change that.
- [ ] **Open, for a human:** present one of this repo's own largest phase docs (e.g.
      [`phase-22-stash-and-safety-net.md`](phase-22-stash-and-safety-net.md), the largest in the
      repo) as a stress test for slide count and for whether a single slide's content can ever
      overflow the viewport.

## Not in this phase

- **Deck authoring, editing, a decks list, or any persistence.** This is a read-only viewer over
  markdown a surface already has; midnite's CRUD/store subsystem is not being ported.
- **The OS-level Fullscreen API.** An in-app `z-dialog` modal instead, given the frameless custom
  title bar — stated as a guardrail above and repeated here because it is the one midnite behavior
  most tempting to copy verbatim.
- **A bound keybinding/chord for the new command.** Theme E registers the `CommandId` only. Phase 23's
  palette has since shipped and already reaches it by name, which was the whole point; a chord stays
  out because the command is only ever useful on one of nine surfaces and every free two-key chord is
  worth more to something global.
- **Re-theming `slide-code.tsx`.** Its Shiki pin belongs to
  [Phase 64](phase-64-offline-monaco-and-themes.md) Themes B/G, which is mid-flight on the
  cross-surface theme registry. Touching it here would collide.
- **Migrating `slides-modal.tsx` onto the `Modal` primitive.**
  [Phase 58](phase-58-notes-and-the-menu.md) Decision 5 deliberately left it out — the deck is an
  opaque `bg-background` surface, not a backdrop dialog, and `Modal`'s backdrop/sizing contract buys
  it nothing.
- **A Present button on `commit-message.tsx`.** Named as an explicit item in Theme F so nobody
  "completes the set" — see the bullet below.
- **Speaker notes, per-slide backgrounds, or any authoring-time metadata.** Midnite's deck had none
  of these either — there is nothing to port.
- **Commit-message body markdown.** `commit-message.tsx`/`linked-text.tsx` do SHA/issue/URL
  linkification, not full markdown rendering, and carry their own trailer-styling concerns — a
  different enough surface to leave alone.
- **Non-macOS shapes.** Verified on darwin like every phase before it.

## Decisions / open questions

- **Resolved — all three surfaces get the action.** Files preview, PR/Review descriptions, and
  individual comment threads all get the "Present" button, matching "anywhere you see
  pretty-printed markdown."
- **Resolved — in-app modal, not OS Fullscreen.** The frameless custom title bar makes true
  `requestFullscreen()` a real risk to window chrome; the existing `z-dialog` overlay convention
  already solves "cover everything" without it.
- **Resolved — full presentation fidelity.** Typewriter reveal, step-by-step bullets, the full
  keyboard set, and the help overlay are all in scope, not a bare static paginator.
- **Resolved — shiki for code fences, not `highlight.js`.** No new dependency; consistent with
  every other highlighted surface in the app.
- **Resolved — the action always shows, even for heading-less content.** A one-line comment still
  gets a one-slide deck rather than a hidden/disabled button.
- **Resolved — a command-registry entry lands now, unbound.** `markdown.presentAsSlides` exists in
  `COMMANDS` so Phase 23's palette has a real consumer the day it ships, but no chord is claimed
  this phase.
- **Resolved — comment threads don't compete for `activeMarkdown`.** Only the two description-level
  surfaces (Files preview, PR description) set the "currently active" markdown a keyboard-invoked
  command targets; a comment thread's button always works by click, but never claims the global
  slot. *Rationale:* a PR can show dozens of comment bodies at once, and none of them is
  unambiguously "the" markdown a bodiless command invocation should mean.
- **Resolved — the literal character-by-character typewriter is ported for the title only.**
  `use-title-typewriter.ts` rebuilds the crib's `sliceHtml`/`visibleLen` timing (not the string
  slicing itself — the title is plain text throughout) with a lazily-initialized `typed`/`done`
  pair rather than a `useState(true)` default corrected a tick later by the first effect: a keydown
  landing in that gap used to read a title that was visually mid-type as already `done`. Steps do
  NOT get this treatment — they are real `react-markdown` fragments (Theme A), so there is no
  `innerHTML` left to slice; a step reveals as a whole unit.
- **Resolved — last-mounted/updated wins for `activeMarkdown`.** A single global slot in
  `slides-store.ts`; no stack, no z-order tiebreak, per the original recommendation.
- **Resolved — the deck parser walks a real mdast tree** (`remark-parse` + `remark-gfm`, the same
  GFM flavour `MarkdownPreview` already renders with) rather than a hand-rolled line tokenizer.
  `unified`/`remark-parse`/`mdast-util-to-string`/`@types/mdast` added to `packages/app`'s direct
  dependencies (all were already present transitively via `react-markdown`, pinned to the versions
  already resolved in `pnpm-lock.yaml`). Each step keeps the node's own source substring (sliced by
  its mdast `position`) rather than a rendered string, which is what lets steps render through
  `react-markdown` unchanged.
- **Resolved — a list contributes one step per item, matching the crib exactly** (`markdownToDeck`'s
  own `list` case calls `addStep` once per item, not once for the whole list) — everything else
  (paragraph, code, table) is one whole-block step, nested sub-lists included in their parent item's
  step.
- **Resolved — keyboard handling is a bubble-phase `window` listener**, matching
  `ConfirmDialog`'s own pattern, reading a "latest values" ref rather than re-subscribing on every
  `nav`/`title` change — a re-subscribing effect cannot guarantee the new closure is live before the
  browser's next keydown, which is exactly the class of bug a second one (below) turned out to be.
- **Found and fixed during Theme B:** `useDeckNav`'s `next`/`prev` reducer cases forced `instant`
  to a fixed value on *every* dispatch, including a bare "reveal another step on the same slide" —
  which never touches the title. Since the presenter's typewriter effect keys its restart on
  `[title, instant]`, flipping `instant` with no title change retriggered an already-finished
  typewriter mid-reveal. Fixed so `instant` changes only on an actual slide change forward/backward;
  a step reveal leaves it untouched. Caught by `e2e/slides.spec.ts`, not by the vitest suite (both
  were exercising the reducer's return value, not the cross-hook effect it was meant to avoid
  re-triggering) — the regression is now also covered directly in `use-deck-nav.test.ts`.
- **Resolved — Present's icon is `LuPresentation`** (confirmed present in the pinned `react-icons`
  version before committing to it, per the phase's own icon convention). The palette row for the
  same command uses `LuSparkles` instead: `LuPresentation` is a chart outline that reads as
  "analytics" at 16px in a list, where the button has a tooltip to disambiguate it and the palette
  row does not.

*The entries below were resolved during the 2026-09-05 refine pass. There was no human in that
session, so each records the choice **and** why it was the recommendable one — read them as
decisions, not as preferences.*

- **Resolved (refine x1) — the six later markdown surfaces are in scope, as Theme F, not a new
  phase.** The alternative was to leave them and let a future phase pick them up. Rejected: the
  phase's own title is "everywhere markdown already renders", and a phase whose title is false is
  worse than a phase with one more S theme. Theme F adds no dependency, no channel and no store
  field — four `<PresentButton />` renders and two effects — which is squarely PR-sized.
- **Resolved (refine x1) — `commit-message.tsx` stays out even though it renders `react-markdown`.**
  It was already excluded by *Not in this phase* for the right reason (trailer styling + SHA/issue
  linkification make it a commit body, not a document). Making that an explicit **item** in Theme F
  is the change: an executor told "wire the remaining markdown surfaces" will otherwise find seven
  and wire seven.
- **Resolved (refine x1) — a claiming surface is one that renders a single document-level body.**
  Theme D settled this for `pr-detail` vs `comment-thread` but stated it as a fact about those two
  files rather than as a rule. Stated as a rule, it decides all six new surfaces without a second
  argument: Issue detail and release notes claim; the two conversation lists do not.
- **Resolved (refine x1) — the leftover verification work is a theme (G), not a checkbox list.**
  Every artifact the original Verification section asked for already exists on disk, so the eight
  unticked boxes read as "nothing has been done" when the truth is "nothing has been *run*". A
  theme is also what `/midnite-exec` can actually pick up — with zero open themes, this phase was
  invisible to the exec workflow despite having real work left.
- **Resolved (refine x1) — the fenced-heading parser case is the one gap worth closing.** Of every
  input the 8 existing parser cases miss, a ` ```md ` block containing `## …` is the only one that
  would silently produce a wrong deck from this repo's own docs — which is exactly what the phase's
  own human stress test presents. The others (empty string, `\r\n`, an h1 after an h2) either
  already work by construction or fail loudly.
- **Resolved (refine x1) — no chord for `markdown.presentAsSlides`.** Left unbound deliberately now
  that the palette exists to reach it, rather than as a placeholder waiting for one. Recorded in
  *Not in this phase*.

*Stale claims corrected in this pass, for anyone reading the git history:* every `../packages/…`
link in this doc was dead (the tracker moved from `todo/` to `.midnite/tasks/phases/`); Theme D said
the Present button lives in `markdown-preview.tsx` when it lives in `file-preview.tsx` behind a
shared `present-button.tsx`; Theme A never named `parseDeck` or the `Deck` type; Theme C's store
list was missing `setActiveMarkdown`; the `app.tsx` mount is now lazy, error-bounded and outside
`DialogHost`; and the framing prose's "three places" is nine.