# Phase 106 — 2D Assets: sprites, animation and environments

Requested by the user · 2026-10-04 · grounded against the tree as of `a51a3b05`.

Media gets a seventh tab, **Sprites**: precise 2D game assets. It has two halves.

1. **Characters and objects as sprite sheets.** Every animation clip (idle, walk, run, jump, attack…)
   is generated, normalised so frames line up on a shared anchor, packed into an atlas, and previewed
   in an animation player before anything leaves the app. There are three ways to make a sheet, and
   the form recommends one based on the kind of game:
   - **Hand-drawn.** Frame by frame from a locked reference character. Recommended for side-scrolling
     platformers and painterly styles.
   - **Rendered from 3D.** A rigged Models character (Phase 103 clips) is rendered from 1, 4 or 8
     directions into frames, the way pre-rendered classics such as Diablo were made. Recommended for
     top-down and isometric games, where 8-direction consistency matters.
   - **One-shot sheet.** The whole sheet is generated as one image under a strict system prompt, then
     sliced and validated. Fast when it works. It is behind a simple form toggle.
2. **Environments.** Autotiling tilesets, isometric tiles, parallax backgrounds, prop sheets, and whole
   maps saved as Tiled `.tmj`, which Phaser loads natively.

This is the second of three phases: **[105](phase-105-terrain.md) Terrain → 106 2D Assets →
[107](phase-107-games.md) Games**. Phase 107's Phaser kit consumes exactly what this phase exports
(atlas JSON with animation tags, Tiled tilesets and maps). As in 105, the export contract is in scope.

> **Builds on.**
> - **Images.** [`main/media/image/image-service.ts`](../../../packages/desktop/src/main/media/image/image-service.ts)
>   (`createImageService`, provider adapters for Gemini, OpenAI, `agy` and Ollama; ids in
>   `IMAGE_PROVIDER_IDS` in [`shared/src/media.ts`](../../../packages/shared/src/media.ts)). Every
>   generated frame, tile and background goes through `generate()`. A provider that cannot take a
>   reference image is disabled for reference-locked modes, with the reason shown.
> - **Models.** Phase 103's rig and clips
>   ([`model-geometry/rig.ts`](../../../packages/shared/src/model-geometry/rig.ts), `skin.ts`, the
>   Animation inspector tab) and the R3F scene in
>   [`app/features/media/model/editor-scene.tsx`](../../../packages/app/src/features/media/model/editor-scene.tsx)
>   for the rendered-from-3D method.
> - **Terrain.** Phase 105's heightfield, splat and `terrain.manifest.json`, rendered down to top-down
>   or isometric tiles and maps.
> - **Engines.** [`main/media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts),
>   used for the vision consistency check (does this frame still look like the reference?) and for
>   map layout specs written by an LLM.
> - **Media tabs and storage**, exactly as Phase 105 Theme A uses them: `MEDIA_TABS`, the
>   `Record<MediaTab, …>` tables, `MEDIA_LAYOUT_KEYS`, and
>   [`media-store.ts`](../../../packages/desktop/src/main/media/media-store.ts).
> - **The MCP recipe** of the `model_*` family (schemas in `shared`, `dispatch.ts`, a
>   `main/mcp/<x>-tools.ts` gate and binder, the shim's slow-tool predicate, and a switch in
>   [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx)).
>
> **Scope guardrails.**
> - **Raster only.** No skeletal 2D (Spine, DragonBones) and no vector art. Frames are PNG.
> - **Not a pixel editor.** Per-frame fixes are re-roll, delete, reorder, nudge the anchor, and flip.
>   Painting individual pixels belongs in a real editor (Aseprite), which reads our export.
> - **Formats are the ones engines already read:** a PNG atlas plus Phaser's JSON-hash atlas,
>   Aseprite-style JSON with `frameTags`, and Tiled `.tsj`/`.tmj`. No bespoke format leaves the app.
> - **Package boundaries hold.** Packing, slicing, alignment, autotile and map fill are pure TS in
>   `shared`. Image decode and encode, and file I/O, live in desktop main. Rendering and the previewer
>   live in `app`.
>
> **Effort tags:** **S** ≤ half a day · **M** 1–2 days · **L** 3+ days, likely 2–3 PRs.

## Headlines

_Precise 2D assets, generated, aligned, packed and played back before a game ever loads them._ Image
models are good at single pictures and bad at consistent frame grids. This phase owns that gap, with
three generation methods behind one normalisation pipeline, an animation previewer, and environments
that autotile. Planned 2026-10-04.

**Theme A — Sprites tab, specs and library.** ◻ Not started. Lands first.

**Theme B — Frame pipeline: background removal, alignment, pixel-art mode.** ◻ Not started. Lands with A.

**Theme C — Method picker and the recommendation.** ◻ Not started.

**Theme D — Hand-drawn: reference-locked frame generation.** ◻ Not started.

**Theme E — Rendered from a Models character.** ◻ Not started.

**Theme F — One-shot sheet (form toggle).** ◻ Not started.

**Theme G — Atlas packing and the animation previewer.** ◻ Not started.

**Theme H — Tilesets with autotiling.** ◻ Not started.

**Theme I — Isometric tiles, parallax backgrounds and prop sheets.** ◻ Not started.

**Theme J — Maps as Tiled `.tmj`.** ◻ Not started.

**Theme K — Sprites over MCP, and the skill.** ◻ Not started.

**Theme L — Verification.** ◻ Not started.

## Build order

1. **A + B + G** (foundation): tab, specs, the shared frame pipeline, and the packer with the previewer.
   Every method feeds them.
2. **C**, then **D · E · F** in parallel. Each method is a frame source into B.
3. **H** in parallel with the methods. **I** after H, since it reuses H's seamless and edge machinery.
   **J** after H.
4. **K** last.

## A — Sprites tab, specs and library (M)

- [ ] `'sprite'` added to `MEDIA_TABS`, labelled **Sprites**, with every `Record<MediaTab, …>` the compiler flags filled in (`MEDIA_TAB_META` with a `react-icons/lu` glyph, `TAB_BODY`, `MEDIA_TAB_EXPORT_FORMATS`), `MEDIA_LAYOUT_KEYS` plus two `LayoutSizes` keys, and listed in `REPO_SCOPED_MEDIA_TABS`
- [ ] Schemas in a new `shared/src/media-sprite.ts`:
  - `SpriteSheetSpecSchema`:
    - `name`, `style` (`pixel`, `hand-drawn`, `painterly`, `flat`)
    - `targetPerspective` (`side`, `top-down`, `isometric`, `front`)
    - `frameSize` `[w, h]`, `directions` (1, 4 or 8), `anchor` (default bottom-centre)
    - `palette` (optional, pixel mode)
    - `method` (`hand-drawn`, `rendered`, `one-shot`)
    - `clips[]`, each with `name`, `frames`, `fps`, `loop` (`loop`, `once`, `ping-pong`) and an optional pose table
    - `reference` (an image ref, or a Models asset ref for the rendered method)
  - `TilesetSpecSchema`, `BackgroundSpecSchema` and `MapSpecSchema`, filled in by H, I and J
- [ ] Library layout `.midnite/media/sprite/<group>/<asset>/`:
  - `sprite.json` (spec, source of truth)
  - `reference/`
  - `frames/<clip>/<dir>/<n>.png` (normalised frames, the editable truth)
  - `export/` (atlas PNG + JSON)
  - a summary in the library manifest

  Groups are shown as **Characters**, **Objects**, **Tilesets**, **Backgrounds** and **Maps**
- [ ] Create panel with two modes, **Sheet** and **Environment**, which swap the form below the shared prompt input (`prompt-input.tsx`)
- [ ] `mstudio:media:sprite-*` IPC channels with `GitOpResult` envelopes and progress events. Generation is cancellable
- [ ] Vitest: schema defaults and round trip, the tab registers, and the explorer groups seeded assets via the mock bridge

## B — Frame pipeline: background removal, alignment, pixel-art mode (M/L)

What makes a sheet *precise*, whichever method produced the frames.

- [ ] **Background removal**:
  - use the provider's alpha when it returns one
  - otherwise generation asks for a flat chroma background (magenta `#ff00ff`, or green if the subject is magenta) and the pipeline keys it out with despill and a 1px edge clean-up
- [ ] **Normalisation per frame**: crop to the alpha bounds, scale so the character's height matches the clip's reference height (taken from the first idle frame), and place on the shared anchor:
  - horizontal centroid of the lower body band
  - baseline at the lowest opaque row

  This is what stops a walk cycle from jittering
- [ ] **Pixel-art mode**: nearest-neighbour downscale to the frame size, palette quantisation (median cut, or a fixed palette from the spec), optional 1px outline, and no anti-aliased edges
- [ ] **Validation report** per frame: empty frame, subject touching the frame edge (clipped), height outside tolerance of the clip median, and anchor drift above N px. Shown in G's frame strip as badges, and returned over MCP
- [ ] Pure TS in `shared/src/sprite/` (keying, bounds, centroid, quantise, outline) over RGBA typed arrays. Decode and encode in main
- [ ] Vitest: a keyed magenta fixture has a clean alpha with no fringe, two frames with offset subjects align to the same anchor, quantisation respects the palette size, and each validation rule fires on its fixture

## C — Method picker and the recommendation (S/M)

All three methods are always available. The form *recommends* one (user, 2026-10-04).

- [ ] Method selector in the Sheet form: **Hand-drawn**, **Rendered from 3D** and **One-shot sheet**. The recommended method carries a "Recommended" badge and a one-line reason:
  - **Hand-drawn**: `side` perspective (platformers, side-scrollers), or `hand-drawn`/`painterly` style
  - **Rendered from 3D**: `top-down` or `isometric` with 4 or 8 directions, or when a rigged Models asset is attached
  - **One-shot sheet** is never auto-recommended. It is a **Try generating the whole sheet in one image** checkbox, which switches the method when ticked
- [ ] The recommendation is a pure function in `shared` (`recommendSpriteMethod(spec)`), so the UI, MCP and skill agree
- [ ] Clip presets per perspective (side: idle, walk, run, jump, fall, attack, hurt, die; top-down and isometric: idle, walk, attack and die, per direction) with frame counts and fps, editable
- [ ] Vitest: the recommendation table, and preset clips per perspective

## D — Hand-drawn: reference-locked frame generation (L)

- [ ] Step 1, **reference**: generate a character turnaround (front, side, back) or attach one. The user approves it, and the approved reference is locked onto the spec
- [ ] Step 2, **per clip, per frame**: prompts built from a pose table. Built-in pose tables cover each preset clip (for example, the walk cycle's contact, down, passing and up key poses, mirrored for the second half). Each frame is generated with the locked reference attached, through `image-service.ts`, then sent through B
- [ ] Providers without reference-image input are disabled for this method, with the reason. The chosen provider and model are recorded on the spec
- [ ] **Consistency check**: a vision model (via `engines.ts`) scores each frame against the reference (same outfit, palette, proportions). Frames under the threshold are re-rolled up to a budget, and the remaining failures are flagged, never silently kept
- [ ] Mirroring: for side views, generate one facing and mirror it, with an option to generate both when the design is asymmetric
- [ ] Vitest with a stub provider: the pose table expands to the right prompts per frame, re-roll stops at the budget, and failing frames carry their badge into the strip

## E — Rendered from a Models character (M/L)

- [ ] Pick a Models asset that has a Phase 103 rig and clips. The clip list maps onto sprite clips (`walk` → `walk`), and unmatched clips are listed
- [ ] Camera presets, orthographic:
  - `side`
  - `top-down` (steep, about 60°)
  - `isometric` (2:1, a camera elevation of about 30°)
  - a custom elevation and azimuth
- [ ] Directions 1, 4 or 8 (yaw steps), sampled at the clip's fps
- [ ] Rendering happens in the renderer with three (`editor-scene.tsx`'s material path) into an offscreen canvas at 2–4× the frame size, then downsampled. Frames are sent to main over IPC for B and storage. Over MCP the render is routed through the open window, the way the Models tools use `emitOpen`; decide here whether a hidden window is needed for headless use, and record why
- [ ] Shading presets: lit (matches Models), toon (2–3 band ramp) and flat. Optional outline pass
- [ ] Pixel-art mode from B applies on top. This is the precise path for retro 8-direction sprites
- [ ] Vitest: the camera matrices for each preset and direction, and clip sampling at fps hits the expected times. A render smoke test runs in e2e only (it needs WebGL), with the browser capability named in the spec header

## F — One-shot sheet (form toggle) (M)

A strong system prompt and strict post-processing (user, 2026-10-04).

- [ ] System prompt in `shared/src/sprite/one-shot-prompt.ts`, versioned and unit-tested as text. It specifies:
  - an exact grid (columns × rows, cell size, gutter)
  - one clip per row, in a stated order
  - a flat chroma background
  - the same character, scale and baseline in every cell
  - no text, borders or labels
- [ ] Request sizing: the image size is computed from the grid, and the provider's nearest supported size is chosen and recorded
- [ ] **Grid detection instead of trust**: projection profiles of non-background pixels find the real gutters, and the result is compared with the requested grid. A mismatch is reported, not forced
- [ ] Slicing, then the same B pipeline (keying, normalisation, validation)
- [ ] A per-row verdict ("row 3, attack: 2 of 6 frames clipped"), with **Regenerate this clip with Hand-drawn**, which hands the failing clip to D using frame 1 of the sheet as the reference
- [ ] Vitest: grid detection on fixtures with clean, uneven and missing gutters, slicing yields the right cells, and a mismatched grid is reported, not silently re-cut

## G — Atlas packing and the animation previewer (M)

- [ ] Packer in `shared/src/sprite/pack.ts`:
  - MaxRects (best short-side fit)
  - trim with `spriteSourceSize`/`sourceSize` offsets
  - padding and 1px extrude against bleeding
  - a power-of-two toggle and a max size (2048 or 4096), spilling into multiple pages
- [ ] Export:
  - `atlas.png` plus `atlas.json` in **Phaser JSON-hash** format, with an `anims` section
  - an **Aseprite-style** `frameTags` JSON for the same frames
  - frame names `<clip>/<dir>/<n>`
- [ ] **Animation previewer** (centre column):
  - clip list; play and pause; fps override; `loop`, `once` and `ping-pong`
  - a direction switcher (a compass for 4 or 8 directions)
  - onion skin (previous and next frames)
  - a checker or solid background
  - pixel-perfect zoom (`image-rendering: pixelated`)
  - an anchor and baseline overlay
- [ ] **Frame strip** under the player with each frame's B badges, and per-frame re-roll, delete, reorder (drag), nudge the anchor (arrow keys) and flip. All edits are undoable and saved to `frames/`, then re-packed
- [ ] Vitest: the packer never overlaps rects and respects padding and max size, the Phaser JSON validates against a fixture Phaser accepts, the Aseprite tags match the clips, and the previewer steps frames at the given fps with fake timers

## H — Tilesets with autotiling (L)

- [ ] **Seamless base tiles** per terrain type (grass, dirt, sand, water, stone…), generated through `image-service.ts` with a "tileable, top-down" prompt. Each passes a seam check (wrap-offset by half, then measure edge difference) and, if needed, a seam repair (blend across the wrapped edge) in `shared/src/sprite/seamless.ts`
- [ ] **Transition sets built procedurally, not generated tile by tile.** Between two base tiles, composite masks produce a **47-tile blob** set or a **16-tile Wang corner** set (user picks), with mask edges shaped by noise so borders look natural. This is what makes the set precise: every edge matches by construction
- [ ] Tile sizes 16, 32, 48 or 64, pixel-art mode from B, and collision flags per tile (solid, water, walkable)
- [ ] Export: tileset atlas PNG plus Tiled `.tsj` with **wangsets**, so Tiled and Phaser autotile with it
- [ ] Vitest: every blob or Wang tile's edges match its neighbours in all 47 or 16 configurations, the seam check catches a non-tiling fixture, and the `.tsj` validates against a Tiled fixture

## I — Isometric tiles, parallax backgrounds and prop sheets (M)

- [ ] **Isometric tiles**: 2:1 diamond floor tiles and wall/cliff blocks, made by re-projecting H's top-down tiles (affine to the diamond) or by generating them with an isometric prompt. Same export as H
- [ ] **From a Phase 105 terrain**: render a terrain's splat and drape, top-down or isometric, into a tile grid plus a matching `.tmj` (J), so a 3D terrain becomes a 2D map
- [ ] **Parallax backgrounds**: 3–5 layers (sky, far, mid, near), each horizontally seamless (the H seam check on the x axis only) with alpha, plus scroll factors in the export JSON
- [ ] **Prop sheets**: a list of props (trees, rocks, crates, barrels, signs) generated one per cell through B, then packed by G
- [ ] Vitest: diamond re-projection maps corners correctly, parallax layers wrap seamlessly on x, and the terrain-to-tiles grid size matches the terrain extent

## J — Maps as Tiled `.tmj` (M)

- [ ] Layout from a prompt: an LLM writes a small `MapSpec` (regions, rooms, corridors, paths, spawn and exit points), limited to the terrain types the chosen tileset has, then validated by zod with a repair round, exactly as the Models pipeline repairs designs
- [ ] Fill in the kernel: regions → terrain-type grid → autotile with H's blob or Wang rules → decoration scatter → collision layer from tile flags
- [ ] Orthogonal and isometric maps. Layers: `ground`, `decoration`, `collision`, and an `objects` layer with spawns, exits and named points
- [ ] Map preview with pan and zoom, a layer toggle and a collision overlay. Existing `.tmj` files can be imported
- [ ] Vitest: autotile fill picks the right tile for each neighbourhood, the collision layer matches the flags, the `.tmj` validates against a Tiled fixture, and a spec naming an unknown terrain type comes back as a validation result

## K — Sprites over MCP, and the skill (M)

- [ ] `shared/src/media-sprite-mcp.ts` tool family:
  - `sprite_list`, `sprite_open`, `sprite_get_spec` and `sprite_set_spec`
  - `sprite_recommend_method`
  - `sprite_generate`, for a whole sheet or named clips, by method
  - `sprite_regenerate_frames`
  - `sprite_patch_frames`: reorder, delete, flip, nudge the anchor
  - `sprite_render_preview`: a contact sheet per clip, plus an animated GIF/APNG of one clip, so an agent can *see* motion
  - `sprite_get_report`: B's validation badges
  - `tileset_generate`, `background_generate`, `map_generate`, `map_get` and `map_patch`
  - `sprite_export`
- [ ] Handlers in `main/media/sprite/sprite-mcp.ts`. A `main/mcp/sprite-tools.ts` gate behind **Settings ▸ MCP ▸ Let agents edit sprites and maps** (default off), with `dispatch.ts` entries and slow-tool timeouts for generate and render
- [ ] Skill `midnite-media-sprite-build` in all copies. It covers method choice (call `sprite_recommend_method` first), the generate → report → re-roll loop, and the export formats Phase 107 consumes
- [ ] Vitest: schemas derive from zod, write tools are refused when the switch is off, a failed validation comes back as a result, and a stub-provider generate → report → export round trip works

## L — Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] Screenshots (`MSTUDIO_SHOTS=1`, Media ▸ Sprites): method picker with the recommendation, previewer with onion skin and the direction compass, frame strip badges, a one-shot sheet's per-row verdict, a 47-blob tileset, a parallax set, and a generated map
- [ ] A Phaser smoke page (e2e, needs a real canvas) loads an exported atlas and tileset/map and plays a clip, as the precursor to Phase 107's kit
- [ ] Human pass: a side-scroller hero (hand-drawn) and an 8-direction isometric character (rendered from a Models rig), both previewed and exported
- [ ] Human pass: the one-shot toggle on a strong provider produces a usable sheet, or a clear per-row verdict
- [ ] Human pass: an agent over MCP builds a tileset and a map, previews them, and exports

## Deferred

- [ ] Skeletal 2D export (Spine, DragonBones) (⏳ deferred)
- [ ] Normal maps for 2D lighting (⏳ deferred)
- [ ] A pixel editor; Aseprite reads the export (⏳ deferred)
- [ ] Wave-function-collapse map generation; rule-based autotile comes first (⏳ deferred)

## Files this phase touches

| Area | Files |
|---|---|
| Kernel | new `shared/src/sprite/`: `key.ts`, `align.ts`, `quantise.ts`, `outline.ts`, `validate.ts`, `pack.ts`, `grid-detect.ts`, `seamless.ts`, `autotile.ts`, `iso.ts`, `map-fill.ts`, `recommend.ts`, `one-shot-prompt.ts`, `pose-tables.ts` |
| Schemas | new `shared/src/media-sprite.ts`, new `shared/src/media-sprite-mcp.ts`; [`shared/src/media.ts`](../../../packages/shared/src/media.ts), [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) |
| Main | new `main/media/sprite/` (service, library, png encode/decode reuse from Phase 105, `sprite-mcp.ts`), new `main/mcp/sprite-tools.ts`; [`media/image/image-service.ts`](../../../packages/desktop/src/main/media/image/image-service.ts) (reference-image capability flag per provider), [`media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts), [`main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts) |
| Renderer | new `app/features/media/sprite/` (tab, sheet and environment forms, method picker, previewer, frame strip, render-from-3D offscreen canvas, map preview); [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts), [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), `store/ui-store.ts`, [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx) |
| Skills | `midnite-media-sprite-build` (all copies) |
| Tests | kernel vitest per theme, desktop vitest for export and MCP, app vitest via the mock bridge, e2e only for the WebGL render and the Phaser smoke page, an `MSTUDIO_SHOTS` spec |

## Decisions / open questions

- **All three methods ship; the form recommends one** (user, 2026-10-04). Hand-drawn is recommended for
  side-scrollers and painterly styles. Rendered-from-3D is recommended for top-down and isometric
  multi-direction work. One-shot is opt-in behind a checkbox, with a strong system prompt.
- **Environments are tilesets, isometric tiles, parallax, props and Tiled maps** (user, 2026-10-04 —
  the recommended set).
- **Transitions are composited, not generated** (recommendation, in Theme H). An image model cannot
  guarantee 47 matching edges. Compositing two seamless bases through masks can.
- **Where the 3D render happens, open, decided in Theme E.** Recommendation: the renderer's three
  scene into an offscreen canvas, because `preview.ts`'s software rasteriser lacks the lighting and
  toon shading sprites need. A hidden window only if headless MCP use requires it.
- **One tab or two, open.** Recommendation: one **Sprites** tab with Sheet and Environment modes. Both
  halves share the pipeline, the packer and the export, and Media already has six tabs after Phase 105.
- **Atlas format, open.** Recommendation: Phaser JSON-hash as primary (Phase 107's kit reads it
  directly), with the Aseprite tags JSON alongside for tooling.
