# Phase 108 — Maps

**Refined: x1** · 2026-10-07 · UI/UX & interaction, accessibility & keyboard, empty / loading / error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, security, permissions & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening, opens

Requested by the user · 2026-10-07 · brainstormed with `/midnite-ideate`, grounded against the tree
as of `dbe6e5e3`; refined against `111cb50d` (Phase 107 G–P landed: games, the asset bridge, web
export, kit 0.9.0).

Media gets a ninth tab, **Maps** (after Docs, Images, Video, Audio, Models, Terrain, Sprites and
Games): an interactive slippy map (MapLibre GL) you can pan, zoom, tilt into 3D, measure on and draw
on. Its headline job is **Capture for Terrain**: frame a square of the real world, press one button,
and get the exact same area as

1. **a heightmap** — real elevation, at the deepest detail the elevation tiles have, as a 16-bit PNG
   (plus a lossless float `.r32` and a GeoTIFF for external tools);
2. **a satellite image** of the same square, at Terrain's texture size;
3. **a roads layer** — both the raster mask Terrain already reads and the real OSM road graph, with
   road classes intact;

…handed straight to a new Phase [105](phase-105-terrain.md) Terrain with `worldSize` and
`heightRange` already set, so the terrain is the right size in metres and the right height in metres.

The second job is a planning surface: point-to-point and multi-leg distances, radius circles between
locations, polygon areas, labelled pins and place search, saved as git-tracked GeoJSON layers.

> **Builds on.**
> - **Media tabs.** `MEDIA_TABS` (`['doc','image','video','audio','model','terrain','sprite','game']`),
>   `REPO_SCOPED_MEDIA_TABS` (all but `video` and `game`) and `MEDIA_TAB_EXPORT_FORMATS` (a
>   `Record<MediaTab, …>`, so a new tab must add an entry or typecheck fails) in
>   [`shared/src/media.ts`](../../../packages/shared/src/media.ts); `MEDIA_TAB_META` in
>   [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts); the tab body map in
>   [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx);
>   `MEDIA_LAYOUT_KEYS` (private to [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts),
>   `satisfies Record<MediaTab, …>`, with matching `LayoutSizes` fields, defaults and min/max bounds).
>   The Terrain tab ([`features/media/terrain/`](../../../packages/app/src/features/media/terrain/) —
>   `terrain-tab.tsx`, `terrain-explorer.tsx`, `terrain-panel.tsx`, `terrain-viewer-lazy.tsx`,
>   `use-terrain.ts`) is the pattern; `terrain-viewer-lazy.tsx` is the lazy-chunk pattern.
> - **Storage.** [`main/media/media-store.ts`](../../../packages/desktop/src/main/media/media-store.ts)
>   — `createMediaStore(deps)` → `{ rootFor, listProjects, createProject, listFiles, readFile,
>   readBytes, writeFile, writeBytes, renameFile, removeFile, resolveForRead, … }`, rooted at
>   `.midnite/media/<tab>/<project>/`, `joinWithin`/`confineToRoot` jail from `main/fs-scope.ts`,
>   every op a `GitOpResult`, a `mstudio:media:changed` broadcast on write.
> - **Terrain (Phase 105).** `TERRAIN_INPUT_SLOTS = ['heightmap','satellite','roads']`, each stored
>   as `inputs/<slot>.png` — `TerrainInputRefSchema.file` is the regex
>   `^inputs\/(heightmap|satellite|roads)\.png$`, so **an input slot cannot carry JSON**. The spec
>   ([`shared/src/media-terrain.ts`](../../../packages/shared/src/media-terrain.ts)): `resolution` a
>   literal union of `TERRAIN_RESOLUTIONS` (129 … 4097), `worldSize` 16–65 536 m, `heightRange`
>   (must rise), `seaLevel?`, `alignment`, `textureSize` (`TERRAIN_TEXTURE_SIZES` 1024…8192, default
>   2048), `version: 1`, top level `.passthrough()`. The heightmap maps **linearly**: `buildHeightfield`
>   ([`shared/src/terrain/heightfield.ts`](../../../packages/shared/src/terrain/heightfield.ts))
>   takes samples in `[0,1]` to `lo + v·(hi − lo)`, on a **vertex-centred** grid
>   (`worldSize / (resolution − 1)` metres per cell). Terrain world coordinates are **centred**:
>   `x, z ∈ [−worldSize/2, +worldSize/2]`, `x` east (image column), `z` south (image row)
>   (`sampleHeight` in
>   [`shared/src/terrain/field-sample.ts`](../../../packages/shared/src/terrain/field-sample.ts)).
> - **Terrain service and IPC.** `createTerrainService(deps)` in
>   [`main/media/terrain/terrain-service.ts`](../../../packages/desktop/src/main/media/terrain/terrain-service.ts)
>   returns `{ library, get, setSpec, setInput, build, cancel, paint, roadKey, export, dirOf }`; it is
>   constructed once, module-local, in
>   [`main/ipc/media-terrain-handlers.ts`](../../../packages/desktop/src/main/ipc/media-terrain-handlers.ts),
>   which also forks `terrain-worker` (`utilityProcess.fork`, `createTerrainBroker` — the pattern for a
>   capture worker) and decodes JPEG/WebP via `nativeImage` in its `toPng` dep, because the worker
>   can only read PNG. Channels `mstudio:media:terrain-library|get|set-spec|set-input|build|cancel`
>   ([`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts)), the
>   `EVENT_CHANNELS.mediaTerrainOpen` (`mstudio:media:terrain-open`, `TerrainOpenEventSchema
>   {repoId, project, terrain}`) event the Terrain tab answers by selecting that terrain.
> - **Roads in Terrain.** Mask → graph in main:
>   [`shared/src/terrain/road-mask.ts`](../../../packages/shared/src/terrain/road-mask.ts) keys the mask
>   by dominant saturated hue (`detectRoadColour`: S > 0.4, V > 0.4, `ROAD_HUE_DOMINANCE` 0.6) with a
>   luminance fallback; [`road-graph.ts`](../../../packages/shared/src/terrain/road-graph.ts)
>   `roadGraphFromMask` → in-memory `RoadGraph {nodes:{id,x,z}[], edges:{id,a,b,path,radii}[]}`, then
>   `edgeWidth` derives width from `radii`, and `toRoadsFile` writes **`build/roads.json`**
>   (`TerrainRoadsFileSchema`: edges `{id,a,b,points:[x,y,z][],widthM,kind:'path'|'street'|'avenue',
>   lengthM}` — there is **no OSM class, name or lanes field** today). The `roads` stage lives in
>   [`build-pipeline.ts`](../../../packages/desktop/src/main/media/terrain/build-pipeline.ts).
> - **Network and protocols.** The renderer CSP ([`main/csp.ts`](../../../packages/desktop/src/main/csp.ts))
>   allows `img-src … https:` and `worker-src 'self' blob: data:` (MapLibre's blob worker already
>   fits), but pins `connect-src` to `'self'`, `mstudio-file:`, `api.open-meteo.com`,
>   `geocoding-api.open-meteo.com`, `ipwho.is` — asserted by `csp.test.ts`. MapLibre loads tiles with
>   `fetch`, so tiles are governed by `connect-src`, not `img-src`. Custom schemes are registered in
>   **one** `registerPrivilegedSchemes()` call in
>   [`main/fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts) — Electron keeps only
>   the last list, so a second call would silently unregister `mstudio-file` and `mstudio-game`.
> - **Secrets.** `SECRET_KEYS` in
>   [`shared/src/domain/secrets.ts`](../../../packages/shared/src/domain/secrets.ts) (today
>   `media.geminiApiKey`, `media.openaiApiKey`, `media.huggingFaceToken` …), the vault in
>   [`main/secrets-vault.ts`](../../../packages/desktop/src/main/secrets-vault.ts), and the key row
>   `ApiKeyRow` (module-private in
>   [`features/media/image/image-settings.tsx`](../../../packages/app/src/features/media/image/image-settings.tsx)),
>   rendered inside Settings ▸ Media
>   ([`media-page.tsx`](../../../packages/app/src/features/settings/settings-pages/media-page.tsx)).
> - **Geocoding.** `searchLocations(query)` in
>   [`features/weather/weather-api.ts`](../../../packages/app/src/features/weather/weather-api.ts)
>   already calls `geocoding-api.open-meteo.com` from the renderer (5 s timeout, 8 results).
> - **MCP.** Terrain's nine `terrain_*` tools: contracts in
>   [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) +
>   [`shared/src/media-terrain-mcp.ts`](../../../packages/shared/src/media-terrain-mcp.ts),
>   implementations in
>   [`main/media/terrain/terrain-mcp.ts`](../../../packages/desktop/src/main/media/terrain/terrain-mcp.ts),
>   the consent wrapper in
>   [`main/mcp/terrain-tools.ts`](../../../packages/desktop/src/main/mcp/terrain-tools.ts)
>   (`setTerrainTools`, read tools ungated, writes behind `getMcpAllowTerrains()` from
>   [`mcp/ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts)); the switch persists in
>   [`main/mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts) (`version: 6`). Every
>   description is ≤ 220 chars, one sentence, asserted by `shared/src/mcp.test.ts`. The
>   `midnite-media-terrain-build` skill ships in six copies pinned by
>   [`scripts/skill-copies.test.mjs`](../../../scripts/skill-copies.test.mjs), which **only discovers
>   names matching `^midnite-media-.+-build$`**.
> - **Games (Phase 107), cross-reference only.** `GAME_ASSET_SOURCE_TABS` in
>   [`shared/src/media-game.ts`](../../../packages/shared/src/media-game.ts) already includes
>   `'terrain'`, so a terrain made by a Maps capture reaches a game through Phase 107 Theme N's asset
>   bridge with no Maps-side work. Maps adds no asset source of its own in this phase.
>
> **Nothing exists yet.** No package depends on maplibre, leaflet, turf, proj4 or geotiff; there is no
> slippy-tile, Web-Mercator or Terrarium code, and Terrain has no lat/lon notion — only metres.
> `packages/shared` depends on **zod only** — so the geo kernel is dependency-free TypeScript.
>
> **Scope guardrails.**
> - **One engine: MapLibre GL.** Leaflet/OpenLayers are out; a thin `MapView` seam is noted, not built.
> - **Capture is engine-free.** It runs in main (orchestration) and a utility process (compute) from
>   the frame's centre and side, and never reads screen pixels, so the heightmap is the same
>   regardless of zoom, tilt or style.
> - **Licences decide exports.** Every source in the catalogue carries its licence, attribution and an
>   `exportable` flag; a capture refuses a non-exportable source with the reason, and every capture
>   writes its attributions next to the files.
> - **Keys never reach the renderer.** Every tile — keyed or not — goes through the main-side
>   `mstudio-tile:` protocol (Decision 10).
>
> **Effort tags:** S ≈ ≤2h · M ≈ 2–6h · L ≈ 1–2 days.

## Headlines

**Theme A — Maps tab and library.** ✅ Landed (this PR). `'map'` is the ninth Media tab (repo-scoped,
`LuMap`, export formats `geojson`/`kml`), with `maplibre-gl@^5` in its own lazy chunk behind a
`map-canvas-lazy.tsx`, a per-project `map.json` (`MapProjectFileSchema`, viewport + basemap + layer
order) saved through a debounced (750 ms, plus once on unmount) `mstudio:media:map-set-view`, and the
named states — no network, tiles failing and loading, and no repo — with literal copy. Basemaps
(Streets, Satellite, Terrain, Dark) are composed in `map-style.ts` from OpenFreeMap's Liberty and
Positron styles, which main serves already rewritten to `mstudio-tile://`. The MapLibre canvas is
resize-observed and releases its WebGL context on unmount; eslint keeps `maplibre-gl` out of every
file but `map-canvas.tsx`. The 10× mount/unmount WebGL-context e2e is not written: the vitest
asserts `remove()` and `loseContext()` on unmount instead.

**Theme B — Tile sources, fetched in main.** ✅ Landed (this PR). `MAP_SOURCES` is a typed catalogue in
`shared/src/media-map.ts` (AWS Terrarium DEM, OpenFreeMap vector, EOX Sentinel-2 cloudless 2016
satellite, and three MapTiler sources behind `media.mapTilerApiKey`). **Every** tile, glyph and
sprite request goes through a `mstudio-tile://<source>/…` scheme registered in the existing single
`registerPrivilegedSchemes()` call, so `connect-src` gains one entry and no third-party host;
`tile-fetch.ts` caps concurrency per host, retries 429/5xx with backoff, and sends a fixed
`User-Agent`; `tile-cache.ts` is an LRU on disk under `userData/map-tiles/` (1 GB default, 256 MB
steps in Settings ▸ Media ▸ Maps, with a confirmed Clear). The fetcher is generic
(`fetch(key, url, {signal, cache})`) and the protocol owns URL expansion; keyed TileJSON and styles
bypass the disk cache so a key never lands on disk. The protocol also serves `/style/<name>` with
every URL rewritten (unknown sources and their layers dropped), and a Natural Earth relief source
(`openfreemap-relief`) keeps the rewritten styles' low-zoom layer. Responses carry
`Access-Control-Allow-Origin: *` because MapLibre's blob worker fetches cross-scheme.

**Theme C — 3D preview and capture framing.** ✅ Landed (PR #772). The 3D toggle applies `setTerrain` over a
`dem` raster-dem source (Terrarium, via `mstudio-tile:`) and a `hillshade-3d` layer, re-applied on every
`style.load` because a basemap switch wipes them; pitch eases to 60 / 0 only on a real on/off flip. The capture
frame is a GeoJSON outline from the kernel's `frameRing` (azimuthal-equidistant, so square in metres at any
latitude) plus four corner handles; the interior drags the centre, a corner resizes about it, clamped to
16–65 536 m. The readout (side, centre, m/px, elevation) is `aria-live`; its min/max comes from a 9×9
`queryTerrainElevation` grid divided by the exaggeration, throttled to 250 ms, and only exists while 3D is on.
The size picker and warnings are Theme D's `captureWarnings` (`media-map-capture.ts`). Keys (arrows, `+`/`-`, `F`, `T`) are bound on the
focused `role="application"` container, MapLibre's own keyboard handler is off, and keys typed in an input or
button inside the canvas are ignored. The Capture button is Theme D's, fed by the dragged frame. The pointer-drag e2e is not
written (needs WebGL + tiles); the frame maths is vitest-covered.

**Theme D — Heightmap capture.** ✅ Landed (this PR). A zod-free, dependency-free kernel in
`shared/src/map/` (Web-Mercator and tile maths, Vincenty WGS84 geodesy, the azimuthal-equidistant local
frame, Terrarium/Terrain-RGB decode with no-data fill, bicubic Catmull-Rom resampling, a hand-written
GeoTIFF writer) exported as `map`. `chooseCaptureZoom` picks the deepest *useful* DEM zoom inside a
1 024-tile budget (a 65 km frame at 4097 lands at z13, a 1 km frame at 1025 at z15); sampling is
vertex-centred to match `buildHeightfield`, with the lattice mapping interpolated so a 4097² grid is not
16.8 M geodesic calls. `capture-service.ts` fetches through B's shared tile fetcher and cache, streams
decoded tiles to a `map-capture-worker` utility process (`capture-broker.ts`, killed on cancel) that
resamples and writes `heightmap.png` (16-bit), `.r32` and `.tif`; main adds `capture.json` and
`ATTRIBUTION.txt` and renames `captures/.tmp-<id>/` into place, so a cancel leaves nothing. One capture
at a time; channels `mstudio:media:map-capture|map-capture-cancel` plus a progress event; a "Capture
heightmap" section in the Maps detail pane (side, output size, warnings, progress, Cancel). Goldens need
no network: a plane at lat 60 spans 100 m east-west over 10 km (true metres, not Mercator's 200), a frame
on four tiles' shared corner has no seam. Theme C's draggable frame feeds the section (its centre, side and size) once
shown; with no frame it takes the saved frame or the view; E and F extend the request and result.

**Theme E — Satellite and roads capture.** ✅ Landed (this PR). Satellite, roads mask and road graph are
written beside the heightmap and reach Terrain through F's existing hand-off. The satellite is stitched at
the zoom matching Terrain's `textureSize` (2048, or 4096 for a 4097 capture; the same 1 024-tile budget),
sampled **pixel-centred** and bilinearly in the `map-capture-worker` (a new `begin-satellite` run; JPEG/WebP
tiles are still decoded in main with `nativeImage`) and written as `satellite.png`; the default source is EOX
Sentinel-2 cloudless 2016, MapTiler when its key is set, and a display-only source records its licence
reason and fetches nothing. Roads come from **one Overpass query per capture** (`overpass.ts`, via `net.fetch`
in main — never the renderer; 90 s timeout, 64 MB cap, 429/504 retried once after `Retry-After`) and
`osmToRoadGraph` (pure, `shared/src/map/osm-roads.ts`): split at shared OSM nodes, clipped to the square,
projected with `toFrame` into Terrain's centred frame, edges under 1 m dropped, `lanes × 3.5` over the class
width. The graph is written as `roads.graph.json` (`MapRoadGraphFileSchema`) and rasterised by
`rasterizeRoads` as a cyan-on-black `roads.png` that `detectRoadColour` keys to `#00ffff` with no hint
(IoU ≥ 0.98 against its own coverage). Frames over 25 km skip roads with "Roads are captured for frames up to
25 km a side." — also a non-blocking `captureWarnings` code (`roads-skipped`) shown before capture. Each layer is
independent: a failed satellite or roads step appends to `capture.json`'s `missing` with a readable reason and
the heightmap still lands; `ATTRIBUTION.txt` covers every source used. The capture section gains "Satellite
image" and "Roads (OpenStreetMap)" toggles (both on by default; `MapCaptureRequest.satellite/roads/
satelliteSource` are optional and default on) and lists each missing layer's reason. The worker's message
loop is now `capture-dispatch.ts`, shared with the in-process test broker. The Overpass JSON fixture is built
in the test from `fromFrame` rather than committed, like D's synthetic DEM tiles.

**Theme F — Hand-off to Terrain.** ✅ Landed (this PR). "Capture and build" / "Capture only" in the Maps
capture section send `handoff`/`build` on the capture request, and main calls the terrain service
directly (a `terrainService()` getter in `media-terrain-handlers.ts`): `library({op:'create'})` →
`setInput` per file the capture carries → a main-only `setRoadsGraph` → `setSpec` (`handoffSpec`:
world size, height range, resolution, `textureSize` 2048/4096, `seaLevel: 0` when ≥ 1 % of samples are
at or below sea level, `preSmooth: 0`, and an explicit `geo` block) → `mediaTerrainOpen` → an
un-awaited `build`. Terrain's roads stage takes `inputs.roadsGraph` when set — widths from `widthM`,
`cls`/`name` carried into `build/roads.json` — and a mask-only terrain's `roads.json` is byte-identical
(pinned by hash). A new roads mask or removing it drops the graph that went with it. The Terrain panel
shows "Captured from Maps" with a Show on map button (`map-focus.ts`: opens the project and frames the
square). Heightmap-only captures hand off today; satellite, roads mask and graph wire in when Theme E
writes them.

**Theme G — Measure and draw.** ✅ Landed (PR #774). Geodesy is the Theme D kernel plus a new additive
`shared/src/map/measure.ts` (`geodesicCircle` 128-gon from Vincenty direct, `polygonMeasure` on the local frame,
refused past 200 km, `pathLegsM`) — no `@turf/*`. The tools are modes of one `mapToolReducer`
(`pan | distance | circle | area | pin`, keys `D`/`C`/`A`/`P`, Esc cancels, Enter or a double-click finishes,
Backspace undoes a point, draft vertices drag); a circle takes its radius from a second click, or Enter keeps
1 km, and the radius is editable in the detail pane. Readouts say "geodesic"; units are `mapUnits` in Settings ▸
Media ▸ Maps. Shift-click selects a second circle for centre-to-centre and gap/overlap (box-zoom is off so the
click survives). Place search reuses the Open-Meteo geocoder, moved to `features/geo/geocode.ts` (300 ms, two
characters, eight results, Enter flies to zoom 12) and records the name in `map-place-store.ts`, which names a capture and its terrain while the frame stays near that place (Theme F falls back to lat, lon).

**Theme H — Layers.** ✅ Landed (PR #774). `layers/<name>.geojson`, `MapLayerFileSchema` and `stringifyLayer`
(stable key order, 7 dp, trailing newline) in `shared/src/media-map.ts`, read and written through the generic
media file channels with a 500 ms debounce (`use-map-layers.ts`). Visibility, colour and order live in `map.json`;
the explorer's layer list handles rename, Trash delete (confirmed), drag or Alt+Up/Down reorder, New and Import
(`.geojson`/`.kml`, 10 MB cap). `kml.ts` converts both ways and counts skipped geometries. The toolbar's split
button downloads the active layer as GeoJSON or KML. An unparsable file shows an error row, is not drawn and is
never written over; external edits arrive through `media:changed`. A pin's colour is optional and inherits the
layer's.

**Theme I — Maps over MCP, and the skill.** ✅ Landed (PR #776). Four tools — `map_list` and `map_measure`
(read, ungated) and `map_goto` and `map_capture_terrain` (behind the new default-off `allowMaps` switch,
Settings ▸ MCP ▸ "Let agents capture maps"; `mcp-store` `version: 8`, since Phase 106 K had taken 7) —
across `shared/src/media-map-mcp.ts`, `main/media/map/map-mcp.ts` and `main/mcp/map-tools.ts`, bound from
`media-map-handlers.ts`. `map_capture_terrain` calls `captureService.capture` itself, the very path the Maps
tab's button runs, so satellite and roads arrive with Theme E untouched; it hands off by default and builds only
on `build: true`. `map_goto` geocodes a place in main (same Open-Meteo geocoder as the search box, injected
fetch), saves the view to `map.json` and broadcasts `mediaMapOpen`, which the Maps tab answers by remounting on
the saved view. `map_measure` returns legs and total, or a ring, circumference and area, from the shared
kernel. The skill is `midnite-media-map-build` in all six copies, pinned by the copies test and by a test that
it names only real tools.

**Theme J — Verification.** ◻ Not started. The gate, the no-network kernel goldens and roads-graph
tests, the bundle report, a CSP assertion for `mstudio-tile:`, screenshots in both themes, and three
human passes (Table Mountain heights, the MapTiler key never visible in the renderer, and a licence
read of every `exportable: true` source).

## Build order

A → B → (C, D in parallel) → E → F; G → H can run alongside D–F once A lands; I after F and H; J last.
D is the riskiest theme (projection + DEM decode + resampling) and should land before anyone builds UI
on top of a capture.

- **A before B is safe on its own**: A's canvas ships with the basemap catalogue stubbed to an empty
  style and the "no sources yet" state; B makes it draw. A must not add any tile host to `csp.ts`.
- **D's kernel (`shared/src/map/`) has no dependency on A–C** and can start on day one; only D's
  capture service needs B's `tile-fetch.ts`/`tile-cache.ts`.
- **F's Terrain changes (`inputs.roadsGraph`, `geo`, `setRoadsGraph`, the pipeline branch) can land
  before E** — they are additive and inert until a capture writes a graph — and should, so E's output
  has a consumer to test against.
- **G's geodesy is D's kernel** (`shared/src/map/geodesy.ts`), so G waits for that one file, not for
  all of D.
- A partial landing must leave the tab usable: a merged C without D shows the frame and readout with
  the Capture button disabled and titled "Capture arrives with Phase 108 Theme D".

## A — Maps tab and library (M)

- [x] `'map'` joins `MEDIA_TABS` and `REPO_SCOPED_MEDIA_TABS` in [`shared/src/media.ts`](../../../packages/shared/src/media.ts), with `MEDIA_TAB_EXPORT_FORMATS`, `MEDIA_TAB_META` (`LuMap`), the `media-view.tsx` body and `MEDIA_LAYOUT_KEYS` entries; storage at `.midnite/media/map/<project>/`.
  - `MEDIA_TABS` appends `'map'` **last** (after `'game'`) so the persisted tab index of every
    existing tab is unchanged; `REPO_SCOPED_MEDIA_TABS` appends `'map'` too.
  - `MEDIA_EXPORT_FORMATS` gains `'geojson'` and `'kml'`, `MEDIA_EXPORT_FORMAT_INFO` gains
    `geojson: { label: 'GeoJSON layer', ext: 'geojson', needsFfmpeg: false }` and
    `kml: { label: 'KML layer', ext: 'kml', needsFfmpeg: false }`; `MEDIA_TAB_EXPORT_FORMATS.map =
    ['geojson', 'kml']` (the split button exports the selected layer — Theme H — and is disabled with
    title "Select a layer to export" when none is).
  - `MEDIA_TAB_META.map = { label: 'Maps', icon: LuMap }` (`react-icons/lu`).
  - `ui-store.ts`: `LayoutSizes` gains `mediaMapExplorerWidth` (default 240, bounds 180–480) and
    `mediaMapDetailWidth` (default 300, bounds 240–520), and `MEDIA_LAYOUT_KEYS.map` names them. No
    persist `version` bump: missing `LayoutSizes` keys fall back to their defaults, exactly as
    `mediaGame*Width` were added in Phase 107.
  - Default project name `DEFAULT_MAP_PROJECT = 'maps'` (exported from `shared/src/media-map.ts`).
  - *Verified by:* `media-tabs.test`/`media-view.bridge.test.tsx` render the Maps strip entry and body
    with the mock bridge; typecheck proves every `Record<MediaTab, …>` has a `map` arm.
- [x] `maplibre-gl` added to `packages/app` and **lazy-loaded with the tab** (its own chunk; `scripts/perf/bundle-report.mjs` shows the entry chunk unchanged).
  - Pin `maplibre-gl@^5` (WebGL2; Electron 33's Chromium supports it). Import it **only** from
    `map-canvas.tsx`; `map-canvas-lazy.tsx` wraps it in `React.lazy(() => import('./map-canvas'))`
    exactly as `terrain-viewer-lazy.tsx` does, with the same `Suspense` fallback component.
  - Its stylesheet (`maplibre-gl/dist/maplibre-gl.css`) is imported inside `map-canvas.tsx`, so the CSS
    rides the lazy chunk too.
  - An eslint `no-restricted-imports` entry forbids `maplibre-gl` outside
    `features/media/map/map-canvas.tsx` (message: "MapLibre loads lazily — import it only in
    map-canvas.tsx").
  - *Verified by:* `node scripts/perf/bundle-report.mjs --assert` passes with `budgets.json`
    unchanged; the manifest lists a chunk whose name contains `map-canvas`.
- [x] `packages/app/src/features/media/map/`: `map-tab.tsx`, `use-map.ts`, `map-explorer.tsx` (projects + layers), `map-canvas.tsx` (MapLibre host, resize-observed, disposed on unmount — no WebGL context leak).
  - `map-tab.tsx` exports `MapTab()`, composing `MediaLayout` (explorer | canvas | detail) like
    `terrain-tab.tsx`; the detail pane is `map-panel.tsx` (capture form, Theme C readout, tool
    options).
  - `use-map.ts` exports `useMapProject(repoId, project)` (TanStack Query over
    `bridge().media.map.get`) and `useSaveMapView()` (the debounced setter below).
  - `map-canvas.tsx` exports `MapCanvas({ style, view, onViewChange, children })`; it creates one
    `maplibregl.Map` per mount, observes its container with `ResizeObserver` → `map.resize()`, and on
    unmount calls `map.remove()` **and** `map.getCanvas().getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext()`.
  - *Verified by:* a vitest with `maplibre-gl` mocked (`vi.mock`) asserts `remove` is called on
    unmount; an e2e spec (needs real WebGL — named in its header) mounts/unmounts the tab 10× and
    asserts no `WebGL: CONTEXT_LOST_WEBGL: too many active WebGL contexts` console message.
- [x] Basemap picker: Streets (OSM vector), Satellite, Terrain (hillshade), Dark; attribution control always visible and correct for the active sources.
  - `MAP_BASEMAPS = ['streets', 'satellite', 'terrain', 'dark'] as const` in `shared/src/media-map.ts`;
    `buildMapStyle(basemap, sources, opts): StyleSpecification` (pure, in
    `features/media/map/map-style.ts`) returns a style whose every URL is `mstudio-tile://…`.
  - Streets = OpenFreeMap Liberty; Satellite = the active satellite source (Decision 1) + OpenFreeMap
    label layers; Terrain = Positron + a `hillshade` layer over the DEM source; Dark = Positron passed
    through `darkenStyle(style)`, a pure function that maps each layer's paint colours through the
    app's dark tokens (no second style download).
  - The picker is a segmented control in the canvas's top-right; `AttributionControl({ compact:
    false })` is always mounted, and its text is the de-duplicated `attribution` strings of the
    sources the style uses (from the catalogue, not hand-typed).
  - *Verified by:* `map-style.test.ts` — for each basemap, every `sources[*].tiles`/`url`, `glyphs`
    and `sprite` starts with `mstudio-tile://`, and the attribution list equals the catalogue's for
    the sources used.
- [x] Last viewport (centre, zoom, bearing, pitch, style) persisted per project in `map.json`; reopening restores it.
  - `MapProjectFileSchema` in `shared/src/media-map.ts`: `{ version: z.literal(1).default(1), view:
    { center: [lon, lat], zoom: 0–22, bearing: −180–180, pitch: 0–85 }, basemap: z.enum(MAP_BASEMAPS),
    terrain3d: { on: boolean, exaggeration: 1–3 }, layerOrder: string[], layerStyle: Record<string,
    { color: Hex, visible: boolean }>, frame?: { center: [lon, lat], sideM: 16–65 536, size:
    TerrainResolution } }` with `.passthrough()`; defaults `center [18.4241, −33.9249]` (Cape Town),
    zoom 10.
  - Channels `mediaMapGet: 'mstudio:media:map-get'` (`{repoId, project}` → `GitOpResult<MapProjectFile>`,
    a missing file returns the defaults, a corrupt one returns the defaults **plus** a `warning`) and
    `mediaMapSetView: 'mstudio:media:map-set-view'` (`{repoId, project, patch}` → shallow merge,
    validated, written through `mediaStore.writeFile` inside the store's per-root queue).
  - The renderer saves on MapLibre `moveend`, debounced 750 ms, and once more on unmount; a pan never
    writes on every frame.
  - *Verified by:* `map-service.test.ts` — get on an empty project returns defaults; set then get
    round-trips; a hand-corrupted `map.json` returns defaults with `warning: 'map.json is not valid: …'`.
- [x] CSP: the default (keyless) tile hosts added to `connect-src` in [`main/csp.ts`](../../../packages/desktop/src/main/csp.ts) with `csp.test.ts` updated; keyed hosts are **not** added (they go through Theme B's protocol).
  - **Corrected by Decision 10:** no tile host is added. `connect-src` and `img-src` each gain exactly
    `mstudio-tile:`; every source — keyless or keyed — is reached through the protocol, so the
    renderer never talks to a tile host directly and one cache serves both display and capture.
  - *Verified by:* `csp.test.ts` asserts `connect-src` contains `mstudio-tile:` and contains **no**
    `openfreemap`, `amazonaws`, `eox` or `maptiler` substring.
- [x] Empty, loading and offline states: no network → a clear "Map tiles need a network connection" panel instead of a grey canvas; tile errors counted, not spammed to the console.
  - Offline = `navigator.onLine === false` **or** the first style load failing with every tile
    request erroring; the panel reads "Map tiles need a network connection." with a Retry button that
    calls `map.setStyle(buildMapStyle(…))`. Tiles already in the disk cache still draw offline.
  - Loading = a thin progress bar at the canvas top while `map.areTilesLoaded()` is false.
  - Tile errors: an `error` listener increments a counter shown as a footer chip "N tiles failed"
    (tooltip: the first failing source id and HTTP status); nothing is `console.error`ed per tile.
  - No repo selected = the shared repo-media empty state (`repo-media-tab.tsx`), same as Terrain.
  - *Verified by:* `map-states.test.tsx` renders each state from a mocked `useMapStatus()`.

## B — Tile sources, fetched in main (M)

- [x] `MAP_SOURCES` catalogue in `shared/src/media-map.ts`: id, kind (`dem` | `satellite` | `vector` | `basemap`), URL template, min/max zoom, tile size, encoding (`terrarium` | `terrain-rgb` | `png` | `mvt`), licence, attribution string, `exportable`, `requiresKey?`.
  - `MapSourceSchema` (zod) and `MAP_SOURCES: readonly MapSource[]`; `encoding` also allows `'jpeg'`
    and `'webp'` (EOX serves JPEG, MapTiler Terrain-RGB serves WebP). URL templates use `{z}/{x}/{y}`
    and an optional `{key}`; the template is **only ever expanded in main**.
  - Helper `mapSource(id): MapSource` throws on an unknown id (programmer error; callers validate
    with `MapSourceIdSchema = z.enum(MAP_SOURCE_IDS)` first).
  - *Verified by:* `media-map.test.ts` — ids unique; every `requiresKey` source has `{key}` in its
    template; every `exportable: true` source has a non-empty `licence` and `attribution`.
- [x] Keyless defaults: AWS Terrain Tiles (Terrarium) for DEM, an OSM-derived vector source for streets/roads, and an exportable open imagery source for satellite (Decision 1).
  - `aws-terrarium`: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`,
    z0–15, 256 px, `terrarium`, exportable, attribution "Terrain Tiles: Mapzen, AWS Open Data — see
    sources list".
  - `openfreemap`: TileJSON at `https://tiles.openfreemap.org/planet`, styles Liberty and Positron,
    fonts and sprites from the same host; display-only for capture (roads come from Overpass,
    Decision 2) — `exportable: false` with reason "Vector tiles are used for display only".
  - `eox-s2cloudless-2016`: `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg`,
    z0–14, `jpeg`, CC BY 4.0, exportable, attribution "Sentinel-2 cloudless – https://s2maps.eu by EOX
    IT Services GmbH (Contains modified Copernicus Sentinel data 2016)". The **2016** layer is pinned
    because later EOX vintages are CC BY-NC-SA.
- [x] Optional MapTiler key: `media.mapTilerApiKey` in `SECRET_KEYS`, a field on Settings ▸ Media, unlocking MapTiler satellite, Terrain-RGB DEM and styles.
  - Three sources, `requiresKey: true`: `maptiler-satellite` (`satellite-v2`, jpeg, z0–20),
    `maptiler-terrain-rgb` (`terrain-rgb-v2`, webp, `terrain-rgb`, z0–14 — **shallower** than
    Terrarium's z15, so it is never the DEM default), `maptiler-streets` (vector, display-only).
  - `ApiKeyRow` is exported from `image-settings.tsx` (unchanged behaviour) and reused in a new
    `MapSettingsSection` (`features/media/map/map-settings.tsx`) mounted in `media-page.tsx` under a
    "Maps" accordion item (`LuMap`), with the cache controls below it.
  - `mstudio:media:map-sources` returns `MapSourceStatus[] = { id, available: boolean, reason? }` —
    a keyed source with no key is `available: false, reason: 'Add a MapTiler key in Settings ▸ Media.'`;
    the renderer learns *whether* a key exists, never the key.
  - *Verified by:* `map-settings.test.tsx` — the row calls `secretsSet('media.mapTilerApiKey', …)`
    and the sources list flips `available`.
- [x] `mstudio-tile://<source>/<z>/<x>/<y>` protocol in main that injects keys, caches and serves tiles to MapLibre — the key never appears in the renderer, its URLs or its logs.
  - `MSTUDIO_TILE_SCHEME = 'mstudio-tile'` is added to the **existing** `registerPrivilegedSchemes()`
    array in `fs-protocol.ts` with `{ standard: true, secure: true, supportFetchAPI: true,
    corsEnabled: true }` — never a second `registerSchemesAsPrivileged` call.
  - `main/media/map/tile-protocol.ts` exports `installTileProtocol(deps)`, calling
    `protocol.handle(MSTUDIO_TILE_SCHEME, …)` on the **default session only** (the browser partition
    and game sessions can never resolve it, as for `mstudio-file:`).
  - Paths: `/<z>/<x>/<y>` → a tile; `/tilejson` → the source's TileJSON with its `tiles` rewritten
    to `mstudio-tile://<source>/{z}/{x}/{y}`; `/fonts/<stack>/<range>.pbf`; `/sprite<@2x?>.<json|png>`.
    Anything else → 404. An unknown source → 404. A keyed source with no key → 403 with an empty body.
  - Responses carry `Content-Type` from the encoding and `Cache-Control: max-age=86400`.
  - Logs name the source id and `z/x/y`, never the upstream URL (which may carry `?key=`).
  - *Verified by:* `tile-protocol.test.ts` with a fake fetcher — the upstream URL contains the key,
    the response, its headers and every logged line do not; `fs-protocol.test.ts` asserts the
    privileged list has three schemes in one call.
- [x] Main-side tile fetcher `main/media/map/tile-fetch.ts`: concurrency cap, retry with backoff, per-host rate limit, `User-Agent` per provider policy, abortable; returns `GitOpResult`-style envelopes, never throws across IPC.
  - `createTileFetcher({ fetch, cache, now, log })` → `{ get(source, z, x, y, signal): Promise<TileResult> }`
    where `TileResult = { ok: true; bytes: Uint8Array; fromCache: boolean } | { ok: false; status:
    number | 'network' | 'aborted'; message: string }`.
  - Limits: 6 in flight per host; 429/502/503/504 retried 3× at 500 ms · 2ⁿ with ±20 % jitter,
    honouring `Retry-After`; 404 is **not** retried and is cached as a 24 h negative entry (ocean
    tiles at deep zoom 404 on some sources).
  - `User-Agent: MidniteStudio/<app version> (+https://github.com/bilo-io/midnite-apps)`.
  - Duplicate concurrent requests for one tile share one upstream fetch (in-flight map keyed
    `source/z/x/y`).
  - *Verified by:* `tile-fetch.test.ts` — 7 concurrent gets on one host → ≤ 6 upstream calls in
    flight; a 503×2 then 200 resolves `ok`; an abort mid-retry resolves `{ok:false,status:'aborted'}`;
    two gets for one tile → one upstream call.
- [x] Disk cache under userData (`map-tiles/`), LRU-capped (default 1 GB, Settings ▸ Media slider), with a "Clear map cache" action and size readout.
  - `main/media/map/tile-cache.ts`: files at `userData/map-tiles/<source>/<z>/<x>/<y>.<ext>`; an
    in-memory index (path → size, lastUsed) built lazily by one directory walk on first use; a hit
    `utimes` the file; on write, if total > cap, evict oldest-`lastUsed` until total ≤ 90 % of cap.
  - Cap persisted in main's map settings (`map-settings.json` under userData, `{ version: 1,
    cacheCapMB: 256–8192, default 1024 }`); the slider steps 256 MB.
  - `mstudio:media:map-cache` with `op: 'status' | 'clear' | 'set-cap'` → `{ bytes, tiles, capMB }`;
    clear is confirmed in the renderer ("Clear N MB of cached map tiles?") — it is not repo data, so no
    blast-radius count beyond the size.
  - *Verified by:* `tile-cache.test.ts` against a temp dir — writing past the cap evicts the
    least-recently read tile first and ends ≤ 90 % of cap; `clear` leaves an empty tree and
    `status` reads 0.

## C — 3D preview and capture framing (S/M)

- [x] 3D toggle: MapLibre `setTerrain` from the active DEM source + hillshade layer, exaggeration slider (1×–3×), pitch/bearing controls.
  - Off: `map.setTerrain(null)`, pitch eased to 0. On: `map.setTerrain({ source: 'dem', exaggeration })`
    with a `raster-dem` source (`encoding: 'terrarium'` or `'mapbox'` for Terrain-RGB) and pitch eased
    to 60. Slider step 0.1; value persisted in `map.json` `terrain3d`.
  - `NavigationControl({ visualizePitch: true })` provides pitch/bearing; a "Reset north" button sets
    bearing 0.
  - *Verified by:* `map-canvas.test.tsx` (mocked map) asserts `setTerrain` arguments for on/off;
    screenshot "Maps 3D" in J.
- [x] Capture frame overlay: a square that stays square in **metres** (not pixels) as you pan/zoom/tilt, draggable/resizable, with a live readout — side length (m/km), centre lat/lon, min/max elevation sampled, chosen output size and resulting metres-per-pixel.
  - The frame is `{ center: [lon, lat], sideM }`; its outline is `frameRing(center, sideM, 16)` from
    the kernel (16 points per side, via the local frame's inverse), drawn as a GeoJSON `fill` (10 %
    opacity) + `line` layer — so on a tilted map it is a projected square, not a screen rectangle.
  - Drag the interior to move the centre; drag any corner handle (a `circle` layer, 8 px) to resize
    about the centre; `sideM` is clamped to 16–65 536 m. The frame is rotation-free (north-up),
    because Terrain has no rotation in its `worldSize` model.
  - Readout: side (`< 1000 m` in m, else km to 2 dp), centre (5 dp), metres/px `= sideM / (size − 1)`,
    and min/max elevation sampled with `map.queryTerrainElevation` on a 9×9 grid inside the frame
    (labelled "≈ from preview tiles"; the capture computes the real ones). The readout is
    `aria-live="polite"`, updated at most every 250 ms.
  - Default frame on first toggle: centred on the view, `sideM` = 50 % of the visible width,
    `size` 1025.
  - *Verified by:* `frame.test.ts` (kernel) — `frameRing` at lat 0 and lat 60 has all four sides
    equal to `sideM` within 0.1 % by Vincenty; e2e (pointer drag) moves the frame and the readout
    centre changes.
- [x] Output size picker matching Terrain's resolutions (129 … 4097) and a warning when the frame exceeds Terrain's 65 536 m `worldSize` cap or the DEM can't resolve the chosen metres-per-pixel.
  - Options come from `TERRAIN_RESOLUTIONS` (imported, not re-typed).
  - Warnings (amber, below the readout, literal copy): over cap — "Terrain's largest world is 65.5 km
    a side." (Capture disabled); below 16 m — "Terrain's smallest world is 16 m a side." (Capture
    disabled); `mPerPx` finer than the DEM's best `nativeMPerPx(source, lat)` ÷ 2 — "The elevation
    data is ~N m/px here; a smaller size gives the same detail." (Capture still enabled); roads over
    25 km — "Roads are captured for frames up to 25 km a side." (Decision 17).
  - *Verified by:* `capture-warnings.test.ts` over `captureWarnings(frame, size, sources)` — a pure
    function in `shared/src/media-map.ts` returning `{ code, message, blocking }[]`.
- [x] Keyboard: arrow keys pan, `+`/`-` zoom, `F` toggles the frame, `T` toggles 3D; all controls reachable and labelled.
  - Keys are bound on the focused canvas container (`tabIndex=0`, `role="application"`,
    `aria-label="Map"`), **not** as global chords, so they never collide with `COMMANDS` in
    `shared/src/keybindings.ts` and never fire while typing in the search box. Arrows pan 100 px
    (Shift: 400 px); `+`/`=` and `-` zoom ±1; `F` and `T` toggle; `Escape` cancels the active tool
    (Theme G).
  - Every control has an `aria-label` and a `Tooltip` naming its key ("Toggle 3D (T)").
  - *Verified by:* `map-keys.test.tsx` — key events on the container call the mocked map's
    `panBy`/`zoomIn`/`setTerrain`; a keydown in the search input does not.

## D — Heightmap capture (L)

- [x] `shared/src/map/` pure kernel (no electron, vitest-only): Web-Mercator ↔ lat/lon, tile maths, local tangent-plane (ENU) projection centred on the frame so the output square is in true metres (Decision 3).
  - Dependency-free TS (shared is zod-only). Files: `mercator.ts` (`lonLatToWorld`, `worldToLonLat`,
    `tileForLonLat(lon, lat, z)`, `tileBounds(z, x, y)`, `nativeMPerPx(z, lat, tileSize)`),
    `geodesy.ts` (WGS84 `inverse(a, b) → { distanceM, azi1, azi2 }` and `direct(p, aziDeg, distM) →
    [lon, lat]` by Vincenty, falling back to the spherical formula when Vincenty fails to converge in
    200 iterations — near-antipodal only), `frame.ts` (`toFrame(center, [lon,lat]) → [x, z]` and
    `fromFrame(center, [x, z]) → [lon, lat]`, `frameRing`, `frameBBox(center, sideM) → [w, s, e, n]`),
    `index.ts` barrel re-exported from `shared/src/index.ts` as `map`.
  - **The local frame is azimuthal equidistant** about the frame centre (Decision 3): `fromFrame`
    is `direct(center, atan2(x, −z) in degrees, hypot(x, z))` and `toFrame` is its `inverse`, so
    distance from the centre is exact and the GeoTIFF can name it (`+proj=aeqd`). Axes follow
    Terrain: `x` east, `z` **south**.
  - *Verified by:* `geodesy.test.ts` — Vincenty's Flinders Peak → Buninyong case gives
    54 972.271 m ± 1 mm; `frame.test.ts` — `toFrame(fromFrame(p))` round-trips within 1 mm across a
    65 km square at lat 0, 45, 60 and −60.
- [x] DEM decode: Terrarium (`(R·256 + G + B/256) − 32768`) and Mapbox Terrain-RGB (`−10000 + (R·65536 + G·256 + B)·0.1`), with no-data handling.
  - `shared/src/map/dem.ts`: `decodeDem(rgba: Uint8Array, encoding: 'terrarium' | 'terrain-rgb'):
    Float32Array` (metres, row-major); a fully transparent pixel (A = 0) is `NaN` (no-data).
  - No-data is filled after stitching by `fillNoData(grid, w, h)` (iterative 4-neighbour mean, up to
    64 passes); if > 25 % of the frame is `NaN` the capture fails with "The elevation source has no
    data for most of this area."
  - *Verified by:* `dem.test.ts` — RGB (128, 0, 0) Terrarium → 0 m; (1, 134, 160) Terrain-RGB → 0 m
    (−10000 + 100000·0.1); an A = 0 pixel → `NaN`.
- [x] Deepest-zoom selection: fetch the DEM at the deepest zoom the source offers for the area (Terrarium ≈ z15), not the screen zoom; stitch tiles, then bilinear/bicubic resample onto the 2ⁿ+1 grid in the ENU square.
  - Rule, in `chooseCaptureZoom(source, frame, size): { z, tiles }` (`shared/src/map/capture-plan.ts`):
    start at `z = source.maxZoom`; step down while `nativeMPerPx(z, lat) < (sideM / (size − 1)) / 2`
    (deeper is wasted) **or** the frame's tile count at `z` exceeds `MAP_CAPTURE_TILE_BUDGET = 1024`;
    never below `source.minZoom`. So a 65 km frame at 4097 lands near z13, a 1 km frame at 1025 at z15.
  - Stitch the covering tiles into one Mercator mosaic (a `Float32Array`, tile size × count), then
    for every output vertex `(i, j)` with `x = −S/2 + i·S/(n−1)`, `z = −S/2 + j·S/(n−1)` —
    **vertex-centred**, matching `buildHeightfield` — compute `fromFrame` → Mercator mosaic pixel →
    **bicubic** (Catmull-Rom, clamped to the 4 neighbours' min/max to stop overshoot).
  - *Verified by:* `capture-plan.test.ts` — the two examples above; a frame whose tile count at the
    budget-limited zoom is ≤ 1024.
- [x] Outputs into `.midnite/media/map/<project>/captures/<name>/`: `heightmap.png` (16-bit greyscale, min→0, max→65535), `heightmap.r32` (little-endian float32 metres), `heightmap.tif` (single-band float32 GeoTIFF with the frame's bounds), and `capture.json` (bbox, centre, side metres, metres/px, min/max metres, source ids, zoom, attributions, timestamp).
  - `<name>` = `slug(place or "lat_lon")-YYYYMMDD-HHMMSS` (the `terrainFolderLabel` suffix shape);
    files are written via `mediaStore.writeBytes({ tab: 'map', … })`, so the jail and the
    `media:changed` broadcast are the store's.
  - `heightmap.png`: `encodePngGrey16` from
    [`png-codec.ts`](../../../packages/desktop/src/main/media/png/png-codec.ts),
    `round((h − min) / (max − min) · 65535)`; a flat frame (`max − min < 0.5 m`) writes `max = min + 1`.
  - `heightmap.r32`: raw `Float32Array` bytes, little-endian, row 0 = north edge, no header.
  - `heightmap.tif`: `writeGeoTiffFloat32(heights, n, { center, sideM })` in `shared/src/map/geotiff.ts`
    — a hand-written baseline TIFF (one strip, `SampleFormat=3`, `BitsPerSample=32`) with
    `ModelPixelScale` (`S/(n−1)` both axes), `ModelTiepoint` (pixel (0,0) → `(−S/2, +S/2)`
    northing-up), and a user-defined azimuthal-equidistant `GeoKeyDirectory` on WGS84 centred on the
    frame (Decision 3). No `geotiff` dependency.
  - `capture.json` = `MapCaptureFileSchema`: `{ version: 1, name, center, sideM, size, mPerPx,
    bbox: [w,s,e,n], heightMinM, heightMaxM, hasSea, sources: { dem, satellite?, roads? }, demZoom,
    satelliteZoom?, attributions: string[], files: string[], missing: { slot, reason }[], capturedAt }`.
  - An `ATTRIBUTION.txt` beside the files repeats `attributions`, one per line.
  - *Verified by:* `geotiff.test.ts` parses the written bytes back (tag table) and asserts the
    tiepoint and scale; `capture-service.test.ts` asserts the five files exist and `capture.json`
    parses.
- [x] Runs in a worker or utility process with progress events and cancel; a 4097² capture does not block main or the renderer.
  - Main (`capture-service.ts`) plans tiles, fetches them through `tile-fetch.ts` and decodes them
    (PNG via `decodePng`; JPEG/WebP via `nativeImage.createFromBuffer(…).toBitmap()` → BGRA →
    RGBA), then posts mosaics to `map-capture-worker` (`packages/desktop/src/map-capture-worker/`,
    added to `scripts/bundle.mjs` next to `terrain-worker`, forked by `utilityProcess.fork` behind a
    `createMapCaptureBroker` modelled on `createTerrainBroker`), which resamples and encodes.
  - Channels: `mediaMapCapture: 'mstudio:media:map-capture'` (`MapCaptureRequestSchema` → resolves
    with `GitOpResult<MapCaptureResult>` when the run ends), `mediaMapCaptureCancel:
    'mstudio:media:map-capture-cancel'` (`{ captureId }`), event `mediaMapCaptureProgress`
    (`{ captureId, stage: 'plan'|'dem'|'satellite'|'roads'|'encode'|'handoff', fraction }`).
  - Concurrency: one capture at a time per app; a second request answers `{ok:false, kind:'error',
    message:'A capture is already running.'}`. Cancel aborts in-flight fetches (`AbortController`)
    and kills the worker; partial files are written to `captures/.tmp-<id>/` and renamed into place
    only on success, so a cancel leaves nothing. Switching repo mid-capture does not cancel it — the
    result lands in the repo it started in.
  - *Verified by:* `capture-service.test.ts` with fake fetcher + in-process broker — cancel during
    `dem` resolves `{ok:false, message:'Capture cancelled.'}` and leaves no `captures/` entry.
- [x] Golden tests (the synthetic Terrarium tiles are generated in code by `shared/src/map/synthetic-dem.ts` rather than committed as `__fixtures__/` binaries — same planes, no binary files in the repo): a fixture set of Terrarium tiles decodes to known heights; a frame straddling a tile seam has no visible seam; a frame near ±60° latitude keeps true metres.
  - Fixtures in `shared/src/map/__fixtures__/`: four synthetic 256² Terrarium PNGs encoding a plane
    `h = 0.01·x_m` (generated by a committed script, decoded with a tiny pure PNG reader in the test
    helper, or stored as raw RGBA `.bin` so shared stays free of a PNG codec).
  - Seam: a frame centred on the shared corner of the four tiles; the max absolute second difference
    across the seam row/column is ≤ the interior's.
  - ±60°: a capture of the plane at lat 60 with `sideM` 10 000 has east-west height delta = 100 m ±
    0.5 m (true metres), not 200 m (Mercator stretch).

## E — Satellite and roads capture (L)

- [x] Satellite: stitched at the matching zoom for the chosen metres/px from the selected exportable source, reprojected onto the same ENU square, written as `satellite.png`; refuses non-exportable sources with the licence reason.
  - Output side = the hand-off `textureSize`: 2048 when `size ≤ 2049`, 4096 for 4097 (Decision 15);
    zoom from `chooseCaptureZoom` with the texture's m/px, same 1024-tile budget.
  - Sampling is **pixel-centred** (`x = −S/2 + (i + 0.5)·S/T`) because Terrain drapes the satellite as
    a texture over the whole square; bilinear; RGBA8 via `encodePngRgba8`.
  - A non-exportable source → `missing: [{ slot: 'satellite', reason: '<source label> is display-only: <licence>' }]`
    and no fetch.
  - *Verified by:* `capture-service.test.ts` — an `exportable: false` source makes no fetch call and
    records the reason.
- [x] Roads graph: OSM road ways for the frame bbox (Decision 2), clipped and projected to frame metres, written as `roads.graph.json` in Terrain's `roads.json` node/edge shape with `class` (motorway … track), `name?`, `lanes?`, `width` estimated per class.
  - **Corrected:** Terrain's `roads.json` edge has `kind: 'path'|'street'|'avenue'`, not `class`, and
    no name/lanes; so the capture writes its own `MapRoadGraphFileSchema` (`shared/src/media-map.ts`):
    `{ version: 1, worldSize, nodes: { id, p: [x, z] }[], edges: { id, a, b, points: [x, z][], cls:
    MapRoadClass, name?: string, lanes?: number, widthM: number, osmWayId: number }[] }` in Terrain's
    centred frame (`x` east, `z` south, metres).
  - `MAP_ROAD_CLASSES` and `MAP_ROAD_WIDTH_M`: motorway 24, trunk 20, primary 14, secondary 12,
    tertiary 10, unclassified 7, residential 7, service 4, track 3, path 2 (`footway`, `cycleway`,
    `bridleway`, `steps` fold into `path`; `*_link` folds into its parent class). `lanes × 3.5` overrides
    the class width when `lanes` parses as a positive integer.
  - Query (`main/media/map/overpass.ts`): POST `https://overpass-api.de/api/interpreter`, body
    `[out:json][timeout:60];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|track|path|footway|cycleway|bridleway|steps)(_link)?$"](S,W,N,E);(._;>;);out body;`,
    one query per capture, 90 s client timeout, response capped at 64 MB, 429/504 retried once after
    `Retry-After` (default 10 s). Frames > 25 km a side skip roads with reason (Decision 17).
  - Graph build, `osmToRoadGraph(osm, center, sideM)` (pure, `shared/src/map/osm-roads.ts`): graph
    nodes = way endpoints + OSM nodes used by ≥ 2 ways; ways split there; each polyline clipped to the
    square (a boundary crossing inserts a node); projected with `toFrame`; edges shorter than 1 m
    dropped.
  - *Verified by:* `osm-roads.test.ts` on a committed Overpass JSON fixture (a T-junction and a way
    leaving the frame) — 4 nodes, 3 edges, the clipped edge ends on `x = S/2`, classes and names kept.
- [x] Roads mask: the same graph rasterised to `roads.png` at the output size, light-on-dark with per-class width, matching the hue/luminance key Terrain's mask reader expects.
  - `rasterizeRoads(graph, side): Uint8Array` (pure, `shared/src/map/osm-roads.ts`): thick polylines
    (round caps) at `widthM / mPerPx` px, ≥ 1 px; written as RGBA **cyan `#00FFFF` on black**, at the
    satellite's side (so `alignment.roads = 'satellite'` stays identity).
  - *Verified by:* `osm-roads.test.ts` — `detectRoadColour` on the raster returns `#00ffff`;
    `extractRoadMask` IoU with the raster's own coverage ≥ 0.98.
- [x] Partial results are explicit: if satellite or roads fail, the heightmap still lands and `capture.json` lists what is missing and why.
  - DEM failure fails the capture (nothing written). Satellite/roads failures append to `missing`
    with the user-facing reason ("OpenStreetMap's Overpass server is busy — try again in a minute.",
    "Roads are captured for frames up to 25 km a side.", "No roads in this area.") and the hand-off
    skips those slots. The renderer shows a toast "Captured with N missing: …".
  - *Verified by:* `capture-service.test.ts` — Overpass 504×2 → result `ok`, `missing` has `roads`,
    `heightmap.png` exists.

## F — Hand-off to Terrain (M)

- [x] "Capture for Terrain" button: runs D + E, then creates a terrain via the existing IPC (`terrain-library {op:'create'}` → `terrain-set-input` ×3 → `terrain-set-spec` → optional `terrain-build`), named after the place or coordinates.
  - **Corrected (Decision 13):** the capture runs in main, so the hand-off calls the terrain **service**
    in main, not the IPC chain: `media-terrain-handlers.ts` exports `terrainService()` (a getter for
    its module-local `service`), and `capture-service.ts` takes it as a dep
    `terrain: Pick<TerrainService, 'library' | 'setInput' | 'setRoadsGraph' | 'setSpec' | 'build'>`.
  - Order: `library({op:'create', repoId, project: DEFAULT_TERRAIN_PROJECT, name})` → `setInput`
    for heightmap / satellite / roads with the PNG bytes → `setRoadsGraph` → `setSpec` →
    `build` iff the request's `build: true` (the button's split menu: "Capture and build" default,
    "Capture only"). Name = the last place-search result's name, else `"<lat>, <lon>"` at 3 dp.
  - Any hand-off step failing leaves the capture on disk and returns `{ok:false}` naming the step;
    the half-made terrain is left in place (visible, deletable) rather than auto-deleted.
  - *Verified by:* `capture-service.test.ts` with a fake terrain service — calls arrive in that order
    with those arguments; a failing `setSpec` returns `{ok:false, message:/terrain settings/}`.
- [x] Spec auto-fill: `worldSize` = frame side in metres, `heightRange` = [min, max] metres, `resolution` = output size, `seaLevel` = 0 when the frame contains sea, `alignment` identity.
  - Also `textureSize` = the satellite side (Decision 15), `name` = the capture name's label, and
    `preSmooth: 0` (the heightmap is 16-bit).
  - `hasSea` = ≥ 1 % of DEM samples ≤ 0 m **and** min < 0; then `seaLevel: 0`. A below-sea-level
    inland basin (Dead Sea) also trips this — accepted; the user clears `seaLevel` in the Terrain panel.
  - *Verified by:* `capture-handoff.test.ts` — `handoffSpec(capture)` (pure) for a sea and a
    mountain fixture.
- [x] Terrain gains an optional captured-graph path: when `inputs/roads.graph.json` exists, Terrain uses it instead of re-skeletonising the mask, so road classes, names and widths survive (Phase 105 `road-graph` unchanged for mask-only inputs).
  - Spec: `inputs` gains `roadsGraph: z.object({ file: z.literal('inputs/roads.graph.json'), edges:
    z.number().int().nonnegative() }).optional()` — additive, `version` stays 1.
  - Service: `setRoadsGraph(target, bytes | { remove: true })` — main-only (no IPC channel), validates
    with `MapRoadGraphFileSchema`, writes through the per-terrain queue. `setInput({slot:'roads',
    remove:true})` also removes `roadsGraph` (they are a pair).
  - Pipeline (`build-pipeline.ts` roads stage): the mask is still extracted (foliage keeps off it via
    `roadsOnLandcover`), but when `spec.inputs.roadsGraph` is set the graph is
    `roadGraphFromCapture(file)` (new export in `road-graph.ts`: `RoadEdge` gains optional `widthM`,
    `cls`, `name`; `radii` = `widthM/2` per point) instead of `roadGraphFromMask`; `edgeWidth` returns
    `clamp(edge.widthM · widthScale)` when `widthM` is present.
  - `TerrainRoadEdgeSchema` gains optional `cls?: string` and `name?: string`, written by `toRoadsFile`
    when present; `kind` is still derived from width.
  - *Verified by:* `build-pipeline.test.ts` — a terrain with a captured graph writes `roads.json`
    whose edges carry `cls`; the existing mask-only fixture's `roads.json` is byte-identical before and
    after.
- [x] `terrain.json` records a `geo` block (centre, bbox, side metres, capture id, attributions) via the passthrough schema; the Terrain detail pane shows "Captured from Maps" with a link back to the frame.
  - **Decision 16:** an explicit `geo: TerrainGeoSchema.optional()` field, not a passthrough key —
    `{ center: [lon, lat], bbox: [w, s, e, n], sideM, capture: { repoId?, project, name },
    attributions: string[], capturedAt }`.
  - `terrain-panel.tsx` renders, when `spec.geo` is set, a row "Captured from Maps · <place> ·
    <side> km" with a button "Show on map" that switches to the Maps tab and calls
    `focusMapCapture({ project, name })` (a non-persisted zustand store in
    `features/media/map/map-focus.ts`; Maps opens that project and fits the frame). Attributions show
    under it in small text.
  - *Verified by:* `terrain-panel.bridge.test.tsx` — the row renders for a spec with `geo` and not
    without; clicking it calls `focusMapCapture`.
- [x] After hand-off, `mstudio:media:terrain-open` focuses the new terrain in the Terrain tab.
  - Main broadcasts `EVENT_CHANNELS.mediaTerrainOpen` with `{ repoId, project, terrain }` after
    `setSpec` (before the build finishes), and the Maps tab switches the Media tab to `terrain`; build
    progress then shows on the Terrain tab's existing progress UI.
  - *Verified by:* `capture-service.test.ts` — `emitOpen` called once with the created terrain.

## G — Measure and draw (M)

- [x] Distance tool: click points to build a path; each leg and the running total shown as great-circle distance; drag vertices to adjust; units m/km/mi (Settings ▸ Media).
  - Tools are modes of one reducer `mapToolReducer(state, action)` (`features/media/map/map-tools.ts`):
    `'pan' | 'distance' | 'circle' | 'area' | 'pin'`; a toolbar of `IconButton`s (`LuRuler`,
    `LuCircleDot`, `LuPentagon`, `LuMapPin`) with keys `D`, `C`, `A`, `P` on the canvas; `Escape`
    cancels the in-progress shape, `Enter` or a double-click finishes it.
  - Legs use `inverse()` (ellipsoidal, "geodesic" — label the readout "geodesic", not "great-circle").
  - Units `MapUnits = 'metric' | 'imperial'` persisted in `ui-store` (`mapUnits`, default `'metric'`);
    `formatDistance(m, units)` — < 1000 m in m, else km 2 dp; imperial: < 0.1 mi in ft, else mi 2 dp.
  - *Verified by:* `map-tools.test.ts` (reducer transitions) and `format.test.ts`.
- [x] Radius circles: drop at a point, set radius by typing or dragging, label and colour; several circles; geodesic (not screen) circles; centre-to-centre distance between selected circles.
  - `geodesicCircle(center, radiusM, 128)` = 128 `direct()` points; radius 1 m – 2 000 km; the label
    input and colour swatch live in the detail pane for the selected feature; Shift-click selects a
    second circle and the pane shows "Centre to centre: <d>" and "Gap: <d − r1 − r2>" (negative → "Overlap").
  - *Verified by:* `geodesy.test.ts` — every vertex of a 10 km circle at lat 60 is 10 000 m ± 1 cm
    from the centre.
- [x] Areas: polygon tool with area (m²/ha/km²) and perimeter.
  - `polygonArea(ring)` projects the ring onto the local frame at its centroid and uses the shoelace
    formula — exact enough for polygons ≤ 200 km across; larger rings are refused with "Areas up to
    200 km across." Units: < 10 000 m² in m², < 1 km² in ha, else km².
  - *Verified by:* `geodesy.test.ts` — a 1° × 1° quad at the equator ≈ 12 308 km² within 0.5 %.
- [x] Pins: labelled markers with notes.
  - A pin is a `Point` feature `{ properties: { kind: 'pin', label, note?, color } }`; rendered as a
    `symbol` layer (no DOM markers, so 1 000 pins stay cheap); the note edits in the detail pane.
- [x] Place search via the Open-Meteo geocoder the app already allows; results fly the map there.
  - Reuse `searchLocations(query)` from `features/weather/weather-api.ts` (move it to
    `features/geo/geocode.ts` and re-export from the old path if both callers stay); debounced 300 ms,
    min 2 chars, up to 8 results; `Enter` picks the first; a pick calls `map.flyTo({ center, zoom: 12 })`
    and records the name for the capture name (F). Empty → "No places match."; fetch failure →
    "Place search needs a network connection."
- [x] Geodesy from a small, typed dependency (e.g. `@turf/*` modules) or the Theme D kernel — no hand-rolled haversine drift; unit-tested against known distances.
  - **Resolved (Decision 18):** the Theme D kernel (`shared/src/map/geodesy.ts`, Vincenty on WGS84) —
    no `@turf/*`, because `shared` is zod-only and both main (`map_measure`) and the renderer need the
    same numbers.
  - *Verified by:* `geodesy.test.ts` (Flinders Peak → Buninyong; London → New York ≈ 5 585 km within
    1 km).

## H — Layers (S/M)

- [x] Drawings are features in named layers saved as `.midnite/media/map/<project>/layers/<name>.geojson` (git-tracked, stable key order so diffs are readable).
  - Schema `MapLayerFileSchema` = a GeoJSON `FeatureCollection` whose features are `Point`,
    `LineString` or `Polygon` with `properties.kind ∈ {'pin','path','circle','area'}` (a circle is
    stored as its 128-gon **plus** `properties.center` and `radiusM`, so it re-renders exactly and
    other tools still read a polygon); coordinates rounded to 7 dp.
  - `stringifyLayer(fc)` (pure, `shared/src/media-map.ts`) sorts keys (`type`, `id`, `geometry`,
    `properties` first, the rest alphabetical), 2-space indent, trailing newline.
  - Read/write through the **generic** media file channels (`bridge().media.file.read`/`.write` with
    `tab: 'map'`) — no new IPC; writes debounced 500 ms after the last edit.
  - New drawings go to the selected layer; with none, a layer `drawings` is created.
  - *Verified by:* `layers.test.ts` — `stringifyLayer(parse(stringifyLayer(x))) === stringifyLayer(x)`;
    a key-shuffled input yields the same bytes.
- [x] Layer list in the explorer: toggle visibility, rename, recolour, delete (Trash), reorder.
  - Rename = `bridge().media.file.rename`; delete = `bridge().media.file.remove` (the store moves it to the Trash), confirmed "Move layer
    '<name>' (N features) to the Trash?"; visibility, colour and order live in `map.json`
    (`layerStyle`, `layerOrder`) so toggling never rewrites the GeoJSON. Reorder by drag
    (`@dnd-kit`, as other explorers do) or `Alt+↑/↓` on the focused row.
- [x] Import a `.geojson`/`.kml` file as a layer; export a layer as GeoJSON or KML.
  - `features/media/map/kml.ts`: `kmlToGeoJson(text)` with `DOMParser` (Placemark → Point /
    LineString / Polygon outer ring; `name` → `label`, `description` → `note`; anything else
    skipped and counted) and `geoJsonToKml(fc)`. Import > 10 MB is refused ("Layers up to 10 MB.").
  - Export goes through the tab's split button (`geojson` | `kml`, A) and a native save dialog.
  - *Verified by:* `kml.test.ts` round-trip on a fixture with one of each geometry plus an unsupported
    `MultiGeometry` (reported as skipped: 1).
- [x] External edits to a layer file are picked up on `media:changed`.
  - The tab invalidates the layer queries on `mstudio:media:changed` for `tab: 'map'`; an
    unparsable file shows the layer row in an error state ("Not valid GeoJSON — fix the file or
    delete the layer.") and is not drawn, never overwritten.

## I — Maps over MCP, and the skill (M)

- [x] Tools `map_goto` (place or lat/lon + zoom), `map_capture_terrain` (centre + side metres + size → capture id and, optionally, a terrain), `map_measure` (points → distances; centre + radius → circle), `map_list` (projects, captures, layers), registered with the midnite MCP server.
  - Contracts in new `shared/src/media-map-mcp.ts` and the `McpToolId` union + tool table in
    `shared/src/mcp.ts`; implementations in new `main/media/map/map-mcp.ts`
    (`createMapTools(deps) → MapTools`), wrapper in new `main/mcp/map-tools.ts` (`setMapTools`), bound
    from new `main/ipc/media-map-handlers.ts` — the terrain trio exactly.
  - Inputs address a repo by `repoPath` (as `terrain_*` do). `map_goto { repoPath, place? | center?,
    zoom? }` broadcasts `mediaMapOpen` (`mstudio:media:map-open`) which the Maps tab answers;
    `map_capture_terrain { repoPath, center, sideM, size, build?: boolean }` →
    `{ capture, terrain?, missing }`; `map_measure { points } | { center, radiusM }` →
    `{ legsM, totalM } | { ring }`; `map_list { repoPath }` → projects, captures, layers.
- [x] Behind a Settings ▸ MCP "Maps" switch (default off), same gating as the Terrain tools; tool descriptions ≤ 220 chars; the tool-registry test lists them.
  - Same split as Terrain (Decision 19): `map_list` and `map_measure` answer whenever the server is
    on; `map_goto` and `map_capture_terrain` refuse with `MAPS_OFF_MESSAGE` unless `allowMaps`.
    `ui-gate.ts` gains `getMcpAllowMaps`/`setMcpAllowMaps`; `mcp-store.ts` bumps to `version: 7` with
    `allowMaps: false` (migration: absent → `false`); `McpStatus`/`McpSet` schemas in
    `shared/src/ipc/schemas.ts` gain `allowMaps`; `mcp-page.tsx` gains the switch "Let agents capture
    maps".
  - *Verified by:* `mcp.test.ts` (description rule), `mcp-store.test.ts` (v6 → v7 migration),
    `gate-tools.test.ts`-style test that `map_capture_terrain` refuses while off.
- [x] `midnite-media-map` skill (frame an area, pick a size, capture, hand off, check the build) in all six skill dirs, pinned by the skill copies test.
  - **Corrected:** named **`midnite-media-map-build`** — `skill-copies.test.mjs` only discovers
    `^midnite-media-.+-build$`, so `midnite-media-map` would ship unpinned. Add
    `expect(skills).toContain('midnite-media-map-build')` to its first test.
  - The skill names the four tools, the 25 km roads limit, the 65.5 km cap, and ends by pointing at
    `midnite-media-terrain-build` for the build/look/adjust loop.

## J — Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Kernel goldens (D) and roads-graph tests (E) pass under bare vitest with no network.
- [ ] Bundle report shows MapLibre in its own lazy chunk and the entry chunk within budget.
- [ ] Screenshots: the Maps tab in 2D and 3D, the capture frame with its readout, measure + circles, and the resulting terrain in the Terrain tab (dark + light).
- [ ] Human pass: capture a known mountain (e.g. Table Mountain) at 1025 and 4097; the built terrain's peak height and footprint match the real world within the DEM's accuracy.
- [ ] Human pass: a capture with the optional MapTiler key set, confirming the key never appears in renderer devtools (network panel, URLs, console).
- [ ] `csp.test.ts` asserts `mstudio-tile:` in `connect-src` and no tile host; `fs-protocol.test.ts` asserts one privileged-schemes call carrying `mstudio-file`, `mstudio-game` and `mstudio-tile`.
- [ ] A mask-only Phase 105 terrain fixture builds a byte-identical `build/roads.json` before and after Theme F.
- [ ] **Open, for a human:** read the licence of every `exportable: true` source in `MAP_SOURCES` (AWS Terrain Tiles source list, EOX s2cloudless 2016, MapTiler's terms for the active plan) and record the date checked in a comment beside each entry.

## Deferred

Nothing deferred yet.

## Not in this phase

- Leaflet or OpenLayers engines (a `MapView` adapter seam may be noted in code comments only).
- Directions / routing, live GPS or device location.
- Offline tile packs and pre-downloading regions.
- Capturing buildings, water or land-use polygons (Terrain's satellite classifier still derives them).
- Importing GeoTIFF directly into Terrain (Terrain keeps reading the 16-bit PNG).
- A Maps asset source for Games — a captured terrain already reaches a game through Phase 107
  Theme N's `'terrain'` source; a direct map source would duplicate it.
- Rotated capture frames — Terrain's world has no rotation, so a rotated frame would need a
  resample Terrain cannot describe.
- Roads for frames over 25 km a side — one Overpass query that large is slow and often refused
  (Decision 17).
- Editing OSM data or uploading anything to OpenStreetMap.
- A self-hosted or alternative Overpass endpoint setting — one public endpoint until it proves a
  problem.

## Files this phase touches

| Area | Files |
|---|---|
| Shared contract | [`shared/src/media.ts`](../../../packages/shared/src/media.ts) (`'map'` tab, `geojson`/`kml` formats), **new** `shared/src/media-map.ts` (sources, basemaps, `MapProjectFileSchema`, `MapCaptureRequestSchema`, `MapCaptureFileSchema`, `MapRoadGraphFileSchema`, `MapLayerFileSchema`, `captureWarnings`, `stringifyLayer`), **new** `shared/src/map/` (`mercator.ts`, `geodesy.ts`, `frame.ts`, `dem.ts`, `capture-plan.ts`, `geotiff.ts`, `osm-roads.ts`, `index.ts`, `__fixtures__/`), **new** `shared/src/media-map-mcp.ts`, [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts), [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) (`media.map`), [`shared/src/domain/secrets.ts`](../../../packages/shared/src/domain/secrets.ts), [`shared/src/media-terrain.ts`](../../../packages/shared/src/media-terrain.ts) (`inputs.roadsGraph`, `geo`, `TerrainRoadEdgeSchema.cls/name`), [`shared/src/terrain/road-graph.ts`](../../../packages/shared/src/terrain/road-graph.ts) (`roadGraphFromCapture`, `edgeWidth`), [`shared/src/terrain/road-mask.ts`](../../../packages/shared/src/terrain/road-mask.ts) (**unchanged**, load-bearing: the cyan key), [`shared/src/terrain/heightfield.ts`](../../../packages/shared/src/terrain/heightfield.ts) (**unchanged**, load-bearing: vertex-centred grid), [`shared/src/media-game.ts`](../../../packages/shared/src/media-game.ts) (**unchanged**) |
| Main | **new** `desktop/src/main/media/map/` (`tile-fetch.ts`, `tile-cache.ts`, `tile-protocol.ts`, `overpass.ts`, `capture-service.ts`, `capture-broker.ts`, `map-service.ts`, `map-mcp.ts`), **new** `desktop/src/map-capture-worker/`, [`scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs), **new** `main/ipc/media-map-handlers.ts`, [`main/fs-protocol.ts`](../../../packages/desktop/src/main/fs-protocol.ts), [`main/csp.ts`](../../../packages/desktop/src/main/csp.ts), [`main/media/terrain/terrain-service.ts`](../../../packages/desktop/src/main/media/terrain/terrain-service.ts) (`setRoadsGraph`), [`main/media/terrain/build-pipeline.ts`](../../../packages/desktop/src/main/media/terrain/build-pipeline.ts), [`main/ipc/media-terrain-handlers.ts`](../../../packages/desktop/src/main/ipc/media-terrain-handlers.ts) (`terrainService()` getter), [`main/media/png/png-codec.ts`](../../../packages/desktop/src/main/media/png/png-codec.ts) (**unchanged**, reused), [`main/media/media-store.ts`](../../../packages/desktop/src/main/media/media-store.ts) (**unchanged**, reused), **new** `main/mcp/map-tools.ts`, [`main/mcp/ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts), [`main/mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts), [`main/mcp/index.ts`](../../../packages/desktop/src/main/mcp/index.ts), [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) |
| Renderer | **new** `app/src/features/media/map/` (`map-tab.tsx`, `map-explorer.tsx`, `map-panel.tsx`, `map-canvas.tsx`, `map-canvas-lazy.tsx`, `map-style.ts`, `map-tools.ts`, `map-settings.tsx`, `map-focus.ts`, `kml.ts`, `use-map.ts`), [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts), [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), [`media-page.tsx`](../../../packages/app/src/features/settings/settings-pages/media-page.tsx), [`image-settings.tsx`](../../../packages/app/src/features/media/image/image-settings.tsx) (export `ApiKeyRow`), [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx), [`terrain-panel.tsx`](../../../packages/app/src/features/media/terrain/terrain-panel.tsx), [`weather-api.ts`](../../../packages/app/src/features/weather/weather-api.ts) (`searchLocations` reused), [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts), [`test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts) |
| Tooling | [`eslint.config.mjs`](../../../eslint.config.mjs) (`maplibre-gl` import restriction), [`scripts/skill-copies.test.mjs`](../../../scripts/skill-copies.test.mjs), [`scripts/perf/budgets.json`](../../../scripts/perf/budgets.json) (**unchanged** — the point) |
| Skills | `midnite-media-map-build` in the six skill dirs (`.claude`, `.agents`, `.codex` and the same under `templates/midnite/`) |

## Decisions / open questions

1. **Resolved — default satellite source: EOX Sentinel-2 cloudless 2016 (CC BY 4.0, ≈10 m/px) as
   the keyless, exportable default; MapTiler satellite when a key is set** (recommended, chosen
   unattended 2026-10-07). It is the one open, export-permitted global mosaic; the 2016 vintage is
   pinned because later EOX vintages are CC BY-NC-SA. Any source without explicit export rights is
   display-only (`exportable: false`); the licence read is a Theme J human pass.
2. **Resolved — roads: OSM vector tiles for display, the Overpass API at capture time** (recommended,
   chosen unattended 2026-10-07). One query per capture, rate-limited and attributed to OSM
   contributors, because vector tiles simplify geometry and drop the shared-node connectivity a graph
   needs.
3. **Resolved — projection: a local tangent-plane frame centred on the capture, implemented as
   azimuthal equidistant** (recommended, chosen unattended 2026-10-07). Exact enough for ≤ 65 km
   squares and gives true metres for Terrain; the AEQD form gives a closed-form inverse (Vincenty
   direct) and a projection GDAL/QGIS can read from the GeoTIFF. Capture size is bounded by Terrain's
   limits (65 536 m, 4097 px).
4. **Resolved — tile cache: userData `map-tiles/`, LRU, 1 GB default; DEM and satellite fetched at
   capture zoom, not screen zoom** (recommended, chosen unattended 2026-10-07). Bounded disk use with a
   user-visible cap and Clear action.
5. ✅ **Engine:** MapLibre GL only (user, 2026-10-07).
6. ✅ **Heightmap outputs:** 16-bit PNG at the chosen size, deepest available DEM, plus float `.r32` and GeoTIFF, and a live 3D preview before capture (user, 2026-10-07).
7. ✅ **Roads:** both the rendered mask and the true graph, with Terrain consuming the graph when present (user, 2026-10-07).
8. ✅ **Measure scope:** distance, radius circles, areas, pins, place search, saved layers (user, 2026-10-07).
9. ✅ **MCP:** yes, a small tool set plus a skill (user, 2026-10-07).
10. **Resolved — every tile goes through `mstudio-tile:`, keyless ones too; no tile host joins
    `connect-src`** (recommended, chosen unattended 2026-10-07). One path means one cache for display
    and capture, one place for `User-Agent` and rate limits, and a CSP that stays a short, test-pinned
    list. Supersedes the original Theme A item that added keyless hosts to `connect-src`.
11. **Resolved — the captured road graph is a new optional `inputs.roadsGraph` spec field set by a
    main-only `setRoadsGraph`, not a fourth input slot** (recommended, chosen unattended 2026-10-07).
    `TerrainInputRefSchema.file` is PNG-only by regex and `setInput` takes image bytes; widening the
    slot type would touch every slot consumer for one JSON file.
12. **Resolved — OSM classes survive as optional `cls`/`name` on `TerrainRoadEdgeSchema`; `kind` stays
    width-derived** (recommended, chosen unattended 2026-10-07). Additive and optional, so every
    existing `roads.json` still parses and Theme I export consumers see no change unless a capture fed
    the build.
13. **Resolved — the hand-off calls the terrain service in main, not the renderer IPC chain**
    (recommended, chosen unattended 2026-10-07). The capture already runs in main; round-tripping the
    bytes through the renderer would copy up to ~100 MB across IPC for nothing and would break when
    the Maps tab is closed mid-capture (e.g. an MCP-driven capture).
14. **Resolved — fetch and decode in main, resample and encode in a `map-capture-worker` utility
    process** (recommended, chosen unattended 2026-10-07). JPEG/WebP need `nativeImage`, which a utility
    process lacks (Terrain decodes in main for the same reason); the CPU-heavy 4097² resample and
    GeoTIFF/PNG encode stay off main.
15. **Resolved — satellite and roads are written at Terrain's `textureSize` (2048, or 4096 for a 4097
    capture), not at the heightmap size** (recommended, chosen unattended 2026-10-07). Terrain drapes
    the satellite as a texture at `textureSize`; a 513-px satellite under a 2048 texture would be
    upsampled mush. The hand-off sets `textureSize` to match.
16. **Resolved — `geo` is an explicit optional `TerrainGeoSchema` field, not a passthrough key**
    (recommended, chosen unattended 2026-10-07). Validated on every read, typed for the panel, and still
    additive (`version` stays 1).
17. **Resolved — roads are captured only for frames ≤ 25 km a side** (recommended, chosen unattended
    2026-10-07). A larger Overpass bbox in a city returns hundreds of MB or times out; the heightmap and
    satellite are unaffected, and the warning appears before capture.
18. **Resolved — geodesy is the Theme D kernel (Vincenty on WGS84), not `@turf/*`** (recommended,
    chosen unattended 2026-10-07). `shared` is zod-only, Turf is spherical, and the same function must
    serve the renderer's tools and main's `map_measure`.
19. **Resolved — MCP gating mirrors Terrain: `map_list`/`map_measure` ungated, `map_goto`/
    `map_capture_terrain` behind a new default-off `allowMaps` (`mcp-store` v7)** (recommended, chosen
    unattended 2026-10-07). Reads change nothing; a capture writes files and creates a terrain, and a
    goto moves the user's view.
20. **Resolved — the skill is `midnite-media-map-build`** (recommended, chosen unattended 2026-10-07).
    The copies test only pins `-build` names; the original `midnite-media-map` would have shipped
    unpinned.
21. **Resolved — DEM zoom is the deepest *useful* zoom inside a 1 024-tile budget, not the source's
    maximum** (recommended, chosen unattended 2026-10-07). A 65 km frame at z15 is ~3 000 tiles of
    detail the 4097 grid cannot hold; the rule keeps captures under a minute on a normal connection
    and is recorded as `demZoom` in `capture.json`.
