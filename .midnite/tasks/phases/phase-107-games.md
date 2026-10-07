# Phase 107 — Games

**Refined: x1** · 2026-10-04 · UI/UX & interaction, visual design & theming, accessibility & keyboard, empty / loading / error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, observability & diagnostics, security, permissions & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

Requested by the user · 2026-10-04 · grounded against the tree as of `a51a3b05`; re-grounded by the
x1 refinement against `bfdf58ed` (Phases 105 and 106 refined x1).

Media gets an eighth tab, **Games**: a lightweight, AI-driven game engine. **Code first**: a game is a
real codebase written against **Phaser** (2D) or **three.js + Rapier** (3D). It is **its own git repo**,
written by an agent (a roster CLI, or Ollama with a warning), and **play-tested by that agent through
the app**. The app does not invent a game format. It supplies four things that make AI game-making work:

- engine **kits** and **starter projects**, so an agent extends a working game instead of writing one
  from nothing;
- a **sandboxed runner**, so AI-written JavaScript never shares a process with the app's bridge;
- a **play-test loop over MCP** (run, screenshot, logs, scripted input, read state, replay), so the
  agent can see and play what it built;
- an **asset bridge** from Terrain (Phase 105), Sprites (Phase 106), Models, Images and Audio.

This is the last of three phases: **[105](phase-105-terrain.md) Terrain →
[106](phase-106-2d-assets.md) 2D Assets → 107 Games**. The user chose all five shapes discussed in the
brainstorm, so this is deliberately a long phase with many small themes:

1. **Engine kits + genre starters.** Shared kit modules in each repo; perspectives as presets; genres
   as starters that combine a preset with genre systems.
2. **The perspective × genre matrix.** A gallery where every valid combination instantiates and runs,
   composed from the kits rather than copied.
3. **Genre recipe skills.** One skill per genre, so an agent can extend a genre, or build a combination
   no starter covers.
4. **Assets first.** Phases 105 and 106 are predecessors, and this phase's asset bridge consumes them.
5. **Play-test depth.** Determinism, input replays and frame assertions on top of the basic loop.

**Templates (user, 2026-10-04).**

| | Perspectives | Genres |
|---|---|---|
| **2D** | platformer · top-down · isometric · 2.5D raycaster (Doom-style) | FPS · RTS (StarCraft-style) · ARPG (Diablo-style) · top-down crime (original GTA) |
| **3D** | first person · third person, with five cameras: over the shoulder left, over the shoulder right, directly behind, further behind, much further behind | shooter · fighter (Tekken) · soulslike · RPG · character action · open world (GTA) |

> **Builds on.**
> - **Phases 105 and 106 as hard predecessors.** The three.js kit loads Phase 105's
>   `terrain.manifest.json` (`TerrainManifestSchema` v1: `heightfield.png` 16-bit + `heightfield.json`,
>   `chunks/lod<n>.glb` with nodes `chunk_<cx>_<cz>`, `drape`/`splat`/`landcover` maps, `foliage.json`
>   as `[assetIndex, x, y, z, yaw, scale]` tuples, `buildings.json`, `roads.json` with
>   `path|street|avenue` edges), exported as a `<name>.terrain/` folder. The Phaser kit loads Phase 106's
>   `atlas.json` (Phaser JSON-hash that is also Aseprite JSON) with `anims.json`
>   (`AnimationManager.fromJSON`, keys `<asset>/<clip>/<dir>`), and its Tiled `.tsj` and `.tmj` (tilesets
>   embedded), exported as `<asset>.sprite|.tileset|.background|.map/` folders.
> - **Sandboxed web content.**
>   [`main/apps-service.ts`](../../../packages/desktop/src/main/apps-service.ts) already hosts each
>   third-party app in a `WebContentsView` with `sandbox: true`, `contextIsolation`, no preload and its
>   own `persist:app-<id>` partition (`enableApp` L75; `ensureAppSessionConfigured` L56 →
>   `denyAllPermissions` + `will-download` → `cancelDownload`; `will-navigate`/`will-redirect` checked;
>   `setWindowOpenHandler` → deny; `setAppBounds` scales by the zoom factor; `markAppVisible` →
>   `view.setVisible`; `reparentAppView` for pop-out). [`browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts)
>   holds `denyAllPermissions`, `checkNavigationUrl` and `cancelDownload`.
>   [`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts)'s `mstudio-file://` is
>   registered by `registerMgitFileScheme()` (`protocol.registerSchemesAsPrivileged`, before ready) and
>   handled only on the default session, so isolated views cannot read it; its guards are
>   `resolveScopeRoot` + `confineToRoot` ([`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts)),
>   `net.fetch(pathToFileURL(…), { bypassCustomProtocolHandlers: true })` and `MIME_BY_EXT`.
>   [`csp.ts`](../../../packages/desktop/src/main/csp.ts) (`buildCsp`, `installCsp`) sets the app's own
>   CSP. Nothing in the tree attaches `webContents.debugger`, listens to `console-message`, or uses
>   `capturePage`/`sendInputEvent`/`executeJavaScript` outside the dev-only
>   [`capture.ts`](../../../packages/desktop/src/main/capture.ts). The runner copies the apps pattern.
>   It must also pass Phase [91](phase-91-security-hardening.md) Theme E's Electron checklist (a global
>   `web-contents-created` net in `main/web-contents-policy.ts`, `denyAllDevices`, and
>   `main/web-preferences.test.ts` asserting every view's `webPreferences`) and Phase
>   [76](phase-76-the-renderer-in-a-sandbox.md)'s sandbox rules.
> - **Git.** [`git-engine/src/commands/clone.ts`](../../../packages/git-engine/src/commands/clone.ts)
>   (`cloneRepo(destDir, url, name): CloneResult`) and the `repoClone` handler in
>   [`ipc/repo-handlers.ts`](../../../packages/desktop/src/main/ipc/repo-handlers.ts) (L72: `cloneRepo` →
>   `openRepo(path)` from [`repo-registry.ts`](../../../packages/desktop/src/main/repo-registry.ts) L62 →
>   `syncWatchers()`; the registry persists `repos.json`). **There is no production `git init` today**; the
>   only one is `TempRepo.create` in `git-engine/src/testing/temp-repo.ts`
>   (`['init', '--initial-branch=main', dir]`). All writes go through
>   [`write-queue.ts`](../../../packages/git-engine/src/exec/write-queue.ts) (`writeQueue.run(key, task)`),
>   as [`commit.ts`](../../../packages/git-engine/src/commands/commit.ts) does
>   (`commit(worktreePath, { message, amend?, all? }): Promise<GitOpResult>`); staging is
>   `stagePaths(worktreePath, paths)` in [`stage.ts`](../../../packages/git-engine/src/commands/stage.ts).
>   There is no `revert` command.
> - **Agents.** [`media/model/iterative-host.ts`](../../../packages/desktop/src/main/media/model/iterative-host.ts)
>   (`createIterativeHost()` → `{ startServer({dispatch}), shimLaunch, resolveAgent, runCli }`; a private
>   socket at `<userData>/mcp-runs/r-<hex>.sock`) and [`iterative.ts`](../../../packages/desktop/src/main/media/model/iterative.ts)
>   (`runIterative(opts: IterativeOptions)`, `ScopedDispatch`, `allowedClaudeTools()`,
>   `MODEL_ITERATIVE_MAX_CALLS = 250`, `MODEL_ITERATIVE_TIMEOUT_MS`), plus `createLlmCall` in
>   [`media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts) for Ollama.
> - **Workspace scaffolding.** [`main/video/scaffold.ts`](../../../packages/desktop/src/main/video/scaffold.ts)
>   (`scaffoldVideoWorkspace(templateDir, dest, engine): GitOpResult<void>`; refuses a non-empty `dest`;
>   `cp(…, { force: false })`; a test asserts every file in `VIDEO_COMMON_TEMPLATE_FILES` exists) copies
>   `templates/media-video/` (including `.claude|.agents|.codex/skills/`) into a video root, located by
>   `mediaVideoTemplateRoot()` in `template-path.ts` (`process.resourcesPath` when packaged; the repo's
>   `templates/` is already an `extraResources` entry). A new `templates/media-game/` follows the same
>   pattern into every game repo.
> - **Video's root setting as the pattern for the games location.** `video-settings.json`
>   (`{version: 1, videoRoot}`, [`video/projects-store.ts`](../../../packages/desktop/src/main/video/projects-store.ts)),
>   `mstudio:video:root-get|set|resolve`, and `VideoRootSection` in Settings ▸ Media
>   ([`media-page.tsx`](../../../packages/app/src/features/settings/settings-pages/media-page.tsx), whose
>   accordions are General, Video, Images, Audio).
> - **Media tabs.** `MEDIA_TABS` and its tables, as in Phase 105 Theme A. Games is **not** in
>   `REPO_SCOPED_MEDIA_TABS`: like Video, it resolves its own root (the games location setting), so it
>   works with no repo open.
> - **The MCP recipe** of the `model_*` family, as Phase 105 Theme J restates it: ids and schemas in
>   `shared/src/media-game-mcp.ts`, entries **inline** in `MCP_TOOLS` with ids in the hand-written
>   `McpToolEntry.id` union and write ids in `mcp.test.ts`'s `writeTools`, a mapped-type entry in
>   [`dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), a `main/mcp/game-tools.ts` gate
>   and binder, a persisted `McpSettings` switch ([`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts)),
>   the inline timeout at [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts) L87, and
>   a switch in [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx).
> - **Pop-out and visibility.** `mstudio:window:detach` → `createRoleWindow` in
>   [`window-handlers.ts`](../../../packages/desktop/src/main/ipc/window-handlers.ts) with roles from
>   `PANEL_WINDOW_ROLES` ([`shared/src/domain/window.ts`](../../../packages/shared/src/domain/window.ts));
>   `anyWindowVisible()` in [`window-visibility-gate.ts`](../../../packages/desktop/src/main/window-visibility-gate.ts);
>   `usePageVisible()`/`useWindowFocused()` in `app/src/lib/`.
>
> **Scope guardrails.**
> - **Web export only** (user, 2026-10-04): a zip, a static folder, or a single HTML file. No native,
>   mobile, console, itch.io or GitHub Pages publishing in this phase.
> - **No build step and no bundler shipped.** `esbuild` and `three` are dev-only in `packages/desktop`
>   today, and Vite exists only in `packages/app`. Games are plain ES modules with an import map and
>   vendored engines, so the app ships no toolchain.
> - **The app does not write game code itself.** Agents edit files in the repo with their own tools.
>   The app provides the starter, the runner, the play-test tools and the asset bridge.
> - **No multiplayer or networking.** Game network access is off by default (opt-in per game).
> - **Engines stay out of the app bundle.** Phaser, three and Rapier for games are app *resources*,
>   vendored into each repo. They never enter the renderer's entry chunk (the `bundle-report.mjs`
>   budget holds).
> - **Package boundaries hold.** Schemas, the template matrix and manifest logic live in `shared`.
>   `git init`, the runner, file watching and vendoring live in `git-engine` and desktop main. The UI
>   lives in `app`.
> - **No new global chords.** Runner keys go to the game view itself; nothing joins `COMMANDS`.
>
> **Effort tags:** **S** ≤ half a day · **M** 1–2 days · **L** 3+ days, likely 2–3 PRs.

## Headlines

_A game is a repo, an agent writes it, and the app lets the agent play it._ Generating game code is
the part models already do well. Seeing the result is the part they cannot do, and that is what this
phase builds: kits and starters to extend, a sandbox to run in, and a play-test loop the agent drives
over MCP. Planned 2026-10-04; refined x1 the same day, which pinned the runner's session, scheme, CSP
and capture mechanics, the template layout and ids, every MCP tool, and resolved all four opens plus
fourteen new decisions.

**Theme A — Game repos, the Games tab and settings.** ✅ Landed. `initRepo`, `isInsideWorkTree` and `workTreeTop` in
git-engine; `games-settings.json` (default `~/Midnite Games`, validated with the three literal messages); `'game'` in
`MEDIA_TABS` (not repo-scoped, `LuGamepad2`); `GameManifestSchema` v1 with a non-throwing `parseGameManifest`; creation
copies a **blank** scaffold from `templates/media-game/common/`, writes the manifest, inits, and registers through
`openRepo` (starters, vendored engines and skills arrive with Themes C and G to L; any other starter id is refused).
The Games tab lists game repos with no repo open, and Settings ▸ Media ▸ Games carries the location, engine, network
and squash settings and the Ollama warning.

**Theme B — The sandboxed runner.** ✅ Landed, bar the real-Chromium e2e, which moves to Theme Q. **Pop out** ships as a games IPC (`gamesPopOut`, `gamesPopped`, `gamesPopState`) over a `game` window role: one popped game at a time, runs of a popped game start in the popout, and closing it docks the view back to main. One `WebContentsView` per run on an in-memory `game-<gameId>-<runId>` partition
(`persist:game-<id>` with `keepSaveData`), no preload; `mstudio-game://<gameId>/` registered by
`registerPrivilegedSchemes()` alongside `mstudio-file` and handled only on that session, with traversal, symlink,
dotfile and wrong-host refusals, CSP and `nosniff` on every response, `onBeforeRequest` blocking, a four-permission
policy, a navigation lock, a 2000-entry console ring buffer fed by `console-message` and the CDP debugger, `fs.watch`
hot reload, a three-run cap and a toolbar. Tested in vitest with fakes for the view and session.

**Theme C — No-build runtime, vendored engines and kit versions.** ✅ Landed. Exact-pinned
`phaser@3.90.0`, `three@0.186.1`, `@dimforge/rapier3d-compat@0.21.0` and `recast-navigation@0.43.1`
in desktop devDependencies vendored into `resources/game-engines/` at bundle time by
`scripts/vendor-game-engines.mjs`; import maps in `index.html` filtered per 2D/3D engine; `jsconfig.json`
with `// @ts-check` for editor typing without a build; kit versioning with `GAME_KIT_VERSION = '0.1.0'`,
`kit-hash.json` integrity test, and branch-based `gamesKitUpgrade` IPC; licences documented in `docs/MEDIA_GAMES.md`.

**Theme D — MCP plumbing: the minimum play-test loop.** ✅ Landed. Twelve `game_*` tools (`game_list`,
`game_create`, `game_open`, `game_get_manifest`, `game_set_manifest`, `game_run`, `game_stop`, `game_reload`,
`game_screenshot`, `game_logs`, `game_input`, `game_state`) behind `allowGames` MCP consent switch in
Settings ▸ MCP; untrusted `game_state` capped at 256 KB with depth validation; burst screenshot capture and
sequenced input via `sendInputEvent`; covered by comprehensive vitest suites.

**Theme E — Phaser kit and the 2D perspective presets.** ✅ Landed. Engine-free `kit/core/` (rng, clock, iso, raycast, anim-names, input-map, jump, tiled-objects, asset-index, save, hook, preset-defaults) covered by `kit-core.test.ts`, plus `kit/phaser/` (boot, scenes, input, camera, animator, tiled, hud, audio) and the platformer, top-down, isometric and DDA raycaster presets, all smoke-tested in real Chromium. `window.__midnite` is installed by `hook.js`; `KitGameStateSchema` is the kit's required contract while `GameStateSchema` types the same fields as optional so a hand-written game may report anything. `GAME_KIT_VERSION` is 0.2.0.

**Theme F — three.js kit, physics and the camera rigs.** ✅ Landed. Engine-free `kit/core/` additions —
`createFixedStep(hz, maxSteps = 5)` in `clock.js`, `cameras.js` (the five presets with the doc's offsets, `springArmDistance`,
`relaxArm`, lock-on, versus, head bob, camera-relative movement), `lod.js` (Phase 105's `selectLod` constants),
`terrain-manifest.js` (a plain-JS mirror of `TerrainManifestSchema`, version 1 only), `png16.js` (16-bit PNG via
`DecompressionStream`), `heightfield.js` (whose `heightAt` uses the same cell diagonal as Rapier's heightfield, and whose
`toRapierHeights` transposes the z-major PNG into Rapier's column order), `clip-names.js`, `vehicle.js`, `road-ribbon.js`,
`nav-policy.js` and `dom-keys.js` — plus `kit/three/{loop,input,physics,character,gltf,animator,terrain,hud,audio,cameras,vehicle,nav}.js`.
The terrain loader falls back to one mesh built from the heightfield when a pack lists no chunk glbs. The camera ids stay
the ones shared already shipped in Theme A's manifest schema (`over-shoulder-left/right`, `behind`, `further-behind`,
`much-further-behind`), not the doc's `shoulder-left` spellings, so existing manifests stay valid; `GAME_CAMERA_OFFSETS`
joins them in shared. The vehicle's engine force is 3000 (Rapier applies it as a raw impulse, so it has to carry a 1200 kg
chassis). Fixes a Theme C bug: three r186's `three.module.js` imports `./three.core.js`, which the vendoring script did not
copy, so every 3D game 404'd. `GAME_KIT_VERSION` is 0.3.0. Tested in `kit-core-three.test.ts` (22 tests, including a real
Rapier heightfield checked against `heightAt`) and smoke-tested in SwiftShader Chromium on a synthetic terrain pack (third
person, first person, camera cycling, driving, the nav path); rendering e2e stays with Theme Q.

**Theme G — Perspective base starters.** ✅ Landed. Six bases under `templates/media-game/bases/` (`platformer`, `top-down`, `isometric`, `raycaster`, `first-person`, `third-person`), each a minimal playable level on the Theme E/F kit: a player, one hazard or enemy, placeholder art drawn in code (so `ASSETS.md` is an empty table and `assets/index.json` an empty index, ready for the asset bridge), a `src/genre/index.js` seam a genre module replaces, and `playtests/smoke.json`. The 3D arena is a Rapier ground, three boxes, a ramp and a door that opens on `interact`; animation states are reported in `getState()` until a Models asset supplies clips. All six verified in real Chromium. Tested through `compose.test.ts`.

**Theme H — 2D genre starters.** ✅ Landed. FPS (`fps@raycaster`), RTS (`rts@top-down`/`isometric`), ARPG (`arpg@isometric`/`top-down`) and top-down crime (`crime@top-down`/`isometric`) in `templates/media-game/genres/<genre>/`, each replacing the base's `src/genre/index.js` seam, with `GAME_GENRES_AVAILABLE` flipped so their gallery cells are creatable. Engine-free systems sit in `kit/core/genre/{fps,rts,arpg,crime}/` (weapon table and sight; A*, flow field, selection, economy, fog, scripted AI; loot, inventory, dungeon; wanted reducer and `car2dStep`) and are covered by `kit-genres.test.ts`. RTS/ARPG/crime simulate in tile units and draw through the new `kit/phaser/world2d.js`, so one module runs top-down and isometric. Levels are Tiled-shaped maps built in code (`levels.js`, `city.js`). `composeStarter` copies only the chosen genre's `kit/core/genre/<g>/` plus any a `genre.json` lists in `kitGenres` (ARPG and crime reuse RTS's A*). The raycaster rig now exposes `map`, `sprites`, `pos`, `isSolid` and `openDoor`. Kit is 0.4.0. Also fixed a Theme G bug: `boot()` left the page's empty `<canvas id="game">` over Phaser's own canvas, so every starter showed a black screen. All seven starters were booted in real Chromium.

**Theme I — 3D genre starters, part one: shooter, fighter, soulslike.** ✅ Landed. Shooter (`shooter@first-person`/`third-person`), fighter (`fighter@third-person`) and soulslike (`soulslike@third-person`) in `templates/media-game/genres/<genre>/`, with `GAME_GENRES_AVAILABLE` flipped so their gallery cells are creatable. Engine-free systems sit in `kit/core/genre/{shooter,fighter,soulslike}/` (arsenal with magazines, reloads, fire rate and recoil, `spreadCone`/`spreadDirection`, `pickCover` over occluder rects; frame data counted from 1 so a 10/3/15 move is active on 10–12, string cancel windows, combo damage scaling, hit/hurt boxes and `resolveHit`, a round/timer reducer, a seeded CPU; the stamina economy and `bossPhase`/`bossChooseAttack`) and are covered by `kit-genres-3d.test.ts` (a separate file from H's so J can append without conflicts). The souls folder is `soulslike`, the genre id, so `composeStarter` copies it with no `genre.json`. Shooter and soulslike replace only `src/genre/index.js` on the shared arena; both 3D bases gained an optional `intent(wish, dt, frame)` seam a genre uses to reshape the step's movement (roll, rooted attacks), and the third-person base now draws a stand-in avatar. The fighter ships its own `src/scenes/level.js` — a dojo, two primitive fighters, no Rapier — on the kit's `versus` rig; the gallery hides the camera picker for it and says why. Shooter enemies path on the recast navmesh (straight-line fallback if it fails to build) and break line of sight when hurt; `kit/three/damage-numbers.js` is new and shared. Kit is 0.5.0. All four starters were booted in SwiftShader Chromium and driven through `__midnite` (fire, reload, launcher-into-juggle, roll i-frames, lock-on).

**Theme J — 3D genre starters, part two: RPG, character action, open world.** ✅ Landed. RPG (`rpg@third-person`/`first-person`), character action (`character-action@third-person`) and open world (`open-world@third-person`/`first-person`) in `templates/media-game/genres/<genre>/`, with `GAME_GENRES_AVAILABLE` now listing every genre, so no gallery cell is left waiting. Engine-free systems sit in `kit/core/genre/{rpg,character-action,open-world}/` (folder = genre id, as in I): a data-driven quest log that moves only on its stage's listed event, JSON dialogue trees with gated choices and effects plus `reachableEnds`/`everyNodeCanEnd`, stats and levelling, NPC schedules that wrap midnight; `comboStep` with inclusive cancel windows (a press outside is dropped, not buffered), ground/air openers and a launcher, a D→SSS style meter that rewards variety and drains by rank, an arena wave reducer; `routeOnRoads` (Dijkstra by `lengthM`), `routePolyline`/`pointAlong`, seeded `trafficSpawn`/`trafficStep` that turn at junctions and U-turn at dead ends, a day/night `skyAt`, and a land-cover minimap. All covered in `kit-genres-3d.test.ts`, which reads the RPG's own `src/data/*.json` and the fixture's `roads.json`. The RPG keeps the base arena (a village, three NPCs, wolves, herbs; data loaded with JSON import attributes) and reuses the ARPG inventory through `genre.json`; character action and open world ship their own `src/scenes/level.js`. The open world runs on `assets/terrain/fixture.terrain/`, a 512 m, 257² pack built and exported by Phase 105's own pipeline from the noise preset and a plus-shaped roads mask (`open-world-fixture.test.ts` regenerates it behind `MSTUDIO_REGEN_OPEN_WORLD_FIXTURE=1` and checks it: valid manifest, one 4-way junction, under 2 MB — 1.2 MB after dropping LOD 0, the splat and the material tiles), named in `assets/index.json` as `terrain/world`; F's cars with enter/exit, traffic, pedestrians, police routed on the roads, and the crime starter's `wanted.js`. `kit/three/terrain.js` now drapes a pack's UV-less chunks from above. Kit is 0.6.0. All five starters pass their provisional `smoke.json` in SwiftShader Chromium, and the RPG quest loop, combo/juggle/waves, and driving to night were driven through `__midnite`.

**Theme K — Template gallery: the perspective × genre matrix.** ✅ Landed; every genre cell is creatable since Theme J. `GAME_TEMPLATE_MATRIX`, `starterId`, `parseStarterId`, `isValidStarter` (the matrix's refusal reasons) and `isStarterAvailable` live in `shared/src/media-game-templates.ts`. `composeStarter` (`main/games/compose.ts`) writes `common/` + `kit/core` + the one engine's kit + the base + the genre module when present, then `src/game.config.js`; `createGame` calls it for any non-blank starter and records the chosen cameras in `cameraPresets`. The create panel is now `GameGallery`: a 2D/3D toggle, genres down, perspectives across, a No-genre row for the bases, disabled cells with their reason, roving-tabindex arrow keys and the five camera checkboxes on third person. Every genre cell currently reads "Not available yet".

**Theme L — Genre recipe skills and the build skill.** ✅ Landed. Eleven skills in `templates/media-game/skills/`: `midnite-media-game-build` (layout, manifest, the `__midnite` hook, the play-test loop through the `game_*` tools, the asset index, the rules) and one recipe per genre (`-fps`, `-rts`, `-arpg`, `-crime`, `-shooter`, `-fighter`, `-soulslike`, `-rpg`, `-character-action`, `-open-world`), each listing the kit files and exports the genre uses, tuning numbers, a build order and a play-test checklist keyed to that genre's `getState()` fields. `seedGameSkills` (`main/games/skills.ts`) copies them into `.claude/`, `.agents/` and `.codex/skills/` of every new game, blank or starter, and the convention stubs point at them. Only the build skill is mirrored into the app repo's six skill dirs; `scripts/skill-copies.test.mjs` pins those and the template source. `skills.test.ts` checks front matter, that every `game_*` token is a real tool, that 33 files are seeded, and that every `` `NAME = number` `` quoted in a skill equals a kit or genre default. The crime recipe is `midnite-media-game-crime` (the genre id), not the `-topdown-crime` the checklist first named. The build skill describes `createAssetIndex(...).url()` rather than `assetUrl(name)`, which does not exist until Theme N.

**Theme M — Create and iterate: agents, Ollama and commit-per-turn history.** ✅ Landed. `main/games/game-agent.ts` runs a game in passes: `runGameAgent` starts one private MCP server per run (`createIterativeHost`) whose dispatcher answers only this game's `game_*` tools (not `game_create`/`game_open`), fixed to its `gameId` or path, under `MODEL_ITERATIVE_MAX_CALLS`, and runs the CLI once per pass with the repo as cwd. Claude Code gets `--tools Read,Edit,Write,Glob,Grep`, those plus `mcp__midnite__game_*` in `--allowedTools`, and `--strict-mcp-config`; Codex gets `--sandbox workspace-write` with network off; any other CLI is refused, since it cannot be held to file tools and no shell. `runGameTurns` is the shared commit-per-pass loop: a changing pass is `stagePaths(['.'])` + `commit` with `agent: <prompt, 60 chars> (pass n/N)`, a no-op pass commits nothing, a cancelled or failed pass still commits what it left, and `squashRunCommits` folds a run into one commit with `reset --soft`. Ollama passes (`runGameOllama`) see `midnite-game.json` + `src/**/*.js` up to 60 KB (largest file truncated with a marker), answer a `GameOllamaEnvelopeSchema` (fenced or bare JSON), and one path outside `src/` (`checkGameOllamaPath`) refuses the whole envelope with nothing written. `game-agent-service.ts` holds one run per game, refuses a dirty tree or an in-progress operation (else the user's own edits would land in, and be undone with, an agent commit), streams `gamesAgentProgress`, and implements **Undo turn** with git-engine's new `revertCommit` (`commands/revert.ts`, `revert --no-edit --end-of-options`, conflicts as `conflict('revert')`) — only on the newest agent commit, and only while it is still HEAD. `GAMES_OLLAMA_WARNING` now carries the doc's sentence; `game_create` takes an optional `writer` engine and answers `warnings`. The renderer adds `GameIteratePanel` (engine select with MCP agents then Ollama models, the amber dismissible banner, a 1–20 Passes slider, prompt, Run agent/Cancel) under the selected game's details, `GameEditThread` (actions, per-pass commits with files, squashed/undone marks, Undo turn on the newest), and an optional **First prompt** on the create form that starts a run on the new repo. The console drawer's log is now named "Console output" so the two logs on the tab stay addressable.

**Theme N — Asset bridge.** ◻ Not started. Copies into `assets/<kind>/<name>/` with sha256 provenance,
`assets/index.json` as the one lookup the kits use, and re-sync as its own commit.

**Theme O — Play-test depth: determinism, input replays and frame assertions.** ◻ Not started. Seeded
`Math.random` and a virtual clock in deterministic mode, frame-indexed `.replay.json` injected through
the kit (not OS events), JSON-path and frame-diff assertions, and `playtests/*.json`.

**Theme P — Web export.** ◻ Not started. A folder, a zip from a small `node:zlib` zip writer, and a
single HTML file whose modules become `data:` URLs behind an import map and whose assets resolve through
an inlined `assets/index.json`.

**Theme Q — Verification.** ◻ Not started. The gate, bundle numbers, a deliberate e2e budget raise, a
hostile-game e2e, screenshots and three human passes.

## Build order

1. **A + B + C** (foundation): repos, sandbox, runtime. Merged before anything else. B's privileged
   scheme registration edits `registerMgitFileScheme()` (Electron keeps only the last
   `registerSchemesAsPrivileged` list), so B lands in the same PR as or after the A tab, never split
   across a half-registered scheme.
2. **D** right after, so every later theme is built and checked with the agent loop in place.
3. **E · F** in parallel (the kits). **M · N · P** in parallel alongside them. N's Terrain and Sprites
   importers need Phase 105 Theme I and Phase 106 Themes G, H and J.
4. **G** once E and F expose their presets.
5. **H · I · K · L · O** in parallel. **J** in parallel too, except **open world, which lands last**,
   because it needs Phase 105's terrain streaming and road graph plus F's vehicle controller.
6. If Phase 91 Theme E's global `web-contents-created` net lands before or during this phase, its
   own-origin rule must accept `mstudio-game://<gameId>` for runner views; B's tests assert that.

## A — Game repos, the Games tab and settings (M)

- [x] `initRepo` in a new `git-engine/src/commands/init.ts`: `git init -b main`, then an initial commit of the scaffold through the write queue, with NUL-safe argv and `--end-of-options` where applicable. A `GitOpResult` envelope, no throws. Vitest in a temp dir
  - Signature: `initRepo(dir: string, opts: { message: string; author?: { name: string; email: string } }): Promise<GitOpResult<{ head: string }>>`.
    Steps inside `writeQueue.run(dir, …)`: `execGit(dir, ['init', '--initial-branch=main', '--', '.'], { write: true })`,
    `stagePaths(dir, ['.'])`, then `execGit(dir, ['commit', '--no-verify', '-m', message], { write: true })`
    (`--no-verify` because a fresh repo's hooks are the user's global ones, not this scaffold's), then
    `rev-parse HEAD`. A directory that already contains `.git` → `failure('This folder is already a git repository.')`.
    No identity configured anywhere → the commit's own failure message is returned verbatim.
  - Also `isInsideWorkTree(path): Promise<boolean>` (`git -C <path> rev-parse --is-inside-work-tree`,
    `false` on any error) in the same file. Both exported through `commands/index.ts`.
- [x] **Games location setting** under **Settings ▸ Media ▸ Games** ([`media-page.tsx`](../../../packages/app/src/features/settings/settings-pages/media-page.tsx)). Default `~/Midnite Games`, configurable (user, 2026-10-04), created on first use, validated (writable, not inside another repo's working tree). Also on that page: default engine, default network policy (off), and the Ollama warning text
  - **Resolved: stored in main, like `videoRoot`** (Decision 5). `main/games/games-settings-store.ts`
    writes `<userData>/games-settings.json` = `{ version: 1, gamesRoot: string | null, defaultEngine: 'phaser' | 'three', defaultNetwork: 'off' | 'on', squashRunCommits: boolean }`
    (`null` means the default `join(os.homedir(), 'Midnite Games')`). Channels
    `gamesSettingsGet: 'mstudio:games:settings-get'` and `gamesSettingsSet: 'mstudio:games:settings-set'`.
  - Validation on set and on first use (`validateGamesRoot(path)` in `main/games/games-root.ts`), in
    order, with literal messages: not absolute → _"Choose a full folder path."_; inside a git working tree
    (`isInsideWorkTree` on the folder or its nearest existing parent) → _"This folder is inside the git
    repository <top>. Games are their own repositories — pick a folder outside it."_; not writable
    (`fs.access(W_OK)` on it or its nearest existing parent) → _"Midnite Studio can't write to this
    folder."_. The folder is created (`mkdir -p`) only when the first game is created.
  - UI: a fifth `Accordion title="Games"` in `MediaSettingsPage` with `GamesRootSection` (path field +
    **Choose…** via `repos.pickDirectory()` + **Reset to default**), a default-engine select (Phaser /
    three.js), a network select (Off / On, help text _"Games can't reach the internet unless you allow
    it per game."_), the **Squash each run into one commit** switch (M), and the Ollama warning shown as
    read-only text (the same constant `GAMES_OLLAMA_WARNING` M uses).
- [x] `'game'` added to `MEDIA_TABS` (label **Games**, `react-icons/lu` gamepad glyph), with every `Record<MediaTab, …>` filled in, `MEDIA_LAYOUT_KEYS` plus two width keys, and deliberately **not** in `REPO_SCOPED_MEDIA_TABS`
  - `MEDIA_TAB_META.game = { label: 'Games', icon: LuGamepad2 }`; `TAB_BODY.game = () => <GameTab />`;
    `MEDIA_TAB_EXPORT_FORMATS.game = ['game-html', 'game-zip', 'game-folder']` (P adds the ids);
    `mediaGameExplorerWidth` (240, `{180, 480}`) and `mediaGameDetailWidth` (380, `{300, 680}`); persist
    `version` stays `31`.
- [x] **Game manifest** `midnite-game.json`, with `GameManifestSchema` in a new `shared/src/media-game.ts`:
  - `name`, `engine` (`phaser` or `three`)
  - `dimension` (`2d` or `3d`), `perspective`, `genre`
  - `cameraPresets`
  - `entry` (default `index.html`)
  - `kitVersion`, `vendored` (engine versions)
  - `assets[]` with provenance (source tab, source path, imported at)
  - `network` (`off` or `on`)
  - `deterministic`
  - Exact: `{ version: z.literal(1), name: string (1–80), engine, dimension, perspective: GamePerspective,
    genre: GameGenre | null, starter: string (the K id), cameraPresets: GameCameraId[] (3D only; default
    all five for third person), entry: 'index.html', kitVersion: semver string, vendored: Record<'phaser' | 'three' | 'rapier' | 'recast', string>,
    assets: GameAssetProvenance[], network: 'off' | 'on', deterministic: boolean (false), keepSaveData: boolean (false) }`
    with `.passthrough()` so agents may add keys. `GameAssetProvenanceSchema = { name, kind: 'terrain' | 'sprite' | 'tileset' | 'map' | 'background' | 'model' | 'image' | 'audio', path, source: { tab: MediaTab, repoId: string | null, path: string }, sha256, importedAt }`.
  - `parseGameManifest(value)` returns a typed result `{ ok: true; manifest } | { ok: false; issues: { path, message }[] }`
    and never throws — an agent may have hand-edited the file.
- [x] Creating a game:
  1. pick a starter (G, H, I, J or K), a name and a folder (defaults to the location setting)
  2. copy the starter, write the manifest, vendor engines (C), seed `templates/media-game/` (skills plus `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` stubs carrying the game repo's own conventions, and a `.gitignore`)
  3. `initRepo`, then register with the app's repo list through the same path clone uses (`openRepo`)
  - `createGame(req: GameCreateRequest): Promise<GitOpResult<{ path: string; gameId: string }>>` in
    `main/games/game-scaffold.ts`. Folder = `<gamesRoot>/<gameSlug(name)>`; an existing non-empty folder
    is refused with _"<folder> already exists — choose another name."_ (the `scaffoldVideoWorkspace` rule).
  - Order: `composeStarter` (K) into a temp dir beside the target → `vendorEngines` (C) → write
    `midnite-game.json` → seed skills and convention stubs → atomic `rename` into place → `initRepo` with
    message `Create <name> from <starter>` → `openRepo(path)` → `syncWatchers()`. Any failure removes the
    temp dir and returns the step's message; a failure after the rename leaves the folder (no destructive
    cleanup of a folder the user can see) and says so.
  - `gameId = 'g' + sha1(realpath(path)).slice(0, 12)` (stable across runs; the runner's host name).
- [x] **Games tab**: the explorer lists game repos found under the location plus any registered repo carrying a `midnite-game.json`. Centre is the runner (B), right is the create/iterate panel (M). **Open in Timeline** jumps to the repo's git graph
  - `gamesList: 'mstudio:games:list'` → `{ games: { gameId, name, path, engine, dimension, starter, dirty: boolean, valid: boolean }[] }`:
    direct children of `gamesRoot` containing `midnite-game.json` plus registry repos whose root has one,
    deduped by realpath. An invalid manifest lists with a `LuTriangleAlert` and the first issue as tooltip.
  - Explorer `GameExplorer` (`game-explorer.tsx`) rows show name, engine glyph and a dirty dot; a
    **New game** button opens the gallery (K) in the right column. Empty state: _"No games yet. Create one
    from a starter."_ with the button.
  - **Open in Timeline** selects the repo (`selectedRepoId`) and switches to the Timeline view.
- [x] `mstudio:media:game-*` IPC channels and schemas in `shared`
  - **Correction (x1):** games are not repo-media; their channels use the `mstudio:games:` prefix like
    `mstudio:video:` does. `CHANNELS`: `gamesSettingsGet`, `gamesSettingsSet`, `gamesList`,
    `gamesCreate`, `gamesGetManifest`, `gamesSetManifest`, `gamesRun`, `gamesStop`, `gamesReload`,
    `gamesSetBounds`, `gamesSetVisible`, `gamesToolbar` (`{ action: 'pause' | 'resume' | 'mute' | 'unmute' | 'devtools' | 'popout' | 'resolution', value? }`),
    `gamesLogs`, `gamesAgentRun`, `gamesAgentCancel`, `gamesUndoTurn`, `gamesImportAsset`, `gamesResync`,
    `gamesPlaytest`, `gamesExport`, `gamesKitUpgrade` (`'mstudio:games:<kebab>'` each).
    `EVENT_CHANNELS`: `gamesChanged`, `gamesRunState` (`{ gameId, runId, state: 'starting' | 'running' | 'paused' | 'stopped' | 'crashed' }`),
    `gamesConsole` (batched `GameLogEntry[]`), `gamesAgentProgress`, `gamesOpen`.
  - Bridge `games.{ settings, list, create, manifest, run, stop, reload, setBounds, setVisible, toolbar, logs, agent, undoTurn, assets, playtest, export, kitUpgrade, on* }`;
    handlers in `main/ipc/games-handlers.ts` (`registerGamesHandlers()`), over one `createGameService` in
    `main/games/game-service.ts`.
- [x] Vitest: `initRepo` creates a repo with one commit, the manifest round-trips, an existing folder is refused, the location validation rules hold, and the explorer lists seeded game repos via the mock bridge
  - `git-engine/src/commands/init.test.ts` (`rev-list --count HEAD` is 1; branch is `main`; a second
    `initRepo` is refused; `isInsideWorkTree` true inside a `TempRepo`, false in `tmpdir()`);
    `shared/src/media-game.test.ts` (round trip, `parseGameManifest` issues not throws);
    `desktop/src/main/games/games-root.test.ts` (the three messages);
    `desktop/src/main/games/game-scaffold.test.ts` (non-empty folder refused; temp dir removed on failure);
    `app/src/features/media/game/game-tab.bridge.test.tsx` (two seeded games listed; works with no repo selected).
- [x] `GameService` is the one implementation IPC and MCP call
  - `createGameService(deps: { settings; runner: GameRunner; agentHost: IterativeHost; llmCall: LlmCall; mediaStore; log })`;
    `games-handlers.ts` and `game-mcp.ts` are thin adapters. Main logs one line per run and per agent turn
    (`game run <gameId> run=<runId> stopped|crashed:<reason> ms=<n>`, `game turn <gameId> agent=<id> files=<n> commit=<sha|none>`).

## B — The sandboxed runner (L)

AI-written JavaScript runs isolated from `window.midniteStudio`. It is never in an iframe in the main
renderer, because that shares a process with the bridge.

- [x] `main/games/game-runner.ts`, modelled on `apps-service.ts`:
  - a `WebContentsView` with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` and **no preload**
  - a **non-persistent** partition `game-<id>`, so each run starts with clean storage; a per-game "keep save data" toggle switches it to `persist:game-<id>`
  - `createGameRunner({ getWindow, log })` → `{ run(game): Promise<GitOpResult<{ runId }>>, stop(gameId), reload(gameId), setBounds(gameId, bounds), setVisible(gameId, visible), view(gameId) }`.
    One running view per game; `run` on a running game restarts it. At most `GAMES_MAX_RUNNING = 3`
    concurrent runs; a fourth is refused with _"Stop a running game first (3 are running)."_
  - `webPreferences` also set `webSecurity: true`, `allowRunningInsecureContent: false`,
    `webviewTag: false`, `experimentalFeatures: false`, `backgroundThrottling: true`, so the view passes
    Phase 91 Theme E's `web-preferences.test.ts` table unchanged.
  - **Resolved: partition per run, not per game** (Decision 3, closes the original open): the default
    partition is `game-<gameId>-<runId>` (no `persist:` prefix → in-memory, and a new `runId` per run
    means Restart truly starts clean); `keepSaveData: true` in the manifest uses `persist:game-<gameId>`.
- [x] Custom scheme `mstudio-game://<id>/` registered **only on that partition's session**, serving files from that repo only, with media-store-style guards (reject `..`, symlinks at any segment and dotfiles under `.git`) and correct MIME types including `.wasm`
  - Registration: `registerMgitFileScheme()` becomes `registerPrivilegedSchemes()` and registers both
    schemes in one `protocol.registerSchemesAsPrivileged` call — `mstudio-game` with
    `{ standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }`
    (standard so the game has a real origin `mstudio-game://<gameId>` for ES modules and `localStorage`)
    — because Electron keeps only the last call's list. The handler is installed per run with
    `ses.protocol.handle('mstudio-game', handler)` on the run's session only; the default session never
    handles it.
  - `gameProtocolHandler(root, gameId)` in `main/games/game-protocol.ts`: host must equal `gameId` (else
    404); path decoded and resolved with `confineToRoot(root, rel)`; every segment `lstat`-checked — a
    symlink anywhere → 404; any segment starting with `.` → 404 (covers `.git`, `.env`); a directory →
    `index.html` inside it. Bytes via `net.fetch(pathToFileURL(target), { bypassCustomProtocolHandlers: true })`.
    `GAME_MIME_BY_EXT` adds `.wasm → application/wasm`, `.mjs/.js → text/javascript`, `.glb → model/gltf-binary`,
    `.json`, `.tmj/.tsj → application/json`, `.png`, `.jpg`, `.webp`, `.ogg`, `.mp3`, `.wav`.
- [x] **CSP** injected on every response: `default-src 'self' mstudio-game:`, `script-src` allowing `'wasm-unsafe-eval'` for Rapier, and no remote origins. With `network: on`, `connect-src` and `img-src` open to https only. `session.webRequest` blocks everything else
  - **Resolved: the CSP header is set by the protocol handler on every `Response`** (Decision 6) —
    `webRequest.onHeadersReceived` does not reliably see custom-protocol responses.
    `gameCsp(network)` in `game-protocol.ts`: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`,
    with `network: 'on'` appending `https:` to `connect-src`, `img-src` and `media-src`.
    `X-Content-Type-Options: nosniff` on every response.
  - `ses.webRequest.onBeforeRequest`: cancel every URL whose scheme is not `mstudio-game:`, `data:`,
    `blob:` or `devtools:` — plus `https:` when `network: 'on'`. `http:` is always cancelled.
- [x] Policy:
  - navigation locked to the game's origin
  - `window.open` denied
  - permissions denied except fullscreen, pointer lock, gamepad and audio autoplay
  - downloads denied
  - DevTools available (a game is a dev artefact) but only from the runner toolbar
  - `will-navigate`/`will-redirect`: `preventDefault()` unless the URL's origin is `mstudio-game://<gameId>`;
    `setWindowOpenHandler` → `{ action: 'deny' }` (no `openExternal`, unlike apps — a game must not open
    the user's browser); `will-download` → `cancelDownload`.
  - Permissions: `setPermissionRequestHandler`/`setPermissionCheckHandler` allow exactly
    `fullscreen`, `pointerLock`, `keyboardLock` and `media` with `mediaTypes: []` (autoplay), deny
    everything else; Gamepad needs no permission in Chromium. Device handlers (`setDevicePermissionHandler`)
    deny all, matching Phase 91 Theme E's `denyAllDevices`.
  - `before-input-event`: DevTools chords (`Mod+Alt+I`, `F12`) are swallowed; DevTools opens only via the
    toolbar's `openDevTools({ mode: 'detach' })`.
- [x] **Console and error capture without a preload**: `webContents` `console-message`, plus a `webContents.debugger` attach for `Runtime.exceptionThrown`, `unhandledrejection` and `render-process-gone`. Kept in a capped ring buffer per run, and shown in a console drawer under the viewport
  - `GameLogEntry = { seq: number, at: number, level: 'log' | 'info' | 'warn' | 'error' | 'exception' | 'crash', text: string (≤ 4 KB, truncated with "…"), source?: string, line?: number }`.
    `console-message` maps Chromium levels; `debugger.attach('1.3')` + `Runtime.enable` turns
    `Runtime.exceptionThrown` (which covers uncaught errors and unhandled rejections) into `exception`
    entries with the stack's first frame; `render-process-gone` → a `crash` entry with `details.reason`
    and run state `crashed`. If `debugger.attach` throws (DevTools already open), capture falls back to
    `console-message` only and logs one `warn` entry saying so.
  - Ring buffer `GAME_LOG_CAPACITY = 2000` entries per run (`ring-buffer.ts`); `seq` is monotonic so
    `game_logs({ since })` is a cursor. Entries reach the renderer batched every 250 ms on `gamesConsole`.
  - Drawer `GameConsoleDrawer`: level filter chips, a **Clear** button (clears the view, not the buffer),
    auto-scroll unless the user scrolled up, `role="log"` with `aria-live="polite"` for errors only.
- [x] **Hot reload**: a watcher on the repo (excluding `.git`, `vendor/` and `node_modules`), debounced, reloads the view. A manual Reload, Restart (new partition) and Stop
  - `fs.watch(root, { recursive: true })` (macOS supports recursive), events under `.git/`, `vendor/`,
    `node_modules/`, `playtests/results/` ignored; debounced 200 ms; reload = `webContents.reloadIgnoringCache()`.
    A burst of agent writes therefore reloads once. The watcher closes on Stop.
  - Reload keeps the partition; Restart = stop + run (new `runId`, new partition); Stop destroys the view.
- [x] Runner toolbar: play/pause (with the kit's hook, E/F), restart, a resolution preset (16:9 at 720p/1080p, or fit), mute, an fps/frame-time overlay, a DevTools toggle, and **Pop out** into its own window (Phase 55 detachable panels)
  - **Partly landed (Phase 107 A + B PR):** play/pause (kit hook), restart, stop, resolution, mute, overlay and DevTools shipped; **Pop out** (the `game` window role and `reparentGameView`) is still open.
  - `GameRunnerToolbar` (`game-runner-toolbar.tsx`), `IconButton`s with tooltips: Play/Pause (`LuPlay`/`LuPause`;
    calls `__midnite.pause()`/`resume()` via `executeJavaScript`; disabled with _"This game has no pause
    hook."_ when the hook is missing), Restart (`LuRotateCcw`), Stop (`LuSquare`), Resolution select
    (`Fit` · `1280×720` · `1920×1080`; fixed sizes letterbox inside the centre column), Mute
    (`webContents.setAudioMuted`), Overlay (`LuGauge`; the kit draws fps/frame time when
    `__midnite.setOverlay(true)` exists), DevTools (`LuBug`), Pop out (`LuExternalLink`).
  - Pop out: a new window role `'game'` in `PANEL_WINDOW_ROLES`; `window-handlers.ts` calls
    `reparentGameView(gameId, nextWindow)` (the `reparentAppView` shape). Closing the popped window docks
    the view back.
  - Bounds: the centre column's `ResizeObserver` sends `gamesSetBounds` (CSS px; main scales by the zoom
    factor as `setAppBounds` does).
  - Empty / loading / error in the centre: no game selected → _"Pick a game, or create one."_; selected
    but stopped → a **Run** button; starting → `Spinner` _"Starting…"_; crashed → _"The game crashed
    (<reason>). See the console."_ with **Restart**.
- [x] The view is hidden and throttled when the tab is hidden or the window is blurred (Phase 84 visibility gates). A stopped game holds no renderer process
  - The renderer sends `gamesSetVisible(gameId, false)` when the Games tab unmounts or `usePageVisible()`
    is false; main calls `view.setVisible(false)` and `webContents.setBackgroundThrottling(true)`. On
    window blur the view stays visible but throttled. Stop calls `webContents.close()` and drops the view,
    so no renderer process remains (asserted via `webContents.getAllWebContents()` in the e2e).
- [ ] Vitest (desktop, with fakes for `WebContentsView` and session): the scheme refuses traversal, symlinks and `.git`; the CSP header is present on every response; network is blocked when off; and the ring buffer is capped. An e2e boots a starter and reads its console, naming "real Chromium process and canvas" in the spec header
  - **Partly landed:** all the vitest halves shipped; the real-Chromium `game-runner.spec.ts` e2e is deferred to Theme Q (it needs a starter that boots an engine).
  - `desktop/src/main/games/game-protocol.test.ts` (temp dir fixture: `../x`, `%2e%2e/x`, a symlinked
    file, `.git/config`, `.env` → 404; wrong host → 404; `.wasm` MIME; CSP and `nosniff` on 200 and 404);
    `game-runner.test.ts` (fake view/session: partition names per run and with `keepSaveData`;
    `onBeforeRequest` cancels `https://x` when off, allows when on, always cancels `http://`; permission
    handler allows the four and denies `geolocation`; a 4th run refused; `webPreferences` table);
    `ring-buffer.test.ts` (capacity 2000, `since` cursor).
  - `packages/app/e2e/game-runner.spec.ts` (header: "real Chromium process and canvas"): runs the
    `platformer` base and reads a `console.log('midnite-ready')` the kit prints at boot.
- [x] Privileged-scheme registration covers both schemes and is tested
  - `desktop/src/main/fs-protocol.test.ts` (existing, extended): `registerPrivilegedSchemes()` makes one
    `registerSchemesAsPrivileged` call containing `mstudio-file` and `mstudio-game` with the privileges above.

## C — No-build runtime, vendored engines and kit versions (M)

- [x] Each repo's `index.html` loads `src/main.js` as an ES module through an **import map** pointing at `vendor/` (`phaser`, `three`, `three/addons/`, `@dimforge/rapier3d-compat`) and `kit/`
  - `templates/media-game/common/index.html` holds `<script type="importmap">` with exactly:
    `phaser → ./vendor/phaser/phaser.esm.js`, `three → ./vendor/three/three.module.js`,
    `three/addons/ → ./vendor/three/addons/`, `@dimforge/rapier3d-compat → ./vendor/rapier/rapier.mjs`,
    `recast-navigation → ./vendor/recast/index.mjs`, `kit/ → ./kit/`. A 2D repo omits the three/rapier/recast
    entries; a 3D repo omits phaser (written by `composeStarter` from the engine).
- [x] Engines are app resources (`resources/game-engines/<engine>@<version>/` with their LICENSE files), copied into `vendor/` at creation. Exact versions are pinned and recorded in the manifest. Phaser's major version (v3 or v4) is decided and recorded here; verify each engine's licence and record it in `docs/`
  - **Resolved: Phaser 3, latest 3.x, exact-pinned** (Decision 1, closes the original open): agents
    write the code, their corpus is overwhelmingly Phaser 3, and Phase 106's formats target Phaser 3's
    `load.atlas`/`load.aseprite`/`load.tilemapTiledJSON`. Phase 106's dev-only `phaser` uses the same pin.
  - **Resolved: generated at bundle time, not committed** (Decision 7). Exact-pinned devDependencies of
    `packages/desktop` — `phaser`, `three` (the same version as `packages/app`'s), `@dimforge/rapier3d-compat`,
    `@recast-navigation/core` + `@recast-navigation/three` — are copied by a new
    `scripts/vendor-game-engines.mjs` into `packages/desktop/resources/game-engines/<name>@<version>/`
    (the files the import map names, their `.d.ts`, and `LICENSE`), run by `desktop:bundle`; the folder
    is git-ignored and shipped by a new `extraResources` entry (`resources/game-engines → game-engines`).
    `gameEnginesDir()` resolves `process.resourcesPath/game-engines` packaged and the generated folder in
    dev. `GAME_ENGINE_VERSIONS` (in `shared/src/media-game.ts`) is generated alongside and asserted
    against `package.json` by a vitest, so the manifest's `vendored` can never drift from what ships.
  - Licences recorded in a new `docs/MEDIA_GAMES.md` (`## Engine licences`: Phaser MIT, three MIT,
    Rapier Apache-2.0, recast-navigation-js MIT with Recast's zlib licence), checked against each
    package's `LICENSE` when pinned.
- [x] **Types without a build**: vendored `.d.ts` files plus `// @ts-check` and JSDoc in the kits and starters, and a `jsconfig.json`, so agents and editors get types with no compile step
  - `jsconfig.json` = `{ compilerOptions: { checkJs: true, module: 'esnext', moduleResolution: 'bundler', target: 'es2022', paths: { phaser: ['./vendor/phaser/types/phaser.d.ts'], three: ['./vendor/three/types/index.d.ts'], … } }, include: ['src', 'kit'] }`.
  - **Resolved: no CI typecheck of the kit** (Decision 8): types are an editor/agent aid; correctness of
    `kit/core/` is enforced by vitest, of `kit/phaser|three/` by the e2e smoke runs.
- [x] **Kit versioning**: the kit lives in the repo (`kit/`), stamped with `kitVersion`. **Upgrade kit** writes the new kit on a branch and opens it as a diff in the app; the user (or agent) merges it. The kit is never silently overwritten
  - `GAME_KIT_VERSION` (semver) in `shared/src/media-game.ts`, bumped whenever `templates/media-game/kit/`
    changes (a vitest hashes the kit tree against `kit-hash.json` and fails if the hash changed without a
    version bump). The Games tab shows **Upgrade kit to <v>** when the manifest's `kitVersion` is older.
  - `gamesKitUpgrade(gameId)`: refuses on a dirty tree (_"Commit or discard your changes first."_);
    creates branch `kit-upgrade/<v>` from HEAD via the write queue, replaces `kit/` and the engine subset
    of `vendor/`, sets `kitVersion`/`vendored`, commits `Upgrade kit to <v>`, switches back to the previous
    branch, and opens the Timeline on the new branch. Merging is the user's (or agent's) git action.
- [x] Vitest: the import map resolves every vendored entry, a fresh repo's files match the starter plus the vendor set, and an upgrade produces a branch with only `kit/` and the manifest changed
  - `desktop/src/main/games/vendor.test.ts`, `game-scaffold.test.ts` (fresh repo file list = compose
    output ∪ vendor set ∪ seeded skills), `kit-upgrade.test.ts` (on a `TempRepo`: the branch's diff
    touches only `kit/`, `vendor/` and `midnite-game.json`; dirty tree refused); `kit-hash.test.ts`.

## D — MCP plumbing: the minimum play-test loop (M)

Lands early so every later theme is built with the agent able to play.

- [x] `shared/src/media-game-mcp.ts` tool family, spread into `MCP_TOOLS`:
  - `game_list`, `game_create` (from a starter id) and `game_open`
  - `game_get_manifest` and `game_set_manifest` (zod-validated)
  - `game_run`, `game_stop` and `game_reload`
  - `game_screenshot`: one frame, or a burst of N frames at an interval, via `webContents.capturePage()`
  - `game_logs`: console and errors since a cursor
  - `game_input`: key, pointer and gamepad events with timings, sent as trusted input via `webContents.sendInputEvent()`
  - `game_state`: calls the kit's `window.__midnite.getState()` via `executeJavaScript`. The result is **untrusted data**: size-capped, parsed as JSON and validated, never evaluated
  - **Correction (x1):** entries are inline in `MCP_TOOLS`. The file holds `GAME_MCP_TOOL_IDS` (these 12,
    plus N's `game_import_asset` and O's five — 18 in all), `isGameMcpToolId`, `GAME_MCP_READ_TOOL_IDS`
    (`game_list`, `game_get_manifest`, `game_logs`, `game_screenshot`, `game_state`; every other id is a
    write and listed in `mcp.test.ts`'s `writeTools`), `GAME_SLOW_TOOL_IDS` (`game_create`, `game_run`,
    `game_screenshot`, `game_input`, `game_replay_play`, `game_playtest`, `game_import_asset`),
    `GAMES_OFF_MESSAGE = 'Game running and editing is off — Settings ▸ MCP ▸ Let agents run and edit games'`,
    and `GameToolTargetSchema = { game: z.string() /* gameId or absolute path */ }`.
  - `game_screenshot`: `{ count: 1–16 (1), intervalMs: 50–2000 (250), scale: 0.25–1 (0.5) }` → `_content`
    PNG blocks (downscaled by `scale`), refused if the game is not running (_"Run the game first."_).
  - `game_logs`: `{ since?: number, levels?: GameLogLevel[], limit: 1–500 (200) }` → `{ entries, next }`.
  - `game_input`: `{ events: ({ t: ms 0–60000, type: 'keyDown' | 'keyUp', key: string } | { t, type: 'mouseMove' | 'mouseDown' | 'mouseUp', x, y, button?: 'left' | 'right' } | { t, type: 'gamepad', button: 0–16, pressed: boolean })[] (≤ 500) }`.
    Keys/mouse go through `sendInputEvent` at their `t` offsets; **gamepad** has no OS-level injection, so it
    is delivered through the kit (`__midnite.input.gamepad(button, pressed)`) and refused with a clear
    message on a game without the hook. Returns after the last event plus 100 ms.
  - `game_state`: `executeJavaScript('(() => { try { return JSON.stringify(window.__midnite?.getState?.() ?? null) } catch (e) { return JSON.stringify({ __error: String(e) }) } })()', false)`
    with a 2 s timeout; the string is capped at `GAME_STATE_MAX_BYTES = 256 * 1024` (larger → error
    result _"getState() returned more than 256 KB."_), `JSON.parse`d, and validated with
    `GameStateSchema` (passthrough; depth ≤ 32 checked by `jsonDepth`). Cyclic objects throw inside the page
    and come back as `__error`. The value is returned as data, never evaluated.
- [x] Handlers in `main/games/game-mcp.ts`. A `main/mcp/game-tools.ts` gate behind **Settings ▸ MCP ▸ Let agents run and edit games** (default off), with `dispatch.ts` entries and slow-tool timeouts for run, screenshot bursts and input sequences
  - `allowGames` on `McpSettings` (version +1, `=== true` read), `McpSetRequest`, `setMcpAllowGames`,
    `ui-gate.ts` getters, `Accordion title="Let agents run and edit games"` + `SettingsSwitchRow id="mcp-allow-games"`
    in `mcp-page.tsx`. The help text under the switch: _"Agents can create game repos, run their code in a
    sandbox, and send input to them."_
  - Shim: `isGameSlowToolId(name) ? { timeoutMs: GAME_CALL_TIMEOUT_MS }` with `GAME_CALL_TIMEOUT_MS = 120_000`.
  - Over MCP a game is addressed by `gameId` or absolute path; a path outside `gamesRoot` and not a
    registered repo is refused (_"That folder is not a Midnite game."_).
- [x] File edits are **not** MCP tools. The agent edits the repo with its own tools, and the tools only see, play and configure
  - `game_set_manifest` is the only write to a repo file over MCP, and it validates with
    `GameManifestSchema` and refuses changes to `vendored` and `kitVersion` (those move only via C's upgrade).
- [x] Vitest: schemas derive from zod, tools are refused when the switch is off, a hostile `getState` (huge, cyclic or non-JSON) comes back as a bounded error result, and input sequences are converted to the right `sendInputEvent` calls
  - `desktop/src/main/games/game-mcp.test.ts` with a fake `webContents`: `executeJavaScript` resolving
    300 KB, `{__error}`, `'not json'`, and a 40-deep object each yield a bounded `{ ok: false }` result;
    a keyDown/keyUp pair at t=0/50 becomes two `sendInputEvent` calls in order (fake timers); every write
    tool refuses when off; `mcp.test.ts` description rule.

## E — Phaser kit and the 2D perspective presets (L)

- [x] `kit/` modules for Phaser:
  - boot and scene manager
  - input mapping (keyboard, gamepad, pointer → named actions)
  - camera follow with a deadzone, and screen shake
  - **sprite animator** that loads Phase 106 atlases and turns the `anims` section and Aseprite tags into Phaser animations, with direction-aware playback for 4 and 8 directions
  - **Tiled loader** for Phase 106 `.tmj`/`.tsj`, with a collision layer and an objects layer for spawns
  - HUD, audio (Audio tab assets), pause, and save/load to `localStorage`
  - **Resolved layout** (Decision 9): `templates/media-game/kit/core/` holds engine-free modules
    (`input-map.js`, `rng.js`, `clock.js`, `iso.js`, `raycast.js`, `anim-names.js`, `asset-index.js`,
    `hook.js`, `save.js`), importable under bare vitest; `kit/phaser/` holds the engine-bound ones
    (`boot.js`, `scenes.js`, `input.js`, `camera.js`, `animator.js`, `tiled.js`, `hud.js`, `audio.js`).
  - **Correction (x1):** Phase 106 ships animations as `anims.json` (`AnimationManager.fromJSON`), not an
    `anims` section; `animator.js` calls `this.anims.fromJSON(cache.json.get('<asset>-anims'))`, and falls
    back to `createFromAseprite` when only `atlas.json`'s `meta.frameTags` exists.
    `animName(asset, clip, facing8)` in `anim-names.js` maps a facing vector to the nearest available
    direction (`8 → 4 → 1`) and returns `<asset>/<clip>/<dir>`.
  - Tiled: `tiled.js` loads the `.tmj` with `load.tilemapTiledJSON` (tilesets embedded by Phase 106),
    sets collision from the `collision` layer's non-empty tiles, and returns the `objects` layer as
    `{ spawns, exits, points }`.
  - `input-map.js`: `createInputMap(bindings: Record<action, { keys?: string[]; gamepad?: number[]; pointer?: 'left' | 'right' }>)`
    → `{ isDown(action), justPressed(action), axis(neg, pos) }`; default bindings per preset.
  - `save.js` saves under `localStorage['midnite:<gameName>:<slot>']` (only persisted when the run's
    partition is `persist:`; the HUD says _"Saves last until Stop"_ otherwise).
- [x] **Debug hook contract** `window.__midnite`, shared with F: `getState()`, `pause()`, `step(n)`, `setSeed(n)` and `version`. Each starter fills `getState()` with what matters (player position, health, score, scene)
  - `kit/core/hook.js` `installHook(impl)` defines `window.__midnite = { version: 1, getState, pause, resume, step, setSeed, setOverlay, input: { gamepad }, replay: { load, play, stop } }`
    (O fills `replay`). `GameStateSchema` (shared) = `{ version: 1, scene: string, frame: number, time: number, player?: { position: number[] /* 2 or 3 */, health?: number }, score?: number }`
    + passthrough. The kit prints `console.log('midnite-ready')` once the first scene starts.
- [x] **Presets**, each a kit module plus a config:
  - **platformer**: arcade physics, coyote time, jump buffer, variable jump height, one-way platforms
  - **top-down**: 8-direction movement, facing
  - **isometric**: iso projection, depth sorting, tile picking under the pointer
  - **2.5D raycaster** (Doom-style): a DDA raycaster drawing walls into a Phaser texture, with textured walls from Phase 106 tiles, billboard sprites with depth, doors, and minimap. This preset has no Phaser physics
  - `kit/phaser/presets/{platformer,top-down,isometric,raycaster}.js`, each exporting
    `create<Preset>(scene, config)`; config defaults in `kit/core/preset-defaults.js`
    (platformer: coyote 100 ms, jump buffer 120 ms, gravity 1200 px/s², jump velocity −460 px/s, variable
    jump cut ×0.5; raycaster: 320×200 internal resolution scaled up, FOV 66°).
  - `iso.js`: `isoToScreen(x, y, tileW, tileH)`, `screenToIso(px, py, …)`, `isoDepth(x, y)`;
    `raycast.js`: `castRay(map, pos, dir) → { distance, side, cellX, cellY, wallX }` (DDA).
- [x] Vitest (kit logic is engine-free where possible): input mapping, iso projection and picking, raycaster DDA hits and distances, animator naming from a 106 atlas fixture. Boot and draw are covered by e2e only
  - `desktop/src/main/games/kit-core.test.ts` imports `templates/media-game/kit/core/*.js` directly:
    `screenToIso(isoToScreen(p))` round-trips; a ray down an 8-cell corridor hits at distance 7.5 ± 1e-9;
    `animName('hero', 'walk', [1, 1])` picks `se` on an 8-direction atlas fixture and `e` on a 4-direction
    one; `justPressed` fires once per press.

## F — three.js kit, physics and the camera rigs (L)

- [x] `kit/` modules for three.js:
  - a fixed-timestep game loop with interpolation
  - input mapping
  - **Rapier** world, with a kinematic character controller (slopes, steps, ground snap)
  - **glTF loader** for Models assets with Phase 103 clips, feeding an `AnimationMixer` state machine (idle, walk, run, jump, attack, hit, die) with crossfades
  - **terrain loader** for Phase 105's `terrain.manifest.json`:
    - chunks with LOD
    - a heightfield collider from the 16-bit heightfield (not the mesh)
    - instanced foliage and extruded buildings from the JSON files
    - road meshes, with the road graph exposed to game code
  - HUD as a DOM overlay, audio, and the same `window.__midnite` hook as E
  - Files: `kit/core/clock.js` (`createFixedStep(hz = 60)` → `{ advance(dtMs) → steps, alpha }`, max 5
    steps per frame), `kit/three/{loop,input,physics,character,gltf,animator,terrain,hud,audio,cameras,vehicle,nav}.js`.
  - `character.js`: Rapier `KinematicCharacterController` with `setMaxSlopeClimbAngle(45°)`,
    `enableAutostep(0.35, 0.2, true)`, `enableSnapToGround(0.3)`.
  - `animator.js`: state names `idle|walk|run|jump|attack|hit|die`, crossfade 0.15 s; clips matched by
    name case-insensitively like Phase 106's alias table.
  - `terrain.js` `loadTerrain(manifestUrl, { world, scene })`: parses with the vendored copy of
    `TerrainManifestSchema` rules (a plain-JS validator in `kit/core/terrain-manifest.js`, version 1
    only), streams `chunks/lod<n>.glb` nodes by Phase 105's `selectLod` thresholds (re-implemented in
    `kit/core/lod.js` with the same constants), builds the collider with
    `RAPIER.ColliderDesc.heightfield(res − 1, res − 1, heights, { x: worldSize, y: 1, z: worldSize })`
    from `heightfield.png` decoded by the kit's own `kit/core/png16.js` (inflate via
    `DecompressionStream('deflate')`; `createImageBitmap` would quantise to 8 bits), instances foliage
    per asset (`InstancedMesh`), extrudes `buildings.json` polygons, and exposes
    `terrain.roads` (`{ nodes, edges }`) and `terrain.heightAt(x, z)`.
- [x] **Camera rigs**:
  - **first person**: mouse-look with pointer lock, head bob, FOV setting
  - **third person, five presets** (user, 2026-10-04): **over the shoulder left**, **over the shoulder right**, **directly behind**, **further behind** and **much further behind**, cycled by one action and switchable in game
  - all third-person presets use a spring arm (raycast to avoid clipping into walls), with lock-on support for I's fighter and soulslike
  - `GAME_CAMERA_IDS = ['shoulder-left', 'shoulder-right', 'behind', 'behind-far', 'behind-very-far']`
    (shared + `kit/core/cameras.js`) with offsets `[x, y, z]` in metres from the player's head-height pivot
    (z backwards): `[-0.7, 0.2, 2.4]`, `[0.7, 0.2, 2.4]`, `[0, 0.4, 4.0]`, `[0, 1.2, 7.0]`, `[0, 3.0, 12.0]`;
    FOV 60° (first person 75°, setting 60–100). The `camera-next` action (default `C` / gamepad `9`)
    cycles them; `manifest.cameraPresets` limits the cycle.
  - Spring arm: `springArmDistance(desired, hitDistance, margin = 0.2)` in `kit/core/cameras.js`; lerps
    back out at 4 m/s. Lock-on: `chooseLockTarget(player, forward, candidates, maxDist = 20, maxAngle = 60°)`.
  - The fighter's **versus** camera (`'versus'`) is a sixth rig in `cameras.js`, outside the cycle.
- [x] A raycast **vehicle controller** on Rapier (wheels, suspension, enter and exit) for the open world and top-down-crime 3D variants
  - `vehicle.js` on `world.createVehicleController(chassis)` (Rapier's `DynamicRayCastVehicleController`),
    4 wheels; enter/exit with the `interact` action within 2.5 m of a door point.
- [x] Navigation: a navmesh via `recast-navigation-js` vendored like the engines (verify the licence in C), behind a kit module so starters that do not need it do not load it
  - `nav.js` is imported dynamically (`await import('kit/three/nav.js')`) only by starters whose
    manifest genre is `shooter`, `rpg`, `soulslike` or `open-world`; it builds a navmesh from tagged
    walkable meshes and exposes `findPath(from, to)`.
- [x] Vitest (engine-free maths): spring-arm distance under occlusion, preset offsets for each of the five cameras, fixed-timestep accumulation, and manifest parsing against a Phase 105 fixture. Rendering is covered by e2e
  - In `kit-core.test.ts`: the five offsets equal the table; `springArmDistance(4, 1.5)` is 1.3;
    `createFixedStep(60).advance(50)` gives 3 steps and alpha 0; `advance(1000)` is capped at 5;
    `terrain-manifest.js` accepts Phase 105's committed fixture manifest and rejects `version: 2`;
    `png16.js` decodes a 16-bit fixture bit-exactly (Node 22 has `DecompressionStream`).

## G — Perspective base starters (M)

> **Landed (PR #TBD).** The e2e half of the last item (`game-starters.spec.ts`) moves to Theme Q: all six bases were booted in SwiftShader Chromium (kit-vendored engines, `__midnite.step(180)` under held input) and moved as the smoke replay asserts, but a committed spec waits for Q's e2e budget raise. The replay's shape (`playtests/smoke.json`: `input`/`assert` with `equals`, `increasedFromFrame`, `decreasedFromFrame`) is Theme O's to finalise; 3D bases assert `position[2]` decreasing, because forward is -z.

One minimal, playable starter per perspective. These are the bases the genres and the gallery compose
on.

- [x] 2D: **platformer**, **top-down**, **isometric** and **2.5D raycaster**. Each has a test level, a player, one enemy or obstacle, and placeholder art
  - `templates/media-game/bases/{platformer,top-down,isometric,raycaster}/` each with `src/main.js`,
    `src/scenes/level.js`, `src/game.config.js`, `assets/` and `assets/index.json`; ids
    `GAME_PERSPECTIVES_2D = ['platformer', 'top-down', 'isometric', 'raycaster']`.
- [x] 3D: **first person** and **third person**, the latter with all five cameras. Each has a test arena, a player with animation states, and one interactable
  - `bases/{first-person,third-person}/`; ids `GAME_PERSPECTIVES_3D = ['first-person', 'third-person']`.
    The arena is a flat Rapier ground + 3 boxes + a ramp; the interactable is a door that opens on `interact`.
- [x] Placeholder art and audio are CC0 or generated in-house, with their licences recorded in the starter's `ASSETS.md`. Every starter swaps cleanly to Phase 105/106/Models assets through N
  - `ASSETS.md` is a table (`File · Source URL · Licence · Author`); a vitest asserts every file under
    `assets/` (except `index.json`) has a row. Starters reference art only through `assets/index.json`
    names (`kit/core/asset-index.js` `assetUrl(name)`), which is what makes N's swap a data change.
- [x] Each starter ships a **smoke play-test script** (an O replay) that walks it for a few seconds and checks `getState()`
  - `playtests/smoke.json` = 180 frames of `right` (2D) or `forward` (3D) input, asserting at frame 180
    that `$.player.position[0]` increased and `$.scene` is `level`.
- [x] Vitest: every starter's file set resolves every import through its import map, and its manifest validates. An e2e boots each starter and passes its smoke script
  - `desktop/src/main/games/starters.test.ts`: for each base, `composeStarter` output is scanned with a
    static import scanner (`scanImports(js)`: `import … from '…'` and `import('…')` string literals)
    and every specifier resolves via the import map to an existing file; the manifest parses; `ASSETS.md`
    covers `assets/`.
  - `packages/app/e2e/game-starters.spec.ts` (header: "real Chromium, canvas/WebGL"): one test per base
    runs `smoke.json` through `gamesPlaytest` and expects pass.

## H — 2D genre starters (L)

- [x] **FPS** (raycaster): weapon switching, hitscan and projectile weapons, enemies with sight and chase, pickups (health, ammo, keys), keyed doors, and levels from Tiled
  - `templates/media-game/genres/fps/` (systems in `src/genre/`: `weapons.js`, `enemies.js`, `pickups.js`, `doors.js`);
    the engine-free parts (`weapon-table.js`, `sight.js`) live in `kit/core/genre/fps/`.
- [x] **RTS** (StarCraft-style, top-down or isometric):
  - box and click selection, control groups
  - A* pathing on the tile grid, with flow fields for group moves
  - resource gathering, a build queue, unit production
  - fog of war, and a simple scripted AI opponent
  - Engine-free: `kit/core/genre/rts/{astar.js,flow-field.js,selection.js,economy.js,fog.js,ai.js}` —
    `astar(grid, from, to)` (8-neighbour, octile heuristic), `flowField(grid, goal)`,
    `selectInBox(units, rect)`, `fogUpdate(visibility, units, radius)`.
- [x] **ARPG** (Diablo-style, isometric): click-to-move, a skills hotbar, health and mana, loot tables with rarity, inventory and equipment, and a procedural dungeon of connected rooms
  - Engine-free: `kit/core/genre/arpg/{loot.js,inventory.js,dungeon.js}` — `rollLoot(table, rng)`
    (rarities common/magic/rare/unique at 70/22/7/1 %), `generateDungeon(seed, rooms = 12)` returns rooms +
    corridors guaranteed connected.
- [x] **Top-down crime** (original GTA): enter and exit vehicles, top-down car handling, pedestrians on paths, a wanted level with pursuing police, and a city from a Tiled map
  - Engine-free: `kit/core/genre/crime/{wanted.js,car2d.js}` — `wantedReducer(state, event)` (levels
    0–5; crimes raise, 30 s unseen decays one level), `car2dStep(state, input, dt)`. J's open world imports
    the same `wanted.js`.
- [x] Vitest for the engine-free systems: A* and flow fields, loot rolls with a seed, the wanted-level state machine, and RTS selection maths. An e2e smoke run per starter
  - `desktop/src/main/games/kit-genres.test.ts` (A* finds the known shortest path on a fixture grid and
    returns `null` when walled; the flow field points downhill everywhere; 10 000 loot rolls with seed 1
    land within ±1 % of the rarity weights; wanted 3 decays to 2 after 30 s unseen); the e2e
    `game-starters.spec.ts` adds one smoke run per genre starter.

## I — 3D genre starters, part one: shooter, fighter, soulslike (L)

> **Landed (PR #TBD).** As with H, the per-starter e2e smoke run waits for Theme O's replay runner and Theme Q's budget raise: each starter ships a provisional `playtests/smoke.json` (genre state under `$.shooter`, `$.fighter`, `$.souls`; 3D forward is -z) and was driven by hand in SwiftShader Chromium. Differences from the plan: the soulslike's engine-free folder is `kit/core/genre/soulslike/` (the genre id), not `souls/`; the versus camera keeps Theme F's framing (`max(4, 0.9 × separation + 2)`), not `max(4, 1.2 × separation)`; the engine-free tests live in `kit-genres-3d.test.ts`.

- [x] **Shooter**: first- and third-person (camera presets switchable), hitscan and projectile weapons, recoil and spread, ammo and reload, AI enemies on the navmesh with cover-lite (seek line-of-sight breakers), and damage numbers
  - `genres/shooter/`; engine-free `kit/core/genre/shooter/{weapons.js,spread.js,cover.js}`
    (`spreadCone(base, recoil, moving)`; `pickCover(enemy, player, coverPoints)` = nearest point with no
    line of sight to the player).
- [x] **Fighter** (Tekken-style): two fighters on a 3D lane with sidestep, a dedicated **versus camera** (it frames both fighters; neither first nor third person), move lists with frame data (startup, active, recovery), hit and hurt boxes, combos and juggles, blocking, a round and timer system, and a CPU opponent
  - `genres/fighter/`; engine-free `kit/core/genre/fighter/{frame-data.js,hitboxes.js,rounds.js,cpu.js}`;
    a move is `{ name, input, startup, active, recovery, damage, onHit, onBlock, launcher? }` at 60 fps;
    the versus camera frames the midpoint at a distance `max(4, 1.2 × separation)`.
- [x] **Soulslike**: stamina, lock-on, dodge roll with invulnerability frames, light and heavy attacks, checkpoint bonfires (respawn and reset enemies), and a boss with a phase-based pattern
  - Engine-free `kit/core/genre/souls/{stamina.js,boss.js}`: stamina max 100, regen 25/s after 0.8 s,
    roll 20 with i-frames 0.1–0.4 s, light 15, heavy 30; `bossPhase(hpFraction)` switches at 0.66 and 0.33.
- [x] Vitest for engine-free systems: frame-data timing, the stamina economy, the lock-on target choice, and boss phase transitions. An e2e smoke run per starter
  - In `kit-genres.test.ts`: a 10/3/15 move is active exactly on frames 10–12; stamina never goes
    negative and regen waits 0.8 s; `chooseLockTarget` picks the nearest within the cone; boss phases flip
    at 66 % and 33 %.

## J — 3D genre starters, part two: RPG, character action, open world (L)

> **Landed (PR #755).** As with H and I, the per-starter e2e smoke run waits for Theme O's replay runner and Theme Q's budget raise: each starter ships a provisional `playtests/smoke.json` (genre state under `$.rpg`, `$.action`, `$.openWorld`; 3D forward is -z), and all five passed it in SwiftShader Chromium. Differences from the plan: the engine-free folders are the genre ids (`kit/core/genre/character-action/`, `kit/core/genre/open-world/`), not `action/` and `openworld/`, so `composeStarter` copies them with no `genre.json`; the RPG's inventory is the ARPG's `inventory.js` (declared in `genre.json`) rather than a fourth RPG module, and its data is `quests.json`, `dialogue.json` and `npcs.json`; the fixture pack is 512 m and ships LODs 1-3 only to stay under 2 MB; the tests live in `kit-genres-3d.test.ts`.

- [x] **RPG**: quests (a data-driven quest log), dialogue trees from JSON, stats and levelling, inventory and equipment, NPCs with schedules, and an optional first-person camera
  - Engine-free `kit/core/genre/rpg/{quests.js,dialogue.js,stats.js,schedule.js}`; quests and dialogue
    are JSON under `src/data/` with plain-JS validators.
- [x] **Character action** (Devil May Cry-style): combo strings with cancel windows, launchers and air combos, a style meter, and enemy waves in arenas
  - Engine-free `kit/core/genre/action/{combos.js,style.js}`: `comboStep(state, input, frame)` honours
    cancel windows; style ranks D→SSS by decaying score.
- [x] **Open world** (GTA-style), **last**:
  - a Phase 105 terrain with streaming chunks
  - traffic and pedestrians routed on Phase 105's road graph
  - F's vehicles, with enter and exit
  - day/night cycle and a minimap from the land-cover map
  - a wanted level shared with H's top-down crime systems where the logic is engine-free
  - `genres/open-world/` ships `assets/terrain/fixture.terrain/` (a 257² Phase 105 pack built from the
    noise preset with a plus-shaped roads mask, committed, < 2 MB) so it runs before a user imports a real
    terrain. Engine-free `kit/core/genre/openworld/{route.js,traffic.js}`: `routeOnRoads(roads, from, to)`
    (Dijkstra over `roads.json` edges by `lengthM`), `trafficSpawn(edges, density, rng)`. Minimap reads
    `maps.landcover` with `landcoverLegend` colours.
- [x] Vitest for engine-free systems: quest state, dialogue graph traversal, cancel windows, and road-graph routing. An e2e smoke run per starter (open world against a small fixture terrain)
  - In `kit-genres.test.ts`: a quest advances only on its listed events; dialogue reaches every end node
    from the root; an attack cancelled inside its window chains, outside does not; `routeOnRoads` on the
    plus fixture goes through the 4-way node.

## K — Template gallery: the perspective × genre matrix (M)

> **Landed (PR #TBD).** Genre cells ship as *not available yet* until Themes H-J add `templates/media-game/genres/<genre>/` and list the genre in `GAME_GENRES_AVAILABLE`; `composeStarter` and the gallery pick it up with no further change. Differences from the plan: the genre id stays `crime` (shipped in Theme A's `GAME_GENRES`), not `topdown-crime`; cells show a per-perspective glyph rather than a PNG, so `gamesThumbnail` was not added; the e2e for `rts@isometric` / `rpg@first-person` waits on H/J and Theme Q.

Every valid combination instantiates and runs, composed from the kits rather than copied.

- [x] A **validity table** in `shared/src/media-game-templates.ts` (recommended; adjust in this theme):

  | Genre | Native perspective | Also offered |
  |---|---|---|
  | FPS (2D) | raycaster | — |
  | RTS | top-down | isometric |
  | ARPG | isometric | top-down |
  | Top-down crime | top-down | isometric |
  | Shooter (3D) | first person | third person (all five cameras) |
  | Fighter | versus camera | — |
  | Soulslike | third person | — |
  | RPG | third person | first person |
  | Character action | third person | — |
  | Open world | third person | first person |

  Platformer is a perspective base (G) with no genre pairing in this phase
  - **Resolved: the table stands as written** (Decision 2, closes the original open). Encoded as
    `GAME_TEMPLATE_MATRIX: Record<GameGenre, { dimension: '2d' | '3d'; native: GamePerspective | 'versus'; also: GamePerspective[]; pitch: string }>`
    with `GAME_GENRES_2D = ['fps', 'rts', 'arpg', 'topdown-crime']` and
    `GAME_GENRES_3D = ['shooter', 'fighter', 'soulslike', 'rpg', 'character-action', 'open-world']`.
    The fighter's base is `third-person` with camera `'versus'` forced.
  - `starterId(perspective, genre | null)` = `perspective` or `${genre}@${perspective}`;
    `isValidStarter(id): { ok: true } | { ok: false; reason: string }` with reasons like
    _"Fighters use the versus camera only."_ and _"The FPS genre needs the raycaster."_
- [x] **Composition**: a combination is the perspective base (G) plus the genre's systems module (H/I/J) plus a preset config. It is generated at creation from the kit and genre modules, so there is one copy of each system and no per-combination fork
  - `composeStarter(id, dest): Promise<GitOpResult<{ files: string[] }>>` in `main/games/compose.ts`:
    copy `common/` → `kit/core/` + `kit/<engine>/` (and `kit/core/genre/<genre>/` only) → `bases/<perspective>/`
    → `genres/<genre>/` (genre files win on conflict, except `src/main.js`, which the genre extends via
    `src/genre/index.js` imported by the base) → write `src/game.config.js` (`export default { perspective, genre, cameras }`)
    and `index.html`'s import map for the engine. A genre that declares `requires: ['nav']` gets `kit/three/nav.js`.
- [x] **Gallery UI** in the create panel: a 2D/3D toggle, perspective and genre grids, invalid cells disabled with the reason, a thumbnail and one-line pitch per cell, and the camera preset picker for third person
  - `GameGallery` (`game-gallery.tsx`): a 2D/3D segmented control, then a grid with genres as rows and
    perspectives as columns plus a "No genre" row (the bases). Each cell is a `button` with the pitch and a
    thumbnail from `templates/media-game/thumbnails/<starterId>.png` (served to the renderer through a new
    `gamesThumbnail(starterId)` channel returning base64; invalid cells have `aria-disabled` and the reason
    as tooltip). Arrow keys move between cells (grid roving tabindex), Enter picks. Third-person cells show
    the five camera checkboxes (all on).
- [x] Vitest: every valid cell composes to a file set whose imports resolve and whose manifest validates, and invalid cells are refused with the reason. An e2e boots one non-native combination per dimension (for example isometric RTS, first-person RPG)
  - `desktop/src/main/games/compose.test.ts` loops over every valid id (import scan + manifest parse) and
    over `fighter@first-person`, `fps@top-down` (refused with their reasons);
    `shared/src/media-game-templates.test.ts` (table shape); e2e `game-starters.spec.ts` adds
    `rts@isometric` and `rpg@first-person`.

## L — Genre recipe skills and the build skill (M)

- [x] `midnite-media-game-build`: orients an agent in a game repo. It covers:
  - the manifest and kit API
  - the debug hook contract
  - the play-test loop (run → screenshot → logs → input → state, then fix)
  - the asset bridge
  - the rules: extend the kit rather than rewrite it, keep `getState()` truthful, never touch `vendor/`
  - Also: load assets only through `assetUrl(name)` (single-file export depends on it, P), keep
    `src/` free of network calls unless `network: 'on'`, and write a `playtests/*.json` for every bug fixed.
- [x] One **recipe skill per genre** (10): `midnite-media-game-<genre>`. Each covers the systems that genre needs, their file layout in the kit's terms, tuning values that feel right (jump arcs, stamina costs, frame data, RTS supply curves), and a play-test checklist. These are what lets an agent build a combination no starter covers, or deepen one that exists
  - Names use the genre ids: `midnite-media-game-fps`, `-rts`, `-arpg`, `-topdown-crime`, `-shooter`,
    `-fighter`, `-soulslike`, `-rpg`, `-character-action`, `-open-world`. Tuning numbers quoted in a skill
    must equal the kit defaults (a vitest greps each skill for the constants it names and compares).
- [x] Skills ship in `templates/media-game/` and are seeded into each repo's `.claude/`, `.agents/` and `.codex/` at creation (the `main/video/scaffold.ts` pattern), and mirrored into the app repo's skill dirs for agents working outside a game repo
  - Source of truth: `templates/media-game/skills/<name>/SKILL.md`; seeding copies to the game repo's
    `.claude/skills/`, `.agents/skills/`, `.codex/skills/`. The app repo mirrors **only**
    `midnite-media-game-build` (six copies, added to `scripts/skill-copies.test.mjs`) — the ten recipes stay
    game-repo-only so the app repo's skill list does not grow by ten (Decision 10).
- [x] Vitest: every skill's front matter parses, every tool a skill names exists in `MCP_TOOLS`, and seeding writes all three copies
  - `desktop/src/main/games/skills.test.ts`: front matter has `name` = folder and a `description`; every
    `game_[a-z_]+` token in a skill is an `isGameMcpToolId`; seeding a temp repo writes 33 files
    (11 × 3).

## M — Create and iterate: agents, Ollama and commit-per-turn history (M)

- [x] Create and iterate panel: a prompt, the gallery (K) when creating, an engine picker (roster agents or Ollama), and a refinement-pass budget (the Models 1–100 slider pattern)
  - `GameIteratePanel` (`game-iterate-panel.tsx`): `PromptTextarea`; an engine select (roster agents from
    the agents list, then Ollama models); **Passes** `<input type="range" min={1} max={GAME_PASSES_MAX = 20}>`
    (aria-label "Refinement passes", the `model-panel.tsx` pattern; 20 not 100 because each pass is a full
    CLI run in a repo); **Run** / **Cancel**.
- [x] **Ollama is allowed, with a warning** (user, 2026-10-04). Selecting an Ollama engine shows a non-blocking banner: _"Local models struggle to write whole games. Expect better results from small, focused edits; an agent engine is recommended for creating games."_ The same warning appears in the `game_create` result when an Ollama engine is named over MCP
  - `GAMES_OLLAMA_WARNING` (shared) holds the sentence; the banner is `role="status"`, amber, dismissible
    per session. `game_create`'s output carries `warnings: string[]`.
- [x] Agent runs execute **in the game repo** via `runAgent`, with the private MCP socket from `iterative-host.ts` exposing D and O's tools, so the agent plays the game it is editing. Progress streams into an edit thread (the `video-edit-thread.tsx` pattern)
  - **Correction (x1):** there is no `runAgent` in `iterative-host.ts`; the reusable pieces are
    `createIterativeHost()` and the `runIterative` loop shape. New `main/games/game-agent.ts`
    `runGameAgent(opts: { host: IterativeHost; agentId; modelArgs; prompt; game: GameRef; passes; signal; onProgress })`:
    `host.startServer({ dispatch })` with a dispatch scoped to `GAME_MCP_TOOL_IDS` minus `game_create` and
    `game_open`, fixed to this `gameId`; `host.runCli({ cwd: gamePath, … })` once per pass.
  - **Resolved: the agent gets file tools but no shell** (Decision 11). Claude Code:
    `--allowedTools Read,Edit,Write,Glob,Grep,<mcp__midnite__game_*>` + `--strict-mcp-config`; Codex:
    `--sandbox workspace-write` with network off. A shell would let AI-written code run outside the
    sandboxed runner.
  - Edit thread: `GameEditThread` reuses `VideoEditThread`'s message list presentation
    (`app/features/media/video/video-edit-thread.tsx`) fed by `gamesAgentProgress`
    (`{ pass, of, action?, commit?: { sha, files } }`); limits per run: `MODEL_ITERATIVE_MAX_CALLS` tool
    calls and `MODEL_ITERATIVE_TIMEOUT_MS` per pass.
- [x] **Commit per turn**: each agent turn that changed files is committed through the write queue with a generated message, so the Timeline shows the game's history and **Undo turn** is a revert. Only the scaffold commit is automatic outside agent turns
  - **Resolved: on by default; a turn is one pass** (Decision 4, closes the original open). After each
    pass: `getStatus` → if anything changed, `stagePaths(path, ['.'])` + `commit({ message: 'agent: <first 60 chars of prompt> (pass n/N)' })`
    via the write queue (no attribution trailers). With `squashRunCommits` (Settings ▸ Media ▸ Games, default
    off) the run's commits are squashed at the end with `reset --soft <runStartSha>` + one commit.
  - **Undo turn**: a new git-engine `revertCommit(worktreePath, sha): Promise<GitOpResult>`
    (`commands/revert.ts`, `revert --no-edit --end-of-options <sha>` in the write queue; conflicts →
    `conflict('revert', files)`). Offered on the last agent commit only; a conflict renders the standard
    conflict envelope.
- [x] Ollama runs (no CLI to edit files) receive the relevant files and return whole-file replacements in a fenced, zod-validated envelope that main applies. They are limited to files under `src/` and refused for `kit/` and `vendor/`
  - Context: `src/**/*.js` plus `midnite-game.json`, up to 60 KB total (largest files truncated with a
    marker). `createLlmCall({ json: true })`; `GameOllamaEnvelopeSchema = { files: { path: string, content: string }[] (≤ 10, each ≤ 200 KB), summary: string }`.
    A path not matching `^src/[^\0]+\.(js|json)$` after normalisation, or containing `..`, refuses the
    whole envelope (_"The model tried to edit <path>; only files under src/ can be changed."_).
- [x] Vitest: an Ollama envelope outside `src/` is refused, commit-per-turn creates one commit per changing turn and none for a no-op turn, and the warning appears for Ollama engines in UI and MCP
  - `desktop/src/main/games/game-agent.test.ts` (stub `IterativeHost` on a `TempRepo`: 3 passes, one
    no-op → 2 commits; squash → 1; `kit/x.js` and `../x` envelopes refused);
    `git-engine/src/commands/revert.test.ts`; `app/src/features/media/game/game-iterate-panel.test.tsx`
    (banner on Ollama).

## N — Asset bridge (M)

- [ ] **Import from** Terrain (a Phase 105 manifest folder), Sprites (Phase 106 atlases, tilesets, maps, backgrounds), Models (`.glb` with clips), Images (PNG/JPEG/WebP) and Audio. Pick from a media picker, or over MCP with `game_import_asset`
  - `GameAssetPicker` lists sources by tab from the *selected repo's* media (Terrain, Sprites, Models,
    Images, Audio) and, for Terrain/Sprites, also accepts a pack folder via `repos.pickDirectory()`.
    Terrain/Sprites import their **export** (the pack is produced on the fly through
    `media.terrain.export`/`media.sprite.export` into a temp dir). `game_import_asset` takes
    `{ game, source: { tab, repoPath, path } | { packPath }, name? }`, with `repoPath`/`packPath` confined to
    registered repos or `gamesRoot`.
- [ ] Imports are **copies** into `assets/<kind>/`, never links, so a game repo is self-contained and exportable. Provenance (source tab, path, hash, time) is recorded in the manifest
  - Destination `assets/<kind>/<name>/` (folders) or `assets/<kind>/<name>.<ext>` (single files);
    `sha256` is of the file, or of the sorted `path\0sha256\n` list for a folder. A name collision gets
    `-2`, `-3`… suffixes.
- [ ] **Re-sync**: when a source's hash changes, the Games tab offers to re-import. It never overwrites silently, and a re-import is its own commit
  - On tab focus and on `media:changed`, `gamesResync({ gameId, check: true })` recomputes source hashes
    and the explorer badges the game _"2 assets changed"_; **Re-import** replaces those copies and commits
    `assets: re-import <names>`. A missing source is reported, never deleted from the game.
- [ ] Kit wiring per kind: the E animator and Tiled loader, F's glTF and terrain loaders. Imported assets are registered in `assets/index.json`, which the kits read, so the agent references assets by name
  - `GameAssetIndexSchema = { version: 1, assets: { name, kind, path, entry?: string /* atlas.json, map.tmj, terrain.manifest.json, … */ }[] }`;
    each import also commits (`assets: import <name>`).
- [ ] Vitest: imports copy and record provenance, a changed source is detected, the asset index is valid, and importing a Phase 105 or 106 fixture yields files the kit loaders accept
  - `desktop/src/main/games/asset-bridge.test.ts` (copy not symlink; provenance hash; touch source →
    flagged; index parses; the 105 fixture pack passes `kit/core/terrain-manifest.js`; a 106 fixture
    `anims.json` keys resolve through `animName`).

## O — Play-test depth: determinism, input replays and frame assertions (L)

- [ ] **Deterministic mode** (manifest `deterministic: true`): the kit seeds all randomness from `setSeed`, runs on a fixed timestep driven by a virtual clock, and patches `Math.random`/`performance.now` inside the kit's loop. The same seed plus the same inputs gives the same `getState()` trace
  - **Resolved: global patches at boot when deterministic** (Decision 12): `kit/core/determinism.js`
    replaces `Math.random` with the seeded `rng.js` mulberry32 and `performance.now`/`Date.now` with the
    virtual clock before any game module runs (the import map loads `kit/core/determinism.js` first from
    `index.html` when `deterministic`). The loop advances the virtual clock by exactly `1000/60` ms per step
    and ignores wall time. Not deterministic: physics engines' own SIMD paths across machines (stated in the
    skill; Rapier's `-compat` build is deterministic on one machine).
- [ ] **Input replays**: a `.replay.json` format (frame-indexed actions, not wall-clock). `game_replay_record` records a human playthrough in the runner, and `game_replay_play` plays one back at 1× or as fast as possible
  - `GameReplaySchema = { version: 1, seed: number, frames: number, events: { f: number, action: string, down: boolean }[] }`
    (kit action names, not keys). Played through the kit (`__midnite.replay.play(replay, { speed: 1 | 'max' })`),
    not `sendInputEvent`, so playback is frame-exact. Recording: `__midnite.replay.record()` /
    `stop()` returns the JSON; `game_replay_record({ action: 'start' | 'stop', name })` writes
    `playtests/replays/<name>.replay.json` on stop. A game without the hook refuses both tools.
- [ ] **Assertions**:
  - `game_assert_state`: a JSON-path expectation on `getState()` at frame N
  - `game_assert_frame`: compare a frame at N with a stored baseline, with a tolerance and a returned diff image
  - JSON path is a restricted subset (`$`, `.key`, `[n]`) implemented in `shared/src/game/json-path.ts`
    (no filters, no eval); ops `eq`, `ne`, `lt`, `gt`, `exists`, `approx` (± `epsilon`).
  - Frame diff: `shared/src/game/frame-diff.ts` `diffFrames(a, b, { threshold = 16 }) → { changedFraction, diff: RgbaImage }`
    (a pixel differs if any channel differs by > threshold); pass if `changedFraction ≤ tolerance`
    (default 0.01). Baselines at `playtests/baselines/<name>@<frame>.png`; a missing baseline is written
    and the assertion reports `baseline-created` (not pass/fail).
- [ ] **Play-test scripts** in the repo (`playtests/*.json`): a replay plus assertions, runnable from the runner toolbar and over MCP as `game_playtest`. Results are a pass/fail list with screenshots of failures
  - `GamePlaytestSchema = { version: 1, name, replay: string /* path */ | GameReplay, asserts: ({ frame, kind: 'state', path, op, value?, epsilon? } | { frame, kind: 'frame', baseline?, tolerance? })[] }`.
    Runs force deterministic mode for the run. Results in `playtests/results/<name>.json` (git-ignored by
    the template's `.gitignore`) and returned: `{ passed, results: { assertIndex, ok, message, screenshot? }[] }`.
  - Toolbar: a **Playtests** menu listing `playtests/*.json`, **Run all**, and a results popover.
- [ ] Vitest: replay serialisation round-trips, frame-indexed playback is independent of wall time (fake timers), state assertions evaluate JSON paths, and the frame diff reports a known changed region. An e2e: a deterministic starter replays to an identical state trace twice
  - `shared/src/game/json-path.test.ts`, `frame-diff.test.ts` (a 10×10 changed square in 100×100 →
    0.01); `kit-core.test.ts` (`replay` playback with a fake clock produces the same event frames at
    1× and max); e2e `game-playtest.spec.ts` (header: "real Chromium, canvas"): the `top-down` base,
    deterministic, plays `smoke.json` twice and the two `getState()` traces are identical.

## P — Web export (S/M)

- [ ] **Static folder** (the repo minus `.git`, `playtests/` and dev-only files), **zip** of the same, and **single-file HTML**: modules inlined in import order, assets as data URIs, Rapier's wasm base64-inlined, with a warning above a size threshold
  - Exclusions (`GAME_EXPORT_EXCLUDE`): `.git/`, `.claude/`, `.agents/`, `.codex/`, `playtests/`,
    `node_modules/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `jsconfig.json`, `**/*.d.ts`, dotfiles.
  - **Zip:** a new `main/games/zip-writer.ts` `writeZip(entries: { path; bytes }[]): Buffer` on
    `node:zlib` `deflateRawSync` + the `crc32` from Phase 105's `png-codec.ts` (local headers, central
    directory, no zip64 — exports over 4 GB are refused). Decision 13.
  - **Single file** (`main/games/single-file.ts`): **Resolved mechanism** (Decision 14) — every module
    under `src/`, `kit/`, `vendor/` reachable from `src/main.js` is collected by `scanImports`; each is
    rewritten so relative specifiers become bare `@game/<path>` specifiers; each becomes a
    `data:text/javascript;base64,…` URL; one import map maps `@game/<path>` and the engine specifiers to
    those URLs; `assets/index.json` is inlined as `window.__MIDNITE_ASSETS__` with `data:` URLs so
    `assetUrl(name)` resolves without a server. Rapier `-compat` already embeds its wasm. Size warning above
    `GAME_SINGLE_FILE_WARN_BYTES = 50 MB` (_"This file is 63 MB; browsers may be slow to open it."_).
- [ ] Export goes through `ExportToolbar`, with `MEDIA_TAB_EXPORT_FORMATS` listing `game-folder`, `game-zip` and `game-html` for the tab, and the native save dialog
  - `MEDIA_EXPORT_FORMATS` + `MEDIA_EXPORT_FORMAT_INFO`: `game-html` (`Single HTML file`, `html`),
    `game-zip` (`Zip`, `zip`), `game-folder` (`Folder`, `''`); first = default. File formats use the
    native save dialog; the folder uses `repos.pickDirectory()` and refuses an existing `<name>-web/`.
- [ ] Vitest: export excludes `.git` and playtests, the single-file HTML contains no external references, and a size warning fires above the threshold. An e2e opens a single-file export from `file://` and passes the starter's smoke script
  - `desktop/src/main/games/export.test.ts` (no excluded path in the folder or zip listing; the zip
    re-reads with the system `unzip -l` in the test; the HTML has no `src="`/`href="` to anything but
    `data:`; a 51 MB fixture warns); e2e `game-export.spec.ts` (header: "real Chromium from file://")
    opens the `platformer` export via `file://` and sees `midnite-ready`.

## Q — Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] `scripts/perf/bundle-report.mjs`: the app's entry chunk and total JS are unchanged by the engines (they are resources, not bundled). Numbers recorded here
  - `bundle-report.mjs --assert` checks `entryKb` against `scripts/perf/budgets.json` (1520); record
    before/after `entryKb` and `totalJsKb` in a `## Perf` table here. `totalJsKb` is already over its
    budget before this phase (35 405 vs 15 950) — this phase must not move it by more than the Games tab's
    own lazy chunk.
- [ ] `scripts/e2e-budget.mjs` ratchet raised deliberately for this phase's e2e specs, with each spec header naming the browser capability it needs
  - `MAX_DECLARED_E2E` (475) raised by exactly the declared tests this phase adds (runner 1, starters
    6 + 10 + 2, playtest 1, export 1, hostile 1 → +22), in the same PR as the specs.
- [ ] Security pass: a hostile fixture game (tries `window.midniteStudio`, `require`, `fetch` to a remote, `window.open`, traversal via the scheme, and top navigation) is blocked on every vector, as an e2e
  - Fixture `packages/app/e2e/fixtures/hostile-game/` whose `src/main.js` attempts each vector and logs
    `VECTOR <name> <blocked|open>`; `game-hostile.spec.ts` (header: "real Chromium sandbox and session")
    asserts every line is `blocked`, plus `fetch('mstudio-file://repo/-/x')` fails, `location = 'https://example.com'`
    leaves the URL unchanged, and `navigator.geolocation` is denied.
- [ ] Screenshots (`MSTUDIO_SHOTS=1`, Media ▸ Games): the gallery, the runner with the console drawer, the five third-person cameras, the edit thread with commit-per-turn, and the asset bridge picker
  - `packages/app/e2e/phase-107-games-shots.spec.ts` (`OUT = '../../docs/screenshots/phase-107-games'`).
- [ ] Human pass: from a prompt, an agent creates a 2D top-down crime game and a 3D third-person shooter from starters, plays them over MCP, fixes a bug it found in the logs, and exports to a single HTML file that runs in a browser
- [ ] Human pass: an open-world starter on a Phase 105 terrain built from heightmap, satellite and a cyan roads mask, with traffic on the road graph
- [ ] Human pass: an Ollama engine shows the warning and makes a small focused edit successfully

## Deferred

- [ ] Native and desktop export (Electron or Tauri packaging); web only in this phase (⏳ deferred)
- [ ] Publishing to itch.io or GitHub Pages through the forge integration (⏳ deferred)
- [ ] Multiplayer and networking kits (⏳ deferred)
- [ ] A visual scene editor; code-first by decision (⏳ deferred)
- [ ] More engines (Babylon.js, PlayCanvas) behind the manifest's `engine` field (⏳ deferred)
- [ ] TypeScript game repos with a build step; no-build by decision (⏳ deferred)

## Not in this phase

- **A shell for game agents.** File tools and the game's MCP tools only (Decision 11).
- **Committed engine binaries.** Vendored engines are generated at bundle time (Decision 7).
- **CI typecheck of the kit.** Vitest and e2e enforce it (Decision 8).
- **The ten recipe skills in the app repo.** They live in game repos; only the build skill is mirrored
  (Decision 10).
- **OS-level gamepad injection.** Chromium has none; gamepad input goes through the kit hook.
- **Cross-machine determinism.** Same-machine replays only.
- **Zip64.** Exports over 4 GB are refused.

## Files this phase touches

| Area | Files |
|---|---|
| Git (new) | `git-engine/src/commands/init.ts` (`initRepo`, `isInsideWorkTree`), `git-engine/src/commands/revert.ts` (`revertCommit`), tests beside them; [`commands/index.ts`](../../../packages/git-engine/src/commands/index.ts) (edited) |
| Git (**unchanged**, load-bearing) | [`commit.ts`](../../../packages/git-engine/src/commands/commit.ts), [`stage.ts`](../../../packages/git-engine/src/commands/stage.ts), [`status.ts`](../../../packages/git-engine/src/commands/status.ts), [`write-queue.ts`](../../../packages/git-engine/src/exec/write-queue.ts) |
| Schemas (new) | `shared/src/media-game.ts` (manifest, settings, state, replay, playtest, asset index, IPC payloads, constants), `shared/src/media-game-mcp.ts`, `shared/src/media-game-templates.ts`, `shared/src/game/json-path.ts`, `shared/src/game/frame-diff.ts` |
| Schemas (edited) | [`shared/src/media.ts`](../../../packages/shared/src/media.ts), [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) + [`mcp.test.ts`](../../../packages/shared/src/mcp.test.ts), [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) (`allowGames`), [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), [`domain/window.ts`](../../../packages/shared/src/domain/window.ts) (`'game'` role) |
| Main (new) | `desktop/src/main/games/`: `game-service.ts`, `games-settings-store.ts`, `games-root.ts`, `game-scaffold.ts`, `compose.ts`, `vendor.ts`, `kit-upgrade.ts`, `game-runner.ts`, `game-protocol.ts`, `ring-buffer.ts`, `game-mcp.ts`, `game-agent.ts`, `asset-bridge.ts`, `playtest.ts`, `zip-writer.ts`, `single-file.ts`, `export.ts`, `scan-imports.ts`; `desktop/src/main/ipc/games-handlers.ts`; `desktop/src/main/mcp/game-tools.ts` |
| Main (edited) | [`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts) (`registerPrivilegedSchemes`), `main/index.ts`, [`ipc/window-handlers.ts`](../../../packages/desktop/src/main/ipc/window-handlers.ts) (`reparentGameView`), [`main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts), [`main/mcp/index.ts`](../../../packages/desktop/src/main/mcp/index.ts), [`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts), [`ipc/mcp-handlers.ts`](../../../packages/desktop/src/main/ipc/mcp-handlers.ts), [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts) + [`client.ts`](../../../packages/desktop/src/mcp-shim/client.ts), [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts), [`electron-builder.yml`](../../../packages/desktop/electron-builder.yml), `packages/desktop/package.json` (engine devDependencies), `packages/desktop/.gitignore` (`resources/game-engines/`) |
| Main (**unchanged**, load-bearing) | [`apps-service.ts`](../../../packages/desktop/src/main/apps-service.ts) (the pattern), [`browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts) (`cancelDownload`), [`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts) (`confineToRoot`), [`repo-registry.ts`](../../../packages/desktop/src/main/repo-registry.ts) (`openRepo`), [`media/model/iterative-host.ts`](../../../packages/desktop/src/main/media/model/iterative-host.ts), [`media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts), `main/media/png/png-codec.ts` (Phase 105, `crc32`) |
| Renderer (new) | `app/src/features/media/game/`: `game-tab.tsx`, `game-explorer.tsx`, `game-runner-host.tsx`, `game-runner-toolbar.tsx`, `game-console-drawer.tsx`, `game-gallery.tsx`, `game-iterate-panel.tsx`, `game-edit-thread.tsx`, `game-asset-picker.tsx`, `playtests-menu.tsx`, `use-games.ts`, plus tests; `app/src/features/settings/settings-pages/games-root-section.tsx` |
| Renderer (edited) | [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts), [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts), [`media-page.tsx`](../../../packages/app/src/features/settings/settings-pages/media-page.tsx), [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx), [`test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts), `components/icons/icon-names.test.ts` |
| Resources | generated `packages/desktop/resources/game-engines/` (git-ignored) via new `scripts/vendor-game-engines.mjs`; new `templates/media-game/` (`common/`, `kit/core/` + `kit/core/genre/`, `kit/phaser/`, `kit/three/`, `bases/` × 6, `genres/` × 10, `skills/` × 11, `thumbnails/`, `kit-hash.json`, CC0 placeholder art with `ASSETS.md`) |
| Docs | new `docs/MEDIA_GAMES.md` (engine licences, pins, the hook contract) |
| Skills | `midnite-media-game-build` (six app-repo copies + template) and 10 `midnite-media-game-<genre>` (template only); `scripts/skill-copies.test.mjs` (extended) |
| Tests | git-engine `init.test.ts`, `revert.test.ts`; desktop `games-root`, `game-scaffold`, `vendor`, `kit-upgrade`, `kit-hash`, `game-protocol`, `game-runner`, `ring-buffer`, `fs-protocol` (extended), `game-mcp`, `kit-core`, `kit-genres`, `starters`, `compose`, `skills`, `game-agent`, `asset-bridge`, `export` (`*.test.ts`); shared `media-game`, `media-game-templates`, `json-path`, `frame-diff`; app `game-tab.bridge`, `game-iterate-panel`; e2e `game-runner`, `game-starters`, `game-playtest`, `game-export`, `game-hostile`, `phase-107-games-shots` |

## Verification

- `init.test.ts` / `revert.test.ts`: one commit on `main`, second init refused, `isInsideWorkTree`, revert
  and its conflict envelope.
- `media-game.test.ts` / `games-root.test.ts` / `game-scaffold.test.ts` / `game-tab.bridge.test.tsx`:
  manifest round trip and non-throwing issues, three root messages, non-empty folder refused, temp
  cleanup, explorer lists games with no repo open.
- `game-protocol.test.ts` / `game-runner.test.ts` / `ring-buffer.test.ts` / `fs-protocol.test.ts`:
  traversal, encoded traversal, symlink, dotfile and wrong-host 404s; `.wasm` MIME; CSP + `nosniff` on
  every response; network blocking off/on and `http:` always; the four permissions; partition naming;
  3-run cap; `webPreferences` table; one privileged-schemes call with both schemes.
- `vendor.test.ts` / `kit-upgrade.test.ts` / `kit-hash.test.ts`: import map resolves, versions match
  `package.json`, upgrade branch diff limited to `kit/`, `vendor/`, manifest; dirty tree refused; kit hash
  forces a version bump.
- `game-mcp.test.ts` / `mcp.test.ts` / `mcp-store.test.ts`: hostile `getState` cases bounded, input
  ordering, refusal when off, older settings load `allowGames: false`.
- `kit-core.test.ts` / `kit-genres.test.ts`: iso, DDA, anim naming, input, cameras, spring arm, fixed
  step, terrain manifest, png16, A*, flow field, loot, wanted, frame data, stamina, lock-on, boss, quests,
  dialogue, cancel windows, road routing, replay timing.
- `starters.test.ts` / `compose.test.ts` / `media-game-templates.test.ts` / `skills.test.ts`: every
  valid id composes with resolving imports and a valid manifest, invalid ids refused with reasons,
  `ASSETS.md` coverage, skill front matter and tool names, 33 seeded files.
- `game-agent.test.ts` / `game-iterate-panel.test.tsx`: commits per changing pass, squash, envelope
  refusals, Ollama banner.
- `asset-bridge.test.ts`: copy + provenance + change detection + kit-loader acceptance.
- `json-path.test.ts` / `frame-diff.test.ts`: restricted paths, 0.01 changed fraction.
- `export.test.ts`: exclusions, zip listing, no external references, 50 MB warning.
- e2e `game-runner`, `game-starters`, `game-playtest`, `game-export`, `game-hostile` pass; `MAX_DECLARED_E2E` +22.
- `bundle-report.mjs --assert` passes; `entryKb`/`totalJsKb` before/after recorded under `## Perf`.
- `moon run :typecheck :lint :test` green.
- **Open, for a human:** prompt → agent creates a 2D top-down crime and a 3D third-person shooter, plays
  over MCP, fixes a logged bug, exports single HTML that runs in a browser.
- **Open, for a human:** open-world starter on a real Phase 105 terrain (heightmap + satellite + cyan
  roads) with traffic on the road graph.
- **Open, for a human:** an Ollama engine shows the warning and makes a small focused edit.
- **Open, for a human:** `MSTUDIO_SHOTS=1` screenshots reviewed in `docs/screenshots/phase-107-games/`.

## Decisions / open questions

- **Code first** (user, 2026-10-04). Games are Phaser or three.js codebases written by agents. The
  app adds kits, starters, the sandbox, the play-test loop and the asset bridge, not a game format.
- **2D and 3D both** (user, 2026-10-04): Phaser for 2D, three.js + Rapier for 3D.
- **Each game is its own git repo** (user, 2026-10-04), under `~/Midnite Games` by default and
  **configurable in Settings** (user, 2026-10-04).
- **Agent CLIs and Ollama both** (user, 2026-10-04); Ollama carries a visible warning in the UI and
  over MCP.
- **Web export only, for now** (user, 2026-10-04).
- **Starter projects are in** (user, 2026-10-04): 6 perspective bases plus 10 genre starters, and the
  gallery composes the rest.
- **All five shapes** (user, 2026-10-04): kits + starters, the matrix gallery, recipe skills, assets
  first (Phases 105 and 106 as predecessors), and play-test depth.
- **No build step** (user, 2026-10-04 — the recommended option). ES modules, an import map and
  vendored engines. The app ships no bundler.
- **Template order** (user, 2026-10-04 — the recommended option): kits first, then the bases, then
  the genres in parallel, with open world last.

The x1 refinement ran unattended: every area was selected, the posture was *Expand in place · Every
item · Assertion-level · Resolve all with recommendations*, and each question below took its
recommended option. Each entry lists the options that were on the sheet.

1. **Resolved — Phaser 3, latest 3.x, exact-pinned** (was open). Options: Phaser 3 `[recommended · XS]` ·
   Phaser 4 `[future-proof · S]`. Picked 3: the agents writing the games know it far better, and Phase
   106's exports target its loaders. Revisit when a Phase 4 corpus exists.
2. **Resolved — the validity table stands as written** (was open). Options: as written `[recommended · XS]` ·
   also offer isometric FPS/3D fighter variants `[scope+ · M]`. Picked as written; the fighter's versus
   camera is a sixth rig outside the five.
3. **Resolved — in-memory partition per run by default, `persist:game-<gameId>` with `keepSaveData`**
   (was open). Options: per-run in-memory `[recommended · XS]` · per-game persistent `[DX · XS]`. Picked
   per-run: reproducible play-tests, and Restart means clean.
4. **Resolved — commit per pass, on by default, with a squash setting** (was open). Options: per pass +
   `squashRunCommits` (default off) `[recommended · S]` · one commit per run `[simplicity · XS]` · no
   automatic commits `[minimal · XS]`. Picked per pass: Undo turn becomes a plain revert and the Timeline
   shows each pass.
5. **Resolved — the games location lives in main (`games-settings.json`), like `videoRoot`.** Options:
   main-side file `[recommended · S]` · renderer ui-store `[minimal · XS]`. Picked main: main validates and
   creates the folder, and MCP needs it with no window.
6. **Resolved — CSP is set by the scheme handler, not `webRequest.onHeadersReceived`.** Options: handler
   headers + `onBeforeRequest` blocking `[recommended · S]` · `onHeadersReceived` like `csp.ts`
   `[minimal · XS]`. Picked the handler: every response is ours, so the header cannot be skipped.
7. **Resolved — engines are exact-pinned devDependencies copied to a git-ignored resources folder at
   bundle time.** Options: generated `[recommended · S]` · committed under `resources/` `[simplicity · XS]`.
   Picked generated: ~15 MB of minified engines stay out of git history, and versions come from one place.
8. **Resolved — no CI typecheck of kit JS.** Options: vitest + e2e only `[recommended · XS]` · a moon
   `tsc --noEmit` task over `templates/media-game` `[DX · S]`. Picked tests only: the `.d.ts` files are
   generated at bundle time and absent from a fresh checkout.
9. **Resolved — the kit splits into engine-free `kit/core/` and engine-bound `kit/phaser|three/`.**
   Options: split `[recommended · S]` · one flat `kit/` `[minimal · XS]`. Picked split: `kit/core/` is what
   vitest can import with no engine and no DOM.
10. **Resolved — only `midnite-media-game-build` is mirrored into the app repo.** Options: build skill only
    `[recommended · XS]` · all eleven `[DX · S]`. Picked build only: the recipes matter inside a game repo,
    where they are always seeded.
11. **Resolved — game agents get file tools and game MCP tools, no shell.** Options: no shell
    `[recommended · XS]` · allow `Bash` `[DX · XS]`. Picked no shell: the runner sandbox is the only place
    AI-written code may execute.
12. **Resolved — deterministic mode patches `Math.random`/`performance.now`/`Date.now` globally at boot.**
    Options: global patch `[recommended · S]` · patch inside the kit loop only `[minimal · XS]`. Picked
    global: game code calls `Math.random` anywhere, and a loop-scoped patch would leak nondeterminism.
13. **Resolved — a small `node:zlib` zip writer for `game-zip`.** Options: hand-written writer
    `[recommended · S]` · add a zip dependency `[simplicity · XS]` · folder only `[minimal · XS]`. Picked
    the writer: the user asked for zip; it is ~120 lines and reuses Phase 105's `crc32`.
14. **Resolved — single-file export uses `data:` module URLs behind one import map, and assets through an
    inlined index.** Options: import-map + `data:` URLs `[recommended · M]` · ship esbuild to bundle
    `[scope+ · M]`. Picked the import map: no bundler ships, and `assetUrl(name)` already routes every asset
    load.
15. **Resolved — games use the `mstudio:games:*` channel prefix, not `mstudio:media:game-*`.** Options:
    `mstudio:games:` `[recommended · XS]` · `mstudio:media:game-` `[minimal · XS]`. Picked `games:`: games
    are not repo media, the same reason Video has `mstudio:video:`.
16. **Resolved — `registerSchemesAsPrivileged` is called once with both schemes.** No real alternative:
    Electron keeps only the last call's list, so a second call would silently unregister `mstudio-file`.
17. **Resolved — at most three games run at once; gamepad input goes through the kit.** Options: cap 3
    `[recommended · XS]` · unlimited `[DX · XS]`. Picked 3: each run is a renderer process.
18. **Resolved — `GAME_PASSES_MAX = 20`, not the Models 100.** Options: 20 `[recommended · XS]` · 100
    `[DX · XS]`. Picked 20: a pass is a full CLI run in a repo, minutes not seconds.
