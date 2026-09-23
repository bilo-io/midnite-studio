# Phase 95 — Agentic improvements

Brainstormed with the user · 2026-09-23 · seeded by an "Agentic Improvements" brief and grounded
against the tree (and a fresh clone of `bilo-io/midnite` at `~/Dev/midnite/midnite`).

The app can already point an agent at a card ([Phase 92](phase-92-agentic-execution-from-projects.md)),
draw what blocks what ([Phase 75](phase-75-what-blocks-what.md)), run a workflow
([Phase 43](phase-43-workflows-mvp.md)) and glow while something is happening
([Phase 35](phase-35-fab-mission-control.md), [Phase 37](phase-37-fab-tab-glow.md)). What it cannot
do is *say, in one visual language, who is working on what*; *create* the issues and projects it
renders; *plan* work before it exists; *keep going* when a task finishes; or *stop everything* at a
chosen scope. This phase does those five things, in ten themes that swarm once Theme A lands.

> **Builds on.**
> - **Glow.** `.agent-run-glow` ([`styles.css:3029-3140`](../../../packages/app/src/styles.css)),
>   `.loop-run-glow` (`:2823-2960`), `.gradient-border` (`:636-741`) and the `--rainbow-0..5` /
>   `--rainbow-ramp` tokens (`:595-606`). Kanban and graph derive their ring through
>   [`deriveCardGlowState`](../../../packages/app/src/features/projects/board/glow-state.ts)
>   (`running|waiting|open|idle`). `--brand-gradient` and `--accent-gradient` come from
>   `@bilo-io/shell/dist/appearance.css`, not this repo. **Status colours are hardcoded in at least
>   six places**: `STATUS_TONE` ([`run-node-detail.tsx:16`](../../../packages/app/src/features/workflows/canvas/run-node-detail.tsx),
>   councils), `STATUS_COLOR` (`loops/loop-history.tsx:77`), `STATUS_CLASSES` (`notes/note-row.tsx:12`),
>   `STATUS_COLORS` (`status-bar/notification-bell.tsx:7`), the loop hexes in `loops/loop-glow.ts:26`,
>   and [`field-option-colors.ts`](../../../packages/app/src/features/projects/field-option-colors.ts)'s
>   `SWATCH` + `STATUS_FALLBACKS`. There is **no metallic/silver effect anywhere**.
> - **Session identity.** `TerminalSessionSchema` ([`shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts))
>   has `kind`, `agentId`, `repoId`, `surface` (`main|fab|kanban`) and `taskRef`. `liveAgentId`
>   (from the `ps` probe) plus `isAgentRow`/`resolveSessionAgentId` in
>   [`terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts) decide agent
>   vs shell; [`activity-detect.ts`](../../../packages/desktop/src/main/activity-detect.ts) emits
>   `thinking|waiting|idle`. `resolveAgentIcon` ([`components/icons`](../../../packages/app/src/components/icons))
>   already maps an agent id to its mark.
> - **Forge.** `ForgeAdapter` ([`forge/adapter.ts:52-159`](../../../packages/desktop/src/main/forge/adapter.ts))
>   reads issues and boards but writes only `commentIssue`, `setIssueState` and `setItemField`.
>   `addItemToProject` / `clearItemFieldValue` live off-adapter in
>   [`gh-project-write.ts`](../../../packages/desktop/src/main/forge/github/gh-project-write.ts), and
>   [`forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts)
>   bypasses the registry with `GITHUB_COM_FORGE`. Blocked-by / parent / sub-issue links are
>   **read-only** (`gh-project.ts:136-140`) and GitHub-only; `resolveForgeGraph`
>   ([`forge-graph.ts:251`](../../../packages/shared/src/domain/forge-graph.ts)) also honours a
>   "Blocked by" field and `#N` body refs. `capabilitiesFor(kind)`
>   ([`forge-account.ts:151-277`](../../../packages/shared/src/domain/forge-account.ts)) is
>   per-surface, not per-operation.
> - **AI.** No direct LLM HTTP call exists. The companion's `ask`
>   ([`companion/ask.ts`](../../../packages/desktop/src/main/companion/ask.ts)) spawns the installed
>   agent CLI headless via `agentHeadlessArgs` — the precedent this phase follows. `LOOP_MODELS`
>   ([`shared/src/loops.ts:154-162`](../../../packages/shared/src/loops.ts)) is Claude-only.
> - **Board.** Play goes through [`use-card-play.ts`](../../../packages/app/src/features/projects/board/use-card-play.ts);
>   a drop in [`board-view.tsx:344-395`](../../../packages/app/src/features/projects/board/board-view.tsx)
>   is only a status-field write (`moveItemToColumn`).
> - **Workflows.** Studio's canvas is hand-rolled SVG
>   ([`workflow-canvas.tsx`](../../../packages/app/src/features/workflows/canvas/workflow-canvas.tsx)),
>   node kinds `http|transform|condition|delay|note` ([`shared/src/workflow.ts`](../../../packages/shared/src/workflow.ts)),
>   executed in-process by [`workflow-engine.ts`](../../../packages/desktop/src/main/workflow/workflow-engine.ts)
>   — no pty. Statuses render only in the read-only history view, as `STATUS_STROKE`. midnite's editor
>   (`~/Dev/midnite/midnite/packages/web/components/workflow-editor.tsx`) is `@xyflow/react` ^12 +
>   `@dagrejs/dagre`, with `node-palette.tsx`, `node-config-panel.tsx`, `run-history-panel.tsx`,
>   `run-output-panel.tsx`, `workflow-page-header.tsx`, `workflow-canvas.tsx`,
>   `nodes/workflow-node-view.tsx` and the `.node-running` ring (`app/globals.css:1355-1406`).
>   Same owner, no licence obstacle.

> **Scope guardrails.**
> - **Package boundaries hold.** Palette schema, node kinds, session refs and forge payloads go in
>   `shared` (zod only). Forge writes and headless-CLI calls live in `desktop` main. The renderer
>   reaches both only through `window.midniteStudio`. midnite's gateway REST/WebSocket calls become
>   IPC channels; its node executors become main-process executors.
> - **Every IPC op returns `GitOpResult`-style envelopes** — a forge write failure, an unsupported
>   provider operation or a CLI timeout is a rendered outcome, never a throw.
> - **No direct model HTTP API.** The wand and the planner shell out to the agent CLI the user
>   already logged into (the `companion/ask.ts` precedent). No new API-key storage.
> - **Destructive ops keep the blast-radius confirm** (delete issue, delete project, kill switch).
> - **Motion policy holds.** Every new animation carries the paired
>   `prefers-reduced-motion` / `html[data-motion='reduced']` guards
>   (`styles-motion-guards.ts` enforces it), pauses on `html[data-window-focused='false']`, and
>   never animates `filter: blur()`. Idle-CPU is measured, not assumed (`scripts/perf/idle-cpu.mjs`).
> - **Icons are `react-icons` only** — midnite's `lucide-react` imports become `react-icons/lu`
>   `Lu*` equivalents; `next-intl` strings become plain strings.
> - **React Flow never reaches the entry chunk** — it loads with the Workflows view, and
>   `scripts/perf/bundle-report.mjs` proves it (Theme I).

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

Dependency order: **A** first (every glow consumer reads its tokens). **B**, **C**, **D** then run in
parallel. **E** and **F** need **D**. **G** needs **C**. **H** needs **G** and the session refs.
**I** is independent of everything but **A**; **J** needs **I** and **H**'s session refs.

## Deliverables

### A — One activity palette, one glow (M) — ✅ DONE (PR #524, 2026-09-23)

- [x] `shared/src/activity-palette.ts`: `ActivityStatusSchema` =
      `agent | shell | thinking | waiting | running | queued | done | failed | idle`, and
      `ActivityPaletteSchema` — per status either a gradient (ordered stops) or a solid colour, plus
      `speed` and `intensity`. Export `ACTIVITY_PRESETS`: **Brand** (default — `--brand-gradient`
      for `agent`, theme-derived solids elsewhere), **Rainbow** (today's `--rainbow-ramp`,
      byte-identical), **Ocean**, **Ember**, **Mono**.
- [x] `useActivityPaletteSync` writes the resolved palette to `:root` as
      `--activity-<status>-{from,via,to}` / `--activity-<status>` custom properties, the same way
      `use-palette-sync.ts` (Phase 64) writes theme tokens.
- [x] One CSS family, `.activity-glow` + `[data-activity-status=…]`, built from the working
      precedents: conic ring through two-layer `background-clip`, a `@property`-registered angle,
      and a `box-shadow` pulse. `agent` paints the active preset's gradient; **`shell` paints a
      rotating metallic ring** — a conic sweep of silver stops (`#f5f5f5 → #9ca3af → #e5e7eb →
      #6b7280 → #f5f5f5`) with a narrow specular highlight so the rotation reads as brushed metal
      catching light; `waiting` stays a steady, unanimated ring (the existing amber rule's intent).
- [x] `.agent-run-glow` and `.loop-run-glow` become aliases over `.activity-glow` (same DOM, no
      new node), so existing call sites and tests keep working; the Rainbow preset renders them
      pixel-identical to today. **Decision (unattended run):** rather than literally rewriting
      their CSS onto the resolved tokens, both classes are left byte-for-byte unchanged and
      documented as this family's "Rainbow-pinned legacy aliases" — the Brand preset is the new
      default and visually differs from the old always-rainbow ring, so rewiring these two in
      place would have silently changed `kanban-card.spec.ts`'s committed visual baselines and
      risked `fab-loops.spec.ts`/`kanban.spec.ts`'s class assertions before Theme C ever points a
      real card/node at `.activity-glow`. `activity-palette.test.ts` proves the Rainbow preset's
      `agent` stops equal `--rainbow-ramp` byte-for-byte instead, at the token level. Theme C is
      where real consumers switch over and any re-baselining belongs.
- [x] Move the six hardcoded status maps (`STATUS_TONE`, `STATUS_COLOR`, `STATUS_CLASSES`,
      `STATUS_COLORS`, `loop-glow.ts` hexes, `field-option-colors.ts` `STATUS_FALLBACKS`) onto the
      tokens, so a status pill and its card's glow are always the same colour. **Decision
      (unattended run):** `STATUS_TONE` (`run-node-detail.tsx`), `STATUS_COLOR`
      (`loop-history.tsx`) and `STATUS_COLORS` (`notification-bell.tsx`) are fully migrated to
      `var(--activity-<status>)` via a small per-domain → `ActivityStatus` map plus the new
      `activityStatusVar()` helper. `loop-glow.ts`'s `LOOP_WAITING_COLOR` now imports the shared
      `ACTIVITY_WAITING_AMBER` literal instead of restating `#f59e0b` a fourth time; its
      `LOOP_GLOW` per-loop-*identity* map is deliberately left alone — the file's own prior
      Decision 1 already rejected merging it with any spectrum/status system, and six loop
      identities don't map onto nine run-state slots. `field-option-colors.ts`'s
      `STATUS_FALLBACKS` and `note-row.tsx`'s `STATUS_CLASSES` are documented exceptions, not
      migrated: both build a text/border/background triplet by string-concatenating an alpha
      suffix onto a *hex* value (`${hex}1A`), and the shared palette's semantic colours are
      `hsl(var(--token))` expressions for exactly this reason (theme/light-dark correctness) —
      concatenating an alpha suffix onto a `var()` expression is not valid CSS. Each file carries
      a comment explaining the exception and pointing at this decision.
- [x] Motion guards on every new keyframe; the angle animation pauses on a blurred window.
- [x] Tests: palette schema round-trip, preset resolution, token writer (vitest/jsdom);
      `styles-motion-guards` passes with the new keyframes.

### B — Settings ▸ Activity (M)

- [ ] New `activity` entry in `SETTINGS_PAGE_IDS` / `SETTINGS_PAGES`
      ([`ui-store.ts:218-258`](../../../packages/app/src/store/ui-store.ts)) beside `appearance`,
      with `settings-pages/activity-page.tsx` mapped in
      [`settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx)'s `PAGE_CONTENT`.
- [ ] A preset picker (Brand first, then Rainbow, Ocean, Ember, Mono) as swatch buttons.
- [ ] Per-status overrides: one row per `ActivityStatus` with a colour/gradient editor and a reset.
- [ ] An **agent style** / **shell style** pair (gradient vs metallic, with a "match agent" option
      for shells), plus speed and intensity sliders.
- [ ] A live preview strip rendering one sample card, graph node, workflow node and terminal row
      per status, driven by the same `.activity-glow` classes.
- [ ] Persist via `appearance-store.ts`'s `'midnite.settings'` store (shared settings storage), not
      `ui-store`, so it lives beside accent and motion.
- [ ] Tests: page renders every status row; picking a preset rewrites the tokens; reset restores.

### C — The glow everywhere, with who is doing it (M)

- [ ] One hook, `useActivityGlow(target)`, that resolves a target's `ActivityStatus` in one place:
      an agent **actively working** on it → `agent` (or `thinking`); an agent waiting on input →
      `waiting`; a plain shell → `shell`; otherwise the target's own state (card status pill,
      workflow node run state). Replaces `deriveCardGlowState`'s callers.
- [ ] Apply to: kanban cards ([`task-card.tsx`](../../../packages/app/src/features/projects/board/task-card.tsx)),
      project graph nodes ([`project-graph-node.tsx`](../../../packages/app/src/features/projects/graph/project-graph-node.tsx)),
      workflow canvas nodes (Theme I's node view), terminal session rows
      ([`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx))
      and the Sessions view ([`sessions-view.tsx`](../../../packages/app/src/features/sessions/sessions-view.tsx)).
- [ ] When no session is on a card, its glow matches its **status pill's** colour (`done`, `in
      review`, …) as a static ring; the animated ring is reserved for live work.
- [ ] **Identity badge.** Wherever a glow is showing, a small badge sits on the element's corner:
      the **agent's own icon** via `resolveAgentIcon(liveAgentId ?? agentId)` for agent sessions
      (tracking the live agent, so `claude` typed into a plain shell flips the badge), or a
      **terminal glyph** (`LuSquareTerminal`) for a plain shell. Several sessions on one target
      stack, capped at three with `+N`. Hover names the agent/shell; click reveals the session.
- [ ] Tests: `useActivityGlow` precedence table (agent-working beats run state beats pill);
      badge renders the right icon per session kind and stacks past three.

### D — Forge issue and project CRUD (L)

- [ ] Extend `ForgeAdapter` with `createIssue`, `editIssue` (title, body, labels, assignees,
      milestone), `deleteIssue`, `createProject`, `editProject`, `deleteProject`, `addProjectItem`
      (existing issue or draft), `removeProjectItem`, `linkIssues({kind: 'blockedBy'|'subIssue'})`
      and `unlinkIssues`. Payload schemas in `shared`.
- [ ] Per-operation capability: extend `capabilitiesFor(kind)` with an `ops` record
      (`createIssue`, `deleteIssue`, `createProject`, `linkBlockedBy`, `linkSubIssue`, …) so the UI
      hides what a provider cannot do rather than failing on click.
- [ ] GitHub: `gh issue create/edit/delete`, `gh project create/edit/delete/item-add/item-delete`,
      and the GraphQL `addBlockedBy` / `addSubIssue` mutations (and their removes), in
      [`gh-write.ts`](../../../packages/desktop/src/main/forge/github/gh-write.ts) /
      `gh-project-write.ts` — through the write queue's forge equivalent, one mutation at a time.
- [ ] GitLab / Azure DevOps / Bitbucket: implement what each API allows (issue CRUD at least);
      where a provider has no native dependency link, `linkIssues` falls back to appending a
      `Blocked by #N` line to the issue body — which `resolveForgeGraph` already parses — and
      reports `{ok:true, via:'body'}`.
- [ ] Route [`forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts)
      through the adapter registry instead of `GITHUB_COM_FORGE`, and fold `addItemToProject` /
      `clearItemFieldValue` onto the adapter.
- [ ] Delete issue / delete project go through the blast-radius confirm (issue count on the board,
      linked items).
- [ ] Tests: command construction per provider (argv snapshots, no network); capability matrix;
      body-fallback link writes idempotently (no duplicate `Blocked by` lines).

### E — Issue and project dialogs, with a magic wand (L)

- [ ] `IssueDialog` (create/edit) and `ProjectDialog` (create/edit) on `Modal`, following
      [`report-issue-dialog.tsx`](../../../packages/app/src/components/report-issue-dialog.tsx);
      entry points: Issues view header, Projects header beside the board select, card detail
      "Edit issue". Fields shown per the provider's `ops` capability.
- [ ] `shared/src/ai-models.ts`: a per-provider fast/cheap model registry (`claude → haiku`,
      `codex → its mini model`, `gemini → flash`, …) with `cheapModelFor(agentId)` and
      `fastModelFor(agentId)`, superseding the Claude-only assumption for these two uses.
- [ ] Main-side `ai:improveField` — builds a short prompt (field name, current text, the other
      fields as context, the repo name), runs the provider's CLI headless with its cheap model and a
      deadline (the `ask.ts` pattern), and returns the rewritten text in an envelope.
- [ ] A wand icon button (`react-icons` wand glyph) beside each text field: click → field goes
      read-only with the `.activity-glow` agent ring while generating → the suggestion replaces the
      value with a one-step Undo. Esc cancels the call.
- [ ] Provider choice: the provider of the most recently launched agent in this repo, overridable
      in Settings ▸ Agent.
- [ ] Tests: prompt builder; envelope on CLI missing / timeout / empty output; dialog fields gated
      by capability.

### F — Plan with AI (L)

- [ ] An inline **prompt input + "Plan with AI" button** pair, in the Projects toolbar, the
      create-project dialog, and the issue detail pane (for an existing issue). The input wears the
      full glow (border + pulse) when focused and only the gradient border otherwise.
- [ ] Main-side `ai:planBlueprint` — runs the provider's **fast, non-thinking** model headless and
      asks for JSON: `{project: {title, description}, tasks: [{key, title, body, labels}],
      edges: [{from, to, kind: 'blockedBy'}]}`, validated with zod; one retry on invalid JSON, then
      an error envelope.
- [ ] A review sheet: editable task rows (title, body, labels), add/remove rows, edit edges, and a
      mini dependency preview using the project graph's layout. **Re-plan** iterates with the
      current edits sent back as context. The sheet is **editable except while a plan is
      generating** (locked, with the agent glow on the sheet).
- [ ] **Nothing touches the forge until Confirm.** Confirm runs Theme D ops in order: create the
      project (or target the chosen one) → create each issue → add each to the project → write each
      blocked-by link, with a progress list and per-step envelopes. A partial failure stops, lists
      what was created, and offers Retry-remaining.
- [ ] From an existing issue: the same sheet, but Confirm creates **sub-issues** of it
      (`linkIssues subIssue`) plus their blocked-by edges.
- [ ] The new edges appear in the project graph on the next refresh (they arrive through the
      existing `blockedBy` read).
- [ ] Tests: blueprint schema; confirm sequencing and partial-failure report; edit lock while
      generating.

### G — Card and node controls, and drag-to-skill (M)

- [ ] On kanban cards and graph nodes: **Start** (today's Play via `useCardPlay`), **Stop** (ends
      the card's live session through `closeSessionWithConfirm`), and a **`>_` toggle** that shows /
      hides the card's session (terminal panel reveal, or `card-terminal.tsx`'s embedded xterm).
- [ ] A column → skill map in Settings ▸ Projects, defaulting to **In progress →
      `/midnite-create`** and **In review → `/midnite-review`**, editable per project; unmapped
      columns keep today's status-only drop.
- [ ] On a drop into a mapped column: move the card (today's optimistic write), then start the
      mapped skill with **only the issue or PR link** as its argument (`composeSkillLaunchPrompt`),
      behind a **5 s toast with Undo** that cancels before the prompt is sent (and reverts the move
      if chosen). Respects an existing live session on the card (reveal, don't double-launch).
- [ ] The In review trigger resolves the card's linked PR URL; with no PR, it falls back to the
      issue URL and says so in the toast.
- [ ] Tests: drop → skill mapping; Undo within the window sends nothing; existing session is
      revealed, not duplicated.

### H — Auto-mate, and the kill switch (L)

- [ ] **Session attribution.** Add optional `projectRef {projectId, forge}`, `workflowRunRef
      {workflowId, runId, nodeId}` and `forgeAccountKey` to `TerminalSessionSchema` (in the object
      literal, not `.extend()` — the schema ends in `.superRefine`), stamped by whatever launches the
      session (card Play, drag-to-skill, Auto-mate, workflow run). Unstamped sessions are reachable
      only by the repo and global scopes.
- [ ] **Auto-mate** — a toggle on a project board (and on a workflow). While on: when a task's
      session ends successfully, pick the **next unblocked card in board order** in the Todo column
      (all `blockedBy` issues closed) and start it with the column's mapped skill. A concurrency cap
      (1–5, **default 1**) in Settings ▸ Projects. Stops when nothing unblocked remains, and **stops
      on the first failed task** rather than skipping ahead.
- [ ] The toggle and the board header wear the agent `.activity-glow` while Auto-mate is on; a
      status-bar chip shows each running mate and its scope.
- [ ] **Kill switch** — a button beside every Auto-mate toggle and in the command palette
      (`automate.kill`, registered in [`keybindings.ts`](../../../packages/shared/src/keybindings.ts)
      `COMMANDS`). Opens a modal with **five large icon options with labels**: **Flow**, **Project**,
      **Repo**, **Forge user**, **Global**. Below the options, one plain sentence explains the
      selected scope and how many sessions it will stop ("Stops 3 sessions and turns off Auto-mate
      for Midnite Studio's project board."). At the bottom, **half-width Cancel and Confirm**.
- [ ] Confirm turns off every Auto-mate in scope, then kills each matching session through
      `pty.kill`; Global also kills plain shells, with the count shown before confirming.
- [ ] Tests: next-card selection (blocked, board order, cap); scope → session filter per attribution
      field; modal sentence per scope; focus returns to the trigger on close (Phase 68).

### I — The workflow editor, at midnite's level (L)

- [ ] Adopt `@xyflow/react` and `@dagrejs/dagre`, **loaded only with the Workflows view** (dynamic
      import). This deliberately reverses Phase 43's no-graph-library decision; record the before /
      after entry-chunk and total-JS numbers from `bundle-report.mjs` in the PR.
- [ ] Port midnite's editor shell into `packages/app/src/features/workflows/`: the collapsible,
      searchable **node palette** (drag onto canvas), the right **config panel** swappable with
      **run history** (with step-through replay), floating **panel toggles** with animated widths,
      and the collapsible **bottom run panel** with **Nodes** (input / resolved params / output /
      error) and **Logs** tabs plus markdown export.
- [ ] Port the **toolbar** behaviour (`workflow-page-header.tsx`): edit details, run history,
      save-as-template, enabled toggle, Run, Save/Saved with autosave, busy spinner; icons mapped to
      `react-icons/lu`.
- [ ] Port the canvas: dot background, zoom/fit controls, pannable minimap, animated edges, and the
      card-style node view (tinted header by category hue, icon chip, one-line summary, status glyph,
      inline error). Category hue tokens (`--node-trigger|action|logic|data|storage`) join the theme
      tokens.
- [ ] **Live run state on the editing canvas** — not only the history view. Replace the bare
      `workflowRunChanged` re-fetch with per-node status in the event payload.
- [ ] Existing workflows open unchanged: a migration maps saved SVG-canvas positions onto React Flow
      node positions; `http|transform|condition|delay|note` all render as card nodes.
- [ ] Replace midnite's gateway REST/WebSocket calls with the existing workflow IPC channels.
- [ ] Tests: position migration; palette search/filter; bottom panel tabs render a run; e2e only
      for drag-from-palette and panel-resize (real pointer + layout — named in the spec header).

### J — Agent and script nodes, grouped in the terminal (L)

- [ ] New node kinds in `shared/src/workflow.ts`: **`agent`** (agent id, skill or prompt, model)
      and **`script`** (command, cwd, env). Both execute in a **real pty session** started by main,
      stamped with `workflowRunRef`; the node succeeds or fails on the session's exit status (agent:
      when its activity reaches idle after the prompt, plus an explicit done marker).
- [ ] **Terminal accordion groups.** When a run starts, the terminal session list gains a group
      headed by the workflow's icon and name (and run number), containing one session per agent /
      script node as it starts. Reuse the Sessions view's accordion (`groupSessionsByRepo` /
      `collapsedRepos` / sticky header in [`session-order.ts`](../../../packages/app/src/features/sessions/session-order.ts))
      rather than writing a second one. Ungrouped sessions render exactly as today.
- [ ] Group header controls: collapse, reveal run in the Workflows view, and the kill switch
      pre-scoped to **Flow**.
- [ ] **Node glow.** Workflow nodes follow the global Activity settings: an agent actively working
      on a node shows the agent gradient + its identity badge; a script node shows the metallic shell
      ring + terminal badge; any node **without an agent actively working on it** shows its run state
      (`queued`, `running`, `waiting`, `done`, `failed`) in that status's configured colour.
- [ ] Tests: executor lifecycle for agent / script nodes (fake pty); grouping of sessions by
      `workflowRunRef`; node glow precedence.

## Files this phase touches

| Area | Files |
|---|---|
| Contract | [`shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts), [`shared/src/workflow.ts`](../../../packages/shared/src/workflow.ts), [`shared/src/domain/forge-account.ts`](../../../packages/shared/src/domain/forge-account.ts), [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts), new `shared/src/activity-palette.ts`, new `shared/src/ai-models.ts`, `shared/src/ipc/channels.ts` |
| Main | [`forge/adapter.ts`](../../../packages/desktop/src/main/forge/adapter.ts), [`forge/github/gh-write.ts`](../../../packages/desktop/src/main/forge/github/gh-write.ts), [`forge/github/gh-project-write.ts`](../../../packages/desktop/src/main/forge/github/gh-project-write.ts), the GitLab / Azure / Bitbucket adapters, [`ipc/forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts), [`companion/ask.ts`](../../../packages/desktop/src/main/companion/ask.ts) (shared headless runner), [`workflow/workflow-engine.ts`](../../../packages/desktop/src/main/workflow/workflow-engine.ts) + new `executors/agent.ts`, `executors/script.ts`, [`workflow-service.ts`](../../../packages/desktop/src/main/workflow-service.ts) |
| Renderer — glow | [`styles.css`](../../../packages/app/src/styles.css), [`glow-state.ts`](../../../packages/app/src/features/projects/board/glow-state.ts), [`appearance-store.ts`](../../../packages/app/src/store/appearance-store.ts), new `settings-pages/activity-page.tsx`, [`settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx), [`field-option-colors.ts`](../../../packages/app/src/features/projects/field-option-colors.ts) |
| Renderer — projects | [`task-card.tsx`](../../../packages/app/src/features/projects/board/task-card.tsx), [`project-graph-node.tsx`](../../../packages/app/src/features/projects/graph/project-graph-node.tsx), [`board-view.tsx`](../../../packages/app/src/features/projects/board/board-view.tsx), [`use-card-play.ts`](../../../packages/app/src/features/projects/board/use-card-play.ts), [`projects-view.tsx`](../../../packages/app/src/features/projects/projects-view.tsx), [`card-detail.tsx`](../../../packages/app/src/features/projects/board/card-detail.tsx), new issue / project dialogs and plan sheet |
| Renderer — terminal | [`terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts), [`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx), [`sessions-view.tsx`](../../../packages/app/src/features/sessions/sessions-view.tsx), [`session-order.ts`](../../../packages/app/src/features/sessions/session-order.ts), [`close-session.ts`](../../../packages/app/src/features/terminal/close-session.ts) |
| Renderer — workflows | [`features/workflows/`](../../../packages/app/src/features/workflows/) (canvas replaced; palette, config panel, run panel, toolbar added) |
| Crib (read-only) | `~/Dev/midnite/midnite/packages/web/components/{workflow-editor,node-palette,node-config-panel,run-history-panel,run-output-panel,workflow-page-header,workflow-canvas}.tsx`, `nodes/workflow-node-view.tsx`, `app/globals.css:27-90,1355-1406`, `packages/ui/src/styles/tokens.css` |

## Verification

- [ ] `moon run :typecheck :lint :test` green; no boundary rule suppressed.
- [ ] Switching Settings ▸ Activity presets (Brand → Rainbow → Ocean → Ember → Mono) repaints every
      live glow — card, graph node, workflow node, terminal row — and the matching status pills,
      without a reload.
- [ ] Rainbow preset renders `.agent-run-glow` / `.loop-run-glow` identically to before
      (committed visual baseline, locator-cropped).
- [ ] A plain shell shows the rotating metallic ring and a terminal badge; typing `claude` in it
      flips it to the agent gradient and the Claude badge.
- [ ] `idle-cpu.mjs --blurred` with several glowing cards is no worse than the pre-phase reading;
      `html[data-motion='reduced']` stops every new animation.
- [ ] Create, edit and delete an issue and a project on GitHub from the app; on GitLab, an issue
      create + a body-fallback blocked-by link shows as an edge in the project graph.
- [ ] Wand improves a field using the cheap model; missing CLI shows an error envelope, not a
      crash.
- [ ] Plan with AI → edit → Re-plan → Confirm creates the project, issues and blocked-by links on a
      real GitHub board, and the graph shows the dependencies; the same from an existing issue
      creates sub-issues.
- [ ] Dragging a card to In progress starts `/midnite-create <issue-url>` after the toast; Undo
      inside 5 s sends nothing.
- [ ] Auto-mate with cap 1 on a three-card chain runs them in dependency order and stops on a
      forced failure; the kill switch at Project scope stops it and its session, and the modal's
      sentence and counts match what was stopped.
- [ ] `bundle-report.mjs`: entry chunk unchanged by React Flow (numbers in the PR).
- [ ] A workflow with one agent node and one script node creates one terminal accordion group
      with two sessions; nodes glow per the precedence rule, and the group's kill switch stops both.
- [ ] Human pass: the whole loop — plan a project, drag a card, let Auto-mate carry the chain,
      kill it — on a packaged build.

## Not in this phase

- midnite's schedule / webhook / task-event triggers, `fx` expression fields and credential picker.
- `next-intl` / localisation of the ported workflow UI.
- Direct provider HTTP APIs or new API-key storage for the wand / planner.
- Native dependency links on providers whose API has none (the body fallback covers the graph).
- Linux / Windows.

## Decisions / open questions

- **One umbrella phase, not a series** — resolved (user). Ten themes, swarmable after A.
- **Workflow node glow** — resolved (user): matches the global setting, and tracks the node's run
  state whenever no agent is actively working on it.
- **Auto-mate picks the next unblocked card in board order** — resolved (user).
- **Auto-mate concurrency: configurable cap, default 1** — resolved (user).
- **Wand and planner call the agent CLI headless**, not an HTTP API — resolved (user).
- **Plan with AI lives in the Projects toolbar, the create-project dialog and on an existing issue**
  (sub-issues) — resolved (user).
- **React Flow, lazy-loaded** — resolved (user); reverses Phase 43 with bundle numbers as evidence.
- **Drag-to-skill fires behind a 5 s Undo toast** — resolved (user).
- **Sessions are stamped with project / run / forge-account refs at launch** — resolved (user).
- **Settings ▸ Activity is its own page** beside Appearance — resolved (user).
- **Identity badge (agent icon or terminal glyph) wherever the glow shows** — resolved (user).
- **Extra presets** — recommend Ocean, Ember and Mono beyond Brand and Rainbow; open to swap.
- **Auto-mate on failure** — recommend stop, not skip; a "skip failed" toggle could follow.
- **Wand provider when several agents are installed** — recommend the most recently launched agent
  in the repo, overridable in Settings ▸ Agent.
- **Agent node "done" detection** — recommend activity-idle plus an explicit done marker the skill
  prints; activity-idle alone is ambiguous for an agent paused on a question. Decide in Theme J.
- **Kill switch Global scope includes plain shells** — recommend yes, with the count shown before
  confirm; revisit if that proves too sharp.
- **Deleting a project** — recommend the blast-radius confirm listing item count; GitHub project
  deletion is irreversible.
