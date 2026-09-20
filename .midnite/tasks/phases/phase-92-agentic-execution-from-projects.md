# Phase 92 — Agentic execution from Projects

[Phase 41](phase-41-agentic-kanban.md) gave a kanban card a Play button. [Phase 75](phase-75-what-blocks-what.md)
gave the dependency graph's own node the identical button. Both auto-send a prompt built from the
issue's full title, URL, assignees, labels and body — capped at 4 000 characters, but otherwise the
whole remote issue, typed and sent with no human ever reading it — to whichever agent this repo
launched most recently. This phase replaces that with two things: a way to say **which skill** a
card should run, and a **shrunk** prompt — the issue link plus that skill, not the issue itself.

**Builds on.** [`composeCardPrompt`](../../../packages/app/src/features/projects/board/board-derive.ts)
(Phase 41 Theme G) is the function both Play buttons already call —
[`task-card.tsx:140`](../../../packages/app/src/features/projects/board/task-card.tsx) and
[`project-graph-node.tsx:181`](../../../packages/app/src/features/projects/graph/project-graph-node.tsx),
copy-pasted between the two files down to the `BUILTIN_AGENTS`-scanning most-recent-agent fallback.
[`skillHandoff`](../../../packages/app/src/features/agent/use-skill-handoff.ts) already does almost
exactly what this phase wants, just never for a Projects card: it resolves an `AgentCommandId` to a
slash-command template (`ctx.skills[id] ?? DEFAULT_AGENT_SKILLS[id]`) and composes
`` `${skillTemplate} ${body}` ``. `AgentCommandId` — `execBacklog`, `execAdhoc`, `addressIssue`,
`brainstorm`, `refine`, `execSwarm`, plus the review/release/git/loop ids —
is declared in [`ui-store.ts:1698`](../../../packages/app/src/store/ui-store.ts), labelled and
iconed in [`agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts), and
defaulted in [`DEFAULT_AGENT_SKILLS`](../../../packages/app/src/store/ui-store.ts) (`:1742`) —
`execAdhoc: '/midnite-exec-adhoc'`, `brainstorm: '/midnite-brainstorm'`, `refine: '/midnite-refine'`
among them. This is this app's **own, already-curated** skill catalogue; nothing reads
`.claude/skills/` on disk to build one (confirmed — see Decisions), and
[`agent-page.tsx:576-583`](../../../packages/app/src/features/settings/settings-pages/agent-page.tsx)'s
own comment argues explicitly against enumerating that directory for a field like this one. The
context menu this phase adds has a precedent two call-sites deep:
[`board-view.tsx:667-681`](../../../packages/app/src/features/projects/board/board-view.tsx) already
opens [`ContextMenu`](../../../packages/app/src/components/context-menu.tsx) at a pointer position
via `useDialogs().openMenu(event, items)` for the "Move to ▸" menu, and
[`dialog-host.tsx`](../../../packages/app/src/components/dialog-host.tsx) is the one shared portal
that guarantees only one such menu is ever open.

**A safety gap this phase also happens to narrow.** Both Play buttons pass `autoSend: true`
unconditionally — [`task-card.tsx:156`](../../../packages/app/src/features/projects/board/task-card.tsx),
[`project-graph-node.tsx:197`](../../../packages/app/src/features/projects/graph/project-graph-node.tsx)
— which sends the composed command the instant it is typed, with **no confirm dialog and no
respect for [Phase 50 Theme B](phase-50-kanban-projects-followthrough.md)'s
`launchAndRunEnabled` gate**. That gate and its confirm exist only on
[`CardComposer`](../../../packages/app/src/features/projects/board/card-composer.tsx)'s own
"Launch and run" button — the deliberate, reviewed path Phase 41 built specifically because *"a
Kanban prompt is composed from remote GitHub data … any contributor could have written."* The small
Play button on the card itself has quietly been the looser of the two paths since Phase 41 shipped:
it sends that same untrusted body, unread, every time. Neither Play button checks
`blockers` either — `CardComposer`'s Start disables under an unmet dependency
([Phase 75](phase-75-what-blocks-what.md) Theme G); the card's own Play button does not take a
`blockers` prop at all. This phase does not close that second gap (see Decisions) but the prompt
shrink in Theme B does close the first one for the skill-launch path: a URL is not executable
prose, so auto-sending it carries none of the argument Phase 41 made against auto-sending a body.

**Scope guardrails.** No new IPC channel and no `shared/` change — every piece here is renderer-only
state and behaviour, the same shape [Phase 52](phase-52-projects-navigation.md) kept to for
filter/group/sort. No GitHub Projects custom field is read or written for "which skill" — see
Decisions for why this is local-only state, not a `ForgeProjectField`. This phase does not touch
`CardComposer`'s own agent/model pickers, its manual prompt textarea, or `composeCardPrompt` itself
— that remains the rich, human-reviewed compose path for a user who opens the detail pane on
purpose; only the two quick Play buttons' own launch path changes. It does not add dependency-aware
gating to the Play button (the blockers gap above stays open, named, for a later phase). It does
not widen the skill catalogue beyond the app's existing `AgentCommandId`s, and it does not build a
`.claude/skills/` directory scanner.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — One launch path, not two copies (S) — ✅ DONE (PR #478, 2026-09-20)

- [x] Extract the Play button's logic — resolve the most-recently-used agent, compose a prompt,
      call `startAgent`, then `revealSession` — out of
      [`task-card.tsx:133-159`](../../../packages/app/src/features/projects/board/task-card.tsx) and
      [`project-graph-node.tsx:174-200`](../../../packages/app/src/features/projects/graph/project-graph-node.tsx)
      into one shared hook, e.g. `useCardPlay({ projectId, item, repoId, worktreePath, taskRef })` in
      a new `board/use-card-play.ts`, returning `{ onPlay: (event) => void }`. Both components
      already read the identical five things from the store (`sessions`, the most-recent-agent scan,
      `BUILTIN_AGENTS`, `startAgent`, `revealSession`) — this makes it one read, not two, and gives
      Theme D exactly one place to fork on "is a skill set".
- [x] Both call sites' "already running" branch (`sessionId`/`liveSession` → `revealSession`) folds
      into the same hook, unchanged in behaviour — `TaskCard` derives its session through
      `useCardStatus`, `ProjectGraphNode` through `findCardSession` directly; the hook takes
      whichever the caller already has rather than re-deriving it, so this theme changes no test's
      assertions about *when* the button reveals versus launches.
- [x] `data-testid="card-play-agent"` and `data-testid="graph-node-play-agent"` stay on their own
      `<button>` elements, unrenamed — existing tests (`task-card.test.tsx`,
      `project-graph-node.test.tsx`) key off them and this theme is a pure extraction, not a
      behaviour change yet.
- [x] Tests: `use-card-play.test.tsx` (or folded into the two existing component test files) —
      the extraction is proven by the two existing suites passing unchanged, plus one new case
      confirming both callers produce byte-identical `startAgent` calls for the same inputs.

### B — The prompt shrinks: a link, not the issue (S) — ✅ DONE (PR #478, 2026-09-20)

- [x] A new pure function, `composeSkillLaunchPrompt(item: ForgeProjectItem, skillTemplate:
      string): string` in [`board-derive.ts`](../../../packages/app/src/features/projects/board/board-derive.ts),
      returning `` `${skillTemplate} ${content.url}` `` for an issue or pull item. Mirrors
      `skillHandoff`'s own `` `${skillTemplate} ${body}` `` composition (`use-skill-handoff.ts:104`)
      with the issue URL standing in for `body` — the skill itself is expected to fetch whatever it
      needs from that link, which is the whole point of handing it a link instead of a paste.
- [x] **`composeCardPrompt` is untouched.** It keeps composing title, URL, assignees, labels and the
      capped body, and keeps backing `CardComposer`'s own textarea
      ([`card-composer.tsx:136`](../../../packages/app/src/features/projects/board/card-composer.tsx))
      — a human opens that pane on purpose and reads the prompt before Start, which is exactly the
      case Phase 41 built it for. Only the two Play buttons' composition changes.
- [x] A **draft** item (`content.type === 'draft'`) has no `url` — nothing to hand a skill as a link.
      `composeSkillLaunchPrompt` falls back to `composeCardPrompt`'s existing draft-safe output in
      that case (title + body, same as today) rather than composing a linkless, meaningless prompt.
- [x] Tests: `board-derive.test.ts` — an issue, a pull, and a draft item each through
      `composeSkillLaunchPrompt`, plus the empty-`skillTemplate` case (should not happen once Theme C
      lands, but a pure function is tested against its own inputs, not its caller's promises).

### C — A skill lives on the card, chosen in its detail pane (M) — ✅ DONE (PR #481, 2026-09-20)

- [x] `cardSkillByTask: Record<string, AgentCommandId>` in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts), keyed by a composite
      `` `${projectId}:${itemId}` `` string (there is no single id that already identifies a task
      across a possible cross-repo project) — added to `PersistedUi`, `partialize` **and** the
      custom `merge`, the three places every persisted key in this store must appear, per
      [Phase 52 Theme D](phase-52-projects-navigation.md)'s own reminder that `merge` is the one a
      forgotten key silently drops on the next app version. Version bump from the current **19**,
      with a migration seeding an empty map.
- [x] An LRU cap mirroring
      [`project-view-lru.ts`](../../../packages/app/src/features/projects/project-view-lru.ts)'s
      `touchProjectView` — a new `card-skill-lru.ts`'s `touchCardSkill`, relying on the same
      insertion-order-of-a-plain-object trick rather than a second bookkeeping array. A user who
      assigns skills across many cards over time should not accumulate an unbounded map any more
      than one who opens many projects should.
- [x] Registered in [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) as a
      `SESSION_STATE_KEYS` entry, not `PREFERENCE_KEYS` — the same classification
      `projectViewByProject` already carries ("last-viewed view per project"; here, "last-chosen
      skill per card"). It has no Settings-page control by design — it is set from the card, not a
      settings form — which is exactly what `SESSION_STATE_KEYS` requires a one-clause reason for.
- [x] A "Skill" picker in
      [`card-detail.tsx`](../../../packages/app/src/features/projects/board/card-detail.tsx),
      between the assignees block and the generic fields loop — reusing
      [`IconSelect`](../../../packages/app/src/components/select/icon-select.tsx), the same control
      `CardComposer` already uses for its Agent and Model pickers, fed
      `AGENT_COMMANDS.filter((c) => c.category === 'tasks')` (six options: Backlog Task, Adhoc Task,
      Address Issue, Brainstorm, Refine Plan, Swarm) with each option's own icon and label. **Not**
      a `ForgeProjectField`-backed control — see Decisions for why this is local state, not a
      GitHub-side write.
- [x] "Not set" is a real, distinct option (not merely "whatever is first in the list") — clearing
      it removes the map entry rather than writing an empty string, so `cardSkillByTask[key]` being
      absent is the one true "unset" this phase's Theme D forks on.
- [x] Because `CardDetail` is the single component both
      [`card-panel-stack.tsx`](../../../packages/app/src/features/projects/board/card-panel-stack.tsx)
      call sites render (board mode and the dependency-graph mode both wrap it), this one picker
      reaches both surfaces with no second implementation.
- [x] Tests: `card-skill-lru.test.ts` (eviction, oldest-first, matching `project-view-lru.test.ts`'s
      own cases), `ui-store.test.ts` (partialize/merge round-trip, migration seeds an empty map),
      `card-detail.test.tsx` (picking a skill persists it under the composite key; "Not set" clears
      it; switching cards shows each card's own independent choice).

### D — Play, forked on whether a skill is set (M) — ✅ DONE (PR #481, 2026-09-20)

- [x] `useCardPlay` (Theme A) reads `cardSkillByTask[`${projectId}:${item.id}`]` from `ui-store`. If
      set, it composes via Theme B's `composeSkillLaunchPrompt` with that skill's template (`agentSkills[id]
      ?? DEFAULT_AGENT_SKILLS[id]`, the same resolution `skillHandoff` already does) and calls
      `startAgent` immediately — no menu, no change in *when* it launches, only in what it sends.
      This is the common case once a card has been used once: click Play, it runs.
- [x] If unset, clicking Play opens a `ContextMenu` at the button's own position — `{ clientX:
      event.clientX, clientY: event.clientY }` from the button's click event, through
      `useDialogs().openMenu`, the identical call [`board-view.tsx:667`](../../../packages/app/src/features/projects/board/board-view.tsx)
      already makes for "Move to ▸" — offering exactly three entries: **Exec** (`execAdhoc`),
      **Brainstorm** (`brainstorm`), **Refine** (`refine`). See Decisions for why "Exec" resolves to
      `execAdhoc` rather than `execBacklog`.
- [x] Selecting an entry does two things in one action: launches immediately with that skill (Theme
      B's composed prompt), and writes it into `cardSkillByTask` (Theme C) so the next Play on the
      same card skips the menu — see Decisions for the "persist vs one-off" call.
- [x] **The context menu never appears once a skill is set in the detail pane.** This is the literal
      requirement from the brief, and the fork above is written so there is exactly one condition
      (`cardSkillByTask[key] !== undefined`) deciding it — not two paths that could drift.
- [x] The "already running → reveal" branch is untouched by any of this: a card with a live session
      still reveals it on Play regardless of whether a skill is set, exactly as today.
- [x] Tests: `use-card-play.test.tsx` — skill set launches directly with the shrunk prompt and no
      menu; skill unset opens the menu with exactly the three entries; selecting one launches with
      the right skill's template *and* persists it; a second Play on the same card after that no
      longer opens the menu. **The `e2e/kanban.spec.ts`/`project-graph-view` e2e half is deferred**,
      not built: GitHub Actions is hard-blocked account-wide this batch (exhausted spending limit)
      and the human's ruling for it was to run the full *local* gate and merge on that, which does
      not reach Playwright e2e/visual at all — see [`docs/TESTING.md`](../../../docs/TESTING.md)'s
      own vitest-first rule, satisfied here by the jsdom coverage above; the e2e cases remain to add
      once CI (or a local Playwright run) is reachable again.

### E — Verification coverage (M)

- [ ] Vitest for every pure function this phase adds: `composeSkillLaunchPrompt` (issue, pull,
      draft, empty-template), `touchCardSkill` (eviction order).
- [ ] Vitest for the store round-trip: `cardSkillByTask` survives `partialize`/`merge`, the migration
      seeds an empty map for an existing install, and the LRU cap is enforced through the store
      action, not only in the pure helper.
- [ ] `card-detail.test.tsx` and `use-card-play.test.tsx` per their own themes above.
- [ ] Playwright: one case per surface (`e2e/kanban.spec.ts`, the graph view's own e2e file) proving
      the fork end to end against the mock bridge — skill unset opens the menu, a selection both
      launches and closes it with no second click needed.
- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean — nothing here reaches outside `packages/app`; no new `shared/` type, no
      new IPC channel.

## Files this phase touches

| Area | Path |
|---|---|
| Renderer, board | [`board-derive.ts`](../../../packages/app/src/features/projects/board/board-derive.ts) — new `composeSkillLaunchPrompt` (B), `composeCardPrompt` unchanged |
| Renderer, new | `features/projects/board/use-card-play.ts` (A, D) — the shared launch hook; `features/projects/board/card-skill-lru.ts` (C) — the LRU helper |
| Renderer, cards | [`task-card.tsx`](../../../packages/app/src/features/projects/board/task-card.tsx), [`project-graph-node.tsx`](../../../packages/app/src/features/projects/graph/project-graph-node.tsx) — Play button delegates to `useCardPlay` (A, D) |
| Renderer, detail pane | [`card-detail.tsx`](../../../packages/app/src/features/projects/board/card-detail.tsx) — the Skill `IconSelect` (C) |
| Renderer, store | [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `cardSkillByTask` in `PersistedUi`, `partialize` **and** `merge`, version bump + migration (C); [`persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) — `SESSION_STATE_KEYS` entry (C) |
| Renderer, reused unchanged | [`use-skill-handoff.ts`](../../../packages/app/src/features/agent/use-skill-handoff.ts) (the resolution idiom this phase mirrors, not calls directly), [`agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts), [`context-menu.tsx`](../../../packages/app/src/components/context-menu.tsx), [`dialog-host.tsx`](../../../packages/app/src/components/dialog-host.tsx)'s `useDialogs().openMenu`, [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts), [`icon-select.tsx`](../../../packages/app/src/components/select/icon-select.tsx) |
| Main / contract | **Unchanged.** No new IPC channel, no `shared/` schema change — stated here because a diff touching either means a theme drifted out of scope |
| Tests | `use-card-play.test.tsx` *(new)*; `board-derive.test.ts`, `card-detail.test.tsx`, `ui-store.test.ts`, `card-skill-lru.test.ts` *(new)*, `task-card.test.tsx`, `project-graph-node.test.tsx` (extended); `e2e/kanban.spec.ts` and the graph view's e2e spec (extended) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] A card with no skill set: clicking Play opens a menu at the pointer with exactly Exec,
      Brainstorm, Refine — never more, never fewer, never the full six-entry `tasks` category.
- [ ] A card with a skill set in the detail pane: clicking Play never shows a menu — it launches
      immediately with that skill's template and the issue's link, not its body.
- [ ] The composed prompt for a skill-launch is `<skill template> <issue url>` — never the title,
      assignees, labels or body that `composeCardPrompt` still includes for the manual composer.
- [ ] `CardComposer`'s own Start/Launch-and-run flow (Theme B of this phase leaves it alone) still
      composes the full prompt exactly as before — this phase changes what the *quick* Play button
      sends, not what a human reviews in the composer.
- [ ] Selecting a skill from the fallback menu persists it: a second Play on the same card skips the
      menu and launches directly with that skill.
- [ ] A draft item's Play button still produces a sensible prompt (falls back to the full compose,
      since a draft has no link to shrink to).
- [ ] The same `cardSkillByTask` state and the same Skill picker work identically from the board
      surface and the dependency-graph surface, since both render through the one `CardDetail`.
- [ ] `cardSkillByTask` round-trips through a version bump on an existing installed profile (seeded
      empty, not dropped).

## Not in this phase

A GitHub-side custom field for "skill" (would need a Phase 40-style write and a schema change; this
phase is local-only state, deliberately). Dependency-aware gating on the Play button itself — noted
in Builds-on as a pre-existing gap neither Play button closes today, and this phase does not either;
a future phase's job. Any change to `composeCardPrompt`, `CardComposer`'s own Start/Launch-and-run
buttons, or `launchAndRunEnabled`'s settings-page gate. A `.claude/skills/`-directory scanner or any
dynamic skill discovery — the dropdown draws from the app's existing, curated `AgentCommandId`
catalogue. Widening the fallback menu beyond three entries, or making it configurable. Per-user
overrides of which three skills the fallback menu offers.

## Decisions / open questions

- **Resolved — the skill list's source of truth is the app's own `AgentCommandId` catalogue
  (`agent-commands.ts` / `DEFAULT_AGENT_SKILLS`), not a `.claude/skills/` directory scan.** Verified
  nothing in `packages/app` or `packages/desktop` enumerates that directory to build a UI picker
  today — the one filesystem-probing precedent (`probeVideoSkills` in
  `desktop/src/main/video/toolchain.ts`) is video-domain-specific and still keyed off a hand-authored
  id map, not a scan for selection — and `agent-page.tsx`'s own comment argues directly against it
  ("enumerating `~/.claude/skills` would catch a typo, but it would also refuse every legitimate
  value that is not a bare skill"). Reusing `AgentCommandId` also means the detail-pane picker and
  the fallback menu draw from one list, never two that can drift.
- **Resolved — "Exec" in the fallback menu resolves to `execAdhoc` (`/midnite-exec-adhoc`), not
  `execBacklog` (`/midnite-exec`).** A Projects card is already a specific, identified task — the
  brief for `execAdhoc` is literally "build a one-off task described up front," while `execBacklog`'s
  is "pick up the *next unblocked* backlog task," which presumes a `.midnite/tasks/` phase tracker a
  GitHub-only repo may not even have. The card already picked the task; adhoc's own semantics match
  what Play is doing.
- **Resolved — "which skill" is local, renderer-only state (`cardSkillByTask`), not a
  `ForgeProjectField`.** Verified against `ForgeProjectItemContentSchema` and `ForgeProjectItemSchema`
  ([`forge-project.ts`](../../../packages/shared/src/domain/forge-project.ts)): neither has room for
  it, and adding one would mean either a real GitHub Projects custom field (a schema change plus a
  write Phase 40 never scoped) or an app-owned metadata bag GitHub never sees — the second is what
  this phase builds, keyed like `projectViewByProject` already is, and it needs no IPC channel.
- **Resolved — selecting a skill from the fallback menu persists it, not just launches once.** A
  user who reaches for the same card's Play button a second time (a retry, a follow-up) is the
  common case, and showing the menu every single time would mean this phase saved no clicks over
  today for anyone who plays a card twice. The detail-pane picker remains the place to *change* a
  choice already made; the menu is how an unset card gets its first one, and picking is deciding.
- **Noted, not fixed — neither Play button checks `blockers`.** `CardComposer`'s own Start disables
  under an unmet [Phase 75](phase-75-what-blocks-what.md) dependency; the two quick Play buttons
  never received a `blockers` prop at all and will happily launch a blocked card's agent. Fixing this
  means threading `blockers` into `useCardPlay` from both `TaskCard` (which has none today) and
  `ProjectGraphNode` (which already computes them) — real work with its own edge cases (a
  `body`-sourced blocker's known unreliability, per Phase 75's own posture), and out of scope for a
  phase about skill selection. Recorded so it reads as a known gap, not a miss.
- **Open — should `agentSkills` overrides (a user's own remapped slash-command per `AgentCommandId`,
  set in Settings ▸ Agent) apply to the fallback menu's three skills too, or always the
  `DEFAULT_AGENT_SKILLS` literal?** *Recommendation:* apply the override, exactly as `skillHandoff`
  already does (`ctx.skills[id] ?? DEFAULT_AGENT_SKILLS[id]`) — a user who has already repointed
  `brainstorm` to a fork of the skill everywhere else in the app would find a Projects card quietly
  using the stock one surprising, and the resolution is one line either way.
- **Open — does the Skill picker in `CardDetail` need its own empty/loading affordance when no
  worktree is selected?** *Recommendation:* no — unlike `CardComposer`, which needs a real `cwd` to
  build a command preview, the skill choice itself is meaningful with no repo open (it is stored
  against the item, not the launch), so the picker should render regardless of `repoId`/`worktreePath`
  and only the eventual Play action needs them.
