# Phase 107 — Games

Requested by the user · 2026-10-04 · grounded against the tree as of `a51a3b05`.

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
>   `terrain.manifest.json` (heightfield, chunks, splat, foliage, buildings, road graph). The Phaser kit
>   loads Phase 106's Phaser JSON-hash atlases with `anims`, and its Tiled `.tsj`/`.tmj` tilesets and
>   maps.
> - **Sandboxed web content.**
>   [`main/apps-service.ts`](../../../packages/desktop/src/main/apps-service.ts) already hosts each
>   third-party app in a `WebContentsView` with `sandbox: true`, `contextIsolation`, no preload and its
>   own `persist:app-<id>` partition. [`browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts)
>   holds the permission and navigation policy, and `fs-protocol.ts`'s `mstudio-file://` is registered
>   only on the default session, so isolated views cannot read it. The runner copies the apps pattern.
>   It must also pass Phase [91](phase-91-security-hardening.md) Theme E's Electron checklist and
>   Phase [76](phase-76-the-renderer-in-a-sandbox.md)'s sandbox rules.
> - **Git.** [`git-engine/src/commands/clone.ts`](../../../packages/git-engine/src/commands/clone.ts) and
>   the `repoClone` → `openRepo` path in
>   [`ipc/repo-handlers.ts`](../../../packages/desktop/src/main/ipc/repo-handlers.ts). **There is no
>   production `git init` today**; the only one is the test helper in `git-engine/src/testing/temp-repo.ts`.
>   All writes go through [`write-queue.ts`](../../../packages/git-engine/src/exec/write-queue.ts).
> - **Agents.** `runAgent` (headless roster CLI) and the private per-run MCP socket in
>   [`media/model/iterative-host.ts`](../../../packages/desktop/src/main/media/model/iterative-host.ts),
>   plus `createLlmCall` in [`media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts)
>   for Ollama.
> - **Workspace scaffolding.** [`main/video/scaffold.ts`](../../../packages/desktop/src/main/video/scaffold.ts)
>   copies `templates/media-video/` (including `.claude|.agents|.codex/skills/`) into a video root. A
>   new `templates/media-game/` follows the same pattern into every game repo.
> - **Media tabs.** `MEDIA_TABS` and its tables, as in Phase 105 Theme A. Games is **not** in
>   `REPO_SCOPED_MEDIA_TABS`: like Video, it resolves its own root (the games location setting), so it
>   works with no repo open.
> - **The MCP recipe** of the `model_*` family: schemas in `shared`, a mapped-type entry in
>   [`dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), a `main/mcp/<x>-tools.ts` gate
>   and binder, the slow-tool predicate in [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts),
>   and a switch in [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx).
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
>
> **Effort tags:** **S** ≤ half a day · **M** 1–2 days · **L** 3+ days, likely 2–3 PRs.

## Headlines

_A game is a repo, an agent writes it, and the app lets the agent play it._ Generating game code is
the part models already do well. Seeing the result is the part they cannot do, and that is what this
phase builds: kits and starters to extend, a sandbox to run in, and a play-test loop the agent drives
over MCP. Planned 2026-10-04.

**Theme A — Game repos, the Games tab and settings.** ◻ Not started. Lands first.

**Theme B — The sandboxed runner.** ◻ Not started. Lands with A.

**Theme C — No-build runtime, vendored engines and kit versions.** ◻ Not started. Lands with A.

**Theme D — MCP plumbing: the minimum play-test loop.** ◻ Not started.

**Theme E — Phaser kit and the 2D perspective presets.** ◻ Not started.

**Theme F — three.js kit, physics and the camera rigs.** ◻ Not started.

**Theme G — Perspective base starters.** ◻ Not started.

**Theme H — 2D genre starters.** ◻ Not started.

**Theme I — 3D genre starters, part one: shooter, fighter, soulslike.** ◻ Not started.

**Theme J — 3D genre starters, part two: RPG, character action, open world.** ◻ Not started. Open world lands last.

**Theme K — Template gallery: the perspective × genre matrix.** ◻ Not started.

**Theme L — Genre recipe skills and the build skill.** ◻ Not started.

**Theme M — Create and iterate: agents, Ollama and commit-per-turn history.** ◻ Not started.

**Theme N — Asset bridge.** ◻ Not started.

**Theme O — Play-test depth: determinism, input replays and frame assertions.** ◻ Not started.

**Theme P — Web export.** ◻ Not started.

**Theme Q — Verification.** ◻ Not started.

## Build order

1. **A + B + C** (foundation): repos, sandbox, runtime. Merged before anything else.
2. **D** right after, so every later theme is built and checked with the agent loop in place.
3. **E · F** in parallel (the kits). **M · N · P** in parallel alongside them. N's Terrain and Sprites
   importers need Phase 105 Theme I and Phase 106 Themes G, H and J.
4. **G** once E and F expose their presets.
5. **H · I · K · L · O** in parallel. **J** in parallel too, except **open world, which lands last**,
   because it needs Phase 105's terrain streaming and road graph plus F's vehicle controller.

## A — Game repos, the Games tab and settings (M)

- [ ] `initRepo` in a new `git-engine/src/commands/init.ts`: `git init -b main`, then an initial commit of the scaffold through the write queue, with NUL-safe argv and `--end-of-options` where applicable. A `GitOpResult` envelope, no throws. Vitest in a temp dir
- [ ] **Games location setting** under **Settings ▸ Media ▸ Games** ([`media-page.tsx`](../../../packages/app/src/features/settings/settings-pages/media-page.tsx)). Default `~/Midnite Games`, configurable (user, 2026-10-04), created on first use, validated (writable, not inside another repo's working tree). Also on that page: default engine, default network policy (off), and the Ollama warning text
- [ ] `'game'` added to `MEDIA_TABS` (label **Games**, `react-icons/lu` gamepad glyph), with every `Record<MediaTab, …>` filled in, `MEDIA_LAYOUT_KEYS` plus two width keys, and deliberately **not** in `REPO_SCOPED_MEDIA_TABS`
- [ ] **Game manifest** `midnite-game.json`, with `GameManifestSchema` in a new `shared/src/media-game.ts`:
  - `name`, `engine` (`phaser` or `three`)
  - `dimension` (`2d` or `3d`), `perspective`, `genre`
  - `cameraPresets`
  - `entry` (default `index.html`)
  - `kitVersion`, `vendored` (engine versions)
  - `assets[]` with provenance (source tab, source path, imported at)
  - `network` (`off` or `on`)
  - `deterministic`
- [ ] Creating a game:
  1. pick a starter (G, H, I, J or K), a name and a folder (defaults to the location setting)
  2. copy the starter, write the manifest, vendor engines (C), seed `templates/media-game/` (skills plus `AGENTS.md`/`CLAUDE.md`/`GEMINI.md` stubs carrying the game repo's own conventions, and a `.gitignore`)
  3. `initRepo`, then register with the app's repo list through the same path clone uses (`openRepo`)
- [ ] **Games tab**: the explorer lists game repos found under the location plus any registered repo carrying a `midnite-game.json`. Centre is the runner (B), right is the create/iterate panel (M). **Open in Timeline** jumps to the repo's git graph
- [ ] `mstudio:media:game-*` IPC channels and schemas in `shared`
- [ ] Vitest: `initRepo` creates a repo with one commit, the manifest round-trips, an existing folder is refused, the location validation rules hold, and the explorer lists seeded game repos via the mock bridge

## B — The sandboxed runner (L)

AI-written JavaScript runs isolated from `window.midniteStudio`. It is never in an iframe in the main
renderer, because that shares a process with the bridge.

- [ ] `main/games/game-runner.ts`, modelled on `apps-service.ts`:
  - a `WebContentsView` with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` and **no preload**
  - a **non-persistent** partition `game-<id>`, so each run starts with clean storage; a per-game "keep save data" toggle switches it to `persist:game-<id>`
- [ ] Custom scheme `mstudio-game://<id>/` registered **only on that partition's session**, serving files from that repo only, with media-store-style guards (reject `..`, symlinks at any segment and dotfiles under `.git`) and correct MIME types including `.wasm`
- [ ] **CSP** injected on every response: `default-src 'self' mstudio-game:`, `script-src` allowing `'wasm-unsafe-eval'` for Rapier, and no remote origins. With `network: on`, `connect-src` and `img-src` open to https only. `session.webRequest` blocks everything else
- [ ] Policy:
  - navigation locked to the game's origin
  - `window.open` denied
  - permissions denied except fullscreen, pointer lock, gamepad and audio autoplay
  - downloads denied
  - DevTools available (a game is a dev artefact) but only from the runner toolbar
- [ ] **Console and error capture without a preload**: `webContents` `console-message`, plus a `webContents.debugger` attach for `Runtime.exceptionThrown`, `unhandledrejection` and `render-process-gone`. Kept in a capped ring buffer per run, and shown in a console drawer under the viewport
- [ ] **Hot reload**: a watcher on the repo (excluding `.git`, `vendor/` and `node_modules`), debounced, reloads the view. A manual Reload, Restart (new partition) and Stop
- [ ] Runner toolbar: play/pause (with the kit's hook, E/F), restart, a resolution preset (16:9 at 720p/1080p, or fit), mute, an fps/frame-time overlay, a DevTools toggle, and **Pop out** into its own window (Phase 55 detachable panels)
- [ ] The view is hidden and throttled when the tab is hidden or the window is blurred (Phase 84 visibility gates). A stopped game holds no renderer process
- [ ] Vitest (desktop, with fakes for `WebContentsView` and session): the scheme refuses traversal, symlinks and `.git`; the CSP header is present on every response; network is blocked when off; and the ring buffer is capped. An e2e boots a starter and reads its console, naming "real Chromium process and canvas" in the spec header

## C — No-build runtime, vendored engines and kit versions (M)

- [ ] Each repo's `index.html` loads `src/main.js` as an ES module through an **import map** pointing at `vendor/` (`phaser`, `three`, `three/addons/`, `@dimforge/rapier3d-compat`) and `kit/`
- [ ] Engines are app resources (`resources/game-engines/<engine>@<version>/` with their LICENSE files), copied into `vendor/` at creation. Exact versions are pinned and recorded in the manifest. Phaser's major version (v3 or v4) is decided and recorded here; verify each engine's licence and record it in `docs/`
- [ ] **Types without a build**: vendored `.d.ts` files plus `// @ts-check` and JSDoc in the kits and starters, and a `jsconfig.json`, so agents and editors get types with no compile step
- [ ] **Kit versioning**: the kit lives in the repo (`kit/`), stamped with `kitVersion`. **Upgrade kit** writes the new kit on a branch and opens it as a diff in the app; the user (or agent) merges it. The kit is never silently overwritten
- [ ] Vitest: the import map resolves every vendored entry, a fresh repo's files match the starter plus the vendor set, and an upgrade produces a branch with only `kit/` and the manifest changed

## D — MCP plumbing: the minimum play-test loop (M)

Lands early so every later theme is built with the agent able to play.

- [ ] `shared/src/media-game-mcp.ts` tool family, spread into `MCP_TOOLS`:
  - `game_list`, `game_create` (from a starter id) and `game_open`
  - `game_get_manifest` and `game_set_manifest` (zod-validated)
  - `game_run`, `game_stop` and `game_reload`
  - `game_screenshot`: one frame, or a burst of N frames at an interval, via `webContents.capturePage()`
  - `game_logs`: console and errors since a cursor
  - `game_input`: key, pointer and gamepad events with timings, sent as trusted input via `webContents.sendInputEvent()`
  - `game_state`: calls the kit's `window.__midnite.getState()` via `executeJavaScript`. The result is **untrusted data**: size-capped, parsed as JSON and validated, never evaluated
- [ ] Handlers in `main/games/game-mcp.ts`. A `main/mcp/game-tools.ts` gate behind **Settings ▸ MCP ▸ Let agents run and edit games** (default off), with `dispatch.ts` entries and slow-tool timeouts for run, screenshot bursts and input sequences
- [ ] File edits are **not** MCP tools. The agent edits the repo with its own tools, and the tools only see, play and configure
- [ ] Vitest: schemas derive from zod, tools are refused when the switch is off, a hostile `getState` (huge, cyclic or non-JSON) comes back as a bounded error result, and input sequences are converted to the right `sendInputEvent` calls

## E — Phaser kit and the 2D perspective presets (L)

- [ ] `kit/` modules for Phaser:
  - boot and scene manager
  - input mapping (keyboard, gamepad, pointer → named actions)
  - camera follow with a deadzone, and screen shake
  - **sprite animator** that loads Phase 106 atlases and turns the `anims` section and Aseprite tags into Phaser animations, with direction-aware playback for 4 and 8 directions
  - **Tiled loader** for Phase 106 `.tmj`/`.tsj`, with a collision layer and an objects layer for spawns
  - HUD, audio (Audio tab assets), pause, and save/load to `localStorage`
- [ ] **Debug hook contract** `window.__midnite`, shared with F: `getState()`, `pause()`, `step(n)`, `setSeed(n)` and `version`. Each starter fills `getState()` with what matters (player position, health, score, scene)
- [ ] **Presets**, each a kit module plus a config:
  - **platformer**: arcade physics, coyote time, jump buffer, variable jump height, one-way platforms
  - **top-down**: 8-direction movement, facing
  - **isometric**: iso projection, depth sorting, tile picking under the pointer
  - **2.5D raycaster** (Doom-style): a DDA raycaster drawing walls into a Phaser texture, with textured walls from Phase 106 tiles, billboard sprites with depth, doors, and minimap. This preset has no Phaser physics
- [ ] Vitest (kit logic is engine-free where possible): input mapping, iso projection and picking, raycaster DDA hits and distances, animator naming from a 106 atlas fixture. Boot and draw are covered by e2e only

## F — three.js kit, physics and the camera rigs (L)

- [ ] `kit/` modules for three.js:
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
- [ ] **Camera rigs**:
  - **first person**: mouse-look with pointer lock, head bob, FOV setting
  - **third person, five presets** (user, 2026-10-04): **over the shoulder left**, **over the shoulder right**, **directly behind**, **further behind** and **much further behind**, cycled by one action and switchable in game
  - all third-person presets use a spring arm (raycast to avoid clipping into walls), with lock-on support for I's fighter and soulslike
- [ ] A raycast **vehicle controller** on Rapier (wheels, suspension, enter and exit) for the open world and top-down-crime 3D variants
- [ ] Navigation: a navmesh via `recast-navigation-js` vendored like the engines (verify the licence in C), behind a kit module so starters that do not need it do not load it
- [ ] Vitest (engine-free maths): spring-arm distance under occlusion, preset offsets for each of the five cameras, fixed-timestep accumulation, and manifest parsing against a Phase 105 fixture. Rendering is covered by e2e

## G — Perspective base starters (M)

One minimal, playable starter per perspective. These are the bases the genres and the gallery compose
on.

- [ ] 2D: **platformer**, **top-down**, **isometric** and **2.5D raycaster**. Each has a test level, a player, one enemy or obstacle, and placeholder art
- [ ] 3D: **first person** and **third person**, the latter with all five cameras. Each has a test arena, a player with animation states, and one interactable
- [ ] Placeholder art and audio are CC0 or generated in-house, with their licences recorded in the starter's `ASSETS.md`. Every starter swaps cleanly to Phase 105/106/Models assets through N
- [ ] Each starter ships a **smoke play-test script** (an O replay) that walks it for a few seconds and checks `getState()`
- [ ] Vitest: every starter's file set resolves every import through its import map, and its manifest validates. An e2e boots each starter and passes its smoke script

## H — 2D genre starters (L)

- [ ] **FPS** (raycaster): weapon switching, hitscan and projectile weapons, enemies with sight and chase, pickups (health, ammo, keys), keyed doors, and levels from Tiled
- [ ] **RTS** (StarCraft-style, top-down or isometric):
  - box and click selection, control groups
  - A* pathing on the tile grid, with flow fields for group moves
  - resource gathering, a build queue, unit production
  - fog of war, and a simple scripted AI opponent
- [ ] **ARPG** (Diablo-style, isometric): click-to-move, a skills hotbar, health and mana, loot tables with rarity, inventory and equipment, and a procedural dungeon of connected rooms
- [ ] **Top-down crime** (original GTA): enter and exit vehicles, top-down car handling, pedestrians on paths, a wanted level with pursuing police, and a city from a Tiled map
- [ ] Vitest for the engine-free systems: A* and flow fields, loot rolls with a seed, the wanted-level state machine, and RTS selection maths. An e2e smoke run per starter

## I — 3D genre starters, part one: shooter, fighter, soulslike (L)

- [ ] **Shooter**: first- and third-person (camera presets switchable), hitscan and projectile weapons, recoil and spread, ammo and reload, AI enemies on the navmesh with cover-lite (seek line-of-sight breakers), and damage numbers
- [ ] **Fighter** (Tekken-style): two fighters on a 3D lane with sidestep, a dedicated **versus camera** (it frames both fighters; neither first nor third person), move lists with frame data (startup, active, recovery), hit and hurt boxes, combos and juggles, blocking, a round and timer system, and a CPU opponent
- [ ] **Soulslike**: stamina, lock-on, dodge roll with invulnerability frames, light and heavy attacks, checkpoint bonfires (respawn and reset enemies), and a boss with a phase-based pattern
- [ ] Vitest for engine-free systems: frame-data timing, the stamina economy, the lock-on target choice, and boss phase transitions. An e2e smoke run per starter

## J — 3D genre starters, part two: RPG, character action, open world (L)

- [ ] **RPG**: quests (a data-driven quest log), dialogue trees from JSON, stats and levelling, inventory and equipment, NPCs with schedules, and an optional first-person camera
- [ ] **Character action** (Devil May Cry-style): combo strings with cancel windows, launchers and air combos, a style meter, and enemy waves in arenas
- [ ] **Open world** (GTA-style), **last**:
  - a Phase 105 terrain with streaming chunks
  - traffic and pedestrians routed on Phase 105's road graph
  - F's vehicles, with enter and exit
  - day/night cycle and a minimap from the land-cover map
  - a wanted level shared with H's top-down crime systems where the logic is engine-free
- [ ] Vitest for engine-free systems: quest state, dialogue graph traversal, cancel windows, and road-graph routing. An e2e smoke run per starter (open world against a small fixture terrain)

## K — Template gallery: the perspective × genre matrix (M)

Every valid combination instantiates and runs, composed from the kits rather than copied.

- [ ] A **validity table** in `shared/src/media-game-templates.ts` (recommended; adjust in this theme):

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
- [ ] **Composition**: a combination is the perspective base (G) plus the genre's systems module (H/I/J) plus a preset config. It is generated at creation from the kit and genre modules, so there is one copy of each system and no per-combination fork
- [ ] **Gallery UI** in the create panel: a 2D/3D toggle, perspective and genre grids, invalid cells disabled with the reason, a thumbnail and one-line pitch per cell, and the camera preset picker for third person
- [ ] Vitest: every valid cell composes to a file set whose imports resolve and whose manifest validates, and invalid cells are refused with the reason. An e2e boots one non-native combination per dimension (for example isometric RTS, first-person RPG)

## L — Genre recipe skills and the build skill (M)

- [ ] `midnite-media-game-build`: orients an agent in a game repo. It covers:
  - the manifest and kit API
  - the debug hook contract
  - the play-test loop (run → screenshot → logs → input → state, then fix)
  - the asset bridge
  - the rules: extend the kit rather than rewrite it, keep `getState()` truthful, never touch `vendor/`
- [ ] One **recipe skill per genre** (10): `midnite-media-game-<genre>`. Each covers the systems that genre needs, their file layout in the kit's terms, tuning values that feel right (jump arcs, stamina costs, frame data, RTS supply curves), and a play-test checklist. These are what lets an agent build a combination no starter covers, or deepen one that exists
- [ ] Skills ship in `templates/media-game/` and are seeded into each repo's `.claude/`, `.agents/` and `.codex/` at creation (the `main/video/scaffold.ts` pattern), and mirrored into the app repo's skill dirs for agents working outside a game repo
- [ ] Vitest: every skill's front matter parses, every tool a skill names exists in `MCP_TOOLS`, and seeding writes all three copies

## M — Create and iterate: agents, Ollama and commit-per-turn history (M)

- [ ] Create and iterate panel: a prompt, the gallery (K) when creating, an engine picker (roster agents or Ollama), and a refinement-pass budget (the Models 1–100 slider pattern)
- [ ] **Ollama is allowed, with a warning** (user, 2026-10-04). Selecting an Ollama engine shows a non-blocking banner: _"Local models struggle to write whole games. Expect better results from small, focused edits; an agent engine is recommended for creating games."_ The same warning appears in the `game_create` result when an Ollama engine is named over MCP
- [ ] Agent runs execute **in the game repo** via `runAgent`, with the private MCP socket from `iterative-host.ts` exposing D and O's tools, so the agent plays the game it is editing. Progress streams into an edit thread (the `video-edit-thread.tsx` pattern)
- [ ] **Commit per turn**: each agent turn that changed files is committed through the write queue with a generated message, so the Timeline shows the game's history and **Undo turn** is a revert. Only the scaffold commit is automatic outside agent turns
- [ ] Ollama runs (no CLI to edit files) receive the relevant files and return whole-file replacements in a fenced, zod-validated envelope that main applies. They are limited to files under `src/` and refused for `kit/` and `vendor/`
- [ ] Vitest: an Ollama envelope outside `src/` is refused, commit-per-turn creates one commit per changing turn and none for a no-op turn, and the warning appears for Ollama engines in UI and MCP

## N — Asset bridge (M)

- [ ] **Import from** Terrain (a Phase 105 manifest folder), Sprites (Phase 106 atlases, tilesets, maps, backgrounds), Models (`.glb` with clips), Images (PNG/JPEG/WebP) and Audio. Pick from a media picker, or over MCP with `game_import_asset`
- [ ] Imports are **copies** into `assets/<kind>/`, never links, so a game repo is self-contained and exportable. Provenance (source tab, path, hash, time) is recorded in the manifest
- [ ] **Re-sync**: when a source's hash changes, the Games tab offers to re-import. It never overwrites silently, and a re-import is its own commit
- [ ] Kit wiring per kind: the E animator and Tiled loader, F's glTF and terrain loaders. Imported assets are registered in `assets/index.json`, which the kits read, so the agent references assets by name
- [ ] Vitest: imports copy and record provenance, a changed source is detected, the asset index is valid, and importing a Phase 105 or 106 fixture yields files the kit loaders accept

## O — Play-test depth: determinism, input replays and frame assertions (L)

- [ ] **Deterministic mode** (manifest `deterministic: true`): the kit seeds all randomness from `setSeed`, runs on a fixed timestep driven by a virtual clock, and patches `Math.random`/`performance.now` inside the kit's loop. The same seed plus the same inputs gives the same `getState()` trace
- [ ] **Input replays**: a `.replay.json` format (frame-indexed actions, not wall-clock). `game_replay_record` records a human playthrough in the runner, and `game_replay_play` plays one back at 1× or as fast as possible
- [ ] **Assertions**:
  - `game_assert_state`: a JSON-path expectation on `getState()` at frame N
  - `game_assert_frame`: compare a frame at N with a stored baseline, with a tolerance and a returned diff image
- [ ] **Play-test scripts** in the repo (`playtests/*.json`): a replay plus assertions, runnable from the runner toolbar and over MCP as `game_playtest`. Results are a pass/fail list with screenshots of failures
- [ ] Vitest: replay serialisation round-trips, frame-indexed playback is independent of wall time (fake timers), state assertions evaluate JSON paths, and the frame diff reports a known changed region. An e2e: a deterministic starter replays to an identical state trace twice

## P — Web export (S/M)

- [ ] **Static folder** (the repo minus `.git`, `playtests/` and dev-only files), **zip** of the same, and **single-file HTML**: modules inlined in import order, assets as data URIs, Rapier's wasm base64-inlined, with a warning above a size threshold
- [ ] Export goes through `ExportToolbar`, with `MEDIA_TAB_EXPORT_FORMATS` listing `game-folder`, `game-zip` and `game-html` for the tab, and the native save dialog
- [ ] Vitest: export excludes `.git` and playtests, the single-file HTML contains no external references, and a size warning fires above the threshold. An e2e opens a single-file export from `file://` and passes the starter's smoke script

## Q — Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] `scripts/perf/bundle-report.mjs`: the app's entry chunk and total JS are unchanged by the engines (they are resources, not bundled). Numbers recorded here
- [ ] `scripts/e2e-budget.mjs` ratchet raised deliberately for this phase's e2e specs, with each spec header naming the browser capability it needs
- [ ] Security pass: a hostile fixture game (tries `window.midniteStudio`, `require`, `fetch` to a remote, `window.open`, traversal via the scheme, and top navigation) is blocked on every vector, as an e2e
- [ ] Screenshots (`MSTUDIO_SHOTS=1`, Media ▸ Games): the gallery, the runner with the console drawer, the five third-person cameras, the edit thread with commit-per-turn, and the asset bridge picker
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

## Files this phase touches

| Area | Files |
|---|---|
| Git | new `git-engine/src/commands/init.ts`; [`ipc/repo-handlers.ts`](../../../packages/desktop/src/main/ipc/repo-handlers.ts) (register created repos) |
| Schemas | new `shared/src/media-game.ts` (manifest, IPC), `shared/src/media-game-mcp.ts`, `shared/src/media-game-templates.ts` (validity table, composition); [`shared/src/media.ts`](../../../packages/shared/src/media.ts), [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) |
| Main | new `main/games/` (`game-runner.ts`, scheme handler, CSP and policy, watcher, vendoring, scaffold, `game-mcp.ts`, replay and assertions, export), new `main/mcp/game-tools.ts`; [`apps-service.ts`](../../../packages/desktop/src/main/apps-service.ts) and [`browser-security.ts`](../../../packages/desktop/src/main/browser-security.ts) (shared policy helpers), [`main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts), [`media/model/iterative-host.ts`](../../../packages/desktop/src/main/media/model/iterative-host.ts) |
| Renderer | new `app/features/media/game/` (tab, explorer, runner host and toolbar, console drawer, gallery, create/iterate panel, edit thread, asset picker); [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts), [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), `store/ui-store.ts`, [`media-page.tsx`](../../../packages/app/src/features/settings/settings-pages/media-page.tsx), [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx) |
| Resources | new `resources/game-engines/` (Phaser, three, Rapier, recast-navigation, each with LICENSE); new `templates/media-game/` (kits, 6 perspective bases, 10 genre modules, skills, agent convention stubs, CC0 placeholder art) |
| Skills | `midnite-media-game-build` + 10 `midnite-media-game-<genre>` recipes |
| Tests | git-engine vitest for `initRepo`, desktop vitest for scheme, policy, MCP, vendoring and export, engine-free kit vitest, app vitest via the mock bridge, e2e per starter plus the hostile-game spec, an `MSTUDIO_SHOTS` spec |

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
- **Phaser major version, open, decided in Theme C.** Recommendation: whichever major is stable and
  documented when C starts; LLM familiarity favours the one with the larger corpus.
- **The validity table, open, adjusted in Theme K.** The recommended table is above. The fighter's
  versus camera is a sixth 3D camera, outside the five third-person presets.
- **Partition persistence, open.** Recommendation: non-persistent by default for clean, reproducible
  play-tests, with a per-game "keep save data" toggle.
- **Commit per turn, open.** Recommendation: on by default (it makes undo a git revert and gives the
  Timeline a history), with a setting to squash a run's turns into one commit instead.
