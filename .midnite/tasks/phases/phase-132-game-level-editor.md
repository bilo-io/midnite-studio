# Phase 132 — Game level editor and Open Game

**Refined: x1** · 2026-11-13 · data model & contract, functionality & edge cases, UI/UX & interaction, empty / loading / error states, persistence & migration, security & confinement, testing & verification, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

Planned 2026-11-13 by a swarm planner from the user's request · grounded against the tree as of `60ad15fb5`.

Media ▸ Games lists game repos, runs one in a sandboxed native view and lets an agent iterate on it, but a level is
code: every starter's `src/scenes/level.js` hard-codes its walls, ledges, coins and spawns, so the only way to move a
platform is to edit JavaScript. And the list only grows by **New game**: a game made elsewhere, or cloned from a
friend, never shows up in Gamer and shows up in Studio only once its folder is registered in the repos panel. This
phase adds **Open Game** beside **New game**, moves the centre panel to a **Level editor | Play mode** pair of tabs,
stores levels as Tiled JSON in the game repo (`levels/<scene>.tmj`) with a kit loader so scenes build from the file,
and adds a 2D tile-and-entity editor, a 3D placement editor and a scene picker that opens a level and jumps the
running game to it.

> **Builds on.**
> - **The games list** — [`game-list.ts`](../../../packages/features/media-game/main/games/game-list.ts) `listGames(gamesRoot,
>   registeredRepoPaths)`: direct children of the games root with a `midnite-game.json`, plus every registered repo whose
>   root has one (commit #1125), deduped by `realpath`; an invalid manifest still lists. The renderer re-reads it when the
>   repo list changes (`useGamesFollowRepos` in [`use-games.ts`](../../../packages/features/media-game/renderer/use-games.ts)).
> - **The host ports** — [`GamesRuntimeDeps`](../../../packages/features/media-game/main/games/games-runtime.ts)
>   (`registerRepo`, `listRepoPaths`, `getWindow`, …). Studio wires `registerRepo` to `openRepo` + watcher reconcile
>   ([`desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) ~L867), the same path the repos panel's
>   open takes; Gamer wires both to no-ops ([`modules/gamer/main/context.ts`](../../../packages/modules/gamer/main/context.ts)
>   ~L340). Native dialogs live in main and arrive as a dep — the Sprites feature's `pickTiledMap` is the precedent
>   ([`apps/gamer/main/index.ts`](../../../apps/gamer/main/index.ts) `pickTiledMap`).
> - **Tiled in the tree** — [`shared/src/sprite/tiled.ts`](../../../packages/shared/src/sprite/tiled.ts) (`TiledMapSchema`,
>   `buildTmj`, Tiled 1.10, embedded tilesets because Phaser cannot load external ones),
>   [`shared/src/sprite/map-view.ts`](../../../packages/shared/src/sprite/map-view.ts) (`readTmj`, `tileOf`, `sourceRect`,
>   `cellOrigin`, `collisionLayer` — what Sprites' map preview draws with), the kit's
>   [`kit/phaser/tiled.js`](../../../templates/media-game/kit/phaser/tiled.js) (`buildTiledMap`: tile layers, a hidden solid
>   `collision` layer, the `objects` layer as spawns/exits/points) and
>   [`kit/core/tiled-objects.js`](../../../templates/media-game/kit/core/tiled-objects.js). A Sprites map imported into a game
>   lands at `assets/map/<name>/map.tmj` ([`asset-bridge.ts`](../../../packages/features/media-game/main/games/asset-bridge.ts)
>   `kindDir`). The fps and crime genres already describe their maps in the `.tmj` shape, in JS
>   ([`genres/fps/src/genre/levels.js`](../../../templates/media-game/genres/fps/src/genre/levels.js),
>   [`genres/crime/src/genre/city.js`](../../../templates/media-game/genres/crime/src/genre/city.js)).
> - **The hook** — [`kit/core/hook.js`](../../../templates/media-game/kit/core/hook.js) `installHook` (`getState`, `pause`,
>   `resume`, `step`, `replay`, `extendHook`), `KIT_VERSION = '0.11.0'`, `HOOK_VERSION = 1`; Phaser's
>   [`boot.js`](../../../templates/media-game/kit/phaser/boot.js) reports the active scene key; three's
>   [`loop.js`](../../../templates/media-game/kit/three/loop.js) reports `sceneName ?? 'main'`. `GameStateSchema.scene`
>   ([`media-game.ts`](../../../packages/shared/src/media-game.ts)) is optional, `KitGameStateSchema.scene` required.
> - **The runner** — [`game-runner.ts`](../../../packages/features/media-game/main/games/game-runner.ts): `gameEntryUrl` adds the
>   kit's query params, the `will-navigate` guard allows the game's own scheme + host, a file watcher hot-reloads on any
>   change outside `.git`/`vendor`/`node_modules`/`playtests`, `reload` is `reloadIgnoringCache` (the URL, query included,
>   survives). Hook calls go through `executeJavaScript` with a feature-detect (`typeof m.x === 'function'`).
> - **Kit upgrades** — [`kit-upgrade.ts`](../../../packages/features/media-game/main/games/kit-upgrade.ts) replaces `kit/` and
>   `vendor/` on a `kit-upgrade/<v>` branch (refuses a dirty tree); `src/` is never touched.
>   [`kit-hash.json`](../../../packages/features/media-game/main/games/kit-hash.json) pins the kit's content to
>   `GAME_KIT_VERSION` (`kit-hash.test.ts`).
> - **MCP** — [`media-game-mcp.ts`](../../../packages/shared/src/media-game-mcp.ts) (`GAME_MCP_TOOL_IDS`,
>   `GAME_MCP_READ_TOOL_IDS`, `GAME_AGENT_TOOL_IDS` derived), adapters in
>   [`game-mcp.ts`](../../../packages/features/media-game/main/games/game-mcp.ts), the id union in
>   [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts), the write set in `mcp.test.ts`.

> **Scope guardrails.** Levels are Tiled JSON in the game's own repo; nothing about a level lives in Studio's or
> Gamer's userData. One file per scene. No terrain sculpting and no 3D viewport in the editor — Play mode is the 3D
> preview. Every IPC op answers the `GitOpResult` envelope and never throws; every git write in a game repo goes
> through `writeQueue`. A feature imports the frame and `shared` only; native dialogs stay in main. macOS only,
> `react-icons` only, every new test a vitest unless it names the browser capability it needs. **No committed
> screenshots or visual baselines** in this phase (the repo's current rule): appearance is a human check.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_A game's levels become files you can see and edit, and any game on disk can join the list._ Today a level is
hard-coded in a starter's scene and the Games list only knows games it created or repos the repos panel registered.
This phase adds Open Game, splits the centre panel into a level editor and a play tab with the run controls centred
over them, defines how a 2D and a 3D level live in Tiled JSON, teaches the kit to build scenes from those files and
to jump to a scene on request, and gives agents the same level tools over MCP. Planned 2026-11-13; build order **A**
first, then **B** and **C** in parallel, then **D**, **F**, **G**, then **E**, then **H**.

**Theme A — Open Game.** ✅ An **Open Game** button beside **New game** (and in the empty state): `mstudio:games:add`, a folder dialog in main, `resolveGameFolder` resolving the folder to its repository root with the plain refusals of Decision 7, `service.add` answering `added`, `listed` or `cancelled`, registered through the host's repo port. Studio wires its dialog and `registerRepo`; Gamer gets `opened-games.json` behind the same two ports. Not done: the human check (folded into Theme H); "Remove from list" stays open under Decision 17.

**Theme B — Centre layout: Level editor and Play mode tabs.** ✅ The centre is a `GameCenter` with a **Level editor** tab (an empty-state placeholder until Theme D) and a **Play mode** tab holding the runner and console drawer; both panels stay mounted and `GameRunnerHost` takes `active` so the native view hides under the editor. `useGameMode` keeps the tab per game (a game opens on the editor) and the pause policy: leaving Play pauses only a run the Play button started, `pauseWhenEditing` (default on, Settings ▸ Games switch) gates it, and return resumes only that auto-pause. The run controls moved to the centre of the top bar (name left, export right), led by a gradient-bordered Run/Play button with a hover glow. Human check stays in H.

**Theme C — Level format, kit loader and the scene jump.** ✅ `shared/src/game-level.ts` (loose `parseGameLevel`, the 2D and 3D conventions, `levelEntityToWorld`, the level IPC schemas), additive Tiled property/class/polyline fields and `cellAt`, the manifest's `levels` key and `GameSceneNameSchema`, `kit/core/level.js` with Phaser (`preloadLevel`, `buildLevel`, `KitLevelScene`) and three (`buildLevel3d`) builders, `window.__midnite.goto` (in place for a Phaser `level` scene, else a reload on `?midnite-level=`) and `getState().level`, kit 0.12.0, `game-levels.ts` (list/get/set confined to `levels/`, one pathspec commit per save) and the runner's `goto` (`hook` / `reload` / `next-run`) behind four channels, Studio's preload and Gamer's bridge. `GAME_ENGINE_VERSIONS.three` is left at 0.186.1 (desktop pins 0.187.0): that mismatch predates this theme and a vendored-engine bump is its own change.

**Theme D — 2D tile and entity editor, and the scene picker.** ✅ (part) The Level editor tab is a canvas editor over a pure edit model (`level-edit-model.ts`: paint, erase, rectangle, pick, entities, typed properties, layers, a 100-step undo where a drag is one step, `serialise` keeping fields it never touched). It draws with Sprites' `map-view.ts` and hit-tests with `cellAt`, isometric included; wheel zoom 0.25x-8x, Space or middle-drag pan; B/E/R/I/O/V and Mod+Z act only with the canvas focused. A layer list, tile palette, entity palette and inspector sit around it; Save is one `level-set` commit, no autosave. The scene picker sits in B's `sceneSlot`: picking opens the level and calls `goto`, a dirty level asks Save/Discard/Cancel, `next-run` says so; the open level and its undo live in a per-game store. New scene makes a blank level by perspective and can opt the game into `levels.start`. A tileset image that is missing does not make a level read-only (only a parse issue does); 3D levels open read-only until E. Not done: **Start from a map asset** (no renderer read for `assets/map/`), the one e2e (not run in this pass), and the canvas look, which stays a human check in H.

**Theme E — 3D placement editor.** ✅ The Level editor tab opens a 3D level (`midnite.dimension` `3d`) in plan view on the same canvas, edit model and picker: tile tools, the tile palette and the Tile layer button give way to **Select / Move** (V), **Place** (O), **Volume** (R, drag a rectangle into a `prop` box with `sizeY` 3), **Path** (P, click points, Enter finishes a polyline `path`) and **Rotate** (Y, drag around the object, Shift snaps to 15°). Yaw is Tiled's own `rotation`, turned about the footprint's centre so its world position does not move. The canvas draws a metre grid (1 m lines, every tenth bold, thinned when zoomed out), footprints as rotated rectangles with a yaw tick, and the terrain only as a dashed outline over its drape image: `levelGet` gained an optional `terrain` (`game-level-terrain.ts` reads `assets/index.json`, the pack's `terrain.manifest.json` bounds and its drape, confined to the game). The inspector adds elevation (empty snaps to ground), sizeY, pitch, roll, scale, a model select over the game's `model` assets, collider, a light's intensity, range and colour, and a read-only world position from `levelEntityToWorld`. New scene makes a 3D scene (80 × 80 m, objects layer with one spawn, `3d` dimension, one metre a tile); the read-only banner for 3D is gone (only a non-orthogonal 3D level stays read-only). Tests: the 3D model ops, plan geometry, the editor's 3D tools and inspector, `readLevelTerrain`, and an agreement test that the editor's placements map to the same world position in `levelEntityToWorld` and the kit's `toWorld3d`. Not done: the canvas look and the human pass on a third-person game, which stay in H.

**Theme F — Starters read their levels from files.** ✅ Every base and 3D genre scene builds from `levels/level.tmj` (2D scenes extend `KitLevelScene`, preload the file and read it from the tilemap cache; 3D scenes `buildLevel3d` it and re-skin the boxes by name), keeping their procedural textures, lights and juice. fps and crime moved their ASCII and city rule into the file, rts reads `home`, `enemy-home` and `mineral` objects, and shooter and soulslike read their spawns, bonfire and boss. `composeStarter` writes the 2D palette image, `createGame` sets `levels: { dir: 'levels', start: 'level' }` in the manifest, and existing games are untouched. The palette PNG is never committed (Decision 18). Not done: the visual "unchanged" check (Theme H), `arpg` (procedural dungeon), rts ridges and the shooter's extra crates (still code).

**Theme G — Level tools for agents.** ✅ `game_level_list`, `game_level_get`, `game_level_set` and `game_goto` are on the midnite MCP server, as thin adapters over Theme C's level service and the runner's `goto`. The two reads answer whenever the server is on; the two writes are refused with `GAMES_OFF_MESSAGE` while `allowGames` is off, and an agent run's private server gets all four. `game_level_get` returns the JSON and its issues, never the images; a refused level or a missing scene comes back as a named tool error. A **Levels** section (where levels live, the 2D and 3D conventions, the four tools, and the pre-0.12 migration recipe) went into `midnite-media-game-build`, in all seven byte-identical copies the copies test pins, not just the four the doc named.

**Theme H — Verification.** ◻ The CI gate, and a human pass in Studio and Gamer over Open Game, the tabs, a 2D and a 3D edit, and the scene jump.

## Build order

1. **A** first. It touches only the list, one channel and two host wirings, and depends on nothing else here.
2. **B** and **C** in parallel: B is renderer layout in `media-game/renderer/` with a placeholder editor panel; C is
   `shared`, the kit and `media-game/main/`. They share no files bar `use-games.ts` (B adds nothing there; C adds the
   level hooks in a new `level/use-levels.ts`).
3. **D**, **F** and **G** in parallel once C is in: D fills B's editor tab (needs B and C); F migrates the templates
   (needs C's kit); G adds MCP adapters over C's service ops (needs C).
4. **E** after D: it reuses D's canvas, edit model and picker.
5. **H** last.

A partial landing is safe at every step: without C the editor tab shows its empty state and Play works as today;
without F the editor edits files the starters do not read yet, which the editor says in a banner (D); without G agents
keep editing scenes as code.

## Deliverables

### A — Open Game [S · 1-2h]

- [x] Contract in [`media-game.ts`](../../../packages/shared/src/media-game.ts) and the IPC files
  - `GameAddRequestSchema = z.object({ path: z.string().min(1).optional() })` — `path` absent means "show the folder
    dialog in main"; present is how a test (and a future drag-and-drop) adds a known folder.
  - `GameAddResultSchema = z.discriminatedUnion('status', [z.object({ status: z.literal('added'), gameId: z.string(),
    path: z.string() }), z.object({ status: z.literal('listed'), gameId: z.string(), path: z.string() }),
    z.object({ status: z.literal('cancelled') })])` — `listed` means it was already in the list (nothing written).
  - `GamesChangedSchema.reason` gains `'added'`.
  - `CHANNELS.gamesAdd: 'mstudio:games:add'` in [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), after
    `gamesCreate`. **Not** `gamesOpen`: `EVENT_CHANNELS.gamesOpen` is already the agent's reveal event.
  - `schemas.GamesAddRequest` in `ipc/schemas.ts`; `games.add(req: GameAddRequest): Promise<GitOpResult<GameAddResult>>`
    in [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts).
- [x] Net-new `packages/features/media-game/main/games/game-open.ts` — `resolveGameFolder(path): Promise<GitOpResult<{ root: string }>>`
  - Checks in this order, each refusal a `failure(message)` with these exact messages (`<name>` is `basename`):
    not absolute → `Choose a full folder path.`; not a directory → `"<name>" is not a folder.`;
    `workTreeTop(path)` is null → `"<name>" is not a git repository. A game is its own repository — run git init in
    it, or start a new game with New game.`; the top has `midnite-game.json` → `ok({ root: top })` (so picking
    `my-game/src` opens `my-game`); the top has none but `path` does → `"<name>" is inside the repository <top>.
    Games are their own repositories — move it out, or open <top> if that is the game.`; neither →
    `No midnite-game.json in "<name>". Open Game adds an existing Midnite game; to start one, use New game.`
  - A manifest that is not valid JSON or fails `parseGameManifest` **still resolves**: the explorer already lists an
    invalid game with its first issue, and this is how a user gets to fix one.
  - A folder outside the games root is the point of the feature and is allowed; a folder nested deeper than one level
    inside the games root (not found by the scan) is registered like any other.
- [x] `service.add(path?: string): Promise<GitOpResult<GameAddResult>>` in [`game-service.ts`](../../../packages/features/media-game/main/games/game-service.ts)
  - `path` absent → `deps.pickFolder?.()`; no picker → `failure('Open Game is not available here.')`; `null` →
    `ok({ status: 'cancelled' })`.
  - `resolveGameFolder`; then if `listGames(...)` already holds a game whose `realpath` equals the root's →
    `ok({ status: 'listed', gameId, path })`, nothing written.
  - Else `deps.registerRepo(root)` (a failure passes through unchanged), `send(gamesChanged, { reason: 'added' })`,
    `log.info('game added <gameId> path=<root>')`, `ok({ status: 'added', gameId: await gameIdForPath(root), path: root })`.
  - `GameServiceDeps` and `GamesRuntimeDeps` gain `pickFolder?: () => Promise<string | null>`, passed straight through
    by `createGamesRuntime`.
  - Handler in [`media-game/main/index.ts`](../../../packages/features/media-game/main/index.ts):
    `handle(CHANNELS.gamesAdd, schemas.GamesAddRequest, ({ path }) => service.add(path), (issue) => failure(issue))`;
    `CHANNELS.gamesAdd` appended to [`media-game/manifest.ts`](../../../packages/features/media-game/manifest.ts) `ipc`.
- [x] Host wiring
  - Studio: `pickFolder` in [`desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts)'s `createGamesRuntime`
    call — `dialog.showOpenDialog(win, { title: 'Open a game', properties: ['openDirectory'], defaultPath:
    (await games.service.settings.get()).resolvedRoot })`, `null` on cancel. `registerRepo` is unchanged, so an opened
    game also appears in the repos panel and in Timeline, exactly as if opened there.
  - Gamer: net-new `packages/modules/gamer/main/opened-games.ts` — `createOpenedGamesStore(userData)` over
    `<userData>/opened-games.json` (`{ version: 1, paths: string[] }`, tolerant read: unreadable → `[]`; write via temp
    + rename). Gamer's `registerRepo` appends (deduped by `realpath`) and `listRepoPaths` returns the stored paths,
    replacing the two no-ops in [`context.ts`](../../../packages/modules/gamer/main/context.ts) and their comment.
    A stored path that no longer has a manifest drops out of the list by itself (`listGames` already skips it) and
    stays stored, so a re-attached drive brings it back. `pickGameFolder` beside `pickTiledMap` in
    [`apps/gamer/main/index.ts`](../../../apps/gamer/main/index.ts), handed in as `el.game.pickFolder`.
  - Preloads: `add: (req) => call(CHANNELS.gamesAdd, req)` in [`desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts)
    and [`modules/gamer/main/bridge.ts`](../../../packages/modules/gamer/main/bridge.ts).
  - Known effect, accepted: Gamer's asset bridge scans `listRepoPaths` for media sources, so an opened game with a
    `.midnite/media/` folder becomes a source. That is the behaviour Studio already has.
- [x] Renderer
  - [`game-explorer.tsx`](../../../packages/features/media-game/renderer/game-explorer.tsx): header gets **Open Game**
    (`LuFolderOpen`, same pill styling as **New game**) immediately left of **New game**; new prop `onOpen`. The empty
    state reads `No games yet. Create one from a starter, or open one you already have.` with both buttons.
  - [`use-games.ts`](../../../packages/features/media-game/renderer/use-games.ts): `useAddGame()` mutation →
    `bridge()?.games.add({})`; on `added`/`listed` invalidate `GAME_KEYS.list` and `REPOS_KEY`; `reportFailure` on
    failure (the toast carries the message above); `cancelled` does nothing.
  - [`game-tab.tsx`](../../../packages/features/media-game/renderer/game-tab.tsx): `onOpen` runs the mutation and, on
    `added`/`listed`, calls `select(gameId)` so the opened game is selected (Theme B then opens its editor tab). The
    button shows a spinner and is disabled while the mutation is pending.
- [x] Tests (vitest)
  - Net-new `game-open.test.ts` (node, temp dirs with `git init`): each refusal message; a `src/` pick resolves to the
    top; an invalid manifest still resolves; a folder outside the root resolves.
  - `game-service` add cases (in a net-new `game-service-add.test.ts` over a fake runner and fake deps): `cancelled`
    when the picker answers `null`; failure with no picker; `listed` without calling `registerRepo`; `added` calls
    `registerRepo` once with the root and sends `gamesChanged { reason: 'added' }`.
  - Net-new `opened-games.test.ts`: append dedupes by realpath; missing or corrupt file reads `[]`.
  - [`modules/gamer/main/bridge.test.ts`](../../../packages/modules/gamer/main/bridge.test.ts): `games.add` calls
    `CHANNELS.gamesAdd`; the feature manifest test lists the channel.
  - Net-new `game-explorer.test.tsx`: **Open Game** renders before **New game**; a click calls `games.add({})`; the empty
    state shows both actions.
- [ ] Human check (folded into H): in Studio, Open Game on a game outside the games root lists and selects it and it
  appears in the repos panel; a folder with no manifest shows the toast; in Gamer, an opened game survives a relaunch.

### B — Centre layout: Level editor and Play mode tabs [M · 2-4h]

- [x] Net-new `renderer/game-center.tsx` — `GameCenter({ game, mode, onMode, resolution, sceneSlot })`
  - A `role="tablist"` strip (`aria-label="Game view"`) with two `role="tab"` buttons: **Level editor** (`LuPencilRuler`)
    and **Play mode** (`LuGamepad2`), `aria-selected` on the active one, arrow keys move between them. Right of the tabs,
    `sceneSlot` (Theme D puts the scene picker there; empty until then).
  - Both `role="tabpanel"` panels stay mounted; the inactive one gets `hidden`. The Play panel holds
    [`GameRunnerHost`](../../../packages/features/media-game/renderer/game-runner-host.tsx) over
    [`GameConsoleDrawer`](../../../packages/features/media-game/renderer/game-console-drawer.tsx), moved out of
    `game-tab.tsx` unchanged. Until Theme D, the editor panel is an `EmptyState` (`LuPencilRuler`, `Level editing is not
    available for this game yet.`, body `Press Run to play it.`).
  - While a run is live and the editor tab is showing, the Play tab label carries a small live dot
    (`role="img" aria-label="Running"`), so a run started by an agent is never invisible.
- [x] Mode state in [`game-tab.tsx`](../../../packages/features/media-game/renderer/game-tab.tsx)
  - `mode: 'editor' | 'play'` per `gameId` (a `Map` in a `useState`, not persisted). Selecting a game in the list
    (or via `useMediaOpenFor`) sets that game's mode to `editor` — clicking a game opens its level editor.
  - A run started by the Play button sets `play`. A run started elsewhere (an agent's `game_run`, a play-test, MCP)
    does not switch tabs; the live dot shows it.
- [x] The native view must hide under the editor tab
  - `GameRunnerHost` gains `active: boolean`; `useGameBounds` folds it in: `visible = live && pageVisible && !occluded
    && active`. With `active` false it sends `setVisible(false)` exactly as an occluder does today; switching back sends
    the bounds again. Without this the `WebContentsView` floats over the editor canvas.
  - The popout (`hosted` false) is unaffected: a popped-out game keeps its own window.
- [x] Pause policy (Decision 10)
  - Leaving Play for the editor pauses the run (`games.toolbar({ gameId, action: 'pause' })`) **only** when the run was
    started by this window's Play button, it is `running`, it is not popped out, and the `pauseWhenEditing` setting is
    on; the tab remembers it paused it. Returning to Play resumes only a run it paused itself — a run the user paused
    stays paused.
  - `GamesSettingsSchema` gains `pauseWhenEditing: z.boolean()`, `DEFAULT_GAMES_SETTINGS.pauseWhenEditing = true`;
    `parseStoredGamesSettings` picks it field by field like the others, so an old `games-settings.json` reads the
    default. Studio's Settings ▸ Games section
    ([`games-root-section.tsx`](../../../packages/app/src/features/settings/settings-pages/games-root-section.tsx)) gets a
    switch, `Pause the game while editing levels`. Gamer has no Games settings page and uses the default.
- [x] Run controls in the centre of the top bar
  - `game-tab.tsx`'s toolbar node becomes `grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center
    gap-3`: left cell the game name (left-aligned, `truncate`, today's `title`), centre cell `GameRunnerToolbar`, right
    cell `GameExportBar` with `justify-self-end`. The name moves from centre to left.
  - Check MediaLayout's floating side-panel toggles
    ([`media-layout.tsx`](../../../packages/features/media-core/renderer/media-layout.tsx)) do not cover the name or the
    export bar at the narrowest supported width; pad the outer cells if they do.
  - The popout's own bar ([`game-popout-pane.tsx`](../../../packages/features/media-game/renderer/game-popout-pane.tsx))
    keeps its current layout.
- [x] The Play button — first control in [`GameRunnerToolbar`](../../../packages/features/media-game/renderer/game-runner-toolbar.tsx)
  - New prop `onPlay: () => void`. Not live → label **Run** (`LuPlay`), starts `useRunGame` and calls `onPlay`. Live →
    label **Play** (`aria-label="Show the running game"`), calls `onPlay` (which switches to the Play tab and resumes an
    auto-paused run). Disabled with no game selected. In the popout `onPlay` is absent and the button only runs.
  - Classes: `gradient-border gradient-border--always gradient-border--hover rounded-md h-7 px-3 text-xs
    font-semibold` — the `.gradient-border` family from `@bilo-io/ui`'s `tokens.css`, which Studio and every suite app
    already import, so the ring is the existing rainbow ramp and no colour is new. Hover glow:
    `hover:shadow-[0_0_0_1px_rgba(139,92,246,0.28),0_0_12px_-2px_rgba(59,130,246,0.35),0_0_22px_-6px_rgba(236,72,153,0.3)]`
    — the exact three rings of Studio's `.gradient-border--glow` (`packages/app/src/styles.css`), restated as a utility
    because that class lives in Studio's stylesheet and the feature also renders in Gamer.
  - Motion: the ring's spin is upstream's and already stops under reduced motion (`prefers-reduced-motion` and
    `html[data-motion='reduced']`); the glow itself is static, and its fade is `motion-safe:transition-shadow` only.
  - The existing Restart, Stop, resolution, mute, overlay, DevTools, Juice, Playtests and Pop out controls keep their
    order after it.
- [x] Tests (vitest/jsdom)
  - Net-new `game-center.test.tsx`: two tabs with roles and `aria-selected`; the inactive panel is `hidden`; arrow keys
    move selection; the live dot appears when the run store says live and the editor tab is active.
  - Net-new `game-tab-mode.test.tsx` (mock bridge): selecting a game shows the editor tab; Run calls `games.run` and
    shows Play; leaving Play calls `games.toolbar({ gameId, action: 'pause' })` once for a run started by Run and not for a run
    seeded into the store as started elsewhere; returning resumes only the auto-paused run; `pauseWhenEditing: false`
    sends nothing.
  - `game-runner-host` case: `active={false}` sends `setVisible({ visible: false })`.
  - `game-runner-toolbar` case: the first control is the Play button, it carries `gradient-border` and
    `gradient-border--hover`, and its accessible name is `Run` when idle and `Show the running game` when live.
  - `games-settings-store` case: a file without `pauseWhenEditing` reads `true`.
- [ ] Human check (folded into H): the controls sit centred over the stage in Studio and Gamer; the Play ring and glow
  read on hover in light and dark; with reduced motion on, the ring does not spin.

### C — Level format, kit loader and the scene jump [L · 4-8h]

- [x] Net-new `packages/shared/src/game-level.ts` (zod only; exported from the shared barrel)
  - `GAME_LEVELS_DIR = 'levels'`, `GAME_LEVEL_EXT = '.tmj'`, `GAME_LEVEL_PARAM = 'midnite-level'` (beside
    `GAME_DETERMINISM_PARAMS`), `GAME_LEVEL_MAX_BYTES = 4 * 1024 * 1024`, `GAME_LEVEL_IMAGES_MAX_BYTES = 8 * 1024 * 1024`.
  - `GameSceneNameSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'use lowercase letters, digits, - and _')` —
    lives in `media-game.ts` (the manifest needs it) and is re-exported here.
  - `GAME_LEVEL_ENTITY_TYPES_2D = ['spawn', 'exit', 'enemy', 'pickup', 'hazard', 'checkpoint', 'trigger', 'npc']`;
    `GAME_LEVEL_ENTITY_TYPES_3D = ['spawn', 'exit', 'prop', 'enemy', 'pickup', 'light', 'checkpoint', 'trigger', 'npc',
    'path']`. Custom types are allowed in the file; these are the palette.
  - `GameLevelSchema`: a **loose** read of a Tiled map (`.passthrough()` at every level, so a map saved by Tiled with
    fields this app never writes round-trips): `type: 'map'`, `orientation: 'orthogonal' | 'isometric'`, `infinite:
    false`, `width`, `height`, `tilewidth`, `tileheight`, `layers` (tile layers with `data`, object groups with
    `objects`; other layer kinds kept untouched), `tilesets` (embedded only: an entry with `source` is an issue —
    `Tileset "<name>" is external. Embed it (Tiled ▸ Map ▸ Embed Tileset) and save again.`), optional `properties`.
  - `parseGameLevel(value): { ok: true; level: GameLevel; dimension: '2d' | '3d' } | { ok: false; issues:
    GameManifestIssue[] }` — never throws; `infinite: true` is an issue with the same wording Sprites' import uses.
  - Map properties (Tiled `properties: [{ name, type, value }]`): `midnite.level` (int, `1`), `midnite.dimension`
    (`'2d' | '3d'`, absent → `'2d'`). 3D only: `midnite.metresPerTile` (float, default `1`), `midnite.terrain` (string,
    the name of a `terrain` asset in `assets/index.json`, optional), `midnite.groundY` (float metres, default `0`, used
    when there is no terrain).
  - `levelEntityToWorld(entity, level)` — the 3D mapping of Decision 3, pure, used by the editor's inspector and pinned
    against the kit's copy by an agreement test (below).
  - `GameManifestSchema` gains `levels: z.object({ dir: z.literal('levels').default('levels'), start:
    GameSceneNameSchema }).optional()` — present means "this game's code reads its levels from files" (Decision 14).
- [x] Additive fields in [`shared/src/sprite/tiled.ts`](../../../packages/shared/src/sprite/tiled.ts): `TiledPropertySchema =
  z.object({ name: z.string().min(1), type: z.enum(['string', 'int', 'float', 'bool', 'color', 'file']).default('string'),
  value: z.unknown() })`; `TiledObjectSchema` gains optional `properties`, `class` and `polyline: z.array(z.object({ x,
  y }))`; `TiledMapSchema` and both layer kinds gain optional `properties`. `buildTmj` output is byte-identical (no
  new keys written), so Sprites' tests and exports do not move.
- [x] `cellAt(map, px, py): { x: number; y: number } | null` in [`map-view.ts`](../../../packages/shared/src/sprite/map-view.ts),
  the inverse of `cellOrigin` for both orientations (`null` off the map), with cases in `map-view.test.ts`.
- [x] Kit — engine-free net-new `templates/media-game/kit/core/level.js`
  - `currentLevel(fallback)` reads `?midnite-level=` (validated with the same regex; anything else → `fallback`);
    `levelUrl(name)` → `levels/${name}.tmj`; `fetchLevel(name)` → parsed JSON (a 404 rejects with `Level "<name>" not
    found in levels/.`).
  - `levelProps(map)`, `levelGrid(map, layerName)` (rows of gids, `0` empty), `levelEntities(map, layerName =
    'objects')` → `{ id, name, type, x, y, width, height, rotation, polyline, properties }[]` (`type` falls back to
    `class`, as `tiled-objects.js` already does), `toWorld3d(entity, map)` → `{ position: [x, y | null, z], yaw, pitch,
    roll, scale, size: [x, y, z] }` (`y` null when `elevation` is absent: snap to ground).
  - `tiled-objects.js` is unchanged; `level.js` re-exports `tiledObjects` and `collisionGrid` so starters import one module.
- [x] Kit — engine builders
  - Net-new `kit/phaser/level.js`: `preloadLevel(scene, name)` (queues `levelUrl(name)` under key `level:<name>`);
    `buildLevel(scene, name, { render })` → `render: true` delegates to `buildTiledMap` (tile layers drawn, `collision`
    solid and hidden); `render: false` (layout mode, what the starters use — Decision 13) returns `{ map, grid(layer),
    entities, spawn }` and draws nothing. `KitLevelScene extends KitScene` reads `data.level ?? currentLevel(start)` in
    `init(data)` and exposes `this.levelName`.
  - Net-new `kit/three/level.js`: `buildLevel3d({ scene, physics, materials, loadModel, heightAt }, map)` — for each
    3D entity: a `prop`/`trigger` rectangle without `model` becomes a box of footprint × `sizeY` (default 3 m) with a
    static collider unless `collider: 'none'`; with `model`, the model loads through `kit/three/gltf.js` by asset name
    and gets a box collider of its bounds unless `collider: 'none'`; a `light` becomes a point light (`intensity`,
    `range`, `color` properties); a `path` returns its world XZ points; `elevation` absent → `heightAt(x, z)` (the
    terrain's sampler, from `kit/core/heightfield.js`) or `midnite.groundY`. Returns `{ spawns, entities, paths }`.
- [x] Kit — `goto` on the hook
  - [`hook.js`](../../../templates/media-game/kit/core/hook.js) default: `goto(name)` validates `name`, rewrites
    `location.search` with `midnite-level=<name>` (every other param, determinism included, kept) and
    `location.replace(...)`; returns `true`. Allowed by the runner's `will-navigate` guard (same scheme and host).
  - [`boot.js`](../../../templates/media-game/kit/phaser/boot.js) passes a `goto` that, when the game has a scene keyed
    `level`, runs `game.scene.start('level', { level: name })` in place and `history.replaceState`s the same param (so
    a later hot reload lands on the same level); otherwise falls back to the default.
  - `getState().level` reports the current level name (`KitLevelScene.levelName`, or `currentLevel('main')` in three);
    `GameStateSchema` gains `level: z.string().optional()`. `scene` keeps meaning the engine's scene key.
  - `KIT_VERSION` and `GAME_KIT_VERSION` → `'0.12.0'`; `kit-hash.json` regenerated (`kit-hash.test.ts` says how);
    `HOOK_VERSION` stays `1` — `goto` is additive and main feature-detects it.
- [x] Main — level ops in a net-new `packages/features/media-game/main/games/game-levels.ts`, exposed on the service
  - Every op resolves the game with `service.resolve(gameId)`, validates `scene` with `GameSceneNameSchema`, and confines
    every path to `<game>/levels/` (a resolved path outside it → `failure('That level is outside the game\'s levels
    folder.')`). Nothing throws.
  - `levels(gameId)` → `ok({ scenes: { scene, bytes, dimension: '2d' | '3d' | null, issue: string | null }[], start:
    manifest.levels?.start ?? null, readsLevels: manifest.levels !== undefined })`, sorted with `start` first; a missing
    `levels/` is `scenes: []`.
  - `levelGet(gameId, scene)` → `ok({ level: unknown, issues, images: { path: string; dataUrl: string }[] })` — the raw
    JSON, `parseGameLevel`'s issues, and every embedded tileset image resolved relative to the `.tmj`, confined to the
    game folder, PNG/WebP only, stopping at `GAME_LEVEL_IMAGES_MAX_BYTES` with an issue naming the first one skipped.
  - `levelSet(gameId, scene, level, opts: { create?: boolean })` → validates with `parseGameLevel` (first issue →
    failure), serialised size ≤ `GAME_LEVEL_MAX_BYTES`, `create` refuses an existing file (`A scene named "<scene>"
    already exists.`) and the reverse refuses a missing one. Inside `writeQueue.run(game.path, ...)`: write
    `levels/<scene>.tmj` (2-space JSON + newline) via temp + rename, `git add -- levels/<scene>.tmj`, then `git commit
    -m "Edit level <scene>" -- levels/<scene>.tmj` (`Add level <scene>` on create) — the pathspec keeps the user's
    other uncommitted work out of the commit; unchanged content makes no commit. Sends `gamesChanged { reason:
    'level' }` (`GamesChangedSchema` gains `'level'`). Answers `ok({ sha: string | null })`.
  - `goto(gameId, scene)` → runner `goto`, below.
- [x] Main — runner
  - `RunnableGame.level?: string`; `gameEntryUrl` adds `midnite-level=<scene>` when set (with or without determinism).
  - `runner.goto(gameId, scene): Promise<GitOpResult<{ via: 'hook' | 'reload' | 'next-run' }>>` — not running →
    remember `nextLevel[gameId]` for the next `run` and answer `next-run` (picking a scene never starts a stopped game);
    running → the runner's `exec` helper (only a literal `true` counts) over `(() => { const m = window.__midnite; if (m && typeof m.goto === 'function') {
    m.goto(${JSON.stringify(scene)}); return true; } return false; })()` → `hook`; `false` (a pre-0.12 kit, or a
    hand-written game) → `loadURL(gameEntryUrl({ ...game, level: scene }))` → `reload`. A popped-out run is reached the
    same way (the view is the same).
  - The watcher is unchanged: a level save hot-reloads a running game at its current URL, which is how an edit to the
    scene being played shows up (Decision 12).
- [x] IPC: `gamesLevels: 'mstudio:games:levels'`, `gamesLevelGet: 'mstudio:games:level-get'`, `gamesLevelSet:
  'mstudio:games:level-set'`, `gamesGoto: 'mstudio:games:goto'` (channels, request schemas in `ipc/schemas.ts`, the
  `games.levels.{list,get,set}` and `games.goto` bridge methods, handlers in `media-game/main/index.ts`, the manifest's
  `ipc` list, Studio's preload and Gamer's bridge)
- [x] Tests (vitest)
  - Net-new `game-level.test.ts`: a Sprites `buildTmj` map parses as a 2D level; a 3D fixture parses with
    `dimension: '3d'`; an external tileset, an infinite map and a bad scene name each give their issue;
    `levelEntityToWorld` for point, rotated rectangle and `metresPerTile: 2` cases.
  - Net-new `kit-level.test.ts` (node, imports the kit file like `kit-core.test.ts`): `currentLevel` parsing and
    rejection; `levelEntities` with `class` fallback and properties; `toWorld3d` equals shared `levelEntityToWorld` over
    the same fixtures (the agreement test); `hook.goto` rewrites the query and keeps determinism params (jsdom
    `location` stub).
  - `kit-core-three.test.ts` case: `buildLevel3d` with a fake physics adds one collider per box prop and none for
    `collider: 'none'`; elevation absent uses `heightAt`.
  - Net-new `game-levels.test.ts` (temp git repo): list order and issues; get confines images and caps bytes; set
    writes, commits only the level file with another file left dirty, makes no commit when unchanged, refuses
    `../x`, refuses create-over-existing.
  - `game-runner.test.ts` cases: `gameEntryUrl` with `level`; `goto` answers `next-run` / `hook` / `reload` against
    the fake webContents; `nextLevel` is used once.
  - `kit-hash.test.ts` and `tiled.test.ts` stay green unchanged.

### D — 2D tile and entity editor, and the scene picker [L · 4-8h]

- [x] Net-new `renderer/level/use-levels.ts`: `GAME_KEYS.levels(gameId)` (`['games', 'levels', gameId]`) and `GAME_KEYS.level(gameId, scene)` (`['games', 'levels', gameId, scene]`, under the same prefix) queries over
  the C bridge; `useSaveLevel` (invalidates both and the list); `useGotoScene`. `gamesChanged { reason: 'level' }`
  invalidates `['games', 'levels']` in `useGameEvents`.
- [x] Net-new `renderer/level/level-edit-model.ts` — pure, no React
  - State: the level JSON, active layer id, selection, `dirty`, an undo stack capped at 100 entries (oldest dropped).
  - Ops: `paint(layer, cells, gid)`, `erase(layer, cells)`, `fillRect(layer, from, to, gid)`, `pick(layer, cell)`,
    `addObject(layer, { type, x, y, width?, height? })` (id from `nextobjectid`, which it bumps), `moveObject`,
    `deleteObject`, `setObjectField` (name, type, x, y, width, height, rotation), `setProperty` / `removeProperty`
    (typed: string, int, float, bool), `addLayer(kind, name)`, `renameLayer`, `toggleVisible`, `undo`, `redo`,
    `serialise()` (the level with every field it did not touch preserved).
  - Snapping: 2D objects snap to the cell centre unless Alt is held.
- [x] Net-new `renderer/level/level-canvas.tsx` — draws with `map-view.ts` (`tileOf`, `sourceRect`, `cellOrigin`,
  `cellAt`, `collisionAt`) so it matches Sprites' preview; `collision` cells get a translucent red overlay; object
  layers draw typed markers (`spawn` green, `exit` blue, others neutral, using existing theme tokens) with the name
  under them; the hovered cell is outlined. Wheel zooms around the pointer (0.25× – 8×), Space-drag or middle-drag pans.
  Isometric maps draw and hit-test through the same functions.
- [x] Net-new `renderer/level/level-editor.tsx` — the editor tab's content
  - Toolbar: tools **Paint** (`B`), **Erase** (`E`), **Rectangle** (`R`), **Pick** (`I`), **Entity** (`O`),
    **Select** (`V`) as a `role="radiogroup"`; undo/redo buttons; **Save** (disabled when clean, shows `Saving…`).
    The letter keys and `Mod+z` / `Mod+Shift+z` act only while the canvas has focus — they are not added to the global
    command registry, so they never fight the app's chords.
  - Left of the canvas: the layer list (tile and object layers, visibility eye, active highlight, add tile layer / add
    object layer, rename on double-click). Right: the tileset palette (every embedded tileset's tiles, the selected one
    ringed) for tile tools, or the entity palette (`GAME_LEVEL_ENTITY_TYPES_2D` plus `Custom…`) for the entity tool, and
    under it the inspector for the selected entity (name, type, x, y, width, height, custom properties with add/remove).
  - Banner when `readsLevels` is false: `This game does not read level files yet. Edits are saved, but Play will not
    show them until its scenes load levels/ — the game-build skill has the recipe.`
  - A level with issues opens read-only with the first issue in a banner; the picker can still jump to it.
  - Loading → skeleton; no scenes → `EmptyState` `No levels yet` with **New scene**; a get failure → its message with
    **Retry**.
- [x] Net-new `renderer/level/scene-picker.tsx` in B's `sceneSlot` (Decision 9)
  - A select labelled **Scene**, listing `levels/*.tmj` names with the manifest's `start` scene marked `(start)`, and a
    trailing **New scene…** item. Disabled with no game.
  - Picking a scene: if the open level is dirty, a confirm (`Save changes to <scene>?` — **Save**, **Discard**,
    **Cancel**); then it opens the level in the editor **and** calls `games.goto({ gameId, scene })`. The answer's
    `via` is shown as a transient notice only for `next-run` (`The next run starts at <scene>.`). The picker shows
    the level the editor has open, not the game's: when the game moves to another level by itself (an exit), the
    picker does not follow — the game's own level is in `getState().level`.
  - Switching tabs keeps the open level and its undo stack (a per-`gameId` zustand store); switching games or scenes
    goes through the dirty confirm.
- [x] Net-new `renderer/level/new-scene-dialog.tsx`
  - Name (validated live with `GameSceneNameSchema`, `A scene named "<x>" already exists.` against the list), size in
    tiles and tile size prefilled from the manifest's perspective: platformer 50×17 @ 32 px, top-down 40×30 @ 32,
    isometric 20×20 @ 64×32 (isometric orientation), raycaster 24×12 @ 64 with a `walls` layer instead of `ground`;
    3D (Theme E) 80×80 @ 32 with `midnite.metresPerTile = 1` and no tile layers.
  - **Start from** Blank: a `ground` (or `walls`) tile layer, a `collision` tile layer, an `objects` layer with one
    `spawn` (the template's palette tileset joins it when F ships one). Creates with `levelSet(..., { create: true })`,
    then opens it.
  - When the game has no `levels` key yet, creating the first scene also offers **Make this the start scene**
    (unchecked by default), which sets `levels: { dir: 'levels', start: <scene> }` through `games.manifest.set` — the
    explicit opt-in of Decision 14.
- [ ] **Start from a map asset** in the New scene dialog: any `map` asset already imported into this game
  (`manifest.assets` kind `map`, `assets/map/<name>/map.tmj`), copied with its tileset `image` paths rewritten relative
  to `levels/`. Not built in this pass: the renderer has no channel that reads a game file outside `levels/`, so it
  needs a small read op first (`rewriteTilesetImages` in `new-scene-model.ts` is the pure half, tested).
- [x] Tests (vitest/jsdom)
  - Net-new `level-edit-model.test.ts`: paint/erase/rect produce the right `data`; undo/redo round-trip and the 100 cap;
    object ids follow `nextobjectid`; `serialise` keeps unknown fields; the result passes `parseGameLevel`.
  - Net-new `scene-picker.test.tsx`: picking calls `level-get` then `goto`; a dirty level prompts and **Cancel** leaves
    both untouched; `next-run` shows the notice.
  - Net-new `level-editor.test.tsx`: tool radios and their keys (canvas focused), Save disabled when clean, the banner
    for `readsLevels: false`, the read-only banner for an invalid level, the empty state's **New scene**.
  - Net-new `new-scene-dialog.test.tsx`: name validation, perspective defaults, the map-asset path rewrite, the start
    scene manifest write.
- [ ] One functional e2e, `packages/app/e2e/game-level-editor.spec.ts`, over the mock bridge: paint three cells by
  pointer drag, undo once, save, and assert the `level-set` payload. Header comment names the capability it needs:
  **real canvas pointer input and `getBoundingClientRect` hit-testing**. Declared in the e2e budget
  (`scripts/e2e-budget.mjs`) with that reason. No screenshot assertion.

### E — 3D placement editor [M · 2-4h]

- [x] `level-editor.tsx` switches to plan-view placement mode when `parseGameLevel` says `dimension: '3d'`; tile tools
  and the tileset palette are hidden (a 3D level has object layers only — Decision 3).
- [x] Canvas: a metres grid (1 m lines, 10 m bold) from `midnite.metresPerTile`; +X right, +Z down, as seen from above;
  an outline of the terrain's extent when `midnite.terrain` names a terrain asset whose pack manifest gives one (and the
  pack's preview image under it when the pack carries one — the builder checks the pack format, and draws only the
  outline otherwise). Entities draw as footprints (rectangles) or markers (points) with a yaw tick.
- [x] Tools: **Select/Move** (`V`, drag), **Place** (`O`, point entities from `GAME_LEVEL_ENTITY_TYPES_3D`), **Volume**
  (`R`, drag a rectangle → a `prop` box, `sizeY` 3 m), **Path** (`P`, click points, Enter to finish → a polyline
  `path`), **Rotate** (drag around the entity; 15° steps with Shift). Yaw writes Tiled's own `rotation`.
- [x] Inspector adds: elevation (m; empty = snap to ground), sizeY (m), pitch, roll (degrees), scale, model (a select of
  this game's `model` assets from `manifest.assets`; empty = box), collider (`box` / `none`), and for `light`:
  intensity, range, colour. World coordinates read-only, from shared `levelEntityToWorld`, so what the inspector says
  is what the kit builds.
- [x] `level-edit-model.ts` 3D ops: `rotateObject` (snap), `setVolume`, `addPathPoint` / `finishPath`, all undoable.
- [x] Tests (vitest): model cases (yaw ↔ `rotation` sign, snap, volume default `sizeY`, path finish); an inspector
  case that the world position shown equals `levelEntityToWorld`; the editor hides tile tools for a 3D level.

### F — Starters read their levels from files [L · 4-8h]

- [x] 2D bases — each `bases/<base>/levels/level.tmj` holds today's layout exactly, and `src/scenes/level.js` builds
  from it through `kit/phaser/level.js` in layout mode, keeping every procedural texture, light and juice call:
  [`platformer`](../../../templates/media-game/bases/platformer/src/scenes/level.js) (ground row, the three one-way
  ledges, three coins, the walker, the spawn at 64,400), `top-down`, `isometric`, `raycaster`.
- [x] 2D genres — fps's `LEVEL_ASCII` and crime's `city.js` emit their `.tmj` once into `genres/<g>/levels/level.tmj`;
  `genre/index.js` reads the file through `fetchLevel` with the same `collisionGrid` / `tiledObjects` calls; the ASCII
  stays as a comment for reference. `rts` and `arpg` read their spawns and points from the base level's `objects`.
- [x] 3D bases and genres — `first-person`, `third-person` and the six 3D genre scenes
  (`character-action`, `fighter`, `open-world`, `rpg`, `shooter`, `soulslike`) move their crates, ramps, arenas,
  enemies and spawns into `levels/level.tmj` (3D conventions) and call `buildLevel3d`; boxes keep their materials by
  `type`/`name` (the scene maps them, not the file). `open-world` sets `midnite.terrain = 'world'` (its `TERRAIN`
  asset) and leaves the heightfield in the terrain pack.
- [x] Every composed starter's manifest gets `levels: { dir: 'levels', start: 'level' }` (written where
  [`game-scaffold.ts`](../../../packages/features/media-game/main/games/game-scaffold.ts) /
  [`compose.ts`](../../../packages/features/media-game/main/games/compose.ts) write the rest), and composition copies
  the right `levels/` (genre over base, as `src/` already layers).
- [x] Existing games: nothing rewrites their `src/`. After a kit upgrade (0.12.0) they have `level.js`, the builders and
  `goto`; their hard-coded scenes keep running; the editor shows the D banner until their manifest has `levels`. The
  game-build skill (Theme G) carries the migration recipe an agent follows on request.
- [x] Tests (vitest)
  - Net-new `starter-levels.test.ts`: for every base × allowed genre composition, `levels/level.tmj` passes
    `parseGameLevel` with the right dimension, the manifest's `levels.start` names an existing file, and the scene
    source imports `kit/phaser/level.js` or `kit/three/level.js`.
  - Layout regression: the platformer file's entities and cells equal today's hard-coded coordinates (coins at
    332,372 / 552,302 / 792,232, walker at 900, spawn at 64,400); the fps file's walls equal `LEVEL_ASCII`.
  - [`templates-2d.test.ts`](../../../packages/features/media-game/main/games/templates-2d.test.ts),
    [`kit-genres-3d.test.ts`](../../../packages/features/media-game/main/games/kit-genres-3d.test.ts),
    [`genre-fidelity.test.ts`](../../../packages/features/media-game/main/games/genre-fidelity.test.ts) and
    `game-scaffold.test.ts` stay green; where they assert scene source that moved into the file, update the assertion to
    the file, not delete it.

> Landed notes: the palette is `PALETTE_KINDS` in `level-palette.ts` (nine tiles: the eight kinds plus a second wall, since
> the raycaster's wall ids run 1 to 9), drawn through the runtime's `encodePngRgba8` by `composeStarter` into a 2D game's
> `levels/palette.png`. The `level.tmj` files carry the embedded tileset (`image: palette.png`). Crime's solid layer is
> `buildings` and the raycaster family's is `walls`, so a base scene never builds a genre's own world from `collision`. 3D
> levels are origin-centred, so their objects have negative pixel coordinates. `arpg` stays procedural (its dungeon is
> generated, there is no layout to move), `rts` keeps its ridges in code, and the shooter's extra cover crates stay in its genre module.

### G — Level tools for agents [M · 2-4h]

- [x] Four tools appended to `GAME_MCP_TOOL_IDS` in [`media-game-mcp.ts`](../../../packages/shared/src/media-game-mcp.ts)
  and the id union in [`mcp.ts`](../../../packages/shared/src/mcp.ts)
  - `game_level_list` `{ game }` → `{ scenes, start, readsLevels }` (read).
  - `game_level_get` `{ game, scene }` → `{ level, issues }` — the JSON only, no images (read).
  - `game_level_set` `{ game, scene, level, create? }` → `{ ok: true, gameId, sha }` (write; same validation, size cap
    and single-file commit as `levelSet`).
  - `game_goto` `{ game, scene }` → `{ gameId, via }` (write: it changes a running game).
  - `GAME_MCP_READ_TOOL_IDS` gains the two reads; the writes are refused with `GAMES_OFF_MESSAGE` while
    `allowGames` is off, like every other write. `GAME_AGENT_TOOL_IDS` picks all four up by derivation, so an agent run
    can edit levels. None is slow.
- [x] Adapters in [`game-mcp.ts`](../../../packages/features/media-game/main/games/game-mcp.ts) over the C service ops;
  a failure becomes `McpToolError('invalid', message)` (or `not-found` for an unknown game or scene).
- [x] `mcp.test.ts`'s write set gains `game_level_set` and `game_goto`; the MCP tool-list tests that enumerate game tools
  (and Gamer's shim list, derived from `GAME_AGENT_TOOL_IDS`) stay green by derivation.
- [x] Skill: a **Levels** section in `midnite-media-game-build` — the four copies
  ([`.claude`](../../../.claude/skills/midnite-media-game-build/SKILL.md), `.agents`, `.codex`, and the one games ship
  with, [`templates/media-game/skills/midnite-media-game-build/SKILL.md`](../../../templates/media-game/skills/midnite-media-game-build/SKILL.md),
  same edit in all four): where levels live, the 2D and 3D conventions, the four tools, "save then the hot reload shows
  it", and the migration recipe for a pre-0.12 game (upgrade the kit, move the layout into `levels/level.tmj`, build
  from it with the kit builders, add `levels` to the manifest, check with `game_goto` + `game_state`).

### H — Verification [S · 30m-2h]

- [ ] CI gate green (`moon run :typecheck :lint :test` runs in CI; the local gate is not run on this machine).
- [ ] Human pass in Studio (packaged or dev), recorded in this doc's Headlines: Open Game on a game outside the games
  root (listed, selected, in the repos panel) and on a folder with no manifest (toast); select a game → Level editor
  tab; Run → Play mode with the console drawer; back to the editor → the game pauses and resumes on return.
- [ ] Human pass on a new platformer: paint a ledge, move a coin, Save (one commit, `git log` shows `Edit level
  level`), the running game hot-reloads with the change; New scene `cave`, pick it → the editor opens it and the running
  game restarts in `cave`.
- [ ] Human pass on a new third-person game: add a volume and a model prop, rotate it, Save, see it in Play; and in
  Gamer, Open Game survives a relaunch and the same 2D edit works.

## Files this phase touches

| File | Theme | Change |
|------|-------|--------|
| [`packages/shared/src/media-game.ts`](../../../packages/shared/src/media-game.ts) | A, B, C | edited — add schemas, `pauseWhenEditing`, `GameSceneNameSchema`, manifest `levels`, `GamesChangedSchema` reasons, `GameStateSchema.level` |
| `packages/shared/src/game-level.ts` + `.test.ts` | C | **net-new** |
| [`packages/shared/src/sprite/tiled.ts`](../../../packages/shared/src/sprite/tiled.ts) · [`map-view.ts`](../../../packages/shared/src/sprite/map-view.ts) + tests | C | edited — additive Tiled fields, `cellAt` |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · `schemas.ts` · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | A, C | edited — `gamesAdd`, level and goto channels |
| [`packages/shared/src/media-game-mcp.ts`](../../../packages/shared/src/media-game-mcp.ts) · [`mcp.ts`](../../../packages/shared/src/mcp.ts) · `mcp.test.ts` | G | edited |
| `packages/features/media-game/main/games/game-open.ts` · `game-levels.ts` + tests | A, C | **net-new** |
| [`game-service.ts`](../../../packages/features/media-game/main/games/game-service.ts) · [`games-runtime.ts`](../../../packages/features/media-game/main/games/games-runtime.ts) · [`game-runner.ts`](../../../packages/features/media-game/main/games/game-runner.ts) · [`games-settings-store.ts`](../../../packages/features/media-game/main/games/games-settings-store.ts) | A, B, C | edited |
| [`game-mcp.ts`](../../../packages/features/media-game/main/games/game-mcp.ts) | G | edited |
| [`media-game/main/index.ts`](../../../packages/features/media-game/main/index.ts) · [`media-game/manifest.ts`](../../../packages/features/media-game/manifest.ts) | A, C | edited — handlers, `ipc` list |
| [`kit-hash.json`](../../../packages/features/media-game/main/games/kit-hash.json) | C | regenerated for 0.12.0 |
| [`game-tab.tsx`](../../../packages/features/media-game/renderer/game-tab.tsx) · [`game-explorer.tsx`](../../../packages/features/media-game/renderer/game-explorer.tsx) · [`use-games.ts`](../../../packages/features/media-game/renderer/use-games.ts) | A, B | edited |
| [`game-runner-toolbar.tsx`](../../../packages/features/media-game/renderer/game-runner-toolbar.tsx) · [`game-runner-host.tsx`](../../../packages/features/media-game/renderer/game-runner-host.tsx) | B | edited — Play button, `active` |
| `packages/features/media-game/renderer/game-center.tsx` + test | B | **net-new** |
| `packages/features/media-game/renderer/level/{use-levels.ts,level-edit-model.ts,level-canvas.tsx,level-editor.tsx,scene-picker.tsx,new-scene-dialog.tsx}` + tests | D, E | **net-new** |
| [`game-detail-panel.tsx`](../../../packages/features/media-game/renderer/game-detail-panel.tsx) | — | **unchanged** — the detail column stays the game's summary and the agent panel |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) · [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | A, C | edited — `pickFolder`, bridge methods |
| [`packages/modules/gamer/main/context.ts`](../../../packages/modules/gamer/main/context.ts) · [`bridge.ts`](../../../packages/modules/gamer/main/bridge.ts) · `opened-games.ts` + test | A, C | edited / **net-new** store |
| [`apps/gamer/main/index.ts`](../../../apps/gamer/main/index.ts) | A | edited — `pickGameFolder` |
| [`games-root-section.tsx`](../../../packages/app/src/features/settings/settings-pages/games-root-section.tsx) | B | edited — the pause switch |
| `templates/media-game/kit/core/level.js` · `kit/phaser/level.js` · `kit/three/level.js` | C | **net-new** |
| [`kit/core/hook.js`](../../../templates/media-game/kit/core/hook.js) · [`kit/phaser/boot.js`](../../../templates/media-game/kit/phaser/boot.js) · [`kit/three/loop.js`](../../../templates/media-game/kit/three/loop.js) | C | edited — `goto`, `level` in state, `KIT_VERSION` |
| `templates/media-game/{bases,genres}/*/levels/level.tmj` · `main/games/level-palette.ts` (the palette image, generated at scaffold, never committed) | F | **net-new** |
| `templates/media-game/{bases,genres}/*/src/scenes/level.js` · `genres/{fps,crime}/src/genre/*` | F | edited — build from the file |
| [`game-scaffold.ts`](../../../packages/features/media-game/main/games/game-scaffold.ts) · [`compose.ts`](../../../packages/features/media-game/main/games/compose.ts) | F | edited — `levels` in the manifest, copy `levels/` |
| `.claude/` · `.agents/` · `.codex/` · `templates/media-game/` `skills/midnite-media-game-build/SKILL.md` | G | edited (same edit ×4) |
| `packages/app/e2e/game-level-editor.spec.ts` · [`scripts/e2e-budget.mjs`](../../../scripts/e2e-budget.mjs) | D | **net-new** spec, budget entry |
| [`.midnite/tasks/_INDEX.md`](../_INDEX.md) | — | this phase's row |

## Verification

- [ ] `moon run :typecheck :lint :test` green in CI.
- [ ] `game-open.test.ts`, `game-service-add.test.ts`, `opened-games.test.ts`, `game-explorer.test.tsx` (A).
- [ ] `game-center.test.tsx`, `game-tab-mode.test.tsx`, the runner-host, toolbar and settings-store cases (B).
- [ ] `game-level.test.ts`, `kit-level.test.ts` (including the kit ↔ shared agreement), `game-levels.test.ts`, the runner
  `goto` cases, `map-view` `cellAt` (C).
- [ ] `level-edit-model.test.ts`, `scene-picker.test.tsx`, `level-editor.test.tsx`, `new-scene-dialog.test.tsx` and the
  one e2e (D); the 3D model and inspector cases (E).
- [x] `starter-levels.test.ts` and the layout regression; existing template tests green (F).
- [ ] The MCP id, read-set and write-set tests (G).
- [ ] **Open, for a human:** the passes listed under H.

## Not in this phase

- **Removing an opened game from the list.** In Studio a game listed through its repo leaves with the repos panel's
  remove; Gamer has no removal yet. Tracked in `outstanding.md` when this phase lands (see the open question below).
- **Turning a folder with no manifest into a game.** Open Game adds existing Midnite games; making one is New game's job,
  and writing a manifest into someone else's repo is a different, riskier feature.
- **A 3D viewport, gizmos or terrain sculpting in the editor.** Plan view plus Play mode covers placement; terrain
  stays the Terrain tab's (Phase 105) and the heightfield never goes into a `.tmj`.
- **Multi-floor 3D levels beyond per-entity elevation**, prefab authoring, navmesh editing (the kit builds its navmesh
  at runtime), light baking.
- **Tiled features the kit does not read**: infinite maps, external `.tsx`/`.tsj` tilesets (embed them), hexagonal and
  staggered orientations, image layers, group layers (kept on round-trip, not edited), Wang/terrain auto-painting.
- **Autosave and per-keystroke commits.** Save is explicit, one commit each.
- **Rewriting an existing game's `src/` automatically** to read level files. The skill's recipe, run by an agent on
  request, is the path.
- **A global chord for Save or the editor tools**; the keys act while the canvas has focus.
- **Committed screenshots or visual baselines** for any of this.

## Decisions / open questions

All resolved unless marked open. Items 1, 2, 4 and 8 are the user's calls, recorded with the reasoning we agreed;
the coordinator relayed 9–11 from the user as layout requirements.

1. **Resolved — levels are Tiled JSON (`.tmj`) in the game repo, one file per scene at `levels/<scene>.tmj`.** Agreed
   because Phaser loads Tiled natively, Media ▸ Sprites already writes and imports Tiled maps (so a Sprites map becomes
   a scene by a copy), the kit already reads the `.tmj` shape, and a human can open the same file in Tiled itself.
2. **Resolved — 2D and 3D land together.** Agreed so the format is designed once for both rather than retrofitted:
   2D perspectives (platformer, top-down, isometric, raycaster) get a tile-and-entity editor, 3D perspectives
   (first-person, third-person, open-world and the other 3D genres) a placement editor over the same canvas and model.
3. **Resolved — a 3D level is a plan-view Tiled map of object layers; the terrain stays separate.** The map is
   `orthogonal`, viewed from above with +X right and +Z down; `midnite.metresPerTile` (default 1) converts pixels to
   metres (`worldX = x / tilewidth × mpt`, `worldZ = y / tileheight × mpt`). An object is a placement: a point is a
   position, a rectangle a footprint (centre computed with Tiled's rotation about the object's origin), a polyline a
   `path`. Height lives in custom properties — `elevation` (world Y of the base; absent → snap to the terrain or
   `midnite.groundY`), `sizeY` (vertical size of a volume, default 3 m), `pitch`/`roll` in degrees, `scale`, `model`
   (a `model` asset by name), `collider` (`box` | `none`) — and **yaw is Tiled's own `rotation`** (clockwise from above,
   so three's `rotation.y = −rotation × π/180`). The heightfield, splat and foliage stay in the terrain pack named by
   `midnite.terrain`; the level only refers to it. We chose this because it is the conventional way Tiled is used for
   3D (a top-down placement layer with properties, the shape engine importers read), it keeps the file valid Tiled, it
   lets one parser, one canvas and one undo model serve both dimensions, and it puts nothing in the level that the
   Terrain tab already owns. A `blocks` tile layer for 3D blockouts was considered and dropped: rectangle volumes with
   `sizeY` do the same job without a tileset image.
4. **Resolved — the scene picker opens and jumps.** Agreed: picking a scene opens its level in the editor **and**
   restarts the running game at that scene. The jump is `window.__midnite.goto(scene)` when the kit has it (Phaser
   restarts its `level` scene in place; the default reloads with `?midnite-level=`), a reload with that param from main
   when it does not, and for a stopped game it only sets where the next run starts — picking never starts a game.
5. **Resolved — a scene is a level file.** The picker lists `levels/*.tmj`; the manifest's `levels.start` is the
   scene a plain run opens. `getState().level` reports the level name; `scene` keeps meaning the engine's scene key, so
   no existing play-test assertion on `scene` changes meaning.
6. **Resolved — Open Game reuses the repo registration path.** Studio's `registerRepo` is `openRepo` plus the watcher
   reconcile, which is what the repos panel does, so an opened game is a registered repo (Timeline, asset provenance and
   the #1125 listing all follow). Gamer has no repo list, so it gets a small `opened-games.json` behind the same two
   ports instead of a second mechanism in the feature. The dialog is a main-side dep, as Sprites' `pickTiledMap` is.
7. **Resolved — what Open Game accepts.** A folder whose git work-tree top has `midnite-game.json` (picking a subfolder
   opens the game); outside the games root is fine; an invalid manifest is still added so it can be fixed. Refused, with
   the reason: not a folder, not a git repository, a manifest inside a bigger repo, no manifest at all.
8. **Resolved — the phase doc first, then build theme by theme; Open Game is Theme A, small and independent**, so it
   can land before any of the level work.
9. **Resolved — the editor lives in the centre panel and the scene picker sits in the centre tab strip.** The detail
   column already holds the game's summary over the agent's iterate panel; the picker acts on the centre (the editor
   and the running game), and in the strip it stays visible on both tabs.
10. **Resolved — Play mode is a tab; leaving it pauses the run by default.** A run started from the Play button pauses
    when the editor tab is shown and resumes on return (only if we paused it), behind `pauseWhenEditing` (default on).
    Runs started by an agent, MCP or a play-test keep going, because pausing them would break the agent's screenshots
    or the play-test's frame count. The native view is hidden under the editor either way — it floats above the DOM.
11. **Resolved — run controls in the centre of the top bar, led by a gradient Play button.** The name moves left, export
    stays right. The button uses the existing `.gradient-border` family (`@bilo-io/ui`, present in every host) and the
    glow values of Studio's `.gradient-border--glow`, so no new colour enters the app; the spin respects reduced motion
    upstream and the glow is static.
12. **Resolved — Save writes the file and makes one commit; no autosave.** Games already commits its own writes (asset
    imports, kit upgrades, agent passes), Gamer has no git UI to commit by hand, and a dirty tree blocks a kit upgrade.
    The commit names only the level file, so other uncommitted work is left alone. The runner's existing hot reload is
    what shows the edit in Play; Save does not jump.
13. **Resolved — starters use the level for layout and keep their procedural visuals.** The file holds positions and
    kinds; the scene keeps its lit textures and juice, so `genre-fidelity` does not regress. A game with real Sprites art
    switches the Phaser builder to render mode and draws the tile layers.
14. **Resolved — existing games keep working and opt in explicitly.** A kit upgrade brings the loader, the builders and
    `goto`; nothing rewrites a game's `src/`. The manifest's `levels` key is the opt-in that says "my scenes read these
    files", and the editor's banner says so until it is there.
15. **Resolved — agents get four level tools.** Reads (`game_level_list`, `game_level_get`) answer whenever the server is
    on; writes (`game_level_set`, `game_goto`) sit behind `allowGames` like every other game write, and an agent run's
    private server gets all four.
16. **Resolved — the editor draws with Sprites' `map-view.ts`, and the Tiled schema grows additively.** One drawing path
    means a map looks the same in Sprites and in a game; `buildTmj`'s output is unchanged so no Sprites export moves.
17. **Open — should Theme A also offer "Remove from list"?** Recommended: not now. In Studio a game leaves with its
    repo in the repos panel; Gamer would need a `forget` op and a row menu. It is small, but A was asked to stay
    small; if wanted, it is one more channel and one menu item in A.
18. **Resolved — the template palette image is generated at scaffold time and never committed.** Agreed with the user: the
    2D starters' tile palette (`palette.png`) is drawn from code by `composeStarter` when a game is created, using the
    runtime's PNG encoder, so the template tree carries no binary for it and a test asserts no `*.png` sits under any
    `templates/media-game/**/levels/`. The `.tmj` embeds the tileset and names the image; a scaffolded game gets the file.
