# Phase 144 — Level lighting, environment and structure

Planned 2026-11-14 by an unattended agent · grounded against the tree as of `9e395a8df`.

The kit already knows how to light a 3D world — `kit/core/sky.js` (`SKY_PRESETS` day/dawn/dusk/night/overcast,
`skyAtTime`, `sunDirection`), `kit/three/environment.js` (`createEnvironment`: sky dome, hemisphere + sun, shadows,
fog, reflection map) and `kit/three/postfx.js` (`createPostFx`: ACES tone mapping, bloom, vignette) — but a level
cannot say which, so every scene of a game looks the same, and the editor's 3D view (Phase 136) shows a neutral
studio light that matches none of them. Engines put this per level (Unreal's World Settings and Sky Atmosphere,
Unity's Lighting window per scene, Godot's `WorldEnvironment` node). This phase:

- **Environment per level** as map properties: sky preset, time of day, sun angle, fog, post preset.
- **An Environment panel** in the editor, and the 3D view lit by the same numbers (a port of `skyAtTime`).
- **Light gizmos and a shadow preview** so placed `light` objects can be tuned by eye.
- **Floors** — multi-storey interiors as `midnite.floor` layers with PageUp / PageDown (Unreal's level layers,
  Godot's per-floor GridMap workflows).
- **Sections and streaming** — large outdoor levels split into named sections the kit loads by distance (Unreal's
  World Partition, reduced to Tiled groups).

Agents get a `map` level op and `game_level_environment`.

> **Builds on.**
> - **The kit** — `templates/media-game/kit/core/sky.js` (`SKY_PRESETS` L19, `mixPresets`, `sunDirection` L54,
>   `skyAtTime` L65), `kit/three/environment.js` (`createEnvironment` L68: `preset`, `timeOfDay`, `sunAzimuth`,
>   `sunElevation`, `shadowSize`, `fog`), `kit/three/postfx.js` (`createPostFx` L49), `kit/three/level.js`
>   (`buildLevel3d`), `kit/core/level.js`.
> - **The format** — `GAME_LEVEL_PROPS` (`packages/shared/src/game-level.ts` L27: `level`, `dimension`,
>   `metresPerTile`, `terrain`, `groundY`), `levelProperties`.
> - **The 3D view** — `3d/level-3d-view.tsx`, `3d/level-scene.tsx`, `3d/optimisation.ts` (`shadows`, `maxLights` per
>   preset), `3d/level-view-store.ts`.
> - **Phase 137** — layers in the outliner (H), selection (A). **Phase 138** — ops, recipe, banner.
> - **Phase 141** — terrain mesh (shadows fall on it when present).
>
> **Depends on:** Phase 138 (A, C), Phase 137 (H). Theme E's terrain shadows need Phase 141 C (flat ground
> otherwise). **Unlocks:** nothing further in this roadmap.
>
> **Scope guardrails.** No baked lighting, no GI (Not in this phase). Every new map property is optional; a level
> without them renders exactly as today in the kit and the editor. Kit changes are kit bumps.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.
> Every theme here is at most **M**.

## Headlines

**Theme A — Environment properties.** ◻ `midnite.sky`, `midnite.timeOfDay`, `midnite.sunAzimuth`,
`midnite.sunElevation`, `midnite.fog`, `midnite.fogNear`, `midnite.fogFar`, `midnite.post` in `GAME_LEVEL_PROPS`,
read by a pure `levelEnvironment(level)`.

**Theme B — The Environment panel.** ◻ A `Popover` from the 3D toolbar: sky preset `Choice`, time-of-day and sun
`BrandSlider`s, fog switch and range, post preset — each change one undo step (coalesced while dragging).

**Theme C — Sky and sun in the 3D view.** ◻ A TypeScript port of `skyAtTime` / `mixPresets` / `sunDirection` drives
the editor's sky gradient, hemisphere and sun, with an agreement test against the kit.

**Theme D — Light gizmos.** ◻ `light` objects draw their range sphere and colour; a drag handle edits `range`; the
inspector edits colour and intensity (Phase 142 schema fields when present).

**Theme E — Shadow preview.** ◻ A toggle renders the sun's shadows in the 3D view (on terrain when Phase 141 has
landed), clamped by the Optimisation preset.

**Theme F — The kit reads the environment.** ◻ `buildLevel3d` passes `levelEnvironment` to `createEnvironment` and
`createPostFx`; `midnite.post` presets `none`, `soft`, `vivid`, `cinematic`; kit bump.

**Theme G — Floors.** ◻ Object and tile layers tagged `midnite.floor` (int) with `midnite.floorHeight`; the editor
shows one floor at a time (others ghosted) with PageUp / PageDown; 3D places a floor's objects at its height.

**Theme H — Sections.** ◻ Tiled group layers tagged `midnite.section` with bounds; an outliner section filter and a
plan overlay of section boxes.

**Theme I — The kit streams sections.** ◻ The 3D kit builds a section's objects when the player is within
`midnite.streamRadius` and disposes them beyond it plus hysteresis; kit bump.

**Theme J — MCP.** ◻ A `map` level op (set / unset map properties, validated) and `game_level_environment` (read /
set); the skill learns environments, floors and sections.

## Build order

**A** → **C** → **B** → **F**; **D**, **E** after C; **G** → **H** → **I**; **J** last. F, I share one kit bump if
they land together.

## Deliverables

### A — Environment properties (S)

**Files.** `packages/shared/src/game-level.ts` (props), `packages/shared/src/game-level-environment.ts` (+ test,
net-new), `packages/shared/src/index.ts`.

```ts
// GAME_LEVEL_PROPS gains:
sky: 'midnite.sky', timeOfDay: 'midnite.timeOfDay', sunAzimuth: 'midnite.sunAzimuth', sunElevation: 'midnite.sunElevation',
fog: 'midnite.fog', fogNear: 'midnite.fogNear', fogFar: 'midnite.fogFar', post: 'midnite.post',
floor: 'midnite.floor', floorHeight: 'midnite.floorHeight', section: 'midnite.section', streamRadius: 'midnite.streamRadius',

export const LEVEL_SKY_PRESETS = ['day', 'dawn', 'dusk', 'night', 'overcast'] as const;   // = Object.keys(SKY_PRESETS), pinned by test
export const LEVEL_POST_PRESETS = ['none', 'soft', 'vivid', 'cinematic'] as const;
export type LevelEnvironment = { sky: (typeof LEVEL_SKY_PRESETS)[number] | null; timeOfDay: number | null; sunAzimuth: number | null; sunElevation: number | null; fog: boolean | null; fogNear: number | null; fogFar: number | null; post: (typeof LEVEL_POST_PRESETS)[number] | null };
export function levelEnvironment(level: Pick<GameLevel, 'properties'>): LevelEnvironment;   // null = "not set, game default"
export function environmentIssues(env: LevelEnvironment): string[];   // ranges: timeOfDay 0–24, elevation −10–90, fogNear < fogFar
```

**Acceptance.**

- [ ] A1. A level with none of the props yields all `null`.
- [ ] A2. Out-of-range values come back `null` with an issue each.
- [ ] A3. `LEVEL_SKY_PRESETS` equals the kit's `SKY_PRESETS` keys (test imports the kit module).

**Done when** A1–A3 pass.

### B — The Environment panel (M)

**Files.** `packages/features/media-game/renderer/level/environment/environment-panel.tsx` (+ test),
`environment/environment-model.ts` (+ test), `level-edit-model.ts` (`setMapProperties(state, patch)` — one commit,
with a `coalesceKey` so a slider drag is one undo step), `3d/level-3d-view.tsx` (toolbar button `LuSunMedium`).

- A `Popover` (`packages/features/media-game/renderer/chrome.tsx`) with: **Sky** `Choice` of the presets plus "Game
  default"; **Time of day** `BrandSlider` (`packages/frame/src/kit/brand-slider.tsx`) 0–24 h step 0.25 with a
  readout "17:30"; **Sun** two sliders (azimuth 0–360°, elevation −10–90°) and a "From time of day" switch
  (`SwitchRow`) that clears them; **Fog** `SwitchRow` plus near / far sliders; **Post** `Choice`. A "Reset to game
  default" button removes every environment property (one step).
- The 2D editor shows no panel (the props are 3D-only; a 2D level's map properties are untouched).

**Acceptance.**

- [ ] B1. Dragging the time slider through 20 values adds one undo step.
- [ ] B2. "From time of day" removes `sunAzimuth` / `sunElevation`.
- [ ] B3. Reset removes all eight props in one step.

**Done when** B1–B3 pass.

### C — Sky and sun in the 3D view (M)

**Files.** `packages/shared/src/game-sky.ts` (+ test, net-new: `SKY_PRESETS`, `mixPresets`, `skyAtTime`,
`sunDirection` ported line for line), `packages/features/media-game/main/games/sky-agreement.test.ts` (imports the
kit's `sky.js`), `3d/level-environment.tsx` (net-new: a sky-dome shader mesh, hemisphere and directional lights,
fog), `3d/level-scene.tsx` (replace the neutral lights with it).

- The dome reuses the kit's shader idea (zenith / horizon / ground gradient + sun disc, stars at night) written for
  R3F; tone mapping `ACESFilmic` and exposure from the preset, as the kit's `createPostFx` sets them.
- A "Lit / Unlit" toggle in the 3D toolbar (persisted in `level-view-store` as `lit: boolean`, default true; no
  version bump) brings back today's neutral light for editing in the dark (Unreal's Lit / Unlit view modes).

**Acceptance.**

- [ ] C1. `skyAtTime` at 0, 6, 12, 18 and 21.5 h equals the kit's within 1e-9 per channel.
- [ ] C2. `sunDirection` agrees with the kit's for 100 random angles.
- [ ] C3. Unlit restores the neutral lights (scene graph test with the R3F test renderer).

**Done when** C1–C3 pass.

### D — Light gizmos (S)

**Files.** `3d/level-scene.tsx` (per `light` object: a wire sphere of `range`, a small bulb in its colour, shown for
the selection and on hover; all when the View toggle "Light ranges" is on), `3d/light-gizmo.tsx` (+ test, net-new:
a radius handle on the sphere's +X that edits `range`, one undo step per drag), `level-plan-draw.ts` (range circle in
the plan).

- Fields read: `color` (hex), `intensity` (number), `range` (metres) — the same names Phase 142's default `light`
  schema declares; without 142 they are read from free properties.
- The scene renders up to the Optimisation preset's `maxLights` nearest lights as real point lights; the rest show
  gizmos only (the kit's own policy).

**Acceptance.**

- [ ] D1. Dragging the handle from 5 m to 8 m sets `range: 8` in one undo step.
- [ ] D2. With 20 lights and `maxLights: 8`, 8 real lights exist in the scene graph.

**Done when** D1–D2 pass.

### E — Shadow preview (S)

**Files.** `3d/level-environment.tsx`, `3d/level-view-store.ts` (`shadows: boolean`, default false),
`3d/optimisation.ts` (the preset's `shadows: false` forces off and disables the toggle with a tooltip "Shadows are off
at this Optimisation level").

- The sun's shadow camera covers the view frustum's near 60 m (`shadowSize` like the kit's 30 m half-width, doubled
  for the editor's wider views), map 2048; props cast and receive; terrain (141 C) receives.

**Acceptance.**

- [ ] E1. The toggle is disabled when the preset has `shadows: false`.
- [ ] E2. With shadows on, the directional light has `castShadow` and the props' meshes `castShadow`.

**Done when** E1–E2 pass.

### F — The kit reads the environment (M)

**Files.** `templates/media-game/kit/core/level.js` (`levelEnvironment` JS twin), `kit/three/level.js`
(`buildLevel3d` returns `environment` options), the 3D genre boots under `templates/media-game/genres/*` that call
`createEnvironment` / `createPostFx` (pass the level's values over their defaults), `kit/three/postfx.js` (`POST_PRESETS`:
`none` = postfx off, `soft` = bloom 0.4 + vignette 0.2, `vivid` = bloom 0.8 + saturation, `cinematic` = bloom 0.6 +
vignette 0.45 + aberration 0.002), kit versions + `kit-hash.json`, `kit-genres-3d.test.ts`.

- A changed environment applies on scene load (and on Phase 140 C's scene hot reload) — no runtime API.

**Acceptance.**

- [ ] F1. A third-person fixture with `midnite.sky = 'dusk'` builds an environment with the dusk preset.
- [ ] F2. Without any prop the genre's own default is used (existing tests unchanged).
- [ ] F3. JS and TS `levelEnvironment` agree on a table of fixtures.

**Done when** F1–F3 pass and the kit hash test is green.

### G — Floors (M)

**Files.** `packages/shared/src/game-level.ts` (`levelFloors(level): { floor: number; height: number; layerIds:
number[] }[]`), `level-store.ts` / `level-view-store.ts` (`activeFloor` per game+scene in the non-persisted
`useLevelStore`), `level-editor.tsx`, `level-plan-draw.ts`, `3d/level-scene.tsx`, `level-outliner.tsx` (137 H; a
floor badge per layer), `level-shortcuts.ts` (`PageUp` / `PageDown`), `packages/shared/src/game-level.ts`
`levelEntityToWorld` (adds the floor's height to `y`).

- A layer with `midnite.floor = n` belongs to floor n; untagged layers are floor 0. `midnite.floorHeight` on the
  map (default 3 m) × n gives the floor's base. The active floor draws normally; others at 25 % (plan) or hidden
  above / ghosted below (3D, the "cut" every interior editor uses). New objects go to the active floor's layer.
- **Kit**: `kit/three/level.js` adds the floor base to `y` (the same `levelEntityToWorld` change); bundled into F's
  kit bump.

**Acceptance.**

- [ ] G1. `levelFloors` groups layers; untagged → 0.
- [ ] G2. PageUp moves the active floor up; new objects land on its layer.
- [ ] G3. `levelEntityToWorld` adds `floor × floorHeight` (shared test) and the kit agrees.

**Done when** G1–G3 pass.

### H — Sections (S)

**Files.** `packages/shared/src/game-level.ts` (`levelSections(level)` from Tiled `group` layers carrying
`midnite.section`), `level-outliner.tsx` (137 H; groups render as collapsible nodes with a section badge; a section
filter `Choice`), `level-plan-draw.ts` (section bounds as dashed labelled rectangles), `level-edit-model.ts`
(`addSection`, `moveToSection`).

- A section's bounds are the union of its objects' bounds, padded 2 tiles, recomputed on the fly (never stored).

**Acceptance.**

- [ ] H1. `levelSections` returns names and computed bounds.
- [ ] H2. Moving an object into a section re-parents it under the group layer in one undo step.

**Done when** H1–H2 pass.

### I — The kit streams sections (M)

**Files.** `templates/media-game/kit/three/streaming.js` (net-new: `createSectionStreamer({ sections, radius,
hysteresis, build, dispose })`), `kit/three/level.js` (builds sections lazily when `midnite.streamRadius` is set),
`kit-core-three.test.ts`, kit versions + hash (with F).

- Distance from the player to a section's bounds; load inside `radius`, unload beyond `radius + hysteresis`
  (default 20 m); at most one section built per frame. Collision for a section is created with its objects. Sections
  are always loaded when `streamRadius` is unset (today's behaviour).
- Phase 140 G's debug draw shows section bounds and their state (loaded / unloaded) when `nav` or a new `sections`
  flag is on.

**Acceptance.**

- [ ] I1. The streamer loads and unloads with hysteresis (fake player path).
- [ ] I2. No `streamRadius` → everything built at load (existing tests unchanged).

**Done when** I1–I2 pass.

### J — MCP (S)

**Tools / ops** (Phase 138's tool recipe):

- **New op** `{ op: 'map', set?: Record<string, string | number | boolean>, unset?: string[] }` in `LevelOpSchema`:
  only `midnite.*` names from `GAME_LEVEL_PROPS` plus free non-`midnite` names; values validated by
  `environmentIssues`. Applied like any op (live or one commit).
- `game_level_environment` — `{ game, scene, set?: Partial<LevelEnvironment> }`; without `set` a read (returns the
  resolved `LevelEnvironment` and the kit's effective preset); with `set` a write behind `allowed()` that compiles to
  a `map` op. One tool rather than two keeps the tool list short; reads stay ungated because `set` is the only write path.
- `game_level_view` (138 H) renders with the environment, so an agent can look at dusk.
- Skill `## Levels` (seven copies): environment, floors (`midnite.floor`) and sections (`midnite.section`) in four
  lines.

**Acceptance.**

- [ ] J1. A `map` op with `midnite.timeOfDay: 30` fails; with 18 applies.
- [ ] J2. `game_level_environment` without `set` works with `allowGames` off; with `set` refuses.
- [ ] J3. Skill copies identical; pin regenerated.

**Done when** J1–J3 pass.

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/game-level.ts`, `game-level-ops.ts`, `index.ts` | A G H J | edit |
| `packages/shared/src/game-level-environment.ts`, `game-sky.ts` (+ tests) | A C | net-new |
| `packages/features/media-game/main/games/sky-agreement.test.ts` | C | net-new |
| `packages/features/media-game/renderer/level/environment/*`, `3d/level-environment.tsx`, `3d/light-gizmo.tsx` | B C D | net-new |
| `packages/features/media-game/renderer/level/3d/level-scene.tsx`, `level-3d-view.tsx`, `level-view-store.ts`, `optimisation.ts`, `level-edit-model.ts`, `level-editor.tsx`, `level-plan-draw.ts`, `level-store.ts`, `level-outliner.tsx`, `level-shortcuts.ts` | B–H | edit |
| `templates/media-game/kit/core/level.js`, `kit/three/level.js`, `kit/three/postfx.js`, `kit/three/streaming.js`, 3D genre boots, kit versions, `kit-hash.json` | F G I | edit / net-new |
| MCP recipe files + seven skill copies | J | edit |

## Verification

- [ ] Targeted checks green: `tsc --noEmit` (shared, media-game, desktop); eslint on changed files; vitest on the
  touched suites incl. the sky agreement and kit tests; the pin test; `scripts/skill-copies.test.mjs`; `node
  scripts/tracker-check.mjs`.
- [ ] **Gate — the built app, throwaway `--user-data-dir`**: an open-world game — set dusk at 18:30 with fog in the
  panel and see the 3D view change; play (Phase 140) and see the same sky; place three lights and tune a range by
  handle; shadows on; a two-floor interior with PageUp / PageDown; split the map into four sections with a 60 m
  stream radius and watch sections load in the game's debug draw. Shots under `/tmp/midnite-shots-p144/`.

## Not in this phase

- **Baked lighting, lightmaps, light probes, GI** — the kit is real-time only.
- **Weather and animated time of day in the editor** — the kit can sweep `timeOfDay`; the editor shows one moment.
- **Per-section environments** (Unreal's post-process volumes) — one environment per level.
- **2D lighting** — Phaser's light pipeline is a separate, later question.

## Decisions / open questions

All resolved; unattended, the conventional option was taken in each case.

1. **Environment as map properties**, the Tiled-native place (Godot's `WorldEnvironment` per scene, Unity's
   per-scene Lighting settings); a level stays one self-describing file.
2. **Port the kit's sky, prove it equal** — the editor must show the game's sky, not an approximation.
3. **Lit / Unlit toggle** — Unreal's view modes; editing a night level needs to see.
4. **Floors as tagged layers**, not separate files: one level, one undo stack, one commit.
5. **Sections as Tiled groups** with streaming opt-in by one property — World Partition's idea at the scale of a
   Tiled map; no level is streamed unless it asks.
6. **One `game_level_environment` tool with optional `set`** rather than a get/set pair: the agent reads and writes one shape, and the consent check runs only when `set` is present.
