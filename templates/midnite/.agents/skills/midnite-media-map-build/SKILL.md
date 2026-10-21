---
name: midnite-media-map-build
description: Frame a real place in Midnite Studio's Media ▸ Maps page through the map_* tools on the midnite MCP server — find it, measure it, pick a size, capture its heightmap, satellite image, roads and buildings, and hand them to a new Terrain. Use when the user wants real-world ground for a game, or distances and areas on a map.
---

# Media ▸ Maps — frame, capture, hand off

Maps is an interactive slippy map. Its headline job is **Capture for Terrain**: a square of the real world becomes a 16-bit heightmap, a satellite image, a roads layer and building footprints with heights, handed to a new Terrain with `worldSize` and `heightRange` already set in metres. Never fetch tiles or write heightmaps by hand; call the tools.

## Layout

```
<repo>/.midnite/media/map/<project>/        (the default project is "maps")
  map.json            the last view, basemap, layer order
  captures/<name>/    heightmap.png (16-bit) · .r32 (float metres) · .tif · capture.json · ATTRIBUTION.txt
  layers/<name>.geojson   pins, paths, circles and areas the user drew
```

## Tools (server `midnite`, i.e. `mcp__midnite__<tool>`)

The user must enable Settings ▸ MCP and "Let agents capture maps". Without it `map_list` and `map_measure` still answer; `map_goto` and `map_capture_terrain` refuse with a named reason.

| Tool | Use |
|---|---|
| `map_list` | projects, their captures (centre, side, heights, layers present) and GeoJSON layers; takes `repoPath` |
| `map_measure` | `points` → each leg and the total in metres; `center` + `radiusM` → a ring of lon/lat vertices, its circumference and area. On the WGS84 ellipsoid; no repo needed |
| `map_goto` | fly the Maps tab to a `place` name or a `center` `[lon, lat]` at a `zoom`, so the user sees it |
| `map_capture_terrain` | capture `center` + `sideM` + `size`, and by default hand off to a new Terrain; `build: true` also builds it |

Coordinates are always `[longitude, latitude]`.

## Loop

1. `map_list` — a capture of that place may already exist; reuse it instead of fetching again.
2. `map_goto` with a `place` so the user is looking at what you are about to capture. If the name matches nothing, pass `center`.
3. Pick the frame with `map_measure` if the user gave you landmarks: measure between two of them to learn how wide the area is. The frame is a north-up square; `sideM` is its side in metres, 16 to 65 536.
4. Pick `size`, the heightmap samples per side: 129, 257, 513, 1025, 2049 or 4097. Capture resolution is metres per pixel = `sideM` / (`size` − 1); keep it near the elevation data's own detail (about 10 m at best), or the extra pixels are interpolation. Iterate small, capture big once.
5. `map_capture_terrain`. It takes a while (hundreds of tiles) and cannot run twice at once; a second call while one runs answers "A capture is already running."
6. Read the answer: `capture` has the real `heightMinM`/`heightMaxM`, `missing` names any layer that could not be produced and why, and `terrain` is the new Terrain's `project` and `terrain`.

## Limits worth knowing

- **Roads are captured for frames up to 25 km a side**; a larger frame still gets its heightmap and satellite image, with roads listed under `missing`.
- **Buildings are captured for frames up to 10 km a side** (OSM building ways with `height` / `building:levels`; the rest get a height from Terrain's `buildings.height` range). A larger frame lists buildings under `missing`; pass `buildings: false` to skip them. In Terrain they are the same toggleable buildings layer (viewer, `terrain_export`'s `buildings` option) as buildings traced from a satellite image.
- **Terrain's largest world is 65.5 km** (65 536 m). The tool refuses a larger `sideM`.
- Only sources marked exportable are captured; display-only sources never feed a capture. Satellite and roads need nothing extra on the keyless sources; MapTiler needs the user's key in Settings ▸ Media, which you never see.
- A frame that is mostly sea has a flat heightmap; check `hasSea` and the height range before building.
- Tile fetching uses the user's connection and the free tile servers' fair-use limits: do not loop captures.

## Hand-off

The capture's output is a Terrain, so the build / look / adjust / export loop belongs to **`midnite-media-terrain-build`**: continue with `terrain_get_spec`, `terrain_build` (unless you passed `build: true`), `terrain_render_preview` and `terrain_export`. Finish with `terrain_open` so the user lands on the terrain.
