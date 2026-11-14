# Phase 139 — Level asset browser, prefabs and scatter

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `9e395a8df`.

A level today is built one object at a time from a fixed palette (`spawn`, `exit`, `prop`, …), and a model prop
gets its `.glb` by typing its asset name into the inspector's `model` field. Every engine solves the same three
problems the same way, and this phase brings the three answers in:

- **An asset browser** (Unity's Project window, Unreal's Content Browser, Godot's FileSystem dock): the game's
  imported assets as thumbnails in a bottom panel, filterable, dragged into the level.
- **Prefabs** (Unity prefabs, Unreal Blueprints-as-actors, Godot packed scenes, LDtk entity defs, Tiled templates):
  a named group of objects saved once and placed many times, with per-instance overrides.
- **A scatter brush** (Unreal's Foliage mode, Unity's Terrain trees, Godot's Scatter add-on): paint many props at
  once with density, spacing, random scale and rotation, one undo step per stroke.

Agents get the same three through MCP: list assets and prefabs, place a prefab, scatter in a region.

> **Builds on.**
> - **Phase 137** — the multi-selection (`ObjectRef`, `selected`, Theme A), the clipboard model
>   (`level-clipboard.ts`, Theme B) and floorplan + 3D multi-select (Themes C, D). "Save selection as prefab" needs
>   a multi-selection; the clipboard's payload shape is the prefab's body.
> - **Phase 138** — `LevelOpSchema` and `applyLevelOps` (Theme A), the editor bridge (Theme C) and the change-set
>   banner (Theme F): prefab placement and scatter are new ops, applied live in the open editor.
> - **Phase 107 Theme N's asset bridge** — the manifest's `assets` (`GameAssetProvenanceSchema` with `name`, `kind`,
>   `path`, `sha256`; `packages/shared/src/media-game.ts`), read through the existing `games.manifest.get`.
> - **Phase 136 Theme F** — `games.levels.model` (`mstudio:games:level-model`, `.glb` bytes, capped at
>   `GAME_LEVEL_MODEL_MAX_BYTES`) and `3d/model-cache.ts` (`ModelCache`).
>
> **Depends on:** Phase 137 (A, B, C, D) and Phase 138 (A, C, F). **Unlocks:** Phase 141's terrain-conforming
> scatter (Theme H here draws on a flat ground until 141 lands) and Phase 142's typed prefab properties.
>
> **Scope guardrails.** No eslint exception; every IPC answer a `GitOpResult` envelope; writes through the write
> queue with a pathspec commit; `react-icons` only; reduced motion honoured; every test a vitest unless it names its
> browser capability.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.
> Every theme here is at most **M**.

## Headlines

**Theme A — Asset thumbnails IPC.** ◻ `mstudio:games:level-asset-thumb` answers a small data URL for an `image`,
`sprite`, `tileset` or `background` asset; models keep `games.levels.model`.

**Theme B — Model thumbnails.** ◻ One offscreen three.js renderer draws a 128 px thumbnail per model, cached by
`name:sha256` in an LRU of 200, rendered one at a time off the main loop.

**Theme C — The asset browser panel.** ◻ A `BottomPanel` under the level canvas: filter, kind chips, a virtualised
thumbnail grid, `Skeleton` while loading, `EmptyState` with an "Import assets" action when the game has none.

**Theme D — Drag a model into the level.** ◻ Drag a model tile onto the plan or the 3D view: a ghost follows the
cursor (snapped by 137 F), drop adds a `prop` with `model` set, one undo step.

**Theme E — The prefab model.** ◻ `levels/prefabs/<name>.prefab.json`: objects relative to a pivot. An instance is
baked into the level as ordinary objects tagged `midnite.prefab`, `midnite.prefabInstance`, `midnite.prefabIndex`;
the kit needs no change.

**Theme F — Prefab IPC.** ◻ `mstudio:games:level-prefabs` (list), `-prefab-get`, `-prefab-set` (write + one
commit), `-prefab-delete`.

**Theme G — Prefab UI.** ◻ "Save selection as prefab…", a Prefabs tab in the browser, drag to place, "Select
instances", "Update instances from prefab" honouring overrides, "Unpack".

**Theme H — The scatter brush.** ◻ Tool `S` (2D and 3D): pick assets or a prefab, set radius, density, spacing,
scale and rotation jitter, paint; seeded, Poisson-spaced, one undo per stroke, `Alt` erases.

**Theme I — MCP and the skill.** ◻ `game_assets_list`, `game_prefab_list`, a `place-prefab` level op and
`game_level_scatter`; the skill's `## Levels` learns them.

## Build order

1. **A** → **B** → **C** → **D** (browser end to end).
2. **E** → **F** → **G** (prefabs).
3. **H** (needs C's asset picker and E's instance tagging for prefab scatter).
4. **I** last.

## Deliverables

### A — Asset thumbnails IPC (S)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level.ts` | edit: `GameLevelAssetThumbRequestSchema`, `GameLevelAssetThumbResultSchema`, `GAME_LEVEL_THUMB_MAX_BYTES` |
| `packages/shared/src/ipc/channels.ts` | edit: `CHANNELS.gamesLevelAssetThumb = 'mstudio:games:level-asset-thumb'` |
| `packages/shared/src/ipc/schemas.ts`, `ipc/bridge.ts` | edit: `games.levels.assetThumb(req)` |
| `packages/desktop/src/preload/index.ts` | edit |
| `packages/features/media-game/manifest.ts` | edit: the channel in `ipc` |
| `packages/features/media-game/main/games/game-levels.ts` | edit: `assetThumb` beside `levelModel` |
| `packages/features/media-game/main/index.ts` | edit: `handle(CHANNELS.gamesLevelAssetThumb, …)` |
| `packages/features/media-game/main/games/game-levels.test.ts` | edit |
| `packages/app/test-support/mock-bridge.ts` | edit |

```ts
export const GAME_LEVEL_THUMB_MAX_BYTES = 2 * 1024 * 1024;   // source file cap; larger answers a failure the UI shows as a kind icon
export const GameLevelAssetThumbRequestSchema = z.object({ gameId: z.string().min(1), name: z.string().min(1) });
export const GameLevelAssetThumbResultSchema = z.object({ name: z.string(), mime: z.enum(['image/png', 'image/jpeg', 'image/webp']), dataUrl: z.string(), sha256: z.string() });
```

- Looks the asset up in the manifest (`kind` in `image | sprite | tileset | background`), resolves the file (a
  folder asset uses its `entry`'s image: `atlas.png` beside `atlas.json`, a tileset's `image`), confines it with
  `confineToRoot` exactly as `levelModel` does, caps the bytes.
- The renderer downscales to 128 px in a canvas and caches the result (Theme C), so the IPC stays dumb.

**Acceptance.**

- [ ] A1. A `sprite` asset answers a `data:image/png;base64,` URL and its manifest `sha256`.
- [ ] A2. A `model` asset answers `failure('Model thumbnails come from games.levels.model.')`.
- [ ] A3. A path that escapes the game folder through a symlink fails as `levelModel`'s does.
- [ ] A4. An over-cap file fails with the size in the message.

**Done when** A1–A4 pass in `game-levels.test.ts`.

### B — Model thumbnails (S)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/assets/model-thumbs.ts` | net-new |
| `packages/features/media-game/renderer/level/assets/model-thumbs.test.ts` | net-new |
| `packages/features/media-game/renderer/level/assets/lru.ts` (+ test) | net-new: a 30-line `Lru<K, V>` |

```ts
export const THUMB_SIZE = 128;
export const THUMB_CACHE_MAX = 200;
export type ThumbRenderer = { render(glb: ArrayBuffer): Promise<string /* data URL */>; dispose(): void };
export function createModelThumbs(deps: { load: (name: string) => Promise<GitOpResult<GameLevelModelResult>>; renderer: () => ThumbRenderer }): {
  get(name: string, sha256: string): Promise<string | null>;     // null = failed; cached by `${name}:${sha256}`
  clear(): void;
};
```

- **One** `WebGLRenderer` (`preserveDrawingBuffer: true`, 128 × 128, transparent), created lazily, disposed when
  the panel unmounts; requests queue and render one at a time (a `Promise` chain) so a 200-model game never holds
  200 GL contexts or blocks a frame for long.
- Framing: the model's `Box3` → a 3/4 camera (yaw 35°, pitch 25°) fitting the bounding sphere, a hemisphere light
  plus a key light; the background is transparent so the tile's own `bg-muted` shows.
- The test drives `createModelThumbs` with a stub renderer and asserts the cache key, LRU eviction at 201 and that a
  failed load answers `null` once and is not retried in the session (as `ModelCache` does).

**Acceptance.**

- [ ] B1. Two `get`s of the same name and sha load once.
- [ ] B2. A changed `sha256` re-renders.
- [ ] B3. The 201st distinct thumbnail evicts the least recently used.
- [ ] B4. Requests render serially (the stub records no overlap).

**Done when** B1–B4 pass.

### C — The asset browser panel (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/assets/asset-browser.tsx` | net-new |
| `packages/features/media-game/renderer/level/assets/asset-browser.test.tsx` | net-new |
| `packages/features/media-game/renderer/level/assets/asset-browser-model.ts` (+ test) | net-new: `filterAssets`, `ASSET_KIND_CHIPS` |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: wrap the canvas column in the panel |

- Mount: `useBottomPanel('level.assets', { initial: 180, min: 120, max: 420, defaultCollapsed: true })` and
  `BottomPanel` / `BottomPanelHeader` (`packages/frame/src/layout/bottom-panel/`), under the canvas column only (the
  layer list and inspector keep full height, as an IDE's terminal panel sits under the editor).
- Header: title "Assets", a tab switch **Assets · Prefabs** (`Choice`, `packages/frame/src/form/field.tsx`; Prefabs
  arrives in G), `FilterInput` (`packages/frame/src/form/filter-input.tsx`), kind chips (`model`, `sprite`, `image`,
  `tileset`, `background`, multi-toggle, all on), and a toggle chevron. The panel's open state persists through
  `useBottomPanel`'s own store, no new key.
- Body: a grid of 96 px tiles (thumbnail 72 px, name truncated with a `Tooltip` showing name, kind and path),
  virtualised with `@tanstack/react-virtual` (added to `packages/features/media-game/package.json` by Phase 137
  Theme H; if 137 H has not landed, this theme adds it). Keyboard: arrows move focus, `Enter` arms the tile for the
  next click-to-place (D), `/` focuses the filter.
- Loading: `Skeleton` tiles (`packages/frame/src/layout/skeleton.tsx`) while the manifest loads and per tile while
  its thumbnail renders. Empty: `EmptyState` (`packages/frame/src/layout/empty-state.tsx`) "No assets yet" with an
  `EmptyStateButton` "Import assets" that opens the game's existing asset picker (Media ▸ Games' Assets tab — the
  same handler the game page's Import button uses, passed in through the editor's props, never imported across
  features). Audio and animation assets are listed under no chip and are not shown (they cannot be placed).
- The asset list re-reads on `gamesChanged` (reason `assets`), so an import shows up live.

**Acceptance.**

- [ ] C1. `filterAssets` matches name substrings case-insensitively and respects kind chips.
- [ ] C2. The panel renders one tile per placeable asset, skeleton tiles before thumbnails resolve, and the empty
  state with its button when there are none.
- [ ] C3. `/` focuses the filter; arrow keys move focus across tiles.
- [ ] C4. The panel is collapsed by default and remembers being opened (`useBottomPanel` store).

**Done when** C1–C4 pass.

### D — Drag a model into the level (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/assets/asset-drag.ts` (+ test) | net-new: the DnD payload, `dropToObject` |
| `packages/features/media-game/renderer/level/level-canvas.tsx` | edit: `onDragOver` / `onDrop`, ghost |
| `packages/features/media-game/renderer/level/3d/level-3d-view.tsx`, `3d/level-scene.tsx` | edit: drop ghost on the ground |
| `packages/features/media-game/renderer/level/level-edit-model.ts` | edit: `addObjects(state, layerId, objects)` one commit (if 137 did not add it) |

```ts
export const ASSET_DRAG_MIME = 'application/x-midnite-level-asset';
export type AssetDragPayload = { kind: 'asset'; name: string; assetKind: GameAssetKind } | { kind: 'prefab'; name: string };
export function dropToObject(payload: AssetDragPayload & { kind: 'asset' }, at: { x: number; y: number }, level: EditLevel): EditObject;
```

- HTML5 DnD with a custom MIME (the browser carries it across the panel and the canvas; no library). The ghost is a
  translucent box (plan) or the model at 50 % opacity (3D) at the snapped point (137 Theme F's `snapPoint`; the
  ground plane via 137 Theme G's `groundPoint`).
- Drop of a `model` asset on a 3D level adds a `prop` (`model` = the asset name) on the active object layer, selects
  it; on a 2D level a model is refused with a `useNotify` notice "Models place in 3D levels." **2D sprite drops are
  out of scope** (Not in this phase): the 2D kit has no generic sprite object.
- Click-to-place: an armed tile (Enter, or a click on the tile) places on the next canvas click, `Esc` disarms.

**Acceptance.**

- [ ] D1. `dropToObject` makes a `prop` with `properties.model` and the snapped position.
- [ ] D2. A drop adds exactly one undo step and selects the new object.
- [ ] D3. A model dropped on a 2D level adds nothing and notifies.
- [ ] D4. An e2e (`packages/app/e2e/level-asset-drop.spec.ts`, `// e2e-capability: pointer drag across two
  elements with real DataTransfer`) drags a tile onto the plan and sees one new object in the outliner count.

**Done when** D1–D4 pass.

### E — The prefab model (S)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level-prefab.ts` | net-new |
| `packages/shared/src/game-level-prefab.test.ts` | net-new |
| `packages/shared/src/index.ts` | edit |

```ts
export const GAME_PREFAB_DIR = 'levels/prefabs';
export const GamePrefabNameSchema = GameSceneNameSchema;   // same safe-name rule as scenes
export const GamePrefabSchema = z.object({
  version: z.literal(1),
  name: GamePrefabNameSchema,
  dimension: z.enum(['2d', '3d']),
  /** Objects relative to the pivot (0,0), in pixels, in a Tiled object shape without ids. */
  objects: z.array(LevelEntityFieldsSchema).min(1).max(500),
  description: z.string().max(400).optional(),
});
export type GamePrefab = z.infer<typeof GamePrefabSchema>;
export const PREFAB_PROPS = { prefab: 'midnite.prefab', instance: 'midnite.prefabInstance', index: 'midnite.prefabIndex', overrides: 'midnite.prefabOverrides' } as const;
export function prefabFromObjects(name: string, dimension: '2d' | '3d', objects: readonly EditObject[]): GamePrefab;  // pivot = bounds centre, snapped to whole px
export function instantiatePrefab(prefab: GamePrefab, at: { x: number; y: number }, rotation: number, instanceId: string): LevelEntityFields[];
export function updateInstances(level: unknown, prefab: GamePrefab): { level: Record<string, unknown>; updated: number; skippedFields: number };
```

- **Baked instances** (Tiled's own model for templates, LDtk's for entity instances): each placed object is a
  normal level object plus three properties; the kit reads them as any object, so the kit is unchanged and an
  exported game needs nothing extra.
- `midnite.prefabOverrides` is a comma list of field names the user changed on that instance (`x,y` never count —
  instances are positioned); `updateInstances` overwrites every non-overridden field from the prefab and leaves
  overridden ones (Unity's override semantics: an instance's change wins, unless reverted).
- `instanceId` is `crypto.randomUUID().slice(0, 8)`; objects of one instance share it.

**Acceptance.**

- [ ] E1. `prefabFromObjects` of three objects sets the pivot at the bounds centre and strips ids.
- [ ] E2. `instantiatePrefab` at (100, 50) rotated 90° places each object rotated about the pivot, tagged with the
  three properties.
- [ ] E3. `updateInstances` changes a non-overridden `width` and keeps an overridden `properties.speed`.
- [ ] E4. `GamePrefabSchema` rejects an empty `objects` array and an unsafe name.

**Done when** E1–E4 pass.

### F — Prefab IPC (S)

**Channels** (`packages/shared/src/ipc/channels.ts`): `gamesLevelPrefabs = 'mstudio:games:level-prefabs'`,
`gamesLevelPrefabGet = 'mstudio:games:level-prefab-get'`, `gamesLevelPrefabSet = 'mstudio:games:level-prefab-set'`,
`gamesLevelPrefabDelete = 'mstudio:games:level-prefab-delete'`. Bridge: `games.levels.prefabs.{list, get, set,
delete}`.

**Files.** `packages/features/media-game/main/games/game-prefabs.ts` (+ `game-prefabs.test.ts`), net-new; wired in
`game-service.ts` and `main/index.ts`; schemas in `ipc/schemas.ts`; preload; manifest `ipc`; mock bridge.

- `list` → `{ name, dimension, objects: number, description? }[]` sorted by name. `set` validates with
  `GamePrefabSchema`, writes `levels/prefabs/<name>.prefab.json` (two-space JSON + newline) through the per-repo
  `writeQueue`, commits that path only with `Save prefab <name>`, sends `gamesChanged { reason: 'level' }`.
  `delete` removes and commits `Delete prefab <name>` (no confirm needed in main; the UI confirms).
- A malformed prefab file lists with `objects: 0` and an `issue` string; `get` of it fails with the zod message.

**Acceptance.**

- [ ] F1. `set` then `list` round-trips; the commit touches only the prefab file (`git show --name-only`).
- [ ] F2. `set` of an invalid prefab writes nothing and fails.
- [ ] F3. `delete` of a missing prefab fails without a commit.

**Done when** F1–F3 pass against a temp repo (as `game-levels.test.ts` does).

### G — Prefab UI (M)

**Files.**

| File | Change |
|---|---|
| `packages/features/media-game/renderer/level/assets/prefab-list.tsx` (+ test) | net-new: the Prefabs tab |
| `packages/features/media-game/renderer/level/assets/save-prefab-dialog.tsx` (+ test) | net-new: `FrameModal` with a name field |
| `packages/features/media-game/renderer/level/use-prefabs.ts` | net-new: list / get / set / delete hooks |
| `packages/features/media-game/renderer/level/level-context-menu.ts` (Phase 137 I) | edit: the prefab entries |
| `packages/features/media-game/renderer/level/level-edit-model.ts` | edit: `placePrefab`, `selectPrefabInstance`, `unpackInstance`, `applyPrefabUpdate` (each one commit) |

- **Save selection as prefab…** (the context menu and the inspector's multi-selection header; no chord, Decision 8)
  opens `FrameModal`
  (`packages/frame/src/chrome/frame-modal.tsx`) with a name, prefilled from the first object's name, validated live
  by `GamePrefabNameSchema`. Save writes the prefab and **converts the selection into an instance** of it (tags the
  objects), one undo step.
- The Prefabs tab lists prefab tiles (a plan-style vector preview drawn with `drawPlan` for 2D, the B thumbnail of
  the first model for 3D); drag (D's MIME, `kind: 'prefab'`) or click-to-place.
- Instance behaviour: clicking one object of an instance selects the whole instance (137 A `addSelected` for its
  siblings); `Alt`+click selects one object. The inspector shows a "Prefab: crate-stack · instance 3fa2…" row with
  **Select instances** (every instance of this prefab), **Update from prefab** (`updateInstances` on this level,
  one undo step, a toast "Updated 4 instances, kept 2 overrides"), **Unpack** (removes the three tags).
- Editing a tagged object's field adds that field to `midnite.prefabOverrides`; the inspector marks overridden
  fields with a dot and a "Revert" `IconButton`.
- Delete prefab: confirm via `useFrameChrome().useDialogs().confirm` with the instance count in this level as the
  blast radius ("3 instances in this level stay as plain objects").

**Acceptance.**

- [ ] G1. Save as prefab writes the file (mocked bridge) and tags the selected objects as one instance, one undo step.
- [ ] G2. Click on an instance object selects all its siblings; `Alt`+click selects one.
- [ ] G3. Editing `width` on an instance object adds `width` to its overrides; Revert removes it.
- [ ] G4. Update from prefab keeps overrides and reports the counts.
- [ ] G5. Delete prefab confirms with the instance count.

**Done when** G1–G5 pass.

### H — The scatter brush (M)

**Files.**

| File | Change |
|---|---|
| `packages/shared/src/game-level-scatter.ts` (+ test) | net-new: pure sampling (shared so the MCP op uses it) |
| `packages/features/media-game/renderer/level/scatter-panel.tsx` (+ test) | net-new: the options popover |
| `packages/features/media-game/renderer/level/level-editor.tsx` | edit: tool `scatter`, key `S`, in `TOOLS` and `TOOLS_3D` |
| `packages/features/media-game/renderer/level/level-canvas.tsx`, `3d/level-scene.tsx` | edit: brush circle, stroke |

```ts
export const ScatterOptionsSchema = z.object({
  sources: z.array(z.discriminatedUnion('kind', [z.object({ kind: z.literal('model'), name: z.string(), weight: z.number().positive().default(1) }), z.object({ kind: z.literal('prefab'), name: z.string(), weight: z.number().positive().default(1) }), z.object({ kind: z.literal('type'), type: z.string(), weight: z.number().positive().default(1) })])).min(1).max(16),
  radius: z.number().positive().max(10_000),          // px
  density: z.number().min(0.01).max(100),             // objects per 100 × 100 px
  spacing: z.number().nonnegative().max(1000),        // minimum distance, px
  scale: z.tuple([z.number().positive(), z.number().positive()]).default([1, 1]),
  rotation: z.tuple([z.number(), z.number()]).default([0, 360]),
  seed: z.number().int().nonnegative(),
});
export function mulberry32(seed: number): () => number;
export function scatterPoints(area: { cx: number; cy: number; radius: number } | { x: number; y: number; width: number; height: number }, opts: ScatterOptions, existing: readonly { x: number; y: number }[]): { x: number; y: number; scale: number; rotation: number; source: number }[];
```

- Sampling: Bridson Poisson-disc inside the area with `spacing` as the minimum distance, capped by `density × area
  / 10_000`, deterministic from `seed` (`mulberry32`). Existing scattered objects (same sources) within `spacing`
  are respected, so repeated dabs fill rather than stack.
- A stroke = dabs every `radius / 2` px of cursor travel; the whole stroke is one `beginStroke` / `endStroke` undo
  step (the edit model's existing stroke API). `Alt` erases objects of the selected sources inside the brush.
  `[` / `]` change the radius (Unreal and Photoshop's keys). The brush circle draws at the cursor (plan) or as a
  ground ring (3D, on the flat ground; Phase 141 conforms it to terrain).
- Scale is written as `properties.scale` (float), rotation as `rotation`; 3D props honour both already
  (`levelEntityToWorld`). A model source makes a `prop` with `model`; a prefab source instantiates (E).
- The options panel is a `Popover` (`packages/features/media-game/renderer/chrome.tsx`) from the tool's toolbar
  button, with `BrandSlider`s (`packages/frame/src/kit/brand-slider.tsx`) for radius, density, spacing, and a
  source list fed by C's asset tiles (drag a tile in) and prefabs. The seed shows with a "New seed" `IconButton`
  (`LuDices`).
- Safety: a stroke stops adding at 2,000 objects per stroke with a notice (`useNotify`).

**Acceptance.**

- [ ] H1. `scatterPoints` with a fixed seed returns the same points every run; no two closer than `spacing`.
- [ ] H2. Density 1 over a 1,000 × 1,000 px square yields ≤ 100 points.
- [ ] H3. A stroke of three dabs is one undo step.
- [ ] H4. `Alt` erases only objects of the chosen sources inside the brush.
- [ ] H5. The stroke cap notifies and stops at 2,000.

**Done when** H1–H5 pass.

### I — MCP and the skill (M)

**Tools** (Phase 138's tool recipe):

| Tool | Kind | `allowGames` | Input → output |
|---|---|---|---|
| `game_assets_list` | read | no | `{ game, kinds?: GameAssetKind[] }` → `{ assets: { name, kind, path, placeable: boolean }[] }` |
| `game_prefab_list` | read | no | `{ game }` → `{ prefabs: { name, dimension, objects, description? }[] }` |
| `game_prefab_save` | write | yes | `{ game, name, dimension, objects: LevelEntityFields[], description? }` → `{ sha }` |
| `game_level_scatter` | write | yes | `{ game, scene, area: circle \| rect, options: ScatterOptions (seed optional → random), unit?, label?, save? }` → `GameEntityWriteOutputSchema` |

- **A new op** in `LevelOpSchema` (`packages/shared/src/game-level-ops.ts`, Phase 138 A):
  `{ op: 'place-prefab', prefab: string, x: number, y: number, rotation?: number, layer? }` — `applyLevelOps` takes
  a `prefabs: Record<string, GamePrefab>` in `LevelOpsContext` (main reads them from disk; the renderer from
  `use-prefabs`), so `game_entity_batch` places prefabs. An unknown prefab is an op error.
- `game_level_scatter` = `scatterPoints` → a batch of `add` / `place-prefab` ops → Phase 138 E's `writeLevelOps`
  (live in the editor, or one commit).
- Skill: `## Levels` gains three lines (list assets → prefer prefabs for repeated groups → scatter for vegetation
  and debris, with a fixed `seed` so a re-run is reproducible), in all seven copies of
  `midnite-media-game-build/SKILL.md` (paths in Phase 138 Theme I); `skills.test.ts` checks the names.

**Acceptance.**

- [ ] I1. `game_assets_list` marks `audio` and `animation` as `placeable: false`.
- [ ] I2. A batch with `place-prefab` of a 3-object prefab adds three tagged objects.
- [ ] I3. `game_level_scatter` with a seed returns the same `added` count twice on a fresh copy.
- [ ] I4. Both writes refuse with `GAMES_OFF_MESSAGE` while `allowGames` is off.
- [ ] I5. Skill copies byte-identical; pin file regenerated.

**Done when** I1–I5 pass.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/game-level.ts`, `ipc/channels.ts`, `ipc/schemas.ts`, `ipc/bridge.ts` | A F | edit |
| `packages/shared/src/game-level-prefab.ts` (+ test) | E | net-new |
| `packages/shared/src/game-level-scatter.ts` (+ test) | H | net-new |
| `packages/shared/src/game-level-ops.ts` | I | edit (`place-prefab`) |
| `packages/desktop/src/preload/index.ts`, `packages/features/media-game/manifest.ts`, `packages/app/test-support/mock-bridge.ts` | A F | edit |
| `packages/features/media-game/main/games/game-levels.ts` (+ test) | A | edit |
| `packages/features/media-game/main/games/game-prefabs.ts` (+ test) | F | net-new |
| `packages/features/media-game/main/games/game-service.ts`, `main/index.ts` | A F | edit |
| `packages/features/media-game/renderer/level/assets/*` | B C D G | net-new |
| `packages/features/media-game/renderer/level/use-prefabs.ts`, `scatter-panel.tsx` | G H | net-new |
| `packages/features/media-game/renderer/level/level-editor.tsx`, `level-canvas.tsx`, `level-edit-model.ts`, `3d/level-3d-view.tsx`, `3d/level-scene.tsx` | C D G H | edit |
| `packages/app/e2e/level-asset-drop.spec.ts` | D | net-new |
| MCP recipe files (Phase 138) + the seven skill copies | I | edit |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` for shared, media-game, desktop; eslint on changed files; vitest on the
  touched suites; the one e2e; `scripts/skill-copies.test.mjs`; `tool-manifest-pin.test.ts`; `node
  scripts/tracker-check.mjs`.
- [ ] **Gate — the built app, throwaway `--user-data-dir`**, a third-person game with three imported models: open
  the asset panel, see three thumbnails, drag one into 3D, save a 4-object selection as a prefab, place it twice,
  edit one instance's field, Update from prefab (override kept), scatter 40 trees in one stroke and undo it in one
  `Mod+Z`; from a terminal agent `game_level_scatter` with a seed. Shots under `/tmp/midnite-shots-p139/`.

## Not in this phase

- **2D sprite drops** — the 2D kit has no generic sprite object; Phase 142's entity-type schemas are where a
  `decor` type with a `sprite` field would come from.
- **Nested prefabs** (Unity's nested prefabs, Godot's inherited scenes) — a prefab's objects cannot reference
  another prefab. Revisit once instances are used in anger.
- **Live-linked instances** (an instance that changes when its prefab file changes without "Update from prefab").
  Baked instances keep the kit unchanged; the explicit update is the Tiled template model.
- **Terrain-conforming scatter** — Phase 141 Theme D.
- **Asset import from inside the level editor** — the button routes to the existing importer.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Baked instances, not references** — Tiled templates and LDtk entity instances store full objects; the kit and
   exports need no change, and an instance stays a readable Tiled object. Unity-style live links would need kit
   resolution at load time and break `game_level_get` readers.
2. **Overrides are a field list** (`midnite.prefabOverrides`), the Unity model reduced to field granularity: simple
   to show (a dot per field), simple to revert.
3. **The browser is a bottom panel**, like Unity's Project window and Unreal's Content Browser drawer, reusing the
   frame's `BottomPanel` (resizable, collapsible, persisted) instead of a fixed aside.
4. **Thumbnails are rendered in the renderer, cached in memory only.** A disk thumbnail cache would be a second
   source of truth beside the manifest's `sha256`; 200 × 128 px is cheap to redraw per session.
5. **Scatter is seeded and Poisson-spaced** (Bridson), as Unreal's foliage and Houdini's scatter are: reproducible
   for an agent, and visually even rather than clumped.
6. **One undo step per stroke**, matching every paint tool in every engine and the edit model's existing
   `beginStroke` / `endStroke`.
7. **Prefabs live in `levels/prefabs/`** next to the scenes they serve, one JSON per prefab, so git diffs stay
   readable and `levels.list` (which reads `levels/*.tmj`) is unaffected.
8. **No chord for Save as prefab** — the level's local key table (137 J) has no free, obvious letter; Unity and
   Godot also make it a menu/drag action.
