# Phase 105 — Terrain

**Refined: x1** · 2026-10-04 · UI/UX & interaction, visual design & theming, accessibility & keyboard, empty / loading / error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, observability & diagnostics, security, permissions & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

Requested by the user · 2026-10-04 · grounded against the tree as of `a51a3b05`; re-grounded by the
x1 refinement against `0e37a65f`.

Media gets a sixth tab, **Terrain**: a basic 3D terrain generator. You give it up to three images, and
**each one is optional**:

1. **A heightmap.** A greyscale image becomes the terrain's shape, at a resolution you choose.
2. **A satellite image** of the same area. It becomes the terrain's texture, and it is also *read*: the
   app classifies it into vegetation, bare ground, water, roads and buildings, scatters foliage where
   the vegetation is, and raises simple buildings on the footprints it finds.
3. **A roads mask.** Light roads on a dark background (typically cyan) become a road network: spline
   centrelines, road meshes, and the terrain flattened underneath them.

This is the first of three phases that build towards AI-generated games. **Phase 105 Terrain → Phase
[106](phase-106-2d-assets.md) 2D Assets → Phase [107](phase-107-games.md) Games**. Phase 107's three.js
kit loads what this phase exports (heightfield, chunks, splat maps, foliage, buildings, road graph)
for its open-world and third-person starters. The export contract is therefore part of this phase's
scope, not an afterthought.

> **Builds on.**
> - **Media tabs.** `MEDIA_TABS` (L20) in [`shared/src/media.ts`](../../../packages/shared/src/media.ts),
>   currently `['doc', 'image', 'video', 'audio', 'model']`, plus every table keyed by `MediaTab`:
>   `MEDIA_TAB_EXPORT_FORMATS` (`media.ts` L92; the first entry is the split button's default),
>   `MEDIA_TAB_META` (`{label, icon}`) in [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts),
>   `TAB_BODY` in [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), and
>   `MEDIA_LAYOUT_KEYS` (`satisfies Record<MediaTab, Record<MediaPane, keyof LayoutSizes>>`) in
>   [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts). `REPO_SCOPED_MEDIA_TABS`
>   (`media.ts` L29) is a plain array, so the compiler will not remind you about it. The ui-store
>   `merge` falls back to the default for an unknown `mediaTab` and spreads `DEFAULT_LAYOUT` under the
>   saved `layout` (`{ ...current.layout, ...saved.layout }`), so **no persist-version bump is needed**
>   (it stays `31`).
> - **Storage.** [`main/media/media-store.ts`](../../../packages/desktop/src/main/media/media-store.ts)
>   (`createMediaStore(deps)` → `rootFor`, `listProjects`, `createProject`, `listFiles`, `readFile`,
>   `writeFile`, `writeBytes`, `renameFile`, `removeFile`, `resolveForReveal`, `resolveForRead`, every
>   op a `GitOpResult`) builds `.midnite/media/<tab>/` from `MEDIA_ROOT_DIR` with `..` and symlink
>   guards, a per-root `WriteQueue`, and Trash on delete. Production wiring and `notifyMediaChanged(repoId, tab)`
>   live in [`ipc/media-handlers.ts`](../../../packages/desktop/src/main/ipc/media-handlers.ts). `terrain`
>   gets this for free.
> - **The Models tab as the pattern to copy.** The library layout from #704
>   ([`media-model-library.ts`](../../../packages/shared/src/media-model-library.ts): `MODEL_MANIFEST_FILE`,
>   `ModelManifestSchema` with `version: z.literal(1)`, `ModelLibraryNameSchema`), a pure-TS kernel in
>   `shared` ([`model-geometry/`](../../../packages/shared/src/model-geometry/), exported through the
>   [`shared/src/index.ts`](../../../packages/shared/src/index.ts) barrel), the hand-written
>   [`gltf-writer.ts`](../../../packages/desktop/src/main/media/model/gltf-writer.ts)
>   (`buildGltf(parts, title, rigging)` / `writeGlb(parts, title, rigging): Buffer`, one node per
>   `MeshPart`, **no instancing today**), the software-rasterised named views in
>   [`preview.ts`](../../../packages/desktop/src/main/media/model/preview.ts) (`renderView(parts, view, size)`
>   over the fixed `front`/`side`/`top`/`iso` cameras, per-part flat colour, **no texture sampling**;
>   `encodePng(width, height, rgb)` at L258), and the R3F editor in
>   [`app/features/media/model/`](../../../packages/app/src/features/media/model/)
>   ([`model-viewer-lazy.tsx`](../../../packages/app/src/features/media/model/model-viewer-lazy.tsx):
>   `lazy()` + `ViewerBoundary` + `Suspense`; `model-editor.tsx` uses `<Canvas frameloop="demand">`).
> - **A utility-process worker to copy.** [`sf3d/sf3d-broker.ts`](../../../packages/desktop/src/main/media/model/sf3d/sf3d-broker.ts)
>   (`createSf3dBroker({ spawn })`: fork lazily, one child, replies correlated by id, a cancel kills the
>   child), its [`worker-protocol.ts`](../../../packages/desktop/src/main/media/model/sf3d/worker-protocol.ts),
>   the entry [`src/sf3d-worker/index.ts`](../../../packages/desktop/src/sf3d-worker/index.ts), and the
>   `outfiles` list in [`scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) that ships it.
>   The PNG encoder [`sf3d/png.ts`](../../../packages/desktop/src/main/media/model/sf3d/png.ts)
>   (`encodePng(rgba, width, height)`, `crc32`) already runs inside a utility process, where
>   `nativeImage` is unavailable. **There is no production PNG decoder**: the only decode path is
>   `decodeImage()` in [`ipc/media-model-sf3d-handlers.ts`](../../../packages/desktop/src/main/ipc/media-model-sf3d-handlers.ts)
>   (`nativeImage.createFromBuffer` → `toBitmap()`, 8-bit BGRA).
> - **Images.** [`main/media/image/image-service.ts`](../../../packages/desktop/src/main/media/image/image-service.ts)
>   (`createImageService(deps)` → `{generate, cancel, providerStatuses}`; `generate(req: ImageGenerateRequest)`
>   writes into `.midnite/media/image/<project>/` and returns `GitOpResult<{files: string[]}>`; providers
>   in `IMAGE_PROVIDER_IDS`) is how a heightmap is generated from a prompt.
> - **Engines.** [`main/media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts).
>   `createLlmCall` (Ollama or a roster agent) takes **no image input**; the vision call is the separate
>   `createDescribeImage(deps)` (Ollama, one image, the fixed `DESCRIBE_IMAGE_PROMPT` — it takes **no
>   custom prompt**) with `discoverVisionModels`. The optional land-cover vision pass therefore adds a
>   sibling `createVisionCall` beside it (Theme F), which Phase 106's consistency check reuses.
> - **File URLs.** `mstudioFileUrl(scope, repoId, relPath)` in [`shared/src/fs.ts`](../../../packages/shared/src/fs.ts)
>   (L122) builds the jailed `mstudio-file://repo/<repoId>/<relPath>` URL that
>   [`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts) serves on the default session.
>   The viewer fetches build outputs through it.
> - **The MCP recipe** set by the `model_*` family:
>   - ids, input schemas and constants in [`shared/src/media-model-mcp.ts`](../../../packages/shared/src/media-model-mcp.ts)
>     (`MODEL_MCP_TOOL_IDS`, `isModelMcpToolId`, `MODEL_MCP_WRITE_TOOL_IDS`, `MODELS_OFF_MESSAGE`,
>     `ModelToolTargetSchema`, `ModelEditResultSchema`, `MCP_CONTENT_KEY`);
>   - the tool entries themselves are written **inline** in `MCP_TOOLS` in
>     [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) (L118), and `McpToolEntry.id` (L70–99) is a
>     hand-written string-literal union every new id must join; [`mcp.test.ts`](../../../packages/shared/src/mcp.test.ts)
>     carries a hard-coded `writeTools` set (L22) and the description rule (≤ 220 chars, one sentence,
>     names a backticked command, L49);
>   - handlers in [`main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts)
>     (`MCP_HANDLERS`, a mapped type over `McpToolId`, so a missing handler fails typecheck); handlers throw
>     `McpToolError(kind, message)` ([`main/mcp/errors.ts`](../../../packages/desktop/src/main/mcp/errors.ts));
>   - gate and binder in [`main/mcp/model-tools.ts`](../../../packages/desktop/src/main/mcp/model-tools.ts)
>     (`setModelTools`, private `allowed()` → `getMcpAllowModels()`) and
>     [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts) (`getMcpAllowModels`/`setMcpAllowModelsState`);
>   - the persisted switch `allowModels` on `McpSettings` in [`main/mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts)
>     (`mcp.json`, `version: 4`, read by `parseStoredSettings` with a plain `=== true`), carried by
>     `McpSetRequest` in [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) (L3784)
>     through [`ipc/mcp-handlers.ts`](../../../packages/desktop/src/main/ipc/mcp-handlers.ts) and
>     `setMcpAllowModels` in [`main/mcp/index.ts`](../../../packages/desktop/src/main/mcp/index.ts);
>   - the slow-tool timeout, **inline** at [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts)
>     L87 (`isModelMcpToolId(name) ? { timeoutMs: SLOW_CALL_TIMEOUT_MS }`; `SLOW_CALL_TIMEOUT_MS = 60_000`
>     in [`mcp-shim/client.ts`](../../../packages/desktop/src/mcp-shim/client.ts));
>   - the switch in [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx)
>     (L212, an `Accordion` around a `SettingsSwitchRow`).
>
> **Scope guardrails.**
> - **Heightfield terrain only.** One height per grid cell: no caves, overhangs or voxel terrain.
> - **Not a level editor.** There is no sculpting of the terrain by brush in this phase (Phase 104
>   brushes are for model meshes). Edits are the inputs, the parameters, and painting corrections into
>   the land-cover map.
> - **Buildings are blocks.** Footprints are extruded with flat roofs. Facades, interiors and roof
>   shapes are out of scope.
> - **No GIS.** No geo-referencing, projections, GeoTIFF or DEM download. The images are assumed to
>   cover the same square extent, and alignment is a manual offset, scale and rotation.
> - **Package boundaries hold.** The kernel (resample, noise, erosion, skeleton, classify, meshing) is
>   pure TS in `shared`, with no three, no electron and no node builtins. Image decode and file I/O live
>   in desktop main (and its `terrain-worker` utility process). Rendering lives in `app`, which reaches
>   main only through `window.midniteStudio`.
> - **No new global chords.** Every key the viewer takes (fly camera, brush) is scoped to the focused
>   viewport; nothing joins `COMMANDS` in [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts).
>
> **Effort tags:** **S** ≤ half a day · **M** 1–2 days · **L** 3+ days, likely 2–3 PRs.

## Headlines

_A terrain from up to three pictures, and the contract the games phases load it through._ Phases 106
and 107 need a ground to stand on: an open world, a third-person arena, or an isometric map rendered
down to tiles. Every input is optional, so a terrain can start from noise and a prompt, or from real
survey imagery. Planned 2026-10-04; refined x1 the same day, which pinned every channel, schema field,
file and test name and resolved all four opens plus eleven new decisions.

**Theme A — Terrain tab, spec and library.** ◻ Not started. Lands first. `'terrain'` joins `MEDIA_TABS`
(repo-scoped, `LuMountain`), `TerrainSpecSchema` (`version: 1`) lives in a new `shared/src/media-terrain.ts`
with every field defaulted, a terrain is the folder `.midnite/media/terrain/<group>/<terrain>/`, the
explorer is `MediaProjectsAccordion` filtered to `terrain.json`, and eleven named
`mstudio:media:terrain-*` channels plus three events carry it.

**Theme B — Image decode and the heightfield kernel.** ◻ Not started. Lands with A. A `node:zlib` PNG
codec in `main/media/png/png-codec.ts` (16-bit preserving), JPEG/WebP transcoded to PNG once at
attach, a pure-TS heightfield and chunk/LOD kernel in `shared/src/terrain/`, and a `terrain-worker`
utility process on the `sf3d-broker.ts` shape that writes `build/` atomically and is cancelled by kill.

**Theme C — No heightmap: warn, then noise or upload.** ◻ Not started. `terrain-build` answers
`{status: 'needs-height-source'}` instead of guessing; the dialog offers noise, upload or a prompt;
fBm, ridged and particle erosion are seeded and bounded.

**Theme D — Viewer and parameter panel.** ◻ Not started. A lazy R3F viewport that fetches
`build/heights.f32` over `mstudio-file://`, meshes chunks in the renderer with the shared kernel under
a per-frame budget, picks LOD by distance, and stops its frame loop when hidden or blurred.

**Theme E — Satellite: drape and alignment.** ◻ Not started. `TerrainAlignment` (offset, scale,
rotation) per image, an onion-skin overlay, and a drape texture resampled in the worker to a chosen
1K–8K power of two.

**Theme F — Satellite: land-cover classification and splat materials.** ◻ Not started. A deterministic
classifier (ExG, k-means in Lab, slope, sea level, rectilinearity), an Ollama-only optional vision
relabel, a paint-correction override PNG that survives re-classify, `splat.png`, and four CC0 tiled
materials.

**Theme G — Foliage and buildings from the land cover.** ◻ Not started. Seeded Poisson-disk scatter
with exclusions, five built-in foliage designs as Models specs, footprints by morphology + contour +
Douglas-Peucker + right-angle snap, flat-roof extrusion, and data files Phase 107 places itself.

**Theme H — Roads from the roads mask.** ◻ Not started. Hue-keyed extraction with luminance fallback,
Zhang–Suen skeleton to a graph, Catmull-Rom splines, widths from the distance transform, ribbon meshes,
and a bounded cut/fill conform.

**Theme I — Export and the game-engine manifest.** ◻ Not started. `gltf-writer.ts` learns
`EXT_mesh_gpu_instancing`; `terrain-pack` is a folder (not a zip) holding the 16-bit heightfield, one
glb per LOD, the maps and the data files; `TerrainManifestSchema` (`version: 1`) is the contract
Phase 107 reads.

**Theme J — Terrain over MCP, and the skill.** ◻ Not started. Ten `terrain_*` tools, gated by a new
`allowTerrains` switch (`mcp.json` version bump), a 5-minute shim timeout for build and export,
repo-confined input paths, and a `midnite-media-terrain-build` skill in six copies.

**Theme K — Verification.** ◻ Not started. The gate, packaged perf numbers read off the Stats readout,
an `MSTUDIO_SHOTS` spec, a three.js manifest-load test, and two human passes.

## Build order

1. **A + B** (foundation): tab, spec, decode, heightfield, chunk meshing, the worker. Merged before
   anything else. A's channels and B's worker protocol land in the same PR, because `terrain-build`
   is A's channel and B's implementation; a half landing (A without B) must leave `terrain-build`
   answering `{ok:false, kind:'error', message:'Terrain building is not available yet.'}`, never a
   hang.
2. **C · D · E · H** in parallel. Each needs only a heightfield (`build/heights.f32`).
3. **F** after E, because it classifies the aligned satellite image. **G** after F.
4. **I** once B, F, G and H have settled their outputs. It fixes the format Phase 107 reads. I's
   `EXT_mesh_gpu_instancing` change to `gltf-writer.ts` is the one edit to a Models file, and must keep
   `gltf-skin.test.ts` and `export-fidelity.test.ts` green unchanged.
5. **J** last, wrapping the finished operations as tools. Phase 106 and 107 also bump `mcp.json`'s
   `version`; whichever lands first takes the next number, the others rebase onto it (see Decision 11).

## A — Terrain tab, spec and library (M)

The sixth Media tab, in the same three-column frame (`MediaLayout` in
[`media-layout.tsx`](../../../packages/app/src/features/media/media-layout.tsx)) as the others.

- [ ] `'terrain'` added to `MEDIA_TABS`. Fill every `Record<MediaTab, …>` the compiler flags (`MEDIA_TAB_EXPORT_FORMATS`, `MEDIA_TAB_META` with a `react-icons/lu` mountain glyph, `TAB_BODY`), plus `MEDIA_LAYOUT_KEYS` and its two `LayoutSizes` width keys. Make a deliberate call on `REPO_SCOPED_MEDIA_TABS` (rec: repo-scoped, like Models) and record it here
  - `MEDIA_TABS` becomes `['doc', 'image', 'video', 'audio', 'model', 'terrain']` (appended, so existing
    tab order and `mediaTabId`/`mediaPanelId` ids are unchanged).
  - **Resolved: repo-scoped.** `REPO_SCOPED_MEDIA_TABS` becomes `['doc', 'image', 'audio', 'model', 'terrain']`
    (Decision 1). With no repo selected the tab renders `NoRepoMediaState({tab: 'terrain'})` from
    [`repo-media-tab.tsx`](../../../packages/app/src/features/media/repo-media-tab.tsx), exactly as Models does.
  - `MEDIA_TAB_META.terrain = { label: 'Terrain', icon: LuMountain }` (`react-icons/lu`; the
    `components/icons/icon-names.test.ts` guard must list `LuMountain`).
  - `TAB_BODY.terrain = () => <TerrainTab />`, imported eagerly like `ModelTab`; the R3F viewport is lazy
    inside it (Theme D).
  - `MEDIA_TAB_EXPORT_FORMATS.terrain = ['terrain-pack', 'glb']` (Theme I adds both ids to
    `MEDIA_EXPORT_FORMATS` and `MEDIA_EXPORT_FORMAT_INFO`; until I lands the entry is `['glb']`).
  - `LayoutSizes` gains `mediaTerrainExplorerWidth` (default 224, bounds `{min: 180, max: 480}`) and
    `mediaTerrainDetailWidth` (default 360, bounds `{min: 260, max: 640}`) in `DEFAULT_LAYOUT` and
    `LAYOUT_BOUNDS`, mirroring the Models keys; `MEDIA_LAYOUT_KEYS.terrain = { explorer: 'mediaTerrainExplorerWidth', detail: 'mediaTerrainDetailWidth' }`.
    Persist `version` stays `31` (the `layout` merge default-fills new keys).
- [ ] `TerrainSpecSchema` in a new `shared/src/media-terrain.ts`:
  - `inputs`: `heightmap`, `satellite` and `roads`, each an optional file ref inside the terrain folder
    - `TerrainInputRefSchema = z.object({ file: z.string().regex(/^inputs\/(heightmap|satellite|roads)\.png$/), sourceName: z.string().max(255), width: z.number().int().positive(), height: z.number().int().positive(), bitDepth: z.union([z.literal(8), z.literal(16)]) })`.
      The file is always the transcoded PNG (Decision 4); `sourceName` keeps the original filename for display.
  - `resolution`: vertices per side, 2ⁿ+1 from 129 to 4097
    - `TERRAIN_RESOLUTIONS = [129, 257, 513, 1025, 2049, 4097] as const`; `z.union` of literals, default `513`.
  - `worldSize`: metres per side
    - `z.number().min(16).max(65_536)`, default `1024`.
  - `heightRange`: `[min, max]` metres
    - `z.tuple([z.number(), z.number()]).refine(([a, b]) => b > a)`, default `[0, 200]`.
  - `seaLevel`, optional
    - metres in world units, `z.number().optional()`; absent means no water plane and no `water` class from height.
  - `noise`: params, used only when there is no heightmap
    - `TerrainNoiseSchema` (Theme C): `{ kind: 'fbm' | 'ridged', seed: int ≥ 0, octaves: 1–10 (6), frequency: 0.1–16 (2), persistence: 0.1–0.9 (0.5), lacunarity: 1.5–3 (2), island: boolean (false), erosion: { iterations: 0–500_000 (50_000) } }`.
      `noise` absent on a spec with no heightmap is what makes `terrain-build` answer `needs-height-source`.
  - `alignment`: per image, offset, scale and rotation
    - `TerrainAlignmentSchema = { offset: [x, z] in terrain units (−1..1 of worldSize, default [0, 0]), scale: [sx, sz] (0.1–10, default [1, 1]), rotationDeg: −180..180 (0) }`;
      `alignment: { satellite?: TerrainAlignment, roads?: TerrainAlignment | 'satellite' }` with `roads` defaulting to `'satellite'` (follow the satellite).
  - `classes`: land-cover overrides
    - `{ vision: { enabled: boolean (false), model?: string }, k: 4–12 (8), exgThreshold: number (0.05), rockSlopeDeg: number (35) }`. Paint corrections live in `overrides/landcover.png`, not the spec (Theme F, Decision 16).
  - `foliage` and `buildings`: params
    - `foliage: { seed, treeDensity (per 100 m², 0–50, 4), grassDensity (0–200, 30), slopeLimitDeg (35), scale: [min, max] ([0.8, 1.3]), margin m (2), assets?: Partial<Record<'tree'|'grass', string[]>> }` (asset ids: built-in names or Models library paths).
    - `buildings: { seed, height: [min, max] m ([4, 18]), scaleByArea: boolean (true), minAreaM2 (20), snapToleranceDeg (12), flattenBlendM (3) }`.
  - `roads`: colour key, tolerance, width scale and blend
    - `{ colour?: '#rrggbb' (absent = auto-detect), tolerance: 0–1 (0.25), widthScale: 0.25–4 (1), widthClampM: [min, max] ([2, 30]), blendM (6), maxCutFillM (4), spurMinM (8) }`.
  - Every field optional with a default, so later themes add fields without breaking old specs
    - Top level `version: z.literal(1).default(1)` plus `.passthrough()` like `ModelManifestSchema`;
      `parseTerrainSpec(value: unknown): TerrainSpec` returns the defaulted spec and never throws on a
      missing optional field (it throws only on a wrong `version`).
    - `textureSize: 1024 | 2048 | 4096 | 8192` (default `2048`, Theme E) and `name: z.string().max(120)` are also top level.
- [ ] Library layout `.midnite/media/terrain/<group>/<terrain>/`:
  - `terrain.json` (the spec, source of truth)
  - `inputs/` (copied images, never referenced in place)
  - `build/` (generated heightfield, maps and chunks; disposable and rebuildable)
  - `export/`

  A `terrain.json` summary goes into the library manifest, mirroring `media-model-library.ts`
  - **Correction (x1):** there is no separate manifest file to keep in sync. Models' summary lives inside
    `model.json` itself; terrain does the same: `terrain.json` carries `createdAt`, `updatedAt` and a
    `lastBuild?: { at, buildMs, stats: TerrainStats }` block written by the build, which the explorer reads.
  - Names: `<group>` and `<terrain>` validate with `ModelLibraryNameSchema` (one segment, no leading dot,
    ≤ 120). A new terrain's folder is `${terrainSlug(name)}-${YYYYMMDD-HHMMSS}` using a new
    `terrainSlug` that imitates `modelSlug` (`model-service.ts` L114). The default group is
    `DEFAULT_TERRAIN_PROJECT = 'terrains'`.
  - `build/` contents are fixed by Theme B/E/F/G/H (listed in `TERRAIN_BUILD_FILES` in
    `media-terrain.ts`, so I and the tests read one list).
- [ ] Create panel (right column): three labelled attach slots, **Heightmap**, **Satellite** and **Roads mask**. Each has a one-line explanation of what it does, a thumbnail and a remove button, and accepts drag and drop. All three are visibly optional. Below them sit resolution, world size, height range and a Generate button
  - Component `TerrainPanel` in `app/features/media/terrain/terrain-panel.tsx`; each slot is
    `TerrainInputSlot({ slot, input, onAttach, onRemove })` in `terrain-input-slot.tsx`.
  - Copy, verbatim: Heightmap — _"Greyscale image: brighter is higher. Optional."_; Satellite —
    _"Top-down photo of the same area: textures the ground and places trees and buildings. Optional."_;
    Roads mask — _"Light roads on a dark background (cyan works best). Optional."_ Each slot's label
    carries an `(optional)` suffix in `text-muted-foreground`.
  - Attach: a click opens a hidden `<input type="file" accept="image/png,image/jpeg,image/webp">`;
    drag and drop accepts the same types. Both read the `File` into an `ArrayBuffer` and call
    `media.terrain.setInput({ …target, slot, bytes, name })` (Decision 5). A drop of any other type shows
    the inline error _"Use a PNG, JPEG or WebP image."_ under the slot and does not call main.
  - Empty slot: a dashed `border-border` box with the copy and an `LuImagePlus` glyph; filled: a 64px
    thumbnail from `mstudioFileUrl('repo', repoId, '<terrain>/inputs/<slot>.png')`, the
    `width × height · 8-bit|16-bit` line, and an `IconButton` (`LuX`, aria-label `Remove <slot>`).
  - Below: Resolution `IconSelect` (`components/icon-select.tsx`) over `TERRAIN_RESOLUTIONS`; World size
    and the two Height range fields as number inputs with `m` suffixes; **Generate** (primary button).
    Generate is disabled while a build for this terrain is in flight and becomes **Cancel** (Theme B).
  - Keyboard: every slot is a focusable `button` (Enter/Space opens the picker; Delete on a filled slot
    removes it). Focus order: slots top to bottom, then the fields, then Generate.
- [ ] Explorer (left column) reuses `media-projects-accordion.tsx` for groups and terrains
  - `MediaProjectsAccordion({ repoId, tab: 'terrain', selection, onSelect, fileFilter })` with
    `fileFilter = (path) => /^[^/]+\/terrain\.json$/.test(path)` (Decision 6), so a project (group) lists
    one row per terrain folder. The row label is the folder's spec `name` when loaded, else the folder name.
  - A **New terrain** button in the explorer header calls `media.terrain.library({op: 'create', …})`;
    the row context menu offers **Rename**, **Duplicate** and **Delete** (`op: 'rename' | 'duplicate' | 'delete'`);
    Delete moves the folder to the Trash through `media-store` and asks first with the folder name.
  - Empty state copy: _"No terrains yet. Create one, or ask an agent to with `terrain_set_spec`."_
- [ ] `mstudio:media:terrain-*` IPC channels and payload schemas in `shared`, with `GitOpResult` envelopes and `media:changed` on writes
  - In `CHANNELS` ([`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), beside the
    `mediaModel*` block): `mediaTerrainLibrary: 'mstudio:media:terrain-library'` (op-union
    `create | rename | duplicate | delete`, the `ModelLibraryRequestSchema` pattern),
    `mediaTerrainGet: 'mstudio:media:terrain-get'` → `GitOpResult<{ spec: TerrainSpec; built: boolean }>`,
    `mediaTerrainSetSpec: 'mstudio:media:terrain-set-spec'`, `mediaTerrainSetInput: 'mstudio:media:terrain-set-input'`,
    `mediaTerrainBuild: 'mstudio:media:terrain-build'`, `mediaTerrainCancel: 'mstudio:media:terrain-cancel'`,
    `mediaTerrainPaint: 'mstudio:media:terrain-paint'` (Theme F), `mediaTerrainRoadKey: 'mstudio:media:terrain-road-key'` (Theme H),
    `mediaTerrainExport: 'mstudio:media:terrain-export'` (Theme I).
  - In `EVENT_CHANNELS`: `mediaTerrainProgress: 'mstudio:media:terrain-progress'`
    (`{ buildId, stage: TerrainBuildStage, fraction: 0–1 }`), `mediaTerrainChanged: 'mstudio:media:terrain-changed'`
    (`{ repoId, project, terrain, revision }`), `mediaTerrainOpen: 'mstudio:media:terrain-open'` (Theme J).
  - Every request extends `TerrainTargetSchema = z.object({ repoId: z.string(), project: MediaProjectNameSchema, terrain: ModelLibraryNameSchema })`.
  - Bridge: `media.terrain: { library, get, setSpec, setInput, build, cancel, paint, roadKey, export, onProgress, onChanged, onOpen }`
    in [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) (beside `model:` at L1228) and
    [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts); handlers in a new
    `main/ipc/media-terrain-handlers.ts` exporting `registerMediaTerrainHandlers()`, called beside
    `registerMediaModelHandlers()`.
  - Every write calls `notifyMediaChanged(repoId, 'terrain')` and broadcasts `mediaTerrainChanged`.
    A failure is `{ok: false, kind: 'error', message}` with the literal messages listed per theme; nothing throws.
- [ ] Vitest: schema defaults and round trip, an old or minimal spec parses, the tab appears in the strip, and the explorer lists a seeded terrain via the mock bridge
  - `shared/src/media-terrain.test.ts`: `parseTerrainSpec({})` equals `TERRAIN_SPEC_DEFAULTS`; a full spec
    round-trips through `JSON.stringify`/parse unchanged; a `resolution: 500` is rejected; `heightRange: [5, 5]` is rejected.
  - `app/src/features/media/terrain/terrain-tab.bridge.test.tsx`: `renderView(<MediaView />, { fixtures, uiState: { selectedRepoId: 'repo-1', mediaTab: 'terrain' } })`
    with `media.files['terrain:terrains'] = { 'dunes-20261004-120000/terrain.json': … }` shows a tab named
    **Terrain** and one explorer row **dunes**; with no repo it shows `NoRepoMediaState`.
  - `mock-bridge.ts` learns `media.terrain.*` (returns the seeded spec; `build` resolves `{status: 'built'}`).
- [ ] `TerrainStatsSchema` and `TerrainBuildResultSchema` in `media-terrain.ts`, shared by the panel, the viewer, the build channel and MCP
  - `TerrainStats = { resolution, worldSize, vertexCount, triangleCount (LOD 0), chunkCount, lodCount, buildMs, minHeight, maxHeight, histogram: number[16], classPercent?: Record<TerrainClass, number>, roadCount?, roadLengthM?, buildingCount?, foliageCount?, warnings: string[] }`.
  - `TerrainBuildResult = { status: 'built', stats: TerrainStats } | { status: 'needs-height-source' }`, carried as `GitOpResult<TerrainBuildResult>`.
  - Vitest in `media-terrain.test.ts`: both arms parse; an unknown `status` is rejected.

## B — Image decode and the heightfield kernel (L)

From an image to a grid of heights to meshes a renderer can stream. Re-tagged **M/L → L** by the x1
refinement: the codec, the worker and the kernel are three separable PRs.

- [ ] **PNG and JPEG decode in desktop main** that keeps 16-bit greyscale. There is no production PNG decoder in the tree today (only tests inflate PNGs), and Electron's `nativeImage` is 8-bit BGRA, which would quantise a 16-bit heightmap to 256 steps. Write a small decoder on `node:zlib` (greyscale, RGB and RGBA at 8 and 16 bits, palette, all five filter types; refuse interlaced with a readable error). JPEG and WebP go through `nativeImage`, since they are 8-bit anyway. The output is a plain `{width, height, channels, bitDepth, data}` passed to the kernel
  - File: new `packages/desktop/src/main/media/png/png-codec.ts` (no `electron` import, so it runs in the
    utility process and under bare vitest). Exports:
    - `decodePng(bytes: Uint8Array): { ok: true; image: RasterImage } | { ok: false; message: string }`
    - `encodePngGrey16(data: Uint16Array, width: number, height: number): Buffer`
    - `encodePngRgba8(data: Uint8Array, width: number, height: number): Buffer` — moved from
      `sf3d/png.ts`'s `encodePng`, which becomes a re-export so SF3D callers are unchanged.
  - `RasterImage` lives in `shared/src/terrain/raster.ts`:
    `{ width: number; height: number; channels: 1 | 2 | 3 | 4; bitDepth: 8 | 16; data: Uint8Array | Uint16Array }`
    (16-bit data is a `Uint16Array` in host order, converted from PNG's big-endian on decode).
  - Supported colour types 0, 2, 3, 4, 6 at bit depths 8 and 16 (palette at 8); bit depths 1/2/4 are
    refused. Chunks: `IHDR`, `PLTE`, `IDAT` (concatenated before `inflateSync`), `tRNS` for palette alpha,
    `IEND`; every other chunk is skipped. CRC is checked with the existing `crc32`.
  - Literal refusals: interlaced → _"Interlaced PNGs are not supported — re-save without interlacing."_;
    bad CRC or truncated → _"This PNG is damaged and cannot be read."_; 1/2/4-bit →
    _"Low-bit-depth PNGs are not supported — re-save as 8- or 16-bit."_
  - **Resolved: JPEG and WebP are transcoded once, at attach, never at build** (Decision 4).
    `media-terrain-handlers.ts` runs `nativeImage.createFromBuffer(bytes)` and writes `.toPNG()` as
    `inputs/<slot>.png`, so the worker only ever runs `decodePng`.
  - Size limits: `TERRAIN_INPUT_MAX_BYTES = 256 * 1024 * 1024`; `TERRAIN_INPUT_MAX_SIDE = 8192`. An
    8-bit source above the side cap is downscaled at attach (`nativeImage.resize`, `quality: 'best'`) with
    the warning _"Downscaled from W×H to the 8192 px limit."_; a 16-bit PNG above it is refused
    (_"16-bit heightmaps larger than 8192 px are not supported."_) because `nativeImage` would quantise it.
- [ ] RGB heightmaps are reduced to luminance, with a warning that an 8-bit source will terrace. The 8-bit terrace is visibly softened by an optional pre-smooth
  - `toHeightSamples(image: RasterImage): { samples: Float32Array; warnings: string[] }` in
    `shared/src/terrain/raster.ts`: grey is used as-is; RGB/RGBA use Rec. 709 luma
    `0.2126 R + 0.7152 G + 0.0722 B`; alpha is ignored. Output is normalised to `[0, 1]`.
  - An 8-bit source adds _"8-bit heightmap: expect visible terracing. Pre-smooth is on."_ to
    `stats.warnings`, and the spec's `preSmooth` (new field, `0–4` px Gaussian sigma, default `1` for
    8-bit sources and `0` for 16-bit, decided at attach) is applied before resampling.
- [ ] Kernel `shared/src/terrain/heightfield.ts`: bicubic resample to the chosen 2ⁿ+1 grid, map to `heightRange`, optional Gaussian smoothing, edge clamp, central-difference normals, and min, max and histogram stats
  - Exports: `type Heightfield = { resolution: number; worldSize: number; heights: Float32Array }`
    (row-major, `heights[z * resolution + x]`, metres); `resampleBicubic(src: Float32Array, srcW, srcH, res): Float32Array`
    (Catmull-Rom kernel, a = −0.5, edge-clamped; a non-square source is stretched to square and adds
    _"Non-square heightmap stretched to a square extent."_); `buildHeightfield(samples, srcW, srcH, spec): Heightfield`;
    `gaussianBlur(h: Float32Array, res, sigma): Float32Array` (separable, radius `ceil(3σ)`);
    `heightfieldNormals(f: Heightfield): Float32Array` (central differences, one-sided at edges,
    normalised); `heightfieldStats(f): { min, max, histogram: number[] }` (16 equal bins).
- [ ] **Chunking and LOD**: split into 65- or 129-vertex chunks (chosen from the resolution), build 3–4 LOD levels per chunk with skirts to hide cracks, and compute bounds per chunk. Pure TS on typed arrays
  - `shared/src/terrain/chunks.ts`. **Rule:** `chunkVerts(resolution) = resolution <= 1025 ? 65 : 129`;
    chunks overlap by one vertex so `chunksPerSide = (resolution − 1) / (chunkVerts − 1)`; `lodCount = 4`
    (vertex step `1, 2, 4, 8`).
  - `chunkLayout(f: Heightfield): TerrainChunkInfo[]` with `{ cx, cz, minY, maxY, centre: [x, y, z], radius }`;
    `chunkMesh(f: Heightfield, cx, cz, lod): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array }`
    in world metres with the terrain centred on the origin, UVs in `[0, 1]` of the whole terrain.
  - Skirts: each chunk edge gets a vertical strip dropped by `skirtDepth = 0.02 × (heightRange[1] − heightRange[0])`,
    so mixed-LOD neighbours never show a gap.
  - LOD selection (used by D and by Phase 107's kit via the manifest): `selectLod(distance, chunkWorldSize)`
    returns `0` below `1.5 ×`, `1` below `3 ×`, `2` below `6 ×`, else `3` chunk widths. Exported so both read one rule.
- [ ] Building runs in a worker (desktop utility process or renderer Web Worker; decide here and record why), so a 4097² build never blocks a frame. Progress goes out on `mstudio:media:terrain-progress`, and a run can be cancelled
  - **Resolved: a desktop utility process** (Decision 2) on the `sf3d-broker.ts` shape: new
    `packages/desktop/src/terrain-worker/index.ts` (entry), `main/media/terrain/terrain-broker.ts`
    (`createTerrainBroker({ spawn }): TerrainBroker`, `terrainWorkerScriptPath(dirname)`),
    `main/media/terrain/worker-protocol.ts` (`TerrainWorkerIn = { type: 'build'; id; dir; spec; stages }`,
    `TerrainWorkerOut = { type: 'progress'; id; stage; fraction } | { type: 'reply'; id; ok: true; stats } | { type: 'reply'; id; ok: false; message }`),
    and `'terrain-worker'` appended to `outfiles` in `scripts/bundle.mjs`. Spawned with
    `utilityProcess.fork(terrainWorkerScriptPath(), [], { serviceName: 'mstudio-terrain', stdio: 'ignore' })`.
  - The worker reads `inputs/*.png` and writes outputs itself (node `fs` is available there), so no
    multi-megabyte array crosses IPC. It writes into `build.tmp-<buildId>/`; on success main renames it over
    `build/` inside the media store's `WriteQueue` for that root (`rm build/` then `rename`), so a cancelled
    or failed build leaves the previous `build/` intact.
  - Stages, in order (`TERRAIN_BUILD_STAGES` in `media-terrain.ts`): `decode`, `heightfield`, `erosion`,
    `drape` (E), `landcover` (F), `splat` (F), `roads` (H), `conform` (H, G), `foliage` (G), `buildings` (G),
    `write`. A stage with no inputs is skipped without a progress event.
  - **Concurrency:** one build per terrain. A `terrain-build` for a terrain that is already building cancels
    the running one first (latest wins). Builds of different terrains queue on the broker's single `lane`
    (one child, like SF3D), so two 4097² builds never hold two copies of the arrays.
  - **Cancel kills the child** (the kernel loops are synchronous and cannot poll a flag between rows);
    `terrain-cancel({buildId})` resolves `{ok: true}` and the build's own promise resolves
    `{ok: false, kind: 'error', message: 'Build cancelled.'}`. The next build forks a fresh worker.
  - A child that exits mid-build resolves _"The terrain builder stopped unexpectedly (it may have run out
    of memory). Try a lower resolution."_
  - Observability: main logs one line per build through the existing log seam —
    `terrain build <terrain> res=<n> stages=<list> ms=<n> ok|cancelled|failed:<message>` — and nothing per stage.
- [ ] Vitest: a 16-bit PNG fixture decodes to exact values, an 8-bit RGB decodes to luminance, an interlaced PNG is refused with a readable error, resampling is exact on grid points, normals of a plane and a cone are correct, and LOD chunks share edge heights (no cracks)
  - `desktop/src/main/media/png/png-codec.test.ts`: fixtures are built in-test with `encodePngGrey16`
    and a hand-written interlaced IHDR; `decodePng(encodePngGrey16(d, 3, 2))` returns `d` bit-exactly;
    all five filter types decode a fixture row each; the three refusal messages match literally.
  - `shared/src/terrain/heightfield.test.ts`: `resampleBicubic` at `res = src` returns the source exactly;
    a plane `y = 2x` gives normals within 1e-6 of `normalize([-2, 1, 0])`; a cone's normals point away
    from the apex; `heightfieldStats` histogram sums to `resolution²`.
  - `shared/src/terrain/chunks.test.ts`: for every LOD pair, the shared edge vertices of neighbours have
    equal heights at the coarser LOD's vertices; `chunkVerts(1025) === 65`, `chunkVerts(2049) === 129`;
    `selectLod` boundaries.
  - `desktop/src/main/media/terrain/terrain-broker.test.ts` (fake `spawn`, the `sf3d-broker` test shape):
    progress is forwarded, a second build for the same terrain cancels the first, a child exit settles every
    pending build with the crash message, and cancel calls `kill`.

## C — No heightmap: warn, then noise or upload (S/M)

Missing a heightmap is a question, not a silent default (user, 2026-10-04).

- [ ] Generate with no heightmap attached shows a **warning dialog**: _"No heightmap attached — generate the shape from noise, or upload one?"_ It offers **Use noise**, **Upload heightmap…** and Cancel. There is no remembered default; it asks every time until a heightmap or noise params are saved on the spec
  - Trigger: the dialog opens when `media.terrain.build` answers `{ok: true, value: {status: 'needs-height-source'}}`
    — the renderer never pre-decides, so UI and MCP share one rule (main's `needsHeightSource(spec)`:
    `!spec.inputs.heightmap && !spec.noise`).
  - Component `NoHeightmapDialog` in `app/features/media/terrain/no-heightmap-dialog.tsx` on the repo's
    existing dialog primitive (`role="alertdialog"`, focus starts on **Use noise**, Esc = Cancel).
  - **Use noise** saves `noise: { kind: 'fbm', seed: <random 0–2³¹>, …defaults }` via `setSpec`, then
    re-runs Generate. **Upload heightmap…** opens the Heightmap slot's file picker (Decision 5's path) and
    offers **Generate from a prompt** as a second button. Cancel does nothing.
- [ ] Noise generator in the kernel:
  - fBm and ridged multifractal
  - seed, octaves, frequency, persistence and lacunarity
  - a radial island falloff toggle
  - a fast hydraulic erosion pass (particle-based, iteration count bounded)
  - Files: `shared/src/terrain/noise.ts` (`createRng(seed): () => number` — mulberry32, the one PRNG every
    terrain stage uses; `simplex2(rng)`; `fbmField(res, params): Float32Array` and `ridgedField(res, params)`
    normalised to `[0, 1]`; island falloff multiplies by `1 − smoothstep(0.6, 1.0, r)` where `r` is the
    normalised distance to the centre).
  - `shared/src/terrain/erosion.ts`: `erode(h: Float32Array, res, { iterations, seed }): { heights; eroded; deposited }`
    — droplet model (inertia 0.05, capacity 4, deposition 0.3, erosion 0.3, evaporation 0.01, gravity 4,
    max lifetime 30 steps, brush radius 3). `iterations` is hard-capped at `500_000`; the worker emits
    `erosion` progress every 5 %.
- [ ] **Upload** opens the heightmap slot's file picker. It also offers **Generate one from a prompt** through `image-service.ts`, asking for a top-down greyscale height map, then decoding and normalising the result like any upload
  - **Resolved: generate into the Images tab, then copy** (Decision 7). `terrain-set-input` with
    `{ slot: 'heightmap', prompt, provider, model }` calls `imageService.generate({ generationId, repoId, project: 'terrain-heightmaps', prompt: TERRAIN_HEIGHTMAP_PROMPT(prompt), provider, model, aspect: '1:1', count: 1 })`,
    then attaches `files[0]` exactly as an upload. The generated picture stays visible in Images.
  - `TERRAIN_HEIGHTMAP_PROMPT(user: string)` in `media-terrain.ts`: _"A top-down greyscale heightmap of
    {user}. Pure greyscale, no colour, no text, no shading, no border; white is the highest ground and
    black the lowest; square."_
  - The prompt dialog shows the provider and model pickers from the Images tab's own components; a
    provider with no key shows its `providerStatuses` reason and is disabled.
- [ ] The noise params live on the spec, so a noise terrain is reproducible from its seed
  - A **Seed** number field with an `LuDices` "re-roll" `IconButton` appears in the panel whenever
    `spec.noise` is set; changing it re-runs Generate.
- [ ] Vitest: the same seed gives the same field, erosion conserves sediment mass within tolerance, and Generate with no heightmap and no noise params returns the "needs a choice" result rather than building
  - `shared/src/terrain/noise.test.ts`: two `fbmField` calls with seed 7 are byte-identical; seeds 7 and 8 differ.
  - `shared/src/terrain/erosion.test.ts`: `|eroded − deposited| / eroded < 0.01` on a 129² fBm field
    with 10 000 iterations; `iterations: 1_000_000` is clamped to 500 000.
  - `desktop/src/main/media/terrain/terrain-service.test.ts`: `build` on a spec with neither returns
    `{ok: true, value: {status: 'needs-height-source'}}` and never spawns the worker.
  - `app/src/features/media/terrain/no-heightmap-dialog.test.tsx`: the dialog opens on that result,
    **Use noise** calls `setSpec` with a `noise` block and then `build`.

## D — Viewer and parameter panel (M)

- [ ] R3F viewport (centre column), lazily loaded like `model-viewer-lazy.tsx`, rendering the B chunks with distance-based LOD selection
  - `app/features/media/terrain/terrain-viewer-lazy.tsx` exports `LazyTerrainViewer(props)` wrapping
    `lazy(() => import('./terrain-viewer'))` in the same `ViewerBoundary` + `Suspense` pair.
  - **Resolved: the viewer reads build files, not IPC payloads** (Decision 3). It fetches
    `mstudioFileUrl('repo', repoId, '<project>/<terrain>/build/heights.f32')` (raw little-endian
    `Float32Array`, `resolution²` floats) and `build/chunks.json` (`TerrainChunkInfo[]` plus `lodCount`),
    then builds geometry with the shared `chunkMesh` on demand, cached by `${cx},${cz},${lod}`.
  - Meshing budget: at most **4** `chunkMesh` calls per frame (queued nearest-first), so a 4097² terrain
    streams in over a few frames instead of stalling one. A chunk whose mesh is not ready yet renders its
    next-coarser cached LOD.
  - LOD per chunk per frame via the shared `selectLod(distance, chunkWorldSize)` against the camera
    position; frustum culling uses `TerrainChunkInfo.centre/radius`.
  - Loading state: a centred `Spinner` with _"Loading terrain…"_ until `chunks.json` resolves; before any
    build the centre shows _"Nothing built yet. Attach images or choose noise, then Generate."_
- [ ] Orbit and fly camera, a sun direction and time-of-day slider, and a water plane at `seaLevel`
  - Camera: `OrbitControls` (drei) by default; **F** toggles fly mode (WASD + mouse-drag look, Shift ×4
    speed, Q/E down/up) while the canvas has focus. Keys are handled on the canvas element only; no
    `COMMANDS` entry (scope guardrail).
  - Sun: one `directionalLight` whose elevation comes from a **Time of day** slider (`0–24 h`, default 10)
    mapped to elevation `sin(π (t − 6) / 12)` clamped to ≥ 2°; azimuth fixed at 135°. Not persisted on
    the spec (it is a viewing aid), kept in component state.
  - Water: a `planeGeometry` of `worldSize × 1.2` at `y = seaLevel`, `meshStandardMaterial` colour
    `#2a6f97`, opacity 0.7; absent when `seaLevel` is unset.
- [ ] Debug shading modes in a compact `IconSelect`: shaded, wireframe, height ramp, slope, land cover (F), splat (F) and road mask (H)
  - `TERRAIN_SHADING_MODES = ['shaded', 'wireframe', 'height', 'slope', 'landcover', 'splat', 'roads'] as const`
    in `media-terrain.ts`; `IconSelect` from `components/icon-select.tsx` (the one `model-editor.tsx` uses).
    A mode whose map does not exist yet is shown disabled with the description _"Needs a satellite image"_ /
    _"Needs a roads mask"_.
  - Height ramp and slope are computed in the shader from vertex height and normal (no extra file);
    `landcover`, `splat` and `roads` sample `build/landcover.png`, `build/splat.png`, `build/roads-mask.png`.
  - The ramp colours are fixed hex stops (`#1d3557 → #457b9d → #a8dadc → #f1faee → #e9c46a → #8d6e63 → #ffffff`)
    so the debug views read the same in light and dark themes; the canvas background follows the app
    theme's `--background` token.
- [ ] Changing the resolution, world size or height range re-bakes in the worker and swaps chunks without a blank frame
  - Changing any of them saves the spec and starts a build; the viewer keeps rendering the current
    `heights.f32` until `mediaTerrainChanged` arrives with a new `revision`, then fetches the new files
    (URL carries `?v=<revision>` to defeat caching) and swaps the chunk cache in one frame.
  - Number fields commit on blur or Enter, not per keystroke (no build storm).
- [ ] Stats readout: vertex and triangle counts, chunk count, build time, and the min and max height
  - `TerrainStatsReadout({ stats })` in the detail column renders `TerrainStats` fields as a two-column
    `dl`, plus a live **Frame** row: p50 frame time in ms over the last 120 frames, measured in a
    `useFrame` sampler (this is the number K records). `stats.warnings` render as a bulleted
    `text-amber-600 dark:text-amber-400` list under it.
- [ ] The viewport idles when the window is blurred or the tab is hidden (the Phase 84 visibility gates)
  - `<Canvas frameloop={visible && focused ? 'always' : 'never'}>` with `visible = usePageVisible()`
    ([`lib/use-page-visible.ts`](../../../packages/app/src/lib/use-page-visible.ts)) and
    `focused = useWindowFocused()` ([`lib/use-window-focus.ts`](../../../packages/app/src/lib/use-window-focus.ts));
    `'always'` (not `'demand'`) because LOD and fly mode need per-frame updates.
- [ ] Vitest via the mock bridge: shading mode switching, re-bake on parameter change, and the stats readout
  - `app/src/features/media/terrain/terrain-panel.bridge.test.tsx`: choosing `slope` in the shading
    `IconSelect` updates the viewer prop; committing Resolution 1025 calls `setSpec` then `build`; the
    readout shows `vertexCount` from the mocked stats; `landcover` is disabled without a satellite input.
    (The R3F canvas itself is mocked out in jsdom, as `model-tab.bridge.test.tsx` does.)
- [ ] `TerrainViewer` frame-loop and streaming rules are unit-tested without WebGL
  - `app/src/features/media/terrain/chunk-stream.ts` holds the pure queue (`nextChunksToMesh(camera, chunks, cache, budget = 4)`);
    `chunk-stream.test.ts` asserts nearest-first order, the budget cap, and coarser-LOD fallback.

## E — Satellite: drape and alignment (M)

- [ ] The satellite image is draped as the albedo texture, top-down, in the terrain's UV space
  - The worker's `drape` stage writes `build/drape.png` (RGBA8, `textureSize²`) by resampling
    `inputs/satellite.png` through the alignment transform (bilinear; outside the image is `#000000` with
    alpha 0). The viewer's `shaded` mode uses it as `map` when present, else a flat `#7a8f5a`.
- [ ] Alignment: offset, scale and rotation, set with handles in the viewer and fields in the panel, plus an onion-skin overlay of the satellite against the height ramp to line them up. Stored on the spec per image. The roads mask (H) gets the same alignment control, defaulting to the satellite's
  - Kernel: `shared/src/terrain/align.ts` — `alignmentMatrix(a: TerrainAlignment): Mat3` (scale, then
    rotate about the centre, then offset) and `terrainToImageUv(u, v, a)`, `imageUvToTerrain(u, v, a)`.
  - Panel: an **Alignment** section per attached image (Satellite, Roads) with Offset X/Z, Scale X/Z
    (a lock-aspect toggle, default on) and Rotation fields; Roads shows a **Follow satellite** checkbox
    (`alignment.roads === 'satellite'`, default on).
  - Viewer: an **Align** toggle (`LuMove`) shows a translucent quad of the image over the `height` ramp
    with an opacity slider (onion skin, default 0.5), plus drei `TransformControls` restricted to X/Z move,
    Y rotate and X/Z scale; releasing a handle writes the spec once (not per drag frame).
- [ ] Texture resolution is chosen independently of mesh resolution (1K to 8K). Larger sources are downsampled in main, with mipmaps generated on load
  - `spec.textureSize` (`1024 | 2048 | 4096 | 8192`, default 2048) selects `drape.png`'s size; the resample
    happens in the worker (`drape` stage). The viewer loads it with `generateMipmaps = true` and
    `anisotropy = gl.capabilities.getMaxAnisotropy()`.
- [ ] Vitest: the alignment transform maps the image corners to the expected terrain coordinates, and a rotated alignment round-trips
  - `shared/src/terrain/align.test.ts`: identity maps corners to corners; offset `[0.5, 0]` shifts by
    half the world; `rotationDeg: 90` sends `(1, 0)` to `(0, 1)` about the centre;
    `imageUvToTerrain(terrainToImageUv(p))` is within 1e-9 of `p` for 100 random alignments.

## F — Satellite: land-cover classification and splat materials (L)

The satellite image tells the app *what* is where, not just what colour it is.

- [ ] Classes: `water`, `tree`, `grass`, `bare` (soil, sand), `rock`, `road`, `building`, `other`. The list lives in the kernel, with a colour per class for the debug view
  - `TERRAIN_CLASSES = ['water', 'tree', 'grass', 'bare', 'rock', 'road', 'building', 'other'] as const`
    (index = the value in `landcover.png`) and `TERRAIN_CLASS_COLOURS` (`#3a7bd5`, `#2d6a4f`, `#95d5b2`,
    `#d4a373`, `#8d99ae`, `#343a40`, `#e63946`, `#adb5bd`) in `shared/src/terrain/classes.ts`.
- [ ] Classifier in `shared/src/terrain/classify.ts`, deterministic and pure TS:
  - excess-green index (ExG = 2G − R − B) for vegetation, split into tree and grass by local texture variance
  - k-means in CIE Lab for the remaining clusters
  - slope from the heightfield to separate rock from bare ground
  - flat, smooth, grey-blue regions below `seaLevel` as water
  - rectilinear high-contrast blobs as building candidates
  - Signature: `classify(drape: RasterImage, field: Heightfield, opts: TerrainSpec['classes'] & { seaLevel?: number; seed: number }): { classes: Uint8Array; clusters: TerrainCluster[] }`
    at the drape's resolution capped to 2048² (the classifier downsamples a larger drape first).
  - Rules, applied in this order (first match wins): ExG/(R+G+B) > `exgThreshold` → vegetation, then
    tree if the 7×7 luminance variance > 0.004 else grass; height < `seaLevel` and slope < 3° and
    7×7 variance < 0.001 and Lab hue in 180°–260° → water; slope ≥ `rockSlopeDeg` → rock; then k-means
    (`k` clusters, k-means++ seeded from `seed`, 20 iterations) labels the rest by nearest prototype:
    grey low-chroma (C* < 12) and L* 25–70 → road, high-contrast rectilinear components
    (`rectangularity ≥ 0.75`, area ≥ `buildings.minAreaM2`) → building, warm low-chroma → bare, else other.
  - **Resolved: deterministic first, vision optional** (Decision 8, closes the original open). The
    heuristics always run and are the result unless the vision pass relabels.
- [ ] Optional vision pass: send cluster swatches plus a downscaled image to a vision model (Ollama vision or a roster agent via `engines.ts`) to relabel clusters. Off by default, with a toggle and an engine picker in the panel. The heuristics stay the baseline, so the result never depends on a model
  - **Resolved: Ollama vision only, through a new `createVisionCall`** (Decision 9). `createLlmCall` has no
    image input, so a roster agent is not offered for this pass; `createDescribeImage` has a fixed prompt,
    so it cannot ask for JSON. `engines.ts` gains
    `createVisionCall(deps: EngineDeps): VisionCall` with
    `VisionCall = (req: { images: string[] /* base64 PNG, no data: prefix */; prompt: string; visionModel?: string; json?: boolean; signal: AbortSignal }) => Promise<GitOpResult<{ text: string; model: string }>>`,
    implemented exactly like `createDescribeImage` (same `discoverVisionModels()[0]` default, same
    not-installed message, `MODEL_VISION_TIMEOUT_MS`) but passing `prompt`, all `images`, and
    `format: 'json'` when `json`. `createDescribeImage` is untouched. The picker lists `discoverVisionModels()`;
    with none installed the toggle is disabled with _"Install an Ollama vision model (e.g. llava) to
    enable this."_
  - Request: one 512² downscale of the drape plus a 4×N swatch strip of cluster prototypes, prompt
    asking for a JSON object `{ "<clusterIndex>": "<class>" }`; the reply is parsed with zod
    (`TerrainRelabelSchema = z.record(z.string().regex(/^\d+$/), z.enum(TERRAIN_CLASSES))`). A reply that
    fails to parse, names an unknown cluster, or times out (`MODEL_VISION_TIMEOUT_MS`) is ignored and
    _"Vision relabel skipped: <reason>."_ joins `stats.warnings`; the heuristic labels stand.
  - The relabel runs in main (not the worker), between the worker's `landcover` and `splat` stages, by
    splitting the build into two worker calls when `classes.vision.enabled`.
- [ ] **Correction by painting**: a class brush in the viewer to fix misclassified areas. Corrections are stored as an override layer (`build/landcover-overrides.png`) so a re-classify keeps them
  - **Correction (x1):** the override layer must not live in `build/` (which a build replaces wholesale).
    It is `overrides/landcover.png` (8-bit grey, value = class index + 1, 0 = no override) at the
    classifier's resolution.
  - Brush: a **Paint class** toggle (`LuBrush`, key **B** while the canvas has focus) shows a class
    palette (the eight swatches with names) and a radius slider (1–64 px); strokes raycast to terrain UVs.
    On pointer-up the stroke is sent as `media.terrain.paint({ …target, cls, radiusPx, points: [u, v][] })`;
    main rasterises it into the override PNG under the WriteQueue and re-runs only the `landcover` →
    `splat` → `foliage` → `buildings` stages. **Erase** is class `0`. Undo is out of scope (the brush can
    repaint).
- [ ] Outputs:
  - `build/landcover.png`, an index map, plus a legend JSON
  - `build/splat.png`, RGBA weights for up to four tiled materials per layer, from land cover + slope + height
  - `build/landcover.json` is the legend: `{ classes: TERRAIN_CLASSES, colours: TERRAIN_CLASS_COLOURS, percent: Record<TerrainClass, number> }`.
  - Splat channels are fixed: R = grass, G = rock, B = dirt/sand, A = snow. Weights per texel: grass from
    `grass`/`tree`, dirt from `bare`/`road`/`building`, rock = `smoothstep(rockSlopeDeg − 10, rockSlopeDeg, slope)`,
    snow = `smoothstep(snowLine − 10 m, snowLine, height)` with `snowLine = heightRange[1] − 0.15 × span`
    (new optional spec field `snowLineM`), then normalised to sum to 1 (`water` texels are all-dirt).
- [ ] A splat shader in the viewer blends tiled PBR materials (grass, rock, dirt/sand, snow above a height) close to the camera and fades to the satellite drape with distance. Built-in CC0 material tiles ship as app resources, with their licences recorded
  - `app/features/media/terrain/splat-material.ts`: a `MeshStandardMaterial` with `onBeforeCompile`
    injecting the four-layer blend; tiles repeat every 8 m; the blend fades to `drape.png` between 150 m
    and 400 m from the camera (no drape → tiles everywhere).
  - Tiles: `packages/desktop/resources/terrain-materials/{grass,rock,dirt,snow}/{albedo,normal}.png`
    (512², from ambientCG, CC0) with `packages/desktop/resources/terrain-materials/LICENSES.md` listing
    each source URL and the CC0 statement; shipped by a new `extraResources` entry in
    [`electron-builder.yml`](../../../packages/desktop/electron-builder.yml)
    (`resources/terrain-materials → terrain-materials`) and resolved like `template-path.ts`
    (`process.resourcesPath` packaged, the repo path in dev) by `terrainMaterialsDir()`.
  - The `splat` stage copies the tiles into the terrain's `build/materials/` (≈ 2 MB), so the viewer loads
    them through the existing `mstudio-file://repo/…` scope, the export reads the same files, and
    `fs-protocol.ts` needs no new scope.
- [ ] If a roads mask is also attached, the `road` class from the satellite is shown as a cross-check against H, never merged automatically
  - In `roads` shading mode, satellite `road` texels draw as a 50 % magenta overlay over H's mask; the
    stats show `roadAgreement` (IoU of the two, 0–1). Nothing changes H's graph.
- [ ] Vitest: synthetic fixtures (painted patches of known colour) classify to their classes, the overrides survive a re-classify, splat weights sum to 1, and the snow line follows the height threshold
  - `shared/src/terrain/classify.test.ts`: a 64² fixture of four patches (`#2d6a4f` on noise, `#95d5b2` flat,
    `#3a7bd5` below sea level, `#8d99ae` on a 45° slope) classifies ≥ 95 % to tree/grass/water/rock; the same
    seed gives identical output.
  - `shared/src/terrain/splat.test.ts`: every texel's four weights sum to 1 ± 1e-6; snow is 0 below
    `snowLine − 10` and 1 above `snowLine`.
  - `desktop/src/main/media/terrain/terrain-service.test.ts`: a paint stroke writes `overrides/landcover.png`,
    a full rebuild keeps it, and painted texels win in `landcover.png`.
  - `desktop/src/main/media/terrain/vision-relabel.test.ts`: a stub `VisionCall` returning bad JSON
    leaves the heuristic labels and adds the warning.

## G — Foliage and buildings from the land cover (L)

- [ ] **Foliage scatter**:
  - Poisson-disk sampling with density driven by the `tree` and `grass` classes, a seed, a slope limit and a min and max scale
  - kept out of `road`, `building` and `water`, plus a margin
  - `shared/src/terrain/scatter.ts`: `scatterFoliage(landcover: Uint8Array, lcRes, field, opts: TerrainSpec['foliage']): TerrainFoliageInstance[]`
    using Bridson's algorithm per class with radius `r = sqrt(100 / density / π)` m; candidates are kept
    only on their class, on slope ≤ `slopeLimitDeg`, and at ≥ `margin` m from any `road`/`building`/`water`
    texel (via a distance transform). Rotation is a seeded yaw; scale is seeded uniform in `scale`.
  - Hard cap `TERRAIN_FOLIAGE_MAX = 200_000` instances; above it density is scaled down uniformly and
    _"Foliage capped at 200 000 instances."_ joins the warnings.
- [ ] Built-in low-poly foliage (2–3 trees, a bush, a grass clump), authored as Models primitive designs so they come from the existing kernel. Swappable per class for any Models asset
  - Five designs in `shared/src/terrain/foliage-designs.ts` as `ModelSpec` values built only from
    `model-geometry` primitives: `pine`, `broadleaf`, `birch`, `bush`, `grass-clump`, each ≤ 300 triangles.
    Default assets: `tree → ['pine', 'broadleaf', 'birch']`, `grass → ['grass-clump', 'bush']`.
  - Swap: the panel's **Foliage** section has an asset list per class; **Add from Models…** opens a picker
    over the Models library (`media.model.library.list`) and stores the library path in `spec.foliage.assets`.
    A missing or unparsable asset at build time falls back to the built-in default and warns.
- [ ] Instanced rendering in the viewer (one `InstancedMesh` per asset per chunk), culled by chunk
  - The viewer builds each built-in design once with the Models kernel, then one `InstancedMesh` per
    (asset, chunk) from `foliage.json`; chunks outside the frustum hide their meshes; instances farther than
    600 m are not drawn (a fixed draw distance, tunable later).
- [ ] **Building footprints** from the `building` class:
  - morphological open/close
  - contour tracing, then Douglas-Peucker simplification and snapping to right angles where the angles are within tolerance
  - minimum area filter
  - `shared/src/terrain/footprints.ts`: `extractFootprints(landcover, lcRes, worldSize, opts): TerrainBuilding[]`
    — 3×3 open then close, Moore-neighbour contour tracing, Douglas-Peucker with ε = 1 px, corners within
    `snapToleranceDeg` of 90° snapped by least-squares orthogonalisation, polygons below `minAreaM2` dropped.
    Shared morphology helpers (`dilate`, `erode`, `distanceTransform`) live in `shared/src/terrain/morphology.ts`,
    reused by H.
- [ ] Buildings are extruded with flat roofs from a height range (random within a range, seeded, optionally scaled by footprint area). The terrain is flattened under each footprint to its mean height, with a short blend
  - Height = `lerp(min, max, rng())`, times `clamp(sqrt(area / 200), 0.75, 1.5)` when `scaleByArea`.
    `shared/src/terrain/conform.ts` `flattenFootprints(field, buildings, blendM)` sets heights inside the
    polygon to its mean and blends linearly over `flattenBlendM` outside it. Buildings are flattened
    **after** roads (H), so a building never re-tilts a road.
- [ ] Both sets are stored as data, not baked into the mesh: `build/foliage.json` (asset id, position, rotation, scale) and `build/buildings.json` (polygon, height, base height). Phase 107 places them itself
  - Schemas in `media-terrain.ts`: `TerrainFoliageFileSchema = { version: 1, assets: string[], instances: [assetIndex, x, y, z, yawRad, scale][] }`
    (tuples keep 200 000 instances under ~10 MB) and `TerrainBuildingsFileSchema = { version: 1, buildings: { polygon: [x, z][], baseY: number, height: number }[] }`,
    all coordinates in world metres, terrain centred on the origin, Y up.
- [ ] Vitest: the scatter respects exclusion classes and the slope limit, the same seed gives the same instances, a square footprint traces to four corners, and the flattening leaves the footprint level
  - `shared/src/terrain/scatter.test.ts`, `footprints.test.ts` (a 20×20 px square → 4 corners; a square
    rotated 10° with a 2 px notch → 4 corners after snap; a 3 px blob is dropped), and `conform.test.ts`
    (height variance inside a flattened footprint < 1e-9).

## H — Roads from the roads mask (L)

The roads image is a mask: light roads on a dark background, **often cyan** (user, 2026-10-04).

- [ ] **Road extraction**:
  - auto-detect the dominant saturated hue (cyan is the default guess); otherwise fall back to luminance above a threshold
  - an eyedropper in the panel to pick the road colour, and a tolerance slider
  - the extracted mask shows live in the road-mask debug mode
  - `shared/src/terrain/road-mask.ts`: `detectRoadColour(img): { colour: '#rrggbb' | null }` — a 36-bin hue
    histogram over pixels with HSV S > 0.4 and V > 0.4; the peak bin wins if it holds ≥ 60 % of them, else
    `null` (luminance fallback: L > 0.5). `extractRoadMask(img, colour | null, tolerance): Uint8Array`
    (distance in RGB normalised to `[0, 1]`).
  - Eyedropper: an `IconButton` (`LuPipette`) beside a colour swatch in the **Roads** section; clicking a
    point on the onion-skin roads overlay sets `spec.roads.colour`. **Live** preview: dragging the tolerance
    slider calls `media.terrain.roadKey({ …target, colour, tolerance })`, which returns a 512² preview mask
    PNG as base64 (debounced 150 ms) without a full build; the full mask is `build/roads-mask.png`.
- [ ] Clean-up: morphological close to bridge small gaps, open to drop specks, and a minimum-component-size filter
  - 3×3 close then 3×3 open (`morphology.ts`), then components under `spurMinM` × width-in-px pixels are dropped.
- [ ] Skeletonise (Zhang–Suen thinning). Extract a graph with nodes at junctions and endpoints. Prune spurs below a length, merge near-duplicate nodes, simplify, and fit Catmull-Rom splines per edge
  - `shared/src/terrain/skeleton.ts` (`zhangSuen(mask, w, h): Uint8Array`) and
    `shared/src/terrain/road-graph.ts` (`skeletonToGraph`, `pruneSpurs(graph, minM)`, `mergeNodes(graph, epsM = 3)`,
    `fitSplines(graph)` — centripetal Catmull-Rom, control points every ~10 m after Douglas-Peucker ε = 1 px).
- [ ] **Width per edge** from the distance transform of the mask, times `widthScale`, clamped to a sane min and max
  - Width = `2 × median(distanceTransform)` sampled along the edge's skeleton pixels, in metres, × `widthScale`,
    clamped to `widthClampM`.
- [ ] **Road meshes**: ribbons along the splines with UVs along the length, plus junction patches. Placed slightly above the conformed terrain
  - `shared/src/terrain/road-mesh.ts` `roadMeshes(graph, field): MeshPart-like { positions, normals, uvs, indices }[]`
    sampled every 2 m, 0.05 m above the conformed surface; junction patches are triangle fans over the
    node's incident ribbon ends. U runs across (0–1), V = metres / width.
- [ ] **Terrain conform**: flatten along each road to its cross-section height, with a falloff blend on either side and a cut/fill limit, so roads never float or dig trenches
  - `conform.ts` `conformRoads(field, graph, { blendM, maxCutFillM })`: the road height along an edge is the
    terrain height smoothed by a 30 m moving average; across the width the surface is level; outside it
    blends over `blendM`. A change larger than `maxCutFillM` is clamped and the road follows the clamped
    surface (the road tilts rather than trenches); each clamp adds one warning per edge, at most 10 listed.
- [ ] Output: `build/roads.json` as a road graph (nodes, edges, spline control points, width, and a `kind` from width: path, street or avenue). Phase 107's open-world starter routes traffic and pedestrians on it
  - `TerrainRoadsFileSchema = { version: 1, nodes: { id: number, p: [x, y, z], degree: number }[], edges: { id, a, b, points: [x, y, z][], widthM, kind: 'path' | 'street' | 'avenue', lengthM }[] }`
    with `kind` thresholds `< 4 m` path, `< 10 m` street, else avenue.
- [ ] Vitest:
  - a straight cyan line yields one edge whose width matches the drawn width
  - a plus-shaped mask yields one 4-way junction
  - spurs below the threshold are pruned
  - the conformed terrain is level across the road's width
  - a mask with no road pixels returns an empty graph, not an error
  - Files: `shared/src/terrain/road-mask.test.ts`, `skeleton.test.ts`, `road-graph.test.ts`, `conform.test.ts`.
    The straight-line case: a 10 px wide `#00ffff` line on `#000000` at 1 m/px gives one edge with
    `widthM` in `[9, 11]`; `detectRoadColour` returns a hue within 10° of cyan.

## I — Export and the game-engine manifest (M)

What leaves the app, and the contract Phase 107 reads.

- [ ] **`.glb` export** through the existing `gltf-writer.ts`: chunk meshes at a chosen LOD, the drape or a baked splat texture, road meshes, building meshes, and foliage as separate nodes (or `EXT_mesh_gpu_instancing` if the writer can support it cleanly; decide here). Re-imports through three's `GLTFLoader` in vitest
  - **Resolved: `EXT_mesh_gpu_instancing`** (Decision 10, closes the original open). `buildGltf` gains a
    fourth optional parameter `instancing: GltfInstancing | null = null` with
    `GltfInstancing = { meshes: { part: MeshPart; translations: Float32Array; rotations: Float32Array; scales: Float32Array }[] }`;
    each entry emits one node with `extensions.EXT_mesh_gpu_instancing.attributes.{TRANSLATION, ROTATION, SCALE}`
    accessors and lists the extension in `extensionsUsed` (not `extensionsRequired`). Existing callers pass
    nothing and their output is byte-identical (asserted).
  - Terrain glb: one node per chunk at the chosen LOD (`chunk_<cx>_<cz>`), named nodes `roads` and
    `buildings` (one merged mesh each), and one instanced node per foliage asset. The chunk material uses the
    drape (or, with **Bake splat** on, a `textureSize²` bake of the splat blend) as `baseColorTexture`, passed
    on `MeshPart.texture` exactly as Models textures are.
  - Export options (detail column, shown when the format is `glb`): LOD `0–3` (default 1), Texture
    `drape | splat-bake | none`, Include foliage / roads / buildings (all on).
- [ ] **Raw export for engines**: `heightfield.png` (16-bit greyscale) plus `heightfield.json` (resolution, world size, height range), so a Rapier heightfield collider is built from exact data rather than from the mesh
  - `heightfield.png` is `encodePngGrey16` of `round((h − min) / (max − min) × 65535)`;
    `heightfield.json` = `{ version: 1, resolution, worldSize, heightRange: [min, max], rowMajor: 'z', origin: 'centre' }`.
- [ ] **`terrain.manifest.json`**, versioned with a zod schema in `shared/src/media-terrain.ts` (`TerrainManifestSchema`). It lists:
  - the heightfield
  - the chunk files and their LODs
  - the splat and land-cover maps with their legend
  - the material tiles
  - `foliage.json`, `buildings.json` and `roads.json`
  - the bounds

  Phase 107's three.js kit loads exactly this
  - Shape: `{ version: 1, name, generator: 'midnite-studio', worldSize, heightRange, bounds: { min: [x, y, z], max: [x, y, z] },
    heightfield: { png, json }, chunks: { verts, perSide, lods: { lod, glb }[] }, maps: { drape?, splat?, landcover?, landcoverLegend? },
    materials?: { grass, rock, dirt, snow }: { albedo, normal }, foliage?, buildings?, roads?, foliageAssets?: { name, glb }[] }`.
    Every path is relative to the manifest's folder.
  - Chunk files: one glb per LOD (`chunks/lod0.glb` … `lod3.glb`), each with one node per chunk named
    `chunk_<cx>_<cz>` (Decision 12): Phase 107 streams by node, and 4 files beat 4 096.
  - Built-in foliage designs are exported once each as `foliage/<name>.glb` so the kit can instance them.
- [ ] `MEDIA_TAB_EXPORT_FORMATS` lists `glb` and `terrain-pack` (the manifest folder, zipped) for the tab, and `ExportToolbar` offers both
  - **Resolved: `terrain-pack` is a folder, not a zip** (Decision 13). There is no zip writer in
    production code; Phase 107's asset bridge copies a folder; and a folder is what a human opens in a
    file browser. `MEDIA_EXPORT_FORMATS` gains `'terrain-pack'` and `MEDIA_EXPORT_FORMAT_INFO['terrain-pack'] = { label: 'Terrain pack (folder)', ext: '', needsFfmpeg: false }`;
    `MEDIA_TAB_EXPORT_FORMATS.terrain = ['terrain-pack', 'glb']` (pack first = the default).
  - Destination: the existing `mediaExportDir` ui-store setting, else a `bridge().repos.pickDirectory()`
    prompt; the pack is written as `<dest>/<terrain>.terrain/` and an existing folder of that name is
    refused with _"<name>.terrain already exists in that folder."_ (no overwrite). The glb is
    `<dest>/<terrain>.glb`, same rule.
  - `terrain-export` returns `GitOpResult<{ path: string; bytes: number }>`; the toolbar shows a toast with
    **Reveal** (`media.reveal`).
- [ ] Vitest: the manifest validates, every path it lists exists, the heightfield PNG round-trips through the B decoder bit-exactly, and the glb re-imports with the expected node count
  - `desktop/src/main/media/terrain/terrain-export.test.ts` against a 129² fixture terrain built in a temp
    dir: `TerrainManifestSchema.parse` succeeds; every listed path `existsSync`; `decodePng(heightfield.png)`
    equals the quantised heights; `new GLTFLoader().parseAsync(ab(glb), '')` (the `export-fidelity.test.ts`
    pattern; three is a desktop devDependency) of a glb exported with Texture `none` yields
    `chunksPerSide² + 2 + foliageAssetCount` nodes and an `InstancedMesh` per foliage asset. Image decoding
    needs a DOM, so the textured variant is asserted on the glb's JSON chunk instead (`images.length === 1`,
    the chunk material's `baseColorTexture` set).
  - `desktop/src/main/media/model/gltf-instancing.test.ts`: a 3-instance mesh round-trips through
    `GLTFLoader` as one `InstancedMesh` with `count === 3`; `writeGlb(parts)` with no instancing is
    byte-identical to its pre-change output (snapshot hash).

## J — Terrain over MCP, and the skill (M)

- [ ] `shared/src/media-terrain-mcp.ts` tool family, spread into `MCP_TOOLS`:
  - `terrain_list`, `terrain_open` and `terrain_get_spec`
  - `terrain_set_spec`, validated by zod; failures come back as results
  - `terrain_set_input`: attach a heightmap, satellite or roads image by path, or generate the heightmap from a prompt
  - `terrain_build`
  - `terrain_render_preview`: named views (`top`, `oblique`, `horizon`, `landcover`, `roads`) through a terrain path in the software rasteriser, `preview.ts` style, so it works headless
  - `terrain_get_stats`: heights, class percentages, road count and length, building count
  - `terrain_export`
  - **Correction (x1):** `MCP_TOOLS` entries are written inline, not spread. `media-terrain-mcp.ts` holds
    `TERRAIN_MCP_TOOL_IDS` (the ten ids above), `isTerrainMcpToolId`, `TERRAIN_MCP_WRITE_TOOL_IDS`
    (`terrain_open`, `terrain_set_spec`, `terrain_set_input`, `terrain_build`, `terrain_export`),
    `TERRAIN_SLOW_TOOL_IDS` (`terrain_set_input`, `terrain_build`, `terrain_render_preview`, `terrain_export`),
    `TERRAINS_OFF_MESSAGE = 'Terrain editing is off — Settings ▸ MCP ▸ Let agents edit terrains'`,
    `TERRAIN_PREVIEW_VIEWS = ['top', 'oblique', 'horizon', 'landcover', 'roads'] as const`, and the
    input/output schemas. `TerrainToolTargetSchema = { repoPath, project: MediaProjectNameSchema, terrain: ModelLibraryNameSchema }`
    (the `ModelToolTargetSchema` shape). The ten entries are added inline to `MCP_TOOLS` in `mcp.ts`, the ids
    to the `McpToolEntry.id` union, and the five write ids to `mcp.test.ts`'s `writeTools` set.
  - `terrain_set_spec` takes a partial spec merged over the current one and answers
    `{ ok: true, revision } | { ok: false, errors: { path, message }[] }` (the `ModelEditResultSchema` idea).
  - `terrain_render_preview` returns PNGs as `_content` image blocks (`MCP_CONTENT_KEY`). **Resolved
    rendering** (Decision 14): `top`, `landcover` and `roads` are 2-D rasters produced directly from
    `drape.png` / a hillshaded height ramp, `landcover.png` + legend, and `roads-mask.png` with the graph
    drawn over it; `oblique` and `horizon` reuse `renderView(parts, 'iso' | 'front', size)` on the LOD-3 mesh
    split into six height-band `MeshPart`s coloured by the ramp (`renderView` has no texture sampling).
    New file `main/media/terrain/terrain-preview.ts`; sizes clamp with `clampPreviewSize`.
  - `terrain_get_stats` returns `TerrainStats` from `terrain.json`'s `lastBuild`; with no build it answers
    `{ built: false }`.
- [ ] Handlers in `main/media/terrain/terrain-mcp.ts`. A `main/mcp/terrain-tools.ts` binder and gate, keyed off a new **Settings ▸ MCP ▸ Let agents edit terrains** switch (default off, like models), with entries in `dispatch.ts` and the slow-tool predicate in the shim for build and preview
  - `terrain-mcp.ts` exports `createTerrainTools(deps: TerrainMcpDeps)` with
    `deps = { service: TerrainService; emitChanged; emitOpen: (e: TerrainOpenEvent) => void; resolveRepoPath }`;
    `terrain-tools.ts` exports `setTerrainTools(tools | null)` and one wrapper per tool; write wrappers call
    a private `allowed()` that throws `McpToolError('refused', TERRAINS_OFF_MESSAGE)` unless
    `getMcpAllowTerrains()`.
  - Switch: `allowTerrains: boolean` on `McpSettings` (`mcp-store.ts`, default `false`, `version` bumped by
    one; `parseStoredSettings` reads it with `=== true` so older files need no migrate arm), on the
    `McpSetRequest`/status schemas in `ipc/schemas.ts`, `setMcpAllowTerrains` in `main/mcp/index.ts`,
    `getMcpAllowTerrains`/`setMcpAllowTerrainsState` in `ui-gate.ts`, and an `Accordion title="Let agents edit terrains"`
    + `SettingsSwitchRow id="mcp-allow-terrains"` in `mcp-page.tsx` directly under the models one.
  - Shim: L87 becomes `isModelMcpToolId(name) ? { timeoutMs: SLOW_CALL_TIMEOUT_MS } : isTerrainSlowToolId(name) ? { timeoutMs: TERRAIN_CALL_TIMEOUT_MS } : {}`
    with `TERRAIN_CALL_TIMEOUT_MS = 300_000` in `mcp-shim/client.ts` (a 4097² eroded build exceeds 60 s).
  - Wiring: `media-terrain-handlers.ts` calls `setTerrainTools(createTerrainTools({...}))` exactly as
    `media-model-handlers.ts` L128–145 does for models; `emitOpen` broadcasts `EVENT_CHANNELS.mediaTerrainOpen`,
    which `TerrainTab` handles by selecting that terrain.
  - **Path confinement:** `terrain_set_input`'s `path` must be repo-relative; main resolves it with
    `resolveScopeRoot` + `confineToRoot` ([`fs-scope.ts`](../../../packages/desktop/src/main/fs-scope.ts))
    against the target repo, refuses symlink escapes and anything but `.png/.jpg/.jpeg/.webp`, and answers
    `McpToolError('refused', 'Input images must be inside the repository.')` otherwise — an agent cannot copy
    an arbitrary file from disk into the repo.
- [ ] The no-heightmap rule holds over MCP too: `terrain_build` with neither a heightmap nor noise params returns a result telling the agent to choose (it never silently picks noise)
  - Output arm `{ status: 'needs-height-source', message: 'No heightmap and no noise settings. Call terrain_set_input with a heightmap, or terrain_set_spec with a noise block, then build again.' }`.
- [ ] Skill `midnite-media-terrain-build` in all copies (`.claude/`, `.agents/`, `.codex/`, `templates/midnite/{.claude,.agents}/`). It covers the inputs, the build → preview → adjust loop, and the export contract
  - **Correction (x1):** six byte-identical copies, as `midnite-media-model-build` has:
    `.claude/skills/`, `.agents/skills/`, `.codex/skills/`, and `templates/midnite/{.claude,.agents,.codex}/skills/`,
    each `midnite-media-terrain-build/SKILL.md`. Sections: front matter (`name`, `description`), Inputs (the
    three slots and the no-heightmap rule), Loop (`terrain_get_spec` → `terrain_set_input`/`terrain_set_spec`
    → `terrain_build` → `terrain_render_preview` → adjust), Export (`terrain_export` and the manifest fields),
    and the switch name to ask the user for.
  - A new vitest `scripts/skill-copies.test.mjs` asserts every `midnite-media-*-build` skill's copies are
    byte-identical (none exists today); Phases 106 and 107 extend the same list.
- [ ] Vitest: tool schemas derive from the zod specs, write tools are refused when the switch is off, invalid input comes back as a validation result, and a full set_input → build → preview → export round trip works against a fixture
  - `shared/src/mcp.test.ts` (existing): the new entries pass the description rule and the minimal-value parse.
  - `desktop/src/main/media/terrain/terrain-mcp.test.ts`: with `setMcpAllowTerrainsState(false)` every
    write tool answers `[refused] Terrain editing is off …`; `terrain_set_spec({ resolution: 500 })` answers
    `{ ok: false, errors: [{ path: 'resolution', … }] }`; a `../outside.png` path is refused; the round trip on
    a 129² noise terrain produces a pack whose manifest validates and a preview with five image blocks.
  - `desktop/src/main/mcp-store.test.ts`: a `version: 4` file loads with `allowTerrains: false`.
- [ ] `TerrainService` is the one implementation both IPC and MCP call
  - `main/media/terrain/terrain-service.ts` exports `createTerrainService(deps: { store: MediaStore; broker: TerrainBroker; imageService; describeImage; log })`
    with `get`, `setSpec`, `setInput`, `build`, `cancel`, `paint`, `roadKey`, `export`, `library`. IPC
    handlers and `terrain-mcp.ts` are thin adapters over it, so the needs-height-source rule, the
    confinement and the WriteQueue rules live in one file.

## K — Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] Perf numbers on the packaged-equivalent app: build time at 513² / 2049² / 4097², viewer frame time at each, and classification time on a 4K satellite image. Recorded in this doc
  - Method: `moon run app:build desktop:bundle`, launch via `scripts/perf/electron-run.mjs` with a throwaway
    `--user-data-dir`; read **Build** (`stats.buildMs`) and **Frame** (p50) off the Stats readout, and the
    `landcover` stage time from the build log line. Record in a `## Perf` table appended to this doc.
  - Budgets the numbers must meet (else a follow-up item is filed in `outstanding.md`): 513² build
    < 3 s; 4097² build (no erosion) < 60 s; frame p50 < 16.7 ms at 2049² on an M1-class Mac.
- [ ] Screenshots (`MSTUDIO_SHOTS=1`, Media ▸ Terrain): the three-slot panel, the no-heightmap dialog, the shaded terrain with drape, the land-cover and splat debug views, foliage plus buildings, and the road network conformed into the terrain
  - Spec `packages/app/e2e/phase-105-terrain-shots.spec.ts` (`test.skip(!process.env.MSTUDIO_SHOTS, …)`,
    `shots-helper` imports, `OUT = '../../docs/screenshots/phase-105-terrain'`, `SHOT_VIEWPORTS.wide`), with
    a fixture terrain's `build/` files served by `installMockBridge`. Header names its browser capability:
    "WebGL canvas".
- [ ] Human pass: a real heightmap + satellite + cyan roads mask of one area builds into a recognisable terrain, and the exported glb opens in Blender
- [ ] Human pass: an agent over MCP builds a noise terrain, previews it, adds roads and exports it
- [ ] The exported `terrain.manifest.json` is loaded by a throwaway three.js page in a test, as the precursor to Phase 107's loader
  - **Resolved layer:** a desktop vitest, not e2e — `terrain-export.test.ts` reads the manifest, loads
    every LOD glb (exported with Texture `none`) with `new GLTFLoader().parseAsync`, adds them to a
    `THREE.Scene`, and asserts `new THREE.Box3().setFromObject(scene)` equals the manifest's `bounds`
    within 1e-3. No browser is needed, so it costs no e2e budget.
- [ ] Every new channel, schema and kernel module has the test named in its theme, and `scripts/e2e-budget.mjs` is unchanged
  - This phase adds **no** functional e2e spec (only the shots spec, which the budget ignores), so
    `MAX_DECLARED_E2E` stays 475.

## Deferred

- [ ] Roads segmented from the satellite image alone, with no mask: a segmentation project of its own; F's `road` class is only a cross-check (⏳ deferred)
- [ ] Terrain brushes (raise, lower, smooth, paint height), reusing Phase 104's brush engine (⏳ deferred)
- [ ] Geo-referencing, GeoTIFF/DEM import and map-tile download (⏳ deferred)
- [ ] Building roofs, facades and interiors (⏳ deferred)
- [ ] Rivers and lakes carved from a water mask (⏳ deferred)

## Not in this phase

- **A zipped terrain pack.** A folder serves Phase 107 and a human equally; a zip writer is Phase 107
  Theme P's to add (Decision 13).
- **A roster agent for the vision relabel.** `createLlmCall` takes no images; giving it image input is a
  Models-wide change, not a terrain one (Decision 9).
- **Undo for the class brush.** Repainting is the correction; an undo stack over a PNG layer is not worth
  its complexity here.
- **Persisted time of day / camera pose.** Viewing aids, not terrain data; they stay component state.
- **Non-square terrains.** The extent is square by the scope guardrail; a non-square input is stretched
  and warned about.
- **Per-chunk mesh files in `build/`.** The viewer meshes from `heights.f32` itself (Decision 3); only the
  export writes meshes.

## Files this phase touches

| Area | Files |
|---|---|
| Kernel (new) | `shared/src/terrain/`: `index.ts` (barrel, exported from [`shared/src/index.ts`](../../../packages/shared/src/index.ts)), `raster.ts`, `heightfield.ts`, `chunks.ts`, `noise.ts`, `erosion.ts`, `align.ts`, `classes.ts`, `classify.ts`, `splat.ts`, `morphology.ts`, `scatter.ts`, `foliage-designs.ts`, `footprints.ts`, `road-mask.ts`, `skeleton.ts`, `road-graph.ts`, `road-mesh.ts`, `conform.ts`, plus a `*.test.ts` beside each |
| Schemas (new) | `shared/src/media-terrain.ts` (spec, stats, build result, files, manifest, IPC payloads, `TERRAIN_*` constants), `shared/src/media-terrain-mcp.ts` (ids, inputs, outputs, messages) |
| Schemas (edited) | [`shared/src/media.ts`](../../../packages/shared/src/media.ts) (`MEDIA_TABS`, `REPO_SCOPED_MEDIA_TABS`, `MEDIA_EXPORT_FORMATS`, `MEDIA_EXPORT_FORMAT_INFO`, `MEDIA_TAB_EXPORT_FORMATS`); [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) (`McpToolEntry.id`, ten inline entries); [`shared/src/mcp.test.ts`](../../../packages/shared/src/mcp.test.ts) (`writeTools`); [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts); [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) (`allowTerrains`); [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts); [`shared/src/index.ts`](../../../packages/shared/src/index.ts) |
| Main (new) | `desktop/src/main/media/png/png-codec.ts`; `desktop/src/main/media/terrain/`: `terrain-service.ts`, `terrain-broker.ts`, `worker-protocol.ts`, `terrain-export.ts`, `terrain-preview.ts`, `terrain-mcp.ts`, `vision-relabel.ts`, `materials-path.ts`; `desktop/src/terrain-worker/index.ts`; `desktop/src/main/ipc/media-terrain-handlers.ts`; `desktop/src/main/mcp/terrain-tools.ts` |
| Main (edited) | [`media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts) (`createVisionCall`, `VisionCall`); [`media/model/gltf-writer.ts`](../../../packages/desktop/src/main/media/model/gltf-writer.ts) (`instancing` param); [`media/model/sf3d/png.ts`](../../../packages/desktop/src/main/media/model/sf3d/png.ts) (re-export from `png-codec.ts`); [`main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts); [`main/mcp/ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts); [`main/mcp/index.ts`](../../../packages/desktop/src/main/mcp/index.ts); [`main/mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts); [`ipc/mcp-handlers.ts`](../../../packages/desktop/src/main/ipc/mcp-handlers.ts); [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts) and [`mcp-shim/client.ts`](../../../packages/desktop/src/mcp-shim/client.ts); [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts); [`scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) (`terrain-worker`); [`electron-builder.yml`](../../../packages/desktop/electron-builder.yml) (`terrain-materials`); `main/index.ts` (register handlers) |
| Main (**unchanged**, load-bearing) | [`media/model/preview.ts`](../../../packages/desktop/src/main/media/model/preview.ts) (`renderView`, `clampPreviewSize` reused); [`media/media-store.ts`](../../../packages/desktop/src/main/media/media-store.ts); [`fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts); [`media/image/image-service.ts`](../../../packages/desktop/src/main/media/image/image-service.ts) |
| Renderer (new) | `app/src/features/media/terrain/`: `terrain-tab.tsx`, `terrain-panel.tsx`, `terrain-input-slot.tsx`, `no-heightmap-dialog.tsx`, `terrain-viewer-lazy.tsx`, `terrain-viewer.tsx`, `chunk-stream.ts`, `splat-material.ts`, `class-brush.tsx`, `alignment-controls.tsx`, `terrain-stats-readout.tsx`, `use-terrain.ts`, plus `*.test.tsx`/`*.bridge.test.tsx` |
| Renderer (edited) | [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts), [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (`LayoutSizes`, `DEFAULT_LAYOUT`, `LAYOUT_BOUNDS`, `MEDIA_LAYOUT_KEYS`), [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx), [`test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts), `components/icons/icon-names.test.ts` |
| Renderer (**unchanged**, load-bearing) | [`media-projects-accordion.tsx`](../../../packages/app/src/features/media/media-projects-accordion.tsx) (`fileFilter`), [`export-toolbar.tsx`](../../../packages/app/src/features/media/export-toolbar.tsx), [`components/icon-select.tsx`](../../../packages/app/src/components/icon-select.tsx), [`lib/use-page-visible.ts`](../../../packages/app/src/lib/use-page-visible.ts), [`lib/use-window-focus.ts`](../../../packages/app/src/lib/use-window-focus.ts) |
| Resources (new) | `packages/desktop/resources/terrain-materials/{grass,rock,dirt,snow}/{albedo,normal}.png` + `LICENSES.md` |
| Skills (new) | `midnite-media-terrain-build/SKILL.md` × 6 (`.claude`, `.agents`, `.codex`, `templates/midnite/{.claude,.agents,.codex}`); `scripts/skill-copies.test.mjs` |
| Tests | kernel vitest per module (above); `png-codec.test.ts`, `terrain-broker.test.ts`, `terrain-service.test.ts`, `vision-relabel.test.ts`, `terrain-export.test.ts`, `gltf-instancing.test.ts`, `terrain-mcp.test.ts`, `mcp-store.test.ts` (desktop); `terrain-tab.bridge.test.tsx`, `terrain-panel.bridge.test.tsx`, `no-heightmap-dialog.test.tsx`, `chunk-stream.test.ts` (app); `e2e/phase-105-terrain-shots.spec.ts` |

## Verification

- `media-terrain.test.ts`: `parseTerrainSpec({})` equals the defaults; bad `resolution` and an empty
  `heightRange` are rejected; both `TerrainBuildResult` arms parse.
- `terrain-tab.bridge.test.tsx`: the **Terrain** tab renders, the explorer lists the seeded terrain, and
  with no repo the tab shows `NoRepoMediaState`.
- `png-codec.test.ts`: 16-bit bit-exact round trip, five filter types, three literal refusal messages.
- `heightfield.test.ts` / `chunks.test.ts`: exact resample on grid points, plane and cone normals,
  crack-free LOD edges, `chunkVerts` and `selectLod` boundaries.
- `terrain-broker.test.ts`: progress forwarding, latest-wins cancel, crash settles all pending, cancel kills.
- `noise.test.ts` / `erosion.test.ts`: seed determinism, mass conservation within 1 %, iteration clamp.
- `terrain-service.test.ts`: `needs-height-source` without spawning; overrides survive rebuild.
- `no-heightmap-dialog.test.tsx`: dialog on `needs-height-source`; **Use noise** saves noise then builds.
- `terrain-panel.bridge.test.tsx` / `chunk-stream.test.ts`: shading switch, re-bake on commit, stats
  readout, disabled modes, nearest-first meshing under the budget of 4.
- `align.test.ts`: corner mapping and 100-sample round trip.
- `classify.test.ts` / `splat.test.ts` / `vision-relabel.test.ts`: ≥ 95 % patch accuracy, splat sums to
  1, snow line, bad vision JSON leaves heuristics and warns.
- `scatter.test.ts` / `footprints.test.ts` / `conform.test.ts`: exclusions and slope limit, seed
  determinism, square → 4 corners, flattened footprint level.
- `road-mask.test.ts` / `skeleton.test.ts` / `road-graph.test.ts`: cyan detection, line width in [9, 11] m,
  plus → one degree-4 node, spur pruning, empty mask → empty graph.
- `terrain-export.test.ts` / `gltf-instancing.test.ts`: manifest validates, paths exist, heightfield
  bit-exact, node count, `InstancedMesh` count 3, existing glb output byte-identical, scene bounds equal
  manifest bounds.
- `terrain-mcp.test.ts` / `mcp-store.test.ts` / `mcp.test.ts`: refusal with the switch off, validation
  result, repo confinement, full round trip, v4 file loads with `allowTerrains: false`, description rule.
- `scripts/skill-copies.test.mjs`: six byte-identical copies of `midnite-media-terrain-build`.
- `moon run :typecheck :lint :test` green.
- **Open, for a human:** perf table (513² / 2049² / 4097² build and frame p50; 4K classification) recorded
  under `## Perf`, against the K budgets.
- **Open, for a human:** real heightmap + satellite + cyan roads → recognisable terrain; glb opens in Blender.
- **Open, for a human:** an agent over MCP builds a noise terrain, previews, adds roads, exports.
- **Open, for a human:** `MSTUDIO_SHOTS=1` screenshots reviewed in `docs/screenshots/phase-105-terrain/`.

## Decisions / open questions

- **Each input is optional** (user, 2026-10-04): heightmap, satellite and roads mask are separate
  slots, and any subset builds.
- **No heightmap → warn and ask: noise or upload** (user, 2026-10-04). There is no silent default, in
  the UI or over MCP. Upload also offers generating a heightmap from a prompt.
- **The roads input is a mask, light roads on dark, typically cyan** (user, 2026-10-04). It is
  extracted by colour key with luminance fallback. Satellite-only road segmentation is deferred.
- **The satellite image does three jobs** (user, 2026-10-04): it is the texture, it drives foliage,
  and it locates buildings, roads and terrain types (Themes E, F and G).
- **Terrain is the first of three phases** (user, 2026-10-04): 105 Terrain → 106 2D Assets → 107 Games.

The x1 refinement ran unattended: every area was selected, the posture was *Expand in place · Every
item · Assertion-level · Resolve all with recommendations*, and each question below took its
recommended option. Each entry lists the options that were on the sheet.

1. **Resolved — Terrain is repo-scoped** (was open). Options: repo-scoped like Models
   `[recommended · XS]` · global root like Video `[scope+ · M]`. Picked repo-scoped: a game repo's
   terrains travel with it, and the media store, `NoRepoMediaState` and the mock-bridge fixtures all
   work unchanged.
2. **Resolved — the build worker is a desktop utility process** (was open). Options: utility process
   on the `sf3d-broker.ts` shape `[recommended · M]` · renderer Web Worker `[simplicity · S]` · in-process
   `worker_threads` like `knowledge/layout-runner.ts` `[minimal · S]`. Picked the utility process: inputs
   are files main already guards, 4097² arrays never cross IPC, an OOM kills a child not the app, and
   cancel-by-kill is already a proven pattern.
3. **Resolved — the viewer reads `build/heights.f32` and meshes in the renderer.** Options: fetch build
   files over `mstudio-file://` and mesh with the shared `chunkMesh` under a 4-per-frame budget
   `[recommended · M]` · main sends mesh buffers over IPC `[performance · M]` · the worker writes
   per-chunk mesh files `[future-proof · L]`. Picked the first: the shared kernel already runs anywhere,
   one 67 MB float file beats 4 096 mesh files, and `fs-protocol.ts` already serves repo files.
4. **Resolved — JPEG/WebP are transcoded to PNG at attach.** Options: transcode once in main with
   `nativeImage` `[recommended · S]` · decode at every build in main and post arrays to the worker
   `[performance · M]`. Picked transcode: the worker then needs only `decodePng` and no `electron`.
5. **Resolved — the UI attaches inputs as bytes.** Options: renderer sends `ArrayBuffer` bytes
   `[recommended · S]` · a main-side `dialog.showOpenDialog` channel returning a path `[minimal · S]`.
   Picked bytes: drag and drop and the picker share one path, and main never trusts a renderer-supplied
   absolute path. MCP uses repo-relative paths instead (Decision 15).
6. **Resolved — the explorer is `MediaProjectsAccordion` with a `terrain.json` filter.** Options: the
   accordion with `fileFilter` `[recommended · XS]` · a `ModelExplorer`/`library-tree.ts` clone with
   move and nested groups `[scope+ · M]`. Picked the accordion: groups are already projects; move and
   nesting are not needed for terrains.
7. **Resolved — a prompted heightmap is generated into Images, then copied.** Options: call
   `imageService.generate` into the `terrain-heightmaps` Images project and attach `files[0]`
   `[recommended · S]` · a terrain-private generation path `[simplicity · M]`. Picked Images: the
   service writes only into `image/<project>`, and the result is reusable there.
8. **Resolved — the classifier is deterministic first, vision optional** (was open). Options:
   heuristics + k-means baseline with an optional relabel `[recommended · L]` · vision-first
   `[scope+ · M]`. Picked the baseline: reproducible, offline, testable with fixtures.
9. **Resolved — the vision relabel is Ollama-only, via a new `createVisionCall`.** Options: a
   `createVisionCall` sibling of `createDescribeImage` taking a prompt and several images
   `[recommended · S]` · extend `LlmCall` with `images` so roster agents can relabel `[scope+ · M]` ·
   add an optional `prompt` to `DescribeImageCall` `[minimal · XS]`. Picked the sibling: Ollama's chat
   already takes images, the Models describe flow stays byte-for-byte unchanged, and widening `LlmCall`
   touches every Models engine.
10. **Resolved — foliage goes into the glb as `EXT_mesh_gpu_instancing`** (was open). Options: add an
    optional `instancing` parameter to `buildGltf` `[recommended · M]` · separate nodes per instance
    `[simplicity · S]` · omit foliage from the glb `[minimal · XS]`. Picked instancing: 200 000 separate
    nodes would be unusable in Blender, three's `GLTFLoader` reads the extension into `InstancedMesh`,
    and the parameter defaults to `null` so Models output is unchanged.
11. **Resolved — `allowTerrains` is its own switch with a `mcp.json` version bump.** Options: a new
    switch `[recommended · S]` · reuse `allowModels` `[minimal · XS]`. Picked a new switch: the model
    switch's label promises 3D models only. Phases 106 and 107 add `allowSprites` and `allowGames` the
    same way; whichever lands first takes the next `version`, and `parseStoredSettings`'s `=== true`
    read means no migrate arm is ever needed.
12. **Resolved — chunks export as one glb per LOD with a node per chunk.** Options: one glb per LOD
    `[recommended · S]` · one glb per chunk per LOD `[performance · S]` · one glb, all LODs `[minimal · XS]`.
    Picked per-LOD: Phase 107 streams by node name and loads only the LODs it needs.
13. **Resolved — `terrain-pack` is a folder, not a zip.** Options: folder `[recommended · XS]` · a
    hand-written zip writer on `node:zlib` `[scope+ · M]`. Picked the folder: no zip writer exists, and
    every consumer (Phase 107's bridge, Blender, a human) wants files.
14. **Resolved — previews are 2-D rasters plus `renderView` on height bands.** Options: rasters for
    top/landcover/roads and `renderView('iso'|'front')` on six coloured height-band parts
    `[recommended · M]` · teach `preview.ts` texture sampling `[scope+ · M]` · `capturePage` of the live
    viewer `[minimal · S]`. Picked the first: headless, no change to Models' rasteriser, and the top view
    shows the real drape.
15. **Resolved — MCP input paths are repo-confined.** Options: `confineToRoot` against the target repo
    `[recommended · S]` · any absolute path `[DX · XS]`. Picked confinement: otherwise an agent could copy
    any readable file on disk into a committed repo.
16. **Resolved — the class brush's override layer lives in `overrides/`, not `build/`.** Options:
    `overrides/landcover.png` `[recommended · XS]` · keep it in `build/` and special-case the atomic swap
    `[minimal · S]`. Picked `overrides/`: `build/` stays wholly disposable, which is the rule A states.
17. **Resolved — the shim gets a 300 s timeout for slow terrain tools.** Options: `TERRAIN_CALL_TIMEOUT_MS = 300_000`
    for `TERRAIN_SLOW_TOOL_IDS` `[recommended · XS]` · reuse the 60 s `SLOW_CALL_TIMEOUT_MS` `[minimal · XS]` ·
    an async build with a polling tool `[future-proof · M]`. Picked 300 s: a 4097² eroded build can pass
    60 s, and polling adds a tool for one case.
