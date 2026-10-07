---
name: midnite-media-model-build
description: Build or edit a 3D model in Midnite Studio's Media ▸ Models page through the model_* tools on the midnite MCP server — write a spec, render, look, patch, save. Use when the user wants a 3D model made or changed.
---

# Media ▸ Models — build

A model is a structured `ModelSpec` (a list of coloured, transformed primitives with materials and modifiers), not a mesh. The app validates the spec and builds the geometry itself. Coordinates are metres-ish, right-handed, **Y up**; rotations are Euler degrees applied X, Y, Z; a part is scaled, then rotated, then translated.

## Layout

```
<repo>/.midnite/media/model/<project>/
  <name>.obj (+ .mtl)   geometry
  <name>.fbx            same model, FBX
  <name>.json           sidecar holding the spec — the source of truth
```

`model_list` returns the files; every tool takes a project-relative path of any one of them.

## Tools (server `midnite`, i.e. `mcp__midnite__<tool>`)

The user must enable Settings ▸ MCP and "Let agents edit 3D models".

| Tool | Use |
|---|---|
| `model_list` | what exists |
| `model_get_spec` | the live spec **and its schema** — fetch before writing |
| `model_set_spec` | create or replace a whole design |
| `model_patch_parts` | small edits, up to 64 ops per call |
| `model_render_preview` | views `front`, `side`, `top`, `iso`; 128–768 px; `pose: {clip, time}` renders a rigged model mid-clip |
| `model_get_reference_image` | the user's reference picture, if any |
| `model_save` | write the obj/mtl/fbx/json trio so the editor is clean |
| `model_open` | show a model in the app window |
| `model_get_rig` | anatomy, bones, part bindings, clips, the bone-name table and any rig problems |
| `model_auto_rig` | set `anatomy` (`biped`, `quadruped`, `vehicle`, `static`) and place a rig from the parts |
| `model_patch_rig` | move/add/remove bones, bind parts to bones, facing, skin `falloff` |
| `model_patch_animations` | add/update/remove clips by name; `setKeys` for additive pose keys |
| `model_retarget` | copy another rigged model's clips by canonical bone name |
| `model_convert_to_mesh` | turn the primitives (or the named `parts`) into one watertight `sculpt` mesh by voxel remesh (`voxelSize` or `targetVertices`); each source part stays as a vertex group and the primitives stay hidden in the design |
| `model_sdf_set` | block an organic form as a signed-distance `tree` (`{nodes, blend?}`) and bake it into a `sculpt` part (`part` replaces one, `resolution` 16–256, default 96) |
| `model_sdf_patch` | edit an SDF part's tree by node name — `add` (`node`, `parent?`, `index?`), `update` (`name`, `set`), `remove`, `move`, `wrap` (in an operator/modifier), `blend` — and re-bake |
| `model_sdf_bake` | re-bake an SDF part at another `resolution` (low while shaping, 192–256 once the form is right) |
| `model_get_landmarks` | the named points (`top_of_head`, `nose_tip`, `chin`, `left_ear`, `left_hand`, `left_foot`, …) found from the rig and bounds, with any the design's `landmarks` override |
| `model_sculpt_stroke` | brush a `sculpt` part: `brush` (draw, clay, inflate, smooth, grab, crease, flatten, pinch, mask), `strength`, `radius` (metres), `falloff`, `symmetry`, and exactly one `target` — see below. Returns a thumbnail and `{moved, maxDisplacement}` |
| `model_mask` | `op` set / grow / shrink / invert / clear; `set` takes a `region` (bone, landmark, group, part) or a screen `lasso`; masked vertices are spared by every stroke |
| `model_subdivide` / `model_remesh` | add Loop-subdivision levels; or voxel-remesh to even topology (`voxelSize` / `targetVertices`) |
| `model_sculpt_undo` | step back (or `redo`) through this session's strokes, masks and remeshes, with a thumbnail |
| `model_decimate` / `model_retopo` | make a low-poly copy (`targetTriangles` / `ratio`, or `targetFaces`), hide the original as the bake source; the rig is kept |
| `model_unwrap` | UVs: seams by `angle` and `curvature`, charts packed, texel density reported; `clear: true` welds it back so it can be sculpted again |
| `model_bake` | normal (tangent space), occlusion, curvature and cavity maps from the hidden high-poly part onto the unwrapped low-poly one (`size` 2048 default, 4096 max; try 1024 first) |
| `model_export` | write `.glb` (PBR, skin, clips, baked maps), `.obj` (+ `.mtl`, uvs, maps) and `.fbx` (uvs) by `formats` |

Loop: `model_get_spec` (schema), `model_set_spec`, `model_render_preview` and actually look, `model_patch_parts`, repeat, `model_save`. Never invent part fields — the schema from `model_get_spec` is authoritative. Applied or rejected-with-reasons comes back on every write.

Rig and animate after the shape is right: `model_auto_rig`, check `model_get_rig` (fix with `model_patch_rig`), add clips from the anatomy's kinds with `model_patch_animations`, then `model_render_preview` with a `pose` to look. Bone names come only from the table `model_get_rig` returns; the `.glb` carries the skin and one animation per clip.

A `sculpt` part is a dense mesh in a `.mesh.bin` beside the design, never hand-written: it only comes from `model_convert_to_mesh` or an SDF bake. Convert once the form is right (booleans and modifiers are baked in), then rig and animate as usual; the converted mesh is skinned per vertex by nearest bone. To go back, remove the sculpt part and un-hide the primitives listed in its `sources`.


**SDF block-in** (organic forms — heads, creatures, cloth folds): every node has a unique `name`, optional `position`, `rotation` (Euler degrees), uniform `scale` and `color` (its vertex group's colour, inherited by children). Primitives: `sphere {radius}`, `ellipsoid {radii}`, `capsule {radius, height}` (height = straight section, along Y), `box {size, radius?}` (radius rounds it), `torus {radius, tube}` (ring in XZ), `cone {radius, height}` (apex up), `cylinder {radius, height}`. Operators hold `children` and an optional smooth `k`: `union`, `subtract` (first child minus the rest), `intersect`. Modifiers wrap exactly one child: `displace {amplitude, frequency, octaves?, seed?}`, `twist {angle}` (°/m about Y), `bend {angle}` (°/m along X), `round {radius}`, `shell {thickness}`, `mirror {axis}` (reflects the positive side). Shape at low resolution, look at a preview, patch by name, then `model_sdf_bake` finer. The tree stays on the part until the first brush stroke.
**Sculpting workflow** (organic forms): block in with `model_sdf_set`/`model_sdf_patch` at low resolution, then `model_render_preview` and look. Sculpt by region first (coarse shaping: `target: {mode:'region', bone:'head'}`, `landmark:'nose_tip'`, `group`, or `along: true` a bone), then refine by pixels on a preview you just looked at (`target: {mode:'screen', view:'front', size:384, points:[[x,y],...]}` — `x,y` are pixels from the picture's top-left, the preview's own camera, so the same pixels hit the same surface; `radiusPixels` sizes the brush in that picture). `world` takes xyz points or a path (snapped to the surface), and `mask` spreads dabs over whatever the mask leaves open. Use `invert` to carve instead of build, `symmetry:{x:true}` to mirror, `model_mask` to protect finished areas, `model_sculpt_undo` to take a stroke back, `model_subdivide` before fine detail and `model_remesh` when strokes stretch the topology. A stroke's answer names how many vertices moved and the largest move: if `moved` is 0 the aim missed or the area is masked. The first stroke drops the SDF tree, so re-baking is no longer possible.

**Mesh pipeline** (a dense sculpt to an engine asset): `model_decimate` (or `model_retopo` for even quad-dominant topology) makes a low-poly copy and hides the sculpt as its bake source; `model_unwrap` the copy; `model_bake` high onto low; `model_export` for `.glb`. A rigged design keeps its skeleton and skin through all of it. An unwrapped mesh cannot be sculpted (its seams are split vertices) — `model_unwrap` with `clear: true` first. Retopology is an even lattice, not flow-aligned; bakes are CPU-bound, so look with `size: 1024` before 2048 or 4096.

## Conventions

- Do not hand-write `.obj`/`.fbx`; edit the spec only.
- Prefer patches over resets once a design is close.

## Hand-off to the UI

Finish with `model_save` then `model_open` so the user lands on the model in **Media ▸ Models ▸ `<project>`**, where they can orbit, tweak and export.
