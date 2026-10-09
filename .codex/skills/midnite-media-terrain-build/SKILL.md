---
name: midnite-media-terrain-build
description: Build a terrain in Midnite Studio's Media ▸ Terrain page through the terrain_* tools on the midnite MCP server — attach a heightmap, satellite image and roads mask (or choose noise), set the spec, build, look at the previews, adjust, export. Use when the user wants a landscape made, changed or exported for a game engine.
---

# Media ▸ Terrain — build

A terrain is a structured `TerrainSpec` plus up to three input images (a heightmap, a satellite image, a roads mask). The app validates the spec and builds the ground itself: heights, a land-cover map, foliage and building placements, road cuts, and LOD'd chunks. Never hand-write the files; edit the spec and attach images.

## Layout

```
<repo>/.midnite/media/terrain/<project>/<terrain>/
  terrain.json        the spec — the source of truth
  inputs/             the attached images, as PNGs
  build/              the last build (heights, land cover, chunks, placements)
  export/             what terrain_export wrote by default
```

`terrain_list` returns the terrains; every other tool takes `repoPath`, `project` and `terrain` (the folder name `terrain_list` returns).

## Tools (server `midnite`, i.e. `mcp__midnite__<tool>`)

The user must enable Settings ▸ MCP and "Let agents edit terrains". Without it the read tools and the preview still work; the others refuse with a named reason.

| Tool | Use |
|---|---|
| `terrain_list` | what exists, and which are built |
| `terrain_get_spec` | the live spec **and its schema** — fetch before writing |
| `terrain_set_spec` | patch the spec: top-level keys replace the stored ones whole; invalid values come back with their paths |
| `terrain_set_input` | attach (`path`, inside the repo), generate (`prompt` + `provider` + `model`, heightmap only) or detach (`remove`) one of `heightmap`, `satellite`, `roads` |
| `terrain_build` | run the build; answers `needs-height-source` instead of picking noise for you |
| `terrain_render_preview` | five views: `top`, `landcover`, `roads`, `oblique`, `horizon`; 128–768 px |
| `terrain_get_stats` | resolution, vertex and chunk counts, height range, histogram, warnings |
| `terrain_export` | write a `terrain-pack` folder (manifest, heightfield, chunks, placements) or a `glb`; never overwrites an existing pack |
| `terrain_open` | show a terrain in the app window |

## Loop

1. `terrain_get_spec` for the schema and a hint about what is missing.
2. Give the ground a source: `terrain_set_input` a heightmap, or `terrain_set_spec` a `noise` block. A build with neither is refused with `needs-height-source` — ask the user or choose, never assume.
3. Attach `satellite` (drives land cover, foliage and the drape) and `roads` if the user has them. A terrain handed over by `map_capture_terrain` may also carry real OSM building footprints (`terrain_get_spec` lists `buildings` among the attached inputs); the build then raises those instead of tracing buildings off the satellite image, into the same `buildings` layer.
4. `terrain_set_spec` for `resolution` (129, 257, 513, 1025, 2049 or 4097), `worldSize` (metres per side), `heightRange` (metres, `[min, max]`), `seaLevel`, and the `foliage`, `buildings` and `roads` blocks.
5. `terrain_build`, then `terrain_render_preview` and actually look. A view that lacks its layer comes back as a height ramp with a note saying why.
6. Adjust with `terrain_set_spec` and rebuild; repeat until it reads right. Keep resolution low while iterating, raise it for the final build.
7. `terrain_export`: `terrain-pack` for a game engine (the manifest lists every file, relative), `glb` for a single viewable model (`lod` 0–3, `texture` `drape`, `splat-bake` or `none`, with `foliage`, `roads` and `buildings` toggles).

## Conventions

- Image paths are repo-relative and must stay inside the repository; so must an export `dest`.
- `inputs`, `version`, `lastBuild`, `createdAt` and `updatedAt` are managed by the app and rejected in a patch.
- Applied or rejected-with-reasons comes back on every write; read the `errors` before retrying.
- Builds and renders can take seconds; do not fire them in parallel on one terrain.

## Hand-off to the UI

Finish with `terrain_open` so the user lands on the terrain in **Media ▸ Terrain ▸ `<project>`**, where they can orbit it, paint land cover and roads, and export.
