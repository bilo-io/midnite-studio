# Phase 141 — Terrain-aware 3D level editing

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `9e395a8df`.

A 3D level can name a terrain (`midnite.terrain`), and the editor's 3D view (Phase 136) draws it as **flat** ground
tiles textured with the terrain's drape image: `readLevelTerrain` (`game-level-terrain.ts`) returns only the extent
and a preview. So a prop placed on a hillside sits at `midnite.groundY` in the editor and lands somewhere else in
the game, where the kit's `createHeightfield().heightAt` decides. This phase makes the editor see the same ground
the game stands on — the step every terrain editor takes first (Unreal Landscape, Unity Terrain, Godot Terrain3D):

- **The real heightfield** in the editor, decoded once in main from the terrain pack's 16-bit PNG.
- **A sampler that agrees with the kit** to the millimetre, proven by a test that runs both.
- **A chunked, LOD'd terrain mesh** in the 3D view, honouring the Optimisation slider.
- **Placement on the surface**: drop, move and scatter onto the terrain; `End` snaps a selection down (Unreal's
  shortcut); an optional "conform on move".
- **Hillshade in the Floorplan** and an elevation readout, so plan editing reads the land.

Agents get `game_terrain_height` and a `snap: 'terrain'` option on every level op.

> **Builds on.**
> - **Phase 136** — the 3D view: `3d/level-3d-view.tsx` (`levelBounds` L49), `3d/level-scene.tsx` (ground tiles
>   built from `groundTiles` in `3d/level-cull.ts` L77 and `tileGeometry`), `3d/optimisation.ts`
>   (`OptimisationPreset` with `terrainSegments` / `terrainTile`, `OPTIMISATION_PRESETS`), `3d/level-world.ts`
>   (`groundY`, `levelEntityToWorld`-based placement).
> - **The terrain reader** — `packages/features/media-game/main/games/game-level-terrain.ts` (`readLevelTerrain`:
>   asset index → `terrain.manifest.json` → extent + drape preview).
> - **The kit's ground truth** — `templates/media-game/kit/core/heightfield.js` (`createHeightfield`, `heightAt`
>   with Rapier's diagonal split), `kit/core/png16.js` (`decodePng16`), `kit/core/terrain-manifest.js`
>   (`parseTerrainManifest`, `parseHeightfieldInfo`: `{ resolution, worldSize, heightRange, rowMajor: 'z', origin:
>   'centre' }`).
> - **Phase 137** — Theme F's snap (`level-snap.ts`, "surface" snap), Theme G's `groundPoint`
>   (`3d/level-ground.ts`), which this phase upgrades from a plane to the terrain.
> - **Phase 138** — `LevelOpSchema` / `applyLevelOps` (Theme A) and the tool recipe.
> - **Phase 139 Theme H** — the scatter brush, which conforms to terrain here.
>
> **Depends on:** Phase 136 (landed), Phase 137 (F, G), Phase 138 (A). Theme D's scatter conform needs Phase 139 H
> (its acceptance item is skipped with a note if 139 H has not landed). **Unlocks:** Phase 142's reachability on
> slopes, Phase 144's sun shadows on terrain.
>
> **Scope guardrails.** Terrain is read-only here: sculpting stays in Media ▸ Terrain. The heightfield never crosses
> IPC as more than one capped `Uint16` payload. No kit change.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.
> Every theme here is at most **M**.

## Headlines

**Theme A — Heightfield IPC.** ◻ `mstudio:games:level-heightfield` decodes the level's terrain heightfield PNG in main
(a TypeScript port of the kit's `png16.js` over `node:zlib`) and answers the samples as base64 `Uint16` plus the
info, capped at 4097².

**Theme B — The shared sampler.** ◻ `packages/shared/src/game-heightfield.ts`: `createHeightSampler` (the kit's
`heightAt`, triangle split included), `raycastHeightfield` and `normalAt`, with an agreement test against the kit's
own module.

**Theme C — The terrain mesh.** ◻ The 3D view's flat tiles become heightfield chunks with two LODs and skirts,
draped as before; the Optimisation presets gain `terrainLodDistance`.

**Theme D — Placement on the surface.** ◻ Drops, moves, the entity tool and scatter land on the terrain; `End` drops
the selection to the ground; "Conform on move" keeps objects on it while dragging.

**Theme E — Plan hillshade and elevation.** ◻ The Floorplan draws a hillshade under the grid and a status-bar
readout "x 12.4 m · z −3.0 m · elevation 41.2 m".

**Theme F — `game_terrain_height`.** ◻ An MCP read: heights (and normals) at up to 1,000 points.

**Theme G — `snap: 'terrain'` on level ops.** ◻ Every `add` / `update` / `place-prefab` op and `game_level_scatter`
can drop objects onto the terrain.

## Build order

**A** → **B** → **C** and **E** (either order) → **D** → **F** → **G**.

## Deliverables

### A — Heightfield IPC (M)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level.ts` | edit: `GameLevelHeightfieldRequestSchema`, `GameLevelHeightfieldResultSchema`, `GAME_HEIGHTFIELD_MAX_RESOLUTION = 4097` |
| `packages/shared/src/ipc/channels.ts` | edit: `CHANNELS.gamesLevelHeightfield = 'mstudio:games:level-heightfield'` |
| `packages/shared/src/ipc/schemas.ts`, `ipc/bridge.ts`, `packages/desktop/src/preload/index.ts`, `packages/features/media-game/manifest.ts`, `packages/app/test-support/mock-bridge.ts` | edit: `games.levels.heightfield(req)` |
| `packages/features/media-game/main/games/png16.ts` (+ test) | net-new: `decodePng16(buf: Buffer): { width; height; samples: Uint16Array }` |
| `packages/features/media-game/main/games/game-level-terrain.ts` (+ test) | edit: `readLevelHeightfield(gamePath, level)` beside `readLevelTerrain` |
| `packages/features/media-game/main/games/game-levels.ts`, `main/index.ts` | edit: wire the handler |

```ts
export const GAME_HEIGHTFIELD_MAX_RESOLUTION = 4097;
export const GameHeightfieldInfoSchema = z.object({ resolution: z.number().int().min(2).max(GAME_HEIGHTFIELD_MAX_RESOLUTION), worldSize: z.number().positive(), heightRange: z.tuple([z.number(), z.number()]), origin: z.object({ x: z.number(), z: z.number() }) });
export const GameLevelHeightfieldRequestSchema = z.object({ gameId: z.string().min(1), scene: GameSceneNameSchema });
export const GameLevelHeightfieldResultSchema = z.object({ terrain: z.string(), info: GameHeightfieldInfoSchema, samples: z.string() /* base64 little-endian Uint16, resolution² */, sha256: z.string() });
```

- Reads the level from disk (the terrain name is a map property; an unsaved terrain change in the editor is picked
  up on the next save), resolves the pack exactly as `readLevelTerrain` does (`confineToRoot`), reads
  `heightfield.json` through the same parse rules as the kit's `parseHeightfieldInfo`, decodes the PNG with the
  ported decoder (16-bit greyscale only; anything else is a failure naming the bit depth), and checks
  `samples.length === resolution²`.
- `origin` is the world position of the terrain's centre from the pack's extent (the kit's `origin: 'centre'`).
- A level with no terrain answers `failure('This level has no terrain.')` — the renderer treats it as flat ground.
- 4097² × 2 bytes = 32 MB raw, ~45 MB base64: above IPC comfort, so the cap is the kit's own maximum and the
  renderer receives it once per level open and caches it by `sha256`.

**Acceptance.**

- [ ] A1. The port decodes the kit's fixture PNG (`templates/media-game` test fixtures used by `kit-core-three.test.ts`)
  to the same samples as the kit's `decodePng16`.
- [ ] A2. An 8-bit PNG fails with "Heightfield must be a 16-bit greyscale PNG (got 8-bit)."
- [ ] A3. A resolution over 4097 fails without decoding.
- [ ] A4. A terrain path escaping the game folder fails as `readLevelTerrain` does.

**Done when** A1–A4 pass.

### B — The shared sampler (S)

**Files.** `packages/shared/src/game-heightfield.ts` and `game-heightfield.test.ts` (net-new); export from
`packages/shared/src/index.ts`; an agreement test `packages/features/media-game/main/games/heightfield-agreement.test.ts`
(main side, which may import the kit's `.js` by path as the other kit tests do).

```ts
export type HeightSampler = { info: GameHeightfieldInfo; heightAt(x: number, z: number): number; normalAt(x: number, z: number): [number, number, number] };
export function createHeightSampler(samples: Uint16Array, info: GameHeightfieldInfo): HeightSampler;
export function raycastHeightfield(s: HeightSampler, origin: [number, number, number], dir: [number, number, number], maxDistance?: number): [number, number, number] | null; // march + bisection, cell/2 steps
```

- `heightAt` is a line-for-line port of the kit's (`(i + 1, j)`–`(i, j + 1)` diagonal), offset by `origin`.
- **Agreement test**: 10,000 seeded random points over the third-person fixture terrain, `|ts − kit| < 1e-4 m`.

**Acceptance.**

- [ ] B1. The agreement test passes.
- [ ] B2. `raycastHeightfield` from above hits within `cell / 64` of `heightAt` at the hit's x/z; a ray pointing
  up returns `null`.
- [ ] B3. `normalAt` on a flat field is `[0, 1, 0]`.

**Done when** B1–B3 pass.

### C — The terrain mesh (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/3d/terrain-mesh.ts` (+ test) | net-new: `buildChunk(sampler, chunk, segments, skirt): { positions; normals; uvs; indices }` (pure arrays) |
| `packages/features/media-game/renderer/level/3d/use-heightfield.ts` (+ test) | net-new: fetches A once per level + sha, builds the sampler |
| `packages/features/media-game/renderer/level/3d/level-scene.tsx` | edit: ground tiles use `buildChunk` when a sampler exists, the flat `tileGeometry` otherwise |
| `packages/features/media-game/renderer/level/3d/optimisation.ts` (+ test) | edit: `terrainLodDistance` per preset (Quality 400, High 250, Balanced 160, …) |

- Chunks are the existing `groundTiles` tiles; each builds `terrainSegments` × `terrainSegments` near and a quarter
  of that beyond `terrainLodDistance`, with a skirt of `cell × 2` down the edges so LOD seams never show a crack
  (Unreal Landscape's and Godot Terrain3D's skirt approach).
- Built on demand, at most two chunks per frame (a queue drained in `useFrame`), cached by `chunkKey + lod`;
  disposed as the cull drops them (Phase 136's cull already decides which tiles exist).
- The drape texture and UV mapping stay as Phase 136 set them (UV from world x/z over the extent).
- Without a terrain or while A is loading: flat tiles (today's behaviour) with a `LoadingRegion`-style hint in the
  view's corner ("Loading terrain…", `Spinner`).

**Acceptance.**

- [ ] C1. `buildChunk` produces `(segments + 1)²` + skirt vertices with heights from the sampler.
- [ ] C2. Adjacent chunks at different LODs share edge heights at the coarse vertices (no crack test).
- [ ] C3. Every preset has a `terrainLodDistance`; the view store test still rehydrates.

**Done when** C1–C3 pass.

### D — Placement on the surface (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/3d/level-ground.ts` (137 G) (+ test) | edit: `groundPoint` raycasts the terrain when a sampler is present |
| `packages/features/media-game/renderer/level/level-snap.ts` (137 F) (+ test) | edit: `surface` snap uses `heightAt` |
| `packages/features/media-game/renderer/level/level-edit-model.ts` (+ test) | edit: `dropToGround(state, refs)`, `bakeGroundHeight(state, refs, sampler)`, each one commit |
| `packages/features/media-game/renderer/level/3d/level-3d-view.tsx` | edit: `End` key; a "Conform" toggle in the gizmo bar |
| `packages/features/media-game/renderer/level/level-shortcuts.ts` (137 J) | edit: `End` — "Drop to ground" |

- **Height follows the kit's rule.** `levelEntityToWorld` (`packages/shared/src/game-level.ts` L129) gives `y: null`
  to an object with no `elevation`, and the kit snaps such an object to the terrain (or `midnite.groundY`). The
  editor now draws a `y: null` object at `heightAt(x, z)` instead of at `groundY`, so the two finally agree. An
  object with `elevation` keeps it (a floating platform, a bridge).
- **Drop to ground (`End`)**: removes `elevation` from every selected object (it now sits on the terrain, in the
  editor and the game alike). One undo step. `Shift+End` instead *bakes* the current terrain height into
  `elevation` (lowest footprint corner for volumes) for objects that must not move if the terrain is re-exported.
- **Conform on move** (toggle, default off, persisted in `level-view-store` as `conform: boolean`, no version bump):
  dragging an object that has `elevation` on X/Z updates it to keep the same height above the terrain.
- Scatter (139 H) places objects with no `elevation`, so they sit on the terrain by the same rule. Align to slope is
  deferred (the kit has no per-object tilt; Not in this phase).
- On a level without terrain everything behaves as before (ground plane at `groundY`).

**Acceptance.**

- [ ] D1. `groundPoint` over a hill returns the hill's height at the hit.
- [ ] D2. `dropToGround` removes `elevation` from the selection in one undo step; `bakeGroundHeight` (`Shift+End`)
  writes the sampler's height (volume: lowest corner).
- [ ] D3. Conform on move keeps a dragged object's height above the terrain constant.
- [ ] D3b. An object without `elevation` renders at `heightAt(x, z)` (scene placement test).
- [ ] D4. Scatter on terrain adds objects without `elevation` that render on the surface (skipped with a note if
  139 H is absent).

**Done when** D1–D4 pass.

### E — Plan hillshade and elevation (S)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-heightfield.ts` | edit: `hillshade(sampler, width, height, sunAzimuth = 315, sunAltitude = 45): Uint8ClampedArray` |
| `packages/features/media-game/renderer/level/level-plan-draw.ts`, `level-canvas.tsx` | edit: draw the hillshade `ImageBitmap` under the grid at 35 % opacity; the readout |
| `packages/features/media-game/renderer/level/3d/level-view-store.ts` | edit: `hillshade: boolean` (default true) |

- Classic GIS hillshade (Horn's method, NW light at 45°), computed once per heightfield at ≤ 1024² in a
  `requestIdleCallback`, cached by sha. The status readout appears in the canvas's bottom-left for 3D levels with
  terrain: "x 12.4 m · z −3.0 m · elevation 41.2 m".

**Acceptance.**

- [ ] E1. `hillshade` of a flat field is uniform; and under the default north-west sun a slope facing
  north-west is brighter than one facing south-east (asserted numerically).
- [ ] E2. The readout shows the sampler's height at the cursor's world position.

**Done when** E1–E2 pass.

### F — `game_terrain_height` (S)

**Tool** (Phase 138's tool recipe; read, no `allowed()`):

```ts
export const GameTerrainHeightInputSchema = GameToolTargetSchema.extend({ scene: GameSceneNameSchema, points: z.array(z.object({ x: z.number(), z: z.number() })).min(1).max(1000), normals: z.boolean().default(false) });
export const GameTerrainHeightOutputSchema = z.object({ terrain: z.string(), heights: z.array(z.number()), normals: z.array(z.tuple([z.number(), z.number(), z.number()])).optional(), outside: z.array(z.number().int()) /* indexes clamped to the edge */ });
```

- Main reuses A's reader and B's sampler (shared), cached per game + sha in an LRU of 4. Metres in, metres out.
- Description: "Returns terrain heights (and optionally normals) in metres at up to 1,000 x/z points of a 3D level —
  use to place objects on the ground."

**Acceptance.**

- [ ] F1. Heights equal the sampler's at the same points.
- [ ] F2. A point outside the terrain is clamped and listed in `outside`.
- [ ] F3. A level without terrain fails with "This level has no terrain."

**Done when** F1–F3 pass.

### G — `snap: 'terrain'` on level ops (S)

**Files.** `packages/shared/src/game-level-ops.ts` (138 A) and its test; `level-agent-writes.ts` (138 E); the
skill's `## Levels` (seven copies).

- `LevelOpsContext` gains `heightAt?: (x: number, z: number) => number`; `add`, `update` and `place-prefab` accept
  `snap?: 'terrain'`, which removes `elevation` (the kit's on-the-ground rule); `snap: 'terrain-bake'` writes `heightAt` into it.
  `snap: 'terrain'` without a terrain is an op error. `game_level_scatter` gains the same option.
- Main supplies `heightAt` from F's cache; the renderer from `use-heightfield`.

**Acceptance.**

- [ ] G1. An `add` with `snap: 'terrain'` has no `elevation`; with `'terrain-bake'` it equals the sampler's height.
- [ ] G2. Without a terrain the op fails with a clear message and nothing is applied.
- [ ] G3. Skill copies identical and naming `game_terrain_height`.

**Done when** G1–G3 pass.

## MCP summary

| Tool / option | Kind | `allowGames` |
|---|---|---|
| `game_terrain_height` | read | no |
| `snap: 'terrain'` on `game_entity_*`, `game_level_scatter` | write option | yes (the tools' own gate) |

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/game-level.ts`, `ipc/*` | A | edit |
| `packages/shared/src/game-heightfield.ts` (+ test) | B E | net-new |
| `packages/shared/src/game-level-ops.ts` | G | edit |
| `packages/features/media-game/main/games/png16.ts` (+ test), `heightfield-agreement.test.ts` | A B | net-new |
| `packages/features/media-game/main/games/game-level-terrain.ts`, `game-levels.ts`, `main/index.ts`, `level-agent-writes.ts` | A G | edit |
| `packages/desktop/src/preload/index.ts`, `packages/features/media-game/manifest.ts`, `packages/app/test-support/mock-bridge.ts` | A | edit |
| `packages/features/media-game/renderer/level/3d/terrain-mesh.ts`, `use-heightfield.ts` (+ tests) | C | net-new |
| `packages/features/media-game/renderer/level/3d/level-scene.tsx`, `optimisation.ts`, `level-ground.ts`, `level-3d-view.tsx`, `level-view-store.ts` | C D E | edit |
| `packages/features/media-game/renderer/level/level-snap.ts`, `level-edit-model.ts`, `level-shortcuts.ts`, `level-plan-draw.ts`, `level-canvas.tsx` | D E | edit |
| MCP recipe files + seven skill copies | F G | edit |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` (shared, media-game, desktop); eslint on changed files; vitest on the
  touched suites incl. the agreement test; the pin test; `scripts/skill-copies.test.mjs`; `node
  scripts/tracker-check.mjs`.
- [ ] **Gate — the built app, throwaway `--user-data-dir`**: a third-person game on a hilly imported terrain — the 3D
  view shows the relief; a prop dropped on a slope sits on it; `End` on five floating props drops them; Conform on
  move follows a ridge; the Floorplan hillshade reads as the 3D relief; Play from here (Phase 140, if landed) shows
  the prop at the same height in the game. Frame-time with the Optimisation slider at Balanced stays within 10 % of
  Phase 136's flat-ground number (`scripts/perf/idle-cpu.mjs` is not the right tool; read the R3F `Stats` overlay).
  Shots under `/tmp/midnite-shots-p141/`.

## Not in this phase

- **Sculpting, painting splat maps or holes** — Media ▸ Terrain owns terrain authoring.
- **Align to slope** — the kit has no per-object tilt property; adding one is a kit change for a later phase.
- **Water planes, roads from the terrain's road mask** — Phase 144 (environment) or later.
- **Streaming terrain from disk in chunks** — the editor holds one heightfield (≤ 4097²) in memory, as the kit does.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Decode in main**, not in the renderer: the file is in the game repo, main already confines paths, and
   `node:zlib` is there; the renderer gets plain samples.
2. **One sampler, proven equal to the kit's**, because "the prop floats in the game" is exactly the bug this phase
   exists to kill; the agreement test is the contract.
3. **On the ground means no `elevation`** — the kit's existing rule (`y: null` snaps to the terrain), so a terrain
   re-export never strands props; baking a height is the explicit exception (Unreal's "snap to floor" writes Z;
   here both are offered).
4. **`End` drops to ground** — Unreal's binding, the best-known one; Unity has no default, Godot uses a plugin.
5. **Skirts, not stitching**, for LOD seams: simpler, robust, what Unreal Landscape and most open-source terrains do.
6. **Conform on move is opt-in** — an always-on conform fights the user who wants a floating platform.
