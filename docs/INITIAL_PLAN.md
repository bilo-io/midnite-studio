# Midnite Git — GitKraken-inspired desktop git client (new repo at `~/Dev/midnite-git`)

## Context

Bilo wants a brand-new standalone desktop app — **Midnite Git** (`@midnite/studio`) — in `~/Dev/midnite-git`, a separate repo structured like the midnite monorepo (proto + moon + pnpm workspace, `todo/` phase docs), consuming the published **@bilo-io/ui@0.1.0** and **@bilo-io/shell@0.1.0** from GitHub Packages (`bilo-io/midnite-ui`).

Product pillars:

1. **Interactive commit graph** (GitKraken-style): colored branch lanes; drag branch→branch to merge, drag+menu rebase, double-click checkout, right-click create branch/tag, drag commit→branch cherry-pick, right-click reset (soft/mixed/hard).
2. **Worktree view & interaction** (VSCode SCM-style): multi-repo sidebar, worktrees nested under each repo, per-worktree changes, stage/commit, sync (fetch/pull/push).
3. **Toggleable integrated terminal** in a footer bar — button + **Ctrl+`** (all platforms; macOS reserves Cmd+` for window cycling — do not take it).

## Decisions (confirmed with user)

- **Plain Electron + typed IPC.** Main process owns git + node-pty; renderer is a **Vite + React** SPA. No Nest gateway, no HTTP server.
- **Multi-repo sidebar** (not one-repo-per-tab).
- Graph MVP ops: merge (drag), rebase (drag+menu), checkout/create-branch, cherry-pick & reset.
- **Desktop-only**, macOS arm64 primary target.

## Key research findings (verified — these constrain the design)

- **@bilo-io/ui & shell v0.1.0** are live on GH Packages. Consumer `.npmrc` needs `@bilo-io:registry=https://npm.pkg.github.com` + `//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}` — a `read:packages` PAT is required **even for public packages** (CI too). shell@0.1.0 pins ui@0.1.0 — upgrade in lockstep.
- **No Tailwind preset ships** — the app must run its own Tailwind v3 build, import `@bilo-io/ui/styles` + `@bilo-io/shell/appearance.css`, add `./node_modules/@bilo-io/{ui,shell}/dist/**/*.js` to content globs, and hand-copy the token→color map + `darkMode: ['class']` from `~/Dev/midnite-ui/packages/docs/tailwind.config.ts`. Missing a glob silently drops layout classes with a green build.
- **@bilo-io/shell is router-agnostic** (no Next dep): `AppFrame` takes an injected `linkComponent` + `activePath`; **`TitleBar` is built for frameless Electron** via a host-implemented `WindowChromeBridge` contract. `~/Dev/midnite-ui/packages/docs/src/app.tsx` is a working Vite host example. Peers: react ^19, @tanstack/react-query ^5, next-intl ^4 (only used by LocaleProvider — skip it, silence the peer).
- **No viable commit-graph library exists**: @gitgraph/react is archived + wrong-shaped; **mhutchie/vscode-git-graph's license forbids derivatives — never read/copy its source**; GitKraken's components are proprietary. Build a custom pure-TS lane layout (temporal topo order + straight lanes with lane recycling — pvigier's writeup; safe refs: SourceGit (MIT), indigane/git-graph-drawing (Unlicense)), rendered as **SVG-per-row inside @tanstack/react-virtual** (what VS Code's native SCM graph does). DOM rows give free hit-testing/drop targets/a11y.
- **Git backend = shell out to the git CLI via dugite** (GitHub Desktop's layer: bundled deterministic git, execFile, MIT, maintained). nodegit rejected (stable frozen since 2020, Electron ABI churn, no interactive rebase); isomorphic-git rejected (no worktrees — fails on `.git`-as-file — no rebase/cherry-pick, slow log). CLI inherits the user's credential helpers/SSH agent/signing config for free.
- **node-pty in Electron main = single ABI** (Electron's) — one `electron-rebuild`, none of midnite's dual-ABI staging gymnastics. Still need the spawn-helper chmod fixes.
- Reusable midnite patterns (paths under `~/Dev/midnite/packages/`): `desktop/src/main/shell-path.ts` (login-shell PATH fix — Finder launches miss git/homebrew), `desktop/src/main/window-chrome.ts` + `desktop/src/preload/index.ts` (channel constants in one shared module; subscriptions return unsubscribe; typed bridge objects; `additionalArguments` for static flags), `web/components/live-terminal.tsx` (deferred-open-when-sized via ResizeObserver, safeFit, theme swap), `gateway/src/terminal/spawner/pty-spawner.ts` (lazy fail-soft `require('node-pty')`, isPidAlive), packaging scripts (`afterpack.cjs`, `install-local.mjs` — **ditto, never cp -R**).

## Architecture

### Package layout (`~/Dev/midnite-git`)

```
.prototools                # node 22.12.0, pnpm 9.15.0, moon 2.3.4
.npmrc                     # @bilo-io registry + ${GITHUB_PACKAGES_TOKEN}
.moon/{workspace,toolchain,tasks}.yml   # crib midnite; vcs.defaultBranch main; syncProjectReferences false
moon.yml  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.mjs
scripts/fix-node-pty.cjs   # spawn-helper chmod (crib midnite)
todo/                      # _INDEX.md, done.md, outstanding.md, phase-N-*.md
packages/
  shared/       # @midnite/studio-shared — zod-only contract layer (domain types, IPC channels+schemas, bridge type, CommandId/keymap)
  git-engine/   # @midnite/studio-git-engine — pure Node/TS, NO electron imports: dugite exec + write queue, parsers, commands, lane layout, watcher
  app/          # @midnite/studio-app — Vite + React renderer; talks only to window.midniteGit
  desktop/      # @midnite/studio-desktop — Electron main + preload, node-pty, menus, packaging
```

Dependency graph (eslint `no-restricted-imports` boundary rules, midnite-style):
`shared ◀ git-engine ◀ desktop`, `shared ◀ app`, `shared ◀ desktop`. `app` never imports git-engine/electron; `git-engine` never imports electron (stays plain-vitest testable); `shared` depends only on zod.

**Lane layout runs in main** (inside git-engine) — the renderer receives fully laid-out `GraphRow` batches, keeping parsing/layout off the render thread and making `shared` the single wire contract.

### IPC contract (in `shared/src/ipc/`)

- Channel constants prefixed `mgit:` in `channels.ts` (one module imported by main, preload, renderer types): `repo:*` (open/list/close/refs/worktrees/worktree-add/worktree-remove), `log:start|cancel` + `log:batch|done` events, `status:get`, `op:*` (checkout, branch-create, tag-create, merge, rebase, cherry-pick, reset, stage, unstage, discard, commit, fetch, pull, push, abort, continue), `watch:event`, `pty:*` (create/input/resize/kill + data/exit events), `window:*` chrome, `menu:command`.
- **`invoke`/`handle`** for request/response; **`webContents.send`** for streams. Every handler zod-validates its payload; ops return a discriminated envelope (never throw across IPC):

```ts
type GitOpResult =
  | { ok: true }
  | { ok: false; kind: 'conflict'; files: string[]; op: 'merge'|'rebase'|'cherry-pick' }
  | { ok: false; kind: 'error'; message: string; stderr?: string };
```

- **Streaming log**: `invoke('mgit:log:start', {repoId, requestId})` → main runs `git log --all --topo-order -z`, parses + lane-lays incrementally, emits `log:batch {requestId, rows}` (~500 rows/batch) then `log:done`. `requestId` discards stale streams on repo switch. PTY data crosses as `Uint8Array` via structured clone — **no base64** (unlike midnite's WS path).
- Preload builds a typed `window.midniteGit: MidniteGitBridge` (`bridge.ts`), every subscription returning an unsubscribe fn; `frameless` flag via `additionalArguments`; `windowChrome` implements `@bilo-io/shell`'s `WindowChromeBridge`.

### Data model (zod in `shared/src/domain/`)

`RepoDescriptor {id, path, name, headRef, worktrees[]}` · `Worktree {id, repoId, path, branch, headSha, locked, isMain}` · `Ref {name, fullName, kind: localBranch|remoteBranch|tag|head, sha, upstream?{name, ahead, behind}, isHead, worktreePath?}` · `Commit {sha, parents[], authorName/Email, authorDate, committerDate, subject, refs[]}` · `GraphRow {row, commit, lane, laneColor, edges[{fromLane, toLane, type, colorIdx}]}` · `StatusEntry {path, origPath?, staged, unstaged, conflicted}` · `StatusResult {branch{head, upstream?, ahead, behind}, entries[], inProgress: null|merge|rebase|cherry-pick}` · `WatchEvent {repoId, kind: refs|index|worktree|head}`.

Renderer state: **TanStack Query** for main-process data (`['repos']`, `['refs', repoId]`, `['status', repoId]`, `['worktrees', repoId]`) invalidated by watch events; graph rows in a per-repo **Zustand** store (streamed, append-only, too big for Query); `useUiStore` for `selectedRepoId`, `selectedCommitSha`, `terminalOpen`, panel sizes, context-menu state.

### Git exec conventions

Engine uses dugite's bundled git with the user's `HOME` config (identity/signing/credential helpers apply). Env for reads: `LC_ALL=C`, `GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`. All writes through a per-repo serialized queue (index.lock). Parsing always NUL-delimited: log `--pretty=format:%H%x00%P%x00%an%x00%ae%x00%at%x00%ct%x00%D%x00%s%x00 -z`, `status --porcelain=v2 -z --branch`, `for-each-ref --format` (incl. `%(upstream:track)`, `%(worktreepath)`), `worktree list --porcelain`. The exec layer abstracts the git binary so a settings flag can later switch to system git.

## Phases (each = one PR-sized `todo/phase-N-*.md`)

### Phase 0 — Scaffold

Repo skeleton: all root config files above, four packages with `package.json`/`tsconfig.json`/`moon.yml`/`vitest.config.ts`, README, CLAUDE.md, todo/ docs. Add `@bilo-io/ui` + `@bilo-io/shell` to `app` deps **now** to prove GH Packages auth. Pin react/react-dom ^19.
**Verify:** `proto use && pnpm install && moon run :typecheck :lint :test` green; ui/shell resolve from the registry.

### Phase 1 — shared contracts + git-engine exec/parsers

`shared/src/domain/*`, `shared/src/ipc/{channels,schemas,bridge}.ts`; `git-engine/src/exec/{git-exec,write-queue}.ts` (dugite wrapper + env hygiene + per-repo queue); pure parsers `parsers/{log,status,refs,worktree}-parser.ts`; commands `log/status/refs/worktrees`.
**Verify:** parser unit tests vs fixture strings (renames, conflict `u` lines, detached HEAD, decorations); integration tests on temp repos; `scripts/smoke.ts <repo>` prints parsed output for a real repo with worktrees (midnite itself).

### Phase 2 — Lane layout engine

`git-engine/src/layout/{lane-layout,lane-registry,colors}.ts`: single forward pass over `--topo-order` output, straight-branch lanes with lane recycling; `LaneLayoutSession.push(commits): GraphRow[]` for incremental streaming; stable colors = hash of originating branch tip. Interval-tree edge culling deferred (noted in code) until profiling demands.
**Verify:** unit tests — linear, single merge, octopus, criss-cross, orphan branches, no-two-active-lanes-share-an-index; snapshot tests of small synthetic DAGs; ASCII lane rendering in smoke.ts compared against `git log --graph --oneline`.

### Phase 3 — Electron shell boots (AppFrame + TitleBar + theme)

`desktop/src/main/{index,window,window-chrome,shell-path,menu}.ts` (window-chrome + shell-path cribbed from midnite; contextIsolation, `titleBarStyle:'hidden'`, dev loads `http://localhost:5173`, prod loads `app/dist/index.html`); preload with windowChrome bridge; `app/` Vite setup — `base:'./'`, inline `themeInitScript`, tailwind config copied from midnite-ui docs (token map + lib dist globs), `src/app.tsx` mounting ThemeProvider + ShellProviders + AppFrame + TitleBar (model on midnite-ui's docs app). Peers: install `@tanstack/react-query@^5`; `pnpm.peerDependencyRules.ignoreMissing: ["next-intl"]`.
**Verify:** `moon run desktop:start` → frameless window, traffic-light clearance, fullscreen collapse, theme toggle flips tokens. Screenshot.

### Phase 4 — Repo open/list + worktree sidebar

`desktop/src/main/{repo-registry,repo-store}.ts` (repoId→engine map; persisted repo list in userData; `rev-parse --git-dir` validation; worktrees resolve to their main repo); `app/src/features/repos/` panel — VSCode-SCM-style list, worktrees nested (ui Collapse/Accordion), native open dialog, worktree add/remove actions.
**Verify:** open midnite + a worktree; nesting correct; list survives restart. Screenshot.

### Phase 5 — Commit graph, read-only (virtualized SVG)

`desktop/src/main/log-service.ts` (streaming + cancellation); `app/src/features/graph/` — @tanstack/react-virtual list, fixed-height per-row `<svg>` drawing node + edges from `GraphRow`, subject/author/date columns, ref badges joined by sha; commit detail pane stub (`mgit:commit:detail` → `git show --stat`).
**Verify:** stream-reducer unit tests (stale requestId discard); midnite's full history scrolls at 60fps; lane topology visually matches `git log --graph`. Screenshot.

### Phase 6 — Status / stage / commit / sync panel

`git-engine/src/commands/{stage,commit,discard,fetch,pull,push}.ts` (writes through the queue; discard uses explicit paths only; **no force-push anywhere in MVP**); handlers + `app/src/features/status/` — staged/unstaged lists, commit box, **ahead/behind chips + VSCode-style Sync (fetch/pull/push) buttons** relying on the user's credential helpers (`GIT_TERMINAL_PROMPT=0` so auth failures error loudly instead of hanging); unified-diff text stub for file diffs (proper diff viewer → outstanding.md).
**Verify:** integration tests (stage→status→commit→clean; conflict entries parse; push to a local bare remote fixture); manual smoke. Screenshot.

### Phase 7 — Graph interactions: context menus, checkout, branch/tag, reset

Commands `checkout/branch/tag/reset` (+ error mapping: dirty-tree block, branch-checked-out-in-other-worktree); renderer-drawn context menu (token-styled popover, not native `Menu.popup`); commit-row menu (create branch/tag here, checkout detached, cherry-pick onto current, reset soft/mixed/hard submenu) + branch-badge menu (checkout, merge into current, rebase current onto, rename, delete); double-click badge → checkout; `confirm-dialog.tsx` with **blast-radius gating** — hard reset / branch delete show `rev-list --count` of orphaned commits.
**Verify:** per-command integration tests; manual scratch-repo run-through. Screenshot of context menu.

### Phase 8 — Drag-drop ops: merge / rebase / cherry-pick + conflicts

`git-engine/src/commands/{merge,rebase,cherry-pick,sequencer}.ts` — sequencer detects in-progress state (`MERGE_HEAD`, `rebase-merge/`, `CHERRY_PICK_HEAD`), exposes abort/continue; conflicts → `GitOpResult{kind:'conflict'}`. Renderer DnD via **@dnd-kit** (matches midnite's kanban): drag branch badge onto badge → drop-menu "Merge X into Y" / "Rebase X onto Y"; drag commit onto badge → cherry-pick (confirmed). `conflict-banner.tsx` when `status.inProgress` — conflicted files, Abort / Continue (disabled while conflicts remain). Interactive rebase via `GIT_SEQUENCE_EDITOR` → outstanding.md.
**Verify:** integration tests (merge-ff, merge-conflict→abort restores clean, rebase-conflict→continue, cherry-pick); manual conflict flow. Screenshots (drag preview + banner).

### Phase 9 — Integrated terminal + keybinding service

`desktop/src/main/pty-service.ts` (adapt midnite's pty-spawner: lazy fail-soft require, isPidAlive; login shell with shell-path-fixed PATH; cwd = selected worktree); electron-rebuild for node-pty (single ABI) + fix-node-pty chmod; `app/src/features/terminal/` (adapt live-terminal.tsx: deferred-open ResizeObserver, safeFit, theme swap; `use-terminal-ipc` with the same `{connectionState, sendInput, sendResize}` shape); `app/src/services/keybindings/` — CommandId registry, context keys, **allow-list of chords escaping xterm** via `attachCustomKeyEventHandler`; native menu with macOS Edit roles (Cmd+C/V) + View → Toggle Terminal `Ctrl+`` dispatching the same CommandId over `menu:command`; footer bar with toggle button + branch/status indicators.
**Verify:** Ctrl+` toggles with terminal focused and unfocused; in-terminal `git status` matches panel; Cmd+C/V work; shell exit shows exited state. Screenshot.

### Phase 10 — Watcher / live refresh

`git-engine/src/watch/repo-watcher.ts` — fs.watch on `.git/HEAD`, `refs/` (recursive), `index`, `packed-refs`, worktree gitdirs, working tree; classify → `WatchEvent.kind`; 200ms debounce; **suppress-during-own-write** driven by the write queue. `desktop/watch-service.ts` → `watch:event`; `app/src/services/watch-invalidation.ts` maps kinds → Query invalidations + log re-stream.
**Verify:** debounce/classification unit tests; commit from the integrated terminal → graph + status update ~1s; external `git checkout -b` → badges update.

### Phase 11 — Packaging + docs

Crib from midnite desktop: `electron-builder.yml` (arm64 dmg/zip, node-pty asarUnpack), `afterpack.cjs` (chmod spawn-helper, prune dangling symlinks, ad-hoc codesign), `install-local.mjs` (**ditto**), moon `desktop:dist` / `desktop:install-local`; CI workflow with `GITHUB_PACKAGES_TOKEN`; README (PAT setup), finalize todo/. Updater deferred (note the electron-updater **named-import** gotcha in outstanding.md).
**Verify:** build dmg, install, **launch from Finder** (proves shell-path fix), open repo, terminal works (proves packaged node-pty), graph renders.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| react ^19 peer vs app's React | Pin react/react-dom ^19 from Phase 0; check a single react version in `node_modules/.pnpm` at Phase 3. |
| next-intl peer noise | Never import LocaleProvider; `pnpm.peerDependencyRules.ignoreMissing: ["next-intl"]`. |
| GH Packages auth (local + CI) | `.npmrc` env indirection, never a committed token; CI secret; fails loud at install (caught Phase 0). |
| node-pty Electron ABI | Main-process only → single ABI; electron-rebuild task; chmod fixes; lazy fail-soft require degrades to "terminal unavailable", not a crash. |
| git log perf on huge repos | Stream+layout in main, 500-row batches, virtualized SVG rows, initial cap (`-n 50000` + "load more"); interval-tree culling only if profiled. |
| Destructive ops | Serialized write queue; confirm dialogs with blast radius (`rev-list --count`); conflict envelope + always-visible Abort; no force-push in MVP. |
| dugite vs user env drift | Engine = dugite git + user's HOME config; terminal = login shell/system git; exec layer abstracts the binary (settings escape hatch to system git). |
| Watcher storms | Debounce + own-write suppression + narrow kind-based invalidation. |

## Post-MVP (record in `todo/outstanding.md`)

Interactive rebase (`GIT_SEQUENCE_EDITOR` helper), proper diff viewer, stash, force-push with lease + gating, auto-updater, command palette, interval-tree edge culling, submodules.

## Verification (end-to-end)

1. Per-phase: `moon run :typecheck :lint :test` + the phase's manual smoke via `moon run desktop:start` (screenshots for visual phases).
2. Final: `moon run desktop:install-local`, launch from Finder, open midnite (repo with worktrees), scroll full graph, drag-merge two scratch branches, force+resolve a conflict, toggle terminal with Ctrl+`, commit from the terminal and watch the graph update live.

## Reference files to crib from during execution

- `~/Dev/midnite/packages/desktop/src/main/shell-path.ts` — reuse near-verbatim
- `~/Dev/midnite/packages/desktop/src/main/window-chrome.ts` + `src/preload/index.ts` — chrome + preload bridge patterns
- `~/Dev/midnite-ui/packages/docs/tailwind.config.ts` + `src/app.tsx` — token→color map + working Vite AppFrame host
- `~/Dev/midnite/packages/web/components/live-terminal.tsx` + `~/Dev/midnite/packages/gateway/src/terminal/spawner/pty-spawner.ts` — xterm + pty patterns
- `~/Dev/midnite/packages/desktop/{electron-builder.yml,scripts/afterpack.cjs,scripts/install-local.mjs}` — packaging
