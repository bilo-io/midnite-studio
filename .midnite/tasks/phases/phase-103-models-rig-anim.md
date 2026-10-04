# Phase 103 — Models: fidelity, rigging and animation

Requested by the user · 2026-10-04 · grounded against the tree as of `2bbee931`.

Media ▸ Models builds a design, not a mesh: a JSON list of primitives that the shared kernel
(`packages/shared/src/model-geometry/`) turns into closed meshes for the editor, the PNG previews and
the `.obj`/`.fbx`/`.glb` exports ([Phase 99](phase-99-media-page.md) Themes F, G, I, J). This phase
does three things to it:

1. **Fidelity.** It sets out how close to high-fidelity ("AAA") 3D the app can get with the lightest
   possible tool, as three tiers: the procedural kernel (today), a local neural image-to-3D model,
   and a hosted API. Tiers 1 and 2 add a dependency and wait for the user's approval.
2. **Rigging.** An anatomy dropdown (static object, biped, quadruped, vehicle), an auto-rig from the
   design's parts, a bone-naming table that later agents and tools can rely on, and automatic skin
   weights.
3. **Animation.** Ten base biped clips (idle, walk, run, getHit, fallAndGetUp, die, jump, doubleJump,
   dodge, dash) and six vehicle clips (idle, drive, turnLeft, turnRight, brake, suspensionBounce),
   with editor controls and `model_*` MCP tools for all of it, exported through `.glb`.

> **Builds on.**
> - **The kernel** — [`shared/src/model-geometry/`](../../../packages/shared/src/model-geometry/):
>   `buildScene`/`buildSceneChecked` produce world-space `MeshPart`s (positions, normals, indices,
>   `sourceIndex`), `worldMatrices`/`parentIndices` resolve the part hierarchy, `math.ts` has
>   row-major `Mat4` helpers. Pure TS, no three, so a rig built here runs in main, the renderer and
>   bare vitest alike.
> - **The design** — `ModelSpecSchema` in [`shared/src/media-model.ts`](../../../packages/shared/src/media-model.ts).
>   Every addition so far has been optional, so every saved sidecar still loads byte-identically.
> - **`model.json`** — `ModelManifestSchema` in
>   [`shared/src/media-model-library.ts`](../../../packages/shared/src/media-model-library.ts) reserved
>   `anatomy`, `rig` and `animations` slots for this phase.
> - **The MCP tools** — [`shared/src/media-model-mcp.ts`](../../../packages/shared/src/media-model-mcp.ts)
>   and `main/media/model/model-mcp.ts`: schema-derived, validation failures are results, write tools
>   gated by `Settings ▸ MCP ▸ Let agents edit 3D models`.
> - **The glTF writer** — `main/media/model/gltf-writer.ts`, hand-written, round-tripped through three's
>   `GLTFLoader` in vitest.
>
> **Scope guardrails.**
> - **No new export formats.** `.glb` carries skin and animation; `.obj` stays static; `.fbx` gains them
>   only if the hand-written writer can be extended cheaply (it is deferred below).
> - **No neural dependency, Python runtime or weights download** until the user approves Tier 1 or 2.
> - Rig and animation logic lives in the shared kernel, pure TS, tested in vitest. The renderer uses the
>   three.js it already has; no new heavy dependency.
> - Every saved design without a rig loads and builds exactly as before.

## Headlines

**Theme A — Fidelity tiers and the research.** ✅ The research is done (below) and the user decided
(2026-10-04): Tier 0 stays the default, SF3D is approved as the opt-in Tier 1 (Theme J), Tier 2 and the
heavier local models stay as plans. **Tier 0, procedural (today):** the
kernel's primitives, booleans, modifiers and PBR materials, authored by an LLM and refined through the
MCP render-look-patch loop. Deterministic, editable, riggable by construction (parts map to bones), no
download. Ceiling: hard-surface props, stylised characters and vehicles; no sculpted organic surfaces
and no textures. **Tier 1, local neural image-to-3D:** recommended **SF3D** (Stable Fast 3D) — the only
candidate that returns a UV-unwrapped, textured mesh with predicted roughness and metalness, at ~6 GB
memory, with upstream (experimental) MPS support and Metal texture-baking kernels; text-to-3D chains the
Images tab's text-to-image into it. **TripoSR** (MIT) is the licence-clean fallback with lower quality and
vertex colours only. **Hunyuan3D-2mini** has the best shapes of the light models but its licence does not
apply in the EU, UK or South Korea, so it cannot be the default. **TRELLIS.2** (MIT, 4B) is the highest
quality but needs 24 GB+ unified memory, ~15 GB of weights and ~3.5 min per model through a community
Mac port — an opt-in "max quality" option at most. **Tier 2, hosted (opt-in, API key in the secrets
vault):** Meshy and Tripo (both also auto-rig and animate humanoids), Rodin, fal.ai-hosted Hunyuan3D /
TRELLIS. A neural mesh enters the design as an imported asset part, so the rig, clips and exports in
this phase apply to it too.

**Theme B — Anatomy and the bone table.** ✅ `media-model-rig.ts` holds the anatomies, the biped (VRM 1.0 + `root`), quadruped and vehicle tables with aliases and `canonicalBoneName()`; `ModelSpec` gains optional `anatomy`/`rig`/`animations`, so old sidecars load unchanged; `model.json` now summarises anatomy, bone count and clips from the design (`modelRigSummary`), and a stale summary is dropped when the rig goes.

**Theme C — Auto-rig.** ✅ `autoRig()` places bones per anatomy in a canonical facing frame from part names and positions; `rig.bind` overrides are kept; `validateRig()` answers `{path, message}` issues the editor's warnings and the MCP tools both show.

**Theme D — Skin weights.** ✅ A part-aware envelope (`computeSkin`): each part follows its bone, that bone's parent and its in-line children, blended across joints by `falloff` (0 = rigid), at most four influences; vehicles stay rigid. `skinParts` is the one CPU skinning the editor, pose previews and tests use.

**Theme E — Procedural clips.** ✅ Ten biped, three quadruped and six vehicle clips are generated from kind plus parameters with additive keys on top (`samplePose`), baked at 30 fps (`bakeClip`) and retargeted by canonical name with root motion scaled by leg length (`retargetClips`). The quadruped set, first marked deferred, landed with the rest.

**Theme F — Editor: rig, pose and weights.** ✅ The inspector's Rig tab: anatomy, facing and Auto-rig, a bone outliner, head/tail/parent fields, add and remove bones, falloff, binding the selected part, a weight view (Blender's blue→red ramp) and pose mode, which keys the picked bone's rotation into the timeline's clip at the playhead. The skeleton is drawn over the model and its joints are pickable. Every edit is one reducer step through the shared `rig-ops.ts`. Renaming a bone is deferred.

**Theme G — Editor: clips and timeline.** ✅ The Animation tab adds clips from the anatomy's presets (or `custom`), edits name, duration, speed, intensity, loop and in-place, and copies clips from any rigged model whose `model.json` lists clips. A timeline under the viewport plays, scrubs, loops and changes speed; its animation-frame loop exists only while playing.

**Theme H — MCP tools.** ✅ `model_get_rig`, `model_auto_rig`, `model_patch_rig`, `model_patch_animations` and `model_retarget` (the four writes behind `allowModels`), and `model_render_preview` takes a `pose`. Edit results carry a rig summary and rig warnings. The editor and the tools share one implementation (`shared/src/model-geometry/rig-ops.ts`).

**Theme I — Export: skin and animation in `.glb`.** ✅ Joint nodes with local TRS, skinned primitives (`JOINTS_0`/`WEIGHTS_0`), one skin with translation-only inverse binds, and one animation per clip (rotation per bone, translation where a bone moves). `gltf-skin.test.ts` re-imports through `GLTFLoader` and checks that three's `AnimationMixer` poses vertices where the kernel does. A part named like a bone (`head`) is written as `head_mesh` so bone names stay canonical. FBX skin stays deferred.

**Theme J — Tier 1, local neural image-to-3D (SF3D).** 🔄 Built, not yet run end to end against the real weights. Media ▸ Models gains a tier switch (Procedural / SF3D). SF3D runs on the community ONNX port `needle-tools/SF3D-webgpu` (not gated, pinned at revision `56d2f58`) through the `onnxruntime-node` the app already bundles via `@huggingface/transformers` — no Python, no new runtime dependency — in its own `sf3d-worker` utility process. Nothing downloads before the consent dialog shows the Stability AI Community License verbatim and its US$1M revenue line, and the user ticks both boxes; then `installer.ts` downloads ~1.73 GB into `<userData>/sf3d/`, resumes with HTTP `Range` after a cancel, checks every file's sha256 against the pinned `assets-manifest.json` (hashing the bytes already on disk first), and an uninstall removes the weights, the partial downloads and the consent. An optional Hugging Face token lives in the secrets vault (`media.huggingFaceToken`). Post-processing is our TypeScript: marching tetrahedra over SF3D's tet grid with `tanh` vertex offsets, a pair-packed UV atlas baked through SF3D's colour MLP on the triplane, a PNG encoder and a textured `.glb`, written to `<group>/<model>/` with `model.json` (`agent.provider: 'sf3d'`). `model_sf3d_status` and `model_generate_sf3d` expose it over MCP (start-and-poll, behind the models switch, refused until installed). Every op answers the `GitOpResult` envelope; a cancel kills the worker. All of it is tested in vitest with a mocked inference session. **Open:** a real run against the weights, which also settles the guessed pieces (`isosurface_threshold` 10, the tokenizer's `c2w`/`intrinsic_normed` shapes, fp32 inputs, an sRGB colour head); there is no background removal, so a cut-out picture works best; the result now joins as an `asset` part: `ModelService.importAsset` writes `<stem>.asset.glb` plus a sidecar with one asset part, the editor draws and textures it from a content-hashed registry, auto-rig splits the mesh into pseudo-parts for the biped/quadruped/vehicle rules, skinning weights each vertex by distance to the bone segments (top 4, normalised), and the rigged `.glb` export keeps the texture. Verified in vitest on a synthetic textured figure only; no real SF3D output has been produced, and the rigged `.glb` has not been opened in Blender or a game engine.

**Theme K — Tier 2, hosted image/text-to-3D.** ⏳ Deferred by the user's decision (2026-10-04): Meshy/Tripo stay a plan, not built in this phase.

**Theme L — Verification.** 🔄 Gate green; kernel, rig-ops, MCP, editor and glb re-import tests in vitest; screenshots in `docs/screenshots/phase-103-models-rig-anim/`. Open: a human pass opening a rigged, animated `.glb` in Blender and a game engine.

## A — Fidelity tiers and the research

- [x] Compare TripoSR, SF3D, SPAR3D, Hunyuan3D-2mini, TRELLIS.2 and hosted APIs on licence, weights, memory, Apple Silicon support, quality and speed
- [x] Tiered route proposed: 0 procedural, 1 local neural, 2 hosted
- [x] The user's decision on Tier 1 and Tier 2 recorded here (2026-10-04: SF3D approved as opt-in Tier 1; Tier 2, TRELLIS.2 and Hunyuan stay as checklist items, not built now)

### The lightest route to high-fidelity 3D on Apple Silicon

Checked 2026-10-04 against the projects' own READMEs, model cards and licences. "MPS" is PyTorch's
Metal backend; none of the four ships an official Core ML build. Every local option needs a Python
runtime (PyTorch) unless a community ONNX/WebGPU port is used.

| | TripoSR | SF3D (Stable Fast 3D) | SPAR3D | Hunyuan3D-2mini | TRELLIS.2 |
|---|---|---|---|---|---|
| Input | image | image | image (+ editable point cloud) | image (text via t2i) | image |
| Output | mesh, vertex colours | **UV-unwrapped textured mesh + roughness/metalness**, glb | as SF3D, plus point-cloud stage | shape only (texture is a separate, far heavier Paint model) | mesh with vertex colours / textures, 400k+ vertices |
| Licence | **MIT** | Stability AI Community: free under US$1M annual revenue, Enterprise licence above | Stability AI Community (same) | Tencent Hunyuan 3D Community: **not licensed in the EU, UK, South Korea**; >1M MAU needs a licence | **MIT** |
| Weights | ~1.7 GB | ~2 GB (gated download) | larger than SF3D | 0.6B shape DiT (+ VAE) | ~15 GB |
| Memory | ~6 GB | **~6 GB** | ~10.5 GB (~7 GB low-VRAM mode) | ~6 GB shape-only | **24 GB+ unified memory** |
| Apple Silicon | community MPS runs; CPU marching cubes | **upstream MPS (experimental), Metal texture baker**; community ONNX (iOS) and WebGPU ports | upstream MPS (experimental) | community MPS patches (ComfyUI, 2.1 Mac installer) | community MPS port only (sparse conv rewritten as gather-scatter) |
| Speed | <1 s on a datacentre GPU; seconds on M-series | ~0.5 s datacentre GPU; seconds on M-series | ~1 s datacentre GPU | tens of seconds to minutes on M-series | ~3.5 min on an M4 Pro |
| Quality | blobby, low-res (256³ marching cubes) | good props, clean topology, game-ready material params | better back sides than SF3D | best shapes of the light models | best overall |

**Hosted APIs (Tier 2).** Meshy (text/image-to-3D, PBR textures, and an auto-rig + animation API for
textured humanoid glb), Tripo (text/image-to-3D, a rig endpoint covering biped, quadruped and five other
creature types, animation/retarget endpoints), Hyper3D Rodin, and fal.ai/Runware hosting Hunyuan3D,
TRELLIS and SF3D. Pay per model, needs a network and an account, sends the prompt/picture off-device.

**Recommended route.**
- **Tier 0 — procedural (default, no download).** What ships; this phase makes it rigged and animated.
- **Tier 1 — local neural, opt-in.** SF3D as the default local model, run by a managed runtime in
  `<userData>` that is installed only after explicit consent (preferred: the community ONNX/WebGPU port,
  which needs no Python; fallback: a `uv`-managed Python venv with PyTorch MPS). TripoSR as the MIT
  option for users above the Stability revenue line. TRELLIS.2 as an opt-in "max quality" on 24 GB+ Macs.
  Hunyuan3D-2mini only behind a territory acknowledgement.
- **Tier 2 — hosted, opt-in.** Meshy and Tripo first (both also rig and animate), keys in the secrets
  vault, never in `localStorage`.
- **Honest ceiling.** None of these produce AAA hero assets unaided. SF3D/TRELLIS.2 output is good
  background-prop quality; the rest of the gap is the rig, clips, materials and editing this phase builds.

## B — Anatomy and the bone table

The single source of truth for bone names, in `shared/src/media-model-rig.ts`: a `const` table plus a zod
schema, so later agents and tools can traverse a rig by name.

- [x] `MODEL_ANATOMIES` (`static`, `biped`, `quadruped`, `vehicle`) and `ModelAnatomySchema`
- [x] Biped bone table: VRM 1.0 / Unity humanoid names (`root`, `hips`, `spine`, `chest`, `upperChest`, `neck`, `head`, `leftShoulder`, `leftUpperArm`, `leftLowerArm`, `leftHand`, `leftUpperLeg`, `leftLowerLeg`, `leftFoot`, `leftToes` and the right side), each with parent, required flag and mirror
- [x] Vehicle bone table: `root`, `body`, `steering`, `suspension_FL/FR/RL/RR`, `wheel_FL/FR/RL/RR`
- [x] Quadruped bone table (`root`, `hips`, `spine`, `chest`, `neck`, `head`, `tail1..3`, `leftFrontUpperLeg`… `rightHindFoot`)
- [x] Aliases for retargeting (Mixamo `mixamorig:*`, Unreal `pelvis`/`spine_01`/`thigh_l`, Blender Rigify) and `canonicalBoneName()`
- [x] Optional `anatomy`, `rig` and `animations` on `ModelSpecSchema`; old sidecars load unchanged
- [x] `model.json` summary in its reserved slots (anatomy, bone count, clip names)
- [x] Bone table documented — in [The bone table](#the-bone-table) below; `shared/src/media-model-rig.ts` stays the source of truth (`docs/MEDIA_MODELS.md` is not in the tree)

### The bone table

`MODEL_BONE_TABLE` in `shared/src/media-model-rig.ts` is the single source of truth; a rig may use only
its anatomy's names, and `canonicalBoneName()` maps the aliases (Mixamo `mixamorig:*`, Unreal
`pelvis`/`spine_01`/`thigh_l`, Rigify `thigh.L`, Unity `LeftUpperLeg`) onto them.

| Anatomy | Bones (parent first) |
|---|---|
| biped | `root` › `hips` › `spine` › `chest` › `upperChest` › `neck` › `head`; per side (`left`/`right`, +X is the character's left facing +Z): `Shoulder` › `UpperArm` › `LowerArm` › `Hand`, and `UpperLeg` › `LowerLeg` › `Foot` › `Toes` under `hips` |
| quadruped | `root` › `hips` › `spine` › `chest` › `neck` › `head`; `tail1` › `tail2` › `tail3` under `hips`; per leg (`leftFront`, `rightFront`, `leftHind`, `rightHind`): `UpperLeg` › `LowerLeg` › `Foot` |
| vehicle | `root` › `body` › `steering`; per corner (`FL`, `FR`, `RL`, `RR`): `suspension_XX` › `wheel_XX` under `body` |

Required bones (auto-rig always places them, `validateRig` reports them missing) are the spine chain,
the limbs down to hands and feet, and for vehicles `root`, `body` and the four wheels; `upperChest`,
`neck`, shoulders, toes, tails and `steering` are optional.

## C — Auto-rig

- [x] `autoRig(spec, anatomy)` in the kernel: places bones from the built scene's bounds and part names/positions
- [x] Biped: hips at the pelvis, spine chain to the head, arms and legs found per side, symmetric
- [x] Vehicle: wheels found from round parts near the ground, quadrant-named; body and steering from the rest
- [x] Quadruped: four legs from the lowest parts, spine along the long axis, tail if present
- [x] Part-to-bone binding (`rig.bind`), auto-assigned and overridable per part
- [x] `validateRig()`: unknown or duplicate names, missing required bones, cycles, as `{path, message}` issues

## D — Skin weights

- [x] Method decided and documented: part-aware envelope — distance-to-bone-segment falloff, limited to the part's bound bone and its parent and children, smoothed across joints, at most 4 influences, normalised
- [x] `computeSkin(spec, rig, parts)` in the kernel (`skin.ts`), deterministic
- [x] Per-rig `falloff` control (rigid at 0)
- [x] `skinParts(parts, skins, skinMatrices(rig, pose))`: CPU linear-blend skinning shared by editor, previews and tests

## E — Procedural clips

- [x] Clip schema: `{name, kind, duration?, loop?, speed?, intensity?, inPlace?, keys?}` with additive per-bone keys
- [x] `samplePose(rig, clip, t)` and `bakeClip(rig, clip, fps)` in the kernel
- [x] Biped: idle, walk, run, getHit, fallAndGetUp, die, jump, doubleJump, dodge, dash
- [x] Vehicle: idle, drive, turnLeft, turnRight, brake, suspensionBounce
- [x] Quadruped: idle, walk, run
- [x] `retargetClips(fromRig, toRig, clips)` by canonical name, with root-motion scaled by leg length

## F — Editor: rig, pose and weights

New controls live in their own panels (`rig-panel.tsx`, `pose`/`weights` view toggles in it), mounted
from `model-editor.tsx` at a few points; nothing is added to the top toolbar.

- [x] Anatomy dropdown and Auto-rig button
- [x] Bone outliner (tree, select, parent, add from the table, remove) and bone fields (head, tail)
- [ ] Rename a bone to another name in the table (⏳ deferred)
- [x] Bones drawn in the viewport, selectable
- [x] Pose mode: rotate the selected bone, key it into the current clip at the playhead
- [x] Weight view: vertices tinted by the selected bone's weight; falloff slider; per-part bone binding
- [x] Undoable through the existing editor reducer

## G — Editor: clips and timeline

- [x] Clip list: add from the anatomy's presets, remove, rename, parameters (duration, speed, intensity, loop, in place)
- [x] Timeline: play / pause, scrub, loop, speed; frames drawn only while playing
- [x] Retarget: copy clips from another model in the library

## H — MCP tools

- [x] `model_get_rig` (anatomy, bones, bindings, clips and the bone table for the anatomy)
- [x] `model_auto_rig` (set anatomy and rig)
- [x] `model_patch_rig` (bone and binding edits, validated, structured errors)
- [x] `model_patch_animations` (add / update / remove clips and keys)
- [x] `model_retarget` (copy clips from another model)
- [x] `model_render_preview` renders a pose (`clip` + `time`)
- [x] Write tools behind `allowModels`; prompts and `model_get_spec` pick the new fields up from the schema

## I — Export: skin and animation in `.glb`

- [x] Joint nodes in hierarchy, skinned primitives with `JOINTS_0`/`WEIGHTS_0`, `inverseBindMatrices`
- [x] One glTF animation per clip, baked at 30 fps (rotation and root/hips translation)
- [x] Vitest re-imports the exported `.glb` through `GLTFLoader`: `SkinnedMesh`, bone names, clip names and track counts
- [x] `.obj` stays static; unrigged designs export exactly as before
- [ ] `.fbx` skin deformers and animation stacks (⏳ deferred)

## J — Tier 1, local neural image-to-3D (SF3D)

**Approved by the user, 2026-10-04: SF3D as the opt-in Tier 1.** Built as a follow-up PR on its own
branch, after the non-neural themes land. Constraints the user set:

- [x] Installed only on explicit consent, into `<userData>`; nothing in the bundle, nothing downloaded at startup
- [x] Runtime: the community ONNX/WebGPU port (no Python); a `uv`-managed Python venv with PyTorch MPS only if the port is unusable, with the reason recorded in the PR
- [x] The consent step shows the Stability AI Community Licence text and its US$1M annual-revenue condition
- [x] Gated weights: the Hugging Face token goes through the secrets vault, never a plaintext store
- [x] Every op (install, generate, uninstall) answers the `GitOpResult` envelope, with progress, cancel and a clean uninstall
- [x] Post-processing in TypeScript: marching tetrahedra, vertex offsets, UV atlas, colour-MLP texture bake, textured `.glb`, written to the library layout with `model.json` (`agent.provider: 'sf3d'`)
- [x] `model_sf3d_status` and `model_generate_sf3d` MCP tools, gated on install and the models switch
- [x] Tier choice, consent dialog, install progress, cancel, uninstall and Generate in Media ▸ Models; screenshots in `docs/screenshots/phase-103-sf3d/`
- [ ] A real end-to-end run against the downloaded weights (no CI or test run has the 1.7 GB of weights)
- [x] Engine behind the existing engine seam; output imported as an asset part that rigs and animates like any other part (`asset` part kind, content-hashed glb registry, per-vertex skin weights, mesh-splitting auto-rig; screenshots in `docs/screenshots/phase-103-sf3d-asset-rig/`)
- [ ] Text prompt → image → SF3D, chaining the Images tab (⏳ deferred)
- [ ] TripoSR (MIT) as the alternative for users above the revenue line (⏳ deferred)
- [ ] TRELLIS.2 "max quality" on 24 GB+ Macs (⏳ deferred)
- [ ] Hunyuan3D-2mini behind a territory acknowledgement (⏳ deferred)

## K — Tier 2, hosted image/text-to-3D

Not built in this phase (the user's decision, 2026-10-04); kept as the plan.

- [ ] Meshy and Tripo engines, API keys in the secrets vault (⏳ deferred)
- [ ] A clear "sends your prompt off-device" notice (⏳ deferred)

## L — Verification

- [x] `moon run :typecheck :lint :test` green
- [x] Kernel tests: bone table, auto-rig per anatomy, weights sum to 1, every clip samples finite poses, retarget
- [x] glb re-import test with skin and animations
- [x] Screenshots of the anatomy picker, bone outliner, pose/weights view and timeline
- [ ] Human pass: a rigged, animated glb opened in Blender and a game engine

## Decisions / open questions

- **Rig lives on the design, not in `model.json`.** `anatomy`, `rig` and `animations` are optional
  fields of `ModelSpec`, so the editor's undo, the sidecar, `model_set_spec` and every export read one
  source. `model.json`'s reserved slots carry a summary for the explorer.
- **Names are VRM 1.0 humanoid (camelCase), plus a `root` bone above `hips`** for root motion (dash,
  dodge). Vehicle names are upper-case corner suffixes (`wheel_FL`) because that is what vehicle rigs
  in Unity/Unreal tutorials use. Aliases make Mixamo/Unreal/Rigify rigs retargetable.
- **Weights are an envelope, not bone heat.** The kernel's parts are separate closed primitives; heat
  diffusion cannot cross between them and needs a sparse solve per bone. A part-aware envelope gives
  rigid limbs with smooth joints, which suits the parts the LLM writes.
- **Clips are procedural plus additive keys.** A clip stores its kind and parameters, not thousands of
  keyframes; pose-mode edits are additive keys on top. Exports bake it.
- **SF3D approved as opt-in Tier 1 (user, 2026-10-04).** Consent-gated install into `<userData>`,
  ONNX/WebGPU port first, Python/MPS only with a recorded reason, licence and its US$1M condition shown
  at consent, gated-weights token in the secrets vault, `GitOpResult` everywhere with progress, cancel
  and uninstall. Sequenced after the non-neural PR. Meshy/Tripo, TRELLIS.2 and Hunyuan are not built.
- **Neural meshes join as an asset part** (open: a capped `mesh` part cannot hold 400k vertices).
