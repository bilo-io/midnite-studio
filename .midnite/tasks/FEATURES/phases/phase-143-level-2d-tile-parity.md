# Phase 143 — 2D tile editing parity

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `9e395a8df`.

The 2D level editor paints one tile id at a time: Paint (`B`), Erase (`E`), Rectangle (`R`), Pick (`I`) over
`level-edit-model.ts`'s `paint` / `fillRect`. That was enough for the starters' nine-colour palette and is far from
what a 2D level designer expects of Tiled, LDtk, Unity's Tile Palette or Godot's TileMap:

- **Auto-tiling** — paint "grass" and the edges and corners pick themselves (Tiled wangsets, LDtk auto-layer
  rules, Godot terrains, Unity Rule Tiles).
- **Stamps** — pick a block of tiles and paint it, flipped or rotated (Tiled's stamp brush, Unity's box-pick).
- **Flood fill** — the bucket every tile editor has.
- **Animated tiles** — water and torches that move in the editor and the game.
- **Start from a map asset** — open an imported Tiled map as a new scene (deferred from Phase 132).
- **Isometric polish** — the editor's isometric mode made comfortable.

Agents get `game_tiles_paint`, `game_tiles_fill`, `game_tiles_autotile` and a `tiles` level op.

> **Builds on.**
> - **The 2D editor** — `packages/features/media-game/renderer/level/level-editor.tsx` (`LevelTool` L79, `TOOLS`
>   L82–87), `level-edit-model.ts` (`paint` L148, `fillRect` L160, `beginStroke` / `endStroke`, `cellCentre` L434,
>   `mapPointToObject` L419), `level-canvas.tsx`, `level-plan-draw.ts`, `level-plan.ts`.
> - **New scene** — `new-scene-dialog.tsx`, `new-scene-model.ts` (`buildBlankLevel` L40, `rewriteTilesetImages` L88,
>   already written for this case but not wired).
> - **The format** — `packages/shared/src/game-level.ts` (`parseGameLevel`, tileset parsing, `GameLevelGetResult.images`).
> - **The kit** — `templates/media-game/kit/phaser/tiled.js` (`buildTiledMap`), `kit/phaser/level.js`,
>   `kit/core/iso.js`.
> - **Phase 137** — selection, clipboard, shortcut table (`level-shortcuts.ts`, Theme J) every new tool registers in.
> - **Phase 138** — `LevelOpSchema`, `applyLevelOps`, the tool recipe, the change-set banner.
>
> **Depends on:** Phase 137 (J), Phase 138 (A, C, F). **Independent of** 139–142. **Unlocks:** nothing in this
> roadmap; it closes the 2D gap.
>
> **Scope guardrails.** Tiled-compatible data only: wangsets and tile animations are Tiled's own JSON, so a level
> edited here opens in Tiled and vice versa. The kit change is a kit bump.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.
> Every theme here is at most **M**.

## Headlines

**Theme A — Wangsets in the model.** ◻ Parse, type and preserve Tiled `wangsets` (corner, edge and mixed) on
tilesets; a pure `autotile(layer, cells, wangset, colour)` resolves tile ids.

**Theme B — The terrain brush.** ◻ Tool `T`: pick a wang colour, paint; neighbours update; one undo per stroke.

**Theme C — The wangset editor.** ◻ A modal over the tileset: create a wangset, name colours, click tile corners /
edges to assign them — the minimum of Tiled's Terrain Sets editor to make A usable without Tiled.

**Theme D — The stamp brush.** ◻ Drag-select tiles in the palette or `Alt`-drag on the map to take a stamp; paint it;
`X` / `Y` flip, `Z` rotate (Tiled's keys), stored with Tiled's flip bits.

**Theme E — Flood fill.** ◻ Tool `G` (Tiled's bucket key): fill a contiguous region of the same tile, 4-connected;
`Shift` fills every matching cell on the layer.

**Theme F — Animated tiles in the editor.** ◻ Tiled `animation` frames play in the plan; reduced motion shows the
first frame; a small frame editor in the tile inspector.

**Theme G — Animated tiles in the kit.** ◻ The Phaser builder plays tile animations; kit bump.

**Theme H — Start from a map asset.** ◻ New scene ▸ "From a map asset": `mstudio:games:map-asset-get` reads an
imported `map` asset; `rewriteTilesetImages` re-roots its images; saved as a new scene.

**Theme I — Isometric polish.** ◻ Diamond cell highlight, isometric rectangle and fill, depth-sorted objects and a
correct grid for staggered maps (read-only for staggered).

**Theme J — MCP.** ◻ `game_tiles_paint`, `game_tiles_fill`, `game_tiles_autotile`, a `tiles` level op; the skill.

## Build order

**A** → **B** → **C**; **D**, **E** independent; **F** → **G**; **H**, **I** independent; **J** last.

## Deliverables

### A — Wangsets in the model (M)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level-wang.ts` | net-new |
| `packages/shared/src/game-level-wang.test.ts` | net-new |
| `packages/shared/src/game-level.ts` | edit: tileset schema keeps `wangsets` (passthrough today → typed, still optional) |
| `packages/shared/src/index.ts` | edit |

```ts
export const WangColorSchema = z.object({ name: z.string(), color: z.string(), tile: z.number().int(), probability: z.number().default(1) });
export const WangTileSchema = z.object({ tileid: z.number().int().nonnegative(), wangid: z.array(z.number().int().min(0).max(255)).length(8) });
export const WangSetSchema = z.object({ name: z.string(), type: z.enum(['corner', 'edge', 'mixed']), tile: z.number().int().default(-1), colors: z.array(WangColorSchema).max(254), wangtiles: z.array(WangTileSchema) });
export type WangSet = z.infer<typeof WangSetSchema>;
export type TileGrid = { width: number; height: number; data: Uint32Array /* gids incl. flip bits */ };
export function autotile(grid: TileGrid, firstgid: number, set: WangSet, cells: readonly { x: number; y: number }[], colour: number, seed?: number): { x: number; y: number; gid: number }[];
```

- Tiled's wangid order (top, top-right, right, bottom-right, bottom, bottom-left, left, top-left). `autotile`
  writes `colour` at the painted cells' corners (corner sets) or edges (edge sets), then re-resolves the painted
  cells and their 8 neighbours to the best-matching wang tile (Tiled's algorithm: exact match first, else the
  highest-probability candidate with the fewest mismatches; ties by `seed`-driven pick so a repeat is stable).
- A tileset without `wangsets` keeps its JSON byte-identical through a load/save round trip.

**Acceptance.**

- [ ] A1. A Tiled-exported fixture tileset with a corner wangset round-trips unchanged.
- [ ] A2. Painting one grass cell in a dirt field yields the 3×3 block Tiled produces for the same fixture
  (expected ids captured from Tiled and committed in the test).
- [ ] A3. An edge set resolves straight runs and T-junctions.
- [ ] A4. A missing combination picks the closest tile and never throws.

**Done when** A1–A4 pass.

### B — The terrain brush (S)

**Files.** `level-editor.tsx` (tool `terrain`, key `T`, 2D only; registered in `LEVEL_SHORTCUTS`),
`level-edit-model.ts` (`paintTerrain(state, layerId, cells, setIndex, colour)` in a stroke), `level-canvas.tsx`
(brush preview), and a wang colour list in the palette aside (swatch + name; `Alt`-click on the map picks the
colour under the cursor).

**Acceptance.**

- [ ] B1. A three-cell stroke is one undo step and changes neighbours via `autotile`.
- [ ] B2. The tool is hidden when the active tile layer's tilesets have no wangset (an `EmptyState`-style hint
  "Add a terrain set to this tileset" with a button to C).

**Done when** B1–B2 pass.

### C — The wangset editor (M)

**Files.** `packages/features/media-game/renderer/level/wang/wang-editor.tsx` (+ test),
`wang/wang-editor-model.ts` (+ test).

- A `FrameModal` (`packages/frame/src/chrome/frame-modal.tsx`) "Terrain sets — <tileset>": left, the tileset image
  zoomed to fit with each tile split into corner/edge hit zones; right, the set's colours (add, rename, recolour,
  delete with confirm). Click a zone to assign the active colour; right-click clears. Changes apply to the edit state
  as one undo step on Done; Cancel discards.
- External tilesets (`.tsj` files referenced by `source`) are edited only when they are inside `levels/` (written
  with the level on Save); otherwise the editor opens read-only with "This tileset lives in an asset — edit it
  there."

**Acceptance.**

- [ ] C1. Assigning corners updates `wangtiles` with the right wangid slots.
- [ ] C2. Cancel leaves the level untouched; Done is one undo step.
- [ ] C3. An asset-owned external tileset opens read-only.

**Done when** C1–C3 pass.

### D — The stamp brush (M)

**Files.** `packages/shared/src/game-level-tiles.ts` (+ test; net-new: `Stamp`, `takeStamp`, `transformStamp`,
`GID_FLIP_H = 0x80000000`, `GID_FLIP_V = 0x40000000`, `GID_FLIP_D = 0x20000000`, `gidTile`, `gidFlags`),
`level-edit-model.ts` (`paintStamp`), `level-editor.tsx` (the Paint tool takes a stamp), `level-canvas.tsx`
(preview), `level-plan-draw.ts` (draws flipped / rotated tiles).

```ts
export type Stamp = { width: number; height: number; gids: number[] };      // 0 = transparent (skip)
export function transformStamp(s: Stamp, op: 'flipX' | 'flipY' | 'rotateCW' | 'rotateCCW'): Stamp;  // Tiled's flag algebra
```

- Taking: drag across the palette's tiles, or `Alt`-drag on the map (Tiled's "capture"). Paint places the stamp at
  the cursor's top-left; strokes repeat it on a stamp-sized grid. `X` flip horizontal, `Y` vertical, `Z` rotate
  clockwise (`Shift+Z` counter) while Paint is active — Tiled's bindings; `Z` is free in 2D (137's gizmo keys are
  3D only).
- The plan draw honours the three flag bits. Today nothing in `level-plan-draw.ts` or `level-edit-model.ts` strips
  them, so a Tiled map with a flipped tile looks up a nonsense tile id; `gidTile` / `gidFlags` fix that everywhere
  a gid is read (draw, pick, autotile).

**Acceptance.**

- [ ] D1. `transformStamp` composition: four `rotateCW` = identity; `flipX` twice = identity; matches Tiled's flag
  table for all eight orientations.
- [ ] D2. A 2×2 stamp painted is one undo step; transparent cells keep what was there.
- [ ] D3. The draw call for a flipped gid uses a negative scale (2D context spy).

**Done when** D1–D3 pass.

### E — Flood fill (S)

**Files.** `packages/shared/src/game-level-tiles.ts` (`floodFill(grid, at, gid, mode: 'contiguous' | 'global',
max = 1_000_000)`), `level-edit-model.ts` (`fill`), `level-editor.tsx` (tool `fill`, key `G`, `LuPaintBucket`).

- 4-connected, iterative (no recursion), capped; over the cap it notifies and does nothing. With a stamp active,
  fills with the stamp pattern aligned to the click (Tiled's pattern fill). With the terrain brush's colour active
  (`Shift+T` toggles "terrain fill"), runs `autotile` over the filled region.

**Acceptance.**

- [ ] E1. Contiguous fill stops at different tiles; global fill changes every match.
- [ ] E2. A 2,000 × 2,000 empty layer fills without stack overflow and within the cap.
- [ ] E3. Pattern fill tiles a 2×1 stamp across the region.

**Done when** E1–E3 pass.

### F — Animated tiles in the editor (M)

**Files.** `packages/shared/src/game-level.ts` (tile `animation: { tileid, duration }[]` typed),
`level-plan-draw.ts` (frame selection by time), `level-canvas.tsx` (one `requestAnimationFrame` loop only while an
animated tile is visible), `inspector/tile-animation-editor.tsx` (+ test, net-new).

- Time base: `performance.now()`; frame = cumulative durations modulo the total. **Reduced motion**
  (`html[data-motion='reduced']`, or the media query without `data-motion='full'` — the app's convention) or a
  hidden window → the first frame and no loop; the loop also stops when the canvas is offscreen
  (`IntersectionObserver`).
- The tile animation editor (inside the existing tile inspector): a list of frames (tile thumbnail, duration ms),
  add from the palette, reorder by drag, delete; preview plays respecting reduced motion.

**Acceptance.**

- [ ] F1. Frame selection at t = 0, mid-frame and wrap-around.
- [ ] F2. Under reduced motion no animation frame is requested (spy) and frame 0 is drawn.
- [ ] F3. The editor writes Tiled's `animation` array shape.

**Done when** F1–F3 pass.

### G — Animated tiles in the kit (S)

**Files.** `templates/media-game/kit/phaser/tiled.js` (`buildTiledMap` plays `animation` frames by swapping the
tile index on a timer per animated gid), kit versions + `kit-hash.json` (bump), `kit-level.test.ts` or a new
`kit-phaser-tiles.test.ts` beside the existing kit tests.

- The kit honours `prefers-reduced-motion` the same way (first frame), consistent with the editor.

**Acceptance.**

- [ ] G1. The frame scheduler advances indices on the documented durations (fake clock).
- [ ] G2. Kit hash green after the bump.

**Done when** G1–G2 pass.

### H — Start from a map asset (S)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level.ts`, `ipc/channels.ts` (`gamesMapAssetGet = 'mstudio:games:map-asset-get'`), `ipc/schemas.ts`, `ipc/bridge.ts` | edit: `games.levels.mapAsset(req)` |
| preload, `packages/features/media-game/manifest.ts`, mock bridge | edit |
| `packages/features/media-game/main/games/game-levels.ts` (+ test) | edit: `mapAsset(gameId, name)` — reads the asset's `entry` (`map.tmj`), confined, capped at `GAME_LEVEL_MAX_BYTES` |
| `packages/features/media-game/renderer/level/new-scene-dialog.tsx` (+ test) | edit: a third start option "From a map asset" with a select of `map` assets |
| `packages/features/media-game/renderer/level/new-scene-model.ts` (+ test) | edit: `levelFromMapAsset(json, assetName)` = parse + `rewriteTilesetImages` |

- The dialog's existing `Choice` gains the option; with no `map` assets it is disabled with "Import a map asset
  first". The new scene saves through the existing `levels.set` with `create: true`.

**Acceptance.**

- [ ] H1. `mapAsset` answers the map JSON; a non-`map` asset fails.
- [ ] H2. `levelFromMapAsset` re-roots relative tileset images to `../assets/map/<name>/` and leaves absolute and
  `data:` ones.
- [ ] H3. The dialog creates the scene from the chosen asset (mocked bridge).

**Done when** H1–H3 pass.

### I — Isometric polish (M)

**Files.** `level-plan.ts` (iso cell ↔ screen helpers, `isoDiamond(cell)`), `level-plan-draw.ts`, `level-canvas.tsx`,
`packages/features/media-game/renderer/level/level-plan.test.ts`.

- Hover and selection draw the cell's diamond, not its bounding box; Rectangle and Fill operate in map cells
  (already true in the model; the preview now draws diamonds); objects draw sorted by `y` then `x` (screen depth,
  the kit's `core/iso.js` order); the grid draws diamond lines.
- `staggered` / `hexagonal` maps fail `parseGameLevel` today (`orientation: z.enum(['orthogonal', 'isometric'])`,
  `packages/shared/src/game-level.ts` L74), so the editor shows them as unreadable. That stays; the message becomes
  "Staggered and hexagonal maps are not supported yet" instead of the zod path.

**Acceptance.**

- [ ] I1. `isoDiamond` corners for a 64×32 tile at cell (2, 3) match hand-computed values.
- [ ] I2. Object draw order is screen-depth sorted.
- [ ] I3. A staggered fixture opens as unreadable with the plain-language message.

**Done when** I1–I3 pass.

### J — MCP (S)

**Tools** (Phase 138's tool recipe; all writes behind `allowed()`, all applied live in the open editor or as one
commit, through 138 E's `writeLevelOps`):

| Tool | Input |
|---|---|
| `game_tiles_paint` | `{ game, scene, layer, cells: { x, y, tile: number \| null, flipX?, flipY?, rotate? }[] (≤ 10,000), tileset?: string }` — `tile` is the tileset-local id; `null` erases |
| `game_tiles_fill` | `{ game, scene, layer, at: { x, y }, tile, mode?: 'contiguous' \| 'global' }` |
| `game_tiles_autotile` | `{ game, scene, layer, tileset?, wangset: string, color: string, cells?: {x,y}[], rect?: { x, y, width, height } }` |

- **New op**: `{ op: 'tiles', layer, cells: [{ x, y, gid }] }` in `LevelOpSchema` (gids already resolved with flip
  bits); the three tools compile to it. Output: `GameEntityWriteOutputSchema` plus `tilesChanged: number`.
- Skill `## Levels` (seven copies): "Paint terrain with `game_tiles_autotile` when the tileset has a terrain set;
  otherwise `game_tiles_paint` with tileset-local ids from `game_level_get`."

**Acceptance.**

- [ ] J1. `game_tiles_paint` of 3 cells changes exactly 3 cells; out-of-bounds cells are op errors.
- [ ] J2. `game_tiles_autotile` over a rect equals the brush's result for the same cells.
- [ ] J3. Writes refuse while `allowGames` is off; skill copies identical; pin regenerated.

**Done when** J1–J3 pass.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/game-level-wang.ts`, `game-level-tiles.ts` (+ tests) | A D E | net-new |
| `packages/shared/src/game-level.ts`, `game-level-ops.ts`, `ipc/*`, `index.ts` | A F H J | edit |
| `packages/features/media-game/main/games/game-levels.ts` (+ test) | H | edit |
| `packages/features/media-game/renderer/level/wang/*`, `inspector/tile-animation-editor.tsx` | C F | net-new |
| `packages/features/media-game/renderer/level/level-editor.tsx`, `level-edit-model.ts`, `level-canvas.tsx`, `level-plan-draw.ts`, `level-plan.ts`, `new-scene-dialog.tsx`, `new-scene-model.ts`, `level-shortcuts.ts` | B D E F H I | edit |
| `templates/media-game/kit/phaser/tiled.js`, kit versions, `kit-hash.json` | G | edit |
| preload, `packages/features/media-game/manifest.ts`, `packages/app/test-support/mock-bridge.ts` | H | edit |
| MCP recipe files + seven skill copies | J | edit |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` (shared, media-game, desktop); eslint on changed files; vitest on the
  touched suites incl. kit tests; the pin test; `scripts/skill-copies.test.mjs`; `node scripts/tracker-check.mjs`.
- [ ] **Gate — the built app, throwaway `--user-data-dir`**: import a Tiled map with a corner wangset and animated
  water (a CC0 sample), New scene ▸ From a map asset, paint grass with `T` and see edges resolve, take a stamp and
  flip it, bucket-fill, watch the water animate (and stop with Reduce motion on), Save, open the saved `.tmj` in
  Tiled 1.11 and see the same map. Shots under `/tmp/midnite-shots-p143/`.

## Not in this phase

- **LDtk-style rule-based auto-layers** (pattern rules generating a second layer). Wangsets cover the common case and
  are Tiled-native.
- **Staggered and hexagonal maps** — still refused, now with a clear message.
- **Infinite (chunked) maps** — Tiled's `infinite: true` stays unsupported, as Phase 132 decided.
- **A tileset image editor** — sprites and tilesets are made in Media ▸ Sprites.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Wangsets, not a home-grown rule format** — Tiled's own terrain model, so the data round-trips through Tiled and
   the kit already loads Tiled JSON.
2. **Tiled's keys** — `T` terrain brush, `G` bucket fill, `X` / `Y` / `Z` flip and rotate — because Tiled is the
   tool this format comes from and its users will reach for them.
3. **Flip bits decoded everywhere a gid is read** — today they are not stripped at all, which already mis-renders
   Tiled maps that use flips.
4. **Animated tiles respect reduced motion in both editor and kit** — the app's motion convention extends to the
   games it makes.
5. **Staggered maps stay unsupported** with a plain message — a half-right render invites corrupting saves.
