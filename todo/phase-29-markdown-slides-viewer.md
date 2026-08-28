# Phase 29 — Markdown slides, everywhere markdown already renders

The app renders markdown in three places today — [`markdown-preview.tsx`](../packages/app/src/features/files/preview/markdown-preview.tsx)
(Files preview, Phase 16), and [`pr-detail.tsx`](../packages/app/src/features/reviews/pr-detail.tsx) /
[`comment-thread.tsx`](../packages/app/src/features/reviews/comment-thread.tsx) (Reviews, Phase 20) —
all three the same `react-markdown` + `remark-gfm` pattern, and none of them offers anything beyond
a scrolling `.prose` block. This phase gives all three a second way to read: a fullscreen,
heading-paginated slide deck, one press away, ported from the sibling `midnite` app's presentation
feature rather than built from scratch.

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
[`confirm-dialog.tsx`](../packages/app/src/components/confirm-dialog.tsx),
[`prompt-dialog.tsx`](../packages/app/src/components/prompt-dialog.tsx) and
[`merge-dialog.tsx`](../packages/app/src/features/reviews/merge-dialog.tsx).

**Scope guardrails.** **A viewer, not an editor.** No CRUD, no deck list, no localStorage
persistence — closing the modal forgets the deck; reopening the same file rebuilds it from source,
every time. **No new highlighting library.** Code fences inside a slide render through the shiki
instance [`code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx) already
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
- [x] `DeckSlide` / `DeckStep` types exported alongside the parser. No zod schema — this never
      crosses the IPC boundary, it is renderer-only data derived from a string the caller already
      has.
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

### C — The fullscreen host (S) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] `packages/app/src/features/slides/slides-store.ts`: a small Zustand store —
      `deck: { content: string; label?: string } | null` (the currently open deck; `null` is closed)
      and `activeMarkdown: { content: string; label?: string } | null` (whichever markdown surface is
      currently in view, kept live by Theme D). `present(source)` opens the deck directly from a
      source (a button click); `presentActive()` opens it from `activeMarkdown` (used when there was
      no click to hand content directly — Theme E); `close()`.
- [x] `packages/app/src/features/slides/slides-modal.tsx`: the `fixed inset-0 z-dialog` convention
      already shared by `confirm-dialog.tsx` / `prompt-dialog.tsx` / `merge-dialog.tsx`, mounted once
      from [`app.tsx`](../packages/app/src/app.tsx) beside the existing `<DialogHost>` — reads `deck`
      off the store and renders nothing while it is `null`.
- [x] Reuses the existing [`use-focus-trap.ts`](../packages/app/src/components/use-focus-trap.ts)
      (already extracted, already used by `popover.tsx`) rather than a fourth hand-rolled trap.
- [x] Deliberately **not** folded into `DialogHost`'s own API — that host's whole point is "only one
      of confirm/prompt/menu open at a time," and a fullscreen deck is a different shape than any of
      the three it already arbitrates between.

### D — Wired into every markdown surface (M) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] `markdown-preview.tsx` / `file-preview.tsx`: a "Present" icon button in the shared preview
      header, beside the existing show-source toggle, calling
      `present({ content: rawMarkdown, label: fileName })`. A mount-time effect also sets
      `activeMarkdown` so Theme E's command works without a click.
- [x] `pr-detail.tsx`: the same button beside the PR/review description body, with the same
      `activeMarkdown` effect.
- [x] `comment-thread.tsx`: the same button per comment/reply — always shown, per the "present always
      shows" guardrail — but does **not** claim `activeMarkdown`. A thread can hold many short
      markdown bodies visible at once; only the two description-level surfaces are unambiguous
      enough to be "the" markdown a keyboard-invoked command should target. Recorded as a resolved
      decision below.
- [x] Icon: a `react-icons/lu` glyph (`LuPresentation`, or the nearest actual match in the set) via
      the existing `IconComponent` / `IconButton` primitives
      ([`icon-button.tsx`](../packages/app/src/components/icon-button.tsx)), per the repo's icon
      convention.

*Themes A–D have landed (2026-08-28) — the viewer is feature-complete end to end: Present opens a
fullscreen deck from Files preview, a PR/review description, or a comment body, with the full
typewriter/keyboard/help-overlay presentation and shiki-highlighted code fences. Theme E below adds
the unbound `CommandId` registry entry, which has no user-visible effect until Phase 23's palette
exists to read it.*

### E — Command registry entry (S) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

- [x] A new `CommandId` (`markdown.presentAsSlides`, a label, a palette `group`) added to `COMMANDS`
      in [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts) — no chord bound.
      Phase 23's palette UI is not built yet, and every obvious free chord is already scarce; this is
      a registry entry waiting for a surface, the same position `repo.open`/`repo.close` were in
      before Phase 23 Theme B gave them handlers. Grouped under `'view'` (surface-agnostic display
      toggles), not `'files'` — the command fires from Reviews descriptions too, not just Files.
- [x] A `useCommandHandlers()` arm reading `useSlidesStore().activeMarkdown`, following the exact
      reactive shape every other conditional command already uses: enabled with a `run` calling
      `presentActive()` when `activeMarkdown` is set, `{ enabled: false, disabledReason: 'No
      markdown in view' }` otherwise.
- [x] A test on the handler arm: toggling `activeMarkdown` flips `enabled`, and `run()` calls
      `presentActive()` rather than re-deriving or re-fetching content itself — asserted with a spy
      on `presentActive` directly, in `use-command-handlers.test.ts` beside the other command arms.

*Phase 29 is now feature-complete — all five themes (A–E) have landed. Open: the screenshot pass
and the three "Open, for a human" manual checks under Verification below.*

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | `CommandId`/`COMMANDS` only in [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts) — no IPC channel, no zod schema, no domain type. `packages/git-engine` is untouched. |
| Main | **None.** |
| Renderer — new | `features/slides/{deck-parser.ts, deck-parser.test.ts, deck.tsx, help-overlay.tsx, slides-store.ts, slides-modal.tsx}` |
| Renderer — wiring | [`features/files/preview/markdown-preview.tsx`](../packages/app/src/features/files/preview/markdown-preview.tsx), [`features/files/preview/file-preview.tsx`](../packages/app/src/features/files/preview/file-preview.tsx), [`features/reviews/pr-detail.tsx`](../packages/app/src/features/reviews/pr-detail.tsx), [`features/reviews/comment-thread.tsx`](../packages/app/src/features/reviews/comment-thread.tsx), [`app.tsx`](../packages/app/src/app.tsx) (mounts `SlidesModal`) |
| Renderer — keybindings | [`services/keybindings/use-command-handlers.ts`](../packages/app/src/services/keybindings/use-command-handlers.ts) |
| Shared primitives (read, not changed) | [`components/icon-button.tsx`](../packages/app/src/components/icon-button.tsx), [`components/use-focus-trap.ts`](../packages/app/src/components/use-focus-trap.ts) |
| Tests | `features/slides/deck-parser.test.ts`, a `use-command-handlers.test.ts` arm, a new Playwright spec opening the deck from Files and from Reviews |
| Docs | [`todo/outstanding.md`](outstanding.md) if anything gets deferred out mid-build |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean — trivially, only `packages/app` and one `CommandId` entry in
      `packages/shared` are touched; `git-engine` and `desktop` are untouched.
- [ ] Vitest (A): the parser table above — h1-only, multi-h2, nested h3–h6, heading-less, and
      GFM/code-fence step ordering.
- [ ] Vitest/RTL (B/C): opening the modal from each of the three surfaces renders the expected deck;
      `Escape` closes it; arrow keys advance a step then a slide; `?` opens and closes the help
      overlay.
- [ ] Vitest (E): the command handler's `enabled`/`disabledReason` toggles correctly with
      `activeMarkdown`.
- [ ] Playwright: open a markdown file with 3+ headings in the Files view, press Present, step
      through with the keyboard, and confirm each slide's heading matches source order; open a PR
      description in Reviews and confirm the same button and modal work there too.
- [ ] Screenshot, per the visual-phase convention: the Files-preview trigger, a mid-presentation
      slide with a highlighted code fence, and the help overlay — all in both themes.
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
- **A bound keybinding/chord for the new command.** Theme E registers the `CommandId` only; making
  it reachable without a button is Phase 23's palette, once built.
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
  version before committing to it, per the phase's own icon convention).