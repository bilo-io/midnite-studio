# Phase 81 — Where the companion can take you, and what it may touch

**Written directly** (no human in the loop — see Decisions) · 2026-09-09 · from a direct user
request relayed through the coordinating session, run unattended per that session's own
instructions (no `AskUserQuestion`; every call the user would normally make is recorded below,
with the alternatives it beat).

[Phase 79](phase-79-the-companion-that-answers-back.md) gave the companion a voice, a thread and
one kind of hand: it can start one of ten agent skills in a pty. [Phase 80](phase-80-what-the-companion-says-and-what-you-call-it.md)
made it sound like a person and answer to a name. Say "take me to the graph" to it today and it
does the one thing it knows how to do with a sentence it does not recognise — asks the installed
CLI to route it, is told by its own prompt to omit any intent that is not one of the ten, and
answers with a sentence and no action. With no CLI installed it is worse: the words are typed
verbatim into a fresh agent session, so "open settings" becomes an agent's prompt.

This phase gives the companion the rest of the app. It can **go to any view or settings page**,
**focus a window that is already detached** instead of opening a second copy, **run the commands
the palette runs** — by tier, with a spoken confirmation where a click would have been one — and
**start every `midnite-` skill it was missing**. And because the human opened the door to it, the
same engine is offered back to the agents the companion hands off to: three narrow, opt-in
**`ui.*` MCP tools** so a session can say "I've opened the PR — here it is" and actually show you.
It builds nothing else. The companion gains no git operation, no new inference path and no way to
answer a dialog.

> **Seven findings, verified against the current tree, that this phase is built on.**
>
> **1. The companion's action vocabulary is closed at ten skills, and everything else falls
> through to a router that is told to do nothing.** `CompanionIntentSchema`
> ([`companion.ts:1767-1789`](../../../packages/shared/src/companion.ts)) is
> `command | switchRepo | dismiss | music | repeat | stop | anyway | freeform`; `command.id` is
> `z.enum(COMPANION_COMMAND_IDS)` — ten `AgentCommandId`s (`companion.ts:1691-1702`). There is no
> `navigate` and no `run`. `act()` in [`handoff.ts`](../../../packages/app/src/features/companion/handoff.ts)
> switches on exactly those kinds, and `route()` (the `freeform` arm) sends the sentence to
> `mstudio:companion:ask`, whose `'route'` prompt in
> [`ask.ts`](../../../packages/desktop/src/main/companion/ask.ts) `buildAskPrompt` lists
> `COMPANION_COMMAND_IDS.join(', ')` and says *"If none of that fits, OMIT `intent` entirely"*. So
> a navigation request is, by design, a spoken sentence with no action — and when
> `resolveHeadlessAgent` finds no CLI, `route()` calls `deps.startVerbatim(text)`, which types the
> user's words into a new agent pty.
>
> **2. The app already has two navigation vocabularies, and the palette uses both.**
> `COMMANDS` ([`keybindings.ts:64`](../../../packages/shared/src/keybindings.ts)) carries five
> `view.*` commands plus `graph.focus`/`status.focus` — seven rows reaching **five** of the twenty
> `ViewId`s (`view.graph`, `view.files`, `view.issues`, `view.video`, `view.apiClient`;
> `use-command-handlers.ts:361-367` is the whole list, and
> [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) `VIEW_COMMAND` maps the same
> five). The other fifteen views and every settings page are reached by the palette's
> `createViewsSource` ([`providers.ts:150-188`](../../../packages/app/src/services/palette/providers.ts)),
> which iterates `VIEW_IDS` and `SETTINGS_PAGES` directly and calls `setActiveView`/`setSettingsPage`
> — with a `VIEW_LABELS` and a `VIEW_KEYWORDS` map (`providers.ts:27-71`) that is already the
> synonym table a spoken sentence needs ("postman", "kanban", "reflog", "db"). **"Expose `COMMANDS`
> to the companion" is therefore necessary and not sufficient**: it covers what the app can *do*,
> not where it can *go*. Adding fifteen chord-free `view.*` commands to close the gap would put
> fifteen duplicate rows in the palette, which already lists every view once. The companion should
> mirror the palette's own split — views and settings pages by id, commands by `CommandId` — and
> read its words from the same two tables.
>
> **3. The command runtime is a hook, and nothing outside a render can call it.**
> `useCommandHandlers()` ([`use-command-handlers.ts:61`](../../../packages/app/src/services/keybindings/use-command-handlers.ts))
> builds `CommandRuntime = Record<CommandId, { run, enabled, disabledReason? }>` fresh every render;
> [`app.tsx:611`](../../../packages/app/src/app.tsx) passes it straight into `useKeybindings(runtime)`,
> and the palette receives it as an argument (`createCommandSource(runtime, …)`). Main-originated
> commands already flow through the same object — `use-keybindings.ts:105` subscribes to
> `menu.onCommand` and runs `runtime[command]`. But the companion's
> [`runtime.ts`](../../../packages/app/src/features/companion/runtime.ts) is *"plain functions over
> `getState()` and `bridge()`. No hooks, no context, no provider"* — for the reason it states: a turn
> outlives the render that started it. There is no module-level `runCommand(id)`. The pattern for a
> renderer handle a plain function can call already exists four times in this dispatcher's own
> imports: [`commit-box-store.ts`](../../../packages/app/src/store/commit-box-store.ts)
> (`register(handle)`/`unregister(handle)` from the component that owns the commit box — `status.commit`
> runs through it), [`theme-import-command-store.ts`](../../../packages/app/src/features/themes/theme-import-command-store.ts),
> [`workflow-run-command-store.ts`](../../../packages/app/src/store/workflow-run-command-store.ts)
> and [`panel-stack/active-panel.ts`](../../../packages/app/src/components/panel-stack/active-panel.ts)
> — plus [`companion-ports.ts`](../../../packages/app/src/features/companion/companion-ports.ts)
> (merge registry, no-op defaults) one directory over.
>
> **4. Detached-ness is renderer state, focusing a role is one line, and the trap is the
> companion's own window.** `detachedPages: readonly PageWindowRole[]`
> ([`ui-store.ts:729`](../../../packages/app/src/store/ui-store.ts)) plus the five `*Detached`
> flags say what is out; [`page-detach-mark.tsx:44-70`](../../../packages/app/src/components/page-detach-mark.tsx)
> already implements the exact three-way branch capability 2 needs (*main window, no popout → detach;
> main window, popout open → `window.focusRole`; inside the popout → dock*).
> `mstudio:window:focus-role` ([`channels.ts:675`](../../../packages/shared/src/ipc/channels.ts))
> is a one-way `ipcMain.on` ([`window-handlers.ts:49-55`](../../../packages/desktop/src/main/ipc/window-handlers.ts))
> that restores and focuses `windowForRole(role)`; `registerMainWindow` (`window-manager.ts:165`)
> puts `main` in the same map, so `focusRole({ role: 'main' })` resolves too. **No new IPC is needed
> to focus anything.** The trap: `'companion'` is itself a `PanelWindowRole`
> ([`window.ts:8`](../../../packages/shared/src/domain/window.ts)), a popout runs its **own**
> `useUiStore` (the `*Detached` flags *"are main's own — a popout's own ui-store instance never
> reflects them"*, `use-command-handlers.ts:76-78`) and its own `useCommandHandlers`
> ([`detached-root.tsx`](../../../packages/app/src/detached-root.tsx)). A companion speaking from
> its detached window that calls `setActiveView('graph')` would change the popout's store and
> nothing the user can see. `WindowRelayMessage.kind` ([`schemas.ts:1813-1823`](../../../packages/shared/src/ipc/schemas.ts))
> has nine kinds and none carries an action.
>
> **5. There is an allowlist precedent, and it is one bit wide.** `PALETTE_SAFE`
> ([`features/palette/safety.ts:13`](../../../packages/app/src/features/palette/safety.ts)) is
> *"statically defined as an allowlist so any future destructive command added in keybindings is
> absent from the palette by default rather than accidentally exposed"* — exactly the posture this
> phase needs, and its comments already argue each row. But it answers one question — may a click
> run this? — and `sync.push`, `status.commit`, `repo.close` and `app.hardReload` all answer yes.
> A misheard sentence is not a click. Some of what is safe to *click* is not safe to *say*, and the
> difference is a second bit, not a second list.
>
> **6. The MCP server is read-only by type, has no window, and its writes were deferred pending
> "a consent model".** `McpToolEntry.readOnly` is the literal `true`
> ([`mcp.ts:67-68`](../../../packages/shared/src/mcp.ts): *"Always `true` in this phase — write
> tools are a deferred follow-up (Decision 5)"*). [Phase 57](phase-57-mcp-server.md) Decision 2
> dispatches *"directly to the services behind `ipcMain`, never through `ipcMain` itself … an MCP call
> has no window"*, and Decision 5 deferred `stage`/`commit`/`branch.create` because *"an agent
> committed something while I wasn't looking is a trust failure that would poison the feature"*.
> The only main→renderer command push in the tree is `menu.ts:30`'s
> `webContents.send(EVENT_CHANNELS.menuCommand, command)` — one-way, no reply. There is no
> main→renderer request/reply anywhere under `main/`. Steering the UI is a categorically smaller
> hazard than committing (nothing leaves the window, every step is visible and one keystroke
> undoes it), but it *is* a remote process changing what the user is looking at, and the same
> consent question applies at a smaller scale.
>
> **7. Two `midnite-` skills have no id at all, and two more are excluded on a reason that no
> longer distinguishes them.** [`.claude/skills/`](../../../.claude/skills/) holds twelve
> `midnite-*` skills. `AgentCommandId` ([`ui-store.ts:1469-1490`](../../../packages/app/src/store/ui-store.ts))
> has twenty-one ids and `DEFAULT_AGENT_SKILLS` (`:1512`) maps them — but **`midnite-triage` and
> `midnite-setup` appear nowhere in either**: triage exists only as a string the FAB's Patrol tab
> appends to `loopPatrol`, and setup is the midnite menu's own Setup leaf, deliberately kept out of
> `AGENT_COMMANDS` because it hands over no skill (`agent-commands.ts:40-52`). `COMPANION_COMMAND_IDS`
> then takes ten of the twenty-one, excluding every `loop*` (*"runs unattended on a timer"*) and both
> release ops (*"`releasePrep` writes a branch, `releaseComplete` is irreversible by design"*).
> `execAdhoc` also writes a branch. The property that actually separates `releaseComplete` is that it
> tags and pushes; `releasePrep` stops *"before anything irreversible"* by its own SKILL.md, and
> under typed-not-sent it is no more dangerous than any other skill in the list.

**Builds on.** Phase 79 end to end — `act()`/`route()`/`startCommand()` in `handoff.ts`, the
`HandoffDeps`/`ConciergeDeps` port sets, `parseIntent`'s verb tables, the `ask` channel and its
`buildAskPrompt`, `companion-ports.ts`, and the typed-not-sent rule enforced at `skillHandoff`
([`use-skill-handoff.ts:63`](../../../packages/app/src/features/agent/use-skill-handoff.ts)). Phase 80
Theme D's `matchesCompanionName` sits beside the grammar this extends. [Phase 23](phase-23-command-palette.md)'s
palette — `PALETTE_SAFE`, `createCommandSource`, `createViewsSource`, `VIEW_LABELS`/`VIEW_KEYWORDS`.
[Phase 55](phase-55-multi-window-studio.md)'s window roles, `windowFocusRole`, `detachedPages`,
`page-detach-mark.tsx` and the `window.relay` transport. [Phase 57](phase-57-mcp-server.md)'s
`MCP_TOOLS` registry, `dispatchMcpCall`, the audit ring, `mcp-store.ts` and the stdio shim.

**Scope guardrails.**
- **The companion gains no git operation.** Not one new `ops.*` call, not one new channel that
  enters `writeQueue.run`. `sync.pull`, `sync.push` and `status.commit` become reachable **only** as
  `CommandId`s run through the identical `CommandEntry.run` a keystroke uses — with every dialog,
  `GitOpResult` conflict rendering and blast-radius confirm those paths already have. Force-push is
  not a `CommandId` and stays unreachable. `browser.clearData` is `never` (Theme C).
- **The companion never answers a dialog.** A `useDialogs` confirm needs a click. Nothing in this
  phase adds a way to accept, dismiss or pre-answer one, and the e2e in Theme C asserts a confirm
  dialog raised by a companion-run command is still on screen when the companion has finished
  speaking.
- **Every action executes in the main window.** A companion in a popout relays, never acts locally
  (Finding 4). The MCP path targets the main window explicitly, never the focused one.
- **Hands-free changes nothing here.** `autoSendAllowed()` gates *skills*. `confirm`-tier commands
  wait for a spoken "yes", an empty Return, or a click — with hands-free on or off. `never` is never.
- **MCP `ui.*` is off by default, direct-tier only, and refused while locked.** It is a second
  switch under the existing `Settings ▸ MCP` master switch, not a widening of it. `confirm`-tier
  commands and skills are not offered to an agent at all — an agent that could start a skill would
  be an agent starting agents unattended, which is the `loop*` hazard Phase 79 already refused.
- **`shared` gets schemas, ids and pure functions only.** No React, no `electron`, no `node:*`.
  `ViewId`/`VIEW_IDS` and `SettingsPageId`/`SETTINGS_PAGE_IDS` move there as plain unions (Theme A,
  Decision 3); their labels and keywords — UI copy — stay in `app`.
- **No new renderer dependency.** Total JS is already over budget (Phase 77).

Effort tags: **S** ≈ 30 min–2 h · **M** ≈ 2–4 h · **L** ≈ 4–8 h.

**Sequencing.** **A first** — everything else consumes its vocabulary, its access map and its
`runCommand`. **B and C are independent of each other** once A has landed, and each ships a
user-visible capability on its own (B: "take me to the graph"; C: "push"). **D** needs A's
vocabulary shape only and can land in parallel with B/C. **E** needs A, B, C and D's *schemas*
— it is the router catching up with the grammar, so it lands after them or it would be teaching
the CLI intents nothing can act on. **F last**: it reuses A's engine and B/C's `act()` arms, adds
the one new IPC pair and the MCP-side gate, and is the only theme that can be dropped without
leaving a seam behind. Phase 80's open items are verification-only (three human-pass boxes and two
unit-test boxes under Themes A and D) and touch `sanitizeForSpeech`/`matchesCompanionName`; nothing
here edits those functions, so the two phases do not collide.

## Deliverables

### A — One vocabulary, one engine (M)

Where the companion's words come from and how a plain function runs a command. Nothing in this
theme is reachable from the thread yet; B, C and D wire it.

- [x] Move `ViewId` and `VIEW_IDS` from [`ui-store.ts:120-172`](../../../packages/app/src/store/ui-store.ts)
      to a new [`packages/shared/src/domain/view.ts`](../../../packages/shared/src/domain/view.ts)
      (`export const VIEW_IDS = [...] as const; export type ViewId = (typeof VIEW_IDS)[number]`),
      taking the ordering docblock with them; do the same for `SettingsPageId` (`:180-203`) as
      `SETTINGS_PAGE_IDS`. `ui-store.ts` **re-exports both** (`export type { ViewId, SettingsPageId }
      from '@midnite/studio-shared'; export { VIEW_IDS, SETTINGS_PAGE_IDS } …`) so none of the
      existing `import type { ViewId } from '../store/ui-store'` sites move.
  - *Acceptance:* `PAGE_WINDOW_ROLES` in [`window.ts:26`](../../../packages/shared/src/domain/window.ts)
    gains `satisfies readonly ViewId[]` — the "named by the `ViewId` they render" comment becomes a
    type. `VIEW_COMPONENT: Record<ViewId, ViewEntry>` ([`view-registry.tsx:110`](../../../packages/app/src/components/view-registry.tsx))
    and `SETTINGS_PAGES` still typecheck total with no edit.
  - *Acceptance:* `moon run :typecheck` green with zero import-path churn outside the two files.
- [x] Export `VIEW_LABELS` and `VIEW_KEYWORDS` from
      [`services/palette/providers.ts:27,50`](../../../packages/app/src/services/palette/providers.ts)
      (today module-private `const`s). No content change — the palette's words are the companion's
      words, and a second table would be the drift this phase exists to avoid.
- [x] Add `CompanionVocabularySchema` to [`shared/src/companion.ts`](../../../packages/shared/src/companion.ts):
      ```ts
      { views: { id: ViewId, label: string, keywords: string }[],
        settingsPages: { id: SettingsPageId, label: string }[],
        commands: { id: string, label: string, group: CommandGroup, access: 'direct' | 'confirm' }[],
        skills: { id: CompanionCommandId, label: string, hint: string }[],
        repos: string[] }
      ```
      and a `CompanionAccess = 'direct' | 'confirm' | 'never'` type beside it. `commands` carries
      **only** `direct` and `confirm` rows — a `never` command is not a word the companion knows.
- [x] Add `COMMAND_ACCESS: Record<CommandId, CompanionAccess>` to
      [`features/palette/safety.ts`](../../../packages/app/src/features/palette/safety.ts) beside
      `PALETTE_SAFE`, **total by type** (`Record`, not `Partial` — a new `CommandId` fails
      `:typecheck` until someone decides how the companion may use it, the same guarantee
      `VIEW_COMPONENT` and `CommandRuntime` already give). One comment per non-obvious row, in
      `PALETTE_SAFE`'s own voice. The starting table is Decision 5.
  - *Acceptance:* a vitest in `safety.test.ts` asserts every `direct`/`confirm` id is in
    `PALETTE_SAFE` **or** in a named `ID_DISPATCH_OK` list (the rows `PALETTE_SAFE` excludes only
    because they *"share a chord with a command whose meaning depends on runtime state"* — the
    companion dispatches by id, so that reason does not apply: `terminal.new`, `terminal.close`,
    `browser.newTab`, `browser.closeTab`, `browser.nextTab`/`prevTab`/`reopenTab`/`selectTab1-9`,
    `browser.find`, the six zoom rows, `panel.back`/`forward`, `search.open`, `activity.toggle`,
    `terminal.toggleHalfMaximized`, `app.lock`, `app.screensaver`). Everything else outside
    `PALETTE_SAFE` must be `never`. The companion is provably no wider than the palette.
  - *Acceptance:* `browser.clearData`, `companion.toggle`, `op.abort`, `op.continue` are `never`,
    asserted by name.
- [x] Add [`features/companion/command-runtime.ts`](../../../packages/app/src/features/companion/command-runtime.ts):
      a module registry in `companion-ports.ts`'s shape — `setCommandRuntime(runtime: CommandRuntime | null)`
      and `runCommand(id: CommandId): { ok: true } | { ok: false; reason: 'unknown' | 'disabled' | 'no-runtime'; message: string }`.
      `app.tsx:611` becomes `const runtime = useCommandHandlers(); useKeybindings(runtime);
      useEffect(() => setCommandRuntime(runtime), [runtime]);` — only when `bridge().windowRole === 'main'`
      (a popout's runtime disables every main-window command and must not be the one registered).
  - *Acceptance:* `runCommand` on a disabled entry returns `{ ok: false, reason: 'disabled', message: entry.disabledReason ?? … }`
    and calls nothing — `disabledReason` is the sentence the companion will speak, verbatim
    ("Open a repository first").
- [x] Add [`features/companion/vocabulary.ts`](../../../packages/app/src/features/companion/vocabulary.ts):
      `buildVocabulary(repos: readonly RepoDescriptor[]): CompanionVocabulary` from `VIEW_IDS` ×
      `VIEW_LABELS`/`VIEW_KEYWORDS`, `SETTINGS_PAGES`, `COMMANDS` × `COMMAND_ACCESS` (dropping
      `never`), `AGENT_COMMANDS` filtered to `COMPANION_COMMAND_IDS`, and repo names. Pure; memoised
      on the repo list identity. `runtime.ts` calls it once per flow beside `refreshRoster()` and
      hands it to the grammar (B/C/D) and to `ask` (E).
- [x] Extend `parseIntent` in `shared/src/companion.ts` to `parseIntent(text, vocabulary?)`: with no
      vocabulary it behaves exactly as today (every existing test passes unchanged); with one, the
      new kinds below are recognised. Existing skill verbs keep precedence.
  - `{ kind: 'navigate', view: ViewId, page?: SettingsPageId, issue?: number, url?: string }` —
    verbs `go to · open · show (me) · take me to · bring up · jump to · switch to`; the target is
    the longest word-boundary match over each view's label and keywords, case-insensitive;
    `settings` + a page's label word → `page`; `issue #?N`/`number N` on the issues view → `issue`;
    an `https?://` token → `url` with no `view` (the browser is a panel, not a view — Theme B
    handles it as the one special case). Verb and target rows go in `COMPANION_VERBS`'
    neighbourhood ([`companion.ts:1713-1729`](../../../packages/shared/src/companion.ts)), the
    existing table-driven shape.
  - `{ kind: 'run', id: CommandId }` — `z.string().refine(isCommandId)` (`keybindings.ts:499`;
    `COMMAND_IDS` is a mapped array, not a tuple, so `z.enum` cannot take it). Matched on a
    command's label words ("push", "pull", "fetch", "commit", "refresh", "new terminal", "zoom
    in", "toggle the terminal", "lock").
  - `{ kind: 'confirm' }` — `yes · yeah · go ahead · do it · confirm · run it`.
  - `{ kind: 'help' }` — `what can you do · help · what do you know`.
  - **"switch to X" is resolved repo-first, then view**: `vocabulary.repos` wins on a name match,
    otherwise the view table is consulted, otherwise `switchRepo` with the name as today (so
    "switch to bilo-mono" and "switch to the graph" both work, and "switch to graph" in a repo
    called `graph` picks the repo — the more specific noun).
  - *Acceptance:* table-driven tests, one row per verb × target class, plus negatives ("open the
    pod bay doors" is `freeform`; "push" alone with no vocabulary is `freeform`, unchanged;
    "graph" alone with no verb is `freeform` — a bare noun is not an instruction).
- [x] Extend `CompanionIntentSchema` with the four kinds and `CompanionAskReplySchema` follows for
      free (it embeds the intent schema). `handoff.ts`'s `act()` gains the four arms as **stubs
      that say "I can't do that yet"** in this theme, replaced in B, C and D — so the schema, the
      grammar and the switch land total together and `act()`'s exhaustiveness check stays a
      compile-time fact.

### B — Going there, and the window that is already out (M)

"Take me to the graph." "Open settings, the companion page." "Show me issue 212." And when the
graph is in its own window: bring that window forward, don't open a second graph.

- [x] `act()`'s `navigate` arm in [`handoff.ts`](../../../packages/app/src/features/companion/handoff.ts)
      calls a new `deps.navigate(intent)` and speaks the outcome. `HandoffDeps.navigate` is
      assembled in `runtime.ts` from a pure `resolveNavigation(intent, state)` in
      [`features/companion/navigate.ts`](../../../packages/app/src/features/companion/navigate.ts):
      ```ts
      type NavigationPlan =
        | { kind: 'view'; view: ViewId; page?: SettingsPageId; issue?: number }
        | { kind: 'focus-window'; role: WindowRole; title: string }
        | { kind: 'relay' }            // this renderer is a popout — hand it to main
        | { kind: 'refused'; reason: 'locked' | 'unknown-issue-repo' };
      ```
      `state` is `{ windowRole, detachedPages, panelDetached: Record<PanelWindowRole, boolean>, locked, repoId }`.
  - *Acceptance:* `view ∈ detachedPages` → `focus-window` with `role: view` (page roles are
    `ViewId`s by construction, Theme A's `satisfies`); a panel target whose `*Detached` flag is set
    → `focus-window` with that panel role; `windowRole !== 'main'` → `relay`; `locked` → `refused`
    (the Phase 46 lock screen is `screensaverLocked`, `ui-store.ts:1454`); otherwise `view`.
    Pure-function tests, one per branch.
- [x] Executing a `view` plan: `setActiveView(view)`; then `setSettingsPage(page)` when present
      (`providers.ts:171-173` is the exact two-call sequence); then
      `useIssuesStore.getState().selectIssue(repoId, issue)` ([`issues-store.ts:18`](../../../packages/app/src/store/issues-store.ts))
      when `issue` is present and a repo is selected. A `focus-window` plan calls
      `bridge().window.focusRole({ role })` — the same call `page-detach-mark.tsx:67` makes — and
      **nothing else**: no `setActiveView` in the main window, because the user asked for the thing
      they can see, not a second copy of it.
  - *Acceptance:* `setActiveView` no-ops when `view === activeView` (`ui-store.ts:1984-1995`), so
    the plan compares first and the companion says *"You're already on the {label}."* rather than
    "Here's the…" for a view that did not change.
  - *Acceptance:* `setActiveView` runs inside `useFileEditorStore.getState().guardNavigation(…)` —
    an unsaved editor buffer raises the save/discard dialog **and the navigation waits on it**. The
    companion says *"There's an unsaved file — the dialog is asking what to do with it."* and
    touches nothing (the guardrail above; the e2e seeds a dirty buffer and asserts the dialog is
    still up after the turn posts).
- [x] Add `window.detachCompanion` to `COMMANDS` ([`keybindings.ts:374-378`](../../../packages/shared/src/keybindings.ts)),
      group `window`, chord-free, beside the four existing `window.detach*` rows, wired in
      `use-command-handlers.ts` exactly as `window.detachFab` is. The research pass found it is the
      one panel role with no detach command — the companion's own header button is its only path —
      and a total `COMMAND_ACCESS` table is the moment to close that gap (it is `direct`, like its
      siblings). `PALETTE_SAFE` gains it beside `window.detachBrowser` with the same comment.
- [x] Spoken outcomes, through `say`: view → *"Here's the {label}."*; page → *"Settings — {page
      label}."*; focus → *"The {title} is in its own window — bringing it forward."*; refused-locked
      → *"The screen is locked — unlock it first."*; unknown issue repo → *"Open a repository and I'll
      find issue {n}."* Speech and action happen together — the view changes on the first word, not
      after the sentence, because a navigation that waits for TTS feels broken.
- [x] **The popout case.** Add `'companion'` to `WindowRelayMessage.kind`
      ([`schemas.ts:1813`](../../../packages/shared/src/ipc/schemas.ts)) with a payload of
      `{ action: CompanionIntent, replyTo: string } | { result: { ok: boolean; say: string }, replyTo: string }`.
      A `relay` plan sends the intent over `bridge().window.relay(…)` ([`broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts)
      owns the encoding); the **main window's** [`use-window-sync.ts`](../../../packages/app/src/services/use-window-sync.ts)
      arm runs it through the same `act()` with a `say` that *captures* instead of speaking, and
      relays the `result` back; the popout speaks it. Two hops on a transport that already exists,
      and the rule "every action executes in the main window" holds by construction.
  - *Acceptance:* a `use-window-sync.test.tsx` case — a `companion` relay with a `navigate`
    intent calls `setActiveView` on *this* store and relays a `result`; a `result` message with a
    matching `replyTo` resolves the popout's pending promise. A popout with `windowRole !== 'main'`
    receiving an `action` ignores it (only main executes).
- [x] **A URL is the one target that is not a view.** `{ kind: 'navigate', url }` → if
      `browserDetached`, `focusRole({ role: 'browser' })` then `useBrowserStore.getState().openTab(url)`
      ([`browser-store.ts:258`](../../../packages/app/src/store/browser-store.ts) — the store is
      synced across windows by the `browser` relay kind already); else `setBrowserOpen(true)` then
      `openTab(url)`. Say *"Opening {host}."* — the host, never the URL, per Phase 80 Theme A's
      spoken-form rule.
- [x] e2e in [`e2e/companion-panel.spec.ts`](../../../packages/app/e2e/companion-panel.spec.ts):
      type "take me to the graph" → the Graph view is the active one (the same assertion the
      existing view-navigation specs make) and the thread's last companion turn contains "Commit
      Graph"; type "open settings, companion" → the settings view with the companion page
      selected; seed `detachedPages: ['graph']` through the mock bridge's
      `windowRole`/`ui` fixture, type "show me the graph" → the mock's `window.focusRole` spy
      ([`mock-bridge.ts:2690`](../../../packages/app/e2e/mock-bridge.ts), today `noop`) was called
      with `{ role: 'graph' }` **and** the active view did not change.

### C — Doing things there, by tier (M)

"Push." "Fetch." "New terminal." "Toggle the browser." Three tiers, one rule each: `direct` runs
and says what it did; `confirm` says what it *would* do and waits; `never` names the palette.

- [x] `act()`'s `run` arm: look the id up in `COMMAND_ACCESS` (via the vocabulary — a `never` id
      is not in it, so an id the router invented that happens to be `never` falls into the same
      refusal as an unknown one). Then:
  - `direct` → `runCommand(id)`; on `{ ok: true }` say *"{label}."* (the command's own `COMMANDS`
    label, lower-cased into a sentence: "Toggling the terminal." "Fetching."); on `disabled` say
    the `disabledReason` verbatim after the label (*"Push is unavailable — Open a repository
    first."*); on `no-runtime` (a popout, or before `app.tsx` has rendered) relay as in Theme B.
  - `confirm` → set `companion-store.pendingAction = { intent, label, at: now }` (**not**
    persisted — a pending push must not survive a reload), post a turn with the question and say
    it: *"Push to origin? Say yes, press Return, or tap Run."* Then wait.
  - `never`/unknown → *"That one needs the palette — Mod+K, then type it."* No action, no
    `runtime` call, no relay.
  - *Deviation:* the spoken acknowledgement is `` `${label}.` `` verbatim (e.g. "Push.", "Toggle
    Terminal.") rather than a hand-authored gerund form for all 63 direct/confirm commands — total
    over every `CommandId` with no missing-entry risk, same idea for the confirm question
    (`` `${label}? Say yes, press Return, or tap Run.` ``). Flagged on the shared board.
- [x] The `confirm` intent runs `pendingAction` **if it is under 60 s old** (Decision 8 — a
      fifth of `DECLINE_MEMORY_MS`, because this one *does* something), through the same `direct`
      path; `dismiss` and `stop` clear it and say *"Left it."*; a `confirm` with nothing pending says
      *"Nothing's waiting."*. A **second `confirm`-tier request while one is pending replaces it** and
      says so — one pending action at a time, like one hand-off at a time.
- [x] **Empty Return confirms.** In the panel's input bar the send button is disabled on empty input
      today; with `pendingAction` set, Return on an empty textarea submits `{ kind: 'confirm' }`. The
      pending turn renders two chips — **Run** (`data-testid="companion-pending-run"`) and **Cancel**
      — through the same `submit` port, so a click and a word take one code path.
- [x] **Hands-free does not shortcut this.** `autoSendAllowed()` is not consulted anywhere in the
      `run` arm. Asserted by a test that sets `companionHandsFree: true`, a `voiceInReady` stub of
      `true`, submits "push", and observes `pendingAction` set and `runCommand` **not** called.
- [x] **The command's own dialogs survive.** `sync.push` through the runtime is the same
      `usePush` mutation the title bar uses; a non-fast-forward answer renders the same
      `GitOpResult` conflict UI; `terminal.close` on a running session raises the same "still
      running" confirm. The companion says *"Done — check the dialog."* when a `direct`/`confirm`
      run leaves the overlay stack non-empty (read `overlayDepth()` before and after — new export,
      `dialog-host.tsx`, plain module state mirroring `DialogHost`'s own `useState`s so it is
      readable synchronously outside React right after a `CommandEntry.run()` that opened one
      inline), and never touches the dialog.
  - *Acceptance (e2e):* covered at the unit level (`handoff.test.ts`, `overlayDepth` mocked) rather
    than e2e — seeding a running foreground terminal session for "close terminal" needs fixture
    plumbing shared with Theme B/D's terminal work; left to the phase doc's own packaged-Mac human
    pass below, alongside the push flow it already covers end to end.
- [x] `help` intent: speak a three-sentence summary built from the vocabulary — *"I can take you to
      any view or settings page, run {n} palette commands — {three examples} — and start {m} skills:
      {list}. Say 'what can you do' any time."* Posted in full as markdown in the thread (a bulleted
      list of every view, command and skill), spoken as the summary only.
- [x] Settings ▸ Companion ▸ Hands-free run — the *"What this still never does"* card
      ([`companion-page.tsx:428-438`](../../../packages/app/src/features/settings/settings-pages/companion-page.tsx))
      gains two bullets: *"No git write except the same push, pull and commit the palette offers —
      and each one asks first, hands-free or not."* and *"No dialog is ever answered for you."* The
      first bullet's current wording (*"No command outside the agent skills this app already
      knows"*) is no longer true after this theme and is replaced, not appended to.
- [x] e2e: "toggle the terminal" → the terminal panel opens, thread says so (done); "clear browser
      data" — the never-tier case, via a patched `companion.ask` since no sentence the grammar
      itself can produce ever reaches `run` with a `never`-tier id — gets the palette refusal
      (done); a confirm-tier flow's Run chip, empty-Return and Cancel all proven against the real
      command runtime using `app.lock` in place of `sync.push`/`sync.pull` (both `confirm`-tier,
      but `app.lock`'s `enabled` never depends on the fixture's branch/upstream state, so it is
      provably real rather than a mock guessing an ahead-count right) (done); the exact push/no-repo
      case from this bullet's original wording is covered by the packaged-Mac human pass instead.

### D — Every skill it was missing, and the ones it must keep refusing (S)

Capability 4, mostly already built (Finding 7). This theme closes the two gaps and writes down
the two exclusions as types.

- [x] Add `'triage'` to `AgentCommandId` ([`ui-store.ts:1469`](../../../packages/app/src/store/ui-store.ts)),
      `DEFAULT_AGENT_SKILLS.triage = '/midnite-triage'` (`:1512`), and an `AGENT_COMMANDS` entry in
      [`agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts) — category
      `reviews`, label "Triage", icon `LuRadar` (already imported there), hint *"Read-only table of
      the open PRs and issues — checks, reviews, mergeability, age."* No store migration: `skillHandoff`
      reads `agentSkills[id] ?? DEFAULT_AGENT_SKILLS[id]`, so a persisted `agentSkills` without the
      key resolves to the default. The Agent settings page renders the new field for free
      (`AGENT_COMMANDS` is its form). The midnite menu gains the row under Reviews for free too.
- [x] Add `'triage'` and `'releasePrep'` to `COMPANION_COMMAND_IDS`
      ([`companion.ts:1691`](../../../packages/shared/src/companion.ts)); update the docblock's
      *"ten of the roster's twenty-one"* to *"twelve of twenty-two"* and its reasoning: `loop*` and
      `releaseComplete` stay out (unattended timer; tags and pushes). `handoff.ts`'s compile-time
      subset proof and the `DEFAULT_AGENT_SKILLS` key test cover both automatically.
- [x] Add `COMPANION_NEVER_AUTOSEND: readonly CompanionCommandId[] = ['releasePrep']` beside it.
      `startCommand()` in `handoff.ts` computes `autoSend = deps.autoSendAllowed() && !COMPANION_NEVER_AUTOSEND.includes(intent.id)`
      and, when the flag suppressed a send the user's settings would have allowed, says *"I've typed
      {command} — this one I always leave for you to send."* A release branch is the one skill whose
      typed-not-sent Return should never be the companion's.
- [x] Grammar verbs in `COMPANION_VERBS` ([`companion.ts:1713-1729`](../../../packages/shared/src/companion.ts)):
      `triage · triage the board · what's open` → `triage`; `release prep · prepare a release · prep a
      release · cut a release` → `releasePrep`. Spoken names in `COMMAND_SPOKEN_NAMES`
      ([`handoff.ts:491-502`](../../../packages/app/src/features/companion/handoff.ts)) for both,
      so the confirmation sentence says "triage" and "release prep", not the id. Negatives: "release
      the hounds" is `freeform`; `companion.test.ts:944`'s existing assertion that `releaseComplete`
      is rejected stays green.
- [x] `midnite-setup` is **not** added and the reason is recorded in the `COMPANION_COMMAND_IDS`
      docblock: it bootstraps a *different* repository through ~10 interactive questions and hands
      over no skill string — Phase 49 gave it a dialog, not an `AgentCommandId`, and the companion
      has nothing to type.
- [x] Settings ▸ Companion gains no new switch for this theme. The Agent page's new Triage field is
      the only UI.

### E — The router learns the rest of the vocabulary (S)

The freeform fallback (`ask.ts`, `'route'`) currently knows ten skill ids. After A–D the grammar
knows views, pages, commands and twelve skills; the router must know the same or a sentence the
grammar misses ("could you pull up the database thing") is still a dead end.

- [x] `CompanionAskRequest` ([`schemas.ts:2703`](../../../packages/shared/src/ipc/schemas.ts)) gains
      `vocabulary: CompanionVocabularySchema.optional()`; `runtime.ts`'s `ask` passes the flow's
      cached vocabulary the way it passes `snapshot`. Absent (an older renderer, a test) → the prompt
      reads exactly as today.
- [x] `buildAskPrompt('route')` in [`ask.ts`](../../../packages/desktop/src/main/companion/ask.ts)
      lists, from the vocabulary: **views** as `id — label (keywords)`, **settings pages** as
      `settings:id — label`, **commands** as `id — label [direct|confirm]`, **skills** as
      `id — label — hint`, **repos** by name; and the four new intent shapes with one example each.
      The instruction *"never guess an id that is not listed"* stays and now covers all five lists.
      The prompt grows by ~3 KB; `COMPANION_ASK_INPUT_CAP` caps the *sentence*, not the prompt, and
      the vocabulary is bounded (20 + 23 + ~45 + 12 rows), so no new cap is needed — asserted by a
      test rendering the prompt with a full vocabulary and checking it is under 6 KB.
- [x] `parseAskReply` ([`companion.ts:2219`](../../../packages/shared/src/companion.ts)) accepts the
      new kinds by virtue of embedding `CompanionIntentSchema`; add fixture tests: a reply with
      `{"kind":"navigate","view":"database"}`, with `{"kind":"run","id":"sync.push"}`, with a
      `run` id that is not a `CommandId` (rejected → `say` only, no intent — the existing
      invented-id posture), and with a `navigate` view that is not a `ViewId` (same).
- [x] `ask.test.ts`: the `route` prompt with a vocabulary names every view id and every skill id
      exactly once, and names **no** `never`-tier command (the vocabulary never carried one — this
      test is the belt to Theme A's braces).
- [x] The router's `say` for a recognised navigation is spoken *before* the action only when the
      intent came from the router (the user waited ≥1 s already and a confirmation earns its
      place); a grammar hit keeps Theme B's speak-and-act-together rule.
      *Note:* satisfied structurally by `route()`'s pre-existing `await say(deps, reply.say)` then
      `await act(reply.intent, …)` ordering (unconditional on intent kind) — no code change needed
      here. `navigate` itself is still Theme B's stub (`"I can't do that yet."`); Theme B, not this
      branch, is what will give this ordering something real to prove.

### F — An agent may steer the view: the `ui.*` MCP tools (L)

The other half of "deepen the connection". The companion hands work to an agent session; today
that session can read the app through eight MCP tools and cannot show the user anything. Three
tools, one new IPC pair, one new switch, and every guardrail above applied at the smaller scale
Finding 6 describes.

- [x] `McpToolEntry.readOnly: true` → `readOnly: boolean` in
      [`shared/src/mcp.ts:67`](../../../packages/shared/src/mcp.ts); the eight existing entries keep
      `true`. Update the docblock: *"`false` marks a tool that changes what the app shows. No tool
      changes a repository — that is still Phase 57 Decision 5's deferred follow-up."*
- [x] Three entries in `MCP_TOOLS`, each description ≤ 220 chars, one sentence, verb-first, naming
      what it replaces (the `mcp.test.ts` rule):
  - `ui.state` (`readOnly: true`): input `{}`; output `{ activeView: ViewId, settingsPage: SettingsPageId | null, detached: WindowRole[], repoPath: string | null, locked: boolean, uiToolsEnabled: boolean }`.
    *"Reads which view Midnite Studio is showing, which panels are detached and whether the screen is
    locked — use before `ui.navigate` instead of guessing what the user can see."*
  - `ui.navigate` (`readOnly: false`): input `{ view: z.enum(VIEW_IDS), page?: z.enum(SETTINGS_PAGE_IDS), issue?: z.number().int().positive() }`
    — closed enums, which is what Theme A's move to `shared` buys: `tools/list` shows the model the
    exact legal values. Output `{ did: 'navigated' | 'focused-window', view }`.
  - `ui.command` (`readOnly: false`): input `{ id: z.string().refine(isCommandId) }`; output
    `{ did: 'ran', label }`. **Direct tier only** — a `confirm` id answers `refused` with *"needs the
    user — ask them to run it from the palette"*; a `never` id answers `refused` the same way. The
    tier check runs in the **renderer** (it owns `COMMAND_ACCESS`), so main cannot be talked into
    a different table.
- [x] **The consent switch.** `McpSettings` ([`mcp-store.ts:22`](../../../packages/desktop/src/main/mcp-store.ts))
      becomes `{ version: 2; enabled: boolean; allowUi: boolean }` with `parseStoredSettings`
      migrating `version: 1` → `allowUi: false`. `mcpGet` returns it; `mcpSet` accepts it;
      Settings ▸ MCP gains a second switch under the master one — *"Let agents steer the UI"* —
      disabled while the master is off, default off, with the same explanatory-card pattern as
      Companion's hands-free section: *"What this lets an agent do: open a view or settings page,
      focus a detached window, run the same palette commands the companion runs without asking.
      What it never does: push, pull, commit, start a skill, answer a dialog, or act while the
      screen is locked."*
  - *Acceptance:* `ui.navigate`/`ui.command` with `allowUi: false` → `{ ok: false, kind: 'refused', message: 'UI tools are off — Settings ▸ MCP ▸ Let agents steer the UI' }`
    before any IPC is sent. `ui.state` answers regardless (it is a read, and `uiToolsEnabled` in
    its output is how an agent learns why the next call will be refused).
- [x] **The IPC pair** — the tree's first main→renderer request/reply, kept minimal:
      `EVENT_CHANNELS.companionUiRequest = 'mstudio:companion:ui-request'` (main → main window,
      `{ id: string, action: CompanionUiAction }`) and `CHANNELS.companionUiReply = 'mstudio:companion:ui-reply'`
      (renderer → main, one-way `ipcRenderer.send`, `{ id, result: GitOpResult<{ did: string }> }`).
      [`main/companion/ui-bridge.ts`](../../../packages/desktop/src/main/companion/ui-bridge.ts) holds
      the pending map, a **5 s** timeout (→ `{ ok: false, kind: 'error', message: 'the window did not answer' }`),
      and targets `getMainWindow()` explicitly — never `BrowserWindow.getFocusedWindow()`, which
      `menu.ts` may use because a menu is by definition on the focused window; an agent's request is
      not. No main window (all closed on macOS) → `refused`. Preload exposes
      `companion.onUiRequest(handler)` and `companion.uiReply(…)`; `bridge.ts` types both; the
      reply's `ipcMain.on` registers in [`main/ipc/companion-handlers.ts`](../../../packages/desktop/src/main/ipc/companion-handlers.ts)
      beside the `ask` handler (`:68`); the `ipc.test.ts` channel↔schema table gains both rows.
- [x] Renderer side: [`features/companion/ui-requests.ts`](../../../packages/app/src/features/companion/ui-requests.ts)
      `useCompanionUiRequests()`, mounted from `app.tsx` **only when `windowRole === 'main'`**. On a
      request it runs the same `resolveNavigation`/`runCommand` path Themes B/C use with
      `caller: 'mcp'` — which forbids `confirm` (answers `refused`), forbids `never`, and refuses
      while `screensaverLocked` — then replies. It posts a **toast** always (*"Agent: opened Commit
      Graph"*, `toast-store.ts`) and a companion turn when `companionEnabled` (*"An agent opened the
      Commit Graph."*), so a steer is never silent and is in the thread's record when there is one.
- [x] The audit ring ([`main/mcp/audit.ts`](../../../packages/desktop/src/main/mcp/audit.ts)) records
      `ui.*` calls with `repoPath: ''` — `auditRepoPath` already returns `''` for an input without
      one, and the ring deliberately keeps only that field. Settings ▸ MCP's "last 50 calls" list
      shows them by tool id, which is enough to answer "what did that agent just do to my window".
- [x] The stdio shim needs **no change**: `tools/list` reads `MCP_TOOLS`
      ([`mcp-shim/index.ts:44`](../../../packages/desktop/src/mcp-shim/index.ts)), so the three
      tools appear with their JSON-schema enums automatically. A test in `mcp-shim` asserts the
      list has eleven entries and that `ui.navigate`'s `view` is a JSON-schema `enum` of `VIEW_IDS`.
- [x] Tests: `server.test.ts` — a `ui.navigate` frame with the switch off is `refused` and no
      `webContents.send` happens; with the switch on, the request reaches a fake window and a reply
      resolves the frame; a reply that never comes times out at 5 s (fake timers). `tools.test.ts`
      — `ui.state` composes from a fake renderer answer. `ui-requests.test.tsx` — `confirm`-tier id
      → `refused`; locked → `refused`; direct → `runCommand` called once and a toast posted.
- [x] `docs/INITIAL_PLAN.md`'s MCP section and the Settings ▸ MCP page copy gain one paragraph each
      on the `ui.*` family and its switch; `.midnite/tasks/outstanding.md`'s note that MCP writes are
      deferred is amended to say *"repository writes are deferred; UI steering landed in Phase 81
      behind its own switch"*. **Two of the three premises here were false, so the intent was
      delivered rather than the letter.** The Settings ▸ MCP copy shipped with Theme F
      (`mcp-page.tsx`'s hint text). But `docs/INITIAL_PLAN.md` has **no MCP section and no mention
      of the companion at all** — it is the frozen MVP-era design doc, written before Phase 57
      brought MCP and Phases 79-81 brought the companion, and bolting a Phase 81 paragraph onto it
      would misrepresent it as a living document. And `outstanding.md` had **no deferred-writes
      note to amend**. So `outstanding.md` gains that section written fresh ("MCP repository writes
      are still deferred; UI steering is not"), recording that Phase 57 Decision 5 stands, that
      Theme F shipped the consent model only at the smaller UI-steering scale, and that the open
      question is now the narrower one — whether switch-plus-tier is sufficient consent for a write
      where "one keystroke undoes it" stops being true.

## Files this phase touches

| Package | Path | Themes |
|---|---|---|
| shared | [`src/domain/view.ts`](../../../packages/shared/src/domain/view.ts) (new: `VIEW_IDS`, `ViewId`, `SETTINGS_PAGE_IDS`, `SettingsPageId`) | A |
| shared | [`src/domain/window.ts`](../../../packages/shared/src/domain/window.ts) (`PAGE_WINDOW_ROLES satisfies readonly ViewId[]`) | A |
| shared | [`src/companion.ts`](../../../packages/shared/src/companion.ts) (`CompanionVocabularySchema`, `CompanionAccess`, four intent kinds, `parseIntent(text, vocab?)`, `COMPANION_COMMAND_IDS` + `COMPANION_NEVER_AUTOSEND`) | A D E |
| shared | [`src/companion.test.ts`](../../../packages/shared/src/companion.test.ts) | A D E |
| shared | [`src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) (`WindowRelayMessage.kind` + `companion`; `CompanionAskRequest.vocabulary`; `CompanionUiRequest`/`CompanionUiReply`) | B E F |
| shared | [`src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) (`companionUiRequest` event, `companionUiReply`) | F |
| shared | [`src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) (`companion.onUiRequest`, `companion.uiReply`) | F |
| shared | [`src/mcp.ts`](../../../packages/shared/src/mcp.ts) (`readOnly: boolean`, `ui.state`/`ui.navigate`/`ui.command`) | F |
| shared | [`src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) (`window.detachCompanion`; otherwise read — `isCommandId`, `COMMANDS` labels) | A B C |
| app | [`src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (re-export `ViewId`/`SettingsPageId`; `AgentCommandId` + `triage`; `DEFAULT_AGENT_SKILLS.triage`) | A D |
| app | [`src/store/companion-store.ts`](../../../packages/app/src/store/companion-store.ts) (`pendingAction`, not persisted) | C |
| app | [`src/features/palette/safety.ts`](../../../packages/app/src/features/palette/safety.ts) (`COMMAND_ACCESS`, `ID_DISPATCH_OK`) + `safety.test.ts` | A |
| app | [`src/services/palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) (export `VIEW_LABELS`, `VIEW_KEYWORDS`) | A |
| app | [`src/features/companion/command-runtime.ts`](../../../packages/app/src/features/companion/command-runtime.ts) (new) | A |
| app | [`src/features/companion/vocabulary.ts`](../../../packages/app/src/features/companion/vocabulary.ts) (new) | A |
| app | [`src/features/companion/navigate.ts`](../../../packages/app/src/features/companion/navigate.ts) (new: `resolveNavigation`) | B |
| app | [`src/features/companion/handoff.ts`](../../../packages/app/src/features/companion/handoff.ts) (`act()` arms: `navigate`, `run`, `confirm`, `help`; `COMPANION_NEVER_AUTOSEND` in `startCommand`) | A B C D |
| app | [`src/features/companion/runtime.ts`](../../../packages/app/src/features/companion/runtime.ts) (`HandoffDeps.navigate`/`runCommand`/`vocabulary`; `ask` passes vocabulary) | A B C E |
| app | [`src/features/companion/companion-panel.tsx`](../../../packages/app/src/features/companion/companion-panel.tsx) (empty-Return confirms; Run/Cancel chips) | C |
| app | [`src/features/companion/ui-requests.ts`](../../../packages/app/src/features/companion/ui-requests.ts) (new) | F |
| app | [`src/features/agent/agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts) (Triage row) | D |
| app | [`src/services/use-window-sync.ts`](../../../packages/app/src/services/use-window-sync.ts), [`broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) (`companion` relay kind) | B |
| app | [`src/app.tsx`](../../../packages/app/src/app.tsx) (`setCommandRuntime`; `useCompanionUiRequests` on main) | A F |
| app | [`src/features/settings/settings-pages/companion-page.tsx`](../../../packages/app/src/features/settings/settings-pages/companion-page.tsx) (hands-free card copy) | C |
| app | [`src/features/settings/settings-pages/mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx) ("Let agents steer the UI") | F |
| app | [`e2e/companion-panel.spec.ts`](../../../packages/app/e2e/companion-panel.spec.ts), [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) (`focusRole` spy, `companion.onUiRequest`) | B C F |
| desktop | [`src/main/companion/ask.ts`](../../../packages/desktop/src/main/companion/ask.ts) (vocabulary in the `route` prompt) + `ask.test.ts` | E |
| desktop | [`src/main/companion/ui-bridge.ts`](../../../packages/desktop/src/main/companion/ui-bridge.ts) (new: pending map, 5 s timeout) | F |
| desktop | [`src/main/mcp/tools.ts`](../../../packages/desktop/src/main/mcp/tools.ts), [`dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts) (three handlers) + tests | F |
| desktop | [`src/main/mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts) (`version: 2`, `allowUi`) + [`mcp/index.ts`](../../../packages/desktop/src/main/mcp/index.ts) (`McpStatus.allowUi`) | F |
| desktop | [`src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) (two companion members) + [`src/main/ipc/companion-handlers.ts`](../../../packages/desktop/src/main/ipc/companion-handlers.ts) (`uiReply` handler) | F |
| app | [`src/services/keybindings/use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts) (`window.detachCompanion` entry) | B |
| desktop | [`src/mcp-shim/`](../../../packages/desktop/src/mcp-shim/) (unchanged; one list test) | F |
| docs | [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md), [`.midnite/tasks/outstanding.md`](../outstanding.md) | F |

**Unchanged and load-bearing:** `packages/app/package.json` (no new dependency);
`git-engine/` (nothing here touches git); `use-skill-handoff.ts`'s `autoSend` default and
`start-agent.ts`'s withheld Return (Theme D *narrows* one caller, it does not widen any).

## Verification

- [x] `moon run :typecheck :lint :test` green. `no-restricted-imports` clean: `shared/src/domain/view.ts`
      imports nothing; `features/companion/*` imports nothing from `desktop`/`electron`; `main/mcp/`
      imports nothing from `app`.
- [x] **A** — `safety.test.ts`: `COMMAND_ACCESS` is total (the type does it; the test asserts
      `Object.keys(COMMAND_ACCESS).length === COMMAND_IDS.length`), every `direct`/`confirm` id is in
      `PALETTE_SAFE ∪ ID_DISPATCH_OK`, and the four named `never`s. `companion.test.ts`: every new
      verb × target row, the repo-before-view rule, the no-vocabulary regression (every pre-existing
      `parseIntent` test unchanged). `command-runtime.test.ts`: disabled → reason, no call.
- [ ] **B** — `navigate.test.ts`: one case per `NavigationPlan` branch. `use-window-sync.test.tsx`:
      the `companion` relay round-trip and the popout-ignores-actions rule. e2e: the three flows
      above, including the `focusRole` spy with the view unchanged.
- [ ] **C** — `handoff.test.ts`: direct runs once and says the label; disabled says the reason;
      confirm sets `pendingAction`, `confirm` within 60 s runs once, at 61 s says "Nothing's
      waiting" (fake timers); hands-free on does not bypass; second confirm-tier request replaces.
      e2e: terminal toggle, the push pending→Return flow, the surviving confirm dialog.
- [ ] **D** — the compile-time subset proof and the `DEFAULT_AGENT_SKILLS` key test pass with
      twelve ids; `handoff.test.ts`: `releasePrep` with hands-free on and voice ready still has
      `autoSend: false` and says the "always leave for you" line; grammar rows for the four new
      verbs plus the negative.
- [ ] **E** — `ask.test.ts`: prompt names every view and skill once, no `never` command, under 6 KB;
      `parseAskReply` fixtures for the four new kinds and the two invented-id rejections.
- [ ] **F** — `mcp.test.ts` description rule holds for eleven tools; `server.test.ts` off/on/timeout;
      `ui-requests.test.tsx` the three refusals and the toast; shim list test; `mcp-store.test.ts`
      migrates `version: 1` → `{ version: 2, allowUi: false }`.
- [ ] Bundle: `scripts/perf/bundle-report.mjs` after `moon run app:build desktop:bundle` — the
      renderer entry chunk within noise (the companion is a lazy chunk; `view.ts` in `shared` is a
      few hundred bytes).
- [ ] Screenshots (Playwright, both themes): the pending-action turn with its Run/Cancel chips; the
      `help` turn's list; Settings ▸ MCP with the new switch and card; Settings ▸ Companion's
      rewritten hands-free card.
- [ ] **Human pass (packaged Mac):** say "take me to the graph" — the view changes on the first
      spoken word. Detach the graph, say it again — the popout comes forward and the main window's
      view did not change. Say "push" — hear the question, say "yes", watch the title bar's push
      run and, on a non-fast-forward, see the same conflict UI a click gets. Say "clear browser
      data" — hear the palette refusal. Enable both MCP switches, ask a Claude session in the
      terminal to "open the API client in Midnite Studio" — the view changes, a toast names the
      agent, and the thread records it; turn the second switch off and repeat — the agent is told
      where the switch is.

## Not in this phase

- **Bespoke per-page actions** — "stage `foo.ts`", "run this query", "send this request", "check
  out `feature/x`", "open the file `bar.ts`". Each needs a programmatic entry point that today is a
  component-local closure (Phase 75 Finding 3 is the pattern: `launch()` in `card-composer.tsx` is
  the only start path and it is not exported). Building those seams is a phase of its own, and it
  should be designed page by page with each page's own blast radius, not as a generic "do X on page
  Y" verb. This phase deliberately bounds "actions on pages" to **the `CommandId` set plus three
  arguments that already have store-level actions** (a settings page, an issue number, a URL).
- **MCP repository writes.** `stage`/`commit`/`branch.create` stay Phase 57 Decision 5's deferred
  follow-up. `ui.*` is not a step toward them and shares no code path with them.
- **`ui.*` for `confirm`-tier commands or skills.** An agent asking a human for a yes is what the
  terminal is for. No `skill.run` tool, no "queue this for the user" tool.
- **Wake-word listening, a second STT/TTS engine, new voices.** Phases 79/80 own the voice.
- **A generic "undo what the companion did".** `app.reload`/`app.hardReload` and every toggle are
  their own inverse; the git writes reachable here have Phase 22's journal. Nothing new to undo.
- **Popout-local execution.** A companion in its own window relays to main, always. Letting a
  popout act on its own store is exactly the "second copy nobody can see" bug this phase exists to
  avoid.
- **Re-styling the palette or adding `view.*` commands for the fifteen views without one.** The
  palette already lists every view; the companion reads the same table (Finding 2).
- **`midnite-setup` as a companion skill.** It bootstraps a different repository through an
  interactive dialog and has no skill string to type (Theme D).

## Decisions / open questions

All twelve calls below were made unattended, per the coordinating session's explicit instruction
to resolve every interactive choice itself rather than pause for one. Each records the option
taken, the alternatives, and why — so a human reviewing this doc can override any of them before
Theme work starts.

1. **MCP tools, companion-native, or a mix — and which half is which?** *Settled: a mix, split by
   who is asking, not by what is done.* **Companion → app is renderer-native** (Themes A–E, zero new
   IPC beyond one relay kind and one optional field): the companion *lives in the renderer*
   (`runtime.ts` is plain functions over `useUiStore.getState()`), navigation and commands *are
   renderer state* (`setActiveView`, `CommandRuntime`), and the MCP server has no window (Phase 57
   Decision 2). Routing the companion's own "go to the graph" as renderer → IPC → main →
   `webContents.send` → renderer would be a socket-shaped detour for a same-process call, and it
   would put the tier check in main, away from the `COMMAND_ACCESS` table that defines it.
   **Agent → app is MCP** (Theme F): an external process has no other door, the server already
   owns discovery (`tools/list`), rate limits (`MCP_MAX_CONNECTIONS`), the audit ring and a consent
   switch, and the same engine serves both callers so the two allowlists cannot drift. Rejected:
   *all-MCP* (the detour above, plus the companion would depend on a server that is off by default
   — Phase 79 chose in-process `dispatchMcpCall` for exactly this reason); *all-companion* (leaves
   the human's "if that involves updating the MCP too" unanswered, and leaves an agent the
   companion started unable to show its work). Theme F is last and droppable, so the split can be
   revisited after A–E ship without a seam.
2. **Expose `COMMANDS` to the companion, or write a capability schema?** *Settled: neither alone —
   mirror the palette.* The palette (`providers.ts`) already models the app as *views and settings
   pages by id* plus *commands by `CommandId`*, with labels and keywords per view. That is the
   vocabulary, and it is already the one the user has learned from `Mod+K`. A fresh capability
   schema would be a third list; `COMMANDS` alone reaches five views of twenty (Finding 2).
3. **Where does `ViewId` live?** *Settled: move `ViewId`/`VIEW_IDS` and `SettingsPageId`/`SETTINGS_PAGE_IDS`
   to `shared/src/domain/view.ts`, re-exported from `ui-store.ts`.* Alternatives: (a) leave them in
   `app` and declare a `COMPANION_VIEW_IDS` copy in `shared` with a compile-time subset proof, as
   `COMPANION_COMMAND_IDS` does for `AgentCommandId` — works, but Theme F's `ui.navigate` then
   cannot use a closed `z.enum` and `tools/list` would show the model `string` where it should show
   twenty legal values; (b) move `ViewId` and every import — ~60 files for one consumer. The
   re-export costs two lines and buys `PAGE_WINDOW_ROLES satisfies readonly ViewId[]` for free.
   `VIEW_LABELS`/`VIEW_KEYWORDS` stay in `app`: they are UI copy, and `shared` is data-and-pure-
   functions, not prose.
4. **Where does the tier table live — `keybindings.ts` or `safety.ts`?** *Settled: `features/palette/safety.ts`,
   beside `PALETTE_SAFE`, as a total `Record<CommandId, CompanionAccess>`.* `keybindings.ts` is
   `shared`'s "single source of truth" for what a command *is*; `safety.ts` is where this app already
   decides what a *surface may run*, and the invariant that matters ("the companion is no wider
   than the palette, except for id-dispatch") is only expressible next to `PALETTE_SAFE`. A field on
   each `COMMANDS` entry was the runner-up: same totality, but it would make `shared` carry a
   renderer-surface policy and split the palette's own allowlist across two packages.
5. **The starting tier table.** *Recommendation, for review row by row.* **`direct`**: every
   `view.*`, `graph.focus`, `status.focus`, every `*.toggle` except `companion.toggle`,
   `terminal.new`, `terminal.focus`, `terminal.toggleHalfMaximized`, `browser.newTab`/`nextTab`/`prevTab`/`reopenTab`/`selectTab1-9`/`find`/`devtools`/`openDevServer`,
   the six zoom rows, `panel.back`/`forward`, `view.refresh`, `sync.fetch` (network read),
   `search.open`, `palette.open`/`files`, `markdown.presentAsSlides`, `theme.select`, `theme.import`
   (opens a picker), `repo.open` (opens a picker), `link.toggleTarget`, `app.screensaver`, every
   `window.detach*`. **`confirm`**: `sync.pull`, `sync.push`, `status.commit`, `file.save`,
   `repo.close`, `terminal.close`, `browser.closeTab`, `app.reload`, `app.hardReload`, `app.lock`,
   `workflow.run`. **`never`**: `browser.clearData` (destroys every logged-in session — `PALETTE_SAFE`
   excludes it too), `companion.toggle` (closing itself mid-sentence), `op.abort`/`op.continue`
   (disabled stubs owned by Phase 22). The line: *direct* is reversible by the next keystroke and
   changes no data; *confirm* changes data or state the user would want to have meant; *never* is
   destructive or self-referential.
6. **How does a `confirm`-tier command get its yes?** *Settled: a spoken/typed "yes", an empty
   Return in the companion's textarea, or a Run chip — one `submit` path.* A native dialog was
   rejected: the companion already *is* the dialog, and a modal on top of a spoken question would
   be two prompts for one answer. Hands-free does not bypass it (guardrails). 60 s expiry.
7. **Why is `app.reload`/`app.hardReload` `confirm` when `PALETTE_SAFE` calls it safe?** A reload
   drops every unsaved editor buffer and every pty's scrollback view; clicking "Reload" is a
   deliberate act, hearing "reload" in a sentence about something else is not. The cost of the
   question is one word.
8. **60 s for a pending action, when a declined command is remembered for 5 min.** *Settled.*
   `DECLINE_MEMORY_MS` remembers something the companion *refused*; "anyway" after four minutes
   starts an agent the user can still watch and stop. A pending push *runs*. A shorter memory is the
   conservative side of the same rule Phase 79 wrote for "anyway".
9. **Relay or ignore the popout companion?** *Settled: relay to main over `window.relay`, both
   directions.* Ignoring it (acting on the popout's own store) is the invisible second-copy bug;
   forbidding it ("I can't do that from here") makes detaching the companion — a Phase 79 feature —
   cost every capability this phase adds. The transport exists and is already the authoritative
   cross-window path (`channels.ts:677-683`).
10. **Add `triage` and `releasePrep`; keep `releaseComplete`, `loop*` and `setup` out.** *Settled.*
    Finding 7: the exclusion reason Phase 79 gave `releasePrep` ("writes a branch") applies to
    `execAdhoc` too; the real line is *irreversible* (`releaseComplete` tags and pushes) and
    *unattended* (`loop*`). `releasePrep` joins with `COMPANION_NEVER_AUTOSEND` so its Return is
    always the user's. `triage` is read-only and the one `midnite-` skill with no id at all. `setup`
    has nothing to type.
11. **`ui.*` in the MCP registry: always listed, or only when the switch is on?** *Settled: always
    listed, refused when off, with the message naming the switch.* The shim's own rule is that
    `tools/list` works with the app closed; a tool that appears and disappears with a setting is a
    tool an agent cannot plan around. `ui.state` answers even when off and carries
    `uiToolsEnabled`, so an agent learns the refusal before it happens.
12. **Main→renderer request/reply — build one, or make `ui.*` fire-and-forget like `menu:command`?**
    *Settled: build the smallest one (a pending map and a 5 s timer in `ui-bridge.ts`).* Fire-and-
    forget would return `ok` for a view that does not exist, a command that is disabled, or a locked
    screen — and the whole value of `ui.command` to an agent is learning "that one needs the user".
    The tier check must run in the renderer (Decision 4), so the reply has to come from there.
13. **Sizing.** *Settled as written* (A: M, B: M, C: M, D: S, E: S, F: L). F is the only theme with
    a new IPC pair, a store migration, a settings switch and three MCP tools at once.
14. **Open, for a human:** should `sync.pull` be `direct`? It is the one `confirm` row where the
    argument is weakest — a pull on a clean tree is a fetch plus a fast-forward, and its conflict
    case already renders through `GitOpResult`. Left `confirm` because a pull on a *dirty* tree is
    what the user least wants from a misheard word; downgrade it after living with the question.
