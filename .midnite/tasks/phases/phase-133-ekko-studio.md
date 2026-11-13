# Phase 133 — Ekko Studio: a lightweight studio extracted from this repo

Planned 2026-11-13 in a `/midnite-ideate` session with the user · grounded against the tree as of `b1453fd52`.

Ekko Studio is a smaller desktop studio for day-to-day ekko work, in its own private repo
(`bilo-ekko/ekko-studio`). It has the shell (title bar, side nav, status bar with the system monitor), the terminal, a
lite commit graph, pull requests, tasks, councils, agent graphs, a standalone video editor, notes, the file explorer,
the dashboard, the account switcher and settings. Agents are limited to Claude, Codex and Cursor, with Ollama as a
backend. The title bar carries an **ekko-menu** that runs and installs the `ekko-*` skills. Repo state lives in `.ekko/`.
**Nothing in it may name or trace back to Midnite Studio.**

The code comes from this repo through a **re-runnable extract** rather than a hard fork, so fixes made here can be
pulled again. That only stays cheap if the extract is *copy + rename + a composition file*. So the first and largest
theme happens **here**: Studio's hand-written hubs are changed to build themselves from the composition's feature
list. Studio's own behaviour must not change.

> **Builds on.**
> - **Feature composition.** Each feature has a `manifest.ts`, declared with `defineFeatureManifest`, listing its views,
>   settings pages, channels and MCP tools. [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts)
>   lists `STUDIO_FEATURES`, and a test pins that list against `packages/features/*`. View ids are composed in
>   [`feature-registrations.ts`](../../../packages/shared/src/domain/feature-registrations.ts) (`FEATURE_VIEWS`,
>   `STUDIO_VIEW_ORDER`, `FEATURE_SETTINGS_PAGES`). [`docs/APPS.md`](../../../docs/APPS.md) has the layer rule and the
>   guide to extracting a feature.
> - **The hubs that still list every feature by hand.** These are the extraction cost:
>   - [`app.tsx`](../../../packages/app/src/app.tsx) (2.1k lines; imports 12 feature renderers directly)
>   - [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (4.2k; `SETTINGS_PAGES`, `navVisibility`, `agentSkills`)
>   - [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx) (`VIEW_COMPONENT: Record<ViewId, …>`)
>   - [`settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx) (`PAGE_CONTENT: Record<SettingsPageId, …>`)
>   - the IPC trio [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) /
>     [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) /
>     [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) (~733 `mstudio:` channels)
>   - [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts)
>   - [`desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) (~60 `register*Handlers()` calls)
> - **The MCP installed-set filter.** `listMcpToolIds(manifests, isAppInstalled)` in
>   [`mcp-tool-owners.ts`](../../../packages/shared/src/mcp-tool-owners.ts) and
>   [`installed-apps.ts`](../../../packages/runtime/src/mcp/installed-apps.ts) already hide a tool *and* refuse calls
>   to it.
> - **The midnite menu.** [`title-bar-midnite-menu.tsx`](../../../packages/app/src/features/agent/title-bar-midnite-menu.tsx)
>   over `AGENT_COMMAND_IDS` ([`agent-command.ts`](../../../packages/shared/src/domain/agent-command.ts)) and
>   `DEFAULT_AGENT_SKILLS` ([`agent-commands.ts`](../../../packages/frame/src/agents/agent-commands.ts)). It installs
>   skills at user level through [`user-skills.ts`](../../../packages/desktop/src/main/scaffold/user-skills.ts)
>   (`~/.claude/skills` only, copied from `templates/midnite/`).
> - **Loops.** [`loops.ts`](../../../packages/shared/src/loops.ts) (`DEFAULT_LOOPS`) and the form,
>   [`loop-composer.tsx`](../../../packages/features/loops/renderer/loop-composer.tsx). PR #1129 renames the loops to
>   Plan, Build, Test, Maintain and Deploy; it is **open, not merged**, as of this plan.
> - **The roster.** `BUILTIN_AGENTS` in [`terminal.ts`](../../../packages/shared/src/terminal.ts) (12 agents, with the
>   id as a free string) and the per-agent `case` branches in
>   [`agent-invocation.ts`](../../../packages/shared/src/agent-invocation.ts). Councils hard-code `agy`, `codex` and
>   `opencode` in [`council.ts`](../../../packages/shared/src/council.ts).
> - **Prior art for brand guards.** [`scripts/no-quick-kiss.mjs`](../../../scripts/no-quick-kiss.mjs) fails a release
>   whose built bundle carries a forbidden font. The leak guard in Theme D uses the same shape.

> **Scope guardrails.**
> - **Studio's behaviour does not change** in Themes A–D. Every seam's default composition reproduces today's app,
>   and `moon run :typecheck :lint :test` stays green.
> - **The layer rule holds:** shared ◀ frame ◀ feature ◀ app, and shared ◀ runtime ◀ feature/main ◀ desktop. No seam
>   may make the frame or a feature import the composition.
> - **Who owns what.** The extract owns the packages it copies. ekko-studio owns its own composition, brand,
>   ekko-menu, skills and loop set, and a re-run never touches them.
> - **No traces.** The leak guard runs over ekko-studio's source, its git history (a fresh root commit; no history is
>   carried over) and its built `.app`.
> - **No LFS** in ekko-studio, and no committed binary media.
> - macOS arm64 only. `react-icons` only. IPC ops answer the `GitOpResult` envelope and never throw.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_A lighter studio for ekko work, pulled from this repo rather than forked from it._ Studio has grown into a suite;
day-to-day ekko work needs the shell, the terminal, PRs, tasks and the ekko skills, not media, games or the companion.
This phase first makes Studio's hubs build from the composition, so a different composition yields a different app.
Then a re-runnable script extracts and renames the subset into `bilo-ekko/ekko-studio`, where the ekko brand, the
ekko-menu, the ekko loops and per-feature toggles are added. Planned 2026-11-13.

**Theme A — Composition seams.** ◻ The hubs build from the composition's feature list (views, settings pages, main
handlers, IPC/preload, MCP, dashboard widgets, media tabs, the title-bar menu slot, the loop set), plus a runtime
`enabledFeatures`.

**Theme B — Commit-graph profile.** ◻ A `GraphFeatures` profile turns off effects, diff columns, the column picker
and inline expansion; Studio keeps all of them.

**Theme C — Roster and forge profiles.** ◻ The agent roster and forge adapters are chosen by the composition; councils
take their seats from the roster.

**Theme D — The re-runnable extract.** ◻ `scripts/ekko-extract/` does the copy and the rename and adds the composition
file, then runs a leak guard over the source and the built app.

**Theme E — Repo bootstrap.** ◻ `bilo-ekko/ekko-studio` (private) gets its toolchain, CI, convention files, the `.ekko/`
layout and the no-LFS guard.

**Theme F — The ekko brand.** ◻ Icon, wordmark and palette from the ekko frontend repos.

**Theme G — ekko-menu and the ekko skills.** ◻ A title-bar menu that runs, installs and updates the ekko skills at
user and repo level, plus the hard rename to loop-verb names.

**Theme H — Loops.** ◻ Plan · Build · Review · Feedback · Test · Patrol, each running its `/ekko-*` skill.

**Theme I — Feature toggles and the `ekko` MCP server.** ◻ Settings ▸ Features has a switch per feature, and an MCP
server serves only the included, enabled features.

**Theme J — Verification and the first dmg.** ◻ A clean extract, a green leak guard, smoke tests and a human pass.

## Build order

1. **Wave 1, in parallel: A ∥ B ∥ C ∥ E.** A is the critical path (XL). B and C each touch their own feature's files
   and only add a profile type to `shared`. E is a new repo and shares nothing with this one.
2. **Wave 2: D, then F.** D needs A's seams, plus B's and C's profiles, to emit a composition. F needs E's repo and a
   first extract to brand.
3. **Wave 3, in parallel: G ∥ H ∥ I** (in ekko-studio, over the extracted tree). H's loop names are ⛓ gated on #1129
   merging: if it has not merged, H takes the names from the PR branch and records that in its Headlines paragraph.
4. **J last.**

A partial landing is safe: A–C ship as no-op refactors in Studio, and D can run against any subset of the seams,
with the remaining hubs pruned by a temporary patch named in its README.

## Deliverables

### A — Composition seams (midnite-studio) [XL · 1-2d]

- [ ] **Composition type.** `StudioComposition` in `shared/src/domain/composition.ts` has:
  `features: FeatureId[]`, `views` order, `settingsPages` order, `graph: GraphFeatures` (B),
  `roster: AgentProfile` and `forges: ForgeId[]` (C), `titleBarMenu: 'midnite' | 'none' | string`, `loopSet: LoopDef[]`,
  `dashboardWidgets: WidgetId[]` and `mediaTabs: MediaTab[]`. `apps/studio` exports Studio's composition, which
  equals today's behaviour. [M]
- [ ] **Views.** `VIEW_COMPONENT`, the rail (`RAIL_VIEW_IDS`/`nav-visibility.ts`), icons, labels, palette keywords and
  view commands come from the manifests of the composed features. A view whose feature is absent is not a typecheck
  failure; it is simply not registered. [L]
- [ ] **Settings pages.** `PAGE_CONTENT` and `SETTINGS_PAGES` are built from feature manifests: each feature exports
  its page component and label, the way `optimizerSettingsPages` already does. The core pages (General, Appearance,
  Agent, Accounts, Sidebar, Keybindings) are always present. [L]
- [ ] **Main handlers.** Each feature's main half exports `register(ctx)`. `desktop/src/main/index.ts` iterates the
  composed features instead of calling ~60 `register*Handlers()` by hand. Boot order is preserved and pinned by a
  test. [L]
- [ ] **IPC surface.** `CHANNELS`, the schemas and the bridge are grouped per feature (`channels/<feature>.ts` re-exported
  from the barrel). The preload exposes only the composed features' namespaces. A test asserts that Studio's exposed
  bridge keys are unchanged. [XL]
- [ ] **MCP.** The tool list and the dispatch map come from the composed manifests. The tool-manifest pin file covers
  Studio's composition. [M]
- [ ] **Dashboard widgets and media tabs.** These come from the composition. `MEDIA_TABS` stops being the only source,
  and the tab registry in `compose/media-tabs.tsx` becomes a `Partial<Record<…>>` filtered by composition. Media ▸
  Video can mount as a standalone view (`videos`) on `media-core`, without `MediaShell` tabs. [M]
- [ ] **Title-bar menu slot.** `app.tsx` and `detached-window-frame.tsx` render the composition's menu component (or
  none) instead of importing `TitleBarMidniteMenu`. [S]
- [ ] **Loop set.** The loops feature reads its built-ins from the host's `loopSet` (`LoopsHost`) instead of importing
  `DEFAULT_LOOPS` directly. Studio passes `DEFAULT_LOOPS`. [S]
- [ ] **Runtime toggles.** `enabledFeatures` in persisted prefs, defaulting to every composed feature. A disabled
  feature drops out of the rail, palette and settings; its main ops answer `failure('<Feature> is turned off')`; its MCP
  tools leave the listing through the installed-set filter. No toggle UI in Studio (that is Theme I). [M]
- [ ] **No behaviour change.** Studio's e2e and vitest suites pass unchanged; a new test snapshots Studio's view ids,
  settings page ids, bridge keys and MCP tool ids before and after. [S]

### B — Commit-graph profile (midnite-studio) [M · 2-4h]

- [ ] `GraphFeatures` in `shared`: `{ effects, diffChart, diffColumns, columnPicker, inlineExpansion }`, all `true`
  by default (Studio). [XS]
- [ ] `effects: false` stops every time-based animation in the graph: shimmer, pulse, glow and the live-badge pulse,
  in [`graph-row.tsx`](../../../packages/frame/src/graph/graph-row.tsx),
  [`graph-svg.tsx`](../../../packages/frame/src/graph/graph-svg.tsx),
  [`ref-badge.tsx`](../../../packages/frame/src/graph/ref-badge.tsx),
  [`graph-view.tsx`](../../../packages/frame/src/graph/graph-view.tsx) and
  [`graph-store.ts`](../../../packages/frame/src/graph/graph-store.ts). [S]
- [ ] `diffChart: false` / `diffColumns: false` remove the Diff chart
  ([`diff-chart-cell.tsx`](../../../packages/frame/src/graph/diff-chart-cell.tsx)) and Diff
  ([`diff-stat-cell.tsx`](../../../packages/frame/src/graph/diff-stat-cell.tsx)) columns, and skip fetching their
  numstat. [S]
- [ ] `columnPicker: false` hides [`columns-menu.tsx`](../../../packages/frame/src/graph/columns-menu.tsx) and pins
  `column-visibility.ts` to a fixed set. [XS]
- [ ] `inlineExpansion: false` disables [`inline-expansion.tsx`](../../../packages/frame/src/graph/inline-expansion.tsx):
  a commit selects and opens the inspector, and never expands to its file list in the row. [S]
- [ ] Vitest per flag: with the profile off, the element or column is absent and no animation class is applied. Studio's
  rendering is unchanged. [S]

### C — Roster and forge profiles (midnite-studio) [M · 2-4h]

- [ ] `AgentProfile`: the composition picks a subset of `BUILTIN_AGENTS` by id, plus the allowed backends. Readers of
  `BUILTIN_AGENTS` (agents store, pty env, model detail, workflows node forms, `repo-skills`, conversation, skill
  handoff) read the composed roster instead. [M]
- [ ] Councils take their member providers and default seats from the roster (`COUNCIL_MEMBER_PROVIDERS` is derived,
  not hard-coded). A roster without `agy` or `opencode` still seats a default council. [S]
- [ ] Forge adapter registry: the composition's `forges` picks the adapters. With `['github']`, the GitLab,
  Bitbucket and Azure adapters and `forge-host` (Phase 119) are not imported. The forge settings page and the account
  switcher list only composed providers. [M]
- [ ] Dashboard: the `fin-*` widgets belong to the finance feature's manifest and leave a composition without it. [XS]

### D — The re-runnable extract (midnite-studio) [L · 4-8h]

- [ ] `scripts/ekko-extract/` with `extract.mjs`, `include.json` (the package list), `rename.json` (the rename map) and
  `README.md`. `node scripts/ekko-extract/extract.mjs [--target ~/Dev/ekko-v3/ekko-studio] [--branch extract/<date>]`. [M]
- [ ] **Include set:**
  - core: `shared`, `frame`, `runtime`, `git-engine`, `app`, `desktop`
  - features: terminal, loops, monitor, notes, forge, tasks, councils, workflows, mcp-tools, media-core, media-video
  - the minimal toolchain files: `.prototools`, `moon` config, `pnpm-workspace.yaml`, `eslint.config.mjs`, `tsconfig`
  - Not included: modules, suite apps, launcher, website, `.midnite/`, `templates/midnite`, docs, `.claude`, `.agents`,
    `.codex`. [S]
- [ ] **Rename map**, applied to file contents *and* paths:
  - `@midnite/studio-*` → `@ekko/studio-*`
  - `mstudio:` → `ekko:`, `window.midniteStudio`/`MidniteStudioBridge` → `window.ekkoStudio`/`EkkoStudioBridge`
  - `MSTUDIO_*` → `EKKO_*`, `MIDNITE_*` → `EKKO_*`
  - `midnite-studio://` → `ekko-studio://`, app id → `earth.ekko.studio`, product name → `Ekko Studio`
  - `Midnite Runtime` → `Ekko Runtime`, MCP server name `midnite` → `ekko`
  - `.midnite/` → `.ekko/`, plus the legacy `mgit` names [M]
- [ ] Composition-aware pruning: shared/app/desktop files belonging only to excluded features (e.g. `shared/src/media-*`,
  `ledger`, `markets`, `companion*`, `desktop/src/main/media`, `games`) are dropped through each feature's manifest
  `ownedFiles` globs, not a hand list. [M]
- [ ] Writes onto a fresh branch of the target repo and never touches ekko-studio-owned paths (`apps/ekko-studio/`,
  `packages/ekko-*/`, `skills/`, `.ekko/`, root convention files), which are listed in `include.json` as `preserve`. A
  re-run with no upstream change is an empty diff. [S]
- [ ] **Leak guard** (`scripts/ekko-extract/leak-guard.mjs`, also copied into ekko-studio as `scripts/no-midnite.mjs`):
  - fails on any case-insensitive `midnite`, `mstudio` or `bilo-io/midnite` in the source, the `pnpm-lock.yaml`, the
    git history (`git log -p --all`) and the built `.app` (asar contents + `Info.plist`)
  - the only allowlisted hits are inside `node_modules/@bilo-io/*`, and only if none reach the built bundle [M]
- [ ] Vitest for the rename map (paths and contents, idempotent) and for the leak guard (catches a planted string in
  each of the four places). [S]

### E — Repo bootstrap (ekko-studio) [M · 2-4h]

- [ ] Create `bilo-ekko/ekko-studio`, **private**, with a single root commit; nothing from this repo's history. [XS]
  - Created as **bilo-ekko**, not the active `gh` account: `GH_TOKEN=$(gh auth token -u bilo-ekko) gh repo create
    bilo-ekko/ekko-studio --private`. Every push and `gh` call for ekko-studio passes that token the same way; never
    `gh auth switch`.
  - Local checkout at **`~/Dev/ekko-v3/ekko-studio`**, beside the other ekko repos. It is the extract's default
    `--target`.
  - Commits are authored with the **ekko work identity**, pinned in the clone's local git config, and the same
    `pre-commit` identity guard as here rejects the personal `bilo-io` identity. The global `~/.gitconfig` is
    currently the personal one, so the local pin is required.
- [ ] Toolchain: `.prototools` (node 22.12.0 / pnpm 9.15.0 / moon 2.3.4), `.npmrc` for `@bilo-io` on GitHub Packages
  (`GITHUB_PACKAGES_TOKEN`), and `moon run :typecheck :lint :test`. [S]
- [ ] CI: one `gate` job on `macos-14` (typecheck, lint, test, leak guard) and one `e2e` smoke job. Commit identity and
  a no-trailer `commit-msg` hook, as here. [S]
- [ ] Convention files `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` (kept in sync), describing ekko-studio's own layers, the
  extract's ownership split and the `.ekko/` layout. [S]
- [ ] `.ekko/` layout:
  - `.ekko/settings.json` (the repo-onboarding manifest)
  - `.ekko/video/` (video projects, the old `media/video` root)
  - no tracker or media dirs [XS]
- [ ] No-LFS guard: no `.gitattributes` `filter=lfs`; CI fails on any tracked file over 2 MB or with an audio, video,
  `.glb` or large-image extension under `.ekko/`. `.ekko/video/**/{input,output}` binaries are git-ignored. [S]

### F — The ekko brand (ekko-studio) [M · 2-4h]

- [ ] Collect assets into `packages/ekko-brand/`:
  - `ekko-logo-text.svg` and `ekko-footer-logo.svg` from `~/Dev/ekko-v3/ekko-checkout/app/public/`
  - `ekko-round-logo.png` from `~/Dev/ekko-v3/ekko-web-mono/apps/demo/public/`
  - favicons from `ekko-ui/public/`
  - record each asset's source in the package `README.md` [S]
- [ ] macOS icon (`icon.icns`/`icon.png`) generated from the round logo; the title-bar `BrandMark`/wordmark becomes the
  ekko logo, and the Damion face is removed. [S]
- [ ] Palette from the ekko-ui theme (its tailwind/CSS tokens) mapped onto the app's theme tokens as an `ekko` theme
  (light and dark), set as the default. [M]
- [ ] App logos and splash: the 13 suite logos in `frame/src/shell/app-logos/` are not shipped; the About dialog and
  the lock screen show the ekko mark. [S]

### G — ekko-menu and the ekko skills (both repos) [L · 4-8h]

- [ ] **Hard rename** of the ekko skills, done at the source (`~/.claude/skills`):
  - `ekko-exec` → `ekko-build`, `ekko-pr-review` → `ekko-review`, `ekko-pr-feedback` → `ekko-feedback`
  - `ekko-sitrep` → `ekko-patrol`, and its six views `ekko-sitrep-*` → `ekko-patrol-*`
  - `ekko-plan`, `ekko-test`, `ekko-swarm`, `ekko-pr-audit` and `ekko-urls` keep their names
  - Update every reference: the 17 files under `~/.claude/skills` and `~/.claude/CLAUDE.md` (`check-yourself`,
    `loop-pr-feedback`, `loop-pr-reviews`, `ekko-swarm`, the sitrep views), plus `~/Dev/ekko-v3/claude-dotfiles` if it
    carries copies.
  - Each renamed skill's `description` keeps its old trigger words ("sitrep", "pr-review", "pr-feedback").
- [ ] Bundle the renamed skills into ekko-studio at `skills/ekko/` (the bundle is the source the menu installs from),
  with a `skills.lock.json` of per-skill content hashes. [S]
- [ ] **ekko-menu** in the title bar, through A's menu slot, in `packages/ekko-menu/`:
  - the ekko mark as its button
  - groups: Plan (`/ekko-plan`) · Build (`/ekko-build`, `/ekko-swarm`) · Review (`/ekko-review`, `/ekko-pr-audit`) ·
    Feedback (`/ekko-feedback`) · Test (`/ekko-test`) · Patrol (`/ekko-patrol` + views) · Links (`/ekko-urls`)
  - each entry seeds the primary agent's command line through the existing skill handoff (types, does not press
    Return) [M]
- [ ] **Install / update / uninstall**, from a "Skills" section of the menu and Settings ▸ Skills:
  - **User level:** `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`
  - **Repo level:** `<repo>/.claude/skills`, `.agents/skills`, `.codex/skills`
  - Each skill shows installed / outdated (hash differs) / missing per target.
  - A user-modified skill (hash matches no bundled version) is never overwritten without a confirm showing the diff.
  - Ops return `GitOpResult`; repo-level writes go through the write queue and never commit. [L]
- [ ] Vitest: install into a temp HOME and a temp repo, report outdated after a bundle bump, refuse to clobber a
  local edit without confirm. [S]

### H — Loops (ekko-studio) [M · 2-4h]

- [ ] ekko's `loopSet` (via A) has six loops:
  - Plan → `/ekko-plan`
  - Build → `/ekko-build`
  - Review → `/ekko-review`
  - Feedback → `/ekko-feedback`
  - Test → `/ekko-test`
  - Patrol → `/ekko-patrol`
  - Labels, icons and order follow #1129's naming (Plan/Build/Test…). Review, Feedback and Patrol are named the same
    way. [S]
- [ ] Loop prompts and fallback templates reference `.ekko/` and the ekko skills; no `.midnite` task-tracker text. Run
  records go to `Ekko Runtime/loop-runs/`. [S]
- [ ] The loops form (composer, schedule, autonomy, run history, custom loops) is carried unchanged. `LOOP_MODELS`
  offers the composed roster's models (Claude models; Codex/Cursor/Ollama where the loop's agent supports them). [M]
- [ ] **⛓ #1129 gate.** If #1129 has merged, the extract picks up its loop names and nothing else is needed. If not, H
  copies the names from the PR branch and notes the drift in its Headlines paragraph. [XS]

### I — Feature toggles and the `ekko` MCP server (ekko-studio) [M · 2-4h]

- [ ] Settings ▸ Features: one switch per composed feature (Dashboard, Notes, File Explorer, Timeline, Pull Requests,
  Tasks, Councils, Agent Graphs, Videos, Loops). Terminal, Settings and Account switcher are always on and shown
  locked. [S]
- [ ] Turning a feature off, live:
  - its rail item, palette commands and settings page disappear
  - its MCP tools leave the listing
  - its main ops refuse with `failure('<Feature> is turned off')`
  - its pollers/watchers stop
  - Turning it back on restores all of it without a relaunch. The status bar notes "relaunch to fully unload" only
    where a main module cannot unload. [M]
- [ ] Each feature's own settings page lives under its feature and is gated by the same toggle. [S]
- [ ] `ekko` MCP server (`ekko-studio-mcp` bin and stdio shim):
  - serves `repo/status/graph/diff/branch/ui`, `forge.*` (GitHub) and `workflow_*`, filtered by enabled features
  - `mcp__ekko__*` allow-lists are generated from the same list
  - CLI install (`ekko` / `ekko-studio-mcp`) only replaces a binary that resolves into this app's bundle [M]
- [ ] Vitest: toggling a feature off removes its view id, settings page id and MCP tool ids from the live sets, and a
  call to one of its tools is refused. [S]

### J — Verification and the first dmg (ekko-studio) [M · 2-4h]

- [ ] `extract.mjs` runs clean onto an empty ekko-studio branch; a second run yields an empty diff. [S]
- [ ] Leak guard green on the source, the history and the built `.app`. [XS]
- [ ] `moon run :typecheck :lint :test` green in ekko-studio; the CI gate is green on the first PR. [S]
- [ ] `dist` builds an unsigned macOS arm64 dmg/zip, and it installs and launches. [S]
- [ ] e2e smoke (real browser needed for xterm and layout):
  - boot to the shell
  - open the terminal and run `echo`
  - open the Timeline graph on a fixture repo (no shimmer, no Diff columns, no column picker, no expansion)
  - open Settings ▸ Features and toggle Notes off/on [M]

## Files this phase touches

**midnite-studio (A–D):**
- composition: [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts), new
  `packages/shared/src/domain/composition.ts`,
  [`feature-registrations.ts`](../../../packages/shared/src/domain/feature-registrations.ts)
- hubs: [`app.tsx`](../../../packages/app/src/app.tsx), [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts),
  [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx),
  [`nav-visibility.ts`](../../../packages/app/src/components/nav-visibility.ts),
  [`settings-view.tsx`](../../../packages/app/src/features/settings/settings-view.tsx),
  [`desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts),
  [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts)
- IPC: [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts),
  [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts)
- MCP: [`mcp.ts`](../../../packages/shared/src/mcp.ts), [`mcp-tool-owners.ts`](../../../packages/shared/src/mcp-tool-owners.ts),
  [`dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts),
  [`tool-manifests.ts`](../../../packages/desktop/src/main/mcp/tool-manifests.ts),
  [`mcp-tool-manifests.ts`](../../../packages/app/src/compose/mcp-tool-manifests.ts)
- media: [`media.ts`](../../../packages/shared/src/media.ts), [`media-tabs.tsx`](../../../packages/app/src/compose/media-tabs.tsx),
  [`media-video`](../../../packages/features/media-video), [`media-core`](../../../packages/features/media-core)
- graph: [`packages/frame/src/graph/`](../../../packages/frame/src/graph)
- roster/forge: [`terminal.ts`](../../../packages/shared/src/terminal.ts),
  [`agent-invocation.ts`](../../../packages/shared/src/agent-invocation.ts),
  [`council.ts`](../../../packages/shared/src/council.ts), [`features/forge`](../../../packages/features/forge),
  [`account-switcher.tsx`](../../../packages/app/src/components/account-switcher.tsx),
  [`widget-ids.ts`](../../../packages/app/src/features/dashboard/widget-ids.ts)
- menu/loops: [`title-bar-midnite-menu.tsx`](../../../packages/app/src/features/agent/title-bar-midnite-menu.tsx),
  [`loops.ts`](../../../packages/shared/src/loops.ts), [`features/loops`](../../../packages/features/loops)
- new: `scripts/ekko-extract/` (`extract.mjs`, `include.json`, `rename.json`, `leak-guard.mjs`, tests)

**ekko-studio (E–J):** `apps/ekko-studio/` (composition), `packages/ekko-brand/`, `packages/ekko-menu/`, `skills/ekko/`,
`.ekko/`, `scripts/no-midnite.mjs`, CI workflows, the convention files.

**Outside both repos (G):** `~/.claude/skills/ekko-*` (renamed), `~/.claude/skills/{check-yourself,loop-pr-feedback,loop-pr-reviews}`,
`~/.claude/CLAUDE.md`, `~/Dev/ekko-v3/claude-dotfiles`.

## Verification

- [ ] Studio is unchanged: the composition snapshot test (view ids, settings pages, bridge keys, MCP tool ids) matches
  before and after A–C, and `moon run :typecheck :lint :test` plus CI are green.
- [ ] The extract is re-runnable: a second run with no upstream change is an empty diff, and an upstream fix to a
  shared package (e.g. a terminal fix) arrives in ekko-studio by re-running.
- [ ] The leak guard is green on ekko-studio's source, history and built `.app`, and fails when a `midnite` string is
  planted in each.
- [ ] ekko-studio's rail shows exactly: Dashboard, Notes, Explorer, Timeline, Pull Requests, Tasks, Councils, Graphs,
  Videos, Settings. The title bar has the ekko-menu and the account switcher. The status bar has the system monitor.
- [ ] The Timeline graph shows no shimmer or pulse, no Diff chart or Diff columns, no column picker, and does not
  expand a commit inline.
- [ ] The roster offers only Claude, Codex and Cursor, plus Ollama as a backend; a council seats with no other agent.
- [ ] The ekko-menu installs a skill into a temp HOME and a temp repo (all three agent dirs), shows "outdated" after a
  bundle bump, and refuses to overwrite a local edit without a confirm.
- [ ] All the renamed skills resolve (`/ekko-build`, `/ekko-review`, `/ekko-feedback`, `/ekko-patrol`), and no file under
  `~/.claude` still names `ekko-exec`, `ekko-pr-review`, `ekko-pr-feedback` or `ekko-sitrep`.
- [ ] Each loop (Plan, Build, Review, Feedback, Test, Patrol) launches its skill in a terminal from the loops form.
- [ ] Toggling each feature off removes its rail item, palette commands, settings page and MCP tools live; turning it
  back on restores them.
- [ ] `ekko-studio-mcp` lists only the included, enabled tools to a Claude session.
- [ ] Human pass: install the dmg, open an ekko repo, run `/ekko-review` on a PR from the menu, open a video project in
  `.ekko/video/`.

## Not in this phase

- **Left out:** suite apps, the launcher, the website, `packages/modules/*`, the rest of the media suite (images,
  audio, models, games, maps, terrain, sprites, SFX, animations, docs), the companion and voice, the browser, the
  database explorer, the API client, the optimizer, Vanguard, the vault UI beyond forge credentials.
- **Not in the lite git client:** interactive rebase, the conflict studio, force-push.
- **Forges:** GitLab, Bitbucket, Azure DevOps and the self-hosted forge (`forge-host`).
- **Release:** signing, notarization, the auto-updater feed, an installer script, GitHub Releases.
- **Other platforms:** Linux, Windows.
- **Studio's own LFS and pack-size cleanup:** ~1.0 GB LFS under `.midnite/media/video`, plus multi-MB terrain and map
  blobs in history. This is a separate task.
- **Vendoring `@bilo-io/ui` and `@bilo-io/shell`:** they stay external dependencies.

## Decisions / open questions

1. **Extraction model — resolved:** a re-runnable extract (copy + rename + composition), with the seams built here
   first rather than a patch queue or a hand-pruned fork.
2. **Repo home — resolved:** `bilo-ekko/ekko-studio`, private, created with the bilo-ekko account; local checkout at
   `~/Dev/ekko-v3/ekko-studio`, with commits under the ekko work identity.
3. **Toggles — resolved:** per feature, live where possible. Core (Terminal, Settings, Accounts) is always on.
4. **Graphs — resolved:** Agent Graphs (the workflows feature). The knowledge-graph viewer is not included.
5. **Timeline — resolved:** the commit graph with the lite profile (B), plus changes/stage/commit, diff and stash.
6. **Loop names — resolved:** #1129's naming, extended to Plan · Build · Review · Feedback · Test · Patrol, each
   running its `/ekko-*` skill.
7. **Skill rename — resolved:** a hard rename everywhere, including `~/.claude` and its referencing skills, with no
   aliases. Recommendation: do G's rename in one sitting and grep `~/.claude` for the old names afterwards. A
   half-renamed set breaks `check-yourself` and the PR loops.
8. **Brand — resolved:** use the ekko brand from the ekko-v3 frontend repos (F lists the source files).
9. **Forges — resolved:** GitHub only.
10. **Packaging — resolved:** a local unsigned dmg only.
11. **Rename map — recommended:**
    - `@ekko/studio-*`, `ekko:` channels, `window.ekkoStudio`, `EKKO_*`
    - `ekko-studio://`, `earth.ekko.studio`, `Ekko Runtime`
    - MCP server `ekko`
    - Confirm the app id before E, because it keys the userData dir and the single-instance lock.
12. **IPC regrouping (A) is the riskiest item — recommendation:** land it as its own PR with the bridge-keys snapshot
    test first, so a missed channel fails a test, not the app.
13. **Toggling a main-side feature — recommendation:** refuse its ops while off and keep the module loaded. A true
    unload waits for a relaunch, and the status bar says so.
14. **`@bilo-io/*` in the bundle — open.** If their built output contains "midnite" (a class name, a comment), the leak
    guard fails. Options: fix it upstream in those packages (recommended) or post-process the bundle.
15. **Where the extract runs — recommendation:** by hand from this repo for now (`node scripts/ekko-extract/extract.mjs`).
    A scheduled job that opens a sync PR in ekko-studio comes later.
