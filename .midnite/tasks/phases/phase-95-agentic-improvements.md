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

### B — Settings ▸ Activity (M) — ✅ DONE (PR #526, 2026-09-23)

- [x] New `activity` entry in `SETTINGS_PAGE_IDS` / `SETTINGS_PAGES`
      ([`ui-store.ts:218-258`](../../../packages/app/src/store/ui-store.ts)) beside `appearance`,
      with `settings-pages/activity-page.tsx` mapped in
      [`settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx)'s `PAGE_CONTENT`.
- [x] A preset picker (Brand first, then Rainbow, Ocean, Ember, Mono) as swatch buttons.
- [x] Per-status overrides: one row per `ActivityStatus` with a colour/gradient editor and a reset.
- [x] An **agent style** / **shell style** pair (gradient vs metallic, with a "match agent" option
      for shells), plus speed and intensity sliders. **Decision (unattended run):** the style-mode
      picker lives once, in its own "Agent & shell style" section, rather than duplicated inside
      the `agent`/`shell` rows of "Status colours" (those two rows carry a "Style set above" note
      instead) — the doc's bullet reads as one control pair, not three copies of it.
      `shellStyle: 'gradient'` reads the preset's own *raw* agent ring, independent of any
      `agentStyle`/per-status `agent` override, so "Gradient" and "Match agent" stay two
      genuinely different choices once Agent has been customized.
- [x] A live preview strip rendering one sample card, graph node, workflow node and terminal row
      per status, driven by the same `.activity-glow` classes.
- [x] Persist via `appearance-store.ts`'s `'midnite.settings'` store (shared settings storage), not
      `ui-store`, so it lives beside accent and motion. `activity-palette-store.ts` (Theme A's
      in-memory-only store) is what now carries this persistence — its existing consumer
      (`use-activity-palette-sync.ts`) needed no call-site change.
- [x] Tests: page renders every status row; picking a preset rewrites the tokens; reset restores.
      Plus: `resolveActivePalette` composition precedence (override > style mode > preset),
      persisted-store migration from a pre-Theme-B profile, and the shared-key merge-on-write.

### C — The glow everywhere, with who is doing it (M) — ✅ DONE (PR #527, 2026-09-23)

- [x] One hook, `useActivityGlow(target)`, that resolves a target's `ActivityStatus` in one place:
      an agent **actively working** on it → `agent` (or `thinking`); an agent waiting on input →
      `waiting`; a plain shell → `shell`; otherwise the target's own state (card status pill,
      workflow node run state). Replaces `deriveCardGlowState`'s callers.
      [`use-activity-glow.ts`](../../../packages/app/src/features/activity/use-activity-glow.ts) —
      a pure `resolveActivityGlow` plus a thin `useActivityGlow` wrapper; precedence across several
      live sessions on one target is `waiting > agent > thinking > shell`, then the caller's
      `fallbackStatus` (a run-state `ActivityStatus`), then `fallbackColor` (a raw CSS colour —
      see the pill-colour item below).
- [x] Apply to: kanban cards ([`task-card.tsx`](../../../packages/app/src/features/projects/board/task-card.tsx)),
      project graph nodes ([`project-graph-node.tsx`](../../../packages/app/src/features/projects/graph/project-graph-node.tsx)),
      workflow canvas nodes (Theme I's node view), terminal session rows
      ([`terminal-session-list.tsx`](../../../packages/app/src/features/terminal/terminal-session-list.tsx))
      and the Sessions view ([`sessions-view.tsx`](../../../packages/app/src/features/sessions/sessions-view.tsx)).
      **Decision (unattended run):** workflow canvas nodes are **not** wired — Theme I (the node
      view this hook would attach to) has not landed yet; the current canvas is still hand-rolled
      SVG with its own `STATUS_STROKE`, nothing `useActivityGlow` can point at. Theme I's own
      checklist item ("Node glow… follow the global Activity settings") is where that wiring
      belongs once the node view exists. The other four surfaces are wired. **Decision (unattended
      run), kanban cards and graph nodes:** `useActivityGlow` is the new decision layer (both now
      call it instead of an ad hoc `running`/`waiting` read of the terminal store), but the *ring
      paint* stays on the existing, already-baselined `.agent-run-glow`/`is-running|is-waiting|
      is-open` classes rather than switching to `.activity-glow`'s Brand-preset ring — a new
      `cardGlowStateFromActivity` bridge in `glow-state.ts` maps the richer status back onto that
      three-state family. Switching the ring itself is a visual product call (this phase's own
      Theme A note flags it as exactly that) that would re-baseline `kanban-card.spec.ts`'s two
      committed screenshots and rewrite `kanban.spec.ts`'s `is-running` class assertions for a
      colour change alone — left for a dedicated pass with a human looking at the result, not made
      silently here. Terminal rows and the Sessions view have no such legacy ring to preserve, so
      they wear the real `.activity-glow` ring directly, around the row's own leading icon.
- [x] When no session is on a card, its glow matches its **status pill's** colour (`done`, `in
      review`, …) as a static ring; the animated ring is reserved for live work.
      `board-view.tsx` threads each column's `fieldOptionColor(column.color)` into `TaskCard` as
      `statusColor`, which `useActivityGlow` returns as `ringColor` once idle; the card paints it
      as an inline `border-color`, never fighting the animated ring since the two are mutually
      exclusive by construction (`glow === 'idle'` is exactly when there is nothing live). Graph
      nodes keep their own existing closed/ready border-colour language instead — a second,
      independent idle-colour source on the same element would just be two systems arguing over
      one border.
- [x] **Identity badge.** Wherever a glow is showing, a small badge sits on the element's corner:
      the **agent's own icon** via `resolveAgentIcon(liveAgentId ?? agentId)` for agent sessions
      (tracking the live agent, so `claude` typed into a plain shell flips the badge), or a
      **terminal glyph** (`LuSquareTerminal`) for a plain shell. Several sessions on one target
      stack, capped at three with `+N`. Hover names the agent/shell; click reveals the session.
      [`activity-badge.tsx`](../../../packages/app/src/features/activity/activity-badge.tsx)'s
      `ActivityBadgeStack`, on kanban cards' and graph nodes' corners. On terminal session rows and
      the Sessions view, the row's own existing leading icon (`SessionIcon`/`AgentIcon`) already
      *is* this identity mark — Theme C's addition there is the glow ring around it, not a second,
      redundant badge beside it.
- [x] Tests: `useActivityGlow` precedence table (agent-working beats run state beats pill);
      badge renders the right icon per session kind and stacks past three.

### D — Forge issue and project CRUD (L) — ✅ DONE (PR #528, 2026-09-23)

- [x] Extend `ForgeAdapter` with `createIssue`, `editIssue` (title, body, labels, assignees,
      milestone), `deleteIssue`, `createProject`, `editProject`, `deleteProject`, `addProjectItem`
      (existing issue or draft), `removeProjectItem`, `linkIssues({kind: 'blockedBy'|'subIssue'})`
      and `unlinkIssues`. Payload schemas in `shared`.
- [x] Per-operation capability: extend `capabilitiesFor(kind)` with an `ops` record
      (`createIssue`, `deleteIssue`, `createProject`, `linkBlockedBy`, `linkSubIssue`, …) so the UI
      hides what a provider cannot do rather than failing on click.
- [x] GitHub: `gh api` issue create/edit (`gh issue delete` for delete — a real, structured-output-
      free CLI subcommand), `createProjectV2`/`updateProjectV2`/`deleteProjectV2`/
      `addProjectV2ItemById`/`addProjectV2DraftIssue`/`deleteProjectV2Item`, and the GraphQL
      `addBlockedBy`/`addSubIssue` mutations (and their `remove*` inverses, in a new
      [`gh-issue-links.ts`](../../../packages/desktop/src/main/forge/github/gh-issue-links.ts)), in
      [`gh-write.ts`](../../../packages/desktop/src/main/forge/github/gh-write.ts) /
      `gh-project-write.ts`. **Decision (unattended run):** no forge write queue exists in this
      codebase (`git-engine/src/exec/write-queue.ts` is git-only) — every existing forge write
      (`commentPull`, `mergePull`, `setIssueState`, …) is a plain awaited async call with no
      queueing, and these new writes follow that identical, already-established pattern rather
      than inventing a forge-write queue this phase did not otherwise ask for.
- [x] GitLab / Azure DevOps / Bitbucket: issue create/edit/delete implemented against each API
      (GitLab REST issues, Bitbucket Cloud issues, Azure work items via JSON-Patch — `'Issue'` is
      Azure's own best-effort default work-item type, documented as unverified against a live
      organization the same way `azure-writes.ts`'s `reviewPull` already flags its own reviewer-id
      assumption). Project/board CRUD and item add/remove are honest `unsupportedWrite`s for all
      three (`ops` reports `false`) — none had a board-item write to fold onto before this theme,
      and building one is out of this theme's own scope. `linkIssues`/`unlinkIssues` fall back to
      the `Blocked by #N` / `Blocked by owner/name#N` body line for `kind: 'blockedBy'`
      (`body-link-fallback.ts`, shared across the three adapters, idempotent both ways) and report
      `kind: 'subIssue'` as unsupported — a parent/child relation has no body-text grammar
      `resolveForgeGraph` parses.
- [x] Route [`forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts)
      through the adapter registry instead of `GITHUB_COM_FORGE`, and fold `addItemToProject` /
      `clearItemFieldValue` onto the adapter (`addProjectItem`, and a new optional
      `clearItemFieldValue?` adapter method). `list`/`create` resolve the repo's own forge and
      adapter (so a GitLab/Azure/Bitbucket repo's board listing reaches its own provider, not
      always GitHub); `fields`/`items`/`set-field`/`add-item`/`add-draft-item`/`clear-field`/
      `remove-item` stay pinned to GitHub's own adapter — Theme A froze their request shape to
      `{projectId, ...}` with no `repoId` to resolve a different provider's account from at all,
      documented in the handler file's own docblock rather than silently worked around.
- [ ] Delete issue / delete project go through the blast-radius confirm (issue count on the board,
      linked items) — **deferred to Theme E.** Theme D's own scope (see "Files this phase
      touches") is `ForgeAdapter`/main/`shared` only, no renderer; the confirm dialog itself is
      Theme E's `IssueDialog`/`ProjectDialog` work. `deleteIssue`/`deleteProject` are wired and
      tested end-to-end at the adapter/IPC layer, ready for that dialog to call once a human has
      already confirmed.
- [x] Tests: command construction per provider (argv/body snapshots, no network) for every new
      GitHub/GitLab/Bitbucket/Azure write; the extended capability matrix
      (`capabilities.test.ts`); `body-link-fallback.test.ts` proves the `Blocked by` line is
      idempotent in both directions (add, remove, and a same-numbered issue in a different repo
      is never confused with the local one).

### E — Issue and project dialogs, with a magic wand (L) — ✅ DONE (PR #533, 2026-09-24)

- [x] `IssueDialog` (create/edit) and `ProjectDialog` (create/edit) on `Modal`, following
      [`report-issue-dialog.tsx`](../../../packages/app/src/components/report-issue-dialog.tsx);
      entry points: Issues view header, Projects header beside the board select, card detail
      "Edit issue". Fields shown per the provider's `ops` capability.
      [`issue-dialog.tsx`](../../../packages/app/src/features/issues/issue-dialog.tsx),
      [`project-dialog.tsx`](../../../packages/app/src/features/projects/project-dialog.tsx).
      **Decision (unattended run):** labels/assignees are one comma-separated text input each,
      not a picker — a picker needs a new IPC read (the repo's labels/collaborators) this theme
      did not ask for, and a text input matches `gh issue create --label/--assignee`'s own
      grammar exactly. **Delete's blast-radius count** (deferred to this theme by Theme D):
      an issue's is its linked-PR count (`ForgeProjectItemContent.linkedPrs`, the one relation a
      card already carries — not a `blockedBy`/`subIssue` graph walk this dialog has no reason to
      perform just to open); a board's is its own already-fetched item count
      (`useForgeProjectItems`), never re-queried. Two new `BLAST_RADIUS_COPY` entries
      (`issue`, `project`) in `confirm-dialog.tsx`. **Known limitation, shared with every other
      forge write in this app**: the edit/delete channels resolve owner/repo from the *open
      checkout's* `.git/config` server-side, not from the card's own (possibly different) repo —
      a cross-repo project board's card would edit against the wrong repo. Pre-existing across
      the whole forge IPC surface (`commentIssue`, `setIssueState`, …), not introduced here; fixing
      it needs an explicit-owner/repo request shape, well beyond this theme.
- [x] `shared/src/ai-models.ts`: a per-provider fast/cheap model registry (`claude → haiku`,
      `codex → its mini model`, `gemini → flash`, …) with `cheapModelFor(agentId)` and
      `fastModelFor(agentId)`, superseding the Claude-only assumption for these two uses.
      **Decision (unattended run):** coverage is honest, not exhaustive — only providers with a
      documented, stable small model get a row (claude, codex, gemini, `agy`, grok, cursor);
      the rest (`opencode`, `copilot`, `cline`, `aider`, `openclaude`, `kilo`, `goose`) return
      `null` ("run with whatever the CLI already defaults to") rather than a guessed flag pointed
      at a model the account cannot reach. `modelArgsFor` defaults every provider to `--model
      <name>`, verified against Claude/Codex/Cursor's own `--help`; model *names* are a snapshot
      (documented as unverified, the same posture Theme D took for Azure's work-item-type default).
- [x] Main-side `ai:improveField` — builds a short prompt (field name, current text, the other
      fields as context, the repo name), runs the provider's CLI headless with its cheap model and a
      deadline (the `ask.ts` pattern), and returns the rewritten text in an envelope.
      [`main/ai/improve-field.ts`](../../../packages/desktop/src/main/ai/improve-field.ts) reuses
      `companion/ask.ts`'s own `resolveHeadlessAgent` rather than a second roster walk.
- [x] A wand icon button (`react-icons` wand glyph, `LuWandSparkles`) beside each text field:
      click → field goes read-only with the `.activity-glow` agent ring while generating → the
      suggestion replaces the value with a one-step Undo. Esc cancels the call.
      [`wand-field.tsx`](../../../packages/app/src/components/wand-field.tsx). **Decision
      (unattended run):** Esc-cancel is client-side only — there is no IPC channel to kill the
      main-side subprocess mid-flight, and this theme did not ask for one, so Esc marks the
      in-flight request stale (re-enabling the field immediately) while the subprocess keeps
      running to its own 30s deadline in the background and its answer is discarded on arrival.
      Also **`readOnly`, not `disabled`**, while generating — a genuinely `disabled` HTML control
      receives no keyboard events in a real browser, which would make Esc unreachable the moment
      the field needs it.
- [x] Provider choice: the provider of the most recently launched agent in this repo, overridable
      in Settings ▸ Agent. **Decision (unattended run): reuses `ui-store.ts`'s existing
      `primaryAgent`** (already Settings ▸ Agent's overridable default, `agent-page.tsx`) rather
      than introducing new per-repo "most recently launched" session-recency tracking — the doc's
      own note for this line was a `recommend`, not a `resolved`, and `primaryAgent` already *is*
      the user's chosen default agent; a new tracker is unjustified extra state for what the
      wand needs (which agent to ask), especially with nothing else in the app tracking recency
      today.
- [x] Tests: prompt builder (`ai-models.test.ts`, `improve-field.test.ts`); envelope on CLI
      missing / timeout / empty output (`improve-field.test.ts`); dialog fields gated by
      capability (`issue-dialog.test.tsx`, `project-dialog.test.tsx`, `card-detail.test.tsx`'s
      new "Edit issue" describe block); `wand-field.test.tsx` for the Undo/Esc/error-envelope UI.

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

### G — Card and node controls, and drag-to-skill (M) — ✅ DONE (PR #532, 2026-09-24)

- [x] On kanban cards and graph nodes: **Start** (today's Play via `useCardPlay`), **Stop** (ends
      the card's live session through `closeSessionWithConfirm`), and a **`>_` toggle** that shows /
      hides the card's session (terminal panel reveal, or `card-terminal.tsx`'s embedded xterm).
      **Decision (unattended run):** the two surfaces split which mechanism `>_` uses, per the
      checklist's own "or" — `TaskCard` already embeds a `CardTerminal` (Theme E), so its `>_`
      toggles that xterm's visibility, defaulted `true` (no regression from before this theme);
      `ProjectGraphNode` has no embedded terminal at all, so its `>_` calls `revealSession`
      (opens the main dock panel) — exactly what the old single Play/reveal button already did
      there.
- [x] A column → skill map in Settings ▸ Projects, defaulting to **In progress →
      `/midnite-create`** and **In review → `/midnite-review`**, editable per project; unmapped
      columns keep today's status-only drop. **Decision (unattended run):** "editable per
      project" reads off today's *active* project — `selectedRepoId` → `projectBoardByRepo`,
      the identical "no picker here, follows the Projects view" rule this same settings page
      already states for its default-board memory — rather than a new project-picker UI, which
      would need a fresh repo-scoped query this settings page has never had.
- [x] On a drop into a mapped column: move the card (today's optimistic write), then start the
      mapped skill with **only the issue or PR link** as its argument (`composeSkillLaunchPrompt`),
      behind a **5 s toast with Undo** that cancels before the prompt is sent (and reverts the move
      if chosen). Respects an existing live session on the card (reveal, don't double-launch).
- [x] The In review trigger resolves the card's linked PR URL; with no PR, it falls back to the
      issue URL and says so in the toast. **Decision (unattended run):** both the PR-over-issue
      preference (`resolveDragSkillLink`) and the toast's own fallback note are generic — applied
      to any mapped column's drop, not gated on the column being literally named "In review" —
      since a linked PR is simply the more specific, more relevant link whenever one exists, and
      naming which link was actually used is honest information regardless of which column it
      landed in. "In review" (the doc's own example) is the case this matters for most, not the
      only case it fires for.
- [x] Tests: drop → skill mapping; Undo within the window sends nothing; existing session is
      revealed, not duplicated. Split across layers per `docs/TESTING.md`'s own rule: the
      decision logic (`decideColumnSkillAction`, unmapped/mapped/existing-session/draft, the
      "In review" PR-fallback flag) is a pure-function vitest suite in `board-derive.test.ts`;
      the real pointer drag, the real Undo toast and the real 5s timer either cancelling or
      reaching `startAgent` (`autoSend: true`, a trailing `\r`) are Playwright cases in
      `kanban.spec.ts` — pointer drag is a real-browser capability jsdom cannot supply.

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

### I — The workflow editor, at midnite's level (L) — ✅ DONE (PR #TBD, 2026-09-24)

- [x] Adopt `@xyflow/react` and `@dagrejs/dagre`, **loaded only with the Workflows view** (dynamic
      import). This deliberately reverses Phase 43's no-graph-library decision; record the before /
      after entry-chunk and total-JS numbers from `bundle-report.mjs` in the PR.
      **Measured:** entry chunk 427.9 KB → 426.6 KB (unchanged, within build-hash noise); total JS
      36,161.5 KB → 36,398.1 KB (+236.6 KB, all inside the lazy `workflows-view` chunk, 280.8 KB
      gzip 92.4 KB) — neither library reaches the entry chunk, confirmed by `bundle-report.mjs`
      against both a `main` build and this branch's.
- [x] Port midnite's editor shell into `packages/app/src/features/workflows/`: the collapsible,
      searchable **node palette** (drag onto canvas), the right **config panel** swappable with
      **run history** (with step-through replay), floating **panel toggles** with animated widths,
      and the collapsible **bottom run panel** with **Nodes** (input / resolved params / output /
      error) and **Logs** tabs plus markdown export.
      **Decision (unattended run):** `WorkflowNodeRunSchema` never recorded a separate `input`/
      `resolvedParams` (only `output`/`error`) — the Nodes tab surfaces what the schema actually
      has, and the **Logs** tab is a chronological replay synthesised from each node's own
      start/end/status/error, not a second data source the executor never produced
      (`run-output-panel.tsx`'s own doc comment). Step-through replay (`run-replay.ts` +
      `run-replay-controls.tsx`) orders a run's nodes by when each settled and paints the canvas
      "as of step N", play/pause/prev/next/first/last, mounted in the canvas toolbar while viewing
      a picked run.
- [x] Port the **toolbar** behaviour (`workflow-page-header.tsx`): edit details, run history,
      save-as-template, enabled toggle, Run, Save/Saved with autosave, busy spinner; icons mapped to
      `react-icons/lu`. `enabled` is a new optional field on `WorkflowSchema` (`isWorkflowEnabled`
      reads a missing value as on, so no pre-Theme-I workflow's behaviour changes).
- [x] Port the canvas: dot background, zoom/fit controls, pannable minimap, animated edges, and the
      card-style node view (tinted header by category hue, icon chip, one-line summary, status glyph,
      inline error). Category hue tokens (`--node-trigger|action|logic|data|storage`) join the theme
      tokens. **Decision (unattended run):** this MVP's five node kinds have no `trigger`; `note` —
      canvas furniture with no executor — takes the `storage` hue ("a note/comment persisted
      alongside the flow") rather than going untinted, so the category-tint code has no fifth
      "no category" branch to carry. The node's own live-run pulse (`.wf-node-running`) is its own
      small class rather than joining `.activity-glow` (Phase 95 Theme A): Theme C's
      `useActivityGlow` — the family's real workflow-canvas consumer — is in flight concurrently
      per this doc's own dependency note, and wiring a second consumer onto it here would be
      exactly the kind of cross-theme collision the split into themes exists to avoid.
- [x] **Live run state on the editing canvas** — not only the history view. Replace the bare
      `workflowRunChanged` re-fetch with per-node status in the event payload.
      `WorkflowRunChangedEventSchema` (`{workflowId, run}`) replaces the bare ping; every
      `emitChanged` call site in `workflow-engine.ts` already has the just-mutated run in hand, so
      passing it costs nothing. `useLiveWorkflowRun`/`useLiveWorkflowNodeStatuses` read the payload
      directly, so a run's node statuses paint the canvas while editing keeps working — `readOnly`
      still keys only off history-view mode, never off "a run is in flight".
- [x] Existing workflows open unchanged: a migration maps saved SVG-canvas positions onto React Flow
      node positions; `http|transform|condition|delay|note` all render as card nodes.
      **The migration is the identity map, not a coordinate transform:** `WorkflowNode.x`/`.y` were
      always a plain top-left-pixel `{x,y}` (`workflow-layout.ts`'s `toFlowPosition`/
      `fromFlowPosition` doc comment) — the same convention React Flow's own `node.position` uses —
      so a workflow saved before this theme opens with its layout untouched. `autoLayout` (dagre,
      `rankdir: 'LR'`) is the toolbar's own opt-in "Auto layout" action, never run on open or on
      every edit.
- [x] Replace midnite's gateway REST/WebSocket calls with the existing workflow IPC channels.
      (Already true before this theme — the SVG canvas it replaces was IPC-only; nothing here ever
      called a gateway.)
- [x] Tests: position migration (`workflow-layout.test.ts`); palette search/filter
      (`node-palette.test.tsx`); bottom panel tabs render a run (`run-output-panel.test.tsx`); step-
      through replay ordering (`run-replay.test.ts`); the rewritten canvas suite
      (`workflow-canvas.test.tsx`, 14 cases: render, invalid/status/error overlays, read-only mode,
      Run gating, drop-to-add, Auto layout); the toolbar (`workflow-toolbar.test.tsx`, rename,
      enabled gate, save-as-template, Run). e2e (`workflows.spec.ts`) only for **drag-from-palette**
      and **panel-resize** (real pointer + layout, named in the spec header) — the pre-existing
      cases (add/connect/select/delete/undo/duplicate/run-history) were adapted to the new DOM
      (React Flow's own `data-testid`/`data-nodeid`/`data-handlepos` attributes replace the old SVG
      canvas's `data-edge-id`/`data-port`) rather than multiplied; the spec widens its viewport to
      1600×1000 (the five side-by-side panels squeeze the default 1280px canvas too narrow for two
      separated nodes and their connection handles to both stay inside it).

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
