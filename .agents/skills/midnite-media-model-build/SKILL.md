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
| `model_render_preview` | views `front`, `side`, `top`, `iso`; 128–768 px |
| `model_get_reference_image` | the user's reference picture, if any |
| `model_save` | write the obj/mtl/fbx/json trio so the editor is clean |
| `model_open` | show a model in the app window |

Loop: `model_get_spec` (schema), `model_set_spec`, `model_render_preview` and actually look, `model_patch_parts`, repeat, `model_save`. Never invent part fields — the schema from `model_get_spec` is authoritative. Applied or rejected-with-reasons comes back on every write.

## Conventions

- Do not hand-write `.obj`/`.fbx`; edit the spec only.
- Prefer patches over resets once a design is close.

## Hand-off to the UI

Finish with `model_save` then `model_open` so the user lands on the model in **Media ▸ Models ▸ `<project>`**, where they can orbit, tweak and export.
