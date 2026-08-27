# Phase 21 — A plural agent roster, and a terminal that knows where it is

Phase 15 built the terminal's agent machinery around a roster that has exactly one entry in it.
[`BUILTIN_AGENTS`](../packages/shared/src/terminal.ts) is `[{ id: 'claude', … }]`, and every
consumer quietly assumes that: `SessionIcon` in
[`terminal-session-list.tsx`](../packages/app/src/features/terminal/terminal-session-list.tsx)
hard-codes `<ClaudeIcon>` for *any* agent id, and the `+` menu builds its labels as
`New Agent — ${agent.label}`, a template that only reads well while there is one agent to
disambiguate from. The roster was designed as data on purpose — its own doc comment says
*"adding one is an edit, not a release"* — but the renderer never held up its half of that bargain.

The second half of this phase is a different gap, and the more interesting one. A session's `cwd`
is captured once, at `openSession`, and never revisited; there is no OSC 7 handling anywhere in
the renderer, so `cd` into a sibling worktree and the terminal header goes on naming the directory
you started in. The same is true of *what is running*: `kind` and `agentId` are decided by which
menu item you clicked and then frozen, so `$ codex` typed into a plain shell leaves a row that
still reads as a bare terminal. Both facts are knowable at runtime — one from an escape sequence
the shell already emits, the other from the pty's own process tree — and neither is currently
asked for.

**Builds on.** Phase 9 (the pty service, the xterm panel, `Ctrl+\``), Phase 15 (persisted
shell/agent sessions, the roster and `agents.json`, the session list and its state dot), Phase 17
(per-node context menus in the repos sidebar), Phase 19 (`sessionLabel`, the activity indicator,
the repo-name-then-session-name row shape).

**Scope guardrails.** The roster stays **read-only data** — `agents-store.ts`'s *"The app never
writes this file"* comment holds, and a Settings ▸ Agents page is explicitly out (see
*Not in this phase*). The persisted `cwd` on a `TerminalSession` stays the **opened-at record**;
live cwd is runtime state in the renderer and is never written to `terminals.json`, because a path
the shell wandered into is not a path the user chose to open a session at. Theme E's probe reads
process state and **never acts on it** — no killing, no restarting, no spawning. And per-agent
activity detection is out: [`activity-detect.ts`](../packages/app/src/features/terminal/activity-detect.ts)
stays keyed to Claude Code's own chrome, so the new agents will show the idle caret, and that is a
known, written-down limitation rather than a bug to discover later.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The roster becomes plural (S)

The spine: B–F all read off this contract, so it lands first.

- [ ] `AgentDefinitionSchema` in [`shared/src/terminal.ts`](../packages/shared/src/terminal.ts)
      gains `icon: z.string().min(1).optional()` — a key into the renderer's icon registry, so a
      mark is roster data rather than a switch in a component, exactly as `accent` already is.
      Absent, it defaults to the agent's `id`, which keeps the four builtins from repeating
      themselves.
- [ ] The same schema gains `install: z.string().min(1).optional()` — a one-line hint (`npm i -g
      @gitlawb/openclaude`) shown as the `disabledReason` when Theme C's probe cannot find the
      command.
- [ ] `BUILTIN_AGENTS` grows from one entry to four, all four of them real terminal agents:
      **Claude Code** (`claude`), **Antigravity** (`agy` — the
      [Antigravity CLI](https://antigravity.google/docs/cli/overview), *not* the `antigravity-ide`
      shim, which opens the IDE), **Codex** (`codex`), **OpenClaude** (`openclaude`) — each with its
      brand `accent`, its `icon` key and its `install` hint.
- [ ] `mergeAgents` in [`agents-store.ts`](../packages/desktop/src/main/agents-store.ts) needs no
      logic change, but [`agents-store.test.ts`](../packages/desktop/src/main/agents-store.test.ts)
      does: a case per new field, plus the existing "one typo'd agent must not cost the rest of the
      file" guarantee re-asserted now that an entry carries two more optional fields to typo.
- [ ] `agentIdMatchesKind`'s two invariants are untouched by the new fields, but they now guard
      four ids instead of one — re-assert both directions in a table test over the whole roster, so
      a future entry cannot be added half-wired.

### B — Every agent gets its own mark (M)

- [ ] `codex-icon.tsx` in [`components/icons/`](../packages/app/src/components/icons/), matching
      [`claude-icon.tsx`](../packages/app/src/components/icons/claude-icon.tsx)'s shape exactly:
      `viewBox="0 0 24 24"`, `fill="currentColor"`, `aria-hidden`, the structural `IconComponent`
      type, and a `strokeWidth` prop accepted and ignored.
- [ ] `antigravity-icon.tsx`, same shape.
- [ ] `openclaude-icon.tsx`, same shape — with a doc comment recording its provenance: the project
      publishes a **wordmark only** (`docs/assets/openclaude-wordmark.png`), so this mark is
      derived from its glyph rather than copied from an official square asset. `INITIAL_PLAN.md`
      already establishes that a third-party asset's licence gets written down where the asset
      lands, not assumed.
- [ ] A new `components/icons/index.ts` exporting an `AGENT_ICONS: Record<string, IconComponent>`
      map — the one place an `icon` key resolves. It also resolves react-icons names, so a
      user-added agent in `agents.json` can name `SiGooglegemini` without shipping an SVG.
- [ ] `SessionIcon` resolves the roster's `icon` through that registry instead of hard-coding
      `<ClaudeIcon>`. An unrecognised key falls back to lucide's `Terminal` rather than rendering
      nothing — a bad `agents.json` should cost the user their glyph, not their row.
- [ ] Eyeball each mark at the 14px the session list actually draws it at, in both themes. This is
      the check the spinner rewrite in Phase 19 proves is not optional: geometry that reads fine
      at 24px lost its motion entirely at 14px, and a dense mark will lose its silhouette the
      same way.

### C — The `+` menu says what it starts (M)

- [ ] The menu in [`terminal-panel.tsx`](../packages/app/src/features/terminal/terminal-panel.tsx)
      drops the `New Agent — ` prefix: the items read **New Terminal**, then a separator, then
      **Claude Code**, **Antigravity**, **Codex**, **OpenClaude**. The prefix existed to
      disambiguate one entry from a heading; with four named agents the label *is* the
      disambiguation.
- [ ] `MenuItem` in [`context-menu.tsx`](../packages/app/src/components/context-menu.tsx) gains an
      optional leading `icon`, rendered at the row's left edge with the agent's `accent` applied
      inline (the same reason `SessionIcon` does it inline: a user's accent is a colour Tailwind
      has never seen). `New Terminal` takes lucide's `Terminal`, so the column is never ragged.
- [ ] An install probe in main: one `which`-equivalent resolution per roster command, run once and
      cached, surfaced by extending the existing `agent.list()` result with `installed: boolean`
      and `resolvedPath: string | null` rather than adding a second channel for a fact about the
      same objects.
- [ ] The probe must resolve against the **login shell's** `PATH`, not Electron's. This is the
      trap, not a nicety: `claude` and `agy` both live in `~/.local/bin`, which reaches the
      environment only through the user's shell rc — so a `Midnite Git.app` opened from Finder
      inherits a `PATH` that has neither, and a naive probe would disable two installed agents on
      the machine this phase was written on. Resolve through a login shell (or read the same `PATH`
      the pty is given), and let the roster carry an optional candidate absolute path as the last
      resort.
- [ ] A missing agent's menu item is `disabled` with its `install` hint as the `disabledReason` —
      reusing the mechanism the `+` menu already uses for *"No worktree selected"*, so a session
      that would open and immediately print `command not found` becomes an explanation instead.
- [ ] Unit coverage for the menu builder: four agents present, one uninstalled (OpenClaude is the
      live example — the other three are already on PATH here), none installed, and no worktree
      selected, where every item is disabled for a different reason.

### D — A terminal that knows where it is (M)

- [ ] An OSC 7 handler registered on the xterm instance in
      [`terminal-view.tsx`](../packages/app/src/features/terminal/terminal-view.tsx) via
      `term.parser.registerOscHandler(7, …)`, beside the existing `onTitleChange` subscription and
      disposed with it. Parses `file://<host>/<path>`, percent-decoded, ignoring a payload that is
      not a local absolute path.
- [ ] `liveCwd: Record<string, string>` in
      [`terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts), set from that
      handler and added to the `forget` tuple alongside `autoNames` and `activity` — a session's
      runtime state has to be dropped together or the next session to reuse an id inherits half of
      it.
- [ ] A `resolveRepoForPath` helper: longest-prefix match of a path against the registered repos
      and their worktrees, returning `{ repoId, repoName, root } | null`. Unit-tested for the case
      [`workbench-store.test.ts`](../packages/app/src/store/workbench-store.test.ts) already
      guards elsewhere — two repos whose worktrees sit at nested paths must not collapse into each
      other — plus a path inside no repo at all.
- [ ] The header's mark and repo name derive from the live cwd through that helper, so `cd` into a
      sibling worktree re-labels the header. Nothing writes to `terminals.json`: the persisted
      `cwd` remains the opened-at record.
- [ ] Outside every known repo, the header shows the plain `~`-collapsed path with no emphasised
      segment and the session keeps its stored `repoId` — an unrecognised directory is not evidence
      that the session changed repositories.
- [ ] A shell that never emits OSC 7 (a bare `sh`, or a `zsh` without the hook) must degrade to
      exactly today's behaviour rather than to an empty header.

### E — A terminal that knows what is running in it (M)

- [ ] A probe in main, beside [`pty-service.ts`](../packages/desktop/src/main/pty-service.ts): walk
      the descendants of a pty's pid and match their argv against the roster's commands, returning
      the matched `agentId` or `null`. Reads process state and acts on nothing.
- [ ] A `pty:agent-changed { ptyId, agentId | null }` event on the existing pty event channel —
      emitted only on a *change*, so an idle terminal produces no traffic.
- [ ] `liveAgentId: Record<string, string | null>` in the terminal store, fed by that event through
      [`use-terminal-ipc.ts`](../packages/app/src/features/terminal/use-terminal-ipc.ts) and added
      to the `forget` tuple.
- [ ] `SessionIcon` prefers `liveAgentId` over the stored `agentId` when the two disagree, so
      `$ codex` typed into a plain shell gives that row Codex's mark, and quitting an agent gives
      it the terminal glyph back. The stored `agentId` remains the fallback and the persisted
      truth.
- [ ] The header's mark follows the same live value, so Theme D and Theme E together mean the left
      of the header always names the *current* repo and the *current* agent.
- [ ] The matcher keys on the roster's `command`, so it must survive the forms these four actually
      take: a bare `agy` or `codex`, a `node …/cli.js` wrapper, and a shim script that `exec`s the
      real binary under a different argv[0]. Where a form cannot be matched confidently, return
      `null` — a wrong mark is worse than no mark, which is the same posture
      `activity-detect.ts` arrived at the hard way.
- [ ] Unit-test the argv→`agentId` matcher against captured fixture output rather than a live
      process tree: the fixtures are what make the matcher's `node …/cli.js` and wrapper-script
      cases reviewable, and they keep the test off the machine's actual processes.

### F — The terminal header, rebuilt (S) — ✅ DONE (2026-08-27)

- [x] The literal `<span>Terminal</span>` in the header strip goes; in its place a terminal glyph,
      then the status circle, then the path.
- [x] The status circle is the session list's own `StateDot`, lifted to a shared component rather
      than reimplemented — the pulse is two CSS variables and a keyframe, and two copies of it
      would drift.
- [x] A `collapseHome` helper with unit tests, because the obvious implementation is wrong in a
      specific way: `/Users/bilolwabona` → `~`, `/Users/bilolwabona/Dev` → `~/Dev`, and
      `/Users/bilolwabonaX/Dev` → unchanged, since a prefix match on the home path without a
      boundary check rewrites a *different* user's home.
- [x] The repo/worktree segment renders in `text-foreground font-medium` with its ancestors in
      `text-muted-foreground/60` — the part you navigate by is the part that pops, and the split
      point comes from Theme D's resolver — `resolve-repo-for-path.ts`, landed here because F needs
      it; D feeds it `liveCwd` instead of the stored cwd. *As built, the emphasis covers the
      checkout segment **and everything under it**, not the segment alone: the two-span split is
      also what truncates the row from the left, and a third span for the descendants would give
      the shrink algorithm a second thing to shrink. Outside a known repository the split still
      happens — so a deep path keeps its tail there too — but neither half is emphasised, since
      there is nothing for a bold segment to mean.*
- [x] The path truncates from the **left**, so a deep path keeps its tail. The header is a
      `flex … min-w-0` row sharing a line with four buttons, and the default right-truncation would
      throw away the only informative end.
- [x] The `data-terminal-header` hit-test in [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts)
      still passes across the strip's full width — the one thing that must stay true of this row is
      that nothing is ever painted over it, and that assertion predates this phase.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/terminal.ts`](../packages/shared/src/terminal.ts) (`AgentDefinitionSchema` + `BUILTIN_AGENTS`), [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts) |
| Main | [`agents-store.ts`](../packages/desktop/src/main/agents-store.ts), [`pty-service.ts`](../packages/desktop/src/main/pty-service.ts), [`ipc/pty-handlers.ts`](../packages/desktop/src/main/ipc/pty-handlers.ts), new `agent-probe.ts` (install resolution + process match) |
| Renderer — icons | [`components/icons/claude-icon.tsx`](../packages/app/src/components/icons/claude-icon.tsx), new `codex-icon.tsx`, new `antigravity-icon.tsx`, new `openclaude-icon.tsx`, new `components/icons/index.ts` |
| Renderer — terminal | [`terminal-panel.tsx`](../packages/app/src/features/terminal/terminal-panel.tsx), [`terminal-session-list.tsx`](../packages/app/src/features/terminal/terminal-session-list.tsx), [`terminal-view.tsx`](../packages/app/src/features/terminal/terminal-view.tsx), [`terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts), [`use-terminal-ipc.ts`](../packages/app/src/features/terminal/use-terminal-ipc.ts), new `terminal-header.tsx`, new `collapse-home.ts`, new `resolve-repo-for-path.ts` |
| Renderer — shared | [`components/context-menu.tsx`](../packages/app/src/components/context-menu.tsx) (leading icon on `MenuItem`), [`components/icon-button.tsx`](../packages/app/src/components/icon-button.tsx) (`IconComponent`, unchanged but load-bearing), new shared `state-dot.tsx` |
| Tests | [`agents-store.test.ts`](../packages/desktop/src/main/agents-store.test.ts), [`terminal-store.test.ts`](../packages/app/src/features/terminal/terminal-store.test.ts), [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts), [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts), new `collapse-home.test.ts`, `resolve-repo-for-path.test.ts`, `agent-probe.test.ts` |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: the icon registry lives in `app` and the probe lives in `desktop`, so
      nothing new crosses `shared ◀ git-engine ◀ desktop` / `shared ◀ app`. In particular `app`
      must not learn `node:path` for `collapseHome` — the helper is string work on a home path the
      bridge already supplies.
- [ ] Vitest (Theme A): every new roster field round-trips through `AgentDefinitionSchema`, and a
      malformed entry is dropped individually rather than taking the file with it.
- [x] Vitest (Themes D/F): `collapseHome` on home exactly, a child of home, a non-home path, and
      the `/Users/bilolwabonaX` boundary case; `resolveRepoForPath` on nested worktrees and on a
      path inside no repo. (2026-08-27, with Theme F.)
- [ ] Vitest (Theme E): the argv matcher against fixture process listings — a bare `claude`, a
      `node …/cli.js` form, a wrapper script, and output containing an agent's name as an argument
      rather than as the command.
- [ ] Playwright (Themes B/C/F, `e2e/terminal.spec.ts`): the `+` menu lists five flat labels each
      with a leading glyph; an uninstalled agent is disabled and states why; the header renders a
      glyph, a status circle and a `~`-prefixed path with no literal "Terminal"; the
      `data-terminal-header` hit-test still passes across the full width.
- [ ] Screenshot, per the visual-phase convention: the `+` menu open with all five items, and the
      new header at a narrow panel width where the path is truncating.
- [ ] **Open, for a human:** `cd` between two real worktrees in a live terminal and watch the
      header's repo name and mark change — OSC 7 arrives from the user's actual shell config, which
      a mock bridge cannot emit.
- [ ] **Open, for a human:** start and quit `codex` and `agy` inside an existing shell session and
      watch the sidebar row's icon swap both ways — Theme E's probe reads a real process tree, and a
      fixture proves the matcher but not the wiring.
- [ ] **Open, for a human:** launch the packaged `.app` from Finder (not `moon run desktop:start`)
      and confirm the `+` menu still shows Claude Code and Antigravity as installed — this is the
      one check that catches Theme C resolving `PATH` from Electron's environment instead of the
      shell's.

## Not in this phase

- **Per-agent activity detection.** [`activity-detect.ts`](../packages/app/src/features/terminal/activity-detect.ts)
  stays keyed to Claude Code's spinner frames and frame-end markers, so a Codex or OpenClaude row
  shows the idle caret regardless of what it is doing. Generalising it means observing each agent's
  repaint chrome first-hand, and that file's own doc comments are a record of how expensive it is
  to guess wrong — it deserves its own slice, not a corner of this one.
- **A Settings ▸ Agents page.** Per-agent version, a doctor check, enable/disable, and reordering
  the `+` menu all belong together, and all of them mean writing `agents.json` — which reverses
  `agents-store.ts`'s deliberate read-only stance and has to preserve the user's comments and
  ordering to be worth having. Theme C's install probe is the seed of it.
- **Gemini.** `gemini` is on PATH and `SiGooglegemini` ships in react-icons, so it needs no
  vendored asset — which makes it the ideal worked example for the docs rather than a fifth
  builtin: one `agents.json` entry naming `SiGooglegemini` as its `icon`, proving the registry
  resolves react-icons names as well as local components.
- **Non-macOS process shapes.** Theme E's probe reads a macOS process listing; `INITIAL_PLAN.md`
  is mac-first through packaging, so a Windows/Linux argv path would be untestable speculation
  here. The matcher is pure and takes parsed rows, so a second platform is a new reader, not a
  rewrite.
- **Launcher-mode entries ("Open in Antigravity", "Open in VS Code", …).** Worth doing, and
  deliberately deferred to its own slice. Antigravity turned out to have a real terminal agent —
  `agy` — so nothing in this phase needs the concept, and opening an application in its own window
  is a different feature with a different home: it belongs on the repo/worktree context menus Phase
  17 built, not in the terminal's `+` menu, and it wants no part of the process probe or the
  activity glyph. Logged in [`outstanding.md`](outstanding.md).
- **Acting on the probe.** No kill, no restart, no auto-spawn. The probe exists so the UI can stop
  lying about what is running; a button that stops an agent is a write path and wants its own
  confirm story.

## Decisions / open questions

- **Resolved — Antigravity's terminal agent is `agy`.** The
  [Antigravity CLI](https://antigravity.google/blog/introducing-google-antigravity-cli) installs with
  `curl -fsSL https://antigravity.google/cli/install.sh | bash` and launches as `agy` — a real
  terminal agent, so it is a plain roster entry like the other three. Not to be confused with
  `antigravity-ide`, the VS Code-style shim inside `Antigravity IDE.app` that opens the graphical
  IDE; that path is a launcher, and launchers are deferred (see *Not in this phase*).
- **Resolved — no `mode: 'agent' | 'launcher'` field this phase.** It was in the plan only to carry
  Antigravity; with `agy` in hand there is nothing for it to distinguish, and a contract field with
  one hypothetical user is a field that gets designed wrong. It comes back with the launcher slice
  that needs it.
- **Resolved — "OpenClaude" is [`Gitlawb/openclaude`](https://github.com/Gitlawb/openclaude)**, a
  multi-provider terminal agent installed with `npm i -g @gitlawb/openclaude` and run as
  `openclaude`. Not to be confused with `opencode` (which is a different tool, and the one
  react-icons actually ships a mark for as `SiOpencode`).
- **Resolved — every mark is a local SVG.** Three new components beside `claude-icon.tsx` rather
  than react-icons: `SiClaudecode` and `SiOpencode` exist but nothing covers Antigravity or Codex,
  and a roster where half the marks come from one place and half from another is harder to reason
  about than four files with the same shape. The registry still resolves react-icons names for
  user-added agents.
- **Resolved — the `+` menu knows what is installed**, disabling a missing agent with its `install`
  hint via the existing `disabledReason` mechanism, rather than letting the session open and print
  `command not found`.
- **Resolved — the header path emphasises the repo segment** and dims its ancestors, `~`-collapsed
  and left-truncating. A breadcrumb with chevrons and a monospace chip were both considered; the
  header is a one-line `py-1` strip already carrying four buttons, and neither earned the width.
- **Open — the probe's cadence.** *Recommendation:* event-driven rather than a timer — on pty open
  and exit, on a session becoming active, and once roughly 750ms after output goes quiet. A
  background session's icon can then lag until you look at it, which is the cheap failure; a poll
  across every open pty is a cost paid forever for a fact that changes a handful of times a day.
- **Open — where the OSC 7 emission comes from.** The handler is useless if the user's shell never
  emits the sequence; `zsh` on macOS does not by default. *Recommendation:* handle it if it arrives
  and degrade silently if not (Theme D's last item), and note the one-line `chpwd` hook in the
  Settings ▸ Terminal page rather than editing anyone's rc file from the app.
- **Open — whether `liveAgentId` should override a stored `agentId` in the session *label* too**,
  not just the icon. *Recommendation:* icon only, this phase. `sessionLabel` already resolves four
  ways (`name` → `autoName` → `agentLabel` → `'Terminal'`) and Phase 19's notes show how quickly
  that ordering gets subtle; a fifth input wants its own look.
