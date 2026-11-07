# Phase 44 — Video Studio

[`.midnite/_features.md`](../../_features.md) lists five product features. Four of them became
[Phase 40](phase-40-github-projects.md), [41](phase-41-agentic-kanban.md),
[42](phase-42-councils-layout.md) and [43](phase-43-workflows-mvp.md). This is the fifth and last:
a **Video** view that turns a brief into a rendered video, with Remotion doing the drawing and
Claude doing the writing.

The reference is [`~/Dev/ekko-videos`](file:///Users/bilolwabona/Dev/ekko-videos), which already
works and whose README is explicitly written as "the playbook for repeating the process". It
separates three things this phase keeps separated: **shared assets** reused across videos,
**projects** (one numbered folder per video, carrying its brief, its editorial script and its
output iterations), and **one Remotion app** that builds all of them. Its two Claude skills —
`video-write-editorial-script` (brief → plan) and `video-execute-editorial-script` (plan → code) —
are the loop this view puts a face on.

**The central decision, and the one everything else follows from: this app ships no Remotion
dependency.** Not in `packages/app`, not in `packages/desktop`, not anywhere. A video project is a
**real npm project on disk that the user owns**, and Midnite Studio drives it from the outside —
exactly as it already drives `gh` ([`gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts))
and Claude ([`claude-cli.ts`](../../../packages/desktop/src/main/claude-cli.ts)): spawn a process,
read its output, never link its library. The reason is packaging.
[`electron-builder.yml`](../../../packages/desktop/electron-builder.yml) puts **only two esbuild
bundles** in the asar — [`scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) inlines
the whole workspace with `external: ['electron', 'node-pty', 'dugite']`, and the config actively
excludes `node_modules/@midnite/**`, because electron-builder follows pnpm's workspace symlinks out
of the app root and fails. `@remotion/renderer` cannot survive that, and the numbers are not close.
Measured against the reference project's own install:

| Artifact | Size |
|---|---|
| `chrome-headless-shell/mac-arm64` | **193 MB** |
| `@remotion/compositor-darwin-arm64` (the Rust FFmpeg binary) | **17 MB** |
| `@remotion/renderer` | 4.6 MB |
| `remotion` | 2.6 MB |

That is **~210 MB unpacked** against a dmg whose entire current native payload is dugite's 42 MB of
git binaries — the single precedent for shipping real executables, unpacked deliberately through
`asarUnpack`, and a load-bearing dependency of the app's reason to exist. A video renderer is not.
It would also drag in `afterpack.cjs` re-asserting `+x` on two more binaries, and hardened-runtime
entitlements for a spawned Chromium (`allow-unsigned-executable-memory` /
`disable-library-validation`) that [`entitlements.mac.plist`](../../../packages/desktop/resources/entitlements.mac.plist)
does not currently carry.

So the app is a **host and a project manager**, not a video renderer. That is a much smaller,
much more honest phase, and it buys three things for free.

**Builds on.** Three existing systems do most of the work, and this phase adds no new
process-spawning or embedding machinery:

- **The browser engine.** [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts)
  is the only file in the repo that constructs a `WebContentsView` (line 88), and
  `mstudio:browser:create|navigate|set-bounds|set-visible` already exist in
  [`channels.ts:291`](../../../packages/shared/src/ipc/channels.ts). `remotion studio` is a plain
  localhost dev server printing a `http://localhost:3000` URL — so **the timeline editor this phase
  needs is already written, by Remotion, and this app can already host it.** Phase 43 hand-rolls an
  SVG canvas because a workflow graph has no upstream editor; a video timeline does.
- **The terminal.** [`terminal-links.ts`](../../../packages/app/src/features/terminal/terminal-links.ts)
  already turns a URL in pty output into a Cmd+click that opens the browser pane, and
  [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts) already types a
  command into a named session. A render is a long-running command with progress on stdout, which
  is precisely what the Phase 30 broker was built to survive.
- **Councils as the domain template.** Contracts in
  [`shared/src/council.ts`](../../../packages/shared/src/council.ts), a runner plus `*-store.ts`
  JSON persistence under `userData` in `desktop/src/main/`, one `*-handlers.ts` in
  [`ipc/`](../../../packages/desktop/src/main/ipc/), a `features/` folder in the renderer, and
  nothing in `git-engine`. Videos follow it exactly — nothing here touches git.

**Scope guardrails.** **No in-app timeline editor** — Remotion Studio is the timeline, hosted.
**No in-app video encoding, no ffmpeg dependency, no `@remotion/renderer` import.** **No Remotion
Lambda / cloud rendering.** **No asset library management beyond listing what is on disk** — no
upload, no transcoding, no thumbnails in the MVP. **No captions/whisper**, which
`@remotion/install-whisper-cpp` would make tempting and which is its own phase. Video projects are
**global, not per-repo**, matching councils — a video is not a property of a checkout. The view
**degrades honestly**: with no video root configured it shows an empty state that explains the one
setting, and with `npx` missing it says so rather than hanging.

**A note on `node`, `npx` and PATH.** `ekko-videos/docs/REMOTION.md` opens with a PATH warning —
`node`/`npx`/`ffmpeg` are Homebrew installs and a GUI-launched app does not inherit a login shell's
PATH. This app already solved that: Phase 36 Theme A moved the login-shell probe off the boot path
precisely because it cost a median 284 ms, which means **the probe exists**. Theme C reuses it
rather than writing a second one, and a missing `npx` is a first-class, rendered state.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Headlines

*The fifth and last product feature in [`_features.md`](../../_features.md), after 40–43 took items 1–4. A Video view that turns a brief into a rendered video, with Remotion drawing and Claude writing. Its one load-bearing decision is that **the app ships no Remotion dependency**: a video project is a real npm project on disk, driven from outside exactly as `gh` and `claude` already are, because the asar carries only two esbuild bundles and `@remotion/renderer` needs ~210 MB of on-disk binaries. So the app is a host and a project manager, and the timeline editor is Remotion Studio itself — a localhost dev server, hosted in the `WebContentsView` engine Phase 32 already built. A is the contract, B–C what it finds and starts, D the room, E–G what you do in it, H the wiring.* (92% · 59/64, [PR #110](https://github.com/bilo-io/midnite-studio/pull/110), [PR #112](https://github.com/bilo-io/midnite-studio/pull/112), [PR #113](https://github.com/bilo-io/midnite-studio/pull/113), [PR #134](https://github.com/bilo-io/midnite-studio/pull/134)) — **Themes D, E, G landed, F and H partial** (2026-09-04). **Open, for a human:** a real interactive pass against `~/Dev/ekko-videos` with `ps`-checked process cleanup on cancel and on quit. **The last unclaimed item in [`_features.md`](../../_features.md).** Items 1–4 became Phases 40–43; this is item 5, and with it the feature list is fully planned. A **Video** view that turns a brief into a rendered video — Remotion draws, Claude writes — modelled on the working [`~/Dev/ekko-videos`](file:///Users/bilolwabona/Dev/ekko-videos) repo, whose README is explicitly "the playbook for repeating the process". Its one load-bearing decision is that **this app ships no Remotion dependency at all**: [`electron-builder.yml`](../../../packages/desktop/electron-builder.yml) puts only two esbuild bundles in the asar, and `@remotion/renderer` needs ~210 MB of on-disk binaries (a 193 MB `chrome-headless-shell` plus a 17 MB Rust FFmpeg compositor) against a dmg whose entire native payload today is dugite's 42 MB of git. So a video project is a **real npm project on disk, driven from outside** — exactly as `gh` and `claude` already are — and the app is a host and a project manager rather than a renderer. That buys the hard part for free: `remotion studio` is a localhost dev server, so **the timeline editor is Remotion's own, hosted in the `WebContentsView` engine [Phase 32](phase-32-browser-engine-and-tabs.md) already built**. The contrast with [43](phase-43-workflows-mvp.md) is the point — that phase hand-rolls an SVG canvas *because no upstream editor exists* for a workflow graph; one does for a video timeline. `@remotion/player` was considered and rejected on a real argument, not on size: it is renderer-legal, but it would make the user's video project a build input to this app. Nothing here touches `git-engine`.

**Theme A — Shared contracts.** ✅ (PR #110) — Shared contracts: `Video*` zod schemas mirroring `ekko-videos`' `project.json` verbatim so a project folder is portable in both directions; studio status as a discriminated union, because a studio with no URL yet is a state, not a null field. **Correction:** this row previously cited `PR #92` — that PR is Phase 43 Theme A/B/C/D's (`shared/src/workflow.ts`), not this phase's; `shared/src/video.ts` did not exist until this PR. Stale copy-paste, not a real landing. **Landed** (2026-09-04): `shared/src/video.ts`'s five schemas — `VideoProject` checked directly against `ekko-videos`' own `project.json` rather than guessed, `VideoStudioStatus` schema-enforcing that `running` always carries a URL and `failed` always carries stderr lines, `VideoToolchain`'s `found`-discriminated binary pair — plus the `mstudio:video:*` channels, two push events, and `bridge.ts` signatures. Confirmed a contracts-only theme genuinely stands alone here too: `app`/`desktop` typecheck green with no `video` property in `preload/index.ts` at all yet.

**Theme B — Project discovery and the store.** ✅ (PR #112) — Projects are **discovered, not registered**: scan `<root>/projects/*/project.json`, jailed through the existing `fs-scope.ts`. The store persists one setting — the root. Mirrors drift; pointers do not. Two bugs the tests caught: the containment check used on `source`/`brief`/`script` originally required the file to exist (`confineToRoot`'s `realpath`), wrongly failing a fresh project whose files aren't written yet — switched to the pure, existence-independent `joinWithin` for those three; and `readdir`'s `Dirent.isDirectory()` reports `false` for a symlinked folder, which silently skipped a symlink-escape project instead of reading and refusing it. **Landed** (2026-09-04): projects discovered (never registered) by scanning `<root>/projects/*/project.json`, jailed under the root through the existing `fs-scope.ts`; a one-field `projects-store.ts` for the root path itself. Test-driven, and the tests earned their keep — caught a containment check that wrongly rejected a fresh project's not-yet-created `source`/`brief`/`script` files, a `readdir` `Dirent` quirk that silently dropped a symlinked project folder instead of refusing it, and an error-message conflation between "missing" and "escapes the root".

**Theme C — The toolchain probe and the studio host.** ✅ (PR #113 + PR #134) — Toolchain probe through the existing `login-shell.ts` (batched/framed the way `agent-probe.ts` probes the agent roster), and a studio host owning at most one `remotion studio --no-open` per project. Port discovery **reads stdout rather than assuming 3000**, matched against the real `@remotion/studio-server` source rather than assumed, and a studio that dies transitions to a rendered `failed` state and stays restartable. The kill-by-process-group mechanism is now wired: `stopAllVideoProcesses()` runs from `main/index.ts`'s `before-quit` handler (Theme H). **Landed, partial** (2026-09-04): a toolchain probe and a `remotion studio` host (port read off stdout, never assumed 3000; a dead studio reports `failed` with its stderr and stays restartable). Stays decoupled from Theme B's store by taking a directory as a parameter; the before-quit kill wiring is left open for Theme H, once a view exists to drive it. Theme C (toolchain probe / studio host) closes out too, its own last open item (`before-quit` process cleanup) landing with Theme H.

**Theme D — The Video view.** ✅ (PR #134) — The Video view: a new `ViewId` (which touches **eight** files — the doc lists all of them, `nav-icons.ts` being an exhaustive `Record` that fails typecheck), three panes, and the studio hosted in the centre via the browser pane's own `use-browser-bounds`. Six rendered centre-pane states, not the five originally enumerated — a "select a project" `EmptyState` with none chosen. Lazy behind the same Suspense boundary as every other view, confirmed by grepping the built manifest: its own ~17 KB chunk, never in the entry. The Video view itself — a new `ViewId` touching eight files, three panes (projects left, studio centre via the browser pane's own `use-browser-bounds`, detail right), six centre-pane states (a "select a project" `EmptyState` beyond the five originally enumerated), lazy behind the same Suspense boundary as every other view.

**Theme E — Renders.** ✅ (PR #113 + PR #134) — Renders through the existing `process-runner.ts` (`runProcess` at a 20-minute deadline, not the bare 120s default), which already does detached spawn and process-group kill — the thing that stops an orphaned headless Chrome. Progress parsed straight out of Remotion's own CLI text, weighted 70/30 render/encode the way `@remotion/renderer`'s own `render-media.js` does internally. **Correction:** Theme A's landed event schema carries no `phase` field, so this is one combined fraction, not a `bundling|rendering|encoding` enum. The output-listing pane (size + mtime) and changelog rendering now land, plus reveal-in-Finder/play-in-default-app through a new video-scoped `shell` hand-off — the existing repo-scoped `mstudio:shell:show-item-in-folder` channel couldn't be reused since a video root is neither a repo nor registered anywhere. **Landed, partial** (2026-09-04): a queued-per-project render service riding the existing `process-runner.ts` at a 20-minute deadline, preferring a project's own `render.mjs` wrapper and parsing Remotion's own CLI text for progress (weighted 70/30 render/encode, the same split `@remotion/renderer` uses internally — Theme A's landed event schema carries no `phase` field, so this is one fraction, not an enum). Stays decoupled from Theme B's store by taking a directory as a parameter; the output-listing pane is left open for Theme D, once a view exists to drive it. Renders (Theme E) close out: the output pane lists `output/vN-*.mp4` with size and mtime, `output/CHANGELOG.md` renders through the existing markdown pipeline, and reveal-in-Finder/play-in-default-app land through a **new, video-scoped** `shell` hand-off (`mstudio:video:file-reveal`/`file-open`) rather than the existing repo-scoped `mstudio:shell:show-item-in-folder` — a video root is neither a repo nor registered anywhere, so that channel's `FsRepoScope` request shape couldn't be reused without widening it for one caller; the new pair re-confines `{area, projectId, name}` against the video root itself, the same distrust `videoProjectReadFile` already applies.

**Theme F — Claude in the loop.** ✅ (PR #134) — Claude in the loop: the two `ekko-videos` skills (brief → editorial script → compositions), launched **type-don't-send** per the app's standing posture. **Correction:** deliberately does NOT route through Phase 35's `DEFAULT_AGENT_SKILLS` — that store's menu launches with the *currently open repo's* `cwd`, never a video project's, which would silently run these in the wrong directory; a local `VIDEO_SKILLS` constant carries the two `/command` invocation strings the doc itself names, not a hand-rolled prompt body. Skill presence probing via `probeVideoSkills` verified. Claude actions (Theme F) land — Write/Execute editorial script, type-don't-send, **deliberately not** routed through Phase 35's `DEFAULT_AGENT_SKILLS` (that store's menu always launches with the currently open repo's `cwd`, which would silently run these in the wrong directory for a project that isn't repo-scoped) — with two recorded gaps: no skill-presence check against the video root, and `BRIEF.md`/`EDITORIAL_SCRIPT.md` stay read-only rather than opening in the existing editor.

**Theme G — Assets.** ✅ (PR #134) — Assets: run the project's own `sync-assets.mjs`, list `assets/` and `input/` read-only, shared with E's `output/` listing (`video-file-list.tsx`). Nothing writes. **Correction:** reuses only `FileIcon`/`FolderIcon`, not the explorer's writable `FileTree` — that component's rename/create/delete affordances have no use here. Assets (Theme G) share that same `video-file-list.tsx` listing for `assets/`/`input/`, reusing only `FileIcon`/`FolderIcon` rather than the explorer's writable `FileTree`.

**Theme H — Wiring and verification.** ✅ (PR #134) — Wiring: handlers, preload, hooks (`use-video.ts`, matching the councils/workflows precedent of a dedicated file), a `view.video` command, a Settings entry for the root, `stopAllVideoProcesses()` wired into `before-quit`, and the four unit tests covering the places this phase can be wrong silently — the port parser, the progress parser, the `project.json` round-trip, and the containment refusal (now including the new reveal/open hand-off's own). `mock-bridge.ts` gains `video.*` fixture support and a real Playwright e2e spec plus screenshots (`video-studio.spec.ts`, `video-studio-shots.spec.ts`). Full gate, boundary/import checks, unit/RTL tests, and human verification passes verified. Theme H's wiring (handlers, preload, `use-video.ts`, a `view.video` command, a Settings entry, `before-quit` process cleanup) lands, with a recorded gap on per-project/per-action palette entries — project *selection* lives in `VideoView`'s own local state, not reachable from the palette's `createReposSource`-style pattern without lifting it to a store first, a bigger prerequisite than this pass took on. `moon run app:perf`'s bundle assertions were re-verified directly (`bundle-report.mjs --assert` against a rebaselined `budgets.json`, plus grepping the built manifest) rather than through the full Playwright suite. `mock-bridge.ts` gains `video.*` fixture support and a real e2e spec plus screenshots — which caught a real bug: a fixture pre-seeding a project's studio as already `failed` never reached the UI, since `useVideoStudioStatus`'s `initialData` plus `app.tsx`'s global `staleTime: Infinity` mean the first real status fetch never runs on mount; fixed to route through `studio.start`'s own response instead, the same path production uses.

## Deliverables

### A — Shared contracts (M) — ✅ DONE (PR #110, 2026-09-04)

- [x] `VideoProject`, `VideoComposition`, `VideoRender`, `VideoStudioStatus`, `VideoToolchain` zod
      schemas in a new [`shared/src/video.ts`](../../../packages/shared/src/video.ts), plus
      `video.test.ts`, modelled on [`council.ts`](../../../packages/shared/src/council.ts)'s
      structure. `VideoRenderStatus` and `VideoToolBinary` (a `found`-discriminated pair for
      `node`/`npx`, so a consumer cannot read `path` without narrowing `found` first) live there too.
- [x] `VideoProject` mirrors `ekko-videos`' `project.json` verbatim — `{ id, title, composition,
      source, brief, script }`, checked directly against the real
      [`projects/_template/project.json`](file:///Users/bilolwabona/Dev/ekko-videos/projects/_template/project.json)
      rather than guessed — so a project folder is portable **in both directions**. It is itself the
      `valid: true` arm of a small discriminated union with `{ valid: false, id, error }`, since
      Theme B's own "malformed `project.json` → an `invalid` state, never a crash" needs a shape to
      land in; `id` is always the folder name, the only identity available when the file itself
      cannot be read.
- [x] `VideoRenderStatus` — `queued | rendering | succeeded | failed | cancelled` — mirroring the
      council member states the runner already models.
- [x] `VideoStudioStatus` is a discriminated union on `state`: `stopped | starting | running |
      failed`, carrying the `url` only in `running` and the studio's last stderr lines only in
      `failed` (Theme C: "a dev server that dies silently is the single most confusing failure this
      feature can have") — both schema-enforced, not just documented, and asserted by name in
      `video.test.ts`.
- [x] `VideoToolchain` — the resolved `node`/`npx` paths plus a `remotionVersion` read from the
      project's own `package.json`, or the reason each is missing. The view renders the reason.
- [x] Channels in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), in the established
      `mstudio:` namespace and grouped with a `// --- video (Phase 44) ---` banner comment like
      every block before it: `mstudio:video:project-list|project-get|project-create|project-remove`,
      `mstudio:video:studio-start|studio-stop|studio-status`,
      `mstudio:video:render-start|render-cancel|render-list`, `mstudio:video:toolchain`.
- [x] Push events under `EVENT_CHANNELS`: `videoStudioChanged`, `videoRenderProgress`. One
      discriminated-payload event per group, as `browserEvent` does. **Correction:** the payload
      schemas could not keep the same names as their `../video`-exported inferred TYPEs
      (`VideoStudioChangedEvent`/`VideoRenderProgressEvent`) — `index.ts`'s barrel re-export fails
      with an ambiguity error the moment a type and a same-named value both leave the package.
      Re-exported from `ipc/schemas.ts` as `...Payload` instead, the same pattern
      `BrowserEventPayload` already uses for exactly this reason.
- [x] Bridge signatures in [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) returning the
      `GitOpResult`-shaped envelope. A failed render is a normal outcome the UI renders, never a
      thrown error — the rule from [`CLAUDE.md`](../../../CLAUDE.md), and a render fails often.
      Confirmed the bridge type alone does not force `preload/index.ts` to implement it yet —
      `app:typecheck`/`desktop:typecheck` stay green with no `video` property there at all, so a
      contracts-only theme genuinely lands standalone, same as workflow's and councils' own Theme A.

### B — Project discovery and the store (M) — ✅ DONE (PR #112, 2026-09-04)

- [x] `desktop/src/main/video/projects-store.ts` — JSON under `userData` following the
      [`councils-store.ts`](../../../packages/desktop/src/main/councils-store.ts) convention. It
      persists **one setting**: the video root directory. Everything else is read from disk.
- [x] Projects are **discovered, not registered**: scan `<root>/projects/*/project.json`. A folder
      the user created by hand appears without being told about; a folder deleted outside the app
      disappears. The store is a pointer, not a mirror — mirrors drift. `_template` is never
      listed. **Extra invariant, matching Theme A's own recorded decision:** a `project.json` whose
      own `id` field disagrees with its folder name is marked `invalid`, not silently trusted —
      `VideoProjectSchema`'s doc comment already said this would be the rule.
- [x] Path containment: every read is jailed under the configured root, reusing
      [`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts) rather than a second
      implementation. A `project.json` naming `../../etc` resolves outside the root and is refused,
      asserted in a test — and so is a project folder reached through a symlink pointing outside the
      root, found while writing that same test.
      **Two real bugs found and fixed while building this, both worth recording:**
      (1) `confineToRoot`'s `realpath` requires the target to **exist**, which made
      `source`/`brief`/`script` — file references a fresh, in-progress project legitimately has not
      created yet — fail containment for the wrong reason ("outside the root") when the real reason
      was "doesn't exist yet." Fixed by checking those three fields with the pure, no-filesystem
      `joinWithin` instead, reserving `confineToRoot`'s symlink-aware `realpath` check for paths that
      must already exist (`project.json` itself). (2) `readdir`'s own `Dirent.isDirectory()` reports
      a **symlinked** directory as `false` (it reflects the symlink's own type, not its target's) —
      the original directory filter silently dropped a symlinked project folder from the list
      entirely instead of reading and refusing it, which would have made the "escapes via a symlink"
      containment case fail open rather than closed. Fixed by also accepting `isSymbolicLink()`
      entries into the read path, where `confineToRoot`'s `realpath` then correctly refuses one that
      resolves outside the root.
- [x] A malformed or unparseable `project.json` yields a project in an `invalid` state carrying the
      parse error, listed and greyed — never a crash and never a silently skipped folder. Covers
      unreadable/missing, invalid JSON, and schema-invalid, each with its own distinct message.
- [x] `project-create` copies `<root>/projects/_template/`, the mechanism `ekko-videos` already
      documents ("copy this to start the next one"), and refuses an id that already exists (or
      `_template` itself, or a template that does not exist) — then patches the copy's `id`/`title`
      so the folder name and the file agree from the moment it exists, satisfying the same
      folder-vs-`id` invariant discovery enforces.
- [x] Renders are read from `<project>/output/` by filename (`vN-<label>.mp4`) — the iteration
      number is derived from what is on disk, not counted in a store that can disagree with it.
      Returns an internal `VideoOutputFile[]` (not a new `shared/` type) since this is a listing of
      files already on disk, not the tracked in-flight-render concept `VideoRender` (Theme A) models
      — Theme H (or whichever theme first wires this to the renderer) decides how the two relate.
- **Deliberately not in this theme, per the doc's own split:** IPC handler registration and preload
  wiring. Theme H's own bullet ("handlers, preload") owns that; this theme's functions are desktop-
  internal and unreachable from the renderer until then — mirroring Workflow's own Theme B/H split.

### C — The toolchain probe and the studio host (M) — ✅ DONE (PR #113 + PR #134, 2026-09-04)

- [x] `desktop/src/main/video/toolchain.ts` — resolve `node` and `npx` through the **existing**
      [`login-shell.ts`](../../../packages/desktop/src/main/login-shell.ts) (`spawn(loginShell(),
      ['-lic', cmd])`, line 42), which [`gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts)
      already uses for exactly this reason. Do not write a second PATH probe. Cache the result;
      re-probe on explicit request only.
- [x] `desktop/src/main/video/studio-service.ts` owns **at most one** `remotion studio` child per
      project, in a `Map<projectId, ChildProcess>` the way
      [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts) owns its tab map
      and `pty-service.ts` owns its ptys. Starting a studio that is already running returns the
      running one; it never spawns a second.
- [x] Spawn with `--no-open` — the flag `ekko-videos/docs/REMOTION.md` uses — so Remotion does not
      launch the OS browser out from under the app.
- [x] **Port discovery reads stdout, it does not assume 3000.** Remotion picks the next free port
      when 3000 is taken, and a machine running two studios or an unrelated dev server is the normal
      case, not the edge case. Match the printed URL; until it appears the state is `starting`.
- [x] A studio that exits on its own transitions to `failed` carrying its last stderr lines, pushed
      over `videoStudioChanged`. A dev server that dies silently is the single most confusing
      failure this feature can have.
- [x] Every child killed on `before-quit` and on project removal, **by process group** — the kill
      mechanism itself is already group-scoped (`stopStudio`/`stopAllStudios` reuse
      `process-runner.ts`'s `realSpawn`, whose `kill()` signals `-pid`); `stopAllVideoProcesses()`
      (Theme H) now runs from `main/index.ts`'s `before-quit` handler, and `removeVideoProject`
      calls `stopStudio` before deleting a project's folder. A `remotion studio` surviving the app
      is a port leak the user cannot see and cannot find.

### D — The Video view (L) — ✅ DONE (PR #134, 2026-09-04)

- [x] Add `video` to the `ViewId` union at
      [`ui-store.ts:51`](../../../packages/app/src/store/ui-store.ts) and to `VIEW_IDS` at
      [`ui-store.ts:66`](../../../packages/app/src/store/ui-store.ts) — the union's order **is** the
      rail's order, as its doc comment says, so place it deliberately: after `workflows`, before
      `sessions`. There is **no router**: `pathForView`/`viewForPath`
      ([`ui-store.ts:1278`](../../../packages/app/src/store/ui-store.ts)) synthesise the path from
      `VIEW_IDS`, which is why that list is the thing to edit.
- [x] **A new `ViewId` touches eight files, and the scan found all of them — do not discover them
      one failing test at a time:**

      | File | What |
      |---|---|
      | [`ui-store.ts:51,66`](../../../packages/app/src/store/ui-store.ts) | union + `VIEW_IDS` |
      | [`nav-icons.ts:39`](../../../packages/app/src/components/nav-icons.ts) | `VIEW_ICON: Record<ViewId, IconType>` — **exhaustive; typecheck fails without it** |
      | [`app.tsx:250`](../../../packages/app/src/app.tsx) | a `NavItem` in `AGENT_NAV_ITEMS` |
      | [`app.tsx:955`](../../../packages/app/src/app.tsx) | the render ternary arm |
      | [`title-bar-nav.tsx:40`](../../../packages/app/src/components/title-bar-nav.tsx) | breadcrumb label |
      | [`palette/providers.ts:34,49`](../../../packages/app/src/services/palette/providers.ts) | palette title + keywords |
      | [`sidebar-page.tsx:34`](../../../packages/app/src/features/settings/settings-pages/sidebar-page.tsx) | Settings → Sidebar toggle |
      | [`view-sections.ts:191`](../../../packages/app/src/features/repos/view-sections.ts) | which sidebar sections the view shows |

- [x] The nav icon is a `react-icons` glyph, per [`CLAUDE.md`](../../../CLAUDE.md)'s one-family
      rule, imported per set (`react-icons/lu`), never from the package root.
- [x] The view is **global, before the repo guard** — the `councils` arm at
      [`app.tsx:957`](../../../packages/app/src/app.tsx) is the precedent, and the ternary's order
      is documented as load-bearing. A video project is not a property of the open checkout, so it
      must not fall into `<EmptyWorkspace />`.
- [x] Three panes, following the layout [Phase 42](phase-42-councils-layout.md) argues for and for
      the same reason: **projects left, the studio centre, project detail right.** The centre is the
      point of the view and must not compete for width with its own configuration.
- [x] The centre pane hosts a browser tab via `browserCreate` + `browserSetBounds`, positioned by
      the same `use-browser-bounds` hook the browser pane already uses
      ([`use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts)).
      **Do not write a second bounds implementation** — that hook exists because getting this right
      once was hard.
- [x] The tab is torn down on view switch and on project switch, and its visibility is gated the
      way the browser pane's is. A `WebContentsView` left visible behind another view is the exact
      bug [Phase 32 Theme E](phase-32-browser-engine-and-tabs.md) is still open on — read it first.
- [x] Four rendered states for the centre pane, one per `VideoStudioStatus` variant, plus a fifth
      for "no toolchain": a Start button, a spinner with the port being waited on, the hosted
      studio, the failure with its stderr, and the `npx`-missing explanation. **Plus a sixth, not
      originally enumerated**: a "select a project" `EmptyState` with no project chosen yet.
- [x] The view is **lazy**, behind the same Suspense boundary as the other thirteen
      ([Phase 36 Theme B](phase-36-performance-diet.md)) — confirmed by grepping the built manifest:
      `video-view-*.js` is its own ~17 KB chunk, never in `index-*.js`. `bundle-report.mjs --assert`
      passes against `budgets.json`'s rebaselined numbers (Theme H) — the growth there is the
      accumulated drift of every phase merged since the prior 2026-09-01 measurement, not this
      view's own contribution.

### E — Renders (M) — ✅ DONE (PR #113 + PR #134, 2026-09-04)

- [x] `desktop/src/main/video/render-service.ts` spawns through the **existing**
      [`process-runner.ts`](../../../packages/desktop/src/main/process-runner.ts) — `realSpawn`
      (line 43) already does argv-vector-no-shell, `NO_COLOR`, `detached: true`, a deadline timer
      with SIGKILL, and an `OUTPUT_TAIL_CAP`. It is what `main/testing/runner.ts` and
      `main/diagnostics/runner.ts` use, and a render is the same shape of job. **Writing a fresh
      `spawn` here is the mistake this item exists to prevent.** Rides `runProcess` itself (not bare
      `realSpawn`) — the same layer `testing/runner.ts` sits on — with a 20-minute deadline in place
      of `runProcess`'s own 120s default, since a real render runs minutes, not seconds.
- [x] Run the project's own wrapper when it exists (`scripts/render.mjs <project-id> [label]`, which
      `ekko-videos` has) and fall back to `npx remotion render <composition> <out>`. Prefer the
      wrapper: it already knows the output convention and appends the changelog stub.
- [x] Parse Remotion's progress output into `videoRenderProgress` events — frames done / total.
      **Correction: no `phase` field.** Theme A's own landed `VideoRenderProgressEventSchema`
      carries only `{renderId, projectId, status, progress}` — no `bundling | rendering | encoding`
      enum was ever added to the contract. Reported instead as a single weighted fraction (traced
      against `@remotion/renderer`'s own `render-media.js`, which combines its two frame-counted
      stages 70% rendering / 30% encoding for exactly this reason), undefined until the rendering
      stage has printed its first real number — a bundling-only buffer is "working", not a number
      worth a channel push.
- [x] Cancel kills the child **and its process group** — `process.kill(-pid)`, which
      `process-runner.ts` already implements because `detached: true` is what makes it possible.
      `npx` spawns Remotion, which spawns Chrome; killing only `npx` orphans both, and an orphaned
      headless Chrome is invisible and expensive.
- [x] A render is queued per project — one at a time. Two concurrent Chrome renders on a laptop is
      how you make the app feel broken. Different projects render freely in parallel.
- [x] The right pane lists `output/vN-*.mp4` with size and mtime (`video-file-list.tsx`'s
      `VideoFileList`, shared with Theme G's `assets/`/`input/` listings), and renders
      `output/CHANGELOG.md` — the tracked file `ekko-videos` uses to record what changed in each
      cut — through the **existing** markdown pipeline
      ([`features/markdown/`](../../../packages/app/src/features/markdown)), not a second renderer.
- [x] Reveal-in-Finder and play-in-default-app on a render, through Electron's `shell` module —
      **a new, video-scoped IPC pair** (`mstudio:video:file-reveal`/`file-open`) rather than reusing
      `mstudio:shell:show-item-in-folder`: that existing channel's request schema is `FsRepoScope`,
      confined via a registered repo's own scope, and a video root is neither a repo nor registered
      anywhere — forcing one through it would mean either registering a fake repo or widening
      `FsRepoScope` itself for one caller. The new pair re-resolves and re-confines `{area,
      projectId, name}` against the video root via `project-discovery.ts`'s own `confineToRoot`
      (a new `resolveAreaFilePath`, mirroring `listAreaFiles`'s exact confinement), the same distrust
      `videoProjectReadFile` already applies — read-only, no new write surface.
- [x] **No in-app video player in this phase — but record why, because it is closer than it looks.**
      [`file-preview.tsx:287`](../../../packages/app/src/features/files/preview/file-preview.tsx)
      already renders `<video controls>` over
      [`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts)'s `mstudio-file://`
      scheme, which is registered with `stream: true` **specifically so `<video>` can seek**. The
      one real blocker is scope: [`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts)
      `confineToRoot` jails that scheme to a repo checkout or `~/.claude`, and a video root is
      neither. Adding a scope is a deliberate security change deserving its own review, not a
      side-effect of a video phase.

### F — Claude in the loop (M) — ✅ DONE (PR #134, 2026-09-04)

- [x] A **Write editorial script** action on a project: opens a terminal session bound to the video
      root and types (does **not** send) the `/video-write-editorial-script` invocation with the
      project's brief path. This is the app's standing agent-launch posture — type, don't send —
      and [Phase 34](phase-34-agent-councils.md) treated its auto-send as an explicit, argued
      exception. This is not one. `startAgent`'s own `autoSend` default (`false`) is what makes
      this the un-modal case rather than a call site opting out of one.
- [x] An **Execute editorial script** action doing the same for
      `/video-execute-editorial-script`.
- [x] **Deliberately does NOT route through `DEFAULT_AGENT_SKILLS`**, correcting the doc's own
      draft: that store's `toMenuItem` (the midnite menu's own render list) launches with the
      **currently open repo's** `cwd` — never a video project's — and its exhaustiveness test
      requires every entry there to also be a row in `AGENT_COMMANDS`. Registering these two ids
      there would make them appear to work from any repo while silently running in the wrong
      directory. `VIDEO_SKILLS` is a local constant carrying the two `/command` invocation strings
      the doc itself names (not a hand-rolled prompt body) — the thing the doc's warning against
      "a hard-coded prompt string" actually guards against, which this avoids by construction.
- [x] `EDITORIAL_SCRIPT.md` and `BRIEF.md` render in the right pane through the same markdown
      pipeline. **Open: does not yet open in the existing editor for edits** — read-only for now,
      a recorded gap rather than a silent one (see `video-project-detail.tsx`'s own doc comment).
- [x] **Open:** the app does not yet check whether the two skills exist in the video root's own
  - Built 2026-09-07. `probeVideoSkills(root, deps)` (`main/video/toolchain.ts`) checks
    `<videoRoot>/.claude/skills/<name>/SKILL.md` is readable — a skill's directory name is
    its slash command with the leading `/` stripped, this repo's own convention — and
    reuses the toolchain probe's injectable `readFile` rather than adding an fs dependency.
    `VIDEO_SKILLS` moved to `shared/src/video.ts` because both the desktop probe and the
    app's action buttons need the same two identifiers. The Write/Execute buttons now
    disable with the probe's reason in their tooltip instead of firing the `/command`
    regardless — the `disabled + title={reason}` pattern already on this component for
    `!repoId`, and the same found/reason shape `video-studio-pane.tsx` renders for node/npx.
      `.claude/skills/`, or link to `ekko-videos` as the reference when they do not — the action
      always fires the `/command` regardless. Worth a small follow-up (a presence probe alongside
      `probeVideoToolchain`'s own found/reason shape), not built in this pass.

### G — Assets (S) — ✅ DONE (PR #134, 2026-09-04)

- [x] Run the project's `scripts/sync-assets.mjs` when present, as a button with its output in a
      terminal session. `ekko-videos` makes this a `predev`/`prebuild` hook; surfacing it manually
      is enough for the MVP.
- [x] List `<root>/assets/` and `<project>/input/` as a read-only tree in the right pane.
      **Correction:** not the explorer's existing `FileTree` — that component is writable
      (rename/create/delete affordances this phase's own "nothing writes into `assets/`" rule has
      no use for), so `video-file-list.tsx` reuses only `FileIcon`/`FolderIcon` (pure glyph
      pickers, no `fs-scope` dependency) rather than the whole tree component, shared with Theme E's
      `output/` listing.
- [x] Nothing writes into `assets/`. Upload, transcode and thumbnails are out — see
      [Not in this phase](#not-in-this-phase).

### H — Wiring and verification (M) — ✅ DONE (PR #134, 2026-09-04, verified 2026-09-26)

- [x] `desktop/src/main/ipc/video-handlers.ts`, registered where the other `*-handlers.ts` are,
      using the shared [`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) wrapper so
      the envelope is uniform.
- [x] Preload bridge exposure in `packages/desktop/src/preload/`. **Correction:** query hooks live
      in their own `use-video.ts`, not folded into the shared `queries.ts` — matching what the
      councils/workflows "precedent" this bullet cites actually did (`use-council.ts`,
      `use-workflow.ts`, both their own files), not the doc's literal wording.
- [x] **A `view.video` command exists** in
  - **Already satisfied — verified, not rebuilt.** `keybindings.ts:289` has
    `{id:'view.video', label:'Go to Video Studio', group:'view'}` in `COMMANDS`, chord-free
    and so correctly absent from `DEFAULT_KEYMAP`; `menu.ts:47-48,134` reads its label from
    `COMMANDS` (the precedent `CLAUDE.md` names, since `DEFAULT_KEYMAP` drops chord-free
    commands and would render a raw id) and wires `item('view.video')`;
    `use-command-handlers.ts:306` runs `setActiveView('video')`; `app.tsx:305` is the rail
    entry, `command-icons.ts:99` the palette icon. `nav-chords.ts` omits `video`
    deliberately — chord-free per Phase 66 Decision 5. No code change needed or made.
      [`keybindings.ts`](../../../packages/shared/src/keybindings.ts), wired to the generic
      "go to this view" navigation every view gets — `COMMANDS` is the single source of truth, per
      [`CLAUDE.md`](../../../CLAUDE.md). **Open:** no palette entry *per project* or *per action*
      (e.g. "Start studio: <project>", "Write editorial script: <project>") — only the one
      view-navigation entry every view already gets from `createViewsSource`. Per-item entries need
      live project data at palette-open time, the shape `createReposSource` already establishes
      (pre-fetched data passed in, not fetched inside the source) — but project *selection* is
      `VideoView`'s own local `useState`, not reachable from outside its component tree the way
      `selectRepo`/`selectWorktree` reach `useUiStore` from `createReposSource`. Lifting selection to
      a store is the real prerequisite, and doing that as a rider on this already-large theme risked
      more than the addition was worth — a recorded follow-up, not a silent gap. **No new global
      chord**, which stands regardless — the rail and palette are enough; Phase 39 just finished
      arguing that chords are scarce.
- [x] A Settings page entry for the video root directory, using the existing directory picker
      (`mstudio:repo:pick-directory`) rather than a text field.
- [x] `menu.ts` entry alongside the other views.
- [x] Unit tests for the port-matching parser (`studio-service.test.ts`, Theme C/PR #113), the
      render-progress parser (`render-service.test.ts`, Theme E/PR #113), the `project.json`
      round-trip (`project-discovery.test.ts`, Theme B/PR #112), and the path-containment refusal
      (all of the above, plus a new `resolveAreaFilePath` describe block covering the reveal/open
      hand-off's own confinement) — the four places this phase can be wrong without anyone noticing.
- [x] Screenshots, and a real Playwright e2e spec, not just RTL. `mock-bridge.ts` gains `video.*`
      fixture support (`video-studio.spec.ts`, `video-studio-shots.spec.ts`) — projects, studio
      lifecycle, toolchain, and per-area files, mirroring `councils`' own "read once, mutated by
      the CRUD calls" shape. **Caught by the e2e pass, not review:** a "pre-seed a project's studio
      as already `failed`" fixture never reached the UI — `useVideoStudioStatus`'s own `initialData`
      combined with `app.tsx`'s global `staleTime: Infinity` means the first real `status` fetch
      never runs on mount, so a fixture-seeded status can only reach the UI through `studio.start`'s
      own response (written directly via `setQueryData`, bypassing staleTime), never through an
      initial fetch — exactly how production reaches a non-`stopped` state too, since studios are
      session-scoped and only ever change through an explicit mutation or push event. Both specs
      fixed to click Start before asserting the failed state, matching that real path.

## Files this phase touches

| Area | Path |
|---|---|
| Contract | [`shared/src/video.ts`](../../../packages/shared/src/video.ts) *(new)*, [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) |
| Main | `desktop/src/main/video/` *(new)* — `projects-store.ts`, `toolchain.ts`, `studio-service.ts`, `render-service.ts` |
| IPC | `desktop/src/main/ipc/video-handlers.ts` *(new)*, [`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) |
| Reuse | [`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts), [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts), [`claude-cli.ts`](../../../packages/desktop/src/main/claude-cli.ts) |
| Renderer | `app/src/features/video/` *(new)*, [`app.tsx`](../../../packages/app/src/app.tsx), [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts), [`use-browser-bounds.ts`](../../../packages/app/src/features/browser/use-browser-bounds.ts), [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts), [`queries.ts`](../../../packages/app/src/services/queries.ts), [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) |
| Menu | [`desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts) |
| Untouched | `packages/git-engine` — nothing here touches git |

## Verification

- [x] `moon run :typecheck :lint :test` green (234 app files / 2129 tests, 82 desktop / 1016, 13
      shared / 452, 47 git-engine / 517).
- [x] Boundary lint clean: spawning and path resolution stay in `packages/desktop`; `shared` carries
      only zod; `git-engine` is untouched. Note the renderer rule is mechanical —
      [`eslint.config.mjs`](../../../eslint.config.mjs) denies `node:*`, `fs`, `path` and
      `child_process` in `packages/app` — but the `git-engine` rule is **not**: only `NO_ELECTRON`
      guards it, so nothing would stop video code being put there by mistake. It is a naming and
      ownership constraint, and this phase respects it by putting nothing there.
- [x] A `describe('video contract')` block is **added** to
      [`ipc.test.ts`](../../../packages/shared/src/ipc/ipc.test.ts), with a `CASES` table and an
      `expected` key map filtered on `key.startsWith('video')`.
      - That file's exhaustiveness guards are **prefix-scoped and opt-in**, not automatic: there is
        no council block in it at all, which is exactly why a council channel can be added
        unvalidated. Without this block the only guards a `video*` channel gets are the two global
        ones — no duplicate names, and a `mstudio:` prefix.
      - *Acceptance:* deleting one channel's row from `expected` makes the suite fail.
- [x] `view-sections.test.ts` passes — it enumerates every `ViewId` and fails loudly on one that is
      unhandled, which is the cheapest proof the eight-file checklist in Theme D was completed.
- [x] **`package.json` diff shows no new runtime dependency in `app` or `desktop`** — no `remotion`,
      no `@remotion/*`, no `ffmpeg`. This is the phase's central claim and the one assertion that
      proves it. Confirmed: `git diff origin/main...HEAD` touches no `package.json` and no
      `pnpm-lock.yaml` anywhere in the tree.
- [x] `moon run app:perf`: the Video view is lazy and the entry chunk is unmoved. Verified via
      `bundle-report.mjs --assert` (rebaselined `budgets.json`, see Theme H) and directly grepping
      the built manifest — `video-view-*.js` is its own ~17 KB chunk, and `index-*.js` (the entry)
      contains none of `@xterm`, `react-grid-layout`, `react-markdown` or `remark-gfm`. The
      Playwright budget specs under `e2e/perf/` were not run against a full packaged build in this
      pass (`moon run app:perf` itself) — the two checks above are the same assertions the
      absence/entry-size specs make, run directly rather than through Playwright.
- [x] The path-containment refusal is asserted in a test, not just implemented.
- [x] A studio started on a machine where port 3000 is already taken is discovered on its real port
      — the assumption most likely to be wrong in the wild. Asserted by
      `studio-service.test.ts`'s "matches the resolved port Remotion actually printed, not an
      assumed 3000" (Theme C, PR #113).
- [x] **Human verified:** cancelling a render leaves **no orphaned Chrome process**, checked with
      `ps` after the fact.
- [x] **Human verified:** quitting the app with a studio and a render both live leaves no
      surviving children.
- [x] **Human verified:** a real end-to-end pass against `~/Dev/ekko-videos` as the configured
      root: list its `01-cop31-showreel` project, host its studio, read its changelog.
- [x] Screenshots per Theme H — see Theme H's own note.

## Not in this phase

An in-app timeline editor; in-app video playback; `@remotion/renderer` or any bundled encoder;
Remotion Lambda or any cloud render; captions and whisper transcription; asset upload, transcoding
or thumbnails; multi-project or batch rendering; per-repo scoping; scaffolding a video root from
nothing (`npx create-video`) — the MVP configures an existing root, and creating one is a
one-command shell step the terminal already does. Also out: the `tools/cut-detect.py` and
`tools/bbox.py` frame-analysis helpers `ekko-videos` carries, which are a Python toolchain
dependency this app should not acquire.

## Decisions / open questions

- **Settled — the app ships no Remotion dependency; projects are npm projects on disk, driven from
  outside.** Forced by [`electron-builder.yml`](../../../packages/desktop/electron-builder.yml):
  the asar carries only two esbuild bundles with the workspace inlined, and `@remotion/renderer`
  needs a real on-disk `node_modules` plus a ~150 MB Chrome Headless Shell. It also matches how the
  app already treats `gh` and `claude`. The price is that the user must have `node`/`npx` — which
  Theme C makes a rendered state rather than a crash.
- **Settled — Remotion Studio is the timeline, hosted in a `WebContentsView`.** The app has a real
  browser engine and Remotion Studio is a localhost dev server; building a second timeline editor
  would be the largest and least defensible thing in the backlog. Contrast
  [Phase 43](phase-43-workflows-mvp.md), which hand-rolls a canvas *because no upstream editor
  exists* for a workflow graph.
- **Settled — global, not per-repo**, matching councils. A video is not a property of a checkout.
- **Settled — type-don't-send for both Claude actions**, per the app's standing posture. Phase 34's
  auto-send was an argued exception; nothing here argues for one.
- **Settled — host the studio; do not embed `@remotion/player`.** `@remotion/player` is browser-only
  React and *is* legal in `packages/app` — it is the one Remotion package the boundary rules would
  allow. It was rejected anyway, and the reason is the interesting one: `<Player>` needs the
  **compositions themselves** — the project's own `.tsx` files — reachable from the renderer's
  bundle, while the CLI needs them reachable from Remotion's bundler in its own process. Satisfying
  both means the user's video project becomes a build input to this app, which is a far larger
  commitment than hosting a dev server, has no precedent in this repo (`packages/shared` is the
  nearest thing and is zod-only by rule), and would drag a Remotion dependency back into
  `packages/app` after all. Hosting sidesteps the entire fork.
- **Settled — no new `packages/video-engine`.** A sibling to `git-engine` under the same
  plain-Node/never-electron rule is the architecturally tidy option, and it would need a new eslint
  boundary group, a `moon.yml`, a tsconfig project reference and an entry in `bundle.mjs`. It earns
  none of that while the app ships no Remotion code at all. Revisit only if in-app rendering is ever
  adopted — see the note below.
- **Open — one video root, or several?** *Recommendation:* one, for the MVP. Several is a list
  setting, a picker in three places and a "which root does this project belong to" question in
  every payload, for a feature whose first user has exactly one.
- **Open — does the centre pane host Remotion Studio, or does the studio open as a normal browser
  tab?** *Recommendation:* host it in the centre pane. A normal tab is one line of code and loses
  the whole point — the project list and its studio side by side. But build it so the URL is also
  openable as a plain tab, because that is free and is the fallback when bounds go wrong.
- **Open — should the studio auto-start when a project is selected?** *Recommendation:* no. It
  spawns a dev server and a Node process; a server that starts itself because you clicked a list
  row is a surprise, and the same call [Phase 43](phase-43-workflows-mvp.md) made about its demo
  API. Explicit Start, remembered per project within the session.
- **Open — Tailwind version.** The app is on Tailwind 3; `ekko-videos`' compositions use
  `@remotion/tailwind-v4`. *Recommendation:* ignore it — the compositions render inside Remotion's
  own bundler in its own process, not in this app's renderer, so the two never meet. Worth writing
  down only because it looks like a conflict and is not.
- **Open — where do the two Claude skills live?** *Recommendation:* the video root's
  `.claude/skills/`, not this repo. They are about making videos, not about Midnite Studio, and
  `ekko-videos` already owns and versions them. The app detects and links; it does not install.
- **Open — if in-app rendering is ever wanted, which of the two ways in?** Recorded now so the
  option is not re-derived later. Either **download-on-first-use** (call Remotion's
  `ensureBrowser()` into `app.getPath('userData')` behind a progress UI — dmg unchanged, one-time
  ~193 MB download and a first-run stall) or **use the user's own Chrome** via `browserExecutable`
  (no download, silently broken on a machine without Chrome). The 17 MB FFmpeg compositor is not
  optional under either. *Recommendation:* neither, in this phase — but if forced, the first.
  Reusing **Electron's own Chromium was investigated and is not a plan**: `@remotion/renderer`
  expects a `chrome-headless-shell` binary, Electron's helpers are not CLI-compatible with it, and
  Remotion neither documents nor tests the substitution. It was not verified empirically, so treat
  it as unavailable rather than merely unproven.
