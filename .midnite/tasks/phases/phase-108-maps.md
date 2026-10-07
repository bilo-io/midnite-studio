# Phase 108 — Maps

Requested by the user · 2026-10-07 · brainstormed with `/midnite-ideate`, grounded against the tree
as of `dbe6e5e3`.

Media gets a seventh tab, **Maps**: an interactive slippy map (MapLibre GL) you can pan, zoom, tilt
into 3D, measure on and draw on. Its headline job is **Capture for Terrain**: frame a square of the
real world, press one button, and get the exact same area as

1. **a heightmap** — real elevation, at the deepest detail the elevation tiles have, as a 16-bit PNG
   (plus a lossless float `.r32` and a GeoTIFF for external tools);
2. **a satellite image** of the same square, at the same resolution;
3. **a roads layer** — both the raster mask Terrain already reads and the real OSM road graph, with
   road classes intact;

…handed straight to a new Phase [105](phase-105-terrain.md) Terrain with `worldSize` and
`heightRange` already set, so the terrain is the right size in metres and the right height in metres.

The second job is a planning surface: point-to-point and multi-leg distances, radius circles between
locations, polygon areas, labelled pins and place search, saved as git-tracked GeoJSON layers.

> **Builds on.**
> - **Media tabs.** `MEDIA_TABS` / `REPO_SCOPED_MEDIA_TABS` in
>   [`shared/src/media.ts`](../../../packages/shared/src/media.ts); `MEDIA_TAB_META` in
>   [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts); the tab body map in
>   [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx). The Terrain tab
>   ([`features/media/terrain/`](../../../packages/app/src/features/media/terrain/)) and Sprites tab
>   ([`features/media/sprite/`](../../../packages/app/src/features/media/sprite/)) are the patterns.
> - **Storage.** [`main/media/media-store.ts`](../../../packages/desktop/src/main/media/media-store.ts)
>   — `.midnite/media/<tab>/<project>/`, `joinWithin`/`confineToRoot` jail, per-root `WriteQueue`,
>   every op a `GitOpResult`.
> - **Terrain inputs (Phase 105).** `TERRAIN_INPUT_SLOTS = ['heightmap','satellite','roads']`, each
>   stored as `inputs/<slot>.png` (`TerrainInputRefSchema {file, sourceName, width, height,
>   bitDepth: 8|16}`); the 16-bit-preserving codec in
>   [`main/media/png/png-codec.ts`](../../../packages/desktop/src/main/media/png/png-codec.ts); the
>   spec in [`shared/src/media-terrain.ts`](../../../packages/shared/src/media-terrain.ts)
>   (`resolution` ∈ 129…4097, `worldSize` 16–65 536 m, `heightRange`, `seaLevel?`, `alignment`,
>   `version: 1` + passthrough); the IPC sequence `terrain-library {op:'create'}` →
>   `terrain-set-input` → `terrain-set-spec` → `terrain-build`
>   ([`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts)), and the
>   `mstudio:media:terrain-open` event that focuses a terrain in its tab. Roads today are derived in
>   main from the mask (hue key → skeleton → graph,
>   [`shared/src/terrain/road-graph.ts`](../../../packages/shared/src/terrain/road-graph.ts)).
> - **Network.** The renderer CSP ([`main/csp.ts`](../../../packages/desktop/src/main/csp.ts)) allows
>   `img-src https:` but pins `connect-src` to a short list (`'self'`, `mstudio-file:`, Open-Meteo,
>   `ipwho.is`) asserted by `csp.test.ts`. Keyed providers fetch in main (image providers under
>   [`main/media/image/`](../../../packages/desktop/src/main/media/image/)).
> - **Secrets.** `SECRET_KEYS` in
>   [`shared/src/domain/secrets.ts`](../../../packages/shared/src/domain/secrets.ts), the vault in
>   [`main/secrets-vault.ts`](../../../packages/desktop/src/main/secrets-vault.ts), set from
>   Settings ▸ Media ([`media-page.tsx`](../../../packages/app/src/features/settings/settings-pages/media-page.tsx)).
> - **Geocoding.** The app already talks to `geocoding-api.open-meteo.com` for weather
>   ([`features/weather/`](../../../packages/app/src/features/weather/)).
> - **MCP.** Terrain's nine `terrain_*` tools
>   ([`main/mcp/terrain-tools.ts`](../../../packages/desktop/src/main/mcp/terrain-tools.ts)) and the
>   `midnite-media-terrain-build` skill (six copies + copies test) are the shape Theme I mirrors.
>
> **Nothing exists yet.** No package depends on maplibre, leaflet, turf, proj4 or geotiff; there is no
> slippy-tile, Web-Mercator or Terrarium code, and Terrain has no lat/lon notion — only metres.
>
> **Scope guardrails.**
> - **One engine: MapLibre GL.** Leaflet/OpenLayers are out; a thin `MapView` seam is noted, not built.
> - **Capture is engine-free.** It runs in main from the frame's bounds and never reads screen pixels,
>   so the heightmap is the same regardless of zoom, tilt or style.
> - **Licences decide exports.** Every source in the catalogue carries its licence, attribution and an
>   `exportable` flag; a capture refuses a non-exportable source with the reason, and every capture
>   writes its attributions next to the files.
> - **Keys never reach the renderer.** Keyed tiles go through a main-side protocol.
>
> **Effort tags:** S ≈ ≤2h · M ≈ 2–6h · L ≈ 1–2 days.

## Headlines

**Theme A — Maps tab and library.** ◻ Not started.

**Theme B — Tile sources, fetched in main.** ◻ Not started.

**Theme C — 3D preview and capture framing.** ◻ Not started.

**Theme D — Heightmap capture.** ◻ Not started.

**Theme E — Satellite and roads capture.** ◻ Not started.

**Theme F — Hand-off to Terrain.** ◻ Not started.

**Theme G — Measure and draw.** ◻ Not started.

**Theme H — Layers.** ◻ Not started.

**Theme I — Maps over MCP, and the skill.** ◻ Not started.

**Theme J — Verification.** ◻ Not started.

## Build order

A → B → (C, D in parallel) → E → F; G → H can run alongside D–F once A lands; I after F and H; J last.
D is the riskiest theme (projection + DEM decode + resampling) and should land before anyone builds UI
on top of a capture.

## A — Maps tab and library (M)

- [ ] `'map'` joins `MEDIA_TABS` and `REPO_SCOPED_MEDIA_TABS` in [`shared/src/media.ts`](../../../packages/shared/src/media.ts), with `MEDIA_TAB_EXPORT_FORMATS`, `MEDIA_TAB_META` (`LuMap`), the `media-view.tsx` body and `MEDIA_LAYOUT_KEYS` entries; storage at `.midnite/media/map/<project>/`.
- [ ] `maplibre-gl` added to `packages/app` and **lazy-loaded with the tab** (its own chunk; `scripts/perf/bundle-report.mjs` shows the entry chunk unchanged).
- [ ] `packages/app/src/features/media/map/`: `map-tab.tsx`, `use-map.ts`, `map-explorer.tsx` (projects + layers), `map-canvas.tsx` (MapLibre host, resize-observed, disposed on unmount — no WebGL context leak).
- [ ] Basemap picker: Streets (OSM vector), Satellite, Terrain (hillshade), Dark; attribution control always visible and correct for the active sources.
- [ ] Last viewport (centre, zoom, bearing, pitch, style) persisted per project in `map.json`; reopening restores it.
- [ ] CSP: the default (keyless) tile hosts added to `connect-src` in [`main/csp.ts`](../../../packages/desktop/src/main/csp.ts) with `csp.test.ts` updated; keyed hosts are **not** added (they go through Theme B's protocol).
- [ ] Empty, loading and offline states: no network → a clear "Map tiles need a network connection" panel instead of a grey canvas; tile errors counted, not spammed to the console.

## B — Tile sources, fetched in main (M)

- [ ] `MAP_SOURCES` catalogue in `shared/src/media-map.ts`: id, kind (`dem` | `satellite` | `vector` | `basemap`), URL template, min/max zoom, tile size, encoding (`terrarium` | `terrain-rgb` | `png` | `mvt`), licence, attribution string, `exportable`, `requiresKey?`.
- [ ] Keyless defaults: AWS Terrain Tiles (Terrarium) for DEM, an OSM-derived vector source for streets/roads, and an exportable open imagery source for satellite (Decision 1).
- [ ] Optional MapTiler key: `media.mapTilerApiKey` in `SECRET_KEYS`, a field on Settings ▸ Media, unlocking MapTiler satellite, Terrain-RGB DEM and styles.
- [ ] `mstudio-tile://<source>/<z>/<x>/<y>` protocol in main that injects keys, caches and serves tiles to MapLibre — the key never appears in the renderer, its URLs or its logs.
- [ ] Main-side tile fetcher `main/media/map/tile-fetch.ts`: concurrency cap, retry with backoff, per-host rate limit, `User-Agent` per provider policy, abortable; returns `GitOpResult`-style envelopes, never throws across IPC.
- [ ] Disk cache under userData (`map-tiles/`), LRU-capped (default 1 GB, Settings ▸ Media slider), with a "Clear map cache" action and size readout.

## C — 3D preview and capture framing (S/M)

- [ ] 3D toggle: MapLibre `setTerrain` from the active DEM source + hillshade layer, exaggeration slider (1×–3×), pitch/bearing controls.
- [ ] Capture frame overlay: a square that stays square in **metres** (not pixels) as you pan/zoom/tilt, draggable/resizable, with a live readout — side length (m/km), centre lat/lon, min/max elevation sampled, chosen output size and resulting metres-per-pixel.
- [ ] Output size picker matching Terrain's resolutions (129 … 4097) and a warning when the frame exceeds Terrain's 65 536 m `worldSize` cap or the DEM can't resolve the chosen metres-per-pixel.
- [ ] Keyboard: arrow keys pan, `+`/`-` zoom, `F` toggles the frame, `T` toggles 3D; all controls reachable and labelled.

## D — Heightmap capture (L)

- [ ] `shared/src/map/` pure kernel (no electron, vitest-only): Web-Mercator ↔ lat/lon, tile maths, local tangent-plane (ENU) projection centred on the frame so the output square is in true metres (Decision 3).
- [ ] DEM decode: Terrarium (`(R·256 + G + B/256) − 32768`) and Mapbox Terrain-RGB (`−10000 + (R·65536 + G·256 + B)·0.1`), with no-data handling.
- [ ] Deepest-zoom selection: fetch the DEM at the deepest zoom the source offers for the area (Terrarium ≈ z15), not the screen zoom; stitch tiles, then bilinear/bicubic resample onto the 2ⁿ+1 grid in the ENU square.
- [ ] Outputs into `.midnite/media/map/<project>/captures/<name>/`: `heightmap.png` (16-bit greyscale, min→0, max→65535), `heightmap.r32` (little-endian float32 metres), `heightmap.tif` (single-band float32 GeoTIFF with the frame's bounds), and `capture.json` (bbox, centre, side metres, metres/px, min/max metres, source ids, zoom, attributions, timestamp).
- [ ] Runs in a worker or utility process with progress events and cancel; a 4097² capture does not block main or the renderer.
- [ ] Golden tests: a fixture set of Terrarium tiles decodes to known heights; a frame straddling a tile seam has no visible seam; a frame near ±60° latitude keeps true metres.

## E — Satellite and roads capture (L)

- [ ] Satellite: stitched at the matching zoom for the chosen metres/px from the selected exportable source, reprojected onto the same ENU square, written as `satellite.png`; refuses non-exportable sources with the licence reason.
- [ ] Roads graph: OSM road ways for the frame bbox (Decision 2), clipped and projected to frame metres, written as `roads.graph.json` in Terrain's `roads.json` node/edge shape with `class` (motorway … track), `name?`, `lanes?`, `width` estimated per class.
- [ ] Roads mask: the same graph rasterised to `roads.png` at the output size, light-on-dark with per-class width, matching the hue/luminance key Terrain's mask reader expects.
- [ ] Partial results are explicit: if satellite or roads fail, the heightmap still lands and `capture.json` lists what is missing and why.

## F — Hand-off to Terrain (M)

- [ ] "Capture for Terrain" button: runs D + E, then creates a terrain via the existing IPC (`terrain-library {op:'create'}` → `terrain-set-input` ×3 → `terrain-set-spec` → optional `terrain-build`), named after the place or coordinates.
- [ ] Spec auto-fill: `worldSize` = frame side in metres, `heightRange` = [min, max] metres, `resolution` = output size, `seaLevel` = 0 when the frame contains sea, `alignment` identity.
- [ ] Terrain gains an optional captured-graph path: when `inputs/roads.graph.json` exists, Terrain uses it instead of re-skeletonising the mask, so road classes, names and widths survive (Phase 105 `road-graph` unchanged for mask-only inputs).
- [ ] `terrain.json` records a `geo` block (centre, bbox, side metres, capture id, attributions) via the passthrough schema; the Terrain detail pane shows "Captured from Maps" with a link back to the frame.
- [ ] After hand-off, `mstudio:media:terrain-open` focuses the new terrain in the Terrain tab.

## G — Measure and draw (M)

- [ ] Distance tool: click points to build a path; each leg and the running total shown as great-circle distance; drag vertices to adjust; units m/km/mi (Settings ▸ Media).
- [ ] Radius circles: drop at a point, set radius by typing or dragging, label and colour; several circles; geodesic (not screen) circles; centre-to-centre distance between selected circles.
- [ ] Areas: polygon tool with area (m²/ha/km²) and perimeter.
- [ ] Pins: labelled markers with notes.
- [ ] Place search via the Open-Meteo geocoder the app already allows; results fly the map there.
- [ ] Geodesy from a small, typed dependency (e.g. `@turf/*` modules) or the Theme D kernel — no hand-rolled haversine drift; unit-tested against known distances.

## H — Layers (S/M)

- [ ] Drawings are features in named layers saved as `.midnite/media/map/<project>/layers/<name>.geojson` (git-tracked, stable key order so diffs are readable).
- [ ] Layer list in the explorer: toggle visibility, rename, recolour, delete (Trash), reorder.
- [ ] Import a `.geojson`/`.kml` file as a layer; export a layer as GeoJSON or KML.
- [ ] External edits to a layer file are picked up on `media:changed`.

## I — Maps over MCP, and the skill (M)

- [ ] Tools `map_goto` (place or lat/lon + zoom), `map_capture_terrain` (centre + side metres + size → capture id and, optionally, a terrain), `map_measure` (points → distances; centre + radius → circle), `map_list` (projects, captures, layers), registered with the midnite MCP server.
- [ ] Behind a Settings ▸ MCP "Maps" switch (default off), same gating as the Terrain tools; tool descriptions ≤ 220 chars; the tool-registry test lists them.
- [ ] `midnite-media-map` skill (frame an area, pick a size, capture, hand off, check the build) in all six skill dirs, pinned by the skill copies test.

## J — Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Kernel goldens (D) and roads-graph tests (E) pass under bare vitest with no network.
- [ ] Bundle report shows MapLibre in its own lazy chunk and the entry chunk within budget.
- [ ] Screenshots: the Maps tab in 2D and 3D, the capture frame with its readout, measure + circles, and the resulting terrain in the Terrain tab (dark + light).
- [ ] Human pass: capture a known mountain (e.g. Table Mountain) at 1025 and 4097; the built terrain's peak height and footprint match the real world within the DEM's accuracy.
- [ ] Human pass: a capture with the optional MapTiler key set, confirming the key never appears in renderer devtools (network panel, URLs, console).

## Deferred

Nothing deferred yet.

## Not in this phase

- Leaflet or OpenLayers engines (a `MapView` adapter seam may be noted in code comments only).
- Directions / routing, live GPS or device location.
- Offline tile packs and pre-downloading regions.
- Capturing buildings, water or land-use polygons (Terrain's satellite classifier still derives them).
- Importing GeoTIFF directly into Terrain (Terrain keeps reading the 16-bit PNG).

## Files this phase touches

| Area | Files |
|---|---|
| Shared contract | [`shared/src/media.ts`](../../../packages/shared/src/media.ts), new `shared/src/media-map.ts`, new `shared/src/map/` kernel, [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`shared/src/domain/secrets.ts`](../../../packages/shared/src/domain/secrets.ts), [`shared/src/media-terrain.ts`](../../../packages/shared/src/media-terrain.ts) (`geo` block, captured graph) |
| Main | new `desktop/src/main/media/map/` (tile-fetch, cache, protocol, capture), [`main/csp.ts`](../../../packages/desktop/src/main/csp.ts), [`main/media/terrain/terrain-service.ts`](../../../packages/desktop/src/main/media/terrain/terrain-service.ts), new `main/mcp/map-tools.ts`, [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) |
| Renderer | new `app/src/features/media/map/`, [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts), [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), [`media-page.tsx`](../../../packages/app/src/features/settings/settings-pages/media-page.tsx), [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) |
| Skills | `midnite-media-map` in the six skill dirs |

## Decisions / open questions

1. **Default satellite source.** *Recommend:* an openly licensed, export-permitted mosaic (e.g. EOX Sentinel-2 cloudless 2016, CC BY 4.0, ≈10 m/px) as the keyless default, with MapTiler satellite (sharper) when a key is set. Confirm the licence text before shipping; any source without explicit export rights is display-only (`exportable: false`).
2. **Roads source.** *Recommend:* OSM vector tiles for display; the Overpass API at capture time for real connected ways with `highway=*` classes (rate-limited, one query per capture, attributed to OSM contributors). Vector tiles alone simplify geometry and drop connectivity.
3. **Projection.** *Recommend:* a local tangent plane (ENU) centred on the frame — exact enough for ≤ 65 km squares and gives true metres for Terrain. ✅ Settled: capture size is bounded by Terrain's limits (65 536 m, 4097 px).
4. **Tile cache.** *Recommend:* userData, LRU 1 GB default; DEM and satellite fetched at capture zoom, not screen zoom.
5. ✅ **Engine:** MapLibre GL only (user, 2026-10-07).
6. ✅ **Heightmap outputs:** 16-bit PNG at the chosen size, deepest available DEM, plus float `.r32` and GeoTIFF, and a live 3D preview before capture (user, 2026-10-07).
7. ✅ **Roads:** both the rendered mask and the true graph, with Terrain consuming the graph when present (user, 2026-10-07).
8. ✅ **Measure scope:** distance, radius circles, areas, pins, place search, saved layers (user, 2026-10-07).
9. ✅ **MCP:** yes, a small tool set plus a skill (user, 2026-10-07).
