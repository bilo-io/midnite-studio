# Phase 136 — Level editor 3D view

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `5ae193b39`.

Media ▸ Games ▸ **Level editor** (Phase 132 Themes D–E) edits a 3D level (`midnite.dimension` = `3d`) only as a
top-down plan on a 2D canvas. This phase adds a **3D view** of the same level with the model editor's orbit, gizmo,
axis widget, keys and grid; a **Floorplan | 3D** switch whose camera eases between the straight-down plan and a
perspective orbit; editing in 3D through the same edit model (undo, Save, inspector, palette, selection shared); and
the performance work that keeps it smooth on a level of thousands of props — a spatial grid for frustum culling, LOD,
a draw distance with fog, instancing, lazy model loading — driven by a 5-step **Optimisation** slider with a live
FPS / draw-call / visible-object readout.

> **Builds on.**
> - **The level editor** — [`level-editor.tsx`](../../../packages/features/media-game/renderer/level/level-editor.tsx),
>   [`level-canvas.tsx`](../../../packages/features/media-game/renderer/level/level-canvas.tsx) (plan view `View`),
>   the pure edit model [`level-edit-model.ts`](../../../packages/features/media-game/renderer/level/level-edit-model.ts)
>   (`moveObject`, `rotateObject`, `setOptionalNumber`, `beginStroke`/`endStroke`, a 100-step undo) and the per-game
>   [`level-store.ts`](../../../packages/features/media-game/renderer/level/level-store.ts).
> - **World mapping** — shared's `levelEntityToWorld` ([`game-level.ts`](../../../packages/shared/src/game-level.ts))
>   and the kit's `toWorld3d`, pinned together by `level-edit-agreement.test.ts`.
> - **The model editor** — [`editor-scene.tsx`](../../../packages/features/media-model/renderer/editor-scene.tsx)
>   (R3F + drei: `OrbitControls`, `TransformControls`, `GizmoHelper`/`GizmoViewport`, `Grid`),
>   [`viewport-widgets.tsx`](../../../packages/features/media-model/renderer/viewport-widgets.tsx),
>   [`editor-keys.ts`](../../../packages/features/media-model/renderer/editor-keys.ts), `snap.ts`.
> - **Terrain** — `levelGet`'s optional `terrain` (`game-level-terrain.ts`: bounds + drape image).
>
> **Scope guardrails.** 3D levels only. No new eslint exception; nothing crosses a feature boundary — what both
> editors share moves to the frame. macOS only, `react-icons` only, every new test a vitest unless it names the
> browser capability it needs.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

**Theme A — Shared viewport kit.** ◻ TODO

**Theme B — Placement, culling and LOD logic.** ◻ TODO

**Theme C — The 3D scene.** ◻ TODO

**Theme D — Editing in 3D.** ◻ TODO

**Theme E — Floorplan | 3D and the transition.** ◻ TODO

**Theme F — Models: lazy load and dispose.** ◻ TODO

**Theme G — The Optimisation slider and the readout.** ◻ TODO

## Build order

1. **A** (the frame kit both editors read), then **B** (pure logic every scene piece calls).
2. **C**, then **D** and **F** on it, then **E** (the switch wires the scene into the editor) and **G**.

## Deliverables

### A — Shared viewport kit (S)

- [ ] `packages/frame/src/viewport3d/`: the snap maths (`GRID_STEPS`, `ANGLE_STEPS`, `SCALE_STEPS`, `snapValue`,
  `effectiveStep`, `nudgeDistance`, …), the transform-mode list (`translate`/`rotate`/`scale` on W/E/R with their
  `react-icons/lu` glyphs) and a `TransformModeBar` (the mode radios and the grid/angle snap selects).
- [ ] The model editor's `snap.ts` and `ViewportWidgets` read them (no behaviour change; `viewport-widgets.test.tsx`
  stays green).
- [ ] Tests: the frame's snap and mode-key tests.

### B — Placement, culling and LOD logic (M)

- [ ] `level-world.ts`: every visible object of a 3D level as a world item (`levelEntityToWorld`, ground at
  `midnite.groundY`, a footprint AABB) and the inverse — a world centre, yaw, size back to Tiled `x`/`y`/`rotation`/
  `width`/`height` (and `elevation`, `sizeY`, `pitch`, `roll`, `scale` props).
- [ ] `spatial-grid.ts`: a uniform grid over footprints; a query by an XZ rectangle and by a frustum's ground
  footprint returns candidates without visiting the whole level.
- [ ] `level-lod.ts`: per item, full / box / hidden from projected screen size and distance against the preset's
  thresholds and draw distance.
- [ ] `optimisation.ts`: five presets (draw distance, LOD thresholds, terrain tile segments, shadows and light cap,
  pixel ratio); step 1 = quality, 5 = performance; each value monotone across steps.
- [ ] `camera-transition.ts`: the plan ↔ orbit blend — eased `t`, pitch from straight down to the orbit pitch, a
  dolly zoom (FOV narrows as distance grows) so the ground under the plan view keeps its size at `t = 0`.
- [ ] Tests for each module.

### C — The 3D scene (L)

- [ ] `level-scene.tsx` (R3F): a flat ground at `groundY` in tiles with the drape image, the metre grid, fog at the
  draw distance, boxes as one `InstancedMesh` per colour group, points as markers, paths as lines.
- [ ] Culling: only grid cells in the camera frustum within the draw distance are visited; the visible set updates
  when the camera moves, not every frame.
- [ ] The model editor's orbit (left rotate, right pan, wheel zoom), `GizmoHelper` axis widget and grid look.
- [ ] Tests: the scene's pure helpers; a render smoke under the R3F test renderer is not added (WebGL), see E2E.

### D — Editing in 3D (M)

- [ ] Click selects (instance id → object), click on empty ground clears; the selection is the edit model's, so it
  stays across views.
- [ ] `TransformControls` W/E/R: move (XZ + elevation), rotate (yaw = Tiled `rotation`, pitch/roll props), scale
  (footprint X/Z and `sizeY`; `scale` for a point). One drag is one undo step; the gizmo snaps with the shared snap bar.
- [ ] Place (O) on a ground click with the palette's entity type; Delete removes; Mod+Z/Mod+Shift+Z undo/redo;
  F frames the selection.
- [ ] Tests: the gizmo → edit-model mapping (one undo step per drag, inverse placement round-trips).

### E — Floorplan | 3D and the transition (M)

- [ ] A **Floorplan | 3D** segmented switch in the toolbar of a 3D level; a 2D level shows no switch.
- [ ] Switching eases the camera over ~600 ms between the plan view's framing and the orbit view, starting/ending
  over the spot the plan showed; the plan canvas crossfades.
- [ ] The choice persists per game (with the slider and the readout toggle) in a persisted renderer store whose key
  is listed in the Media toggle's data.
- [ ] Tests: the store (default, per game, corrupt payload), the editor shows the switch only for 3D.

### F — Models: lazy load and dispose (M)

- [ ] `media-game:level-model` IPC: a game's `model` asset (`.glb`) as bytes, confined to the game, capped; answers
  the error envelope, never throws.
- [ ] A model cache: an asset loads the first time an object using it is in range at full LOD; one out of range for
  a while (30 s) is disposed; a model that fails stays a box at `sizeY`.
- [ ] Tests: the cache (load once, dispose after the grace period, failure → box), the main handler (confinement, cap).

### G — The Optimisation slider and the readout (S)

- [ ] A 5-step **Optimisation** slider in the 3D toolbar: applies live (draw distance, fog, LOD, terrain tiles,
  shadows/lights, pixel ratio) without a remount, and persists.
- [ ] A toggleable readout: FPS, draw calls, visible objects (of total).
- [ ] Tests: the slider writes the store; the readout's formatting.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/frame/src/viewport3d/*` | A | net-new |
| [`packages/features/media-model/renderer/snap.ts`](../../../packages/features/media-model/renderer/snap.ts), `viewport-widgets.tsx` | A | read the frame kit |
| `packages/features/media-game/renderer/level/3d/*` | B C D F G | net-new |
| [`level-editor.tsx`](../../../packages/features/media-game/renderer/level/level-editor.tsx), [`level-canvas.tsx`](../../../packages/features/media-game/renderer/level/level-canvas.tsx) | E | the switch, plan view sync |
| [`packages/shared/src/game-level.ts`](../../../packages/shared/src/game-level.ts) | F | `level-model` schemas |
| `packages/features/media-game/main/games/*` | F | the model handler |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` per touched package, eslint on changed files, vitest on touched suites,
  `scripts/layer-boundaries.test.mjs`, `tracker-check`, `e2e-budget` (the workspace-wide gate is not run here).
- [ ] The agreement test covers the 3D view's placements (`level-world` against the kit's `toWorld3d`).
- [ ] **Gate — the built app, a throwaway `--user-data-dir`, no mocks**, on a throwaway 3D game made by New game in
  a temp folder with a large seeded level: Floorplan, 3D and a mid-transition frame; a gizmo move and rotate mirrored
  in the plan and inspector; undo; Save as one commit; the slider at 1, 3 and 5 with the readout. Shots under
  `/tmp/midnite-shots-p136/`.

## Not in this phase

- **A heightmap ground.** The terrain pack is read as bounds + drape only; see Decisions.
- **A 3D view of 2D levels.** Floorplan only.
- **Multi-select in 3D.** The edit model holds one selection.
- **Painting tiles or drawing volumes/paths in 3D.** Volume and Path stay plan tools.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Engine: R3F 9 + drei 10 + three 0.186**, as the model editor. `media-game` takes the same versions.
2. **What is shared moves to the frame** (`packages/frame/src/viewport3d/`): pure snap maths, the transform-mode
   table and the mode/snap bar. drei's `OrbitControls`, `TransformControls` and `GizmoHelper` are library components
   both editors use directly; the frame stays free of three (it is in every app's bundle).
3. **The ground is flat** at `midnite.groundY` with the drape image: no cheap heightmap reader exists for a terrain
   pack in the renderer, and a flat plane matches the plan view. An object with no `elevation` sits on it.
4. **Models arrive over a new IPC channel**, bytes confined to the game folder: a game repo is not always registered
   (Gamer), so `mstudio-file://repo/…` cannot serve it.
5. **2D levels keep Floorplan only**; an extruded preview of tiles has no data to extrude.
6. **The view choice is renderer state** (a persisted zustand store per game), not a suite pref: main never reads it.
7. **Culling runs on camera change**, not per frame, over a uniform grid (cell = 16 m) — a level's objects are dense
   and similar in size, where a grid beats a quadtree and is simpler.
8. **Gizmo edits commit once on release**: during a drag only the three object moves, so a big level does not
   re-render per pointer move; the release is one undo step.
