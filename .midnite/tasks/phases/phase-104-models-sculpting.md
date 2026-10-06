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

**Theme C — SDF modelling.** ◻ Not started.

**Theme D — Sculpt mode and brushes.** ◻ Not started.

**Theme E — Sculpting over MCP.** ◻ Not started.

**Theme F — Mesh pipeline: remesh, retopology, UVs, bakes, rig transfer.** ◻ Not started.

**Theme G — Texture painting and PBR materials.** ◻ Not started.

**Theme H — Reference-driven agent loop.** ◻ Not started. Lands last.

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

- [ ] SDF node schema in shared: primitives (sphere, ellipsoid, capsule, rounded box, torus, cone, cylinder), operators (union, subtract, intersect, each with a smooth `k`), modifiers (displace by noise, twist, bend, round, onion/shell, mirror), each node with a transform and a name
- [ ] Kernel evaluator: batched SDF evaluation over a sparse grid with interval or bounds pruning, so a 256³ field stays fast
- [ ] Isosurface by **surface nets** (smooth and cheap) as the default, producing an `EditableMesh` that feeds straight into sculpt mode. Dual contouring for sharp features is a follow-up item
- [ ] The SDF result is a `sculpt` part whose op log starts with its SDF tree, so "re-mesh from SDF at a higher resolution" stays possible until the first brush stroke
- [ ] SDF tree panel in the editor: add, reorder and nest nodes, blend `k` sliders, a live preview at low resolution and a full-resolution bake on release
- [ ] `model_sdf_set`, `model_sdf_patch` (add, update or remove nodes by name) and `model_sdf_bake` MCP tools
- [ ] Vitest: known distances for each primitive, smooth-union continuity, surface nets on a sphere produce a closed mesh within tolerance of the analytic radius

## D — Sculpt mode and brushes (L)

The brush set in the editor, on the worker-owned mesh.

- [ ] Sculpt mode toggle in the Models editor (enter on a `sculpt` part, or offer to convert). The brush settings go in an inspector tab, keeping the #717 toolbar compact, and nothing covers the top-centre viewport widgets
- [ ] Brushes: **draw**, **clay** (strips), **inflate**, **smooth**, **grab**, **crease**, **flatten**, **pinch**, plus a **mask** brush and mask invert/clear
- [ ] Brush controls: radius (screen or world), strength, falloff curve presets, spacing, front-faces-only, and the `F`/`Shift+F` radius and strength drag. Shortcuts go through the existing editor key map, not new global chords
- [ ] Symmetry on X, Y and Z, in local or world space, applied in the kernel so MCP strokes mirror too
- [ ] **Multires**: subdivide (Catmull-Clark on quads, Loop on triangles) into levels, step between levels, and keep detail per level
- [ ] **Voxel remesh** in sculpt mode, to even out stretched topology (shares Theme B's remesher)
- [ ] Undo and redo per stroke through the editor-state reducer, backed by the op log; a stroke is one undo step
- [ ] Stroke smoothing (lazy mouse) and pressure from the pointer event when a tablet reports it
- [ ] Vitest for each brush on a small grid mesh: direction and magnitude of displacement, falloff respected, mask respected, symmetry mirrors exactly, smooth reduces curvature variance, and the vertex count is unchanged except by subdivide or remesh

## E — Sculpting over MCP (M)

Strokes Claude can actually aim. All four aiming modes are in; SDF edits lead for form and brush strokes refine.

- [ ] `model_sculpt_stroke`: brush, radius, strength, falloff and symmetry, with **one of** four target forms:
  - **Screen space:** pixel points on a named preview view (`front`, `back`, `left`, `right`, `top`, `three_quarter`, or a camera from the last `model_render_preview`), raycast onto the surface by the BVH. The view's camera is returned with every preview, so the same pixels hit the same surface
  - **Semantic regions:** a rig bone (`leftUpperArm`, from Phase 103's table), a named landmark, or a part or vertex group, with an optional falloff and a "along the bone" path
  - **World space:** xyz points or a path, for scripts and precise work
  - **Mask-then-brush:** apply to the current mask
- [ ] `model_mask` (set, grow, shrink, invert or clear, by region or screen-space lasso), plus `model_subdivide`, `model_remesh` and `model_sculpt_undo`
- [ ] Landmarks: an auto-detected set (top of head, nose tip, chin, ears, hands, feet) from the rig and the bounds, editable in the UI, and readable via `model_get_landmarks`
- [ ] Every stroke response includes a fresh preview thumbnail and a short change summary (vertices moved, max displacement), so the render-look-sculpt loop needs fewer calls
- [ ] The tool-call and timeout budgets in `iterative.ts` account for sculpt calls (strokes are cheap, previews are not), and the 1–100 refinement-pass slider still bounds a run
- [ ] The model-build skill (`midnite-media-model-build`, all six copies) learns the workflow: block in with SDF, convert, sculpt by region, refine by screen-space strokes on previews
- [ ] Vitest: a screen-space stroke on a known camera hits the expected triangles, a semantic-region stroke stays inside its bone's influence, invalid targets come back as validation results (not throws), and write tools are refused when the MCP models switch is off

## F — Mesh pipeline: remesh, retopology, UVs, bakes, rig transfer (M)

From a dense sculpt to an asset an engine can use.

- [ ] **Decimate** (quadric edge collapse) to a target triangle count or ratio, keeping UV seams and borders
- [ ] **Retopology (quad-dominant)**: a field-aligned remesh to a target face count, good enough for animation-friendly topology. Manual retopology tools are out of scope
- [ ] **Auto UV unwrap**: seams by angle and curvature, then LSCM or ABF-lite parameterisation and chart packing, with a texel-density readout
- [ ] **Bakes from high to low**: tangent-space normal map (MikkTSpace-compatible, so glTF engines read it right), ambient occlusion, plus curvature and cavity maps for texturing. Default 2K, up to 4K
- [ ] **Rig weight transfer**: after a remesh, subdivide, decimate or retopology on a rigged model, the Phase 103 skeleton is kept and the skin weights are transferred (nearest-surface, then smoothed and normalised to at most 4 influences), so clips still play
- [ ] Export: `.glb` with the low-poly mesh, UVs, baked maps as PBR textures, skin and animation; `.obj`/`.fbx` static with UVs and textures where those writers support them
- [ ] `model_decimate`, `model_retopo`, `model_unwrap`, `model_bake` and `model_export` options over MCP
- [ ] Vitest: decimation hits its target and keeps the mesh closed, UVs lie in [0,1] with no overlapping charts, a baked normal map of a bumped plane reproduces the bump direction, transferred weights stay normalised, and the exported glb re-imports through `GLTFLoader` with textures, skin and clips

## G — Texture painting and PBR materials (L)

Making the sculpt read as a real material.

- [ ] PBR material model on `sculpt` parts: albedo, roughness, metalness, normal (painted, layered over baked), AO and emissive, with per-channel resolution
- [ ] **Layer stack**: fill and paint layers, opacity and blend modes, masks, and layers from the Theme F bakes (curvature and cavity for edge wear and dirt)
- [ ] **Paint brushes** in a paint mode next to sculpt mode: brush, eraser, fill, smudge, clone, stamp/alpha from an image, projected onto UV texture space through the BVH with seam bleeding
- [ ] Material presets (skin, metal, painted metal, wood, stone, fabric, plastic) as layer stacks
- [ ] Viewport shading uses the PBR channels in three.js (`MeshStandardMaterial`/`MeshPhysicalMaterial`), plus a matcap toggle for sculpting
- [ ] Texture storage: PNG per channel per layer in the model folder, plus a flattened export set. Large textures are written in desktop main, never through renderer `localStorage`
- [ ] `model_paint_stroke` (with the same four aiming modes as Theme E), `model_material_set` and `model_layer_*` MCP tools
- [ ] glb export writes the flattened PBR set (`baseColorTexture`, `metallicRoughnessTexture` packed, `normalTexture`, `occlusionTexture`, `emissiveTexture`)
- [ ] Vitest: paint lands at the right UV texels for a known hit, layer blending maths, metallic/roughness packing, and the glb material round trip

## H — Reference-driven agent loop (M)

Claude sculpting towards a picture.

- [ ] Reference image on a model (already attachable) gets **matched views**: the user or agent aligns front, side and top cameras to the reference (orthographic, with scale and offset), saved on the design
- [ ] **Silhouette and proportion scores** in the kernel: render a mask from each matched view, compare with the reference's segmented silhouette (IoU, plus per-region width profiles along the up axis), and report which regions are too wide, narrow, tall or short
- [ ] An iterative mode for sculpting: SDF block-in → convert → region strokes → screen-space refinement, each pass guided by the scores and by Claude's own look at the side-by-side, until the score plateaus or the pass budget runs out
- [ ] The pass budget comes from the existing 1–100 refinement slider, and live progress shows the score per pass in the editor
- [ ] `model_compare_reference` MCP tool returning the scores and an overlay image
- [ ] Vitest: identical silhouettes score 1, a known widening is reported in the right region, and the loop stops on plateau

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
- [ ] WebGPU compute brushes for 5M+ vertices (⏳ deferred)

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
