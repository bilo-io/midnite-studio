# Phase 140 — Play in editor

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `9e395a8df`.

Testing a level today means Save (a commit), switch to the game tab, Run, walk from the scene's spawn to the bit
being tested, and on any file change sit through a full page reload. Every engine shortens that loop the same way —
Unity's Play mode, Unreal's Play In Editor and "Play From Here", Godot's "Run Current Scene", LDtk and Tiled's
"run command" — and this phase does too:

- **Play from here** (`F5`): run the **unsaved** level starting at the cursor or the selected object, without a
  commit, in the existing runner.
- **Level hot reload**: saving a level restarts only the scene (`goto`), not the page.
- **Live entities**: the running game reports its entities; the editor draws them as ghosts over the plan and the 3D
  view, and "Copy live position" brings a tuned position back.
- **Debug overlays**: colliders, triggers and the nav-mesh, drawn in the editor and toggled in the game.

Agents get `game_play_from`, `game_entities` and `game_debug_overlay`.

> **Builds on.**
> - **The runner** — `packages/features/media-game/main/games/game-runner.ts` (`WebContentsView` per run,
>   `gameEntryUrl` L61, `startWatcher` + `isReloadTrigger` L140, `goto` L495 which calls the hook or reloads with
>   `?midnite-level=`, `nextLevel` for a stopped game); `game-state.ts` (`GET_STATE_JS`, `evalWithTimeout`,
>   `GAME_STATE_TIMEOUT_MS`); `game-protocol.ts` (`gameProtocolHandler` L151, `resolveGameFile` L102) serving
>   `mstudio-game://<gameId>/<path>` on the run's own session.
> - **The kit hook** — `templates/media-game/kit/core/hook.js` (`KIT_VERSION` L20, `getState`, `goto` →
>   `gotoByReload`, `setOverlay`, `extendHook`); `kit/core/level.js` (`LEVEL_PARAM = 'midnite-level'` L20);
>   `kit/three/nav.js` (`createNavMesh`); `kit/core/tiled-objects.js` (`collisionGrid`).
> - **The kit bump recipe** — `GAME_KIT_VERSION` (`packages/shared/src/media-game.ts` L54) and `KIT_VERSION`
>   (`hook.js` L20) move together, and `packages/features/media-game/main/games/kit-hash.json` is refreshed (the
>   failing `kit-hash.test.ts` prints the new hash). `kit-upgrade.ts` copies the new kit into existing games.
> - **Phase 138** — the editor bridge and tool recipe (Theme C, "The tool recipe" section).
> - **Phase 137 Theme A** — the multi-selection (a selected spawn-able object is the default start point).
>
> **Depends on:** Phase 138 (C and the tool recipe), Phase 137 (A). **Unlocks:** Phase 142 Theme F's reachability
> rule reuses D's entity snapshot shape; Phase 144 Theme I's streaming debug view uses G.
>
> **Scope guardrails.** The run keeps its sandbox: no new privileges, the CSP from `gameCsp` unchanged, the preview
> overlay is served by the same protocol handler. No commit is made by play-from-here. Every kit change is a kit bump.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.
> Every theme here is at most **M**.

## Headlines

**Theme A — The kit's spawn override.** ◻ `?midnite-spawn=x,y[,z]` (and `__midnite.spawnAt(x, y, z)`) places the
player there instead of at the scene's `spawn`; kit bump to 0.13.0.

**Theme B — Play from here.** ◻ `F5` / a gradient "Play from here" button runs the open, unsaved level in the
runner from the cursor or the selection, through an in-memory preview overlay the protocol handler serves; no
commit.

**Theme C — Level hot reload.** ◻ A change under `levels/` in a running game calls the hook's `goto(currentScene)`
(scene restart) instead of a full page reload; code changes still reload the page.

**Theme D — The entities snapshot.** ◻ The kit hook's `entities()` returns `{ id, type, x, y, z?, alive, … }` for
the live objects; main polls it at 4 Hz while the editor asks, over `mstudio:games:entity-state`.

**Theme E — Live ghosts in the editor.** ◻ Live entities draw as ghosts over the plan and the 3D view with a
`StateDot` "Live" chip; "Copy live position" writes one back as one undo step.

**Theme F — Editor collider and trigger overlays.** ◻ A View menu with Colliders (tile collision grid, volumes) and
Triggers (trigger volumes, exits), drawn in both views.

**Theme G — In-game debug draw.** ◻ `__midnite.debug({ colliders, triggers, nav })` draws the same overlays in the
running game (Phaser graphics, three.js line segments), and the nav-mesh is fetched into the editor; kit bump.

**Theme H — MCP.** ◻ `game_play_from`, `game_entities` and `game_debug_overlay`, and the skill learns the loop.

## Build order

1. **A** (kit) → **B** (needs A) → **C** (independent; small).
2. **D** (kit + main) → **E**.
3. **F** (editor only) → **G** (kit, reuses F's overlay model).
4. **H** last. A, D and G share **one** kit bump if they land together (0.13.0); landed separately, each bumps the
   patch (0.13.0, 0.13.1, 0.13.2).

## Deliverables

### A — The kit's spawn override (S)

**Files.**

| File | Change |
|---|---|
| `templates/media-game/kit/core/level.js` | edit: `SPAWN_PARAM = 'midnite-spawn'`, `spawnOverride(): { x, y, z? } \| null` (pixels for 2D, metres for 3D, parsed and validated) |
| `templates/media-game/kit/core/hook.js` | edit: `spawnAt(x, y, z?)` default = reload with the param (like `gotoByReload`); `KIT_VERSION = '0.13.0'` |
| `templates/media-game/kit/phaser/level.js`, `templates/media-game/kit/three/level.js` | edit: the player spawn reads `spawnOverride()` before the `spawn` object |
| `packages/shared/src/media-game.ts` | edit: `GAME_KIT_VERSION = '0.13.0'` |
| `packages/features/media-game/main/games/kit-hash.json` | regenerate |
| `packages/features/media-game/main/games/kit-level.test.ts` | edit: the param parser and both spawn paths |

- `midnite-spawn=120,48` (2D, px) / `midnite-spawn=12.5,0,-3` (3D, metres; `y` is height, dropped onto the ground
  when the kit has a heightfield). A malformed value is ignored (the `spawn` object wins) and logged once.
- Determinism params (`?seed=`, …) are kept, exactly as `gotoByReload` keeps them.

**Acceptance.**

- [ ] A1. `spawnOverride` parses 2- and 3-value forms, rejects `NaN`, extra values and an empty string.
- [ ] A2. The 2D and 3D level builders place the player at the override when present, at `spawn` otherwise
  (`kit-level.test.ts` with the existing fixtures).
- [ ] A3. `kit-hash.test.ts` passes with the regenerated hash; both version constants read `0.13.0`.

**Done when** A1–A3 pass.

### B — Play from here (M)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level.ts` | edit: `GameLevelPreviewRequestSchema`, result |
| `packages/shared/src/ipc/channels.ts` | edit: `CHANNELS.gamesLevelPreview = 'mstudio:games:level-preview'`, `gamesLevelPreviewEnd = 'mstudio:games:level-preview-end'` |
| `packages/shared/src/ipc/schemas.ts`, `ipc/bridge.ts`, `packages/desktop/src/preload/index.ts`, `packages/features/media-game/manifest.ts`, `packages/app/test-support/mock-bridge.ts` | edit: `games.levels.preview(req)`, `games.levels.previewEnd(req)` |
| `packages/features/media-game/main/games/game-preview-overlay.ts` (+ test) | net-new |
| `packages/features/media-game/main/games/game-protocol.ts` (+ test) | edit: `gameProtocolHandler` takes an optional `overlay(pathname) => Buffer \| null` checked before the disk |
| `packages/features/media-game/main/games/game-runner.ts` (+ test) | edit: `run(gameId, { level, spawn, preview })`; the URL gains `midnite-spawn` |
| `packages/features/media-game/renderer/level/play-from-here.tsx` (+ test) | net-new: the button and `F5` |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: mount it in the toolbar |

```ts
export const GameLevelPreviewRequestSchema = z.object({
  gameId: z.string().min(1), scene: GameSceneNameSchema, level: z.unknown(),
  spawn: z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite().optional() }).nullable(),
});
export const GameLevelPreviewResultSchema = z.object({ url: z.string(), via: z.enum(['started', 'restarted']) });

// game-preview-overlay.ts
export type PreviewOverlay = { set(gameId: string, scene: string, json: string): void; get(gameId: string, pathname: string): Buffer | null; clear(gameId: string): void };
export function createPreviewOverlay(maxBytes = GAME_LEVEL_MAX_BYTES): PreviewOverlay;
```

- **Isolation.** The overlay holds exactly one file per game, `levels/<scene>.tmj`, in memory; the protocol handler
  serves it in place of the file on disk with the same MIME and CSP. Nothing is written, nothing is committed, and
  the repo's working tree is untouched. The overlay is cleared on `previewEnd`, on Stop, and when the editor saves
  that scene (the disk now matches).
- **Start point.** Selection (with 137 A, the primary selected object) → its position; else the last plan/3D
  cursor position over the canvas; else no override (the scene's `spawn`). 3D uses metres through
  `levelEntityToWorld`.
- **The button**: in the level toolbar, right-aligned, styled exactly as the Games Run button —
  `gradient-border gradient-border--always` with the brand fill (`packages/features/media-game/renderer/game-runner-toolbar.tsx:89`)
  — `LuPlay` icon, label "Play from here", `Tooltip` "Play the unsaved level from the selection (F5)". While
  starting, the icon becomes a `Spinner` (`packages/frame/src/layout/spinner.tsx`). After start the editor switches
  to the game's Run tab (the same tab change `Open in game` uses) unless the runner is popped out
  (`game-popout.ts`), in which case it stays and the popout reloads.
- `F5` is local to the level editor's `onKeyDown` (added to 137 J's `LEVEL_SHORTCUTS`); `Shift+F5` stops (Visual
  Studio / Unity muscle memory).
- A running game is restarted at the preview URL (`via: 'restarted'`); a stopped one is started.
- The runner's file watcher keeps working: a code change during a preview reloads with the overlay still applied.

**Acceptance.**

- [ ] B1. `createPreviewOverlay` serves `levels/<scene>.tmj` for its game only, `null` for any other path or game,
  and refuses JSON over `GAME_LEVEL_MAX_BYTES`.
- [ ] B2. `gameProtocolHandler` with an overlay answers the overlay bytes with the CSP header; without one, the disk
  file (existing tests stay green).
- [ ] B3. `gameEntryUrl` with `spawn` adds `midnite-spawn=` and keeps determinism params.
- [ ] B4. Preview leaves `git status` clean (main test against a temp repo).
- [ ] B5. The button shows a spinner while the promise is pending and is disabled on a read-only level.
- [ ] B6. `F5` triggers preview; `Shift+F5` calls stop.

**Done when** B1–B6 pass.

### C — Level hot reload (S)

**Files.** `packages/features/media-game/main/games/game-runner.ts` (+ `game-runner.test.ts`).

```ts
export type ReloadKind = 'none' | 'scene' | 'page';
export function reloadKind(relPaths: readonly (string | null)[]): ReloadKind;  // every path under levels/ (not levels/prefabs/… which is also a scene change) → 'scene'; any other trigger → 'page'
```

- The watcher collects paths over the existing 200 ms debounce; `scene` → `exec(run, HOOK_CALL('goto',
  JSON.stringify(currentScene)))` where `currentScene` comes from `getState().scene` (fallback `run.game.level`);
  if the hook call fails (old kit), the page reloads as today.
- A preview run (B) treats a save of the previewed scene as `scene` too (the overlay was cleared, so `goto` loads
  the disk file).

**Acceptance.**

- [ ] C1. `reloadKind(['levels/cave.tmj'])` is `scene`; `['src/main.js', 'levels/cave.tmj']` is `page`; `[null]` is
  `page`.
- [ ] C2. A `scene` reload calls `goto` through the hook, not `reloadIgnoringCache` (runner test with a fake view).
- [ ] C3. A failing hook call falls back to the page reload.

**Done when** C1–C3 pass.

### D — The entities snapshot (M)

**Files.**

| File | Change |
|---|---|
| `templates/media-game/kit/core/hook.js` | edit: `entities?: () => GameEntitySnapshot[]` in the hook's type; a registry `registerEntities(fn)` the genre kits call |
| `templates/media-game/kit/phaser/level.js`, `kit/three/level.js` | edit: register a source that maps live level objects to snapshots |
| `packages/shared/src/media-game.ts` | edit: `GameEntitySnapshotSchema`, `GAME_ENTITIES_MAX = 500` |
| `packages/shared/src/ipc/channels.ts` | edit: `CHANNELS.gamesEntities = 'mstudio:games:entities'` (invoke), `EVENT_CHANNELS.gamesEntityState = 'mstudio:games:entity-state'` |
| `packages/features/media-game/main/games/game-entities.ts` (+ test) | net-new: read + the 4 Hz poller |
| `packages/features/media-game/main/games/game-runner.ts` | edit: `entities(gameId)` using `evalWithTimeout` |
| bridge / preload / manifest / mock bridge | edit: `games.entities.get(req)`, `games.entities.watch(req)` → unsubscribe, `games.onEntityState(handler)` |

```ts
export const GameEntitySnapshotSchema = z.object({
  id: z.number().int().nullable(),          // the level object id the entity came from; null for spawned-at-runtime
  type: z.string().max(64), name: z.string().max(200).optional(),
  x: z.number(), y: z.number(), z: z.number().optional(),   // level units: px for 2D, metres for 3D
  alive: z.boolean(), state: z.string().max(64).optional(),
});
export const GameEntitiesResultSchema = z.object({ scene: z.string(), frame: z.number().int(), entities: z.array(GameEntitySnapshotSchema).max(GAME_ENTITIES_MAX), truncated: z.boolean() });
export const GAME_ENTITY_POLL_MS = 250;
```

- The poller runs only while at least one subscriber (`watch`) is active and the game is running and **not paused**
  (a paused game's last snapshot stays); it stops on window blur (`visibilityState`-style gate the app already uses
  for idle CPU, Phase 25) and on Stop. Each tick sends one `gamesEntityState` event; a slow game (eval > 200 ms)
  skips ticks rather than queueing.
- Old kits (no `entities`) answer `{ entities: [], truncated: false }` with a one-time `useNotify` in the editor
  "Update the game's kit to see live entities" and an Upgrade button (the existing `kitUpgrade`).

**Acceptance.**

- [ ] D1. `GameEntitiesResultSchema` caps at 500 and the reader sets `truncated`.
- [ ] D2. The poller emits at 4 Hz with fake timers, pauses with zero subscribers, and stops on Stop.
- [ ] D3. Phaser and three level sources map a fixture's objects to snapshots with their level ids
  (`kit-level.test.ts`).
- [ ] D4. A pre-0.13 kit answers an empty list.

**Done when** D1–D4 pass.

### E — Live ghosts in the editor (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/live/use-live-entities.ts` (+ test) | net-new: subscribes while the toggle is on |
| `packages/features/media-game/renderer/level/live/live-chip.tsx` (+ test) | net-new |
| `packages/features/media-game/renderer/level/level-plan-draw.ts`, `3d/level-scene.tsx` | edit: ghost layer |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: the toggle and the chip |
| `packages/features/media-game/renderer/level/level-context-menu.ts` (137 I) | edit: "Copy live position" |

- Toggle **Live** in the toolbar (`IconButton`, `LuRadio`), enabled only while the game runs. On, a chip shows
  `StateDot` (`packages/frame/src/layout/state-dot.tsx`) green-pulsing (static under reduced motion — the dot's own
  guard) + "Live · 23 entities".
- Ghosts: plan — a hollow circle in `hsl(var(--primary) / 0.7)` with the type's initial; 3D — a translucent capsule.
  A ghost whose `id` matches a level object draws a thin dashed line from the authored position to the live one
  (Unreal's "simulate" diff, Godot's remote tree), so drift is visible.
- **Copy live position**: on an object with a live twin, sets its `x`/`y` (and 3D height) from the snapshot, one
  undo step; also available in the inspector as an `IconButton` beside the position fields.

**Acceptance.**

- [ ] E1. The hook subscribes on toggle-on and unsubscribes on toggle-off and unmount.
- [ ] E2. A ghost with a matching id produces a dashed connector in the plan draw list.
- [ ] E3. Copy live position is one undo step and changes only position.
- [ ] E4. The toggle is disabled while the game is stopped.

**Done when** E1–E4 pass.

### F — Editor collider and trigger overlays (S)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level-overlays.ts` (+ test) | net-new: `colliderShapes(level)`, `triggerShapes(level)` — pure, from the same rules as `kit/core/tiled-objects.js` `collisionGrid` |
| `packages/features/media-game/renderer/level/3d/level-view-store.ts` | edit: `overlays: { colliders: boolean; triggers: boolean; nav: boolean }` (merge sanitiser default all false; no version bump — the store has no migrate) |
| `packages/features/media-game/renderer/level/level-plan-draw.ts`, `3d/level-scene.tsx` | edit: draw them |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: a **View** `Popover` with three `SwitchRow`s (`packages/frame/src/form/toggle-rows.tsx`) |

- Colliders: tile cells whose tileset `kind` is solid (`ground`, `wall`, `ledge`, `oneway` as one-way) in 2D;
  `volume` objects with `solid` in 3D. Triggers: `exit`, `checkpoint`, `trigger`, `hazard`. Colours (HSL tokens in `packages/app/src/styles.css`): colliders
  `hsl(var(--health-warn))`, triggers `hsl(var(--callout-note))`, 30 % fill + 1 px stroke.
- An agreement test runs `colliderShapes` and the kit's `collisionGrid` over the starter fixtures and asserts the
  same solid cells.

**Acceptance.**

- [ ] F1. Agreement with `collisionGrid` on every 2D starter fixture.
- [ ] F2. Toggling persists through the view store (rehydrate test).

**Done when** F1–F2 pass.

### G — In-game debug draw (M)

**Files.**

| File | Change |
|---|---|
| `templates/media-game/kit/core/hook.js` | edit: `debug(opts)` on the hook, default no-op |
| `templates/media-game/kit/phaser/debug-draw.js` | net-new: Phaser `Graphics` overlay of the collision grid and trigger zones |
| `templates/media-game/kit/three/debug-draw.js` | net-new: `LineSegments` of volume boxes, triggers and `createNavMesh`'s polygons |
| `templates/media-game/kit/three/nav.js` | edit: export `navMeshPolygons(nav)` |
| kit version constants + `kit-hash.json` | bump |
| `packages/features/media-game/main/games/game-runner.ts` | edit: `debug(gameId, opts)` via `HOOK_CALL` |
| `packages/shared/src/media-game.ts` | edit: `GameDebugOptionsSchema = z.object({ colliders: z.boolean(), triggers: z.boolean(), nav: z.boolean() })`, `GameNavMeshSchema` (`{ polygons: [number, number][][] }`, metres, ≤ 20,000 vertices) |
| `packages/shared/src/ipc/channels.ts` | edit: `gamesDebug = 'mstudio:games:debug'`, `gamesNavMesh = 'mstudio:games:nav-mesh'` |
| bridge / preload / manifest / mock bridge | edit |

- The View popover's switches also call `games.debug` when the game runs, so editor and game show the same
  overlays. `nav` in the editor draws the polygons fetched with `games.navMesh` (`__midnite.navMesh()` serialised)
  — the editor never computes a nav-mesh itself (one source of truth: the kit's).
- `kit-core-three.test.ts` covers `navMeshPolygons` on a fixture; the Phaser and three debug modules get smoke tests
  with the existing kit stubs.

**Acceptance.**

- [ ] G1. `debug({ colliders: true })` on a running game toggles the overlay (runner test asserts the exec string).
- [ ] G2. `navMeshPolygons` returns closed polygons in metres for the third-person fixture.
- [ ] G3. A 30,000-vertex nav-mesh is refused with a message, not sent.

**Done when** G1–G3 pass and the kit hash test is green.

### H — MCP (S)

**Tools** (Phase 138's tool recipe):

| Tool | Kind | `allowGames` | Input → output |
|---|---|---|---|
| `game_play_from` | write (runs code) | yes | `{ game, scene, at?: { x, y, z? }, objectId?: number, unit?: 'px' \| 'm', useEditor?: boolean }` → `{ url, via, source: 'editor' \| 'file' }` |
| `game_entities` | read | no | `{ game, types?: string[], limit?: number }` → `GameEntitiesResultSchema` |
| `game_debug_overlay` | UI | yes | `{ game, colliders?, triggers?, nav? }` → `{ applied: GameDebugOptions }` |

- `game_play_from` with `useEditor` (default `true`) previews the editor's unsaved level when it is open (bridge
  `snapshot`, Phase 138 C), else the file; `objectId` resolves the start to that object's position. It joins
  `GAME_SLOW_TOOL_IDS` (`packages/shared/src/media-game-mcp.ts`), like `game_run`.
- `game_entities` is the agent's "where is everything now" after `game_input`; it does not need the editor.
- Skill `## Levels` (seven copies): a "Testing a level" paragraph — play from the changed area, read
  `game_entities`, `game_screenshot`, adjust.

**Acceptance.**

- [ ] H1. `game_play_from` with `objectId` starts at that object's position (mocked runner records the spawn).
- [ ] H2. `game_entities` works with `allowGames` off; the other two refuse.
- [ ] H3. Skill copies identical; pin regenerated; `skills.test.ts` green.

**Done when** H1–H3 pass.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `templates/media-game/kit/core/hook.js`, `kit/core/level.js`, `kit/phaser/level.js`, `kit/three/level.js`, `kit/three/nav.js` | A D G | edit |
| `templates/media-game/kit/phaser/debug-draw.js`, `kit/three/debug-draw.js` | G | net-new |
| `packages/shared/src/media-game.ts` (version, schemas), `game-level.ts`, `ipc/*` | A B D G | edit |
| `packages/shared/src/game-level-overlays.ts` (+ test) | F | net-new |
| `packages/features/media-game/main/games/kit-hash.json` | A D G | regenerate |
| `packages/features/media-game/main/games/game-runner.ts`, `game-protocol.ts` (+ tests) | B C D G | edit |
| `packages/features/media-game/main/games/game-preview-overlay.ts`, `game-entities.ts` (+ tests) | B D | net-new |
| `packages/desktop/src/preload/index.ts`, `packages/features/media-game/manifest.ts`, `packages/app/test-support/mock-bridge.ts` | B D G | edit |
| `packages/features/media-game/renderer/level/play-from-here.tsx`, `live/*` (+ tests) | B E | net-new |
| `packages/features/media-game/renderer/level/level-editor.tsx`, `level-plan-draw.ts`, `3d/level-scene.tsx`, `3d/level-view-store.ts`, `level-context-menu.ts` | B E F | edit |
| MCP recipe files + seven skill copies | H | edit |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` (shared, media-game, desktop); eslint on changed files; vitest on the
  touched suites including `kit-level.test.ts`, `kit-core-three.test.ts`, `kit-hash.test.ts`,
  `game-protocol.test.ts`, `game-runner.test.ts`; `scripts/skill-copies.test.mjs`; the pin test; `node
  scripts/tracker-check.mjs`.
- [ ] **Gate — the built app, throwaway `--user-data-dir`**: a platformer with an unsaved moved platform → F5 from a
  selected object starts there and shows the moved platform; `git status` clean; Save → the game restarts the scene
  without a page reload (the console shows no reload); Live on → ghosts move; Copy live position on an enemy;
  View ▸ Colliders on in both editor and game; third-person: Nav on draws the nav-mesh in both. Shots under
  `/tmp/midnite-shots-p140/`.

## Not in this phase

- **Simulate in the editor viewport** (Unreal's Simulate, Unity's Scene view while playing): the game stays in its
  sandboxed runner; the editor shows ghosts, not the game.
- **Editing the running game's state** (move an entity live). Copy live position goes one way, game → level.
- **Breakpoints and a scripted debugger** — DevTools on the runner already exists.
- **Recording play sessions** — `game_replay_record` / `game_replay_play` already cover it.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Preview through an in-memory overlay**, not a temp file or a stash: nothing touches the repo, a crash leaves
   nothing behind, and the protocol handler is already the single choke point every byte passes through.
2. **Play from here** is Unreal's name for it and `F5` is Visual Studio's and Godot's run key (Godot: F5 project, F6
   current scene; here F5 plays the current scene because the level editor has no other run target).
3. **Scene restart, not page reload, for level edits** — Godot's "reload current scene", and it keeps the audio
   context and DevTools attached. Code changes still reload the page (a module graph cannot be hot-swapped safely).
4. **Entities are polled, not pushed**, at 4 Hz with a pause/blur gate: a push stream from the sandbox would need a
   new preload in the game's view; `executeJavaScript` already exists and is bounded by `evalWithTimeout`.
5. **The nav-mesh comes from the kit**, never recomputed in the editor, so what is drawn is what the AI uses.
6. **One kit bump if A, D and G land together** — every bump makes existing games offer an upgrade; batching keeps
   that prompt to one.
