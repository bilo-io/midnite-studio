# Phase 105 — Terrain

Requested by the user · 2026-10-04 · grounded against the tree as of `a51a3b05`.

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
> - **Media tabs.** `MEDIA_TABS` in [`shared/src/media.ts`](../../../packages/shared/src/media.ts), plus
>   every table keyed by `MediaTab`: `MEDIA_TAB_EXPORT_FORMATS`, `MEDIA_TAB_META` in
>   [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts), `TAB_BODY` in
>   [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), and `MEDIA_LAYOUT_KEYS`
>   in `ui-store.ts`. `REPO_SCOPED_MEDIA_TABS` is a plain array, so the compiler will not remind you
>   about it. The ui-store `merge` falls back to the default for an unknown `mediaTab`, so no migration
>   is needed.
> - **Storage.** [`main/media/media-store.ts`](../../../packages/desktop/src/main/media/media-store.ts)
>   builds `.midnite/media/<tab>/` from `MEDIA_ROOT_DIR` with `..` and symlink guards, a per-root
>   WriteQueue, and Trash on delete. `terrain` gets this for free.
> - **The Models tab as the pattern to copy.** The library layout from #704
>   ([`media-model-library.ts`](../../../packages/shared/src/media-model-library.ts)), a pure-TS kernel in
>   `shared` ([`model-geometry/`](../../../packages/shared/src/model-geometry/)), the hand-written
>   [`gltf-writer.ts`](../../../packages/desktop/src/main/media/model/gltf-writer.ts) (textures since
>   #720), the software-rasterised named views in
>   [`preview.ts`](../../../packages/desktop/src/main/media/model/preview.ts), and the R3F editor in
>   [`app/features/media/model/`](../../../packages/app/src/features/media/model/).
> - **Images.** [`main/media/image/image-service.ts`](../../../packages/desktop/src/main/media/image/image-service.ts)
>   (`createImageService`, providers in `IMAGE_PROVIDER_IDS`) is how a heightmap is generated from a
>   prompt.
> - **Engines.** [`main/media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts)
>   (`createLlmCall`: Ollama, or a roster agent). It is used for the optional vision pass that labels
>   land-cover clusters.
> - **The MCP recipe** set by the `model_*` family:
>   - schemas in [`shared/src/media-model-mcp.ts`](../../../packages/shared/src/media-model-mcp.ts),
>     spread into `MCP_TOOLS` ([`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts));
>   - handlers in [`main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), a mapped
>     type, so a missing handler fails typecheck;
>   - gate and binder in [`main/mcp/model-tools.ts`](../../../packages/desktop/src/main/mcp/model-tools.ts)
>     and [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts);
>   - the slow-tool timeout predicate in
>     [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts);
>   - the switch in [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx).
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
>   in desktop main. Rendering lives in `app`, which reaches main only through `window.midniteStudio`.
>
> **Effort tags:** **S** ≤ half a day · **M** 1–2 days · **L** 3+ days, likely 2–3 PRs.

## Headlines

_A terrain from up to three pictures, and the contract the games phases load it through._ Phases 106
and 107 need a ground to stand on: an open world, a third-person arena, or an isometric map rendered
down to tiles. Every input is optional, so a terrain can start from noise and a prompt, or from real
survey imagery. Planned 2026-10-04.

**Theme A — Terrain tab, spec and library.** ◻ Not started. Lands first.

**Theme B — Image decode and the heightfield kernel.** ◻ Not started. Lands with A.

**Theme C — No heightmap: warn, then noise or upload.** ◻ Not started.

**Theme D — Viewer and parameter panel.** ◻ Not started.

**Theme E — Satellite: drape and alignment.** ◻ Not started.

**Theme F — Satellite: land-cover classification and splat materials.** ◻ Not started.

**Theme G — Foliage and buildings from the land cover.** ◻ Not started.

**Theme H — Roads from the roads mask.** ◻ Not started.

**Theme I — Export and the game-engine manifest.** ◻ Not started.

**Theme J — Terrain over MCP, and the skill.** ◻ Not started.

**Theme K — Verification.** ◻ Not started.

## Build order

1. **A + B** (foundation): tab, spec, decode, heightfield, chunk meshing. Merged before anything else.
2. **C · D · E · H** in parallel. Each needs only a heightfield.
3. **F** after E, because it classifies the aligned satellite image. **G** after F.
4. **I** once B, F, G and H have settled their outputs. It fixes the format Phase 107 reads.
5. **J** last, wrapping the finished operations as tools.

## A — Terrain tab, spec and library (M)

The sixth Media tab, in the same three-column frame as the others.

- [ ] `'terrain'` added to `MEDIA_TABS`. Fill every `Record<MediaTab, …>` the compiler flags (`MEDIA_TAB_EXPORT_FORMATS`, `MEDIA_TAB_META` with a `react-icons/lu` mountain glyph, `TAB_BODY`), plus `MEDIA_LAYOUT_KEYS` and its two `LayoutSizes` width keys. Make a deliberate call on `REPO_SCOPED_MEDIA_TABS` (rec: repo-scoped, like Models) and record it here
- [ ] `TerrainSpecSchema` in a new `shared/src/media-terrain.ts`:
  - `inputs`: `heightmap`, `satellite` and `roads`, each an optional file ref inside the terrain folder
  - `resolution`: vertices per side, 2ⁿ+1 from 129 to 4097
  - `worldSize`: metres per side
  - `heightRange`: `[min, max]` metres
  - `seaLevel`, optional
  - `noise`: params, used only when there is no heightmap
  - `alignment`: per image, offset, scale and rotation
  - `classes`: land-cover overrides
  - `foliage` and `buildings`: params
  - `roads`: colour key, tolerance, width scale and blend
  - Every field optional with a default, so later themes add fields without breaking old specs
- [ ] Library layout `.midnite/media/terrain/<group>/<terrain>/`:
  - `terrain.json` (the spec, source of truth)
  - `inputs/` (copied images, never referenced in place)
  - `build/` (generated heightfield, maps and chunks; disposable and rebuildable)
  - `export/`

  A `terrain.json` summary goes into the library manifest, mirroring `media-model-library.ts`
- [ ] Create panel (right column): three labelled attach slots, **Heightmap**, **Satellite** and **Roads mask**. Each has a one-line explanation of what it does, a thumbnail and a remove button, and accepts drag and drop. All three are visibly optional. Below them sit resolution, world size, height range and a Generate button
- [ ] Explorer (left column) reuses `media-projects-accordion.tsx` for groups and terrains
- [ ] `mstudio:media:terrain-*` IPC channels and payload schemas in `shared`, with `GitOpResult` envelopes and `media:changed` on writes
- [ ] Vitest: schema defaults and round trip, an old or minimal spec parses, the tab appears in the strip, and the explorer lists a seeded terrain via the mock bridge

## B — Image decode and the heightfield kernel (M/L)

From an image to a grid of heights to meshes a renderer can stream.

- [ ] **PNG and JPEG decode in desktop main** that keeps 16-bit greyscale. There is no production PNG decoder in the tree today (only tests inflate PNGs), and Electron's `nativeImage` is 8-bit BGRA, which would quantise a 16-bit heightmap to 256 steps. Write a small decoder on `node:zlib` (greyscale, RGB and RGBA at 8 and 16 bits, palette, all five filter types; refuse interlaced with a readable error). JPEG and WebP go through `nativeImage`, since they are 8-bit anyway. The output is a plain `{width, height, channels, bitDepth, data}` passed to the kernel
- [ ] RGB heightmaps are reduced to luminance, with a warning that an 8-bit source will terrace. The 8-bit terrace is visibly softened by an optional pre-smooth
- [ ] Kernel `shared/src/terrain/heightfield.ts`: bicubic resample to the chosen 2ⁿ+1 grid, map to `heightRange`, optional Gaussian smoothing, edge clamp, central-difference normals, and min, max and histogram stats
- [ ] **Chunking and LOD**: split into 65- or 129-vertex chunks (chosen from the resolution), build 3–4 LOD levels per chunk with skirts to hide cracks, and compute bounds per chunk. Pure TS on typed arrays
- [ ] Building runs in a worker (desktop utility process or renderer Web Worker; decide here and record why), so a 4097² build never blocks a frame. Progress goes out on `mstudio:media:terrain-progress`, and a run can be cancelled
- [ ] Vitest: a 16-bit PNG fixture decodes to exact values, an 8-bit RGB decodes to luminance, an interlaced PNG is refused with a readable error, resampling is exact on grid points, normals of a plane and a cone are correct, and LOD chunks share edge heights (no cracks)

## C — No heightmap: warn, then noise or upload (S/M)

Missing a heightmap is a question, not a silent default (user, 2026-10-04).

- [ ] Generate with no heightmap attached shows a **warning dialog**: _"No heightmap attached — generate the shape from noise, or upload one?"_ It offers **Use noise**, **Upload heightmap…** and Cancel. There is no remembered default; it asks every time until a heightmap or noise params are saved on the spec
- [ ] Noise generator in the kernel:
  - fBm and ridged multifractal
  - seed, octaves, frequency, persistence and lacunarity
  - a radial island falloff toggle
  - a fast hydraulic erosion pass (particle-based, iteration count bounded)
- [ ] **Upload** opens the heightmap slot's file picker. It also offers **Generate one from a prompt** through `image-service.ts`, asking for a top-down greyscale height map, then decoding and normalising the result like any upload
- [ ] The noise params live on the spec, so a noise terrain is reproducible from its seed
- [ ] Vitest: the same seed gives the same field, erosion conserves sediment mass within tolerance, and Generate with no heightmap and no noise params returns the "needs a choice" result rather than building

## D — Viewer and parameter panel (M)

- [ ] R3F viewport (centre column), lazily loaded like `model-viewer-lazy.tsx`, rendering the B chunks with distance-based LOD selection
- [ ] Orbit and fly camera, a sun direction and time-of-day slider, and a water plane at `seaLevel`
- [ ] Debug shading modes in a compact `IconSelect`: shaded, wireframe, height ramp, slope, land cover (F), splat (F) and road mask (H)
- [ ] Changing the resolution, world size or height range re-bakes in the worker and swaps chunks without a blank frame
- [ ] Stats readout: vertex and triangle counts, chunk count, build time, and the min and max height
- [ ] The viewport idles when the window is blurred or the tab is hidden (the Phase 84 visibility gates)
- [ ] Vitest via the mock bridge: shading mode switching, re-bake on parameter change, and the stats readout

## E — Satellite: drape and alignment (M)

- [ ] The satellite image is draped as the albedo texture, top-down, in the terrain's UV space
- [ ] Alignment: offset, scale and rotation, set with handles in the viewer and fields in the panel, plus an onion-skin overlay of the satellite against the height ramp to line them up. Stored on the spec per image. The roads mask (H) gets the same alignment control, defaulting to the satellite's
- [ ] Texture resolution is chosen independently of mesh resolution (1K to 8K). Larger sources are downsampled in main, with mipmaps generated on load
- [ ] Vitest: the alignment transform maps the image corners to the expected terrain coordinates, and a rotated alignment round-trips

## F — Satellite: land-cover classification and splat materials (L)

The satellite image tells the app *what* is where, not just what colour it is.

- [ ] Classes: `water`, `tree`, `grass`, `bare` (soil, sand), `rock`, `road`, `building`, `other`. The list lives in the kernel, with a colour per class for the debug view
- [ ] Classifier in `shared/src/terrain/classify.ts`, deterministic and pure TS:
  - excess-green index (ExG = 2G − R − B) for vegetation, split into tree and grass by local texture variance
  - k-means in CIE Lab for the remaining clusters
  - slope from the heightfield to separate rock from bare ground
  - flat, smooth, grey-blue regions below `seaLevel` as water
  - rectilinear high-contrast blobs as building candidates
- [ ] Optional vision pass: send cluster swatches plus a downscaled image to a vision model (Ollama vision or a roster agent via `engines.ts`) to relabel clusters. Off by default, with a toggle and an engine picker in the panel. The heuristics stay the baseline, so the result never depends on a model
- [ ] **Correction by painting**: a class brush in the viewer to fix misclassified areas. Corrections are stored as an override layer (`build/landcover-overrides.png`) so a re-classify keeps them
- [ ] Outputs:
  - `build/landcover.png`, an index map, plus a legend JSON
  - `build/splat.png`, RGBA weights for up to four tiled materials per layer, from land cover + slope + height
- [ ] A splat shader in the viewer blends tiled PBR materials (grass, rock, dirt/sand, snow above a height) close to the camera and fades to the satellite drape with distance. Built-in CC0 material tiles ship as app resources, with their licences recorded
- [ ] If a roads mask is also attached, the `road` class from the satellite is shown as a cross-check against H, never merged automatically
- [ ] Vitest: synthetic fixtures (painted patches of known colour) classify to their classes, the overrides survive a re-classify, splat weights sum to 1, and the snow line follows the height threshold

## G — Foliage and buildings from the land cover (L)

- [ ] **Foliage scatter**:
  - Poisson-disk sampling with density driven by the `tree` and `grass` classes, a seed, a slope limit and a min and max scale
  - kept out of `road`, `building` and `water`, plus a margin
- [ ] Built-in low-poly foliage (2–3 trees, a bush, a grass clump), authored as Models primitive designs so they come from the existing kernel. Swappable per class for any Models asset
- [ ] Instanced rendering in the viewer (one `InstancedMesh` per asset per chunk), culled by chunk
- [ ] **Building footprints** from the `building` class:
  - morphological open/close
  - contour tracing, then Douglas-Peucker simplification and snapping to right angles where the angles are within tolerance
  - minimum area filter
- [ ] Buildings are extruded with flat roofs from a height range (random within a range, seeded, optionally scaled by footprint area). The terrain is flattened under each footprint to its mean height, with a short blend
- [ ] Both sets are stored as data, not baked into the mesh: `build/foliage.json` (asset id, position, rotation, scale) and `build/buildings.json` (polygon, height, base height). Phase 107 places them itself
- [ ] Vitest: the scatter respects exclusion classes and the slope limit, the same seed gives the same instances, a square footprint traces to four corners, and the flattening leaves the footprint level

## H — Roads from the roads mask (L)

The roads image is a mask: light roads on a dark background, **often cyan** (user, 2026-10-04).

- [ ] **Road extraction**:
  - auto-detect the dominant saturated hue (cyan is the default guess); otherwise fall back to luminance above a threshold
  - an eyedropper in the panel to pick the road colour, and a tolerance slider
  - the extracted mask shows live in the road-mask debug mode
- [ ] Clean-up: morphological close to bridge small gaps, open to drop specks, and a minimum-component-size filter
- [ ] Skeletonise (Zhang–Suen thinning). Extract a graph with nodes at junctions and endpoints. Prune spurs below a length, merge near-duplicate nodes, simplify, and fit Catmull-Rom splines per edge
- [ ] **Width per edge** from the distance transform of the mask, times `widthScale`, clamped to a sane min and max
- [ ] **Road meshes**: ribbons along the splines with UVs along the length, plus junction patches. Placed slightly above the conformed terrain
- [ ] **Terrain conform**: flatten along each road to its cross-section height, with a falloff blend on either side and a cut/fill limit, so roads never float or dig trenches
- [ ] Output: `build/roads.json` as a road graph (nodes, edges, spline control points, width, and a `kind` from width: path, street or avenue). Phase 107's open-world starter routes traffic and pedestrians on it
- [ ] Vitest:
  - a straight cyan line yields one edge whose width matches the drawn width
  - a plus-shaped mask yields one 4-way junction
  - spurs below the threshold are pruned
  - the conformed terrain is level across the road's width
  - a mask with no road pixels returns an empty graph, not an error

## I — Export and the game-engine manifest (M)

What leaves the app, and the contract Phase 107 reads.

- [ ] **`.glb` export** through the existing `gltf-writer.ts`: chunk meshes at a chosen LOD, the drape or a baked splat texture, road meshes, building meshes, and foliage as separate nodes (or `EXT_mesh_gpu_instancing` if the writer can support it cleanly; decide here). Re-imports through three's `GLTFLoader` in vitest
- [ ] **Raw export for engines**: `heightfield.png` (16-bit greyscale) plus `heightfield.json` (resolution, world size, height range), so a Rapier heightfield collider is built from exact data rather than from the mesh
- [ ] **`terrain.manifest.json`**, versioned with a zod schema in `shared/src/media-terrain.ts` (`TerrainManifestSchema`). It lists:
  - the heightfield
  - the chunk files and their LODs
  - the splat and land-cover maps with their legend
  - the material tiles
  - `foliage.json`, `buildings.json` and `roads.json`
  - the bounds

  Phase 107's three.js kit loads exactly this
- [ ] `MEDIA_TAB_EXPORT_FORMATS` lists `glb` and `terrain-pack` (the manifest folder, zipped) for the tab, and `ExportToolbar` offers both
- [ ] Vitest: the manifest validates, every path it lists exists, the heightfield PNG round-trips through the B decoder bit-exactly, and the glb re-imports with the expected node count

## J — Terrain over MCP, and the skill (M)

- [ ] `shared/src/media-terrain-mcp.ts` tool family, spread into `MCP_TOOLS`:
  - `terrain_list`, `terrain_open` and `terrain_get_spec`
  - `terrain_set_spec`, validated by zod; failures come back as results
  - `terrain_set_input`: attach a heightmap, satellite or roads image by path, or generate the heightmap from a prompt
  - `terrain_build`
  - `terrain_render_preview`: named views (`top`, `oblique`, `horizon`, `landcover`, `roads`) through a terrain path in the software rasteriser, `preview.ts` style, so it works headless
  - `terrain_get_stats`: heights, class percentages, road count and length, building count
  - `terrain_export`
- [ ] Handlers in `main/media/terrain/terrain-mcp.ts`. A `main/mcp/terrain-tools.ts` binder and gate, keyed off a new **Settings ▸ MCP ▸ Let agents edit terrains** switch (default off, like models), with entries in `dispatch.ts` and the slow-tool predicate in the shim for build and preview
- [ ] The no-heightmap rule holds over MCP too: `terrain_build` with neither a heightmap nor noise params returns a result telling the agent to choose (it never silently picks noise)
- [ ] Skill `midnite-media-terrain-build` in all copies (`.claude/`, `.agents/`, `.codex/`, `templates/midnite/{.claude,.agents}/`). It covers the inputs, the build → preview → adjust loop, and the export contract
- [ ] Vitest: tool schemas derive from the zod specs, write tools are refused when the switch is off, invalid input comes back as a validation result, and a full set_input → build → preview → export round trip works against a fixture

## K — Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] Perf numbers on the packaged-equivalent app: build time at 513² / 2049² / 4097², viewer frame time at each, and classification time on a 4K satellite image. Recorded in this doc
- [ ] Screenshots (`MSTUDIO_SHOTS=1`, Media ▸ Terrain): the three-slot panel, the no-heightmap dialog, the shaded terrain with drape, the land-cover and splat debug views, foliage plus buildings, and the road network conformed into the terrain
- [ ] Human pass: a real heightmap + satellite + cyan roads mask of one area builds into a recognisable terrain, and the exported glb opens in Blender
- [ ] Human pass: an agent over MCP builds a noise terrain, previews it, adds roads and exports it
- [ ] The exported `terrain.manifest.json` is loaded by a throwaway three.js page in a test, as the precursor to Phase 107's loader

## Deferred

- [ ] Roads segmented from the satellite image alone, with no mask: a segmentation project of its own; F's `road` class is only a cross-check (⏳ deferred)
- [ ] Terrain brushes (raise, lower, smooth, paint height), reusing Phase 104's brush engine (⏳ deferred)
- [ ] Geo-referencing, GeoTIFF/DEM import and map-tile download (⏳ deferred)
- [ ] Building roofs, facades and interiors (⏳ deferred)
- [ ] Rivers and lakes carved from a water mask (⏳ deferred)

## Files this phase touches

| Area | Files |
|---|---|
| Kernel | new `shared/src/terrain/`: `heightfield.ts`, `noise.ts`, `erosion.ts`, `chunks.ts`, `classify.ts`, `scatter.ts`, `footprints.ts`, `skeleton.ts`, `road-graph.ts`, `conform.ts` |
| Schemas | new `shared/src/media-terrain.ts` (spec, manifest, IPC payloads), new `shared/src/media-terrain-mcp.ts`; [`shared/src/media.ts`](../../../packages/shared/src/media.ts) (`MEDIA_TABS`, export formats); [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) |
| Main | new `main/media/terrain/` (service, worker, png decoder, library, `terrain-mcp.ts`), new `main/mcp/terrain-tools.ts`; [`main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), [`main/mcp/ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts), [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts), [`media/model/gltf-writer.ts`](../../../packages/desktop/src/main/media/model/gltf-writer.ts), [`media/model/preview.ts`](../../../packages/desktop/src/main/media/model/preview.ts) |
| Renderer | new `app/features/media/terrain/` (tab, panel, viewer, debug shading, class brush, alignment handles); [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts), [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), `store/ui-store.ts` (`MEDIA_LAYOUT_KEYS`), [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx) |
| Resources | CC0 material tiles + licences; built-in foliage designs |
| Skills | `midnite-media-terrain-build` (all copies) |
| Tests | kernel vitest per theme, desktop vitest for decode, export and MCP, app vitest via the mock bridge, an `MSTUDIO_SHOTS` screenshot spec |

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
- **The classifier is deterministic first, vision optional, open.** Recommendation: heuristics plus
  k-means are the baseline and the vision pass only relabels clusters. A run is then reproducible and
  works offline.
- **Where the build worker lives, open, decided in Theme B.** Recommendation: a desktop utility process,
  because the inputs are decoded in main and 4097² arrays should not cross IPC twice. The viewer
  receives finished chunk buffers as transferables.
- **Foliage in the glb, open, decided in Theme I.** Recommendation: `EXT_mesh_gpu_instancing` if
  `gltf-writer.ts` takes it cleanly, otherwise separate nodes. Phase 107 reads `foliage.json` either way.
- **`REPO_SCOPED_MEDIA_TABS`, open, decided in Theme A.** Recommendation: repo-scoped, like Models, so a
  game repo's terrains travel with it.
