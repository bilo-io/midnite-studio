# Phase 58 — Notes, and the menu that holds them

A thought you have while reading a diff has nowhere to go. The app can open a repository, lay out
its graph, run four agent loops against it and merge the PR at the end — but "the retry logic here
is wrong, look at it later" has to leave the window to be remembered. Every other surface in this
app is about work that already exists; nothing catches work that doesn't yet.

This phase adds **Notes**: a per-repository list of freeform notes in a centred, gradient-ringed
modal, persisted to `localStorage` and editable in place. And because a note about a repository is
usually the *first draft of a task*, each one carries two icon buttons that hand it straight to the
workflow this repo already runs — **Draft plan** seeds
[`/midnite-brainstorm`](../../../.claude/skills/midnite-brainstorm/SKILL.md), **Adhoc task** seeds
[`/midnite-exec-adhoc`](../../../.claude/skills/midnite-exec-adhoc/SKILL.md) — in a terminal session
cwd'd to the note's own repository. The note is never consumed by that: it flips to `planned`, then
`implemented`, and you tick it off yourself when you agree.

The second half is the door it lives behind. Three entry-point surfaces exist today and none of
them is a menu. The big FAB ([`app.tsx:1459`](../../../packages/app/src/app.tsx)) toggles the Loops
panel on a single click. The launcher strip
([`fab-launchers.tsx`](../../../packages/app/src/features/loops/fab-launchers.tsx)) sits in the
*title bar*, not around the FAB, and expands on hover into four loop glyphs. And the assistant menu
([`assistant-menu.tsx:82`](../../../packages/app/src/features/status-bar/assistant-menu.tsx)) is a
status-bar popover whose entire body is the string `Midnite Assistant Menu (Blank for now)`. This
phase makes **one menu component with two entry points** — the FAB and that blank popover — listing
Loops, Notes, and two deliberately-disabled future leaves, each row reachable by a **single-letter
mnemonic** once the menu is open: `L` · `N` · `I` · `G`.

**Builds on.**
- [`features/loops/fab-launchers.tsx`](../../../packages/app/src/features/loops/fab-launchers.tsx) —
  the existing launcher row: `data-testid` conventions, tooltip placement, and the
  `anyLive || fabPanelOpen || reached` expansion rule. The menu borrows its row anatomy, not its
  hover behaviour.
- [`components/popover.tsx`](../../../packages/app/src/components/popover.tsx) — the occluder
  register/deregister pair (lines 185–191) that every overlay in this app must copy, and
  `gradient-border--always`.
- [`components/use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts) —
  `useFocusTrap(ref, active)`, with the container needing `tabIndex={-1}`.
- [`features/terminal/start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts) —
  `startAgent({ repoId, cwd, title, prompt, agentId, command, surface, autoSend })`, which already
  types a prompt into a fresh session **without executing it**. Its docblock states the posture this
  phase inherits verbatim: *"the app hands over a command, the user's Return runs it."*
- [`store/dashboard-store.ts:210`](../../../packages/app/src/store/dashboard-store.ts) — the small,
  honest `persist` shape (`name` / `version` / `partialize`) the notes store copies, rather than
  `ui-store`'s fifty-key `Pick<>`.
- [`store/persist-rename.ts`](../../../packages/app/src/store/persist-rename.ts) —
  `adoptRenamedPersistKey`, called at module scope *before* `create()`, because zustand's `migrate`
  runs after the read and cannot rescue a renamed key.
- [`styles.css`](../../../packages/app/src/styles.css) — `--rainbow-ramp`, `.gradient-frame` and
  `.fab-panel-gradient` (applied at [`fab-panel.tsx:77`](../../../packages/app/src/components/fab-panel.tsx)),
  which is the closest existing recipe for a glowing surface. The Notes panel is a sibling of it,
  not a new invention.
- [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — `COMMANDS` as the
  single source of truth, and `TERMINAL_YIELD_COMMANDS`, which `fab.toggle` must stay in.

**Scope guardrails.**
- **`localStorage` only.** No sync, no server, no file on disk. Notes are a zustand `persist` store
  like every other renderer-owned preference; the moment they need a backend they stop being notes
  and start being a tracker, which is what `.midnite/tasks/` already is.
- **Nothing leaves `packages/app`.** No IPC channel, no `shared` schema, no main-process code. The
  one existing seam this phase touches — `startAgent` — is already renderer-side. If a theme finds
  itself wanting a handler in `desktop`, the design is wrong.
- **The two disabled leaves stay disabled.** Report Issue and Guided tour ship as visible,
  greyed rows with working mnemonics that no-op. Building either is a different phase; the point of
  showing them now is that the menu's shape is legible from the first release.
- **The title-bar launcher strip is not touched.** It keeps its four loop glyphs and its hover
  expansion. It is a fast path *to a specific loop*; the menu is a slow path *to a surface*. Folding
  one into the other was considered and declined — see Decision 6.
- **No markdown rendering, no search, no tags, no reordering.** A note is a body of text with a
  status. Everything else is a later phase that a real week of use should justify.
- **`git-engine`, `desktop` and `shared` gain nothing** except `shared/src/keybindings.ts`'s two
  command-registry edits.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The notes store (S)

One store, per-repository, in the smallest `persist` shape this codebase uses.

- [ ] Add [`packages/app/src/store/notes-store.ts`](../../../packages/app/src/store/notes-store.ts):
      a `Note` type of `{ id, repoId, body, status, done, createdAt, updatedAt }`, where
      `status: 'captured' | 'planned' | 'implemented'` and `done` is the user's own tick — two
      independent axes, not one enum (Decision 2).
- [ ] Actions: `addNote(repoId, body)`, `setBody(id, body)`, `setStatus(id, status)`,
      `toggleDone(id)`, `removeNote(id)`, and a `notesForRepo(repoId)` selector that returns
      **newest first**.
- [ ] Deliberately **no `position` field.** `~/Dev/midnite`'s note model carries one that its UI
      never reorders by; copying it would import a dead column and an ordering question nobody has.
- [ ] `persist` with `name: 'midnite-studio.notes'`, `version: 1`, and a `partialize` that stores
      `{ notes }` and nothing else — the open/closed state of the modal belongs to `ui-store`.
- [ ] Call `adoptRenamedPersistKey('midnite-studio.notes', 'midnite-studio.notes')` at module scope
      for consistency with the other stores, so a future rename has the hook already in place.
- [ ] Garbage-collect on repository removal: when a repo leaves the registry, its notes go with it.
      Without this, `localStorage` accretes notes keyed to repos the user cannot see or reach.
- [ ] `notes-store.test.ts`: add/edit/remove, newest-first ordering, status and `done` moving
      independently, and the repo GC.

### B — The modal primitive the app never had (M)

Seven hand-rolled `fixed inset-0 z-dialog` divs exist today
([`confirm-dialog`](../../../packages/app/src/components/confirm-dialog.tsx),
[`prompt-dialog`](../../../packages/app/src/components/prompt-dialog.tsx),
[`palette`](../../../packages/app/src/components/palette.tsx),
[`first-run-modal`](../../../packages/app/src/features/onboarding/first-run-modal.tsx),
[`slides-modal`](../../../packages/app/src/features/slides/slides-modal.tsx),
[`merge-dialog`](../../../packages/app/src/features/reviews/merge-dialog.tsx),
[`browser-launcher`](../../../packages/app/src/features/browser/browser-launcher.tsx)). Notes would
be the eighth. Build the thing they've each been re-deriving instead.

- [ ] Add [`packages/app/src/components/modal.tsx`](../../../packages/app/src/components/modal.tsx):
      `<Modal open onClose title size variant>` rendering a dimmed backdrop plus a centred panel at
      `z-dialog`.
- [ ] It **registers as an occluder** for its whole lifetime — increment on mount, decrement on
      unmount, exactly as [`popover.tsx:185`](../../../packages/app/src/components/popover.tsx) does.
      This is not optional: [`use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts)
      hides the native `WebContentsView` on `occluders > 0`, and a modal that skips it is painted
      *underneath a live web page* with no way to reach it.
- [ ] Focus trap via `useFocusTrap`, `tabIndex={-1}` on the panel, Escape closes, and focus returns
      to the trigger on close.
- [ ] Honour reduced motion through `motionMs()` rather than a hard-coded duration — the repo-wide
      policy from [Phase 46](phase-46-lock-screen-and-motion-policy.md) applies here like anywhere.
- [ ] A `variant="gradient"` that wears `.gradient-frame`, so the Notes panel gets its ring from the
      same CSS the FAB panel does rather than a second gradient recipe.
- [ ] **Migrate two existing dialogs onto it** as proof it fits real callers:
      [`prompt-dialog.tsx`](../../../packages/app/src/components/prompt-dialog.tsx) (the simple case)
      and [`browser-launcher.tsx`](../../../packages/app/src/features/browser/browser-launcher.tsx)
      (which already hand-rolls the occluder pair, so the migration should *delete* code).
- [ ] `modal.test.tsx`: Escape closes, the occluder count returns to zero on unmount, focus is
      trapped and restored.

### C — The Notes surface (M)

- [ ] Add [`packages/app/src/features/notes/notes-modal.tsx`](../../../packages/app/src/features/notes/notes-modal.tsx):
      a centred panel (~`max-w-[900px]`, `h-[80vh]`) on the Theme B `Modal` with `variant="gradient"`.
- [ ] Header: the repo name it is scoped to, a done-count pill, and a show/hide-completed toggle —
      the three affordances `~/Dev/midnite`'s panel earns its keep with.
- [ ] A composer at the top that creates a note and clears itself; the new note appears first.
- [ ] Add [`packages/app/src/features/notes/note-row.tsx`](../../../packages/app/src/features/notes/note-row.tsx):
      checkbox · body · status badge · action icons (Theme D) · hover-revealed delete.
- [ ] **In-place editing**, cribbing Midnite's exact key contract: click the body to swap it for an
      autofocused `<textarea>`; **Enter** commits, **Shift+Enter** newlines, **Escape** cancels,
      blur commits, and an emptied body **cancels rather than deletes** — deletion is always the
      explicit trash affordance.
- [ ] Delete routes through `useDialogs().confirm` rather than vanishing the note, matching how
      every other destructive action in the app behaves.
- [ ] Two empty states, which are different problems and read differently: **no repository open**
      ("Notes are per-repository — open one to start"), and **a repo with no notes yet**.
- [ ] `notes-modal.test.tsx` / `note-row.test.tsx` (RTL): create, the full edit key contract,
      cancel-on-empty, hide-completed filtering.

### D — Status, and the handoff to the workflow (M)

The half that makes a note more than a sticky.

- [ ] Two `IconButton`s per row, glyphs from `react-icons` per
      [`CLAUDE.md`](../../../CLAUDE.md)'s one-family rule: **Draft plan** and **Adhoc task**.
- [ ] Both call `startAgent()` with `cwd` set to the note's own repository root, `autoSend: false`,
      and `prompt` set to `` /midnite-brainstorm `<body>` `` or `` /midnite-exec-adhoc `<body>` ``.
      The prompt is *typed, not sent* — inherited from `start-agent.ts`'s existing posture, and the
      right one here for the same reason: a note dispatched by a misclick is worse than one keystroke.
- [ ] Firing either sets `status: 'planned'` and leaves the body untouched. **A note is never
      auto-deleted and never auto-completed** by a handoff.
- [ ] `implemented` is set by the user, from the row (Decision 3) — no attempt to infer it from a
      session exiting or a PR merging in this phase.
- [ ] Status renders as a small badge with a distinct treatment per value, and `done` renders as the
      checkbox — a `planned` note that is ticked off and an untouched note that is ticked off must be
      visually distinguishable.
- [ ] The action buttons disable when there is no resolvable repo root for the note.
- [ ] `note-status.test.ts`: the transitions, and that a handoff never mutates `done` or `body`.

### E — The quick-access menu (M)

- [ ] Add [`packages/app/src/features/quick-access/quick-access-menu.tsx`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx):
      one component, rendered from two places, never forked.
- [ ] Rows carry **icon · label · mnemonic badge · one-line description**, with a delimiter between
      the live group and the disabled one:

      | Key | Row | State |
      |-----|-----|-------|
      | `L` | Loops — the four agent loops and their consoles | live |
      | `N` | Notes — capture a thought against this repository | live |
      | — *delimiter* — | | |
      | `I` | Report Issue — file it against `bilo-io/midnite-apps` | disabled |
      | `G` | Guided tour — a walkthrough of the workspace | disabled |

- [ ] **Mnemonic dispatch**, scoped to the open menu: a bare letter activates its row. It must be
      handled inside the menu and stopped there — the global dispatcher in
      [`use-keybindings.ts`](../../../packages/app/src/services/keybindings/use-keybindings.ts)
      grabs every bound chord from a window listener, and a leaked bare `n` reaching it (or an
      `.xterm` root) is the failure mode to design against.
- [ ] Arrow keys roam, Enter activates, Escape closes, and clicking a row does what its mnemonic
      does — the keyboard path is an accelerator, never the only path.
- [ ] Disabled rows are focusable and announce themselves as disabled; their mnemonic no-ops with a
      "coming soon" hint and **leaves the menu open** (Decision 4).
- [ ] **Entry point 1 — the FAB.** [`app.tsx:1459`](../../../packages/app/src/app.tsx) stops calling
      `toggleFabPanel()` on click and opens the menu instead. `captureFabMorphOrigin` and the
      `FabLoopHalo` wrapper stay exactly as they are; only what the click *means* changes.
- [ ] **Entry point 2 — the assistant menu.** Replace `Midnite Assistant Menu (Blank for now)` in
      [`assistant-menu.tsx:82`](../../../packages/app/src/features/status-bar/assistant-menu.tsx)
      with the same component. Its mini-FAB mode (lines 37–61) is untouched.
- [ ] The menu registers as an occluder, like every other overlay.
- [ ] `quick-access-menu.test.tsx` (RTL): the four rows and their order, mnemonics activating,
      disabled mnemonics no-opping without closing, arrow roaming.

### F — Commands, keybindings and the doc sync (S)

- [ ] In [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts), re-point
      `fab.toggle`: `Mod+l` now **opens the quick-access menu**, not the Loops panel. Update its
      `label` — a stale label surfaces in the palette and the menu bar, not just in source.
- [ ] `fab.toggle` **stays in `TERMINAL_YIELD_COMMANDS`**. `Mod` is Ctrl off macOS and `Ctrl+L` is
      every shell's clear-screen; the reason it yields has not changed just because its target has.
- [ ] Add a `notes.toggle` command with **no chord** — the menu is the path, and `Mod+L` `N` is
      already two keystrokes. It exists so the palette can offer it, following the chord-free
      precedent `view.refresh` and `sync.fetch` set.
- [ ] Wire both in [`use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts),
      and hold the menu's open state in [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts)
      beside `fabPanelOpen` rather than in component state — two entry points cannot own one flag.
- [ ] Confirm no native accelerator is registered for either in
      [`menu.ts`](../../../packages/desktop/src/main/menu.ts): an OS accelerator fires whenever the
      window is focused, xterm included.
- [ ] **Three-way doc sync.** `Mod+l` is documented as "the Loops panel" in
      [`CLAUDE.md`](../../../CLAUDE.md), [`AGENTS.md`](../../../AGENTS.md) and
      [`GEMINI.md`](../../../GEMINI.md). All three change together, per the rule at the top of each.

### G — Verification, tests and the visual pass (M)

- [ ] Playwright: the menu opens from **both** entry points and renders the same four rows.
- [ ] Playwright: `Mod+L` then `N` opens Notes; `Mod+L` then `L` opens the Loops panel; `Mod+L` then
      `I` changes nothing but leaves the menu open.
- [ ] Playwright: full note lifecycle — create, edit in place, hand off to a plan (asserting the
      seeded prompt is *typed and not sent*), tick it off, hide completed, delete.
- [ ] Playwright: with the browser pane open on a page, opening the Notes modal **hides the
      `WebContentsView`** and closing it restores it — the occluder contract, tested rather than
      trusted.
- [ ] Playwright: notes written against repo A are absent when repo B is selected.
- [ ] A reload preserves notes; clearing the repo from the registry clears its notes.
- [ ] Screenshots of the menu (both entry points) and the Notes modal, in light and dark.
- [ ] `moon run :typecheck :lint :test` green, and the e2e suite green without a new `KNOWN_RED`
      entry ([Phase 38](phase-38-paying-off-the-e2e-suite.md) exists to shrink that list, not feed it).
- [ ] **Open, for a human:** live with it for a few days. The questions the plan cannot answer are
      whether `Mod+L` losing its direct line to the Loops panel is a real cost, and whether a note
      that has been handed off actually gets ticked off afterwards.

---

## Files this phase touches

**New**
- [`packages/app/src/store/notes-store.ts`](../../../packages/app/src/store/notes-store.ts) — the store (A).
- [`packages/app/src/components/modal.tsx`](../../../packages/app/src/components/modal.tsx) — the primitive (B).
- [`packages/app/src/features/notes/notes-modal.tsx`](../../../packages/app/src/features/notes/notes-modal.tsx) — the surface (C).
- [`packages/app/src/features/notes/note-row.tsx`](../../../packages/app/src/features/notes/note-row.tsx) — one note (C, D).
- [`packages/app/src/features/notes/note-status.ts`](../../../packages/app/src/features/notes/note-status.ts) — status transitions + handoff prompts (D).
- [`packages/app/src/features/quick-access/quick-access-menu.tsx`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx) — the menu (E).

**Changed**
- [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) — the FAB click opens the menu; mount the Notes modal (E).
- [`packages/app/src/features/status-bar/assistant-menu.tsx`](../../../packages/app/src/features/status-bar/assistant-menu.tsx) — the blank popover gains the menu (E).
- [`packages/app/src/components/prompt-dialog.tsx`](../../../packages/app/src/components/prompt-dialog.tsx) · [`features/browser/browser-launcher.tsx`](../../../packages/app/src/features/browser/browser-launcher.tsx) — migrated onto `Modal` (B).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — menu + Notes open state (F).
- [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — `fab.toggle` re-pointed, `notes.toggle` added (F).
- [`packages/app/src/services/keybindings/use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts) — both handlers (F).
- [`packages/app/src/styles.css`](../../../packages/app/src/styles.css) — the Notes panel's gradient, beside `.fab-panel-gradient` (C).
- [`CLAUDE.md`](../../../CLAUDE.md) · [`AGENTS.md`](../../../AGENTS.md) · [`GEMINI.md`](../../../GEMINI.md) — the `Mod+l` paragraph, all three (F).

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: nothing new in `desktop`, `git-engine` or `shared` beyond the two command-registry entries; the renderer reaches main only through `window.midniteStudio` as before.
- [ ] `localStorage` holds exactly one new key, `midnite-studio.notes`, and it survives a reload and a hard reload.
- [ ] The occluder count returns to zero after the Notes modal and the menu both close — no leak that would leave the browser pane permanently hidden.
- [ ] Every migrated dialog (Theme B) still passes its existing specs unchanged.
- [ ] The three convention files agree with each other on `Mod+l` — diff them.
- [ ] **Open, for a human:** the visual pass on the gradient ring in both themes, and whether the modal at 80vh is the right size on a laptop display.

---

## Decisions / open questions

1. **Per-repository, not global.** *Settled in the brainstorm.* Notes belong to a repository, and
   switching repos swaps the list. The cost is real and accepted: a thought with no repo open has
   nowhere to land, which is why Theme C ships a distinct empty state saying so rather than a blank
   panel. If that empty state gets hit often in practice, the fix is a "global" pseudo-repo, not a
   re-model.

2. **`status` and `done` are two axes, not one.** *Settled.* `captured → planned → implemented`
   records what the *workflow* has done with a note; `done` records that *you* are finished with it.
   Collapsing them into one enum would make "I handed this to an agent" and "I'm happy with the
   result" the same fact, and they routinely aren't.

3. **Who sets `implemented`?** *Recommendation: the user, manually, this phase.* Inferring it from a
   merged PR is the obvious follow-up and the obvious trap — the handoff records nothing about which
   PR resulted, and guessing wrong marks work done that isn't. A later phase can wire the real
   signal once notes have a session or PR reference worth trusting.

4. **What a disabled mnemonic does.** *Recommendation: no-op, keep the menu open, show a "coming
   soon" hint on the row.* Closing the menu would read as "that worked"; a modal error would be
   absurd for a feature that doesn't exist yet.

5. **Which two dialogs Theme B migrates.** *Recommendation: `prompt-dialog` and `browser-launcher`.*
   The first is the simplest possible consumer; the second already hand-rolls the occluder pair, so
   its migration should be a net deletion and proves the primitive covers the hard case. `palette`
   and `slides-modal` are deliberately left alone — both are load-bearing and both have unusual
   geometry.

6. **Why the title-bar launcher strip survives.** *Settled, considered and declined.* Folding the
   four loop glyphs into the menu would make every loop three keystrokes away instead of one hover
   and a click, and the strip is also the app's live-agent indicator — it expands on its own when
   `anyLive`. It is a status readout that happens to be clickable, which a menu is not.

7. **`Mod+L` no longer opens Loops directly.** *Settled, with a known cost.* The chord now opens the
   menu, and Loops is `Mod+L` then `L`. This is a documented binding changing meaning, which is why
   Theme F treats the three convention files as a deliverable rather than an afterthought. If the
   extra keystroke grates after a week, the cheap reversal is a chord-free `loops.open` command
   promoted to `Mod+Shift+L` — but `app.lock` currently holds that, so it is not free.

8. **Does the menu need its own gradient?** *Recommendation: no.* It is a small popover-scale
   surface; `gradient-border--always` from `popover.tsx` is already the right weight. The full
   `.gradient-frame` ring is for the Notes panel, which is large enough to carry it.

9. **Note body length.** `~/Dev/midnite` caps at 2,000 characters. *Recommendation: no hard cap,*
   but the row clamps to ~3 lines with the full body in the editor — a cap on a `localStorage` note
   protects nothing and turns a paste into a silent truncation.
