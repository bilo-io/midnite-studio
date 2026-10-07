# Phase 106 — 2D Assets: sprites, animation and environments

**Refined: x1** · 2026-10-04 · UI/UX & interaction, visual design & theming, accessibility & keyboard, empty / loading / error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, observability & diagnostics, security, permissions & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

Requested by the user · 2026-10-04 · grounded against the tree as of `a51a3b05`; re-grounded by the
x1 refinement against `d4b7632e` (Phase 105 refined x1).

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
>   (`createImageService(deps)` → `{generate, cancel, providerStatuses}`; adapters flat beside it:
>   [`gemini.ts`](../../../packages/desktop/src/main/media/image/gemini.ts) (`generateContent` with
>   `imageConfig.aspectRatio`), [`openai.ts`](../../../packages/desktop/src/main/media/image/openai.ts)
>   (`POST /v1/images/generations`, three sizes), `agy.ts` (the `agy` CLI), `ollama.ts`; the seam is
>   `ImageAdapterRequest = {prompt, model, aspect, count, seed?}` in
>   [`types.ts`](../../../packages/desktop/src/main/media/image/types.ts)). The provider catalogue is
>   `IMAGE_PROVIDERS: readonly ImageProviderInfo[]` and `ImageGenerateRequestSchema` in
>   [`shared/src/media.ts`](../../../packages/shared/src/media.ts); aspects are `1:1 · 3:2 · 2:3 · 16:9 · 9:16`.
>   **No provider takes a reference image today** — this phase adds that (Theme D). A provider that
>   cannot take one is disabled for reference-locked modes, with the reason shown. The picker to reuse is
>   `ProviderModelPicker` ([`components/ai-thread/`](../../../packages/app/src/components/ai-thread/index.ts))
>   fed by `imagePickerProviders(statuses)` and `IMAGE_PROVIDER_ICONS` from the Images
>   [`create-panel.tsx`](../../../packages/app/src/features/media/image/create-panel.tsx).
> - **Models.** Phase 103's rig and clips: `samplePose(rig, clip, time)`, `bakeClip`, `CLIP_BAKE_FPS = 30`
>   in [`model-geometry/clips.ts`](../../../packages/shared/src/model-geometry/clips.ts), `resolveRig` in
>   [`rig.ts`](../../../packages/shared/src/model-geometry/rig.ts), `skinMatrices`/`skinParts` in
>   [`skin.ts`](../../../packages/shared/src/model-geometry/skin.ts), and the R3F scene
>   (`EditorScene`) in [`app/features/media/model/editor-scene.tsx`](../../../packages/app/src/features/media/model/editor-scene.tsx)
>   for the rendered-from-3D method. The Models software rasteriser
>   ([`preview.ts`](../../../packages/desktop/src/main/media/model/preview.ts) `renderView`) has fixed
>   cameras, no alpha and no texture sampling, which is why rendering happens in the renderer (Decision 8).
> - **Terrain.** Phase 105's `terrain.manifest.json` (`TerrainManifestSchema`), its `drape.png`,
>   `splat.png` and `heightfield.png`, rendered down to top-down or isometric tiles and maps. Phase 105's
>   PNG codec `main/media/png/png-codec.ts` (net-new in Phase 105 Theme B;
>   `decodePng`, `encodePngRgba8`) is reused for every frame.
> - **Engines.** [`main/media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts):
>   `createVisionCall` (added by Phase 105 Theme F; Ollama vision, a prompt and several images, optional
>   JSON) for the consistency check, and `createLlmCall` (Ollama or a roster agent, `json?`) for map
>   layout specs written by an LLM, repaired the way Models repairs designs (`MODEL_MAX_REPAIRS = 2`, the
>   loop in [`model-service.ts`](../../../packages/desktop/src/main/media/model/model-service.ts) L349,
>   `describeIssues` in [`spec-parse.ts`](../../../packages/desktop/src/main/media/model/spec-parse.ts)).
> - **Media tabs and storage**, exactly as Phase 105 Theme A uses them: `MEDIA_TABS`, the
>   `Record<MediaTab, …>` tables (`MEDIA_TAB_EXPORT_FORMATS`, `MEDIA_TAB_META`, `TAB_BODY`,
>   `MEDIA_LAYOUT_KEYS`), `REPO_SCOPED_MEDIA_TABS`, `LayoutSizes`/`DEFAULT_LAYOUT`/`LAYOUT_BOUNDS`, and
>   [`media-store.ts`](../../../packages/desktop/src/main/media/media-store.ts) (`createMediaStore`, per-root
>   `WriteQueue`, `notifyMediaChanged`).
> - **The MCP recipe** of the `model_*` family, as Phase 105 Theme J restates it: ids and schemas in a
>   `shared/src/media-<x>-mcp.ts`; entries written **inline** in `MCP_TOOLS`
>   ([`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts)) with each id added to the hand-written
>   `McpToolEntry.id` union and write ids to `mcp.test.ts`'s `writeTools` set; a mapped-type entry in
>   [`dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts); a `main/mcp/<x>-tools.ts` gate and
>   binder throwing `McpToolError('refused', …)`; a persisted switch on `McpSettings`
>   ([`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts)) mirrored in
>   [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts); the shim's inline timeout choice in
>   [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts) L87; and a switch in
>   [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx).
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
> - **No new global chords.** The previewer's keys (Space, arrows, `[`/`]`) act only while the previewer
>   or the frame strip has focus; nothing joins `COMMANDS` in [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts).
>
> **Effort tags:** **S** ≤ half a day · **M** 1–2 days · **L** 3+ days, likely 2–3 PRs.

## Headlines

_Precise 2D assets, generated, aligned, packed and played back before a game ever loads them._ Image
models are good at single pictures and bad at consistent frame grids. This phase owns that gap, with
three generation methods behind one normalisation pipeline, an animation previewer, and environments
that autotile. Planned 2026-10-04; refined x1 the same day, which pinned every schema, channel, file
format and test, corrected two stale claims (no provider takes a reference image; Phaser neither
autotiles nor reads external tilesets), and resolved all three opens plus fifteen new decisions.

**Theme A — Sprites tab, specs and library.** ✅ Landed (PR pending number; MCP exposure of `SpriteService` and the render/export channels left to E/G). Lands first. `'sprite'` joins `MEDIA_TABS`
(repo-scoped, `LuPersonStanding`); `sprite.json` is a `kind`-discriminated spec in a new
`shared/src/media-sprite.ts`; assets live under five fixed kind folders; ten `mstudio:media:sprite-*`
channels carry it, with generation as cancellable jobs.

**Theme B — Frame pipeline: background removal, alignment, pixel-art mode.** ✅ Landed (PR #747).
Pure-TS kernels in `shared/src/sprite/` (`image`, `key`, `align`, `quantise`, `outline`, `validate`);
`main/media/sprite/frame-pipeline.ts` decodes, keys (skipped when a provider returned alpha),
normalises onto the anchor at one sheet-wide scale per direction, writes each frame at once and yields
between frames, then runs the pixel palette/outline pass and the badges. Frame sources hand raw bytes to
`SpriteJobContext.submitFrame`; `frames.json` gains `referenceHeights` so a re-generated clip scales like
the rest. OpenAI's adapter sends `background: 'transparent'` when `ImageAdapterRequest.transparent` is
set; `spriteBackgroundRequest` gives every other provider the chroma clause. `SPRITE_BADGES` is now the
doc's seven. `anchorNudge` is metadata applied where frames are composed (G), not baked in.

**Theme C — Method picker and the recommendation.** ✅ Landed with A. `recommendSpriteMethod(spec)`
returns `{method, reason}` from a fixed table; one-shot is only ever a checkbox; clip presets per
perspective are data.

**Theme D — Hand-drawn: reference-locked frame generation.** ✅ Landed (PR pending number). The image
seam takes reference images: `supportsReference` on the catalogue (Gemini's `gemini-*-image` and
OpenAI only), `references`/`transparent` on `ImageAdapterRequest` and `ImageGenerateRequestSchema`
(paths resolved through the media store), Gemini `inline_data` parts, OpenAI `/v1/images/edits`
multipart, and `imageService.generateImage` for bytes without a file — which never falls back to the
key-less agy route when a reference is attached. `main/media/sprite/hand-drawn.ts` is the frame
source: a `generate({turnaround: true})` job draws the 3:2 turnaround as the unapproved reference;
`setReference({approve})` locks it (and `frames: 'mark'` badges existing frames `unchecked`); frame
jobs are refused until then (`handDrawnPreflight`). Prompts come from `shared/src/sprite/pose-tables.ts`;
each direction's reference frame goes first, then two requests in flight. The vision check scores the
raw candidate before the B pass, re-rolls up to the budget and keeps the best, flagging `inconsistent`
with `issues`; no vision model keeps frames `unchecked` and the job's final event says why. Side
sheets submit the `e` bytes again as `w` with `flipped: true` (G applies the flip). The tab gains a
reference card (Approve / Regenerate / Attach, Keep or Mark all for re-roll) and a flagged-frames list.

**Theme E — Rendered from a Models character.** ✅ Landed (PR #762). `useSpriteRenderHost`
(`app/features/media/sprite/render/`) is mounted beside the app root's other listeners, acknowledges a
`mediaSpriteRenderRequest` at once and imports `render-job.ts` (three) lazily: it reads the attached
design, builds it with the Models editor's own `editorScene`/`rigModel`/`posedScene` and lights, and
draws each pose at `supersample ×` into a transparent `WebGLRenderer` on an `OffscreenCanvas`, then
box-downsamples and posts PNG batches of ≤ 32 on `mstudio:media:sprite-render-frames` — each answer
waits for main to process the batch (the back-pressure), and a refused answer (cancelled) stops it.
Main's `render-relay.ts` sends to the focused main window (else the first) and fails the job with
_"Rendering from 3D needs the Midnite Studio window open."_ when nothing acknowledges in 10 s; MCP (K)
gets the same path. `shared/src/sprite/camera.ts` names directions by screen compass (`s` 0°, `w` 90°,
`e` 270°) plus a shared `azimuthDeg`, so **every preset's azimuth is 0** (the doc's 90°/45° would have
turned a 1-direction side sheet's `e` the wrong way) and isometric is `atan(0.5)`; a rig facing other
than `+z` is turned to match. `orthoFit` keeps one scale over every sampled pose and direction; frames
enter the pipeline as `source: 'rendered'` — no keying, `scale: 1`, anchored — and each clip's real
frame count (`round(duration × fps)`) is written back to `sprite.json`. The Sheet form's Rendered card
gets a rigged-model picker (Models assets whose `model.json` has a rig and animations; the design file
is the reference path), the clip mapping with `SPRITE_CLIP_ALIASES`, one-click "also on the model"
clips, and camera / shading (lit, toon, flat) / outline (an inverted hull pushed along normals rather
than scaled 1.02, so thin limbs keep it) / supersample. `sprite-render.spec.ts` renders a real biped
in Chromium (e2e cap 475 → 476).

**Theme F — One-shot sheet (form toggle).** ✅ Landed (PR #762). `ONE_SHOT_PROMPT_VERSION = 1`
and `oneShotPrompt` in `shared/src/sprite/one-shot-prompt.ts`: rows are clips × the directions
Hand-drawn would draw (a mirrored side sheet draws `e` and mirrors `w`), columns the longest clip, cells
at the frame size with an eighth-width gutter; past 8 × 8 the job is refused before any request, and the
aspect is `nearestAspect` (D's, imported) of the sheet's size. `main/media/sprite/one-shot.ts` makes one
request, keeps the answer as `reference/one-shot-sheet.png`, keys it and runs `detectGrid` (projection
profiles; gutters are near-empty runs ≥ 2 px). A count that differs from the request is written to
`sprite.json`'s `oneShot.mismatch` and fails the job — nothing is sliced. Otherwise each cell, widened to
the gutter midpoints, goes through B as `source: 'sliced'`, each direction's reference frame first, with
`grid` on cells > 20 % off the median span. `oneShotVerdict` derives "row 3, attack: 2 of 6 frames
clipped" from `oneShot.rows` and the badges, so no extra file is needed. The overview's One-shot card
draws the detected cells over the sheet and the verdict; a failing row's **Regenerate this clip with
Hand-drawn** uses a new `setReference({fromFrame})` (frame `000` becomes the approved reference) and
`generate({clips: [clip], method: 'hand-drawn'})` — a one-job method override; the stored sheet stays
one-shot. Disabled with D's reason when the provider cannot take a reference.

**Theme G — Atlas packing and the animation previewer.** ✅ Landed (PR #763). `shared/src/sprite/pack.ts`
is MaxRects (best short-side fit, never rotated) with trim, padding, a 1 px extrude, POT pages and
spill-over; `atlas.ts` writes one `atlas.json` that is Phaser's JSON-hash and an Aseprite JSON at once
(per-frame `duration`, contiguous `<clip>/<dir>` `frameTags`), Phaser's multiatlas past one page (tags
dropped, with the warning), and `anims.json` for `AnimationManager.fromJSON`, each with a zod schema.
`frames.ts` is the one frame-set rule the previewer, strip and packer share: a 1-direction side sheet is
`e` + `w`, nothing past `clip.frames` plays or packs, holes are skipped. `sprite-export.ts` composes each
frame (`flipped` about the anchor column, then `anchorNudge`), trims, packs and writes `<asset>.sprite/`
(refusing an existing one) plus the asset's own `export/`, which 107's asset bridge imports; other kinds
wait for H–J. `patchFrames` takes `SpritePatchOp[]` (`nudge`, `flip`, `delete` to `frames/.trash/`,
`restore`, `move` keeping holes, `reroll` as a frames-only job — hand-drawn redraws a mirrored `w` through
`e`; one-shot refuses); a finished job prunes frames past their clip (E's stale-frame deferral). The
centre column gains `SpritePreviewer` (2D canvas, `previewClock`, compass, onion skin, checker/solid,
pixel zoom, anchor/baseline overlay, focus-scoped keys) and `SpriteFrameStrip` (badges with rule
tooltips, roving focus on `,`/`.` since the arrows nudge, `H`/Delete/`R`/`Alt+←/→`, drag reorder,
`Mod+Z` undo over a ≤ 100 inverse-op session stack), with **Export** to the Media export folder.

**Theme H — Tilesets with autotiling.** ◻ Not started. Seam-checked base tiles, procedural 47-blob
(Tiled `mixed`) or 16-tile corner (Tiled `corner`) transitions that match by construction, and a
`.tsj` with wangsets for Tiled editing.

**Theme I — Isometric tiles, parallax backgrounds and prop sheets.** ◻ Not started. Diamond
re-projection, a Phase 105 terrain rendered to a tile grid plus `.tmj`, x-seamless parallax layers with
scroll factors, and prop sheets through B and G.

**Theme J — Maps as Tiled `.tmj`.** ◻ Not started. An LLM writes a zod `MapSpec` (two repair rounds);
the kernel fills, autotiles, scatters and derives collision; the `.tmj` embeds its tilesets because
Phaser cannot load external ones.

**Theme K — Sprites over MCP, and the skill.** ◻ Not started. Eighteen tools behind a new
`allowSprites` switch; generation is an asynchronous job polled with `sprite_job_status`; a
`midnite-media-sprite-build` skill in six copies.

**Theme L — Verification.** ◻ Not started. The gate, an `MSTUDIO_SHOTS` spec, one Phaser smoke e2e
against an exact-pinned dev-only `phaser`, and three human passes.

## Build order

1. **A + B + G** (foundation): tab, specs, the shared frame pipeline, and the packer with the previewer.
   Every method feeds them. Phase 105 Themes A and B must have landed first (this phase reuses
   `png-codec.ts` and the tab registration pattern); if 105 B has not landed, 106 A creates
   `png-codec.ts` with exactly 105 B's exports.
2. **C**, then **D · E · F** in parallel. Each method is a frame source into B. D also needs
   `createVisionCall` (Phase 105 Theme F); if F has not landed, D adds it with F's exact signature.
3. **H** in parallel with the methods. **I** after H, since it reuses H's seamless and edge machinery,
   and its terrain-to-tiles item after Phase 105 Theme I (`terrain.manifest.json`). **J** after H.
4. **K** last. Its `allowSprites` switch bumps `mcp.json`'s `version` by one from whatever it is then.

## A — Sprites tab, specs and library (M)

- [x] `'sprite'` added to `MEDIA_TABS`, labelled **Sprites**, with every `Record<MediaTab, …>` the compiler flags filled in (`MEDIA_TAB_META` with a `react-icons/lu` glyph, `TAB_BODY`, `MEDIA_TAB_EXPORT_FORMATS`), `MEDIA_LAYOUT_KEYS` plus two `LayoutSizes` keys, and listed in `REPO_SCOPED_MEDIA_TABS`
  - Appended after `'terrain'` (or after `'model'` if 105 has not landed): `[…, 'terrain', 'sprite']`.
  - `MEDIA_TAB_META.sprite = { label: 'Sprites', icon: LuPersonStanding }` (add the name to
    `components/icons/icon-names.test.ts`).
  - `TAB_BODY.sprite = () => <SpriteTab />` from `app/features/media/sprite/sprite-tab.tsx`.
  - `MEDIA_TAB_EXPORT_FORMATS.sprite = ['sprite-pack']` (Theme G adds the id; a pack is a folder — Decision 13).
  - `LayoutSizes`: `mediaSpriteExplorerWidth` (224, `{180, 480}`) and `mediaSpriteDetailWidth`
    (380, `{280, 680}` — the forms are wider than Models'); `MEDIA_LAYOUT_KEYS.sprite` names them.
    Persist `version` stays `31` (the `layout` merge default-fills new keys).
  - `REPO_SCOPED_MEDIA_TABS` gains `'sprite'`; with no repo the tab shows `NoRepoMediaState({tab: 'sprite'})`.
- [x] Schemas in a new `shared/src/media-sprite.ts`:
  - `SpriteSheetSpecSchema`:
    - `name`, `style` (`pixel`, `hand-drawn`, `painterly`, `flat`)
    - `targetPerspective` (`side`, `top-down`, `isometric`, `front`)
    - `frameSize` `[w, h]`, `directions` (1, 4 or 8), `anchor` (default bottom-centre)
    - `palette` (optional, pixel mode)
    - `method` (`hand-drawn`, `rendered`, `one-shot`)
    - `clips[]`, each with `name`, `frames`, `fps`, `loop` (`loop`, `once`, `ping-pong`) and an optional pose table
    - `reference` (an image ref, or a Models asset ref for the rendered method)
  - `TilesetSpecSchema`, `BackgroundSpecSchema` and `MapSpecSchema`, filled in by H, I and J
  - Exact shapes (all fields defaulted unless marked required; top level `version: z.literal(1).default(1)`):
    - `SpriteAssetSpecSchema = z.discriminatedUnion('kind', [SpriteSheetSpecSchema, TilesetSpecSchema, BackgroundSpecSchema, PropSheetSpecSchema, MapAssetSpecSchema])`
      — `sprite.json` always holds one of these, so one file name serves every asset.
    - `SpriteSheetSpecSchema`: `kind: 'sheet'`, `category: 'character' | 'object'` (`'character'`),
      `name` (required, ≤ 120), `prompt` (≤ 4000), `style` (`'pixel'`), `targetPerspective` (`'side'`),
      `frameSize: [int 8–512, int 8–512]` (`[64, 64]`), `directions: 1 | 4 | 8` (`1`),
      `anchor: { x: 0–1, y: 0–1 }` (`{x: 0.5, y: 1}` = bottom-centre), `palette?: { colours: '#rrggbb'[] (2–256) } | { size: 4–256 }`,
      `outline: boolean` (false), `method` (`'hand-drawn'`), `provider?: ImageProviderId`, `model?: string`,
      `clips: SpriteClip[]` (from the C preset), `reference?: { kind: 'image'; file: 'reference/reference.png'; approved: boolean } | { kind: 'model'; project: string; path: string }`,
      `render?: SpriteRenderSettings` (Theme E), `consistency: { threshold: 0–1 (0.7), rerollBudget: 0–5 (2) }` (Theme D).
    - `SpriteClipSchema = { name: /^[a-z][a-z0-9-]{0,31}$/, frames: int 1–64, fps: 1–60 (8), loop: 'loop' | 'once' | 'ping-pong' ('loop'), poses?: string[] (one per frame) }`.
    - `TilesetSpecSchema` (H), `BackgroundSpecSchema` (I), `PropSheetSpecSchema` (I) and `MapAssetSpecSchema` (J)
      are declared here with their theme's fields so A's union is complete from the first PR.
  - Directions are named: `SPRITE_DIRECTIONS = { 1: [<facing>], 4: ['s', 'w', 'n', 'e'], 8: ['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se'] }`
    where a 1-direction sheet's facing is `'e'` for `side` and `'s'` otherwise (`spriteDirections(spec)` returns the list).
- [x] Library layout `.midnite/media/sprite/<group>/<asset>/`:
  - `sprite.json` (spec, source of truth)
  - `reference/`
  - `frames/<clip>/<dir>/<n>.png` (normalised frames, the editable truth)
  - `export/` (atlas PNG + JSON)
  - a summary in the library manifest

  Groups are shown as **Characters**, **Objects**, **Tilesets**, **Backgrounds** and **Maps**
  - **Resolved: the groups are five fixed folders keyed by kind** (Decision 2):
    `SPRITE_GROUPS = { characters: 'Characters', objects: 'Objects', tilesets: 'Tilesets', backgrounds: 'Backgrounds', maps: 'Maps' }`;
    a sheet goes to `characters` or `objects` by `category`, a prop sheet to `objects`, and the others by
    kind. Users do not create groups. The explorer always shows all five (an empty one reads `0`).
  - `<n>` is zero-padded to three digits (`000`); `<dir>` is a `SPRITE_DIRECTIONS` name.
  - Per-frame metadata lives in `frames/frames.json` (`SpriteFramesFileSchema = { version: 1, frames: Record<'<clip>/<dir>/<n>', { anchorNudge: [dx, dy], flipped: boolean, source: 'generated' | 'rendered' | 'sliced' | 'mirrored', badges: SpriteBadge[], score?: number }> }`).
    **Correction (x1):** there is no separate library manifest; like `model.json`, `sprite.json` carries
    `createdAt`, `updatedAt` and a `lastReport?: { frames, failing, at }` summary the explorer reads.
  - Asset folder name: `${spriteSlug(name)}-${YYYYMMDD-HHMMSS}` (`spriteSlug` imitates `modelSlug`).
- [x] Create panel with two modes, **Sheet** and **Environment**, which swap the form below the shared prompt input (`prompt-input.tsx`)
  - `SpriteCreatePanel` in `sprite-create-panel.tsx`: a two-option segmented control (**Sheet** ·
    **Environment**, `role="radiogroup"`, arrow keys move between them) above a `PromptTextarea`
    (`prompt-input.tsx`, with `MEDIA_PROMPT_BOX`). The mode is remembered per session in component state,
    not persisted.
  - Sheet form: Name, Category (Character/Object), Style, Perspective, Frame size (W × H, presets
    16/32/48/64/96/128 square), Directions (1/4/8), the method picker (C), clips (C presets, editable), the
    provider picker (`ProviderModelPicker`), and **Generate**.
  - Environment form: a kind selector (**Tileset** · **Isometric tiles** · **Parallax background** ·
    **Prop sheet** · **Map**), each swapping in its theme's fields (H, I, J).
- [x] `mstudio:media:sprite-*` IPC channels with `GitOpResult` envelopes and progress events. Generation is cancellable
  - `CHANNELS`: `mediaSpriteLibrary: 'mstudio:media:sprite-library'` (op-union `create | rename | duplicate | delete`),
    `mediaSpriteGet: 'mstudio:media:sprite-get'` → `{ spec, frames: SpriteFramesFile, report }`,
    `mediaSpriteSetSpec: 'mstudio:media:sprite-set-spec'`, `mediaSpriteSetReference: 'mstudio:media:sprite-set-reference'`,
    `mediaSpriteGenerate: 'mstudio:media:sprite-generate'` → `GitOpResult<{ jobId: string }>`,
    `mediaSpriteCancel: 'mstudio:media:sprite-cancel'` (`{ jobId }`),
    `mediaSpritePatchFrames: 'mstudio:media:sprite-patch-frames'`, `mediaSpriteExport: 'mstudio:media:sprite-export'`,
    `mediaSpriteRenderFrames: 'mstudio:media:sprite-render-frames'` and `mediaSpriteRenderReady: 'mstudio:media:sprite-render-ready'` (Theme E).
  - `EVENT_CHANNELS`: `mediaSpriteProgress: 'mstudio:media:sprite-progress'`
    (`{ jobId, done: number, total: number, stage: 'generating' | 'processing' | 'checking' | 'packing', frame?: string }`),
    `mediaSpriteChanged: 'mstudio:media:sprite-changed'`, `mediaSpriteOpen: 'mstudio:media:sprite-open'`,
    `mediaSpriteRenderRequest: 'mstudio:media:sprite-render-request'` (E).
  - Every request extends `SpriteTargetSchema = { repoId, group: z.enum(SPRITE_GROUP_IDS), asset: ModelLibraryNameSchema }`.
  - Bridge `media.sprite.{ library, get, setSpec, setReference, generate, cancel, patchFrames, export, onProgress, onChanged, onOpen }`
    in `bridge.ts`/`preload/index.ts`; handlers in a new `main/ipc/media-sprite-handlers.ts`
    (`registerMediaSpriteHandlers()`), over one `createSpriteService` in `main/media/sprite/sprite-service.ts`.
  - **Jobs:** one job per asset at a time; a `generate` for an asset with a running job answers
    `{ok: false, kind: 'error', message: 'This asset is already generating. Cancel it first.'}` (not
    latest-wins: a job may be minutes of paid API calls). Jobs of different assets run concurrently, each
    limited to 2 in-flight image requests. Cancel aborts the in-flight requests through the image
    service's `AbortSignal`, keeps every frame already written, and ends the job with `cancelled`.
- [x] Vitest: schema defaults and round trip, the tab registers, and the explorer groups seeded assets via the mock bridge
  - `shared/src/media-sprite.test.ts`: `SpriteAssetSpecSchema.parse({ kind: 'sheet', name: 'hero' })`
    fills every default; each kind round-trips; a clip name `Walk!` is rejected; `spriteDirections` for
    `side`/1 is `['e']` and for 8 is the eight names in order.
  - `app/src/features/media/sprite/sprite-tab.bridge.test.tsx`: with
    `media.files['sprite:characters'] = { 'hero-20261004-120000/sprite.json': … }` the tab is labelled
    **Sprites**, the explorer shows the five groups and **hero** under Characters.
  - `mock-bridge.ts` learns `media.sprite.*` (`generate` resolves a `jobId` and emits two progress events).

- [ ] `SpriteService` is the one implementation both IPC and MCP call
  - `main/media/sprite/sprite-service.ts` exports `createSpriteService(deps: { store: MediaStore; imageService; visionCall: VisionCall; llmCall: LlmCall; renderRelay; log })`
    with `library`, `get`, `setSpec`, `setReference`, `generate`, `jobStatus`, `cancel`, `patchFrames`,
    `renderPreview`, `export`; `media-sprite-handlers.ts` and `sprite-mcp.ts` are thin adapters, so the job
    limits, confinement and WriteQueue rules live in one file. Main logs one line per job:
    `sprite job <asset> method=<m> frames=<n> requests=<n> ms=<n> done|cancelled|failed:<message>`.
  - Vitest `desktop/src/main/media/sprite/sprite-service.test.ts`: a second `generate` on a busy asset is
    refused with the literal message; cancel keeps written frames and ends `cancelled`.

## B — Frame pipeline: background removal, alignment, pixel-art mode (M/L)

What makes a sheet *precise*, whichever method produced the frames.

- [x] **Background removal**:
  - use the provider's alpha when it returns one
  - otherwise generation asks for a flat chroma background (magenta `#ff00ff`, or green if the subject is magenta) and the pipeline keys it out with despill and a 1px edge clean-up
  - **Resolved per provider** (Decision 6): `ImageAdapterRequest` gains `transparent?: boolean`; the
    OpenAI adapter sends `background: 'transparent'` with `output_format: 'png'` when set, so its frames
    arrive with real alpha. Gemini, `agy` and Ollama get the chroma clause in the prompt.
  - Chroma choice: `chooseChroma(prompt, palette?)` returns `#00ff00` when the prompt or palette mentions
    magenta/pink/purple (case-insensitive word list in `key.ts`) or a palette colour is within ΔE 25 of
    `#ff00ff`; else `#ff00ff`.
  - `keyChroma(img: RgbaImage, chroma, { tolerance = 0.18, softness = 0.08 }): RgbaImage` in
    `shared/src/sprite/key.ts`: alpha from RGB distance to the chroma (smoothstep between `tolerance`
    and `tolerance + softness`), despill by clamping the chroma's dominant channels to the max of the other
    two on semi-transparent pixels, then a 1 px erode of alpha < 0.5 edges.
  - A frame that arrives with any alpha < 255 pixel skips keying (the provider's alpha wins).
- [x] **Normalisation per frame**: crop to the alpha bounds, scale so the character's height matches the clip's reference height (taken from the first idle frame), and place on the shared anchor:
  - horizontal centroid of the lower body band
  - baseline at the lowest opaque row

  This is what stops a walk cycle from jittering
  - `shared/src/sprite/align.ts`: `alphaBounds(img, threshold = 8)` (the rule `sf3d/prepare-image.ts`
    uses, moved to shared), `lowerBandCentroid(img, band = 0.2)` (x-centroid of opaque pixels in the
    bottom 20 % of the bounds), `normaliseFrame(img, { frameSize, anchor, referenceHeight }): { image, scale, offset }`.
  - Reference height: the bounds height of `idle/<dir>/000` if an `idle` clip exists, else frame 0 of the
    first clip. Scaling uses area averaging when shrinking and nearest-neighbour in pixel mode.
  - The anchor point (`anchor.x × w`, `anchor.y × h`) receives the band centroid and the baseline;
    `anchorNudge` from `frames.json` is added after.
- [x] **Pixel-art mode**: nearest-neighbour downscale to the frame size, palette quantisation (median cut, or a fixed palette from the spec), optional 1px outline, and no anti-aliased edges
  - `shared/src/sprite/quantise.ts` `medianCut(pixels, size)` and `mapToPalette(img, palette)` (nearest in
    Lab); `shared/src/sprite/outline.ts` `outline1px(img, colour = darkest palette colour)`. Alpha is
    thresholded at 128 in pixel mode (no partial alpha).
  - The sheet palette is computed once over all approved frames (not per frame), so colours do not drift
    between frames, and stored back into `spec.palette.colours`.
- [x] **Validation report** per frame: empty frame, subject touching the frame edge (clipped), height outside tolerance of the clip median, and anchor drift above N px. Shown in G's frame strip as badges, and returned over MCP
  - `shared/src/sprite/validate.ts` `validateFrames(frames, spec): Record<frameKey, SpriteBadge[]>` with
    `SpriteBadge = 'empty' | 'clipped' | 'height' | 'drift' | 'inconsistent' | 'unchecked' | 'grid'`:
    `empty` < 1 % opaque; `clipped` any opaque pixel on the outer row/column before normalisation;
    `height` bounds height outside ±12 % of the clip median; `drift` centroid more than
    `max(2, 0.04 × frameWidth)` px from the anchor after normalisation. `inconsistent`/`unchecked` come
    from D, `grid` from F.
- [x] Pure TS in `shared/src/sprite/` (keying, bounds, centroid, quantise, outline) over RGBA typed arrays. Decode and encode in main
  - `RgbaImage = { width, height, data: Uint8ClampedArray }` in `shared/src/sprite/image.ts`.
  - **Resolved: the pipeline runs in main, one frame at a time** (Decision 7) —
    `processFrame(bytes, spec, ctx)` in `main/media/sprite/frame-pipeline.ts`: `nativeImage` transcodes
    JPEG/WebP to PNG, `decodePng` → `RgbaImage`, the shared kernels, `encodePngRgba8` → `frames/…png` via
    `mediaStore.writeBytes`. Between frames it `await`s `setImmediate`, so a 512-frame render never holds
    the main loop for more than one frame's work (≈ 2 ms at 128²).
- [x] Vitest: a keyed magenta fixture has a clean alpha with no fringe, two frames with offset subjects align to the same anchor, quantisation respects the palette size, and each validation rule fires on its fixture
  - `shared/src/sprite/key.test.ts`: a red disc on `#ff00ff` keys to alpha 0 outside, 255 inside, and no
    pixel with alpha > 0 has G < R − 0.3 (no magenta fringe); `chooseChroma('a pink dragon')` is green.
  - `align.test.ts`: two discs offset by (7, 3) px normalise to identical images.
  - `quantise.test.ts`: `medianCut(…, 16)` yields ≤ 16 colours; `mapToPalette` output uses only palette colours.
  - `validate.test.ts`: one fixture per badge, each firing exactly its badge.

## C — Method picker and the recommendation (S/M)

All three methods are always available. The form *recommends* one (user, 2026-10-04).

- [x] Method selector in the Sheet form: **Hand-drawn**, **Rendered from 3D** and **One-shot sheet**. The recommended method carries a "Recommended" badge and a one-line reason:
  - **Hand-drawn**: `side` perspective (platformers, side-scrollers), or `hand-drawn`/`painterly` style
  - **Rendered from 3D**: `top-down` or `isometric` with 4 or 8 directions, or when a rigged Models asset is attached
  - **One-shot sheet** is never auto-recommended. It is a **Try generating the whole sheet in one image** checkbox, which switches the method when ticked
  - UI: `SpriteMethodPicker` in `sprite-method-picker.tsx` — a `role="radiogroup"` of two cards
    (Hand-drawn, Rendered from 3D), each with an icon (`LuPencil`, `LuBox`), the badge on the recommended
    one (`bg-primary/10 text-primary` pill reading **Recommended**) and the reason below it in
    `text-muted-foreground`; under them the checkbox. Ticking it sets `method: 'one-shot'` and dims the
    cards; unticking restores the previous card.
  - **Rendered from 3D** with no rigged Models asset attached shows **Attach a rigged model…** instead of
    Generate.
- [x] The recommendation is a pure function in `shared` (`recommendSpriteMethod(spec)`), so the UI, MCP and skill agree
  - `shared/src/sprite/recommend.ts`: `recommendSpriteMethod(spec): { method: 'hand-drawn' | 'rendered'; reason: string }`.
    Rules, first match wins: a `reference.kind === 'model'` → rendered, _"A rigged model is attached:
    rendering keeps every direction consistent."_; perspective `top-down`/`isometric` with directions
    ≥ 4 → rendered, _"Top-down and isometric sheets need 4–8 matching directions; rendering from 3D
    guarantees it."_; perspective `side` → hand-drawn, _"Side-scrollers need one facing; hand-drawn frames
    look best."_; style `hand-drawn`/`painterly` → hand-drawn, _"Painterly styles come out best drawn
    frame by frame."_; otherwise hand-drawn, _"Hand-drawn is the general default."_
- [x] Clip presets per perspective (side: idle, walk, run, jump, fall, attack, hurt, die; top-down and isometric: idle, walk, attack and die, per direction) with frame counts and fps, editable
  - `SPRITE_CLIP_PRESETS` in `shared/src/sprite/presets.ts`: side — idle 4@6 loop, walk 8@10 loop,
    run 8@12 loop, jump 4@10 once, fall 2@8 loop, attack 6@12 once, hurt 2@8 once, die 6@8 once;
    top-down/isometric — idle 4@6, walk 8@10, attack 6@12 once, die 6@8 once; front — idle 4@6, walk 8@10.
    Changing perspective replaces clips only if the user has not edited them (a `clipsEdited` flag in form
    state), otherwise asks _"Replace your clips with the <perspective> preset?"_.
- [x] Vitest: the recommendation table, and preset clips per perspective
  - `shared/src/sprite/recommend.test.ts`: one case per rule plus precedence (model attached + side →
    rendered); `presets.test.ts`: frame counts above.
  - `app/src/features/media/sprite/sprite-method-picker.test.tsx`: the badge sits on the card
    `recommendSpriteMethod` names; ticking one-shot sets the method and unticking restores it.

## D — Hand-drawn: reference-locked frame generation (L)

- [x] Step 1, **reference**: generate a character turnaround (front, side, back) or attach one. The user approves it, and the approved reference is locked onto the spec
  - **Generate turnaround** sends `SPRITE_TURNAROUND_PROMPT(spec)` (one image, aspect `3:2`, transparent
    or chroma per B) and writes `reference/turnaround.png`; **Attach** takes a PNG/JPEG/WebP through the
    same bytes path as Phase 105's slots (`media.sprite.setReference({…target, bytes, name})`).
  - The reference card shows the image with **Approve** and **Regenerate**; Approve sets
    `reference.approved = true` and copies it to `reference/reference.png`. Step 2's Generate is disabled
    until approved (tooltip _"Approve a reference first."_). Changing the reference after frames exist asks
    _"Frames were made from the old reference. Keep them?"_ (**Keep** / **Mark all for re-roll**).
- [x] Step 2, **per clip, per frame**: prompts built from a pose table. Built-in pose tables cover each preset clip (for example, the walk cycle's contact, down, passing and up key poses, mirrored for the second half). Each frame is generated with the locked reference attached, through `image-service.ts`, then sent through B
  - `shared/src/sprite/pose-tables.ts`: `SPRITE_POSE_TABLES: Record<presetClipName, string[]>` with one
    pose phrase per preset frame (walk = `contact (left foot forward)`, `down`, `passing`, `up`, then the
    mirrored four); `framePrompt(spec, clip, dir, i): string` composes style + perspective + direction +
    pose + the chroma clause + _"Same character as the reference image. Full body, centred, no text."_
  - A clip with `poses` set uses them verbatim; a custom clip without poses uses
    `frame <i+1> of <n> of a <clip> animation`.
  - Generation order: clip by clip, direction by direction, frame by frame, 2 requests in flight; each
    result goes straight through `processFrame` and is visible in the strip as it lands.
- [x] Providers without reference-image input are disabled for this method, with the reason. The chosen provider and model are recorded on the spec
  - **Resolved: add reference images to the image seam** (Decision 5). `ImageAdapterRequest` gains
    `references?: { bytes: Buffer; mime: string }[]` (≤ 4); `ImageProviderInfo` gains
    `supportsReference: boolean`; `ImageGenerateRequestSchema` gains `references?: string[]` (paths inside
    the same repo's `.midnite/media/`, confined by the media store). Gemini sends them as `inline_data`
    parts before the text part of `generateContent` (`gemini-2.5-flash-image` only; the `:predict`
    Imagen path stays reference-free and is marked unsupported); OpenAI switches to
    `POST /v1/images/edits` (multipart, `image[]`) when references are present; `agy` and Ollama are
    `supportsReference: false`.
  - The picker shows unsupported providers disabled with _"<Provider> can't use a reference image, so
    frames would not match. Pick Gemini or OpenAI."_ The chosen `provider` and `model` are written to the spec.
- [x] **Consistency check**: a vision model (via `engines.ts`) scores each frame against the reference (same outfit, palette, proportions). Frames under the threshold are re-rolled up to a budget, and the remaining failures are flagged, never silently kept
  - `createVisionCall` with `images: [reference, frame]`, `json: true`, and `SPRITE_CONSISTENCY_PROMPT`
    asking for `{"score": 0..1, "issues": string[]}` (parsed by `SpriteConsistencySchema`). Score <
    `consistency.threshold` → re-roll that frame, up to `rerollBudget` times per frame; still failing →
    badge `inconsistent` with the issues as the tooltip.
  - **No vision model installed** (or the call fails): the frame is kept with badge `unchecked`, the job
    report says _"Consistency not checked: <reason>."_, and the toggle **Check consistency** in the form
    shows the install hint. A frame is never silently treated as consistent.
  - The check runs in `stage: 'checking'` after each frame's B pass; it can be switched off per sheet
    (`consistency.enabled`, default true when a vision model exists).
- [x] Mirroring: for side views, generate one facing and mirror it, with an option to generate both when the design is asymmetric
  - Side sheets with 1 direction generate only `e`; **Mirror for the west facing** (default on) writes
    `w` frames as horizontal flips with `source: 'mirrored'` and adds `w` to the export's directions.
    **My character is asymmetric** turns mirroring off and generates `w` with the same pose table.
- [x] Vitest with a stub provider: the pose table expands to the right prompts per frame, re-roll stops at the budget, and failing frames carry their badge into the strip
  - `desktop/src/main/media/sprite/hand-drawn.test.ts` with a stub `ImageProvider` and stub `VisionCall`:
    a walk clip yields 8 prompts containing the eight pose phrases in order; a vision stub always scoring 0.2
    with budget 2 makes exactly 3 requests for that frame and leaves `inconsistent`; a failing vision call
    leaves `unchecked`; mirroring writes 8 `w` frames with `flipped: true`.
  - `desktop/src/main/media/image/image-adapters.test.ts` (existing, extended): with references, OpenAI posts multipart to `/v1/images/edits` and Gemini adds `inline_data` parts.

- [x] The image seam takes reference images and transparency
  - The `ImageAdapterRequest`/`ImageProviderInfo`/`ImageGenerateRequestSchema` changes in item 3 and Theme
    B's `transparent` land together in one PR, before any D frame generation, with `IMAGE_PROVIDERS` set to
    `supportsReference: true` for `gemini` and `openai`, `false` for `agy` and `ollama`.
  - Images-tab behaviour is unchanged when `references` is absent (`image-service.test.ts` passes untouched).

## E — Rendered from a Models character (M/L)

- [x] Pick a Models asset that has a Phase 103 rig and clips. The clip list maps onto sprite clips (`walk` → `walk`), and unmatched clips are listed
  - **Attach a rigged model…** opens a picker over `media.model.library.list` filtered to manifests with
    `rig` and `animations`; the choice sets `reference: { kind: 'model', project, path }`.
  - Mapping: a sprite clip maps to the model clip of the same name (case-insensitive), else to the first of
    `SPRITE_CLIP_ALIASES` (`run → ['sprint', 'jog']`, `attack → ['punch', 'slash', 'swing']`, `die → ['death']`,
    `hurt → ['hit']`). Unmatched sprite clips list under _"No matching animation: jump, fall"_ and are
    skipped; unmatched model clips can be added as new sprite clips with one click.
- [x] Camera presets, orthographic:
  - `side`
  - `top-down` (steep, about 60°)
  - `isometric` (2:1, a camera elevation of about 30°)
  - a custom elevation and azimuth
  - `SpriteRenderSettings = { camera: 'side' | 'top-down' | 'isometric' | 'custom', elevationDeg, azimuthDeg, shading, outline, supersample: 2 | 3 | 4 (4), fps?: number }`.
    Presets: side 0°/90°, top-down 60°/0°, **isometric `atan(0.5)` = 26.565°**/45° — the exact pixel 2:1
    angle (the doc's "about 30°" corrected so tile edges are 2:1 lines), custom as entered.
  - `shared/src/sprite/camera.ts` `spriteCameraMatrix(settings, dirIndex, directions): Mat4` (view
    matrix; yaw = `azimuth + dirIndex × 360° / directions`) and `orthoFit(bounds, frameSize)` (fits the
    model's bounds over all sampled frames, so scale is constant across the whole sheet).
- [x] Directions 1, 4 or 8 (yaw steps), sampled at the clip's fps
  - Sample times `t_i = i / fps` for `i < frames`, where `frames = round(clipDuration × fps)` overrides
    the preset's count (shown in the form as _"walk: 12 frames at 10 fps from the model's 1.2 s clip"_).
- [x] Rendering happens in the renderer with three (`editor-scene.tsx`'s material path) into an offscreen canvas at 2–4× the frame size, then downsampled. Frames are sent to main over IPC for B and storage. Over MCP the render is routed through the open window, the way the Models tools use `emitOpen`; decide here whether a hidden window is needed for headless use, and record why
  - **Resolved: a root-level lazy render host, no hidden window** (Decision 8). `SpriteRenderHost` in
    `app/features/media/sprite/render/sprite-render-host.tsx` is mounted once in the app root (beside the
    other global listeners in `app.tsx`) and imports its three code lazily on the first
    `mediaSpriteRenderRequest`. It renders with a `THREE.WebGLRenderer` on an `OffscreenCanvas` (alpha,
    transparent clear) using the same materials `EditorScene` builds, poses with `samplePose` +
    `skinMatrices`, reads pixels at `supersample ×`, box-downsamples, and posts batches of up to 32 frames
    (base64 PNG) on `mstudio:media:sprite-render-frames` `{ jobId, frames: { clip, dir, index, png }[], done: boolean }`.
  - Main's side: `sprite-service.ts` sends the request to the focused main window (else the first); if
    no window replies on `mstudio:media:sprite-render-ready` within 10 s the job fails with
    _"Rendering from 3D needs the Midnite Studio window open."_ — over MCP this is the result the agent gets.
  - Why not a hidden window: it would load a second full renderer (~300 MB) for a path the user's own
    window already serves; macOS keeps the app alive with zero windows only by explicit quit, which the
    message covers.
- [x] Shading presets: lit (matches Models), toon (2–3 band ramp) and flat. Optional outline pass
  - `lit` = the Models editor's lights; `toon` = `MeshToonMaterial` with a 3-step `gradientMap`
    (`DataTexture` 3×1, `NearestFilter`); `flat` = `MeshBasicMaterial` in each part's colour. Outline = an
    inverted-hull pass (back faces, scaled 1.02, `#000000`) when `outline` is on.
- [x] Pixel-art mode from B applies on top. This is the precise path for retro 8-direction sprites
  - Rendered frames enter `processFrame` with keying skipped (real alpha) and normalisation's scaling
    disabled (the ortho fit already fixes scale), so only pixel mode, outline and validation apply.
- [x] Vitest: the camera matrices for each preset and direction, and clip sampling at fps hits the expected times. A render smoke test runs in e2e only (it needs WebGL), with the browser capability named in the spec header
  - `shared/src/sprite/camera.test.ts`: isometric elevation is 26.565° ± 0.001; direction 2 of 8 is yaw
    +90°; `orthoFit` keeps a 2 m tall model at the same pixel height across all 8 directions.
  - `shared/src/sprite/sampling.test.ts`: a 1.2 s clip at 10 fps samples 12 times at `0, 0.1, … 1.1`.
  - `desktop/src/main/media/sprite/render-relay.test.ts`: no ready reply in 10 s (fake timers) fails the job
    with the literal message; batches append frames in order; `done` finishes the job.
  - `packages/app/e2e/sprite-render.spec.ts` (header: "needs real WebGL + OffscreenCanvas"): renders 1 clip
    × 4 directions of a fixture rigged model and asserts 4 non-empty frames with transparent corners.

## F — One-shot sheet (form toggle) (M)

A strong system prompt and strict post-processing (user, 2026-10-04).

- [x] System prompt in `shared/src/sprite/one-shot-prompt.ts`, versioned and unit-tested as text. It specifies:
  - an exact grid (columns × rows, cell size, gutter)
  - one clip per row, in a stated order
  - a flat chroma background
  - the same character, scale and baseline in every cell
  - no text, borders or labels
  - Exports `ONE_SHOT_PROMPT_VERSION = 1` and `oneShotPrompt(spec, grid: OneShotGrid): string`;
    `OneShotGrid = { columns: max(frames over clips), rows: clips × directions, cell: [w, h], gutter: px }`
    with `gutter = round(0.125 × cell width)`. The version is recorded on `sprite.json`
    (`oneShot: { promptVersion, grid, aspect }`).
  - A sheet whose grid exceeds 8 columns × 8 rows is refused before any request with _"Too many frames
    for one image — use at most 8 frames and 8 rows, or switch to Hand-drawn."_
- [x] Request sizing: the image size is computed from the grid, and the provider's nearest supported size is chosen and recorded
  - The provider takes an aspect, not a size: `nearestAspect(columns × cellW, rows × cellH)` picks the
    `ImageAspect` with the smallest |log(ratio)| difference; the cells are then laid out in the returned
    image's actual pixel size (read from the PNG), not the requested one.
- [x] **Grid detection instead of trust**: projection profiles of non-background pixels find the real gutters, and the result is compared with the requested grid. A mismatch is reported, not forced
  - `shared/src/sprite/grid-detect.ts` `detectGrid(img, chroma): { columns: number[][]; rows: number[][] }`
    (runs of near-empty columns/rows ≥ 2 px wide are gutters); a mismatch with the requested counts makes
    the whole sheet's verdict _"Expected 8 × 4 cells, found 7 × 4. Nothing was sliced."_ and every frame
    gets nothing (no forced re-cut).
- [x] Slicing, then the same B pipeline (keying, normalisation, validation)
  - Each detected cell → `processFrame` with `source: 'sliced'`; a cell bigger than ±20 % of the median
    cell gets badge `grid`.
- [x] A per-row verdict ("row 3, attack: 2 of 6 frames clipped"), with **Regenerate this clip with Hand-drawn**, which hands the failing clip to D using frame 1 of the sheet as the reference
  - `SpriteOneShotVerdict = { rows: { clip, dir, ok: boolean, summary: string }[] }` rendered as a list
    above the strip; a failing row's button sets `reference` to that row's frame `000` (written to
    `reference/reference.png`, `approved: true`) and starts a D job for that clip only, provided the
    provider `supportsReference` (else the button is disabled with D's reason).
- [x] Vitest: grid detection on fixtures with clean, uneven and missing gutters, slicing yields the right cells, and a mismatched grid is reported, not silently re-cut
  - `shared/src/sprite/grid-detect.test.ts` and `one-shot-prompt.test.ts` (the prompt for a 4×2 grid
    contains `4 columns`, `2 rows`, the chroma hex, and `no text`; `nearestAspect(512, 256)` is `16:9`;
    an 8 × 9 grid is refused).

## G — Atlas packing and the animation previewer (M)

- [x] Packer in `shared/src/sprite/pack.ts`:
  - MaxRects (best short-side fit)
  - trim with `spriteSourceSize`/`sourceSize` offsets
  - padding and 1px extrude against bleeding
  - a power-of-two toggle and a max size (2048 or 4096), spilling into multiple pages
  - `packRects(rects: { key, w, h }[], opts: { maxSize: 2048 | 4096 (2048), padding: 0–8 (2), extrude: 0 | 1 (1), pot: boolean (true) }): { pages: { w, h, placements: { key, x, y }[] }[] }`.
    Rotation is never used (Phaser's JSON-hash `rotated` stays false).
  - `trimFrame(img)` returns the trimmed image plus `spriteSourceSize`/`sourceSize`.
- [x] Export:
  - `atlas.png` plus `atlas.json` in **Phaser JSON-hash** format, with an `anims` section
  - an **Aseprite-style** `frameTags` JSON for the same frames
  - frame names `<clip>/<dir>/<n>`
  - **Resolved: one `atlas.json` serves both** (Decision 3, closes the original open). It is Phaser's
    JSON-hash (`frames: Record<name, { frame, rotated: false, trimmed, spriteSourceSize, sourceSize, duration }>`,
    `meta: { app: 'midnite-studio', image: 'atlas.png', size, scale: '1', format: 'RGBA8888', frameTags }`):
    Phaser's `load.atlas` reads `frames` and ignores the rest, while Phaser's `load.aseprite` +
    `anims.createFromAseprite` and Aseprite itself read `duration` and `meta.frameTags`
    (`{ name: '<clip>/<dir>', from, to, direction: 'forward' | 'pingpong' }`; `once` clips are `forward`
    and their repeat is carried by `anims.json`). Frames are emitted in clip → dir → n order so each tag's
    `from..to` is contiguous.
  - **Correction (x1):** Phaser JSON-hash has no `anims` section. Animations ship as `anims.json` in
    Phaser's `AnimationManager.fromJSON` shape — `{ anims: { key: '<asset>/<clip>/<dir>', frames: { key: '<asset>', frame: '<clip>/<dir>/<n>' }[], frameRate, repeat: -1 | 0, yoyo: boolean }[] }`
    (`loop` → repeat −1, `once` → 0, `ping-pong` → repeat −1 + yoyo).
  - **Multiple pages** (Decision 4): when frames exceed one `maxSize` page the export writes Phaser's
    multiatlas form (`atlas.json` with `textures: [{ image: 'atlas-0.png', size, frames: [...] }]`), omits
    `meta.frameTags` (Aseprite cannot read multi-page), and the report warns _"Split across N pages;
    Aseprite tags omitted."_
  - Export destination: a `sprite-pack` folder `<dest>/<asset>.sprite/` (`atlas.png`/`atlas.json`/`anims.json`,
    plus `sprite.json` for provenance), same no-overwrite rule as Phase 105's terrain pack.
    `MEDIA_EXPORT_FORMATS` gains `'sprite-pack'` with `MEDIA_EXPORT_FORMAT_INFO['sprite-pack'] = { label: 'Sprite pack (folder)', ext: '', needsFfmpeg: false }`.
- [x] **Animation previewer** (centre column):
  - clip list; play and pause; fps override; `loop`, `once` and `ping-pong`
  - a direction switcher (a compass for 4 or 8 directions)
  - onion skin (previous and next frames)
  - a checker or solid background
  - pixel-perfect zoom (`image-rendering: pixelated`)
  - an anchor and baseline overlay
  - `SpritePreviewer` in `sprite-previewer.tsx` draws onto a 2D `<canvas>` (no WebGL) from the frames
    PNGs (`mstudioFileUrl('repo', repoId, …)`, `createImageBitmap`), with timing in a pure
    `previewClock(clip, fpsOverride?)` state machine (`step(dtMs)` → frame index) in `preview-clock.ts`.
  - Controls: Space play/pause, `,`/`.` step back/forward, `[`/`]` previous/next clip, `1`–`8` pick a
    direction — all only while the previewer has focus. The compass is 8 `button`s in a `role="radiogroup"`
    (`aria-label="Direction"`), 4 enabled for 4-direction sheets. Zoom is integer `1×`–`8×` (default the
    largest that fits) with `image-rendering: pixelated`. Onion skin shows previous/next at 30 % opacity.
    Background toggles checker (`#cfcfcf`/`#ffffff` 8 px, fixed in both themes) or the theme's `--card`.
  - Overlays: the anchor as a 5 px cross and the baseline as a 1 px line, both `#ff3b30`.
  - Empty state: _"No frames yet. Pick a method and Generate."_; mid-job, frames appear as they land with
    a `Spinner` + `done / total` from `mediaSpriteProgress`.
- [x] **Frame strip** under the player with each frame's B badges, and per-frame re-roll, delete, reorder (drag), nudge the anchor (arrow keys) and flip. All edits are undoable and saved to `frames/`, then re-packed
  - `SpriteFrameStrip` in `sprite-frame-strip.tsx`: one 64 px thumbnail per frame of the current
    clip/direction with badge pills (`empty`, `clipped`, `height`, `drift`, `inconsistent`, `unchecked`,
    `grid`; each has a tooltip naming the rule). Roving tabindex across thumbnails; on a focused frame:
    arrows nudge the anchor 1 px (Shift = 4 px), `H` flips, Delete deletes, `R` re-rolls,
    `Alt+←/→` moves it; drag-and-drop reorders.
  - Every edit is one `media.sprite.patchFrames({ …target, ops: SpritePatchOp[] })` call with
    `SpritePatchOp = { op: 'nudge'; key; dx; dy } | { op: 'flip'; key } | { op: 'delete'; key } | { op: 'move'; key; to: number } | { op: 'reroll'; keys }`
    (≤ 64 ops). Main applies ops to `frames/` + `frames.json` under the WriteQueue and re-packs in memory
    for the previewer (the atlas files are written only on export).
  - Undo/redo: `Mod+Z`/`Mod+Shift+Z` while the strip has focus, from a session-only stack
    (`use-sprite-history.ts`, max 100) of inverse ops; `delete` is undoable because main moves a deleted
    frame to `frames/.trash/` until the asset is closed. Re-roll is not undoable (it is a new generation).
- [x] Vitest: the packer never overlaps rects and respects padding and max size, the Phaser JSON validates against a fixture Phaser accepts, the Aseprite tags match the clips, and the previewer steps frames at the given fps with fake timers
  - `shared/src/sprite/pack.test.ts`: 500 random rects → no overlap incl. padding, every page ≤ maxSize,
    POT dims when `pot`; `atlas.test.ts`: `PhaserAtlasJsonSchema` (zod, written from Phaser's
    `JSONHash` parser fields) and `AsepriteJsonSchema` parse the output; the tags' `from..to` cover exactly
    each clip's frames; `anims.json` keys match tags.
  - `app/src/features/media/sprite/preview-clock.test.ts`: at 10 fps, 250 ms of `step` lands on frame 2;
    `once` stops on the last frame; `ping-pong` reverses.
  - `app/src/features/media/sprite/sprite-frame-strip.test.tsx`: ArrowRight sends a `nudge` op with
    `dx: 1`; `Mod+Z` sends its inverse.

- [x] `sprite-export` writes the pack folder for every asset kind
  - `sprite-export.ts` `exportSprite(asset, dest): GitOpResult<{ path; bytes }>` writes `<asset>.sprite/`
    (sheet/props: `atlas.png`, `atlas.json`, `anims.json`), `<asset>.tileset/` (`tileset.png`, `tileset.tsj`),
    `<asset>.background/` (layer PNGs + `background.json`) or `<asset>.map/` (`map.tmj` with embedded
    tilesets + `tileset.png` + `tileset.tsj`), each with a copy of `sprite.json`; an existing folder is
    refused (_"<name> already exists in that folder."_). Destination is `mediaExportDir` or
    `repos.pickDirectory()`, as in Phase 105.
  - **Landed for sheets (PR #763):** `exportSprite` writes `<asset>.sprite/` and refreshes the asset's own
    `export/`; tilesets, backgrounds, prop sheets and maps answer _"<Kind> export is not available yet."_
    until H, I and J add their branches to it (each theme's export item covers its own kind).
  - Vitest `sprite-export.test.ts`: each kind's folder contains exactly those files and they parse with
    their schemas.

## H — Tilesets with autotiling (L)

- [ ] **Seamless base tiles** per terrain type (grass, dirt, sand, water, stone…), generated through `image-service.ts` with a "tileable, top-down" prompt. Each passes a seam check (wrap-offset by half, then measure edge difference) and, if needed, a seam repair (blend across the wrapped edge) in `shared/src/sprite/seamless.ts`
  - `TilesetSpecSchema`: `kind: 'tileset'`, `name`, `tileSize: 16 | 32 | 48 | 64` (32), `style`, `palette?`,
    `terrains: { id: /^[a-z][a-z0-9-]*$/, label, prompt, collision: 'walkable' | 'solid' | 'water' }[]` (2–8),
    `transitions: { a, b }[]`, `scheme: 'blob47' | 'corner16'` ('blob47'), `seed`.
  - `seamScore(img, axes: 'xy' | 'x')`: mean absolute RGB difference across the wrapped seam divided by
    the mean difference between adjacent interior columns/rows; `≤ 1.5` passes. `repairSeam(img, axes)`
    cross-fades a band of `tileSize / 8` px across the wrapped edge; a tile still failing after repair is
    re-generated once, then kept with a `seam` warning in the report.
  - Generation happens at 256² then downsamples to `tileSize` (pixel mode via B's nearest + palette).
- [ ] **Transition sets built procedurally, not generated tile by tile.** Between two base tiles, composite masks produce a **47-tile blob** set or a **16-tile Wang corner** set (user picks), with mask edges shaped by noise so borders look natural. This is what makes the set precise: every edge matches by construction
  - `shared/src/sprite/autotile.ts`: `BLOB47_MASKS` (the 47 valid 8-neighbour configurations, indexed by
    the standard blob bitmask) and `CORNER16` (4-bit corner index); `transitionMask(config, tileSize, seed)`
    builds an alpha mask whose boundary is displaced by seeded 1-D value noise that is **identical on
    shared edges** (the noise is a function of the edge's world position and the pair, not the tile), so
    neighbours match exactly; `compositeTile(a, b, mask)`.
- [ ] Tile sizes 16, 32, 48 or 64, pixel-art mode from B, and collision flags per tile (solid, water, walkable)
  - A transition tile's collision is the more restrictive of its two terrains (`solid` > `water` > `walkable`).
- [ ] Export: tileset atlas PNG plus Tiled `.tsj` with **wangsets**, so Tiled and Phaser autotile with it
  - **Correction (x1):** Phaser does not autotile at runtime and ignores wangsets; autotiling happens when
    a map is filled (J) and when a human edits in Tiled. The `.tsj` = `{ type: 'tileset', version: '1.10', tiledversion: '1.11.0', name, tilewidth, tileheight, tilecount, columns, image: 'tileset.png', imagewidth, imageheight, margin: 0, spacing: 0, tiles: [{ id, properties: [{ name: 'collision', type: 'string', value }] }], wangsets: [{ name, type: 'mixed' | 'corner', tile: -1, colors: [{ name, color, tile, probability: 1 }], wangtiles: [{ tileid, wangid: number[8] }] }] }`
    — `blob47` is a Tiled `mixed` set, `corner16` a `corner` set.
  - The tileset pack folder is `<asset>.tileset/` (`tileset.png`, `tileset.tsj`, `sprite.json`), exported
    through the same `sprite-pack` format id.
- [ ] Vitest: every blob or Wang tile's edges match its neighbours in all 47 or 16 configurations, the seam check catches a non-tiling fixture, and the `.tsj` validates against a Tiled fixture
  - `shared/src/sprite/autotile.test.ts`: for every pair of configurations that may be adjacent, the
    touching pixel columns/rows are byte-identical; `seamless.test.ts`: a gradient tile fails, a
    wrapped-noise tile passes, `repairSeam` turns the gradient into a pass;
    `tiled.test.ts`: `TiledTilesetSchema` (zod, from the Tiled 1.10 JSON reference) parses the output.

## I — Isometric tiles, parallax backgrounds and prop sheets (M)

- [ ] **Isometric tiles**: 2:1 diamond floor tiles and wall/cliff blocks, made by re-projecting H's top-down tiles (affine to the diamond) or by generating them with an isometric prompt. Same export as H
  - `shared/src/sprite/iso.ts` `toDiamond(tile): RgbaImage` (rotate 45° then scale Y by 0.5, bilinear,
    output `2·size × size`); wall/cliff blocks = the diamond top plus two side faces made from the base tile
    darkened 20 % and 40 %, height `size`. The iso tileset `.tsj` gives each tile a string property
    `kind: 'floor' | 'block'`, and its `tileheight` is the block height so Tiled draws blocks unclipped.
- [ ] **From a Phase 105 terrain**: render a terrain's splat and drape, top-down or isometric, into a tile grid plus a matching `.tmj` (J), so a 3D terrain becomes a 2D map
  - Input: a terrain picked from the Terrain tab's explorer (`media.terrain.get`); `terrainToTiles(drape, cols, rows, tileSize)`
    in `shared/src/sprite/terrain-tiles.ts` slices `build/drape.png` (or the splat bake when no drape)
    into `cols × rows` tiles with `cols = rows = round(worldSize / metresPerTile)` (`metresPerTile` 1–16,
    default 4), dedupes byte-identical tiles, and emits a tileset + a `.tmj` whose `ground` layer
    references them; `collision` comes from the land-cover class per tile (`water` → water, `building` →
    solid). Isometric output re-projects each tile with `toDiamond` and ignores height (stated in the UI:
    _"Isometric maps from terrain are flat; height is not drawn."_). A grid over 256 × 256 is refused.
- [ ] **Parallax backgrounds**: 3–5 layers (sky, far, mid, near), each horizontally seamless (the H seam check on the x axis only) with alpha, plus scroll factors in the export JSON
  - `BackgroundSpecSchema`: `kind: 'background'`, `name`, `prompt`, `size: [w, h]` (`[1920, 1080]`),
    `layers: { name, prompt, scrollFactor: 0–1 }[]` (3–5; default sky 0, far 0.2, mid 0.5, near 0.8).
    Layers except `sky` are generated transparent/chroma-keyed; each passes `seamScore(img, 'x')`.
    Export `background.json` = `{ version: 1, size, layers: { image, scrollFactor }[] }`.
- [ ] **Prop sheets**: a list of props (trees, rocks, crates, barrels, signs) generated one per cell through B, then packed by G
  - `PropSheetSpecSchema`: `kind: 'props'`, `name`, `style`, `cellSize: [w, h]`, `props: { name, prompt }[]` (1–64);
    each prop is one frame `props/<name>/000` through B (no anchor drift rule), packed and exported as a
    G atlas with no `anims.json`.
- [ ] Vitest: diamond re-projection maps corners correctly, parallax layers wrap seamlessly on x, and the terrain-to-tiles grid size matches the terrain extent
  - `iso.test.ts`: the tile's top-left corner lands at the diamond's left vertex `(0, size/2)`;
    `terrain-tiles.test.ts`: a 1024 m terrain at 4 m/tile gives 256 × 256; identical tiles dedupe;
    `seamless.test.ts` x-axis case.

## J — Maps as Tiled `.tmj` (M)

- [ ] Layout from a prompt: an LLM writes a small `MapSpec` (regions, rooms, corridors, paths, spawn and exit points), limited to the terrain types the chosen tileset has, then validated by zod with a repair round, exactly as the Models pipeline repairs designs
  - `MapSpecSchema` in `media-sprite.ts`: `{ width: 8–256, height: 8–256, orientation: 'orthogonal' | 'isometric', base: terrainId, regions: { terrain, shape: 'rect' | 'ellipse' | 'polygon', points: [x, y][] }[], rooms?: { x, y, w, h }[], corridors?: { from: [x, y], to: [x, y], width: 1–4, terrain }[], paths?: { points: [x, y][], terrain }[], objects: { type: 'spawn' | 'exit' | 'point', name, x, y }[] }` (tile units).
    `MapAssetSpecSchema = { kind: 'map', name, prompt, tileset: { group: 'tilesets', asset }, mapSpec?: MapSpec, engine: ModelEngine, decorations?: { props: { group: 'objects', asset }, density: 0–1 } }`.
  - `createLlmCall` with `json: true` and `SPRITE_MAP_PROMPT(prompt, tilesetTerrains)`; parse failures are
    described (`describeIssues`-style, one line per issue) and sent back for up to
    `SPRITE_MAP_MAX_REPAIRS = 2` rounds; a terrain id not in the tileset is an issue
    (`regions[2].terrain: "lava" is not in this tileset (grass, dirt, water)`).
- [ ] Fill in the kernel: regions → terrain-type grid → autotile with H's blob or Wang rules → decoration scatter → collision layer from tile flags
  - `shared/src/sprite/map-fill.ts` `fillMap(mapSpec, tileset, seed): TiledMap` — rasterise in order
    base, regions, rooms, corridors, paths (later wins); autotile each cell with `BLOB47_MASKS`/`CORNER16`
    from its 8 neighbours; scatter decorations by seeded Poisson-disk on `walkable` cells only.
- [ ] Orthogonal and isometric maps. Layers: `ground`, `decoration`, `collision`, and an `objects` layer with spawns, exits and named points
  - `.tmj` = `{ type: 'map', version: '1.10', tiledversion: '1.11.0', orientation, renderorder: 'right-down', width, height, tilewidth, tileheight (half the width for isometric), infinite: false, layers: [ground, decoration (tilelayers, CSV data), collision (tilelayer, one tile per flag, `visible: false`), objects (objectgroup)], tilesets: [embedded] }`.
  - **Resolved: tilesets are embedded in the `.tmj`** (Decision 12) — Phaser's `load.tilemapTiledJSON`
    cannot resolve external `.tsj` references; the `.tsj` is also written beside it for Tiled.
- [ ] Map preview with pan and zoom, a layer toggle and a collision overlay. Existing `.tmj` files can be imported
  - `SpriteMapPreview` in `sprite-map-preview.tsx`: a 2D canvas, drag to pan, wheel/`+`/`-` to zoom
    (integer zoom for pixel tiles), checkboxes per layer, collision drawn as 40 % red (`solid`) / blue
    (`water`). **Import .tmj…** accepts a map whose tilesets are embedded or whose `.tsj` sits beside it;
    one referencing a missing image is refused with _"This map's tileset image <name> is missing."_
- [ ] Vitest: autotile fill picks the right tile for each neighbourhood, the collision layer matches the flags, the `.tmj` validates against a Tiled fixture, and a spec naming an unknown terrain type comes back as a validation result
  - `shared/src/sprite/map-fill.test.ts` (a 5×5 grass map with a 3×3 water island picks the 9 expected blob
    ids), `tiled.test.ts` (`TiledMapSchema` parses; tilesets are embedded),
    `desktop/src/main/media/sprite/map-generate.test.ts` (a stub `LlmCall` returning `lava` gets one repair
    round naming the issue).

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
  - `SPRITE_MCP_TOOL_IDS` (the 16 above plus `sprite_job_status` and `sprite_cancel` — 18; with
    `tileset_*`/`background_*`/`map_*` kept as named for discoverability), `isSpriteMcpToolId`,
    `SPRITE_MCP_WRITE_TOOL_IDS` (open, set_spec, generate, regenerate_frames, patch_frames,
    tileset_generate, background_generate, map_generate, map_patch, export, cancel),
    `SPRITES_OFF_MESSAGE = 'Sprite editing is off — Settings ▸ MCP ▸ Let agents edit sprites and maps'`,
    and `SpriteToolTargetSchema = { repoPath, group, asset }`. Entries inline in `MCP_TOOLS`, ids in the
    `McpToolEntry.id` union, write ids in `mcp.test.ts`'s `writeTools`.
  - **Resolved: generation is asynchronous over MCP** (Decision 10). `sprite_generate`,
    `sprite_regenerate_frames`, `tileset_generate`, `background_generate` and `map_generate` return
    `{ jobId }` at once; `sprite_job_status({ jobId })` returns `{ state: 'running' | 'done' | 'failed' | 'cancelled', done, total, message? }`;
    `sprite_cancel({ jobId })` cancels. No sprite tool needs the slow shim timeout except
    `sprite_render_preview` (`SLOW_CALL_TIMEOUT_MS`), so a 20-minute 8-direction sheet never trips a timeout.
  - `sprite_render_preview` returns `_content` image blocks: one contact sheet PNG per clip (≤ 8 columns,
    frames in reading order on the checker background, no labels) plus, with `animate: clip`, one **APNG**
    of that clip (APNG over GIF: full alpha, and the encoder is `encodePngRgba8` plus `acTL`/`fcTL`/`fdAT`
    chunks in `main/media/png/apng.ts`). The MCP image block's `mimeType` is `image/png`; agents that only
    see the first frame still get the contact sheet.
  - `map_patch` takes `{ ops: ({ op: 'set'; layer; x; y; terrain } | { op: 'object'; type; name; x; y } | { op: 'refill' })[] }`
    and re-runs the autotile; `map_get` returns the `MapSpec` plus layer sizes (not tile arrays).
- [ ] Handlers in `main/media/sprite/sprite-mcp.ts`. A `main/mcp/sprite-tools.ts` gate behind **Settings ▸ MCP ▸ Let agents edit sprites and maps** (default off), with `dispatch.ts` entries and slow-tool timeouts for generate and render
  - `createSpriteTools(deps)` over the same `SpriteService` the IPC handlers use; `setSpriteTools`; private
    `allowed()` → `getMcpAllowSprites()`. Switch: `allowSprites` on `McpSettings` (version +1, `=== true`
    read), `McpSetRequest`, `setMcpAllowSprites` in `main/mcp/index.ts`, `ui-gate.ts` getters, and an
    `Accordion title="Let agents edit sprites and maps"` + `SettingsSwitchRow id="mcp-allow-sprites"` in
    `mcp-page.tsx` under the terrain one.
  - **Provider spend:** an MCP job is capped at `SPRITE_MCP_MAX_REQUESTS = 200` image requests (re-rolls
    included); a job that would exceed it is refused up front with the computed count, so an agent cannot
    run up an unbounded API bill.
  - `sprite_set_spec` and `map_patch` validation failures return `{ ok: false, errors: { path, message }[] }`.
- [ ] Skill `midnite-media-sprite-build` in all copies. It covers method choice (call `sprite_recommend_method` first), the generate → report → re-roll loop, and the export formats Phase 107 consumes
  - Six byte-identical copies (`.claude/`, `.agents/`, `.codex/`, `templates/midnite/{.claude,.agents,.codex}/skills/midnite-media-sprite-build/SKILL.md`),
    added to the list `scripts/skill-copies.test.mjs` (Phase 105 Theme J) checks. Sections: method choice;
    the job loop (`sprite_generate` → poll `sprite_job_status` every ~10 s → `sprite_get_report` →
    `sprite_regenerate_frames` for badged frames → `sprite_render_preview`); environments; export
    (`atlas.json`/`anims.json`/`.tsj`/`.tmj` and what Phase 107's kit reads); the switch to ask for.
- [ ] Vitest: schemas derive from zod, write tools are refused when the switch is off, a failed validation comes back as a result, and a stub-provider generate → report → export round trip works
  - `shared/src/mcp.test.ts` (description rule, minimal parse); `desktop/src/main/media/sprite/sprite-mcp.test.ts`:
    every write tool answers `[refused] Sprite editing is off …` when off; a 300-request job is refused;
    with a stub provider `sprite_generate` → poll until `done` → `sprite_get_report` lists badges →
    `sprite_export` writes a pack whose `atlas.json` parses; `mcp-store.test.ts`: an older file loads
    `allowSprites: false`.

## L — Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] Screenshots (`MSTUDIO_SHOTS=1`, Media ▸ Sprites): method picker with the recommendation, previewer with onion skin and the direction compass, frame strip badges, a one-shot sheet's per-row verdict, a 47-blob tileset, a parallax set, and a generated map
  - `packages/app/e2e/phase-106-sprites-shots.spec.ts` (`OUT = '../../docs/screenshots/phase-106-sprites'`,
    `SHOT_VIEWPORTS.wide`, fixtures seeded with committed frame PNGs under `packages/app/e2e/fixtures/sprites/`).
- [ ] A Phaser smoke page (e2e, needs a real canvas) loads an exported atlas and tileset/map and plays a clip, as the precursor to Phase 107's kit
  - **Resolved: `phaser` as an exact-pinned devDependency of `packages/app`** (Decision 11), imported only
    by `packages/app/e2e/fixtures/phaser-smoke/` (a static page served by the e2e's Vite dev server).
    Version: the one Phase 107 Theme C pins; until 107 C lands, the latest 3.x release, recorded in
    `docs/MEDIA_GAMES.md` once 107 creates it. `bundle-report.mjs` must show no change to the entry chunk.
  - `packages/app/e2e/phaser-smoke.spec.ts` (header: "needs a real canvas and Phaser's WebGL/Canvas
    renderer"): loads a committed exported pack via `load.atlas` + `anims.fromJSON` and a `.tmj` via
    `load.tilemapTiledJSON`, plays `hero/walk/e`, and asserts via `page.evaluate` that the sprite's frame
    name advanced and the map has 4 layers. Declared e2e count +2 (this and `sprite-render.spec.ts`).
- [ ] Human pass: a side-scroller hero (hand-drawn) and an 8-direction isometric character (rendered from a Models rig), both previewed and exported
- [ ] Human pass: the one-shot toggle on a strong provider produces a usable sheet, or a clear per-row verdict
- [ ] Human pass: an agent over MCP builds a tileset and a map, previews them, and exports

## Deferred

- [ ] Skeletal 2D export (Spine, DragonBones) (⏳ deferred)
- [ ] Normal maps for 2D lighting (⏳ deferred)
- [ ] A pixel editor; Aseprite reads the export (⏳ deferred)
- [ ] Wave-function-collapse map generation; rule-based autotile comes first (⏳ deferred)

## Not in this phase

- **A hidden render window.** The root-level render host in the user's own window serves UI and MCP;
  a second renderer process costs ~300 MB for nothing (Decision 8).
- **Runtime autotiling in Phaser.** Phaser ignores wangsets; maps are autotiled when filled (Decision 12).
- **Zipped packs.** Packs are folders, like Phase 105's (Decision 13).
- **Reference images for `agy`, Ollama and Imagen.** Their APIs have no reference input in this tree;
  they are disabled for reference-locked modes, not emulated.
- **Undo for re-roll.** A re-roll is a new paid generation; the old frame is not kept.
- **User-defined groups.** The five kind folders are fixed (Decision 2).
- **Isometric height from terrain.** Terrain-to-iso tiles are flat re-projections.

## Files this phase touches

| Area | Files |
|---|---|
| Kernel (new) | `shared/src/sprite/`: `index.ts` (barrel, exported from [`shared/src/index.ts`](../../../packages/shared/src/index.ts)), `image.ts`, `key.ts`, `align.ts`, `quantise.ts`, `outline.ts`, `validate.ts`, `recommend.ts`, `presets.ts`, `pose-tables.ts`, `camera.ts`, `sampling.ts`, `one-shot-prompt.ts`, `grid-detect.ts`, `pack.ts`, `atlas.ts`, `seamless.ts`, `autotile.ts`, `iso.ts`, `terrain-tiles.ts`, `map-fill.ts`, `tiled.ts`, plus a `*.test.ts` beside each |
| Schemas (new) | `shared/src/media-sprite.ts` (asset union, frames file, report, jobs, IPC payloads, `MapSpecSchema`, `SPRITE_*` constants), `shared/src/media-sprite-mcp.ts` |
| Schemas (edited) | [`shared/src/media.ts`](../../../packages/shared/src/media.ts) (`MEDIA_TABS`, `REPO_SCOPED_MEDIA_TABS`, `MEDIA_EXPORT_FORMATS` + info, `MEDIA_TAB_EXPORT_FORMATS`, `ImageProviderInfo.supportsReference`, `IMAGE_PROVIDERS`, `ImageGenerateRequestSchema.references`); [`shared/src/mcp.ts`](../../../packages/shared/src/mcp.ts) + [`mcp.test.ts`](../../../packages/shared/src/mcp.test.ts); [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) (`allowSprites`), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) |
| Main (new) | `desktop/src/main/media/sprite/`: `sprite-service.ts`, `frame-pipeline.ts`, `hand-drawn.ts`, `render-relay.ts`, `one-shot.ts`, `tileset.ts`, `environment.ts`, `map-generate.ts`, `sprite-export.ts`, `sprite-mcp.ts`; `desktop/src/main/media/png/apng.ts`; `desktop/src/main/ipc/media-sprite-handlers.ts`; `desktop/src/main/mcp/sprite-tools.ts` |
| Main (edited) | [`media/image/types.ts`](../../../packages/desktop/src/main/media/image/types.ts) (`references`, `transparent`), [`gemini.ts`](../../../packages/desktop/src/main/media/image/gemini.ts), [`openai.ts`](../../../packages/desktop/src/main/media/image/openai.ts) (`/v1/images/edits`, `background`), [`image-service.ts`](../../../packages/desktop/src/main/media/image/image-service.ts) (resolve `references`); [`media/model/sf3d/prepare-image.ts`](../../../packages/desktop/src/main/media/model/sf3d/prepare-image.ts) (`alphaBounds` re-exported from shared); [`main/mcp/dispatch.ts`](../../../packages/desktop/src/main/mcp/dispatch.ts), [`ui-gate.ts`](../../../packages/desktop/src/main/mcp/ui-gate.ts), [`main/mcp/index.ts`](../../../packages/desktop/src/main/mcp/index.ts), [`mcp-store.ts`](../../../packages/desktop/src/main/mcp-store.ts), [`ipc/mcp-handlers.ts`](../../../packages/desktop/src/main/ipc/mcp-handlers.ts), [`mcp-shim/index.ts`](../../../packages/desktop/src/mcp-shim/index.ts) (preview timeout), [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts), `main/index.ts` (register handlers) |
| Main (**unchanged**, load-bearing) | `main/media/png/png-codec.ts` (Phase 105), [`media/model/engines.ts`](../../../packages/desktop/src/main/media/model/engines.ts) (`createVisionCall` from 105, `createLlmCall`), [`media/media-store.ts`](../../../packages/desktop/src/main/media/media-store.ts), [`media/model/spec-parse.ts`](../../../packages/desktop/src/main/media/model/spec-parse.ts) (the repair pattern), [`agy.ts`](../../../packages/desktop/src/main/media/image/agy.ts), [`ollama.ts`](../../../packages/desktop/src/main/media/image/ollama.ts) |
| Renderer (new) | `app/src/features/media/sprite/`: `sprite-tab.tsx`, `sprite-explorer.tsx`, `sprite-create-panel.tsx`, `sprite-method-picker.tsx`, `reference-card.tsx`, `sprite-previewer.tsx`, `preview-clock.ts`, `sprite-frame-strip.tsx`, `use-sprite-history.ts`, `one-shot-verdict.tsx`, `tileset-form.tsx`, `background-form.tsx`, `props-form.tsx`, `map-form.tsx`, `sprite-map-preview.tsx`, `use-sprite.ts`, `render/sprite-render-host.tsx`, `render/render-frames.ts`, plus tests |
| Renderer (edited) | [`media-tabs.ts`](../../../packages/app/src/features/media/media-tabs.ts), [`media-view.tsx`](../../../packages/app/src/features/media/media-view.tsx), [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts), [`app.tsx`](../../../packages/app/src/app.tsx) (mount `SpriteRenderHost`), [`mcp-page.tsx`](../../../packages/app/src/features/settings/settings-pages/mcp-page.tsx), [`test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts), `components/icons/icon-names.test.ts`, `packages/app/package.json` (`phaser` devDependency) |
| Renderer (**unchanged**, load-bearing) | [`prompt-input.tsx`](../../../packages/app/src/features/media/prompt-input.tsx), [`components/ai-thread/provider-model-picker`](../../../packages/app/src/components/ai-thread/index.ts), [`image/create-panel.tsx`](../../../packages/app/src/features/media/image/create-panel.tsx) (`imagePickerProviders`), [`model/editor-scene.tsx`](../../../packages/app/src/features/media/model/editor-scene.tsx) (materials) |
| Skills (new) | `midnite-media-sprite-build/SKILL.md` × 6; `scripts/skill-copies.test.mjs` (extended) |
| Tests | kernel vitest per module; desktop `sprite-service.test.ts`, `sprite-export.test.ts`, `hand-drawn.test.ts`, `render-relay.test.ts`, `map-generate.test.ts`, `sprite-mcp.test.ts`, extended `image-adapters.test.ts`/`mcp-store.test.ts`; app `sprite-tab.bridge.test.tsx`, `sprite-method-picker.test.tsx`, `preview-clock.test.ts`, `sprite-frame-strip.test.tsx`; e2e `sprite-render.spec.ts`, `phaser-smoke.spec.ts`, `phase-106-sprites-shots.spec.ts` |

## Verification

- `sprite-service.test.ts` / `sprite-export.test.ts`: busy-asset refusal, cancel keeps frames, each
  pack kind's exact file list parses.
- `media-sprite.test.ts`: defaults per kind, round trip, bad clip name rejected, `spriteDirections`.
- `sprite-tab.bridge.test.tsx`: **Sprites** tab, five groups, seeded asset listed; no repo → `NoRepoMediaState`.
- `key.test.ts` / `align.test.ts` / `quantise.test.ts` / `validate.test.ts`: no fringe, green for pink
  prompts, offset discs align, palette size respected, each badge fires on its fixture.
- `recommend.test.ts` / `presets.test.ts` / `sprite-method-picker.test.tsx`: each rule and precedence,
  preset counts, badge placement, one-shot toggle restore.
- `hand-drawn.test.ts` / `image-adapters.test.ts`: pose prompts in order, re-roll budget,
  `inconsistent` and `unchecked`, mirroring, reference requests per provider.
- `camera.test.ts` / `sampling.test.ts` / `render-relay.test.ts`: 26.565° iso, yaw steps, constant ortho
  scale, 12 samples, 10 s no-window failure message, ordered batches.
- `grid-detect.test.ts` / `one-shot-prompt.test.ts`: clean/uneven/missing gutters, mismatch not re-cut,
  prompt text, aspect choice, 8 × 9 refused.
- `pack.test.ts` / `atlas.test.ts` / `preview-clock.test.ts` / `sprite-frame-strip.test.tsx`: no overlap,
  Phaser and Aseprite schemas parse, tags contiguous, `anims.json` keys, fake-timer stepping, nudge op and
  its undo.
- `autotile.test.ts` / `seamless.test.ts` / `tiled.test.ts`: byte-identical shared edges for all
  adjacent configurations, seam pass/fail/repair, `.tsj` and `.tmj` schemas parse, tilesets embedded.
- `iso.test.ts` / `terrain-tiles.test.ts` / `map-fill.test.ts` / `map-generate.test.ts`: diamond corners,
  256 × 256 grid, dedupe, island autotile ids, unknown terrain repaired.
- `sprite-mcp.test.ts` / `mcp-store.test.ts` / `mcp.test.ts`: refusal when off, 200-request cap, job
  round trip, older settings file loads `allowSprites: false`.
- `scripts/skill-copies.test.mjs`: six identical `midnite-media-sprite-build` copies.
- e2e `sprite-render.spec.ts` and `phaser-smoke.spec.ts` pass; `MAX_DECLARED_E2E` raised by exactly 2.
- `scripts/perf/bundle-report.mjs`: entry chunk unchanged (Phaser is dev-only; the render host is lazy).
- `moon run :typecheck :lint :test` green.
- **Open, for a human:** side-scroller hero (hand-drawn) and 8-direction isometric character (rendered),
  previewed and exported.
- **Open, for a human:** one-shot on a strong provider → usable sheet or a clear per-row verdict.
- **Open, for a human:** an agent over MCP builds a tileset and a map, previews, exports.
- **Open, for a human:** `MSTUDIO_SHOTS=1` screenshots reviewed in `docs/screenshots/phase-106-sprites/`.

## Decisions / open questions

- **All three methods ship; the form recommends one** (user, 2026-10-04). Hand-drawn is recommended for
  side-scrollers and painterly styles. Rendered-from-3D is recommended for top-down and isometric
  multi-direction work. One-shot is opt-in behind a checkbox, with a strong system prompt.
- **Environments are tilesets, isometric tiles, parallax, props and Tiled maps** (user, 2026-10-04 —
  the recommended set).
- **Transitions are composited, not generated** (recommendation, in Theme H). An image model cannot
  guarantee 47 matching edges. Compositing two seamless bases through masks can.

The x1 refinement ran unattended: every area was selected, the posture was *Expand in place · Every
item · Assertion-level · Resolve all with recommendations*, and each question below took its
recommended option. Each entry lists the options that were on the sheet.

1. **Resolved — one Sprites tab with Sheet and Environment modes** (was open). Options: one tab
   `[recommended · S]` · separate Sprites and Environments tabs `[scope+ · M]`. Picked one tab: both
   halves share B, G and the export, and Media already has six tabs after Phase 105.
2. **Resolved — groups are five fixed kind folders.** Options: fixed `characters/objects/tilesets/backgrounds/maps`
   `[recommended · XS]` · user groups like Models `[future-proof · M]`. Picked fixed: the explorer label
   *is* the kind, and Phase 107's asset bridge can find tilesets without a search.
3. **Resolved — one `atlas.json` is both the Phaser JSON-hash atlas and the Aseprite JSON; animations are
   a separate `anims.json`** (was open). Options: one dual-purpose file + `anims.json` `[recommended · S]` ·
   two separate JSON files `[simplicity · S]` · Aseprite only `[minimal · XS]`. Picked dual-purpose:
   Phaser's `load.atlas` and `load.aseprite` read the same file, so no two files can disagree.
4. **Resolved — overflow spills into a Phaser multiatlas and drops Aseprite tags with a warning.**
   Options: multiatlas + warning `[recommended · S]` · refuse to export `[minimal · XS]` · split per clip
   into several single-page atlases `[scope+ · M]`. Picked multiatlas: Phaser reads it natively and the
   loss (Aseprite) is announced.
5. **Resolved — reference images are added to the image seam for Gemini and OpenAI.** Options:
   `references` on `ImageAdapterRequest` + `supportsReference` on `ImageProviderInfo` `[recommended · M]` ·
   describe the reference in text only `[minimal · XS]`. Picked references: text-only cannot lock an
   outfit, and both providers' APIs take images.
6. **Resolved — OpenAI gets real transparency; others use chroma.** Options: `background: 'transparent'`
   for OpenAI + chroma elsewhere `[recommended · XS]` · chroma everywhere `[simplicity · XS]`. Picked
   per-provider: real alpha has no fringe to clean.
7. **Resolved — the frame pipeline runs in main, frame by frame, yielding between frames.** Options:
   main with `setImmediate` yields `[recommended · S]` · a `sprite-worker` utility process `[performance · M]` ·
   the renderer `[minimal · S]`. Picked main: frames arrive one per network round trip and cost ≈ 2 ms
   each at 128², so a worker buys nothing measurable; the one-shot 2048² sheet (~150 ms) is the worst case.
8. **Resolved — 3D renders happen in a root-level lazy render host; no hidden window** (was open).
   Options: root-level `SpriteRenderHost` in the user's window `[recommended · M]` · a hidden
   `BrowserWindow` for headless MCP `[future-proof · M]` · extend `preview.ts` with alpha, cameras and toon
   `[scope+ · L]`. Picked the host: it serves the UI and MCP alike, uses three's real materials (textures,
   toon), and costs nothing until the first job.
9. **Resolved — the consistency check uses Phase 105's `createVisionCall`; with no vision model frames are
   badged `unchecked`.** Options: Ollama vision with an `unchecked` badge `[recommended · S]` · require a
   vision model to generate `[minimal · XS]` · a roster agent `[scope+ · M]`. Picked the badge: generation
   still works offline from Ollama, and nothing is silently assumed consistent.
10. **Resolved — sprite generation over MCP is an asynchronous job.** Options: `{jobId}` +
    `sprite_job_status` + `sprite_cancel` `[recommended · M]` · block with a 20-minute shim timeout
    `[simplicity · XS]`. Picked jobs: an 8-direction sheet is hundreds of requests, and a blocking call
    that long dies with the agent's own turn limits.
11. **Resolved — the Phaser smoke e2e stays in this phase with an exact-pinned dev-only `phaser`.**
    Options: dev-only `phaser` in `packages/app` `[recommended · S]` · move the smoke page to Phase 107
    `[minimal · XS]` · validate against hand-written schemas only `[simplicity · XS]`. Picked dev-only
    Phaser: schemas written from docs can agree with themselves and still be wrong; only Phaser proves the
    files load.
12. **Resolved — `.tmj` embeds its tilesets; autotiling is done at fill time.** Options: embed + also
    write `.tsj` `[recommended · XS]` · external `.tsj` only `[minimal · XS]`. Picked embed: Phaser's Tiled
    loader cannot follow external tilesets.
13. **Resolved — packs are folders (`<asset>.sprite/`, `<asset>.tileset/`), one `sprite-pack` format id.**
    Options: folder `[recommended · XS]` · zip `[scope+ · M]`. Picked folder, matching Phase 105's
    `terrain-pack`.
14. **Resolved — one generation job per asset, two image requests in flight, an MCP cap of 200 requests.**
    Options: those limits `[recommended · S]` · unlimited concurrency `[performance · XS]` · latest-wins
    replacement `[minimal · XS]`. Picked the limits: provider rate limits and spend are the scarce
    resources, and a second click must not silently discard a paid run.
15. **Resolved — isometric tiles use the exact 2:1 angle, 26.565°.** Options: `atan(0.5)` `[recommended · XS]` ·
    the doc's "about 30°" `[minimal · XS]`. Picked 26.565°: 30° gives 1.73:1 tile edges, which no 2:1
    isometric tileset matches.
16. **Resolved — frame-strip undo is a session-only inverse-op stack; deletes go to `frames/.trash/`.**
    Options: session stack `[recommended · S]` · persisted history `[scope+ · M]` · no undo `[minimal · XS]`.
    Picked session stack: the theme promised undo, and frames are files main can restore.
17. **Resolved — Phaser's version follows Phase 107 Theme C.** Options: follow 107 C, latest 3.x until
    then `[recommended · XS]` · pin Phaser 4 now `[future-proof · S]`. Picked follow: one Phaser version
    across both phases, decided where the engine is vendored.
18. **Resolved — Phaser has no JSON-hash `anims` section and no runtime autotiling; both claims are
    corrected in the theme text** (G, H). No options: these were facts found in the audit.
