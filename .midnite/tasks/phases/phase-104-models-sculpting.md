# Phase 104 — Models: sculpting, SDF and mesh fidelity

Requested by the user · 2026-10-04 · grounded against the tree as of `83c22584`.

Media ▸ Models still builds every procedural model from **primitives**: a JSON list of boxes, spheres,
cylinders, capsules and revolved profiles that the shared kernel turns into closed meshes, combined
with booleans and modifiers ([Phase 99](phase-99-media-page.md) Themes F, G, I, J;
[Phase 103](phase-103-models-rig-anim.md)). That is good for Lego-like, hard-surface and stylised
assets, and a ceiling for everything organic: faces, muscles, cloth folds, creatures, semi-realistic
props. The user wants Claude to work on **an actual mesh**, with real sculpting, from the UI and over
MCP.

This phase gives Models the full fidelity stack:

1. **A mesh core** that can hold about 1M vertices, edited in a worker, stored as a binary beside
   the sidecar.
2. **SDF modelling.** Claude blocks organic forms as signed-distance fields (smooth unions,
   displacement, noise), which is the most LLM-friendly way to describe shape. The kernel turns them
   into a mesh.
3. **Sculpt mode.** The classic brush set with multires levels and voxel remesh, so detail can be
   carved where it is needed.
4. **Sculpting over MCP** that Claude can actually aim: on a preview it just looked at, by named
   region, by world-space path, or through SDF edits.
5. **A real mesh pipeline:** decimate, retopology, UV unwrap and normal/AO bake, with Phase 103 rigs
   surviving any of it.
6. **Texture painting and PBR materials** on the sculpted mesh.
7. **A reference-driven agent loop** that sculpts towards a picture.

> **Builds on.**
> - **The kernel**, [`shared/src/model-geometry/`](../../../packages/shared/src/model-geometry/):
>   [`scene.ts`](../../../packages/shared/src/model-geometry/scene.ts) (`buildScene` → world-space
>   `MeshPart`s), [`csg.ts`](../../../packages/shared/src/model-geometry/csg.ts) (BSP booleans),
>   [`modifiers.ts`](../../../packages/shared/src/model-geometry/modifiers.ts),
>   [`raw.ts`](../../../packages/shared/src/model-geometry/raw.ts) (the capped raw `mesh` shape),
>   [`math.ts`](../../../packages/shared/src/model-geometry/math.ts) (row-major `Mat4`), and Phase 103's
>   [`rig.ts`](../../../packages/shared/src/model-geometry/rig.ts),
>   [`skin.ts`](../../../packages/shared/src/model-geometry/skin.ts) and
>   [`rig-ops.ts`](../../../packages/shared/src/model-geometry/rig-ops.ts). Pure TS, no three, so it runs
>   in main, a worker, the renderer and bare vitest alike.
> - **The design**, `ModelSpecSchema` in
>   [`shared/src/media-model.ts`](../../../packages/shared/src/media-model.ts). Every addition so far has
>   been optional, so old sidecars load byte-identically. Phase 103's SF3D work adds an imported `asset`
>   part; sculpting extends that idea to a first-class, editable mesh part.
> - **The library layout and `model.json`** from #704,
>   [`shared/src/media-model-library.ts`](../../../packages/shared/src/media-model-library.ts):
>   `.midnite/media/model/<group>/<model>/` already holds the sidecar, exports and binary assets.
> - **The MCP tools**, [`shared/src/media-model-mcp.ts`](../../../packages/shared/src/media-model-mcp.ts)
>   and [`main/media/model/model-mcp.ts`](../../../packages/desktop/src/main/media/model/model-mcp.ts),
>   plus the iterative render-look-patch loop in
>   [`iterative.ts`](../../../packages/desktop/src/main/media/model/iterative.ts). They are
>   schema-derived, validation failures come back as results, write tools are gated by
>   `Settings ▸ MCP ▸ Let agents edit 3D models`, and the pass budget comes from the 1–100 refinement
>   slider.
> - **Previews**, [`main/media/model/preview.ts`](../../../packages/desktop/src/main/media/model/preview.ts):
>   named-view renders that the agent already looks at, which is where screen-space aiming starts.
> - **Exporters**: the hand-written
>   [`gltf-writer.ts`](../../../packages/desktop/src/main/media/model/gltf-writer.ts) (skin, animation,
>   textures since #720), [`obj-writer.ts`](../../../packages/desktop/src/main/media/model/obj-writer.ts)
>   and [`fbx-writer.ts`](../../../packages/desktop/src/main/media/model/fbx-writer.ts), round-tripped
>   through three's `GLTFLoader` in vitest.
> - **The editor**, [`app/features/media/model/`](../../../packages/app/src/features/media/model/):
>   [`model-editor.tsx`](../../../packages/app/src/features/media/model/model-editor.tsx) with #717's
>   compact `IconSelect` toolbar and top-centre viewport widgets,
>   [`editor-scene.tsx`](../../../packages/app/src/features/media/model/editor-scene.tsx),
>   [`editor-state.ts`](../../../packages/app/src/features/media/model/editor-state.ts) (the undoable
>   reducer), and the inspector tabs (Properties, Material, Boolean, Modifiers, Rig, Animation).
>
> **Scope guardrails.**
> - **No new export formats.** Sculpted meshes leave through `.glb` (preferred, PBR plus skin), `.obj`
>   and `.fbx`.
> - **No GPU compute brushes.** Brushes run on the CPU, in a worker, on typed arrays, so they are pure TS
>   and testable under vitest. WebGPU compute is a later phase if 1M vertices proves too few.
> - **No neural generation.** That is Phase 103's SF3D. Its output is simply one more mesh this phase
>   can sculpt.
> - **Every existing primitive design loads, builds and exports exactly as before.** Sculpting is
>   opt-in per part, by converting a part or design into a mesh.
> - **Package boundaries hold.** Kernel and schemas live in `shared` (zod only, no three, no electron).
>   Workers and file I/O live in `desktop` main. Rendering and UI live in `app`, which reaches main
>   only through `window.midniteStudio`.
>
> **Effort tags:** **S** ≤ half a day · **M** 1–2 days · **L** 3+ days, likely 2–3 PRs.

## Headlines

**Theme A — Mesh core and storage.** ✅ Landed alone, as planned. The kernel gained `model-geometry/mesh/`: `EditableMesh` (typed-array positions/normals/indices, CSR vertex→face adjacency, a dirty set so only the one-ring of moved vertices gets new normals, and `takeDelta()` for the changed vertex range), a flat-array `Bvh` (quickselect median split, `refit()` after a stroke, ray and sphere queries), the versioned `.mesh.bin` (32-byte header, CRC-32, byte-stable round trip, readable refusals for a foreign, truncated, corrupt, older or newer file) and the capped, rotating `.ops.jsonl` op log. `ModelSpecSchema` has an optional `sculpt` part (`src` + content `hash` + counts + `multiresLevel`) resolved through the same hash registry as `asset`, skinned per vertex, never a boolean operand; old sidecars parse unchanged. Main reads and writes both files through a new `mstudio:media:model-mesh` `op` channel inside the media store's jail, refusing bytes that do not decode, and `model.json` gains a `sculpt` summary plus `files.mesh`. **Decision: the sculpt worker is a renderer Web Worker** (`app/features/media/model/sculpt/`, inlined `?worker&inline` like Monaco's), because a per-dab IPC hop to a utility process would cost more than the dab; only saves cross to main. Deltas travel as transferable typed arrays and the display patches its `BufferAttribute`s with `addUpdateRange`. Storage is `.mesh.bin` only — the embedded-`.glb` alternative was not built. A `displace` request stands in for brushes until Theme D. No visible UI yet beyond the inspector's sculpt-part line.

**Theme B — Primitives → mesh.** ✅ Any design becomes sculptable. `model-geometry/mesh/voxel-remesh.ts` builds a narrow-band signed-distance volume from a triangle soup (exact point-to-triangle distance within two voxels, big triangles split first) and signs it with a **winding count along +x rays**, not parity, so overlapping primitives (a head sunk into a torso) read as one solid; `surface-nets.ts` then extracts the zero isosurface (it resolves checkerboard grid faces so every edge is shared by exactly two triangles, and Theme C reuses it for SDF bakes). `convert.ts` plans a conversion from the kernel's own scene (booleans, modifiers and transforms applied; a selection or the whole design), keeps each source part as a **vertex group** (`.mesh.bin` flag bit 0 appends a u16 per vertex; the sculpt part's `groups` table carries name and colour), and applies it as one edit: the primitives stay in the design, hidden, listed in the sculpt part's `sources`, so `revertSculptToParts` and undo bring them back. Resolution is a voxel size or a target vertex count, coarsened (and reported) when the grid would pass 16M nodes. The editor gets a **Mesh** tab (scope, detail, voxel size, Convert, Revert to parts); the remesh runs in the sculpt worker (`remesh` request) and the file is written through `mediaModelMesh` before the design adopts it. `model_convert_to_mesh` does the same over MCP, directly in main. **Decisions:** the remesh result is a fresh mesh in world space at the origin (no transform), so a rigged design converts but is skinned by nearest bone and the tool warns; per-vertex groups live in the binary rather than the sidecar so they survive brush strokes; no Theme-B-specific smoothing pass (surface nets already sits within a voxel of the source).

**Theme C — SDF modelling.** ✅ Organic block-in as signed-distance trees. `media-model-sdf.ts` holds the schema: named nodes, each with a position, Euler rotation, a **uniform** scale (so the field stays a true distance) and an optional colour; seven primitives on the part kernel's own conventions (sphere, ellipsoid, capsule, rounded box, torus, cone, cylinder), three operators with a smooth `k` (union, subtract, intersect), six modifiers (displace by fractal value noise, twist, bend, round, shell, mirror), and `applySdfOps` for edits by name (add, update, remove, move, wrap, blend). `model-geometry/sdf/` compiles a tree once into allocation-free closures plus per-node bounds and a Lipschitz bound, and bakes it with **octree block pruning**: 32³-node blocks split down to 4³, and any block whose centre is provably more than its half-diagonal plus 1.5 voxels from the surface is filled instead of evaluated, so a 256³ sphere evaluates under 30 % of its nodes and the sparse bake is bit-identical to the dense one. Surface nets (Theme B's) extracts the mesh, and every vertex joins the vertex group of the primitive nearest it, coloured by its node. The result is a `sculpt` part carrying `sdf: { tree, resolution }`, and each bake's op log opens with an `sdf` entry holding the tree, so the shape can be edited and re-baked until the first brush stroke. The editor gets an **SDF** tab: a node tree (add, wrap, reorder, outdent, remove), per-kind fields, blend sliders that show a live 40³ preview in the viewport (scene only, never history) and bake at the chosen resolution (64–256) on release, each bake one undo step; the bake runs in the sculpt worker (`sdfBake`). `model_sdf_set`, `model_sdf_patch` and `model_sdf_bake` do the same over MCP. **Decisions:** the tree lives on the sculpt part (the editable source) and is mirrored into the op log; each bake writes a content-named file (`<stem>.<part>.<hash8>.mesh.bin`) so undo across a re-bake never points at an overwritten file; the roots are an implicit (smooth) union; modifiers wrap exactly one child under the same `children` key operators use; `model_sdf_set` needs an existing design. **Bench** (vitest on an M-series Mac, head + capsule + displaced ellipsoid, blend 0.1): 64³ 0.11 s, 128³ 0.56 s, 256³ 1.8 s (2.7M of 5.3M nodes evaluated — the ellipsoid and displacement raise the Lipschitz bound, which thickens the evaluated shell).

**Theme D — Sculpt mode and brushes.** ✅ Sculpting on the worker-owned mesh, from the editor. The kernel gained `model-geometry/sculpt/`: `applyDab` with nine brushes (draw, clay strips, inflate, smooth, grab, crease, flatten, pinch and a mask brush, each with an invert), six falloff curves, front-faces-only, and every brush computing its targets from a snapshot so visiting order never matters; `mirrorDab` for X/Y/Z symmetry in local space or through the part's world matrix (a dab on the mirror plane is applied once), so Theme E's MCP strokes mirror exactly like a hand-drawn one; Loop-subdivision `Multires` whose levels keep their **detail** (positions minus the smooth subdivision of the level below), so sculpting a low level and stepping back up carries the fine detail along; and `SculptDocument`, which owns mesh, BVH, mask, levels and a per-stroke history (sparse before/after records for strokes and masks, multires snapshots for subdivide, level steps and voxel remesh, capped at 100, revisions counted absolutely) with `seek(revision)`. Strokes are spaced by `spacing × radius` along the surface, pressure scales strength, and grab drags along the view plane even off the surface. Theme A's placeholder `displace` request is gone: the worker speaks `strokeBegin/strokeTo/strokeEnd`, `mask`, `subdivide`, `level`, `voxelRemesh` and `seek`, and posts only the changed vertex and mask ranges. In the editor a **Sculpt** tab (brush grid, radius in screen pixels or metres, strength, falloff, spacing, lazy mouse, pen pressure, front faces only, symmetry, mask invert/clear, subdivide, level, voxel remesh) drives a `SculptController`; the viewport draws the worker's geometry at the part's transform with a brush ring, left-drag sculpts (Ctrl/Cmd inverts, Shift smooths), and orbit moves to the right button. `F`/`Shift+F` drag radius/strength, `[`/`]` step the radius, `Mod+I`/`Alt+M` invert/clear the mask — all through the editor key map, only in sculpt mode. **Decisions:** a sculpt edit is one reducer step (`sculptEdit`) that bumps a new optional `revision` on the part and drops its SDF tree on the first edit (closing Theme C's note); undo/redo change the revision and the controller seeks the worker there, reloading only for a hash it has never seen. Strokes stay in the worker until **Done sculpting** or Save, which write a content-named `<stem>.<part>.<hash8>.mesh.bin` (op log carried over plus this session's strokes and a `save` entry) and repoint the part without a history step, so undo past a save still finds its file. Only the current multires level is written to `.mesh.bin`; the stack is session-only. Catmull-Clark is not built: `.mesh.bin` is triangles only, so Loop is the only scheme that applies. Masks are session-only and show as darkened vertex colour. Screenshots: [`docs/screenshots/p104-d/`](../../../docs/screenshots/p104-d/).

**Theme E — Sculpting over MCP.** ✅ Strokes an agent can aim. `model-geometry/camera.ts` makes the preview camera data (`previewCamera`/`pixelRay`; `renderView` now fits through it), so the pixels an agent read off a `model_render_preview` hit the same surface — the last preview's camera per view is remembered and rescaled to the stroke's image size. `sculpt/aim.ts` resolves the four target forms against the live mesh's BVH: **screen** (pixels on `front/back/left/right/side/top/iso/three_quarter`, polylines densified in pixel space, `radiusPixels`), **region** (a rig bone — one dab at its middle or swept `along` it, restricted to its skin influence — a landmark, a vertex group, or a primitive part's footprint), **world** (points or a path, snapped to the surface) and **mask** (dabs spread over what the mask leaves open); a bad target is a validation result with a sentence, never a throw. `sculpt/landmarks.ts` detects `top_of_head`, `nose_tip`, `chin`, ears, hands and feet from the rig and bounds (a compact model is read as a bust, a tall one as a figure), and `spec.landmarks` overrides any of them. Eleven tools: `model_get_landmarks` (read) and `model_sculpt_stroke`, `model_mask` (set by region or visible-surface lasso, grow, shrink, invert, clear), `model_subdivide`, `model_remesh`, `model_sculpt_undo` behind the models switch. **Decisions:** each (model, part) keeps a live `SculptDocument` keyed to the hash of the file it last wrote, so a mask and 100 steps of history survive between calls and a change from anywhere else reloads from disk; every mesh-changing call writes a content-named `.mesh.bin` plus an op-log line like the SDF tools (files are not yet garbage-collected), and the first stroke drops the SDF tree; a stroke answers a summary (`moved`, `maxDisplacement`, aim note) with a 256 px thumbnail, a mask-only call writes nothing. In-app runs: sculpt calls do not spend the render budget but are bounded by it (12 per refinement pass, never under 24), and the total call ceiling rose to 400. The skill (all six copies) now carries the workflow. Landmark editing in the UI is deferred.

**Theme F — Mesh pipeline: remesh, retopology, UVs, bakes, rig transfer.** ✅ A dense sculpt to an engine asset, all in `model-geometry/mesh/`. `decimate.ts` is quadric edge collapse (heap with lazy invalidation, link-condition and normal-flip checks) that locks every open edge — and since an unwrap splits seams into separate vertices, UV seams are open edges too, so borders and seams survive by construction. `uv.ts` grows charts by normal cone and edge fold (seams by angle and curvature), flattens each with LSCM (matrix-free Jacobi-CG, falling back to a planar projection when a chart folds), rotates charts to tight boxes at one texel density and shelf-packs them with a gutter; it reports texel density, so charts never overlap. `bake.ts` casts from each low-poly texel onto the high-poly BVH for a tangent-space normal map (per-vertex tangents from the UVs with glTF's flipped v), ambient occlusion, curvature and cavity, dilated into the gutter. `retopo.ts` voxel-remeshes onto a lattice searched to the face target, snaps back onto the source and pairs triangles into quads (axis-aligned, not flow-aligned). `skin-transfer.ts` moves weights across a topology change (nearest surface, smoothed, at most four influences, normalised). **Decisions:** skin in this codebase is derived per vertex from the rig and the geometry on every build, so the rig survives any edit by construction — the transfer is used to *prove* it: each op reports the skin's `drift` between the transferred and the re-derived weights. `mesh.bin` gained version 2 with a uv block (files without UVs still write as version 1, byte-identical); a sculpt part gained `uv`, `maps` (PNG files with content hashes) and `bakeFrom`; `model_decimate`/`model_retopo` add a low-poly copy and hide the original as the bake source unless `replace`; an unwrapped mesh cannot be brushed (seams are split vertices), the editor says so, and `model_unwrap` with `clear` welds it back. Exports: `.glb` carries UVs, `normalTexture` and `occlusionTexture`; `.obj` writes `vt` and `map_Bump`/`map_Ka`; `.fbx` writes a UV layer (no textures). Tools: `model_decimate`, `model_retopo`, `model_unwrap`, `model_bake`, `model_export`. Bakes run on the CPU with event-loop yields; 2048 is the default, so a first look at 1024 is cheaper. Field-aligned retopology is deferred.

**Theme G — Texture painting and PBR materials.** ✅ A sculpt part carries a PBR layer stack. `media-model-pbr.ts` holds the schema — an optional `pbr` on `sculpt` parts with per-channel `sizes` (default the unwrap's `textureSize`, else 2K), `layers` bottom → top and the `flattened` export set — and the kernel's `model-geometry/paint/` does the work: `PaintSurface` (BVH plus a per-size **texel map**, triangle per texel, dilated 4 texels into the gutter so a dab's extrapolated barycentrics bleed across seams), six brushes (`brush`, `eraser`, `fill` = the uv island under the hit, `smudge`, `clone` from an offset read off a stroke-start snapshot, `stamp` through an alpha projected on the dab), per-stroke tile history, `flattenChannel`/`flattenPbr` (base = part colour and material plus the baked ao and normal, then fill and paint layers by opacity × mask × coverage through eight blend modes; normals combine by whiteout), ORM packing and seven presets (skin, metal, painted metal, wood, stone, fabric, plastic) as fill stacks with object-space noise and curvature/cavity masks. Over MCP: `model_layer_list`, `model_material_set`, `model_layer_add`/`_update`/`_remove` and `model_paint_stroke` (aimed exactly like `model_sculpt_stroke`, with a thumbnail that now samples the flattened base colour). In the editor a **Paint** tab enters paint mode on an unwrapped part: the viewport draws the live flattened textures on a `MeshStandardMaterial` (re-flattening only the dab's rectangle), and the tab has brushes, channel, colour/value, radius, the layer list (visibility, opacity, blend, mask, order, delete), a fill editor, presets and texture size; sculpt mode gained a **matcap** toggle, and the ordinary viewport now draws painted parts' PBR maps and unpainted parts' baked normal/occlusion. Exports: `.glb` writes `baseColorTexture`, the packed `metallicRoughnessTexture` (occlusion in R, so `occlusionTexture` shares it), `normalTexture` and `emissiveTexture`; `.mtl` writes `map_Kd`/`map_Bump`/`map_Ke`. **Decisions:** layer pixels are RGBA PNGs with coverage in alpha (scalars in red), content-named `<stem>.<part>.<layer>-<channel>.<hash8>.png` beside the flattened `…pbr-<output>.<hash8>.png`, written through a new `writeTexture` op on the mesh channel (PNG-only, ≤4096); a painted mask starts empty (hides the layer, paint reveals) and a bake mask without its bake hides the layer; every MCP write re-flattens only the outputs the change can touch; the editor paints on the renderer main thread (unwrapped meshes are low-poly) with its own PNG codec on three's `fflate` (a canvas round trip would premultiply low-coverage colour away); painted strokes undo inside paint mode (Mod+Z there walks them), stack edits are ordinary reducer steps; decimate/retopo/re-unwrap drop the material, because its pixels belong to the old uv layout. **Not built:** symmetry for paint strokes, a per-layer image import, and ORM in `.obj` (MTL has no packed map). Screenshots: [`docs/screenshots/p104-g/`](../../../docs/screenshots/p104-g/).

**Theme H — Reference-driven agent loop.** ✅ The agent can now sculpt towards a picture and know how close it is. A design carries `spec.referenceViews` (`media-model-reference.ts`): per view (front, side, top) the picture file beside the design, a scale in px/m and the pixel offset of the origin. `model_set_reference_views` writes them, or `fit` segments a picture and fits it to a subject height. The kernel (`model-geometry/reference/`) rasterises a mask of the model from each matched orthographic view and scores it against the segmented picture: 0.6 × IoU + 0.4 × width-profile agreement over 12 bands up the up axis, averaged across views. Regions are reported as too wide, narrow, tall or short, and the height is a separate finding. `model_compare_reference` (read-only, no render pass) returns the scores, the region verdicts, the loop state and an overlay image. `planReferencePass` drives the loop through block-in, convert, region and refine stages until the score reaches 0.96 or plateaus (eps 0.01, patience 2) or the pass budget — the 1–100 refinement slider — runs out. Iterative runs emit a `score` on progress, and the model panel shows one text line, "Reference match 0.62 → 0.81"; the prompt and all six model-build skill copies teach the loop. **Decisions:** segmentation uses alpha when more than 1% is transparent, else the border-median background with a colour distance threshold of 48, with no component clean-up; pictures are reduced by an integer factor to at most 1024 px and non-PNG formats decode through `nativeImage`; score history lives in memory per model inside the compare tool. **Not built:** an editor UI to align views by hand (deferred).

**Theme I — Verification.** ◻ Not started.

## Build order

1. **A + B** (foundation): mesh core, storage, conversion. Merged before anything else starts.
2. **C · D · F · G** in parallel, each on its own branch. D and F share the multires/remesh code,
   so whichever lands second rebases.
3. **E** follows C and D, because it wraps their operations as tools.
4. **H** last, on top of C, D and E.

## A — Mesh core and storage (M)

A first-class editable mesh that can hold about 1M vertices without stalling the renderer.

- [x] `EditableMesh` in `shared/src/model-geometry/mesh/`: typed-array positions, normals and indices, with vertex→face adjacency and a dirty-region set, so normals are recomputed only where something changed
- [x] BVH over triangles (build, refit after a stroke, ray and sphere queries) for brush hits and raycasts
- [x] A `sculpt` part kind on `ModelSpecSchema`: optional and backward-compatible, referencing a binary mesh file beside the sidecar (it is not inlined in JSON), with its transform, material and rig binding like any other part
- [x] Binary mesh storage: `<model>/<stem>.mesh.bin` (or embedded `.glb`) with a versioned header and a checksum. Read and write in desktop main through the model library, behind a `GitOpResult` IPC envelope
- [x] An operation log beside it (`<stem>.ops.jsonl`): compact entries for SDF edits, strokes, remesh and subdivide, used for undo across reloads and as a replayable history the agent can read. Capped and rotated
- [x] A sculpt worker (desktop utility process or renderer Web Worker; decide in A and record why) that owns the live `EditableMesh`. The renderer gets transferable typed-array deltas for the changed vertex ranges
- [x] three.js display that updates only the changed `BufferAttribute` ranges (`addUpdateRange`), never a full re-upload per stroke
- [x] `model.json` summary: vertex and face counts, multires level, has-textures
- [x] Vitest: adjacency correct on closed and open meshes, BVH ray hits match brute force, binary round trip is byte-stable, a corrupt or old header is refused with a readable error, old sidecars still parse

## B — Primitives → mesh (S/M)

Every existing design becomes sculptable.

- [x] "Convert to sculpt mesh" for a part, a selection or the whole design: kernel CSG result → voxel remesh → one watertight `sculpt` part, keeping material assignment as vertex groups
- [x] Voxel remesh in the kernel (signed-distance volume from the source mesh, then isosurface), with a resolution control in voxel size or target vertex count
- [x] Convert keeps the original primitives hidden but recoverable, so undo and "revert to parts" work
- [x] `model_convert_to_mesh` MCP tool
- [x] Vitest: a converted capsule or robot is watertight (every edge shared by two faces), and its volume and bounds stay within tolerance of the source

## C — SDF modelling (M/L)

Blocking organic form the way an LLM can describe it.

- [x] SDF node schema in shared: primitives (sphere, ellipsoid, capsule, rounded box, torus, cone, cylinder), operators (union, subtract, intersect, each with a smooth `k`), modifiers (displace by noise, twist, bend, round, onion/shell, mirror), each node with a transform and a name
- [x] Kernel evaluator: batched SDF evaluation over a sparse grid with interval or bounds pruning, so a 256³ field stays fast
- [x] Isosurface by **surface nets** (smooth and cheap) as the default, producing an `EditableMesh` that feeds straight into sculpt mode. Dual contouring for sharp features is a follow-up item
- [x] The SDF result is a `sculpt` part whose op log starts with its SDF tree, so "re-mesh from SDF at a higher resolution" stays possible until the first brush stroke
- [x] SDF tree panel in the editor: add, reorder and nest nodes, blend `k` sliders, a live preview at low resolution and a full-resolution bake on release
- [x] `model_sdf_set`, `model_sdf_patch` (add, update or remove nodes by name) and `model_sdf_bake` MCP tools
- [x] Vitest: known distances for each primitive, smooth-union continuity, surface nets on a sphere produce a closed mesh within tolerance of the analytic radius

## D — Sculpt mode and brushes (L)

The brush set in the editor, on the worker-owned mesh.

- [x] Sculpt mode toggle in the Models editor (enter on a `sculpt` part, or offer to convert). The brush settings go in an inspector tab, keeping the #717 toolbar compact, and nothing covers the top-centre viewport widgets
- [x] Brushes: **draw**, **clay** (strips), **inflate**, **smooth**, **grab**, **crease**, **flatten**, **pinch**, plus a **mask** brush and mask invert/clear
- [x] Brush controls: radius (screen or world), strength, falloff curve presets, spacing, front-faces-only, and the `F`/`Shift+F` radius and strength drag. Shortcuts go through the existing editor key map, not new global chords
- [x] Symmetry on X, Y and Z, in local or world space, applied in the kernel so MCP strokes mirror too
- [x] **Multires**: subdivide (Catmull-Clark on quads, Loop on triangles) into levels, step between levels, and keep detail per level
- [x] **Voxel remesh** in sculpt mode, to even out stretched topology (shares Theme B's remesher)
- [x] Undo and redo per stroke through the editor-state reducer, backed by the op log; a stroke is one undo step
- [x] Stroke smoothing (lazy mouse) and pressure from the pointer event when a tablet reports it
- [x] Vitest for each brush on a small grid mesh: direction and magnitude of displacement, falloff respected, mask respected, symmetry mirrors exactly, smooth reduces curvature variance, and the vertex count is unchanged except by subdivide or remesh

## E — Sculpting over MCP (M)

Strokes Claude can actually aim. All four aiming modes are in; SDF edits lead for form and brush strokes refine.

- [x] `model_sculpt_stroke`: brush, radius, strength, falloff and symmetry, with **one of** four target forms:
  - **Screen space:** pixel points on a named preview view (`front`, `back`, `left`, `right`, `top`, `three_quarter`, or a camera from the last `model_render_preview`), raycast onto the surface by the BVH. The view's camera is returned with every preview, so the same pixels hit the same surface
  - **Semantic regions:** a rig bone (`leftUpperArm`, from Phase 103's table), a named landmark, or a part or vertex group, with an optional falloff and a "along the bone" path
  - **World space:** xyz points or a path, for scripts and precise work
  - **Mask-then-brush:** apply to the current mask
- [x] `model_mask` (set, grow, shrink, invert or clear, by region or screen-space lasso), plus `model_subdivide`, `model_remesh` and `model_sculpt_undo`
- [x] Landmarks: an auto-detected set (top of head, nose tip, chin, ears, hands, feet) from the rig and the bounds, overridable per design (`spec.landmarks`), and readable via `model_get_landmarks`
- [x] Every stroke response includes a fresh preview thumbnail and a short change summary (vertices moved, max displacement), so the render-look-sculpt loop needs fewer calls
- [x] The tool-call and timeout budgets in `iterative.ts` account for sculpt calls (strokes are cheap, previews are not), and the 1–100 refinement-pass slider still bounds a run
- [x] The model-build skill (`midnite-media-model-build`, all six copies) learns the workflow: block in with SDF, convert, sculpt by region, refine by screen-space strokes on previews
- [x] Vitest: a screen-space stroke on a known camera hits the expected triangles, a semantic-region stroke stays inside its bone's influence, invalid targets come back as validation results (not throws), and write tools are refused when the MCP models switch is off

## F — Mesh pipeline: remesh, retopology, UVs, bakes, rig transfer (M)

From a dense sculpt to an asset an engine can use.

- [x] **Decimate** (quadric edge collapse) to a target triangle count or ratio, keeping UV seams and borders
- [x] **Retopology (quad-dominant)**: an even, quad-dominant lattice remesh to a target face count, snapped back onto the sculpt (axis-aligned, not flow-aligned; field-aligned retopology is deferred). Manual retopology tools are out of scope
- [x] **Auto UV unwrap**: seams by angle and curvature, then LSCM or ABF-lite parameterisation and chart packing, with a texel-density readout
- [x] **Bakes from high to low**: tangent-space normal map (MikkTSpace-style per-vertex tangents from the UVs, so glTF engines read it right), ambient occlusion, plus curvature and cavity maps for texturing. Default 2K, up to 4K
- [x] **Rig weight transfer**: after a remesh, subdivide, decimate or retopology on a rigged model, the Phase 103 skeleton is kept and the skin weights are transferred (nearest-surface, then smoothed and normalised to at most 4 influences), so clips still play
- [x] Export: `.glb` with the low-poly mesh, UVs, baked maps as PBR textures, skin and animation; `.obj`/`.fbx` static with UVs and textures where those writers support them
- [x] `model_decimate`, `model_retopo`, `model_unwrap`, `model_bake` and `model_export` options over MCP
- [x] Vitest: decimation hits its target and keeps the mesh closed, UVs lie in [0,1] with no overlapping charts, a baked normal map of a bumped plane reproduces the bump direction, transferred weights stay normalised, and the exported glb re-imports through `GLTFLoader` with textures, skin and clips

## G — Texture painting and PBR materials (L)

Making the sculpt read as a real material.

- [x] PBR material model on `sculpt` parts: albedo, roughness, metalness, normal (painted, layered over baked), AO and emissive, with per-channel resolution
- [x] **Layer stack**: fill and paint layers, opacity and blend modes, masks, and layers from the Theme F bakes (curvature and cavity for edge wear and dirt)
- [x] **Paint brushes** in a paint mode next to sculpt mode: brush, eraser, fill, smudge, clone, stamp/alpha from an image, projected onto UV texture space through the BVH with seam bleeding
- [x] Material presets (skin, metal, painted metal, wood, stone, fabric, plastic) as layer stacks
- [x] Viewport shading uses the PBR channels in three.js (`MeshStandardMaterial`/`MeshPhysicalMaterial`), plus a matcap toggle for sculpting
- [x] Texture storage: PNG per channel per layer in the model folder, plus a flattened export set. Large textures are written in desktop main, never through renderer `localStorage`
- [x] `model_paint_stroke` (with the same four aiming modes as Theme E), `model_material_set` and `model_layer_*` MCP tools
- [x] glb export writes the flattened PBR set (`baseColorTexture`, `metallicRoughnessTexture` packed, `normalTexture`, `occlusionTexture`, `emissiveTexture`)
- [x] Vitest: paint lands at the right UV texels for a known hit, layer blending maths, metallic/roughness packing, and the glb material round trip

## H — Reference-driven agent loop (M)

Claude sculpting towards a picture.

- [x] Reference image on a model (already attachable) gets **matched views**: the user or agent aligns front, side and top cameras to the reference (orthographic, with scale and offset), saved on the design
- [x] **Silhouette and proportion scores** in the kernel: render a mask from each matched view, compare with the reference's segmented silhouette (IoU, plus per-region width profiles along the up axis), and report which regions are too wide, narrow, tall or short
- [x] An iterative mode for sculpting: SDF block-in → convert → region strokes → screen-space refinement, each pass guided by the scores and by Claude's own look at the side-by-side, until the score plateaus or the pass budget runs out
- [x] The pass budget comes from the existing 1–100 refinement slider, and live progress shows the score per pass in the editor
- [x] `model_compare_reference` MCP tool returning the scores and an overlay image
- [x] Vitest: identical silhouettes score 1, a known widening is reported in the right region, and the loop stops on plateau

## I — Verification

- [ ] `moon run :typecheck :lint :test` green
- [ ] Perf numbers from `scripts/perf/` or a dedicated bench on the packaged-equivalent app: stroke latency at 250k / 1M vertices, SDF bake time at 128³ / 256³, decimate and bake times. Recorded in this doc
- [ ] Screenshots (`MSTUDIO_SHOTS=1`, navigating to Media ▸ Models): SDF tree panel, sculpt mode with brushes, multires levels, the UV/bake result, paint mode with layers, and the reference loop's score overlay
- [ ] An exported sculpted, textured, rigged `.glb` re-imports in vitest with textures, skin and clips
- [ ] Human pass: a semi-realistic bust built by Claude through MCP (SDF block-in → sculpt → bake → paint), opened in Blender and a game engine
- [ ] Human pass in the packaged app: sculpting a 1M-vertex mesh stays responsive, and idle CPU drops when sculpt mode is idle or the window is blurred (the visibility gates)

## Deferred

- [ ] Dynamic topology (dyntopo): local split and collapse under the brush (⏳ deferred, fights multires and UVs)
- [ ] Dual contouring for SDF sharp features (⏳ deferred, surface nets first)
- [ ] Landmark editing in the editor UI, beyond `spec.landmarks` (⏳ deferred)
- [ ] Field-aligned (flow) retopology, beyond the axis-aligned lattice (⏳ deferred)
- [ ] Garbage collection of superseded `.mesh.bin` files written by MCP strokes (⏳ deferred)
- [ ] WebGPU compute brushes for 5M+ vertices (⏳ deferred)
- [ ] Editor UI to align matched reference views by hand (⏳ deferred; the agent aligns them with `model_set_reference_views` `fit`)

## Files this phase touches

| Area | Files |
|---|---|
| Kernel | [`shared/src/model-geometry/`](../../../packages/shared/src/model-geometry/): new `mesh/` (editable mesh, BVH, multires, remesh, decimate, retopo, uv, bake), `sdf/` (nodes, evaluator, surface nets), `sculpt/` (brushes, mask, symmetry), `paint/`, `reference/`; [`skin.ts`](../../../packages/shared/src/model-geometry/skin.ts) for weight transfer |
| Schemas | [`shared/src/media-model.ts`](../../../packages/shared/src/media-model.ts) (`sculpt` part, SDF tree, materials), [`media-model-library.ts`](../../../packages/shared/src/media-model-library.ts) (manifest summary), [`media-model-mcp.ts`](../../../packages/shared/src/media-model-mcp.ts) (new tool ids) |
| Main | [`main/media/model/`](../../../packages/desktop/src/main/media/model/): mesh and texture storage in [`model-library.ts`](../../../packages/desktop/src/main/media/model/model-library.ts), a sculpt worker, [`model-mcp.ts`](../../../packages/desktop/src/main/media/model/model-mcp.ts), [`iterative.ts`](../../../packages/desktop/src/main/media/model/iterative.ts) budgets, [`preview.ts`](../../../packages/desktop/src/main/media/model/preview.ts) (matched views, masks), [`gltf-writer.ts`](../../../packages/desktop/src/main/media/model/gltf-writer.ts) (PBR textures) |
| Editor | [`app/features/media/model/`](../../../packages/app/src/features/media/model/): [`model-editor.tsx`](../../../packages/app/src/features/media/model/model-editor.tsx) (mode mount points), [`editor-scene.tsx`](../../../packages/app/src/features/media/model/editor-scene.tsx) (partial attribute updates, brush cursor), [`editor-state.ts`](../../../packages/app/src/features/media/model/editor-state.ts), new `sculpt-panel.tsx`, `sdf-panel.tsx`, `paint-panel.tsx`, `layers-panel.tsx`, `reference-panel.tsx` |
| Skills | `midnite-media-model-build` (all six copies) |
| Tests | Kernel vitest per theme, desktop vitest for storage, MCP and glb, app vitest via the mock bridge, `MSTUDIO_SHOTS` screenshot spec |

## Decisions / open questions

- **All four aiming modes are in, with SDF first for form** (user, 2026-10-04). Screen-space strokes on
  a named-view preview are the main way Claude aims, because they play to a vision model's strengths.
  Semantic regions (rig bones, landmarks, parts) handle coarse shaping. World-space paths serve scripts.
  SDF edits do the block-in before any brush touches the mesh.
- **Storage is a baked binary mesh plus an operation log** (user, 2026-10-04). The JSON sidecar
  references a versioned binary; the op log gives undo across reloads and a history the agent can read.
  Op-log-only replay was rejected as slow to load and fragile across kernel changes.
- **About 1M vertices on a CPU worker** (user, 2026-10-04). Typed arrays, BVH and partial GPU uploads.
  Pure TS stays testable. GPU compute is deferred.
- **Texture painting and full PBR are in this phase** (user, 2026-10-04), as Theme G (L).
- **Detail grows by multires plus voxel remesh** (user, 2026-10-04). Dynamic topology is deferred.
- **Rigs survive sculpting by weight transfer** (user, 2026-10-04). The skeleton is kept and weights are
  re-transferred after any topology change, so Phase 103 clips keep playing.
- **Foundation first, then parallel themes** (user, 2026-10-04): A + B land alone, then C, D, F and G in
  parallel, E after C and D, and H last.
- **Isosurface method, open.** Recommendation: surface nets first (simple, smooth, cheap to make
  watertight), dual contouring as the deferred follow-up for hard edges.
- **Texture resolution default, open.** Recommendation: 2K per channel by default, up to 4K, with the
  texel-density readout steering it.
- **Normal-map space, open.** Recommendation: tangent space computed MikkTSpace-compatibly, because
  that is what glTF engines expect. Object-space maps would break under skinning.
- **Where the sculpt worker lives, open, decided in Theme A.** Recommendation: a renderer Web Worker
  for brush latency (no IPC hop per dab), with saves going through IPC to main. A desktop utility process
  only if memory pressure in the renderer proves a problem.
