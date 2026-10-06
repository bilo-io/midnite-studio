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

Loop: `model_get_spec` (schema), `model_set_spec`, `model_render_preview` and actually look, `model_patch_parts`, repeat, `model_save`. Never invent part fields — the schema from `model_get_spec` is authoritative. Applied or rejected-with-reasons comes back on every write.

Rig and animate after the shape is right: `model_auto_rig`, check `model_get_rig` (fix with `model_patch_rig`), add clips from the anatomy's kinds with `model_patch_animations`, then `model_render_preview` with a `pose` to look. Bone names come only from the table `model_get_rig` returns; the `.glb` carries the skin and one animation per clip.

A `sculpt` part is a dense mesh in a `.mesh.bin` beside the design, never hand-written: it only comes from `model_convert_to_mesh`. Convert once the form is right (booleans and modifiers are baked in), then rig and animate as usual; the converted mesh is skinned per vertex by nearest bone. To go back, remove the sculpt part and un-hide the primitives listed in its `sources`.

## Conventions

- Do not hand-write `.obj`/`.fbx`; edit the spec only.
- Prefer patches over resets once a design is close.

## Hand-off to the UI

Finish with `model_save` then `model_open` so the user lands on the model in **Media ▸ Models ▸ `<project>`**, where they can orbit, tweak and export.
