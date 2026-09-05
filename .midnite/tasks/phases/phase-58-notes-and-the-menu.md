# Phase 58 — Notes, and the menu that holds them

**Refined: x1** · 2026-09-05 · data model & persistence, functionality & edge cases, keyboard & dispatch, file-map precision, per-item acceptance criteria, out-of-scope tightening

A thought you have while reading a diff has nowhere to go. The app can open a repository, lay out
its graph, run four agent loops against it and merge the PR at the end — but "the retry logic here
is wrong, look at it later" has to leave the window to be remembered. Every other surface in this
app is about work that already exists; nothing catches work that doesn't yet.

This phase adds **Notes**: a per-repository list of freeform notes in a centred, gradient-ringed
modal, persisted to `localStorage` and editable in place. And because a note about a repository is
usually the *first draft of a task*, each one carries two icon buttons that hand it straight to the
workflow this repo already runs — **Draft plan** seeds `/midnite-brainstorm`, **Adhoc task** seeds
`/midnite-exec-adhoc` — in a terminal session cwd'd to the note's own repository. The note is never
consumed by that: it flips to `planned`, then `implemented`, and you tick it off yourself when you
agree.

**The refinement changed this phase's shape in two places, and both are worth reading before
starting.**

**First: the handoff is already built.** [`features/agent/midnite-menu.tsx:46`](../../../packages/app/src/features/agent/midnite-menu.tsx)
already renders a menu of skill verbs that each call `startAgent(...)` cwd'd to the repo, typed and
not sent, resolving the primary agent with a Claude→builtin fallback (`:61-65`) and disabling a row
with a `disabledReason` when its skill string is empty (`:84-86`). The skill strings themselves are
**user-configurable settings, not constants** — `DEFAULT_AGENT_SKILLS` at
[`ui-store.ts:1101`](../../../packages/app/src/store/ui-store.ts) (`execAdhoc: '/midnite-exec-adhoc'`,
`brainstorm: '/midnite-brainstorm'`), overridable through persisted `agentSkills` from
Settings ▸ Agent. And [`agent-commands.ts:132`/`:146`](../../../packages/app/src/features/agent/agent-commands.ts)
already carries `execAdhoc` and `brainstorm` registry entries with their label, icon, hint and
category. Theme D as first drafted would have been a **second, forked implementation** that
hard-codes two literals and silently ignores a user who re-pointed them. It is now a reuse.

**Second: the modal count was wrong, and so was the diagnosis.** There are **twelve**
`fixed inset-0 z-dialog` overlays, not seven — and **ten of the twelve already use `useFocusTrap`**,
so the focus trap is *not* what they re-derive. What they actually re-derive is the backdrop class
string and the Escape handler, and what they mostly get *wrong* is the occluder pair: **only
`browser-launcher` registers**, so `palette`, `confirm-dialog`, `merge-dialog`, `first-run-modal`
and seven others are painted **underneath a live `WebContentsView`** whenever the browser pane is
open. That reframes Theme B from a tidy into a bug fix.

The second half is the door it lives behind. Three entry-point surfaces exist today and none of
them is a menu. The big FAB button ([`app.tsx:1484`](../../../packages/app/src/app.tsx), whose
`onClick` at `:1486-1497` calls `toggleFabPanel()` at `:1496`) toggles the Loops panel on a single
click. The launcher strip
([`fab-launchers.tsx:50`](../../../packages/app/src/features/loops/fab-launchers.tsx)) sits in the
*title bar*, not around the FAB, and expands on hover into four loop glyphs. And the assistant menu
([`assistant-menu.tsx:82`](../../../packages/app/src/features/status-bar/assistant-menu.tsx)) is a
status-bar popover whose entire body is the string `Midnite Assistant Menu (Blank for now)`. This
phase makes **one menu component with two entry points** — the FAB and that blank popover — listing
Loops, Notes, and two deliberately-disabled future leaves, each row reachable by a **single-letter
mnemonic** once the menu is open: `L` · `N` · `I` · `G`.

**Builds on.**
- [`features/agent/midnite-menu.tsx`](../../../packages/app/src/features/agent/midnite-menu.tsx) —
  the existing skill-handoff path: agent resolution, `startAgent` call shape, `disabledReason`. Theme
  D extracts from this rather than reimplementing beside it.
- [`features/agent/agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts) —
  `id: 'brainstorm'` (`:146`) and `id: 'execAdhoc'` (`:132`), each with `label`, `icon`, `hint`,
  `category`. The glyphs and labels for Theme D's two buttons are already chosen here.
- [`store/ui-store.ts:1101`](../../../packages/app/src/store/ui-store.ts) — `DEFAULT_AGENT_SKILLS`
  and the persisted `agentSkills` override (`:1175`). The source of the two skill strings.
- [`features/terminal/start-agent.ts:34`](../../../packages/app/src/features/terminal/start-agent.ts) —
  `startAgent({ repoId, cwd, title, prompt, agentId, command, surface?, taskRef?, extraArgs?, autoSend? }): TerminalSession`.
  `agentId` and `command` are **required**. Its docblock states the posture this phase inherits
  verbatim: *"the app hands over a command, the user's Return runs it."*
- [`features/repos/use-repo-actions.ts:84`](../../../packages/app/src/features/repos/use-repo-actions.ts) —
  `primaryTarget(repo: RepoDescriptor): StatusTarget`; `primaryTarget(repo).worktreePath ?? repo.path`
  is how every caller derives a cwd.
- [`components/popover.tsx:185`](../../../packages/app/src/components/popover.tsx) — the occluder
  register/deregister pair (increment `:185`, decrement `:191`), and `gradient-border--always`.
- [`components/use-focus-trap.ts:18`](../../../packages/app/src/components/use-focus-trap.ts) —
  `useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void`, container needs
  `tabIndex={-1}`. Eleven consumers already.
- [`components/dialog-host.tsx:36`](../../../packages/app/src/components/dialog-host.tsx) —
  `useDialogs()`, `confirm(request: ConfirmRequest): void` (`:19`, impl `:58`).
- [`store/dashboard-store.ts:208`](../../../packages/app/src/store/dashboard-store.ts) — the small,
  honest `persist` shape (`name` / `version: 1` / `partialize: (s) => ({ boards: s.boards })`, and
  **no `migrate`**) plus a `Record<repoId, …>` collection. Read its `:198-207` comment before
  writing Theme A's GC item — it declines GC on purpose.
- [`store/persist-rename.ts:14`](../../../packages/app/src/store/persist-rename.ts) —
  `adoptRenamedPersistKey(legacyKey: string, currentKey: string): void`, called at module scope
  before `create()`.
- [`tailwind.config.ts:108`](../../../packages/app/tailwind.config.ts) — the z-index scale
  (`dialog: '90'`). Not in `styles.css`.
- [`shared/src/keybindings.ts:128`](../../../packages/shared/src/keybindings.ts) —
  `{ id: 'fab.toggle', label: 'Toggle Loop Panel', group: 'view', chord: 'Mod+l' }`, and
  `TERMINAL_YIELD_COMMANDS` (`:327-334`, containing `'fab.toggle'` at `:332`).

**Scope guardrails.**
- **`localStorage` only.** No sync, no server, no file on disk. The moment notes need a backend they
  stop being notes and start being a tracker, which is what `.midnite/tasks/` already is.
- **Nothing leaves `packages/app`** except two `shared/src/keybindings.ts` entries and one
  `desktop/src/main/menu.ts` accelerator fix (Theme F). If a theme wants an IPC handler, the design
  is wrong.
- **The two disabled leaves stay disabled.** Report Issue and Guided tour ship as visible, greyed
  rows with working mnemonics that no-op.
- **The title-bar launcher strip is not touched.** See Decision 6.
- **No markdown rendering, no search, no tags, no reordering.** A note is a body of text with a
  status.
- **Theme B fixes the occluder gap for the twelve overlays, and migrates only two of them.** The
  gap is wider than the migration; see Decision 10 for why those are separated.
- **Escape handling in `Modal` defers to [Phase 62](phase-62-one-escape-one-dismissal.md).** See
  Decision 11.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The notes store (S)

One store, per-repository, in the smallest `persist` shape this codebase uses.

- [ ] Add [`packages/app/src/store/notes-store.ts`](../../../packages/app/src/store/notes-store.ts):
      `export type Note = { id: string; repoId: string; body: string; status: NoteStatus; done: boolean; createdAt: number; updatedAt: number }`
      with `export type NoteStatus = 'captured' | 'planned' | 'implemented'`. `status` and `done` are
      two independent axes, not one enum (Decision 2). `id` is `crypto.randomUUID()`.
- [ ] Actions on the store: `addNote(repoId: string, body: string): Note`,
      `setBody(id: string, body: string): void`, `setStatus(id: string, status: NoteStatus): void`,
      `toggleDone(id: string): void`, `removeNote(id: string): void`. Every mutation bumps
      `updatedAt`; none of them bumps `createdAt`.
- [ ] `export function notesForRepo(notes: Note[], repoId: string): Note[]` as a **module-level pure
      selector**, not a store method — sorted `createdAt` descending (newest first). Pure so
      `notes-store.test.ts` can assert ordering without mounting a store, matching how the other
      stores' selectors are tested.
- [ ] Shape the collection as `notes: Record<string, Note>` keyed by note id, **not** a flat array
      and **not** `Record<repoId, Note[]>`. Keyed-by-id makes `setBody`/`toggleDone` O(1) and makes
      the repo GC a filter; `notesForRepo` does the grouping. (`dashboard-store.ts:53` uses
      `Record<repoId, DashboardBoard>` because a board *is* one-per-repo; a note is not.)
- [ ] Deliberately **no `position` field.** `~/Dev/midnite`'s note model carries one that its UI
      never reorders by; copying it would import a dead column and an ordering question nobody has.
- [ ] `persist` with `name: 'midnite-studio.notes'`, `version: 1`, and
      `partialize: (s) => ({ notes: s.notes })` — nothing else. Follow
      [`dashboard-store.ts:208`](../../../packages/app/src/store/dashboard-store.ts) exactly,
      including having **no `migrate`** at version 1.
- [ ] Call `adoptRenamedPersistKey('midnite-studio.notes', 'midnite-studio.notes')` at module scope,
      matching the identical-argument precedent at `dashboard-store.ts:115`, `search-store.ts:111`,
      `ui-store.ts:1206` and `browser-store.ts:166`, so a future rename has the hook in place.
- [ ] **Repo GC — and the precedent it contradicts, resolved.**
      [`dashboard-store.ts:198-207`](../../../packages/app/src/store/dashboard-store.ts) explicitly
      *declines* to prune boards for closed repos: *"re-adding one to find its dashboard reset would
      make the persistence pointless."* That argument applies to notes with more force, so
      **notes are not GC'd on repo close.** Instead: prune only notes whose `repoId` has been absent
      from the registry for good, offered as an explicit **"Remove notes for repositories you no
      longer have"** action on the Notes modal's header overflow — user-initiated, never automatic.
      *(This reverses the first draft's item; see Decision 12.)*
- [ ] `notes-store.test.ts`: add/edit/remove; `notesForRepo` newest-first; `status` and `done` moving
      independently; `updatedAt` bumping and `createdAt` not; the `partialize` output containing
      exactly the `notes` key; the manual prune removing only the named repos' notes.

### B — The modal primitive the app never had (M)

**Twelve** hand-rolled `fixed inset-0 z-dialog` overlays exist today, not seven:
[`confirm-dialog:84`](../../../packages/app/src/components/confirm-dialog.tsx),
[`prompt-dialog:55`](../../../packages/app/src/components/prompt-dialog.tsx),
[`palette:279`](../../../packages/app/src/components/palette.tsx),
[`first-run-modal:22`](../../../packages/app/src/features/onboarding/first-run-modal.tsx),
[`slides-modal:35`](../../../packages/app/src/features/slides/slides-modal.tsx),
[`merge-dialog:97`](../../../packages/app/src/features/reviews/merge-dialog.tsx),
[`browser-launcher:84`](../../../packages/app/src/features/browser/browser-launcher.tsx),
[`setup-dialog:112`](../../../packages/app/src/features/agent/setup-dialog.tsx),
[`stash-push-dialog:55`](../../../packages/app/src/features/status/stash-push-dialog.tsx),
[`council-create-dialog:32`](../../../packages/app/src/features/councils/council-create-dialog.tsx),
[`help-overlay:18`](../../../packages/app/src/features/slides/help-overlay.tsx). Notes would be the
thirteenth. **Ten of them already call `useFocusTrap`** — the trap is not the duplication. The
duplication is the backdrop class string (`bg-background/70 p-6`, identical in nine of them) and the
Escape handler; and the *defect* is that **only `browser-launcher` registers as an occluder**.

- [ ] Add [`packages/app/src/components/modal.tsx`](../../../packages/app/src/components/modal.tsx)
      exporting
      `export function Modal(props: ModalProps): JSX.Element | null` with
      `export type ModalProps = { open: boolean; onClose: () => void; title?: string; children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'full'; variant?: 'plain' | 'gradient'; align?: 'center' | 'top'; initialFocusRef?: RefObject<HTMLElement | null>; testId?: string }`.
      Enumerated unions, not free strings — `align: 'top'` exists because
      [`palette.tsx:279`](../../../packages/app/src/components/palette.tsx) is `items-start pt-[15vh]`
      and would otherwise be unmigratable.
- [ ] `size` maps to a fixed table in the module — `sm: 'max-w-[420px]'`, `md: 'max-w-[640px]'`,
      `lg: 'max-w-[900px]'`, `full: 'max-w-none w-full h-full'` — so a caller never passes a raw
      class and the sizes cannot drift apart across thirteen surfaces.
- [ ] It **registers as an occluder** for its whole lifetime — `incrementOccluders()` on mount,
      `decrementOccluders()` on unmount, exactly as
      [`popover.tsx:185`/`:191`](../../../packages/app/src/components/popover.tsx) does. This is not
      optional and it is not cosmetic:
      [`use-browser-bounds.ts:20`](../../../packages/app/src/features/browser/use-browser-bounds.ts)
      computes `effectiveVisible = visible && occluders === 0`, so a modal that skips it is painted
      *underneath a live web page* with no way to reach it — which is the state eleven of the twelve
      are in today.
- [ ] Focus trap via `useFocusTrap(panelRef, open)`, `tabIndex={-1}` on the panel, and **focus
      restoration**: capture `document.activeElement` on open and restore it on close.
      `useFocusTrap` deliberately does not restore (it only sets initial focus when the container
      does not already contain `activeElement`), so restoration is `Modal`'s job and is the one
      behaviour none of the twelve currently get right.
- [ ] Escape closes — **through [Phase 62](phase-62-one-escape-one-dismissal.md)'s
      `useDismiss(open, onClose, { layer: 'dialog' })` if that phase has landed, and through a plain
      `window` keydown effect if it has not.** Whichever lands second reconciles the two; see
      Decision 11. Do not invent a third mechanism.
- [ ] `variant="gradient"` wears `.gradient-frame` ([`styles.css:1151`](../../../packages/app/src/styles.css)),
      the same CSS the FAB panel uses at [`fab-panel.tsx:77`](../../../packages/app/src/components/fab-panel.tsx).
      **Note the motion caveat:** `.gradient-frame` sets `animation: fab-panel-spin 4s linear infinite`
      unconditionally in CSS, so `motionMs()` cannot reach it — reduced motion for the ring is a
      `@media (prefers-reduced-motion)` rule in `styles.css` beside the keyframes, not a JS value.
- [ ] Reduced motion for the modal's own enter/exit uses `motionMs()`
      ([`use-reveal.ts:41`](../../../packages/app/src/components/use-reveal.ts) —
      `document.documentElement.dataset['motion'] === 'reduced' ? 0 : REVEAL_MS`). It returns a single
      duration, not a scaler; use it as the transition duration and nothing else.
- [ ] `testId` renders as `data-testid` on the panel — every existing overlay carries one
      (`fab-launchers.tsx:151`, `assistant-menu.tsx:50`) and the e2e specs in Theme G depend on it.
- [ ] **Migrate two existing dialogs onto it** as proof it fits real callers:
      [`prompt-dialog.tsx`](../../../packages/app/src/components/prompt-dialog.tsx) (the simplest
      consumer) and [`browser-launcher.tsx`](../../../packages/app/src/features/browser/browser-launcher.tsx)
      (which already hand-rolls the occluder pair, so its migration should be a net **deletion** and
      proves the primitive covers the hard case). `palette` and `slides-modal` stay put — Decision 5.
- [ ] **Close the occluder gap for the ten unmigrated overlays too**, by adding the
      `incrementOccluders`/`decrementOccluders` pair to each. Ten two-line edits, no migration. This
      is separated from the migration deliberately (Decision 10): the bug is urgent and the refactor
      is not.
- [ ] `modal.test.tsx`: Escape closes; the occluder count is 0 → 1 while open → 0 after unmount
      (the assertion shape from [`context-menu.test.tsx`](../../../packages/app/src/components/context-menu.test.tsx));
      focus is trapped; focus returns to the element that was active before opening;
      `initialFocusRef` wins over the default when supplied.
- [ ] `occluder-coverage.test.tsx`: render each of the twelve overlays and assert
      `useUiStore.getState().occluders` is 1 while mounted and 0 after. The regression guard for the
      item above — without it, the eleventh overlay to be added will skip the pair again.

### C — The Notes surface (M)

- [ ] Add [`packages/app/src/features/notes/notes-modal.tsx`](../../../packages/app/src/features/notes/notes-modal.tsx):
      `export function NotesModal(): JSX.Element | null`, rendering the Theme B `Modal` with
      `size="lg"`, `variant="gradient"`, `align="center"`, `testId="notes-modal"`, and a body pinned
      to `h-[80vh]`.
- [ ] Header: the repo's **name**, a done-count pill, a show/hide-completed toggle, and an overflow
      holding Theme A's manual prune. The name comes from the `RepoDescriptor` the repos query
      already returns — `useUiStore`'s `selectedRepoId` gives an id, not a name, so resolve it
      through the same query `repos-panel.tsx` reads rather than storing a second copy.
- [ ] A composer at the top: a `<textarea>` that creates a note on **Enter** (Shift+Enter newlines),
      clears itself, and leaves focus in place so a second thought can follow the first. The new note
      appears first, which `notesForRepo`'s ordering gives for free.
- [ ] Add [`packages/app/src/features/notes/note-row.tsx`](../../../packages/app/src/features/notes/note-row.tsx):
      `export function NoteRow({ note }: { note: Note }): JSX.Element` — checkbox · body · status
      badge · the two action icons (Theme D) · a hover-revealed delete.
- [ ] **In-place editing**, cribbing Midnite's exact key contract: click the body to swap it for an
      autofocused `<textarea>`; **Enter** commits, **Shift+Enter** newlines, **Escape** cancels,
      blur commits, and an emptied body **cancels rather than deletes** — deletion is always the
      explicit trash affordance. The Escape here is an input-scoped handler and must
      `stopPropagation()`, per [Phase 62](phase-62-one-escape-one-dismissal.md) Theme C's rule, so it
      cancels the edit without closing the modal.
- [ ] The status badge is one `<span>` per value with a distinct token: `captured` →
      `text-muted-foreground border-border`, `planned` → `text-primary border-primary/40`,
      `implemented` → `text-emerald-500 border-emerald-500/40`. A `planned` note that is ticked off
      and an untouched note that is ticked off must be distinguishable at a glance — the checkbox
      alone does not carry it.
- [ ] Delete routes through `useDialogs().confirm` ([`dialog-host.tsx:36`](../../../packages/app/src/components/dialog-host.tsx))
      rather than vanishing the note, matching every other destructive action in the app.
- [ ] Two empty states, which are different problems and read differently: **no repository open**
      (*"Notes are per-repository — open one to start"*) and **a repo with no notes yet**
      (*"Nothing captured yet. Write the thought you'd otherwise lose."*). Both render through
      [`components/empty-state.tsx`](../../../packages/app/src/components/empty-state.tsx).
- [ ] `notes-modal.test.tsx` / `note-row.test.tsx` (RTL, in the shape of
      [`toast-host.test.tsx`](../../../packages/app/src/components/toast-host.test.tsx) — note there
      is **no `setupFiles`** and no `jest-dom`, so assertions read `expect(x).not.toBeNull()`):
      create; the full edit key contract including cancel-on-empty and Escape-not-closing-the-modal;
      hide-completed filtering; both empty states.

### D — Status, and the handoff to the workflow (M)

The half that makes a note more than a sticky — and, after the refinement, **an extraction rather
than a second implementation**.

- [ ] **Extract the handoff from [`midnite-menu.tsx`](../../../packages/app/src/features/agent/midnite-menu.tsx)**
      into `packages/app/src/features/agent/use-skill-handoff.ts`:
      `export function useSkillHandoff(): (opts: { skillId: 'brainstorm' | 'execAdhoc'; repo: RepoDescriptor; body: string }) => TerminalSession | null`.
      It carries `midnite-menu.tsx:61-65`'s primary-agent-with-Claude-fallback resolution and its
      empty-skill guard. `midnite-menu.tsx` is refactored to call it, so there is one path, not two.
- [ ] The skill string comes from **`agentSkills`, not a literal** —
      `useUiStore.getState().agentSkills?.[skillId] ?? DEFAULT_AGENT_SKILLS[skillId]`
      ([`ui-store.ts:1101`](../../../packages/app/src/store/ui-store.ts)). A user who re-points
      `brainstorm` in Settings ▸ Agent must have the Notes button follow them; hard-coding
      `/midnite-brainstorm` is the exact drift `midnite-menu.tsx:75` already guards against.
- [ ] `useSkillHandoff` calls `startAgent({ repoId, cwd, title, prompt, agentId, command, autoSend: false })`
      with `cwd = primaryTarget(repo).worktreePath ?? repo.path`
      ([`use-repo-actions.ts:84`](../../../packages/app/src/features/repos/use-repo-actions.ts)) and
      `agentId`/`command` from the resolved agent. Both are **required** parameters that the first
      draft of this phase never named.
- [ ] **The prompt is an argument, not typed text — say so and shape it accordingly.**
      [`start-agent.ts:96-102`](../../../packages/app/src/features/terminal/start-agent.ts) builds
      `[command, ...extraArgs, ...agentInvocationArgs(agentId), shellQuote(toAgentPrompt(prompt, agentId))]`.
      So `prompt` is `` `${skill} ${body}` `` as a **plain string with no backticks** — the first
      draft's `` /midnite-brainstorm `<body>` `` would be passed through `shellQuote` and arrive with
      literal backticks in it. A body containing quotes or newlines is `shellQuote`'s problem and is
      already handled; do not pre-escape.
- [ ] Two `IconButton`s per row ([`icon-button.tsx:101`](../../../packages/app/src/components/icon-button.tsx)),
      taking their `icon` and `label` from
      [`agent-commands.ts:132`/`:146`](../../../packages/app/src/features/agent/agent-commands.ts)'s
      existing `execAdhoc` and `brainstorm` entries rather than choosing new glyphs. The registry
      already made this decision.
- [ ] Firing either sets `status: 'planned'` and leaves `body` and `done` untouched. **A note is
      never auto-deleted and never auto-completed** by a handoff.
- [ ] `implemented` is set by the user, from the row (Decision 3) — no attempt to infer it from a
      session exiting or a PR merging in this phase.
- [ ] The action buttons are disabled, with a `disabledReason` in the tooltip, when **the note's
      `repoId` is not in the current repos query** — not when "there is no resolvable repo root",
      which cannot happen (`primaryTarget` always returns a path). A note outliving its repository is
      the real case, and it is reachable because Theme A no longer GCs.
- [ ] `use-skill-handoff.test.ts`: the resolved skill follows a changed `agentSkills` value; the
      prompt contains no backticks; `autoSend` is `false`; a handoff mutates only `status`; the
      button is disabled for a note whose repo is absent.

### E — The quick-access menu (M)

- [ ] Add [`packages/app/src/features/quick-access/quick-access-menu.tsx`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx):
      `export function QuickAccessMenu({ onClose }: { onClose: () => void }): JSX.Element` — one
      component, rendered from two places, never forked.
- [ ] Rows reuse [`context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx)'s
      existing `MenuItem` shape (`label`, `icon`, `description`, `disabled`, `disabledReason` — as
      used at `midnite-menu.tsx:76-79`), extended with one field: `mnemonic: string`. Do not invent a
      parallel row type; the four fields already exist and are already styled.

      | Key | Row | State |
      |-----|-----|-------|
      | `L` | Loops — the four agent loops and their consoles | live |
      | `N` | Notes — capture a thought against this repository | live |
      | — *delimiter* — | | |
      | `I` | Report Issue — file it against `bilo-io/midnite-apps` | disabled |
      | `G` | Guided tour — a walkthrough of the workspace | disabled |

- [ ] **Mnemonic dispatch, and the honest version of the hazard.** The global dispatcher
      ([`use-keybindings.ts:93`](../../../packages/app/src/services/keybindings/use-keybindings.ts))
      listens **capture-phase on `window`**, so a menu-local bubble handler runs after it. But
      `DEFAULT_KEYMAP` contains **zero unmodified single-letter chords**, so a leaked bare `n` finds
      no candidates and returns at `:48` — it cannot fire a command. The real leak is a letter
      reaching a focused `.xterm` textarea.
      **Chosen fix:** mirror the palette's gate at `use-keybindings.ts:60-71` — add a
      `quickAccessOpen` check there — rather than racing the capture phase from inside the menu.
      One gate, in the place that already has one.
- [ ] Arrow keys roam, Enter activates, Escape closes, and clicking a row does what its mnemonic
      does — the keyboard path is an accelerator, never the only path.
- [ ] Disabled rows are focusable and carry `aria-disabled`; their mnemonic no-ops, shows the
      `disabledReason` as a "coming soon" hint, and **leaves the menu open** (Decision 4).
- [ ] **Entry point 1 — the FAB.** [`app.tsx:1484`](../../../packages/app/src/app.tsx)'s button, whose
      `onClick` (`:1486-1497`) calls `toggleFabPanel()` at `:1496`, opens the menu instead.
      `captureFabMorphOrigin` (`:1495`) and the `FabLoopHalo` wrapper stay exactly as they are, and so
      does the `fabDetached` early-return branch at `:1492-1494` — only what the click *means*
      changes. Add a `data-testid` while here; the button has none and Theme G needs one.
- [ ] **Entry point 2 — the assistant menu.** Replace `Midnite Assistant Menu (Blank for now)` at
      [`assistant-menu.tsx:82`](../../../packages/app/src/features/status-bar/assistant-menu.tsx)
      with the same component. Its mini-FAB mode (`:37-61`) and its local `useState` trigger (`:24`)
      are untouched.
- [ ] The menu registers as an occluder, like every other overlay.
- [ ] `quick-access-menu.test.tsx` (RTL): the four rows and their order; mnemonics activating;
      disabled mnemonics no-opping **without closing**; arrow roaming; the `quickAccessOpen` gate
      being set while open and cleared on close.

### F — Commands, keybindings and the doc sync (S)

- [ ] In [`shared/src/keybindings.ts:128`](../../../packages/shared/src/keybindings.ts), re-point
      `fab.toggle`: `Mod+l` now **opens the quick-access menu**, not the Loops panel. Change its
      `label` from `'Toggle Loop Panel'` to `'Quick Access'` — a stale label surfaces in the palette
      and the native menu bar, not just in source.
- [ ] `fab.toggle` **stays in `TERMINAL_YIELD_COMMANDS`** (`:332`). `Mod` is Ctrl off macOS and
      `Ctrl+L` is every shell's clear-screen; the reason it yields has not changed.
- [ ] Add `{ id: 'notes.toggle', label: 'Notes', group: 'view' }` to `COMMANDS` — **no `chord`**,
      following the chord-free precedent `view.refresh` and `sync.fetch` set, and therefore **not**
      added to `TERMINAL_YIELD_COMMANDS` (which is a list of chords to yield; a chord-free command has
      nothing to yield).
- [ ] Wire both in [`use-command-handlers.ts:154`](../../../packages/app/src/services/keybindings/use-command-handlers.ts),
      beside the existing `'fab.toggle': { enabled: true, run: () => useUiStore.getState().toggleFabPanel() }`.
- [ ] Hold both open flags in [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) —
      `quickAccessOpen` and `notesOpen`, with their setters — and **exclude both from `PersistedUi`**
      (`:1127-1200`). `fabPanelOpen` *is* persisted (`:1160`), so "beside `fabPanelOpen`" would have
      meant persisting a modal's open state and reopening it on every launch. Excluding them means
      **no `version: 8 → 9` bump and no `migrate` arm**, which is the point.
- [ ] **Fix the native accelerator — it exists, and the first draft was wrong to call this a
      confirmation.** [`menu.ts:120`](../../../packages/desktop/src/main/menu.ts) registers
      `item('fab.toggle')`, and `item()` (`:52`) sets `accelerator: accelerator(command)` =
      `CmdOrCtrl+L`. An OS accelerator fires whenever the window is focused, **xterm included**, which
      already defeats `TERMINAL_YIELD_COMMANDS` today. Switch it to `itemNoAccelerator('fab.toggle')`
      (`menu.ts:77`), the helper that exists for exactly this.
- [ ] **Three-way doc sync.** `Mod+l` is documented as "the Loops panel" at
      [`CLAUDE.md:175`](../../../CLAUDE.md), [`AGENTS.md:175`](../../../AGENTS.md) and
      [`GEMINI.md:175`](../../../GEMINI.md) — the same line number in all three. All three change
      together, per the rule at the top of each.

### G — Verification, tests and the visual pass (M)

- [ ] Playwright: the menu opens from **both** entry points and renders the same four rows.
- [ ] Playwright: `Mod+L` then `N` opens Notes; `Mod+L` then `L` opens the Loops panel; `Mod+L` then
      `I` changes nothing but leaves the menu open.
- [ ] Playwright: full note lifecycle — create, edit in place, hand off to a plan, tick it off, hide
      completed, delete.
- [ ] Playwright: the handoff seeds the terminal **typed and not sent** — assert the pty received no
      `\r`, which is what `autoSend: false` means at
      [`start-agent.ts:101`](../../../packages/app/src/features/terminal/start-agent.ts).
- [ ] Playwright: with the browser pane open on a page, opening the Notes modal **hides the
      `WebContentsView`** and closing it restores it — the occluder contract, tested rather than
      trusted.
- [ ] Playwright: notes written against repo A are absent when repo B is selected.
- [ ] A reload preserves notes, and **closing a repository does not delete its notes** (Theme A's
      reversal, asserted — this is the behaviour most likely to be "fixed" back by a later reader).
- [ ] Screenshots in `packages/app/e2e/notes-shots.spec.ts` — the menu from both entry points and the
      Notes modal, light and dark. **Coordinate with [Phase 56](phase-56-e2e-speed-run.md) Theme G**,
      which is mid-flight moving all 25 `*-shots.spec.ts` onto a shared `e2e/shots-helper.ts`: use
      that helper if it has landed, and rebase onto it if not.
- [ ] `moon run :typecheck :lint :test` green, and the e2e suite green **without a new `KNOWN_RED`
      entry** ([Phase 38](phase-38-e2e-suite-repair.md) exists to shrink that list, not feed it).
- [ ] **Open, for a human:** live with it for a few days. The questions the plan cannot answer are
      whether `Mod+L` losing its direct line to the Loops panel is a real cost, and whether a note
      that has been handed off actually gets ticked off afterwards.

---

## Files this phase touches

**New**
- [`packages/app/src/store/notes-store.ts`](../../../packages/app/src/store/notes-store.ts) — the store (A).
- [`packages/app/src/components/modal.tsx`](../../../packages/app/src/components/modal.tsx) — the primitive (B).
- `packages/app/src/components/occluder-coverage.test.tsx` — the twelve-overlay regression guard (B).
- [`packages/app/src/features/notes/notes-modal.tsx`](../../../packages/app/src/features/notes/notes-modal.tsx) — the surface (C).
- [`packages/app/src/features/notes/note-row.tsx`](../../../packages/app/src/features/notes/note-row.tsx) — one note (C, D).
- `packages/app/src/features/agent/use-skill-handoff.ts` — the extracted handoff (D).
- [`packages/app/src/features/quick-access/quick-access-menu.tsx`](../../../packages/app/src/features/quick-access/quick-access-menu.tsx) — the menu (E).
- `packages/app/e2e/notes-shots.spec.ts` — screenshots (G).

**Changed**
- [`packages/app/src/features/agent/midnite-menu.tsx`](../../../packages/app/src/features/agent/midnite-menu.tsx) — refactored onto `use-skill-handoff.ts`; **the file the first draft never mentioned** (D).
- [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) — the FAB button at `:1484` opens the menu; mount the Notes modal; add a `data-testid` (E).
- [`packages/app/src/features/status-bar/assistant-menu.tsx`](../../../packages/app/src/features/status-bar/assistant-menu.tsx) — the blank popover at `:82` gains the menu (E).
- [`packages/app/src/components/prompt-dialog.tsx`](../../../packages/app/src/components/prompt-dialog.tsx) · [`features/browser/browser-launcher.tsx`](../../../packages/app/src/features/browser/browser-launcher.tsx) — migrated onto `Modal` (B).
- The ten unmigrated `z-dialog` overlays — occluder pair only, two lines each (B).
- [`packages/app/src/services/keybindings/use-keybindings.ts`](../../../packages/app/src/services/keybindings/use-keybindings.ts) — the `quickAccessOpen` gate beside the palette's, at `:60-71` (E).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `quickAccessOpen` + `notesOpen`, **not** in `PersistedUi` (F).
- [`packages/shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — `fab.toggle` re-pointed and re-labelled, `notes.toggle` added (F).
- [`packages/desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts) — `item('fab.toggle')` at `:120` → `itemNoAccelerator` (F).
- [`packages/app/src/services/keybindings/use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts) — both handlers (F).
- [`packages/app/src/styles.css`](../../../packages/app/src/styles.css) — a `prefers-reduced-motion` rule beside `.gradient-frame`'s keyframes (B).
- [`CLAUDE.md`](../../../CLAUDE.md) · [`AGENTS.md`](../../../AGENTS.md) · [`GEMINI.md`](../../../GEMINI.md) — the `Mod+l` paragraph at line 175 of each (F).

**Deliberately unchanged**
- [`packages/app/src/features/loops/fab-launchers.tsx`](../../../packages/app/src/features/loops/fab-launchers.tsx) — the title-bar strip keeps its hover expansion (Decision 6).
- [`packages/app/src/features/browser/use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts) — it *consumes* `occluders`; the registration gap is fixed in the overlays, not here.
- [`packages/app/src/components/palette.tsx`](../../../packages/app/src/components/palette.tsx) · [`features/slides/slides-modal.tsx`](../../../packages/app/src/features/slides/slides-modal.tsx) — not migrated (Decision 5); they gain only the occluder pair.

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: nothing new in `git-engine`; `shared` gains only the two command-registry entries; `desktop` only the `menu.ts` accelerator change; the renderer reaches main through `window.midniteStudio` as before.
- [ ] `localStorage` holds exactly one new key, `midnite-studio.notes`, surviving a reload and a hard reload; `midnite-studio.ui` stays at `version: 8`.
- [ ] `notesForRepo` returns newest-first; `status` and `done` move independently; a handoff mutates neither `body` nor `done`.
- [ ] The resolved skill string follows a changed `agentSkills` setting, and the seeded prompt contains no backticks.
- [ ] **All twelve** `z-dialog` overlays leave `occluders` at 0 after unmount and 1 while open — not just the two migrated ones.
- [ ] Focus returns to the triggering element when a `Modal` closes.
- [ ] The in-place editor's Escape cancels the edit and **does not** close the Notes modal.
- [ ] Every migrated dialog (Theme B) still passes its existing specs unchanged — check `prompt-dialog.test.tsx` exists before relying on this line.
- [ ] No native `CmdOrCtrl+L` accelerator is registered: `Ctrl+L` inside a focused terminal clears the screen and does not open the menu.
- [ ] `notes.toggle` appears in the command palette and has no chord.
- [ ] The three convention files agree with each other on `Mod+l` — diff them.
- [ ] **Open, for a human:** the visual pass on the gradient ring in both themes, and whether the modal at 80vh is the right size on a laptop display.

---

## Not in this phase

- **Markdown rendering, search, tags, reordering.** A note is a body of text with a status.
- **Migrating the other ten `z-dialog` overlays onto `Modal`.** They get the occluder fix and nothing else — Decision 10.
- **Inferring `implemented` from a merged PR or an exited session.** Decision 3.
- **A global (repo-less) notes bucket.** Decision 1 accepts the cost and ships an empty state that names it.
- **Bringing `passcode-pad`'s raw `z-[110]` into the Tailwind scale.** Unrelated tidy.

---

## Decisions / open questions

1. **Resolved — per-repository, not global.** Notes belong to a repository, and switching repos swaps
   the list. The cost is real and accepted: a thought with no repo open has nowhere to land, which is
   why Theme C ships a distinct empty state saying so. If that empty state gets hit often in practice,
   the fix is a "global" pseudo-repo, not a re-model.

2. **Resolved — `status` and `done` are two axes, not one.** `captured → planned → implemented`
   records what the *workflow* has done with a note; `done` records that *you* are finished with it.
   Collapsing them would make "I handed this to an agent" and "I'm happy with the result" the same
   fact, and they routinely aren't.

3. **Resolved — the user sets `implemented`, manually, this phase.** Inferring it from a merged PR is
   the obvious follow-up and the obvious trap: the handoff records nothing about which PR resulted,
   and guessing wrong marks work done that isn't. A later phase can wire the real signal once notes
   carry a session or PR reference worth trusting.

4. **Resolved — a disabled mnemonic no-ops and keeps the menu open**, showing the row's
   `disabledReason` as a "coming soon" hint. Closing the menu would read as "that worked"; a modal
   error would be absurd for a feature that doesn't exist yet.

5. **Resolved — Theme B migrates `prompt-dialog` and `browser-launcher`.** The first is the simplest
   possible consumer; the second already hand-rolls the occluder pair, so its migration is a net
   deletion and proves the primitive covers the hard case. `palette` is left alone because its
   `items-start pt-[15vh]` geometry is what `align="top"` exists to support but not what should
   prove it; `slides-modal` because it has **no backdrop at all** (`bg-background`, opaque,
   full-bleed) and is therefore not a modal in the sense `Modal` models.

6. **Resolved — the title-bar launcher strip survives.** Folding the four loop glyphs into the menu
   would make every loop three keystrokes away instead of one hover and a click, and the strip is
   also the app's live-agent indicator — `expanded = anyLive || fabPanelOpen || reached`
   (`fab-launchers.tsx:91`). It is a status readout that happens to be clickable, which a menu is not.

7. **Resolved — `Mod+L` no longer opens Loops directly**, with a known cost. Loops becomes `Mod+L`
   then `L`. This is a documented binding changing meaning, which is why Theme F treats the three
   convention files as a deliverable. The cheap reversal — a chord-free `loops.open` promoted to
   `Mod+Shift+L` — is **not** available: `app.lock` holds that chord
   ([`keybindings.ts:204`](../../../packages/shared/src/keybindings.ts)). If the extra keystroke
   grates, the reversal costs a third binding, so decide it deliberately rather than assuming an exit.

8. **Resolved — the menu does not get its own gradient.** It is a popover-scale surface;
   `gradient-border--always` from `popover.tsx` is the right weight. The full `.gradient-frame` ring
   is for the Notes panel, which is large enough to carry it.

9. **Resolved — no hard cap on note body length.** `~/Dev/midnite` caps at 2,000 characters; a cap on
   a `localStorage` note protects nothing and turns a paste into a silent truncation. The row clamps
   to ~3 lines with the full body in the editor.

10. **Resolved — the occluder fix and the `Modal` migration are separate items.** Eleven of the
    twelve `z-dialog` overlays are painted under a live `WebContentsView` today. That is a live bug
    affecting `palette`, `confirm-dialog` and `merge-dialog` among others, and it must not wait for
    a thirteen-file refactor. Two lines each now; the migration when someone touches each file
    anyway.

11. **Resolved — `Modal`'s Escape defers to [Phase 62](phase-62-one-escape-one-dismissal.md).** P61
    builds `useDismiss(active, onDismiss, { layer })`, a single-listener LIFO stack that makes one
    Escape dismiss one thing. If P61 lands first, `Modal` calls it and writes no keydown effect of
    its own; if P58 lands first, `Modal` writes a plain effect and P61's Theme B migrates it like the
    other seventeen. Both docs carry this seam. The one file both phases touch is
    `prompt-dialog.tsx` — a merge conflict, not a design conflict.

12. **Resolved — notes are NOT garbage-collected when a repository closes**, reversing the first
    draft. [`dashboard-store.ts:198-207`](../../../packages/app/src/store/dashboard-store.ts) — the
    store this one claims to copy — declines exactly this, on the grounds that *"re-adding one to
    find its dashboard reset would make the persistence pointless."* A note is more expensive to lose
    than a board layout, so the argument is stronger here. The replacement is an explicit,
    user-initiated prune in the Notes header. Theme G asserts the non-deletion, because this is the
    item a later reader is most likely to "fix" back.

13. **Open — should the menu's mnemonic gate live in `use-keybindings.ts` or in the menu?** Theme E
    picks the gate at `use-keybindings.ts:60-71`, mirroring the palette. *Recommendation:* keep it
    there. The alternative — a capture-phase listener inside the menu racing the global one — works
    but puts the ordering knowledge in two places, and the palette already established which place.

14. **Open — does `use-skill-handoff.ts` belong in `features/agent/` or `features/notes/`?**
    Theme D puts it in `features/agent/` because `midnite-menu.tsx` is its other caller.
    *Recommendation:* `features/agent/`. A hook that resolves an agent and spawns a terminal is agent
    code that Notes happens to use, not notes code.
