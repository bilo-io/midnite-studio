# Phase 127 — Simulator module

**Refined: x1** · 2026-11-11 · UI/UX & interaction, empty/loading/error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, security & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

Planned by an unattended swarm agent (agent-A) · 2026-11-11 · grounded against the tree at `c9bef6832`.

Simulator is a module chip on the Science tile: `MODULES.simulator` in
[`apps/launcher/src/common/catalog.ts`](../../../apps/launcher/src/common/catalog.ts) promises **Agent
Environments** ("Multi-agent interactions in 3D sandboxes"), **Virtual Worlds** ("Solar systems, celestial
physics and gravity") and **Emergence** ("Cellular automata and Conway's Game of Life"), with
`comingSoon: true`. `APP_MODULES.science = ['science', 'simulator']` and
`RETIRED_APP_ALIASES.simulator = { app: 'science', module: 'simulator' }` in
[`packages/shared/src/modules.ts`](../../../packages/shared/src/modules.ts) already route an old
`midnite://open?app=simulator` link to it. This phase builds `packages/modules/simulator`, mounts it in the
Science host that [Phase 126](phase-126-science.md) builds, and ships three sandboxes: cellular automata,
an n-body gravity world, and a flocking / predator–prey agent environment — each a deterministic,
seeded simulation stepping in a worker, with play/pause/step/speed and save/load of scenarios.

> **Builds on.**
> - **Phase 126 (hard dependency).** `apps/science` (its `main/host.ts` mount list of one,
>   `main/preload.ts`'s `unionBridgeSlices`, `src/host-nav.ts`, `src/host-app.tsx`'s `SCIENCE_PANES`),
>   `createJsonDirStore` in `packages/runtime/src/json-dir-store.ts`, the `?worker&inline` + `worker.format:
>   'es'` rule already set in `apps/science/vite.config.ts`. All net-new in 126; none exist on `main` today.
> - **The second-module pattern.** Mind mounting Capture: [`apps/mind/main/host.ts`](../../../apps/mind/main/host.ts)
>   (two `ModuleMount`s), [`apps/mind/src/host-nav.ts`](../../../apps/mind/src/host-nav.ts) (two groups),
>   [`apps/mind/src/host-app.tsx`](../../../apps/mind/src/host-app.tsx) (`MIND_PANES` with two entries).
> - **The module skeleton.** [`packages/modules/_template/`](../../../packages/modules/_template/) and
>   [`docs/APPS.md`](../../../docs/APPS.md) § "Adding a module to a host".
> - **3D.** `three`, `@react-three/fiber`, `@react-three/drei` at the ranges in
>   [`features/media-model/package.json`](../../../packages/features/media-model/package.json).
> - **IPC.** The `op`-union channel pattern (`AnimationRequestSchema` in
>   [`shared/src/media-animation.ts`](../../../packages/shared/src/media-animation.ts)); `GitOpResult`
>   envelopes ([`shared/src/domain/result.ts`](../../../packages/shared/src/domain/result.ts)).

> **Scope guardrails.** The Simulator module never imports the Science module (or any module): what both
> need lives in the runtime (`createJsonDirStore`) or is written twice when it is small (the sparkline,
> Decision 4). Simulations are rule-based — no LLM-driven agents. macOS arm64 only; icons from
> `react-icons/<set>`; the renderer reaches main only through `window.midniteStudio`.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_Small worlds that run on their own._ Science's second module turns the "simulation" half of its tagline
into three sandboxes you can watch, poke and save: Life-like and elementary cellular automata, gravity
between bodies from a binary star to the inner solar system, and agents that flock, hunt and breed. Each
runs on a fixed timestep in a worker from a seed, so the same scenario always plays out the same way.
Planned 2026-11-11; it starts once Phase 126 Theme A has merged; first slice is **A + B**.

**Theme A — Module scaffold and mount in Science.** ✅ `packages/modules/simulator` mounted as Science's second
module (main mount, preload union, rail group, pane), every id list extended. Modelled on the science module's
layout rather than the template (same package/moon/tsconfig shape, no feature-report dep since the host's other
module carries Report). The three views are placeholders until C/D/E; `createSimulatorBridge` is empty until F.
Lockfile gained the new workspace importer.

**Theme B — Simulation runtime: worker, fixed step, transport.** ✅ [PR #1152](https://github.com/bilo-io/midnite-studio/pull/1152). `SimEngine` contract (plus a `capacity` so the worker can size its two buffers), `mulberry32` with an eslint `Math.random` ban, a pure `createSimLoop` (time-based accumulator, 8-tick cap with `droppedTicks`, transferable-buffer ping-pong) behind `sim.worker.ts`, `createUseSim` with a draw-on-rAF `onFrame` callback and hide-pause, and the `Transport` bar plus `SimCanvasFrame` (Space, `.`). The engine table is empty until C/D/E register theirs; the `?worker&inline` import is first exercised by the first sandbox view.

**Theme C — Emergence: cellular automata.** ✅ [PR #1155](https://github.com/bilo-io/midnite-studio/pull/1155). Life-like engine (toroidal, double-buffered, `B/S` rules and four presets), elementary engine (rules 0-255; it keeps and snapshots the whole space-time diagram so a dropped frame loses no rows), a Golly RLE parser with five built-in patterns, and `AutomataView` (1 px/cell canvas, wheel zoom, Shift-pan, draw/erase through `restore`, rule/size/density/pattern/Paste RLE panel). First sandbox on the worker runtime; the built Science bundle carries the inlined worker.

**Theme D — Virtual worlds: n-body gravity.** ✅ [PR #1154](https://github.com/bilo-io/midnite-studio/pull/1154). Direct O(n²) velocity-Verlet engine (`sims/nbody.ts`) with softened gravity, a 200-body cap, `energy`/`energyDrift` stats and four zero-momentum presets; the view is an R3F z-up scene with a body-scale slider and 500-point ring-buffer trails (`sims/trails.ts`), plus a side panel (preset, dt, softening, body table, Add body, four-sig-fig energy read-out). Coincident bodies skip their pair force rather than going NaN, since Add body drops a body on the camera target, often the Sun. The Transport read-out is left empty because it rounds to 3 decimals and would show a tiny drift as 0.

**Theme E — Agent environments: flocking and predator–prey.** ◻ Reynolds boids in a 3D box on a spatial
hash, and a predator–prey world whose population counts chart live.

**Theme F — Scenarios: save and load.** ◻ `SimScenarioSchema` (versioned), one `simulator` channel, files
under the app's userData through `createJsonDirStore`, a scenario list per sandbox.

**Theme G — Launch.** ◻ `comingSoon` dropped from the Simulator module chip, docs updated.

## Build order

1. Phase 126 **A** merged first (the host exists), and 126 **B** for `createJsonDirStore` before F here.
2. **A**, then **B** (every sandbox implements its contract).
3. **C**, **D**, **E** in any order, one PR each — they share only B.
4. **F** after at least one sandbox; **G** last.

## Deliverables

### A — Module scaffold and mount in Science (M)

- [x] **A.1** Create `packages/modules/simulator/` (net-new) from the template.
  - Copy [`packages/modules/_template/`](../../../packages/modules/_template/), drop `.tmpl`, `__ID__` →
    `simulator`, `__LABEL__` → `Simulator`; `package.json` takes `"zod": "^4.0.0"` (126 A.1 fixes the
    template; if 126 has not, set it here).
  - `manifest.ts`: `export const simulatorManifest = defineModuleManifest({ module: 'simulator', label:
    'Simulator', glyph: 'PiPlanetFill', accent: '#6366f1', features: [], views: [] })` — the glyph is the
    launcher's `MODULE_GLYPHS.simulator` ([`app-glyphs.ts`](../../../apps/launcher/src/renderer/app-glyphs.ts)).
  - `moon.yml`: `id: 'module-simulator'`, tags `layer-module`, `app-science`, `app-studio`.
  - `package.json` exports `"./bridge": "./main/bridge.ts"` (as `modules/mind`); deps add `three`,
    `@react-three/fiber`, `@react-three/drei` at media-model's ranges.
  - Verified by `manifest.test.ts`: `simulatorManifest.module === 'simulator'` and it is in
    `APP_MODULES.science`.
- [x] **A.2** Renderer entry.
  - `renderer/simulator-nav.ts`: `SIMULATOR_NAV_GROUP: NavGroup = { id: 'simulator', label: 'Simulator', icon:
    PiPlanetFill, accent: '#6366f1', views: [{ id: 'sim-automata', label: 'Emergence', icon: LuGrid3X3 },
    { id: 'sim-worlds', label: 'Virtual worlds', icon: LuOrbit }, { id: 'sim-agents', label: 'Agent
    environments', icon: LuBird }] }`. View ids carry a `sim-` prefix so they can never collide with
    Science's `notebooks`/`templates` in the shared rail (`navConfigProblems` rejects a duplicate).
  - `renderer/simulator-pane.tsx`: `export function SimulatorPane({ view, onView }: { view: string; onView:
    (view: string) => void })`, its own `FrameChromeProvider chrome={SIMULATOR_CHROME}`; `sim-worlds` →
    `<WorldsView />`, `sim-agents` → `<AgentsView />`, anything else → `<AutomataView />`.
  - `renderer/compose/simulator-chrome.tsx`: `createFrameChrome()` + `DialogHost`.
  - `renderer/index.ts` exports `SIMULATOR_NAV_GROUP`, `SimulatorPane`, `SIMULATOR_CHROME`, `simulatorManifest`.
- [x] **A.3** Main half and bridge.
  - `main/module.ts`: `export const simulatorModuleMain = defineFeatureMain<{ userData: string }>({ feature:
    'simulator', channels: [], register() {} })`; F fills it.
  - `main/bridge.ts`: `export type SimulatorAppBridge = {}` and `createSimulatorBridge(ipc)`; F adds
    `simulator: SimulatorBridge`. **No `report` here** — Science's bridge already carries Report an Issue,
    and `unionBridgeSlices` must not see the key twice.
  - [`tsconfig.base.json`](../../../tsconfig.base.json) paths: `@midnite/studio-module-simulator/main` and
    `/bridge`.
- [x] **A.4** Mount in the Science host (files net-new in Phase 126).
  - `apps/science/main/host.ts`: append `{ module: simulatorModuleMain, services: { userData: el.userData } }`
    to the mounts.
  - `apps/science/main/preload.ts`: add `createSimulatorBridge(ipcRenderer)` to `unionBridgeSlices(...)`.
  - `apps/science/src/host-nav.ts`: `navFromModules(APP_MODULES.science, { science: SCIENCE_NAV_GROUP,
    simulator: SIMULATOR_NAV_GROUP })`.
  - `apps/science/src/host-app.tsx`: `SCIENCE_PANES` gains `simulator: SimulatorPane`.
  - `apps/science/package.json` + `moon.yml`: depend on `@midnite/studio-module-simulator` /
    `module-simulator`, and list `/packages/modules/simulator/**` in build/typecheck/test inputs;
    `tailwind.config.ts` scans the module's `renderer/**`.
  - Verified by `apps/science/src/host-app.test.tsx`: the rail shows two groups, "Science" then "Simulator";
    `firstViewOfModule(SCIENCE_HOST_NAV, 'simulator') === 'sim-automata'` (where a
    `midnite://open?app=simulator` link lands); `navConfigProblems(SCIENCE_HOST_NAV)` is `[]`. And
    `apps/science/main/host.test.ts`: registered channels equal the union of both modules' `channels`.
- [x] **A.5** Id lists: [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts)
  `STUDIO_MODULES` appends `'simulator'`; [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs)
  `NODE_PROJECTS` appends `'module-simulator'`. No placement or link change: `'science'` is already the
  host there (126 A.5) and `simulator` is already a `RETIRED_APP_ALIASES` entry.

### B — Simulation runtime: worker, fixed step, transport (M)

- [x] **B.1** The engine contract, `renderer/engine/types.ts` (net-new).
  - `export interface SimEngine<P, S> { init(params: P, seed: number): void; step(): void; snapshot(out:
    Float32Array): number; stats(): Record<string, number>; serialise(): S; restore(state: S): void }` —
    `step()` advances exactly one fixed tick (each engine owns its `dt`); `snapshot` writes render data into
    `out` and returns the floats written.
  - `renderer/engine/rng.ts`: `mulberry32(seed: number): () => number` — every random draw in every engine
    goes through it; `Math.random` is banned in `renderer/engine/**` and `renderer/sims/**` (an eslint
    `no-restricted-properties` override for those globs in [`eslint.config.mjs`](../../../eslint.config.mjs)).
  - Verified by `renderer/engine/rng.test.ts`: the same seed yields the same first 1,000 draws; all draws
    are in `[0, 1)`.
- [x] **B.2** The worker loop, `renderer/engine/sim.worker.ts` + `renderer/engine/use-sim.ts` (net-new).
  - Messages in: `{ type: 'init'; kind: SimKind; params; seed }`, `{ type: 'play' }`, `{ type: 'pause' }`,
    `{ type: 'step' }` (one tick while paused), `{ type: 'speed'; ticksPerFrame: 0.25 | 0.5 | 1 | 2 | 4 }`,
    `{ type: 'restore'; state }`, `{ type: 'serialise' }`, `{ type: 'return'; buffer: ArrayBuffer }`.
    Out: `{ type: 'frame'; tick; length; buffer; stats }` (buffer transferred), `{ type: 'state'; state }`.
  - `SimKind = 'life' | 'elementary' | 'nbody' | 'boids' | 'predprey'`; the worker maps it to an engine.
  - Loop: a 60 Hz `setInterval` in the worker accumulates `ticksPerFrame` and runs whole ticks (0.25 →
    one tick every fourth interval); at most **8 ticks per interval** — beyond that it drops ticks rather
    than spiral, and `stats.droppedTicks` counts them.
  - **Two buffers ping-pong.** A frame is posted only when the worker holds a returned buffer; the renderer
    draws on `requestAnimationFrame` and posts the buffer back with `return`. With none free, the worker keeps
    stepping and skips posting — a slow renderer never queues frames.
  - `useSim(kind)` returns `{ frame, stats, playing, play, pause, step, reset, setSpeed, serialise }`;
    `reset` re-inits with the current params and seed. On `document.visibilitychange` → hidden it posts
    `pause` and remembers it was playing; visible again resumes only if it was.
  - The worker is imported `?worker&inline`; `createUseSim(workerFactory)` lets tests inject a fake.
  - Verified by `renderer/engine/use-sim.test.tsx` (fake worker): `play` posts `play`; a hidden
    `visibilitychange` posts `pause`, visible posts `play` only when it had been playing; a frame's buffer
    is posted back as `return` after the draw callback.
- [x] **B.3** Transport bar, `renderer/components/transport.tsx` (net-new).
  - Buttons, each `useFrameChrome().IconButton` whose `label` is both its accessible name and its tooltip
    (`IconButtonProps` in [`frame/src/chrome/types.ts`](../../../packages/frame/src/chrome/types.ts)): Play/Pause (`LuPlay`/`LuPause`), Step (`LuStepForward`,
    disabled while playing), Reset (`LuRotateCcw`), a speed select (0.25× – 4×), a seed field (integer,
    Enter re-inits) with a dice button for a fresh seed, and a read-out `tick N · <stats>`.
  - **Space** toggles play while the sandbox canvas has focus (a canvas-local `onKeyDown`, not a
    `CommandId`); **.** steps once while paused.
  - Verified by `renderer/components/transport.test.tsx`: Step is disabled while playing; Space on the
    focused canvas wrapper calls `play` then `pause`.

### C — Emergence: cellular automata (M)

- [x] **C.1** Life-like engine, `renderer/sims/life.ts` (net-new).
  - `LifeParams = { width: number; height: number; rule: string; density: number }` — width/height 64–1024
    (default 256×256), `rule` in `B<digits>/S<digits>` form parsed by `parseRule(rule): { birth: Set<number>;
    survive: Set<number> } | null`, `density` 0–1 for the random fill from the seed.
  - Toroidal grid, two `Uint8Array(width * height)` double-buffered; neighbour count by row-offset sums,
    no per-cell allocation. `snapshot` writes one float per cell (0/1) — the renderer only needs alive cells.
  - Presets: Life `B3/S23`, HighLife `B36/S23`, Seeds `B2/S`, Day & Night `B3678/S34678`; any valid custom
    string is accepted, an invalid one shows "Rule must look like B3/S23" under the input and is not applied.
  - `stats()` → `{ population, generation }`.
  - Verified by `renderer/sims/life.test.ts`: a blinker oscillates with period 2; a glider returns to its
    shape shifted (1, 1) after 4 generations, wrapping at the edge on a 16×16 grid; `parseRule('B3/S23')`
    → birth {3}, survive {2, 3}; `parseRule('X3')` → `null`; a 1024×1024 grid steps 10 generations (no
    timing assertion — the size limit is the rule, not a wall-clock budget).
- [x] **C.2** Patterns and RLE, `renderer/sims/rle.ts` (net-new).
  - `parseRle(text: string): { width: number; height: number; cells: [number, number][]; rule?: string } |
    { error: string }` — the `x = m, y = n, rule = …` header, run counts, `b`/`o`/`$`/`!`; lines starting with
    `#` ignored; a pattern larger than the grid is refused with "Pattern is W×H; the grid is w×h".
  - Built-ins: glider, lightweight spaceship, pulsar, R-pentomino, Gosper glider gun (each as an RLE string).
  - Verified by `renderer/sims/rle.test.ts`: the glider RLE `bob$2bo$3o!` yields the 5 expected cells;
    a malformed RLE returns `{ error }`.
- [x] **C.3** Elementary engine, `renderer/sims/elementary.ts` (net-new).
  - `ElementaryParams = { rule: number /* 0–255 */; width: number /* 128–1024 */; start: 'single' | 'random' }`;
    each tick computes the next row; the renderer keeps the last `height` rows as a scrolling space-time
    diagram.
  - Verified by `renderer/sims/elementary.test.ts`: rule 90 from a single cell produces Sierpiński rows
    (row 2 has cells at ±2); rule 0 empties after one step.
- [x] **C.4** View, `renderer/views/automata-view.tsx` (net-new).
  - Mode toggle **Life-like** / **Elementary**; a Canvas2D sized to the pane, drawn from the snapshot by
    writing an `ImageData` at 1 px per cell and scaling with `imageSmoothingEnabled = false`; zoom 1–16×
    with the wheel, pan by drag with **Shift** held.
  - Drawing (Life-like, paused or playing): pointer-down + drag toggles cells to alive (left) or dead
    (right / **Alt**); edits post `{ type: 'restore' }` with the edited grid.
  - Side panel: rule preset select + custom field, size, density, pattern picker (stamps at grid centre),
    **Paste RLE…** (a dialog with a textarea; errors inline).
  - Empty state: none — the view opens on a seeded random Life grid, paused, so it is never blank.

### D — Virtual worlds: n-body gravity (L)

- [x] **D.1** Engine, `renderer/sims/nbody.ts` (net-new).
  - `Body = { name: string; mass: number; x: number; y: number; z: number; vx: number; vy: number; vz: number;
    color: string; radius: number }`; `NBodyParams = { bodies: Body[]; G: number; dt: number; softening: number }`,
    at most **200 bodies** (direct O(n²) sum; above that the add button disables with "200 bodies is the limit").
  - Velocity-Verlet (kick–drift–kick), acceleration `G m r / (|r|² + ε²)^{3/2}`; `dt` is the preset's.
  - `stats()` → `{ energy, energyDrift }` where `energyDrift = |E − E₀| / |E₀|`, shown in the read-out to
    four significant figures — the honest signal that `dt` is too large.
  - Collisions are not resolved (bodies pass through; softening bounds the force).
  - Verified by `renderer/sims/nbody.test.ts`: a two-body circular orbit (G = 1, m = 1 and 1e-6, r = 1,
    v = 1) returns within 1e-3 of its start after one period (2π) at dt = 0.001; `energyDrift < 1e-6`
    after 10 periods; the figure-eight preset stays bounded (all |r| < 2) for one period.
- [x] **D.2** Presets, `renderer/sims/nbody-presets.ts` (net-new).
  - **Sun–Earth–Moon** and **Inner solar system** (Sun, Mercury, Venus, Earth, Mars on circular, coplanar
    orbits at their semi-major axes) in AU / days / solar masses, `G = 2.959122082855911e-4`, dt 0.5 day.
  - **Figure-eight** (Chenciner–Montgomery): G = 1, three unit masses, x₁ = (0.97000436, −0.24308753, 0),
    x₂ = −x₁, x₃ = 0, v₃ = (−0.93240737, −0.86473146, 0), v₁ = v₂ = −v₃ / 2, dt 0.001.
  - **Binary star**: two 1 M☉ stars at ±0.5 AU on a circular mutual orbit plus one planet at 3 AU.
  - Verified by the D.1 test file (each preset initialises with zero net momentum to 1e-9).
- [x] **D.3** View, `renderer/views/worlds-view.tsx` (net-new).
  - R3F `<Canvas>` filling the pane, drei `OrbitControls`, one sphere mesh per body (radius from the body,
    exaggerated by a "Body scale" slider 1–1000× because true radii are invisible at AU scale), a `Line` trail
    of the last 500 positions per body (a ring buffer, toggle **Trails**).
  - Side panel: preset select, `dt` input (refuses ≤ 0), softening, a body table (name, mass, colour) with
    remove, and **Add body** (placed at the camera target with zero velocity).
  - Snapshot layout: 3 floats per body (positions); trails are accumulated in the renderer.

### E — Agent environments: flocking and predator–prey (L)

- [ ] **E.1** Spatial hash, `renderer/engine/spatial-hash.ts` (net-new).
  - `createSpatialHash(cellSize: number, bounds: number)` with `rebuild(positions: Float32Array, count)` and
    `forEachNear(i, radius, fn)`; flat typed arrays (cell start/count), rebuilt each tick — no `Map` of arrays.
  - Verified by `renderer/engine/spatial-hash.test.ts`: `forEachNear` visits exactly the brute-force
    neighbour set for 500 random points.
- [ ] **E.2** Boids, `renderer/sims/boids.ts` (net-new).
  - `BoidsParams = { count: number /* 10–2000, default 400 */; box: number /* 100 */; separation: number;
    alignment: number; cohesion: number; radius: number /* 5 */; maxSpeed: number /* 4 */ }`; Reynolds's
    three steering rules over neighbours from E.1, a soft wall force within 10 % of the box edge, dt 1/60.
  - `stats()` → `{ count, meanSpeed, polarisation }` where polarisation is |mean of unit velocities| (0 =
    disordered, 1 = aligned).
  - Verified by `renderer/sims/boids.test.ts`: same seed → identical positions after 100 ticks; with
    `alignment = 2, separation = cohesion = 0`, polarisation after 600 ticks exceeds its tick-0 value.
- [ ] **E.3** Predator–prey, `renderer/sims/predprey.ts` (net-new).
  - Two species in a 2D-plane box (z = 0): prey wander and flee predators within 8 units; predators steer to
    the nearest prey within 15 units and eat it within 1 unit (+energy). Every agent loses energy per tick; at
    zero it dies; above a threshold it reproduces with a seeded probability. Defaults 300 prey / 20 predators.
  - Hard cap **5,000 agents**: at the cap reproduction stops and the read-out shows "Population cap reached".
  - `stats()` → `{ prey, predators }`; the view keeps the last 2,000 ticks of both counts.
  - Verified by `renderer/sims/predprey.test.ts`: same seed → identical counts after 500 ticks; with no
    predators prey never decrease below their start except by energy death; the cap holds at 5,000.
- [ ] **E.4** View, `renderer/views/agents-view.tsx` (net-new).
  - Environment toggle **Flocking** / **Predator–prey**; R3F instanced cones oriented by velocity (prey
    `#22c55e`, predators `#ef4444`, boids the module accent), drei `OrbitControls`; side panel sliders for the
    params; for predator–prey a `Sparkline` of both counts under the canvas.
  - `renderer/components/sparkline.tsx` (net-new): `<Sparkline series={{ label; color; values: number[] }[]}
    width={480} height={96} />` — a plain SVG polyline per series with shared y-scale; written here rather
    than imported from Science's `PlotSvg` because a module may not import another module (Decision 4).
  - Verified by `renderer/components/sparkline.test.tsx`: two series render two `<polyline>`s; an empty
    series renders nothing and does not throw.

### F — Scenarios: save and load (M)

- [ ] **F.1** Schemas, net-new `packages/shared/src/simulator.ts` (exported from the barrel).
  - `SimScenarioIdSchema = z.string().regex(/^sim-[a-z0-9]{12}$/)`; `SimKindSchema = z.enum(['life',
    'elementary', 'nbody', 'boids', 'predprey'])`.
  - `SimScenarioSchema = z.object({ version: z.literal(1), id, kind, title: z.string().min(1).max(200), seed:
    z.number().int(), params: z.record(z.string(), z.unknown()), state: z.unknown().optional(), createdAt:
    z.string().datetime(), updatedAt: z.string().datetime() })` — `params`/`state` are validated per kind by
    the engine's own zod schema (`LifeParamsSchema` etc., in the module's renderer) when loaded, so shared
    stays free of engine detail.
  - Size cap: a serialised scenario over 8 MB is refused by the store (`'Scenario is larger than 8 MB'`) —
    a 1024² Life grid is stored as RLE (C.2) rather than raw cells, so a real one is far smaller.
  - `migrateSimScenario(raw): SimScenario | null` — v1 only, as `migrateScienceNotebook`.
  - `SimulatorRequestSchema` op union: `list` (optional `kind` filter), `read { id }`, `save { scenario
    (without id/timestamps) | with id }`, `rename { id, title }`, `remove { id }`.
  - Verified by `packages/shared/src/simulator.test.ts`: a valid scenario parses; `sim-../x` fails;
    version 2 migrates to `null`.
- [ ] **F.2** Channel, bridge and store.
  - [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts): `simulator:
    'mstudio:simulator:scenario'`; [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts):
    `SimulatorBridge` (one method per op, each `Promise<GitOpResult<…>>`) and **optional** `simulator?:
    SimulatorBridge` on `MidniteStudioBridge` (Studio never carries it, as with `science?`).
  - `main/scenario-store.ts`: `createScenarioStore(dir, trashItem)` over `createJsonDirStore({ dir:
    <userData>/simulations, prefix: 'sim-', idPattern: /^sim-[a-z0-9]{12}$/, parse: migrateSimScenario })`;
    `remove` goes to the Trash.
  - `main/context.ts`: `registerSimulatorOn(ctx, { userData })` handles `CHANNELS.simulator` with
    `SimulatorRequestSchema`; `simulatorModuleMain.channels = [CHANNELS.simulator]`.
  - `main/bridge.ts`: `SimulatorAppBridge = { simulator: SimulatorBridge }`.
  - Verified by `main/scenario-store.test.ts` (tmp dir: save → list filtered by kind → read; remove calls
    `trashItem`; a 9 MB scenario is refused) and `main/bridge.test.ts` (top-level keys exactly `['simulator']`).
- [ ] **F.3** Scenario panel, `renderer/components/scenario-panel.tsx` (net-new).
  - In each view's side panel: **Save** (asks for a title the first time; saves `serialise()` + params +
    seed), a list of saved scenarios for that view's kinds (title, relative `updatedAt`), click to load
    (`restore`), context menu (`useDialogs().openMenu`) Rename (`useDialogs().prompt`) / Delete, confirmed with
    `useFrameChrome().useDialogs().confirm({ title: "Move '<title>' to the Trash?", body: 'You can restore it from the Trash in Finder.', confirmLabel: 'Move to Trash', danger: true, blastRadius: { count: 1, sample: [] }, blastRadiusKind: 'trash' })`.
  - A scenario whose per-kind params fail their schema shows "This scenario was saved by a newer or
    different version and cannot be opened" and stays listed.
  - Loading or `{ ok: false }` states: an inline spinner after 150 ms; an error banner with **Retry**.
  - Verified by `renderer/components/scenario-panel.test.tsx`: Save then the list shows the title; a
    scenario with bad params renders the cannot-open message.

### G — Launch (S)

- [ ] **G.1** [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts): delete `comingSoon: true` from
  `MODULES.simulator`; the `like`/`vision` on the Science `RAW_APPS` entry stay. [`catalog.test.ts`](../../../apps/launcher/src/common/catalog.test.ts):
  `module('science', 'simulator').comingSoon` is `undefined`.
- [ ] **G.2** [`docs/APPS.md`](../../../docs/APPS.md): host table row → "Science | Science, Simulator"; the
  Science section (126 H.3) gains a Simulator paragraph (engines, the worker ping-pong, the scenario store).
  [`packages/website/src/apps/catalog.ts`](../../../packages/website/src/apps/catalog.ts): the Science entry's
  features gain "Simulations: cellular automata, gravity and flocking".

## Files this phase touches

| File | Change |
|---|---|
| `packages/modules/simulator/**` | **net-new** — manifest, renderer (nav, pane, chrome, engine, sims, views, components), main (module, context, scenario-store, bridge), tests |
| `apps/science/main/host.ts`, `main/preload.ts`, `src/host-nav.ts`, `src/host-app.tsx`, `package.json`, `moon.yml`, `tailwind.config.ts` | mount the second module (files net-new in Phase 126) |
| `packages/shared/src/simulator.ts` + `.test.ts` | **net-new** — scenario schema, request union, migration |
| [`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts) | `export * from './simulator'` |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | `simulator` channel, `SimulatorBridge`, optional `simulator?` |
| [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) | `'simulator'` in `STUDIO_MODULES` |
| [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs) | `'module-simulator'` in `NODE_PROJECTS` |
| [`tsconfig.base.json`](../../../tsconfig.base.json) | two path aliases |
| [`eslint.config.mjs`](../../../eslint.config.mjs) | `Math.random` banned under the module's `engine/` and `sims/` |
| [`apps/launcher/src/common/catalog.ts`](../../../apps/launcher/src/common/catalog.ts) + test | Simulator chip leaves "Coming soon" |
| [`docs/APPS.md`](../../../docs/APPS.md), [`packages/website/src/apps/catalog.ts`](../../../packages/website/src/apps/catalog.ts) | docs, site feature line |
| `pnpm-lock.yaml` | three / r3f / drei on the new module |
| [`packages/shared/src/modules.ts`](../../../packages/shared/src/modules.ts) | (**unchanged**, load-bearing) — `APP_MODULES.science` and the `simulator` alias already exist |
| `packages/runtime/src/json-dir-store.ts` | (**unchanged** here; net-new in Phase 126) — the scenario store's base |

## Verification

- [ ] `rng.test.ts`: seeded determinism; range `[0, 1)`.
- [ ] `use-sim.test.tsx`: play/pause messages; visibility pause/resume; buffer returned after draw.
- [ ] `transport.test.tsx`: Step disabled while playing; Space toggles.
- [ ] `life.test.ts`: blinker period 2; glider wraps; rule parsing.
- [ ] `rle.test.ts`: glider cells; malformed RLE error.
- [ ] `elementary.test.ts`: rule 90 Sierpiński row; rule 0 empties.
- [ ] `nbody.test.ts`: two-body period return within 1e-3; energy drift < 1e-6 over 10 periods; figure-eight bounded; presets have zero net momentum.
- [ ] `spatial-hash.test.ts`: neighbour sets equal brute force.
- [ ] `boids.test.ts`: determinism; alignment raises polarisation.
- [ ] `predprey.test.ts`: determinism; cap at 5,000.
- [ ] `sparkline.test.tsx`: one polyline per series; empty safe.
- [ ] `simulator.test.ts`, `scenario-store.test.ts`, `bridge.test.ts`: schema, store, 8 MB cap, bridge allow-list.
- [ ] `scenario-panel.test.tsx`: save lists; bad params message.
- [ ] `apps/science` `host-app.test.tsx` / `host.test.ts`: two groups; `firstViewOfModule(…, 'simulator') === 'sim-automata'`; union of channels.
- [ ] `catalog.test.ts`, `composition.test.ts`, `gate-projects-check` green.
- [ ] **Open, for a human:** a Gosper gun emits gliders; the figure-eight traces its eight; a flock visibly aligns; predator–prey counts oscillate; switching to another app pauses the simulation (Activity Monitor CPU drops).

## Not in this phase

- **LLM-driven agents** in the agent environments — needs the companion/agent host the suite apps do not have yet ([`docs/APPS.md`](../../../docs/APPS.md) § "Deferred: a pty host").
- **Barnes–Hut / GPU n-body** — 200 bodies direct-sum is enough for the presets; a tree code is its own phase.
- **Real ephemerides (JPL Horizons)** — a network fetch and licensing review; presets use circular orbits.
- **Collisions and merging bodies**, **3D cellular automata**, **physics engines (rigid bodies)**.
- **Exporting video/GIF of a run** — the Media app's video pipeline is the right home for that.
- **Embedding a simulation in a Science notebook** — a cross-module feature that needs a host port; later.

## Decisions / open questions

1. **Resolved — Three sandboxes, one per catalog feature.** Agreed cellular automata, n-body and flocking/predator–prey, because each catalog line (Emergence, Virtual Worlds, Agent Environments) becomes one rail row and one engine, and each is small enough to land as one PR.
2. **Resolved — Simulations run in a worker on a fixed timestep with a seed.** Agreed over a main-thread `requestAnimationFrame` loop, because a 1024² Life grid or 2,000 boids would stall the UI, and a fixed step plus `mulberry32` makes every run reproducible — which is what makes the engines testable and scenarios replayable.
3. **Resolved — Two-buffer ping-pong, drop frames not ticks.** Agreed that the worker never queues more than two frames, because a slow renderer must slow the picture, not the simulation's correctness or memory.
4. **Resolved — The sparkline is written again, not shared with Science.** Agreed, because the layer rule forbids `module-simulator` importing `module-science`, and a 40-line SVG polyline does not justify moving a component into the frame; if a third consumer appears, move it to the frame then.
5. **Resolved — Scenarios store params and a compact state, validated per kind on load.** Agreed `shared` holds only the envelope (`params`/`state` as `unknown`), because engine parameters change faster than the wire contract and a per-kind schema in the module can reject an incompatible scenario with a clear message instead of a crash.
6. **Resolved — Velocity-Verlet with softening for gravity.** Agreed over RK4, because Verlet is symplectic (energy drift stays bounded over long runs, which the read-out shows) and costs one force evaluation per step.
7. **Resolved — Pause when the window is hidden.** Agreed, because a forgotten simulation in a background app burning a core is exactly what Monitor exists to catch; `requestAnimationFrame` already stops when hidden, and the worker loop now follows it.
8. **Resolved — No new Playwright spec.** Agreed: every engine rule is a pure function under vitest; canvas/WebGL appearance is the human pass; the e2e budget stays.
