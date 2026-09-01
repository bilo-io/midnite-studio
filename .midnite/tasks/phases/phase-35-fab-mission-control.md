# Phase 35 — FAB Mission Control

The FAB and its panel shipped to `main` as untracked ad-hoc work (commits `a7e0fb5`…`e49448c`,
2026-09-01): a gradient-bordered, resizable panel with four loop tabs — Innovate / Automate /
Watchdog / Medic — each meant to run one long-lived agent loop. It doesn't work yet, in a
specific and diagnosable way.
[`fab-terminal-view.tsx`](../../../packages/app/src/features/fab-terminal/fab-terminal-view.tsx)
calls `startAgent(…)` and then reads `sessions[sessions.length - 1]` from the **pre-call closure
snapshot**, so every tab latches onto whatever session already existed (normally the main
terminal's auto-opened shell) — "all four tabs show the same running session" — while the
sessions it actually spawned pile into the global `terminal-store`, which
[`terminal-panel.tsx`](../../../packages/app/src/features/terminal/terminal-panel.tsx) renders
unconditionally — "the FAB spawns 4 sessions in the main terminal window". There is no notion of
a session that belongs to one surface and not another, and the four prompts are hard-coded
literals in [`fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx), duplicating
the user-editable `DEFAULT_AGENT_SKILLS` registry in
[`ui-store.ts`](../../../packages/app/src/store/ui-store.ts). This phase makes the FAB panel a
real **loop console**: each tab owns its own terminal session rendered in-panel and nowhere
else, a checkbox composer builds the prompt per run, Start becomes Stop while the loop runs (with
the gradient glow pulse), and a mission-control layer — FAB badges, attention toasts, a light run
history — makes four unattended loops legible at a glance. It also formalises the FAB area in the
tracker, which until this doc existed nowhere in `.midnite/tasks/`.

**Builds on.** Phase 15/9's `TerminalView`
([`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx)) is reused
as the in-panel terminal — it already self-manages its pty end-to-end via
[`use-terminal-ipc.ts`](../../../packages/app/src/features/terminal/use-terminal-ipc.ts) and only
needs a layout prop. Phase 30's detached broker gives FAB sessions restart survival for free the
moment they are ordinary `terminal-store` sessions. Phase 21's activity pipeline
([`activity-detect.ts`](../../../packages/desktop/src/main/activity-detect.ts) →
[`use-agent-activity.ts`](../../../packages/app/src/features/terminal/use-agent-activity.ts),
hardened in `bb1c917`) already classifies a Claude session as `thinking | waiting | idle` — the
Start/Stop glow and the amber "needs attention" state are pure consumers of it. Phase 34's
[`councils-runs-store.ts`](../../../packages/desktop/src/main/councils-runs-store.ts) is the
shape for the capped run-history store. The glow itself is lifted from styles that already exist:
`.breadcrumb-repo-pill`'s rotating conic border + box-shadow hover glow and `.fab-panel-gradient`
in [`styles.css`](../../../packages/app/src/styles.css).

**Scope guardrails.** Loops are **Claude-only** this phase — `claude` is the only roster agent
with `activity` regexes in `BUILTIN_AGENTS`, so it is the only one whose Start/Stop glow and
waiting-detection are honest; the `LoopDefinition` schema carries an `agentId` field so a roster
picker later is a schema no-op. **Stop = sleep**, not kill: the pty dies, the transcript stays
readable in the tab, and the next Start begins a fresh run. Loops keep the app's normal
type-but-don't-send posture inverted deliberately — a loop the user explicitly pressed **Start**
on auto-sends its composed command, the same justification Phase 34 recorded for councils, made
visible by the Start gesture itself. Explicitly deferred (see *Not in this phase*): an agent
picker UI, OS-native notifications, retained transcripts for *past* runs, a main-process
off-store runner, activity regexes for `agy`/`codex`/`opencode`, and auto-starting loops on app
launch.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Shared contracts: loops and surfaces (S/M)

The spine every other theme reads off; lands first.

- [ ] `LoopDefinitionSchema` in a new
      [`shared/src/loops.ts`](../../../packages/shared/src/loops.ts): `id`, `label`, `icon`
      (a token, not a component — the renderer maps it), `color`, `agentId` (fixed `'claude'`
      this phase), `basePrompt`, and `modifiers: LoopModifier[]` where a modifier is
      `{ id, label, promptFragment, defaultOn }`.
- [ ] `DEFAULT_LOOPS` — the four existing tabs as data: Innovate (`/loop /midnite-brainstorm`),
      Automate (`/loop /midnite-exec`), Watchdog (`/loop /midnite-address-issue`), Medic
      (`/loop /pr-review`), each with its first honest modifiers — e.g. Watchdog: *"Watch
      dependabot PRs"*; Medic: *"Auto-approve PRs that pass review"*; Automate: *"Auto-merge
      approved PRs"*. Fragments are plain imperative sentences appended to the base prompt.
- [ ] A pure `composeLoopPrompt(loop, checkedModifierIds, extraText?)` helper in shared —
      deterministic, unit-tested, the single place prompt assembly happens (Theme D calls it, the
      run-history log records its output).
- [ ] `surface: 'main' | 'fab'` (optional, default `'main'`) added to `TerminalSessionSchema` in
      [`shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts) — zod-optional so every
      persisted `terminals.json` from before this phase parses unchanged.
- [ ] `LoopRunRecordSchema` — `loopId`, `startedAt`, `endedAt?`, `composedPrompt`,
      `checkedModifierIds`, `exitCode?`, `status: 'running' | 'stopped' | 'exited'` — the row
      Theme E's history store persists.
- [ ] New `mstudio:loopRuns:*` IPC channel constants in
      [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) + request/response schemas
      in [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) (list/append/update),
      write channels returning the `GitOpResult`-style envelope per `CLAUDE.md`.

### B — One loop registry, not three prompt copies (M)

- [ ] The hard-coded `FAB_TABS` prompt strings in
      [`fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx) die; the panel renders
      from the loop registry.
- [ ] `ui-store` grows `loops`/`loopOverrides` state seeded from `DEFAULT_LOOPS`, replacing (or
      wrapping) `DEFAULT_AGENT_SKILLS` + `agentSkills`
      ([`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) :584/:659) so the FAB, the
      midnite menu
      ([`midnite-menu.tsx`](../../../packages/app/src/features/agent/midnite-menu.tsx)) and
      Settings all read one source. Existing `agentSkills` user overrides migrate forward rather
      than being dropped.
- [ ] Per-loop modifier **defaults** (which boxes start checked) are user state persisted next to
      the prompt overrides; per-run checkbox state is ephemeral to the tab.
- [ ] Settings → Agent grows editing for each loop's base prompt and modifier defaults, following
      the page's existing field conventions.
- [ ] A lint-friendly seam: nothing in `packages/shared` imports react or the icon libraries —
      the `icon` token→component map lives in the renderer.

### C — A session that lives in the FAB and nowhere else (M)

- [ ] Sessions created for a FAB tab carry `surface: 'fab'`;
      [`terminal-panel.tsx`](../../../packages/app/src/features/terminal/terminal-panel.tsx) and
      [`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx)
      filter to `surface !== 'fab'` — a FAB session never renders in the main housing nor appears
      in the session list.
- [ ] The stale-closure bug is gone by construction: `startAgent`
      ([`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts)) (or a
      thin `startLoop` wrapper) **returns the created session id**, and the FAB tab stores that id
      — no fishing in `sessions[length - 1]`, no `sessions` in the effect deps, no eager spawn on
      mount. A tab creates its session only when Start is pressed.
- [ ] `startAgent`'s `setTerminalOpen(true)` side effect is skipped for `surface: 'fab'` launches —
      starting a loop must not pop the main terminal panel open.
- [ ] [`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) gets a
      layout escape hatch (a `className`/`fill` prop) replacing the hard-coded
      `absolute inset-0 … invisible` block (:527) so the FAB pane hosts it cleanly; the main
      housing passes the current classes and renders pixel-identically.
- [ ] The FAB host replicates the `pendingInput` handoff the main housing does at
      `terminal-panel.tsx:191` (`pendingInput[id] ?? agentInitialInput(…)` → `initialInput`),
      so the composed command actually reaches the pty — and the FAB's current wrong
      `initialInput={prompt}` (raw slash-text, bypassing
      [`agent-invocation.ts`](../../../packages/shared/src/agent-invocation.ts)) is deleted.
- [ ] Loop launches append the trailing `\r` (the Phase 34 auto-send exception, justified by the
      explicit Start gesture) — via `queueInput(id, line + '\r')` or an `autoSend` flag on
      `startAgent`, whichever reads cleaner.
- [ ] Broker restart behaviour: on app relaunch, persisted `surface: 'fab'` sessions rehydrate
      **asleep** into their tabs (transcript intact, per Phase 30's honest-ended posture), never
      into the main list.

### D — Compose, Start, Stop, glow (M)

- [ ] Each FAB tab gets a **controls block above the terminal area**: the loop's modifier
      checkboxes (seeded from user defaults), a small free-text "extra instructions" field, and
      the Start button. Controls collapse to a slim strip once running.
- [ ] Start calls `composeLoopPrompt(…)`, creates the `surface: 'fab'` session via Theme C, and
      swaps to **Stop**; the composer inputs disable while a run is live.
- [ ] Stop = `sleepSession`
      ([`terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts) :414):
      pty killed, transcript kept and readable in the tab; the button returns to Start, which
      begins a **fresh** session (the asleep one is closed once its replacement starts).
- [ ] Button state derives from `sessionPhase(session, states[id])` (`terminal-store.ts:32`) —
      `live` → Stop, `asleep`/`ended`/none → Start — so a loop that exits on its own flips the
      button back without extra bookkeeping.
- [ ] While the run is live the button wears the gradient glow pulse: a new `.loop-run-glow` (or
      `.is-running` modifier) in [`styles.css`](../../../packages/app/src/styles.css) built from
      `.breadcrumb-repo-pill`'s conic border + box-shadow glow (:509–:568), pulsing while
      `activity === 'thinking'`, steady amber while `'waiting'`.
- [ ] Every new animation gets the matching `html[data-motion='reduced']` opt-out rule, same as
      `.fab-panel-gradient` (:603).
- [ ] Tab strip affordance: each FAB tab shows a small live-state dot (its loop colour while
      running, amber while waiting) so state is visible without switching tabs.

### E — Mission control: badges, toasts, history (M/L)

- [ ] The **collapsed FAB button** wears the gradient glow while ≥1 loop is live, plus up to four
      per-loop colour dots (one per running loop, amber when that loop is `waiting`); no loops
      running → today's static FAB, untouched.
- [ ] An **attention toast** fires when a live loop's activity transitions to `waiting`
      (debounced — one per transition, not per frame), reusing the Phase 22 toast surface
      ([`phase-22-stash-and-safety-net.md`](phase-22-stash-and-safety-net.md)); clicking it opens
      the FAB panel on that tab.
- [ ] `packages/desktop/src/main/loop-runs-store.ts`: a capped (200-entry, matching
      `councils-runs-store.ts`) global JSON store of `LoopRunRecord`s under `userData`; appended
      on Start, finalised on stop/exit. Unit-tested round-trip + cap behaviour, merge-tolerant of
      one malformed entry per the `agents-store.ts` convention.
- [ ] Preload + main handlers + a `use-loop-runs.ts` renderer hook over the `mstudio:loopRuns:*`
      channels.
- [ ] A **history list** under each tab's controls: that loop's recent runs — started/ended,
      duration, exit status, and the composed prompt on expand (the record of exactly which
      toggles a run carried).
- [ ] Waiting-state detection is wired through the existing pipeline only — no new byte-parsing;
      if `useAgentActivity` can't classify (non-claude future), the UI degrades to
      liveness-only honestly.
- [ ] E2E: a Playwright spec asserting the FAB session never appears in the main session list,
      and the Start→Stop swap renders (extend
      [`panel-glow.spec.ts`](../../../packages/app/e2e/panel-glow.spec.ts)'s pattern for the glow
      class presence).

## Not in this phase

- Per-tab **agent picker** (schema-ready via `agentId`; UI + `agy`/`codex`/`opencode` activity
  regexes deferred).
- **OS-native notifications** for waiting loops (needs focus-awareness + a settings toggle).
- **Retained transcripts for past runs** — history keeps metadata + composed prompt only.
- A main-process, councils-style **off-store runner** — FAB sessions are ordinary store sessions
  with a `surface` flag, on purpose.
- **Auto-start on launch** ("resume my loops") — rehydration is asleep-only.

## Files this phase touches

| Area | Files |
|------|-------|
| shared | [`shared/src/loops.ts`](../../../packages/shared/src/loops.ts) *(new)*, [`shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts), [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) |
| app — FAB | [`components/fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx), [`features/fab-terminal/fab-terminal-view.tsx`](../../../packages/app/src/features/fab-terminal/fab-terminal-view.tsx), [`app.tsx`](../../../packages/app/src/app.tsx) (FAB button + dots) |
| app — terminal | [`features/terminal/terminal-panel.tsx`](../../../packages/app/src/features/terminal/terminal-panel.tsx), [`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx), [`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx), [`terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts), [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts) |
| app — state/settings | [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts), Settings → Agent page, [`features/agent/midnite-menu.tsx`](../../../packages/app/src/features/agent/midnite-menu.tsx) |
| app — styles | [`styles.css`](../../../packages/app/src/styles.css) (`.loop-run-glow` + reduced-motion rule) |
| desktop | `main/loop-runs-store.ts` *(new)*, preload bridge, main IPC handlers |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Open the FAB panel, press Start on two different tabs: two distinct sessions run, each
      visible only in its own tab; the main terminal panel neither opens nor lists them.
- [ ] Toggle a modifier, Start, and confirm the composed prompt in the terminal (and in the run
      history record) carries the fragment; untoggle → it doesn't.
- [ ] Start → button becomes Stop with the glow pulse; the loop finishing on its own flips it back
      to Start; Stop mid-run keeps the transcript readable and the next Start begins fresh.
- [ ] Drive a loop to a prompt that awaits input: tab dot and FAB dot turn amber, one toast fires,
      clicking it lands on the right tab.
- [ ] Quit and relaunch mid-run: the FAB tab shows the session asleep with its transcript; the
      main session list still doesn't contain it.
- [ ] `data-motion='reduced'` kills the new animations.
- [ ] Old `terminals.json` (no `surface` field) still hydrates; existing `agentSkills` overrides
      survive the registry migration.

## Decisions / open questions

- **Resolved — hosting:** `surface` flag on `TerminalSessionSchema`, not a councils-style
  off-store runner (keeps xterm interactivity, broker survival, activity detection for free).
- **Resolved — Stop semantics:** sleep (transcript kept), fresh session per Start.
- **Resolved — registry:** full unification with `DEFAULT_AGENT_SKILLS`, user-editable in
  Settings.
- **Resolved — modifiers:** per-loop declared toggles + a free-text extras field.
- **Resolved — FAB affordance:** glow + per-loop dots; attention = in-app toast + amber badge;
  history = light log; Claude-only this phase.
- **Open — graceful stop:** should Stop try an interrupt (Ctrl+C) before the kill that
  `sleepSession` does? *Recommendation:* ship hard-sleep first; add a two-stage stop only if
  loops prove to leave repos mid-write in practice.
- **Open — where the old `agentSkills` API lands:** wrap it (keep the key, feed it from loops) or
  migrate-and-delete. *Recommendation:* migrate-and-delete inside this phase — two registries
  half-alive is how the FAB got its duplicate prompts in the first place.
- **Open — dot density:** four dots on a FAB is the cap by construction today; revisit only if
  loops become user-definable in count.
