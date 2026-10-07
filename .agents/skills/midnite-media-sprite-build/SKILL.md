---
name: midnite-media-sprite-build
description: Build 2D game assets in Midnite Studio's Media ▸ Sprites page through the sprite tools on the midnite MCP server — pick a method, generate a sprite sheet as a job, poll it, read the badges, re-roll bad frames, preview the motion, make tilesets, parallax backgrounds and Tiled maps, export. Use when the user wants sprites, animations, tiles, backgrounds or a level map for a 2D game.
---

# Media ▸ Sprites — build

A sprite asset is a folder with a `sprite.json` spec. The app generates, normalises (keyed, aligned on one anchor, one scale per direction), validates and packs the frames itself. Never hand-write frames, atlases or `.tmj` files; edit the spec and run jobs.

## Layout

```
<repo>/.midnite/media/sprite/<group>/<asset>/
  sprite.json            the spec — the source of truth (kind: sheet, tileset, background, prop-sheet, map)
  reference/             hand-drawn's locked reference image
  frames/<clip>/<dir>/<nnn>.png   normalised frames;  frames/frames.json  badges, anchor nudges, flips
  tileset.png/.tsj · layers/*.png + background.json · props/<name>/000.png · map.tmj (+ its images)
  export/                the last pack (what a game imports)
```

Groups are fixed: `characters`, `objects`, `tilesets`, `backgrounds`, `maps`. `sprite_list` returns each asset's folder name; every other tool takes `repoPath`, `group` and `asset`.

## Tools (server `midnite`, i.e. `mcp__midnite__<tool>`)

The user must enable Settings ▸ MCP and **"Let agents edit sprites and maps"**. Without it the reads, `sprite_job_status` and the previews still work; everything that changes an asset, starts or cancels a job or exports refuses with a named reason — ask the user to turn it on.

| Tool | Use |
|---|---|
| `sprite_list` | what exists, by group, and whether it is built |
| `sprite_get_spec` | the live spec **and the schema of every kind**, plus a hint about the next step — fetch before writing |
| `sprite_set_spec` | patch a spec: top-level keys replace the stored ones whole; invalid values come back as `errors` with paths |
| `sprite_recommend_method` | which of `hand-drawn`, `rendered`, `one-shot` fits — for a stored sheet or a draft `spec` |
| `sprite_generate` | start a sheet (or prop sheet) job — on an asset, or `spec` to create one; `clips` for some; `turnaround` / `approveReference` for hand-drawn |
| `sprite_job_status` | `running` / `done` / `failed` / `cancelled`, progress, and the reason |
| `sprite_get_report` | the badged frames and the rule each broke |
| `sprite_regenerate_frames` | re-roll named frames (`<clip>/<dir>/<nnn>`) |
| `sprite_patch_frames` | `move`, `delete`/`restore`, `flip`, `nudge` the anchor, or `reroll` |
| `sprite_render_preview` | a contact sheet per clip, and with `animate: "<clip>"` one APNG — look at the motion |
| `sprite_cancel` | stop a job; frames already written stay |
| `tileset_generate` | seamless terrain bases + composited autotile transitions → `tileset.png`, `tileset.tsj` |
| `background_generate` | parallax layers (wrapping, cut out) → `layers/*.png`, `background.json` |
| `map_generate` | the layout engine writes regions, rooms, paths, spawn and exits from the prompt; filled into `map.tmj` |
| `map_get` / `map_patch` | read the layout and layer sizes; paint cells (`set`), place `object`s, `refill` |
| `sprite_export` | write the pack, optionally also into a repo folder (`dest`); never overwrites |
| `sprite_open` | show an asset in the app window |

## Method choice — call `sprite_recommend_method` first

- **hand-drawn** — side-scrollers, painterly or hand-drawn styles. Frame by frame against a locked reference. Two steps: `sprite_generate` with `turnaround: true`, look at it with `sprite_render_preview` or ask the user, then `sprite_generate` with `approveReference: true`. Needs a provider that takes a reference image (Gemini image models, OpenAI).
- **rendered** — top-down and isometric with 4 or 8 directions, where every direction must match. Needs a rigged Models character as the sheet's `reference` (`{ kind: "model", project, path }`, set in the app) and the Midnite Studio window open: frames are rendered there. Costs no image requests.
- **one-shot** — the whole sheet as one image, sliced. Fast when it works; at most 8 frames × 8 rows. If grid detection disagrees with the request the job fails and nothing is sliced — re-run that clip hand-drawn (`method: "hand-drawn"`).

## The job loop

1. `sprite_generate` (or `tileset_generate`, `background_generate`, `map_generate`) → `{ jobId, group, asset, requests }`. It returns at once.
2. Poll `sprite_job_status` **about every 10 s** until it is no longer `running`. Read `message` on `failed` — and on `done`, where it carries notes (e.g. "Consistency not checked").
3. `sprite_get_report` → the flagged frames: `empty`, `clipped`, `height`, `drift`, `inconsistent`, `grid`. `unchecked` only means no vision model ran.
4. `sprite_regenerate_frames` with the flagged keys, poll again. Small offsets are cheaper as `sprite_patch_frames` `nudge`s; a mirrored pose as a `flip`.
5. `sprite_render_preview` with `animate` and actually look at the APNG before calling it done.

**Spend cap.** One job may make at most **200** provider requests counting every possible re-roll (frames × directions × (1 + reroll budget)). A larger job is refused up front with the count: generate a few `clips` at a time, fewer directions, or lower `consistency.rerollBudget`.

**One job per asset.** A second job on a busy asset is refused; spec edits and exports are too until it ends.

## Environments

- **Tileset**: `terrains` (2–8, each `{ id, label, prompt, collision: walkable | solid | water }`), `transitions` (`{ a, b }` — `b` painted over `a`), `scheme` `blob47` (Tiled mixed) or `corner16`, `projection` `orthogonal` or `isometric`, `tileSize` 16/32/48/64. Transitions are composited, so edges always match.
- **Background**: 3–5 `layers` back to front, each `{ name, prompt, scrollFactor 0–1 }`; `sky` stays opaque.
- **Prop sheet**: `props` (`{ name, prompt }`) in one `cell` size; maps scatter them as decorations.
- **Map**: needs a built `tileset` (an asset in `tilesets`) and an `engine` (`{ kind: "ollama", model }` or `{ kind: "agent", agentId }`); `size` is what the engine is asked for. The layout may only use the tileset's terrain ids — a wrong one comes back for repair, twice at most. Orientation follows the tileset. Edit with `map_patch` rather than regenerating: `set` paints a cell, `object` adds or moves a `spawn`/`exit`/`point` by name, both re-autotile.

## Export — what Phase 107's Phaser kit reads

`sprite_export` writes `export/` inside the asset and, with `dest`, a `<name>.<kind>/` folder:

- **sheet / prop sheet → `<name>.sprite/`**: `atlas.png` + `atlas.json` — Phaser's JSON-hash atlas and Aseprite JSON at once (`frameTags` per `<clip>/<dir>`) — and `anims.json` for `this.anims.fromJSON` (no anims for props). Past one page it is a Phaser multiatlas and Aseprite tags are dropped (a warning says so).
- **tileset → `<name>.tileset/`**: `tileset.png`, `tileset.tsj` (collision as a string property per tile, wangsets for Tiled).
- **background → `<name>.background/`**: `layers/*.png`, `background.json` (`scrollFactor` per layer).
- **map → `<name>.map/`**: `map.tmj` with every tileset **embedded** (Phaser's `load.tilemapTiledJSON` cannot follow external `.tsj`), its images (`tileset.png`, `collision.png`, `props.png`) and `tileset.tsj`. Layers: `ground`, `decoration`, `collision` (hidden, tiles carry `collision`) and `objects` (spawn, exits, points).

A game imports a pack with `game_import_asset`.

## Conventions

- `kind`, `reference`, `version`, `lastReport`, `oneShot` and the timestamps are managed by the app and rejected in a patch.
- `dest` must stay inside the repository; an existing pack is never overwritten.
- Applied or rejected-with-reasons comes back on every write; read `errors` before retrying.

## Hand-off to the UI

Finish with `sprite_open` so the user lands on the asset in **Media ▸ Sprites**, where they can scrub the previewer, fix frames in the strip, pan the map and export.
