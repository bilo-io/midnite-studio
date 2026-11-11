# Phase 126 — Science app

**Refined: x1** · 2026-11-11 · UI/UX & interaction, empty/loading/error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, security & blast radius, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

Planned by an unattended swarm agent (agent-A) · 2026-11-11 · grounded against the tree at `c9bef6832`.

Science is a launcher tile today and nothing else: `RAW_APPS` in
[`apps/launcher/src/common/catalog.ts`](../../../apps/launcher/src/common/catalog.ts) lists it with
`comingSoon: true` ("Maths, physics, chemistry, biology, 3D visualization and simulation", *like Wolfram,
Jupyter and ChimeraX*), `APP_MODULES.science = ['science', 'simulator']` in
[`packages/shared/src/modules.ts`](../../../packages/shared/src/modules.ts) names it a module host, and
there is no `apps/science` and no `packages/modules/science`. This phase builds the app and its own module:
**scientific notebooks** — markdown with LaTeX, computed cells (units, matrices, complex numbers,
symbolic derivatives), function plots and a 3D molecule viewer — plus a template shelf per discipline, and
flips the tile from "Coming soon" to installable. The Simulator module is
[Phase 127](phase-127-simulator.md); this phase leaves the host ready for it.

> **Builds on.**
> - **The host pattern.** [`apps/mind`](../../../apps/mind) is the nearest two-module host:
>   [`main/host.ts`](../../../apps/mind/main/host.ts) mounts modules through `mountModuleMains`,
>   [`src/host-app.tsx`](../../../apps/mind/src/host-app.tsx) renders `SuiteAppShell` + `ModuleViewRouter`
>   over `MIND_PANES`, [`src/host-nav.ts`](../../../apps/mind/src/host-nav.ts) builds the rail with
>   `navFromModules(APP_MODULES.mind, …)`. [`apps/money`](../../../apps/money) is the nearest app whose
>   second module does not exist yet (`APP_MODULES.money = ['money', 'accountant']`, only Money mounted).
> - **The module skeleton.** [`packages/modules/_template/`](../../../packages/modules/_template/) (`.tmpl`
>   files) and the guide in [`docs/APPS.md`](../../../docs/APPS.md) § "Adding a module to a host" and
>   § "Building a new app on the kit".
> - **IPC.** One zod-validated channel with an `op` discriminated union, as `mediaAnimation` does
>   (`AnimationRequestSchema` in [`shared/src/media-animation.ts`](../../../packages/shared/src/media-animation.ts),
>   `AnimationBridge` in [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts)). Every op
>   answers a `GitOpResult` ([`shared/src/domain/result.ts`](../../../packages/shared/src/domain/result.ts)),
>   never a throw.
> - **Private, atomic files.** `writePrivateFile` / `ensurePrivateDir` in
>   [`runtime/src/private-files.ts`](../../../packages/runtime/src/private-files.ts) (0600 temp + `rename`,
>   0700 directories).
> - **3D.** `three` + `@react-three/fiber` + `@react-three/drei`, already dependencies of
>   [`features/media-model`](../../../packages/features/media-model/package.json).
> - **Workers in a `file://` renderer.** [`packages/app/vite.config.ts`](../../../packages/app/vite.config.ts)
>   explains why a packaged renderer must import a worker with `?worker&inline` and `worker.format: 'es'`.

> **Scope guardrails.** macOS arm64 only. Every icon from `react-icons/<set>`. The renderer reaches main
> only through `window.midniteStudio`. Notebook compute runs locally in a renderer worker — no Python
> kernel, no network, no LLM. Studio does not render the Science module (it only lists it in
> `STUDIO_MODULES`); see Decision 3.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_A notebook that does the maths._ Science has been a promise on the launcher since Phase 124 made it a
host; this phase makes it an app you can install: notebooks of prose, LaTeX, live calculations, plots and
molecules, saved as plain JSON under the app's own data directory, with a template shelf so the first
notebook is never blank. Planned 2026-11-11; first slice is **A + B**, then **C + D**, **E + G**, **F**, and **H** last.

**Theme A — App and module scaffold.** ✅ [PR #1136](https://github.com/bilo-io/midnite-studio/pull/1136) `apps/science` and `packages/modules/science` from the Mind host and the module template; `science` is in every id list (`MidniteAppId`, placement, `STUDIO_MODULES`, `NODE_PROJECTS`) and the release matrix carries the bundle with its icon. The pane is the empty notebooks state plus a templates placeholder; the main half registers no channels yet and the bridge is `report` only (B adds `science`). The template's zod pin is fixed. Surprises: `scripts/typecheck-node.test.mjs` and `gate-projects-check.test.mjs` pin the `NODE_PROJECTS` count and list, so each new module bumps them. Landed with CI billing-locked, on the local affected-subset gate.

**Theme B — Notebook store and IPC.** ✅ [PR #1138](https://github.com/bilo-io/midnite-studio/pull/1138) `ScienceNotebookSchema` (versioned, `migrateScienceNotebook`) in `shared/src/science.ts`, one `science` channel with an `op` union, `ScienceBridge` (optional `science?` on `MidniteStudioBridge`), a generic `createJsonDirStore` in the runtime (atomic 0600 files, quarantine of bad or misnamed files, id jail) that 127 and 128 reuse, and the module's `createNotebookStore` (remove goes to the OS Trash) registered through `registerScienceOn`. `importStructure` answers "Not available yet" until Theme F. Landed with CI billing-locked, on the local affected-subset gate; `runtime:test`'s egress-registry case fails on `main` (sketchfab.ts) independently of this work.

**Theme C — Notebook editor: text and maths cells.** ✅ [PR #1140](https://github.com/bilo-io/midnite-studio/pull/1140) The notebook list (discipline filter, rename, Trash-confirmed delete, error banner, quarantine line, last-open notebook persisted) and the editor (title via `rename`, add/move/delete cells, a draft store that autosaves 600 ms after the last edit and flushes on unmount, "Not saved" on a failed write), with markdown cells rendered through react-markdown, remark-math and rehype-katex (`throwOnError: false`). Compute cells are a plain textarea and plot/molecule cells a one-line placeholder until D, E and F. Landed with CI billing-locked, on the local affected-subset gate.

**Theme D — Compute cells in a worker.** ✅ [PR #1142](https://github.com/bilo-io/midnite-studio/pull/1142) mathjs in an inline Web Worker: top-down evaluation in one fresh scope per run (`evaluateNotebook`), units/matrices/complex/derivatives, `import`/`createUnit`/`reviver`/`evaluate`/`parse`/`compile` replaced by throwing stubs after the real `parse`/`compile` are captured. `createUseCompute(factory)` debounces 300 ms, drops stale `runId`s, and past 2 s terminates and respawns the worker with "Stopped after 2 s" on every compute cell; the cell shows KaTeX of the expression beside the value, or `Line N: message`. Only compute-cell edits post a run.

**Theme E — Plot cells.** ◻ y = f(x) series sampled in the worker against the notebook's scope, drawn as a
hand-rolled SVG with nice-number ticks, percentile auto-range and asymptote breaks.

**Theme F — Molecule viewer cells.** ◻ XYZ, PDB and MOL/SDF parsers, bond inference on a spatial grid, an
instanced ball-and-stick R3F view with CPK colours, imported through a native picker capped at 10 MB.

**Theme G — Templates.** ◻ Eight built-in notebooks across maths, physics, chemistry and biology on a
Templates view; "Use template" creates a copy.

**Theme H — Launch: catalog, website, docs.** ◻ `comingSoon` dropped from the Science tile (Simulator keeps
its own), the website lists Science, `docs/APPS.md` records the app.

## Build order

1. **A** first and alone: every later theme imports from `packages/modules/science`.
2. **B** next: C–G all read or write notebooks through it.
3. **C + D** together (the editor and the compute cell share the cell list component), then **E + G**
   (plots read D's worker; templates need C–E's cell kinds), then **F**.
4. **H** last, after the release matrix carries the bundle (Decision 7). Phase 127 may start once A has
   merged; it touches only the host's mount list, preload union, nav and panes.

## Deliverables

### A — App and module scaffold (L)

- [x] **A.1** Create `packages/modules/science/` from the template.
  - Copy [`packages/modules/_template/`](../../../packages/modules/_template/) to `packages/modules/science/`
    (net-new), drop `.tmpl`, replace `__ID__` → `science`, `__LABEL__` → `Science`.
  - **Fix the template's stale zod pin while copying:** `package.json` takes `"zod": "^4.0.0"` (the repo
    finished the zod 4 upgrade in #1126; the template still says `^3.23.8`). Do the same edit in
    `_template/package.json.tmpl` in this PR.
  - `manifest.ts`: `export const scienceManifest = defineModuleManifest({ module: 'science', label: 'Science',
    glyph: 'PiFlaskFill', accent: '#06b6d4', features: [], views: [] })` — `features: []` and `views: []`
    because the code lives in the module (Decision 2) and the host's rail ids are host-local strings, not
    Studio `ViewId`s (Money's `moneyManifest` does the same).
  - `moon.yml`: `id: 'module-science'`, tags `layer-module`, `app-science`, `app-studio`.
  - Verified by `packages/modules/science/manifest.test.ts` (from the template): `scienceManifest.module ===
    'science'` and `MODULE_IDS.includes(scienceManifest.module)`.
- [x] **A.2** The module's renderer entry: nav group, pane and app manifest.
  - `renderer/science-nav.ts` (net-new): `export const SCIENCE_NAV_GROUP: NavGroup = { id: 'science', label:
    scienceManifest.label, icon: PiFlaskFill, accent: scienceManifest.accent, views: [{ id: 'notebooks',
    label: 'Notebooks', icon: LuNotebookText }, { id: 'templates', label: 'Templates', icon: LuLayoutTemplate }] }`
    (`react-icons/pi`, `react-icons/lu`; both names must resolve — add them to the assertion in
    `renderer/science-nav.test.ts`).
  - `renderer/science-manifest.ts` (net-new): `SCIENCE_APP = { id: 'science', name: 'Midnite Science',
    tagline: 'Notebooks for maths, physics, chemistry and biology', accent: '#06b6d4', home: 'notebooks' } as const`.
  - `renderer/science-pane.tsx` (net-new): `export function SciencePane({ view, onView }: { view: string;
    onView: (view: string) => void })` — its own `QueryClientProvider` and `FrameChromeProvider
    chrome={SCIENCE_CHROME}` exactly as [`MindPane`](../../../packages/modules/mind/renderer/mind-pane.tsx);
    `view === 'templates'` renders `<TemplatesView />`, anything else `<NotebooksView />`.
  - `renderer/compose/science-chrome.tsx` (net-new): `SCIENCE_CHROME = createFrameChrome()` from the frame
    plus its `DialogHost`, as `compose/mind-chrome.tsx` does.
  - In A, `NotebooksView` is the empty state only (C fills it): centred `PiFlaskFill` at 48 px, heading
    "No notebooks yet", body "Start from a template or a blank page.", buttons **New notebook** (disabled
    until B) and **Browse templates** (`onView('templates')`).
  - `renderer/index.ts` exports `SCIENCE_NAV_GROUP`, `SCIENCE_APP`, `SciencePane`, `SCIENCE_CHROME`,
    `scienceManifest`.
- [x] **A.3** The module's main half and bridge.
  - `main/module.ts` (net-new): `export type ScienceModuleServices = { userData: string; showOpenDialog?:
    ShowOpenDialog }` and `export const scienceModuleMain = defineFeatureMain<ScienceModuleServices>({ feature:
    'science', channels: [], register() {} })`. B.4 fills `channels: [CHANNELS.science]` and
    `register(ctx, services) { registerScienceOn(ctx, services) }`.
  - `main/index.ts` re-exports `module`, `context`, `notebook-store` and `scienceManifest`, like
    `modules/mind/main/index.ts`.
  - `main/bridge.ts` (net-new): `export type ScienceAppBridge = { report: ReportBridge }` and
    `createScienceBridge(ipc: RendererIpc): ScienceAppBridge`, shaped like
    [`createMindBridge`](../../../packages/modules/mind/main/bridge.ts). A ships `report` only; B.2 adds
    `science: ScienceBridge` to the type and the factory.
  - `package.json` exports add `"./bridge": "./main/bridge.ts"` (source, exactly as
    `packages/modules/mind/package.json` does, so a sandboxed preload bundles only the bridge);
    [`tsconfig.base.json`](../../../tsconfig.base.json) paths gain
    `@midnite/studio-module-science/main` → `./packages/modules/science/main/index.ts` and
    `@midnite/studio-module-science/bridge` → `./packages/modules/science/main/bridge.ts`.
  - Verified by `main/bridge.test.ts`: the bridge's top-level keys are exactly `['report']` after A and
    `['report', 'science']` after B (the allow-list rule `mind/main/bridge.test.ts` holds).
- [x] **A.4** `apps/science/` from `apps/mind/`.
  - Net-new files, each copied from its `apps/mind` twin and renamed: `package.json`
    (`"name": "@midnite/app-science"`, `"version"` equal to `apps/money/package.json`'s — `scripts/version-check.mjs`
    holds every `apps/*` in lockstep), `moon.yml` (`id: 'app-science'`, tags `layer-app`, `app-science`,
    `dependsOn` `shared`, `frame`, `runtime`, `feature-report`, `feature-monitor`, `module-science`; the
    build/typecheck/test `inputs` list `/packages/modules/science/**` the way Money lists `modules/money`),
    `tsconfig.json`, `vite.config.ts` (`server: { port: 5194, strictPort: true }`, `worker: { format: 'es' }`
    for D), `vitest.config.ts`, `tailwind.config.ts` (`frameContent(__dirname, [])` plus the module's
    `renderer/**`), `postcss.config.js`, `scripts/bundle-main.mjs`, `src/index.html`, `src/main.tsx`,
    `src/styles.css`, `src/index.ts`.
  - `main/identity.ts`: `SCIENCE_NAME = 'Midnite Science'`, `SCIENCE_BUNDLE_ID = 'io.bilo.midnite-science'`,
    `SMOKE_ENV = 'MIDNITE_SCIENCE_SMOKE'`, `USER_DATA_ENV = 'MIDNITE_SCIENCE_USER_DATA'`,
    `SMOKE_READY_LINE = 'midnite-science:ready'`, `scienceUserData(appData, override?)` →
    `join(runtimeDataDirectory(appData), 'apps', 'science')` (copy `moneyUserData`). No vault directory or
    pairing: Science reads no secret.
  - `main/host.ts`: `export function registerScienceHost(el: ScienceHostElectron): void` mounting
    `[{ module: scienceModuleMain, services: { userData: el.userData, showOpenDialog: el.showOpenDialog } }]`
    through `mountModuleMains(createIpcContext(el), mounts)`, where `ScienceHostElectron = IpcContextElectron &
    { userData: string; showOpenDialog: ShowOpenDialog }` — a list of one, so Phase 127 appends the Simulator mount and nothing else.
  - `main/index.ts`: Money's `index.ts` with `registerScienceHost` in place of `registerMoneyHandlers`;
    keeps `registerSuiteMain`, `registerSuiteMonitor`, `createFileSink({ name: 'science.log' })`,
    `registerReport`, the single-instance lock, `second-instance` → `suite?.handleArgv(argv)`, and
    `suiteWindowOptions(process.platform)` + `--mstudio-frameless` in `openWindow`.
  - `main/preload.ts`: `unionBridgeSlices(createScienceBridge(ipcRenderer), createMonitorFeatureBridge(
    createBridgeSlice(ipcRenderer)), createSuiteBridge(ipcRenderer, process.argv, process.platform))`,
    importing each by its subpath, never a barrel.
  - `src/host-nav.ts`: `SCIENCE_HOST_NAV = navFromModules(APP_MODULES.science, { science: SCIENCE_NAV_GROUP })`.
  - `src/host-app.tsx`: `ScienceHostApp`, Mind's `MindHostApp` with `SCIENCE_PANES = { science: SciencePane }`,
    `app="science"`, `ReportIssueHost app="midnite-science"`, `createSuiteMonitorSegment({ hosted: new Set(['science']) })`.
  - `resources/icon.icns`: written by `moon run launcher:icons`
    ([`app-icons.cjs`](../../../apps/launcher/scripts/app-icons.cjs) writes it for any `apps/<id>/moon.yml`
    beside a master logo; `resources/app-logos/science.png` already exists). Commit the binary.
  - Verified by `apps/science/main/identity.test.ts` (userData path, override, smoke flag),
    `apps/science/main/host.test.ts` (with `createRecordingContext()`: registers without throwing, and the
    registered channels equal `scienceModuleMain.channels`), and `apps/science/src/host-app.test.tsx`
    (renders the rail with the "Science" group label and both rows; `navConfigProblems(SCIENCE_HOST_NAV)`
    is `[]`).
- [x] **A.5** Extend every id list that names an app or a module (the board's wiring contract).
  - [`shared/src/midnite-link.ts`](../../../packages/shared/src/midnite-link.ts): `MidniteAppId =
    ModuleHostId` (drop `Exclude<…, 'science'>`), append `'science'` to `MIDNITE_APP_IDS`; update
    [`midnite-link.test.ts`](../../../packages/shared/src/midnite-link.test.ts)'s first case to
    `MODULE_HOST_IDS` unfiltered and rename it "names exactly the module hosts".
  - [`shared/src/domain/placement.ts`](../../../packages/shared/src/domain/placement.ts)
    `PlacementAppIdSchema` and [`scripts/affected-apps.mjs`](../../../scripts/affected-apps.mjs)
    `PLACEMENT_APPS`: append `'science'` after `'vanguard'` (the test pins the two equal; without it the
    `app-science` tag is an unknown tag).
  - [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) `STUDIO_MODULES`: append
    `'science'` (the composition test fails otherwise).
  - [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs) `NODE_PROJECTS`: append
    `'module-science'` (puts its typecheck and vitest on `gate-node`).
  - [`scripts/release-bundles.test.mjs`](../../../scripts/release-bundles.test.mjs): a `describe('apps/science
    (Phase 126)')` mirroring Money's — `bundleMatrix(apps, has).include` contains `{ app: 'science', project:
    'app-science', dir: 'apps/science' }` and `apps/science/resources/icon.icns` reads as an `icns` header.
  - `pnpm install` updates `pnpm-lock.yaml`; commit it.

### B — Notebook store and IPC (M)

- [x] **B.1** Schemas in net-new `packages/shared/src/science.ts` (zod only, exported from the barrel).
  - `ScienceNotebookIdSchema = z.string().regex(/^nb-[a-z0-9]{12}$/)` — the id is the file name, so the
    regex is the path jail.
  - `ScienceDisciplineSchema = z.enum(['maths', 'physics', 'chemistry', 'biology', 'general'])`.
  - Cells, `ScienceCellSchema = z.discriminatedUnion('kind', [...])`, each with `id: z.string().regex(/^c-[a-z0-9]{8}$/)`:
    `{ kind: 'markdown', source: z.string().max(100_000) }`,
    `{ kind: 'compute', source: z.string().max(20_000) }`,
    `{ kind: 'plot', series: z.array(z.object({ expr: z.string().min(1).max(500), label: z.string().max(80).optional() })).min(1).max(4),
      x: z.object({ min: z.number().finite(), max: z.number().finite() }).refine((r) => r.max > r.min),
      y: z.union([z.literal('auto'), z.object({ min: z.number().finite(), max: z.number().finite() })]) }`,
    `{ kind: 'molecule', name: z.string().max(200), format: z.enum(['xyz', 'pdb', 'mol']), text: z.string().max(10 * 1024 * 1024) }`.
  - `ScienceNotebookSchema = z.object({ version: z.literal(1), id, title: z.string().min(1).max(200),
    discipline, createdAt: z.string().datetime(), updatedAt: z.string().datetime(), cells: z.array(ScienceCellSchema).max(500) })`.
  - `ScienceNotebookSummarySchema` = `{ id, title, discipline, updatedAt, cellCount }`.
  - `migrateScienceNotebook(raw: unknown): ScienceNotebook | null` — `version: 1` parses as-is; anything
    else returns `null` (the store quarantines it). The function exists now so v2 adds an arm, not a seam.
  - `ScienceRequestSchema = z.discriminatedUnion('op', [ { op:'list' }, { op:'read', id }, { op:'create',
    title, discipline, cells: z.array(ScienceCellSchema).max(500) }, { op:'write', notebook: ScienceNotebookSchema },
    { op:'rename', id, title }, { op:'remove', id }, { op:'importStructure' } ])` (`importStructure` is F's).
  - Verified by net-new `packages/shared/src/science.test.ts`: a valid notebook round-trips; `id: '../x'`
    fails; a plot with `x.max <= x.min` fails; 501 cells fail; `migrateScienceNotebook({ version: 2 })` is `null`.
- [x] **B.2** Channel, bridge type, schema registration.
  - [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts): `science: 'mstudio:science:notebook'`.
  - [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts): `export type ScienceBridge =
    { list(): Promise<GitOpResult<{ notebooks: ScienceNotebookSummary[]; quarantined: number }>>; read(req: { id }):
    Promise<GitOpResult<{ notebook: ScienceNotebook }>>; create(req: { title; discipline; cells }):
    Promise<GitOpResult<{ notebook: ScienceNotebook }>>; write(req: { notebook }): Promise<GitOpResult<{ updatedAt: string }>>;
    rename(req: { id; title }): Promise<GitOpResult>; remove(req: { id }): Promise<GitOpResult>;
    importStructure(): Promise<GitOpResult<{ name: string; format: 'xyz' | 'pdb' | 'mol'; text: string } | { cancelled: true }>> }`,
    and `science?: ScienceBridge` on `MidniteStudioBridge` — **optional**, like `suiteLink?`, because only
    the Science host carries it and Studio's preload must not have to (Decision 4).
  - `createScienceBridge` fills `science` with one `call(CHANNELS.science, { op, … })` per method.
- [x] **B.3** A generic JSON-directory store in the runtime, `packages/runtime/src/json-dir-store.ts` (net-new).
  - `export function createJsonDirStore<T extends { id: string; updatedAt: string }>(opts: { dir: string;
    prefix: string; idPattern: RegExp; parse: (raw: unknown) => T | null }): JsonDirStore<T>` with
    `list(): Promise<{ items: T[]; quarantined: number }>`, `read(id): Promise<T | null>`,
    `write(item: T): Promise<void>`, `exists(id): Promise<boolean>`, `mintId(): string` and
    `pathOf(id): string`. Exported from [`runtime/src/index.ts`](../../../packages/runtime/src/index.ts).
  - Lives in the runtime, not the module, because [Phase 127](phase-127-simulator.md)'s scenario store and
    [Phase 128](phase-128-health.md)'s logs need the same thing and a module may not import another module.
  - Writes go through `writePrivateFile` ([`runtime/src/private-files.ts`](../../../packages/runtime/src/private-files.ts)):
    0600 temp file then `rename`, the directory made 0700 by `ensurePrivateDir`; a crash mid-write leaves
    the old file intact.
  - Every id is checked against `idPattern` before any path is built (`pathOf` throws on a miss) — the
    pattern is the path jail; the file is `<dir>/<id>.json`.
  - `list()` reads every `<prefix>*.json`, `JSON.parse` + `parse`; a file that fails either is renamed to
    `<id>.json.corrupt-<epoch ms>` and counted in `quarantined` — never deleted, never fatal. Sorted by
    `updatedAt` descending.
  - `mintId()` is `prefix` + 12 chars of `[a-z0-9]` from `randomBytes`.
  - Verified by net-new `packages/runtime/src/json-dir-store.test.ts` (tmp dir): write → list → read;
    a garbage file is quarantined (`quarantined === 1`, the `.corrupt-*` file exists); `pathOf('../x')`
    throws; written files are mode `0o600`.
- [x] **B.3b** The notebook store over it, `packages/modules/science/main/notebook-store.ts` (net-new).
  - `export function createNotebookStore(dir: string, trashItem: (path: string) => Promise<void>): NotebookStore`
    with `list()`, `read(id)`, `create(input)`, `write(notebook)`, `rename(id, title)`, `remove(id)`, each
    returning `GitOpResult`; `dir` is `<userData>/notebooks`. Built on `createJsonDirStore({ dir, prefix:
    'nb-', idPattern: /^nb-[a-z0-9]{12}$/, parse: migrateScienceNotebook })`.
  - `create` mints the id, stamps `createdAt`/`updatedAt`, writes `version: 1`.
  - `write` answers `{ ok: false, kind: 'error', message: 'Notebook not found' }` for an id with no file —
    `create` is the only way a file appears — and stamps `updatedAt` itself (the renderer's value is ignored).
  - `remove` moves the file to the OS Trash through the injected `trashItem` (the host passes
    `ctx.trashItem`), never `unlink`: a deleted notebook is recoverable from Finder.
  - Filesystem errors become `{ ok: false, kind: 'error', message }`; nothing throws across the channel.
- [x] **B.4** Registration, `packages/modules/science/main/context.ts` (net-new).
  - `export type ShowOpenDialog = (opts: { properties: ['openFile']; filters: { name: string; extensions:
    string[] }[] }) => Promise<{ canceled: boolean; filePaths: string[] }>` (Electron's shape, so the host
    passes `(o) => dialog.showOpenDialog(win, o)` without importing it here).
  - `registerScienceOn(ctx: FeatureMainContext, services: ScienceModuleServices)` creates
    `createNotebookStore(join(services.userData, 'notebooks'))` and calls `ctx.ipc.handle(CHANNELS.science, ScienceRequestSchema, (req) => dispatch(store, req), (issue) =>
    ({ ok: false, kind: 'error', message: issue }))`.
  - `scienceModuleMain.channels` becomes `[CHANNELS.science]`.
  - Verified by `main/notebook-store.test.ts` (tmp dir): create → list shows it; write then read returns
    the new cells; a hand-written garbage file is quarantined and `quarantined === 1`; `remove` calls the
    injected `trashItem` with the file path; a `write` for an unknown id is `{ ok: false }`. And
    `main/context.test.ts` (`createRecordingContext`): an invalid payload answers `{ ok: false, kind: 'error' }`.

### C — Notebook editor: text and maths cells (M)

- [x] **C.1** Notebook list (`renderer/views/notebooks-view.tsx`, net-new).
  - Left column (280 px): **New notebook** button, a discipline filter (`All` + the five disciplines as
    chips), then rows of title + discipline chip + relative `updatedAt`. The selected row opens the
    editor on the right; with none selected the right side shows A.2's empty state (or "Select a
    notebook" once at least one exists).
  - Data through `useQuery(['science', 'list'], () => bridge()?.science?.list())`; `{ ok: false }` renders
    the message in an inline error banner with a **Retry** button; `quarantined > 0` renders a muted line
    "N notebook files could not be read and were set aside".
  - Row context menu through `useDialogs().openMenu` (the suite kit's `createDialogs` provides it): **Rename**
    (inline input, Enter commits, Escape cancels) and **Delete**, confirmed with
    `useFrameChrome().useDialogs().confirm({ title: "Move '<title>' to the Trash?", body: 'You can restore it from the Trash in Finder.', confirmLabel: 'Move to Trash', danger: true, blastRadius: { count: 1, sample: [] }, blastRadiusKind: 'trash' })` — one file, recoverable.
  - Selected notebook id persists through `createPersistedStore({ key: 'midnite-science.ui', defaults: {
    v: 1, lastNotebookId: null }, … })` (`renderer/science-ui-store.ts`, net-new); its `state(set, initial)`
    replaces an `initial` whose `v !== 1` with the defaults — `createPersistedStore` has no `migrate`, so the
    version check lives there. A stored id that no longer lists falls back to none.
- [x] **C.2** The editor (`renderer/views/notebook-editor.tsx`, net-new).
  - Title input at the top (commits on blur/Enter through `rename`), then the cell list, then an
    **Add cell** split button (Text · Compute · Plot · Molecule). Each cell has a hover toolbar: move up,
    move down, delete (no confirm — undo is out of scope, see Not in this phase; delete is one cell in an
    autosaved file).
  - State: a per-notebook zustand store `useNotebookDraft` holding the `ScienceNotebook` being edited; every
    edit marks it dirty and schedules a `write` 600 ms after the last keystroke; switching notebooks or
    unmounting flushes immediately. A `write` failure shows "Not saved — <message>" in the editor header and
    keeps the draft dirty.
- [x] **C.3** Markdown cells with LaTeX.
  - Two modes: **edit** (a `<textarea>` with monospace font, auto-height) and **rendered**
    (`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`, KaTeX CSS imported once in
    `science-pane.tsx`). Double-click rendered → edit; **Shift+Enter** in the textarea → rendered. A cell-local
    `onKeyDown`, not a `CommandId`: it is an editing key of the focused textarea (`Mod+Enter` is
    `status.commit` and stays untouched).
  - KaTeX runs with `throwOnError: false, strict: 'ignore'` so a typo renders red source, never a crash.
  - New dependencies on `packages/modules/science/package.json`: `react-markdown` (`^10.1.0`, as
    media-docs), `remark-gfm` (`^4.0.1`), `remark-math`, `rehype-katex`, `katex` (all MIT).
  - Verified by `renderer/views/notebook-editor.test.tsx`: typing in a text cell then Shift+Enter renders
    an `.katex` element for `$x^2$`; `$\frac{` (unclosed) renders without throwing; adding a compute cell
    and pressing move-up reorders the cells; 600 ms after an edit (fake timers) `science.write` is called
    once with the new cells.

### D — Compute cells in a worker (M)

- [x] **D.1** The evaluator, `renderer/compute/evaluate.ts` (net-new, pure, no DOM).
  - `export function evaluateNotebook(cells: readonly ScienceCell[]): Record<string, CellResult>` where
    `CellResult = { ok: true; text: string; tex?: string } | { ok: false; line: number; message: string }`.
  - One `math = create(all)` instance per module load (`renderer/compute/math.ts`, net-new). **Capture
    `const parse = math.parse` and `const compile = math.compile` first**, then `math.import({ import,
    createUnit, reviver, evaluate, parse, compile }, { override: true })` with each replaced by a function
    that throws `Function <name> is disabled` — the mathjs security guidance for untrusted expressions
    (a notebook can arrive as a file). The evaluator only ever calls the captured `parse`/`compile`.
    `simplify` and `derivative` stay: they are the point of a CAS-lite and reach no JavaScript.
  - New dependency on the module: `mathjs` (Apache-2.0, current major at implementation time).
  - Runs every `compute` cell top to bottom against **one fresh `Map` scope per run**; each non-blank line
    of a cell is evaluated in turn; the cell's result is the last line's value, formatted with
    `math.format(value, { precision: 10 })`, plus `tex` from `math.parse(line).toTex()` for display.
    A failing line yields `{ ok: false, line, message }` and later cells still run (they may fail on a
    missing variable, which is the honest answer).
  - Always runs from the top — no Jupyter-style stale state (Decision 5).
  - Verified by `renderer/compute/evaluate.test.ts`: `a = 3\nb = a^2` → `9`; `5 km/h to m/s` →
    `1.3888888889 m / s`; `det([1,2;3,4])` → `-2`; `sqrt(-4)` → `2i`; `derivative('x^2', 'x')` → `2 * x`;
    `import({}, {})` → `{ ok: false, message: /disabled/ }`; a later cell sees an earlier cell's variable.
- [x] **D.2** The worker, `renderer/compute/compute.worker.ts` (net-new) and `use-compute.ts`.
  - The worker answers `{ runId, cells }` with `{ runId, results, samples }` (E adds `samples`).
  - Imported with `import ComputeWorker from './compute.worker?worker&inline'` (the `file://` rule in
    `packages/app/vite.config.ts`); `apps/science/vite.config.ts` sets `worker: { format: 'es' }`.
  - `useCompute(notebook)`: posts a run 300 ms after the last edit to a compute/plot cell; a newer run
    supersedes an older one (results with a stale `runId` are dropped). If no answer arrives in
    **2000 ms**, `worker.terminate()`, a fresh worker is constructed, and every compute cell shows
    "Stopped after 2 s — simplify the expression or split the cell".
  - Cell UI: `<textarea>` source over a result row — the `tex` rendered with KaTeX and the `text` beside it
    in muted monospace; an error shows `Line N: <message>` in the danger colour. A spinner shows only if a
    run is still pending after 150 ms.
  - Verified by `renderer/compute/use-compute.test.tsx` with a fake `Worker` class injected through
    `createUseCompute(workerFactory)`: two quick edits post one run; a stale `runId` answer is ignored;
    advancing fake timers 2000 ms terminates the worker and constructs another.

### E — Plot cells (M)

- [ ] **E.1** Sampling, `renderer/plot/sample.ts` (net-new, pure).
  - `samplePlot(cell: PlotCell, scope: Map<string, unknown>, math): PlotSamples` — 512 evenly spaced `x` in
    `[x.min, x.max]` per series; each `expr` compiled once and evaluated with `{ ...scope, x }`; a
    non-finite or non-real result is `NaN`. Runs inside the worker after the compute pass, so a plot can
    use the notebook's variables (`k = 2` above → `sin(k*x)`).
  - `autoRange(ys)`: the 2nd–98th percentile of finite samples across all series, padded 5 %; a flat
    series (range 0) pads ±1.
  - Verified by `renderer/plot/sample.test.ts`: `sin(x)` on `[0, 2*pi]` has 512 samples within [-1, 1];
    `1/x` on `[-1, 1]` has a `NaN` or break at the sign change; `k*x` uses `k` from scope.
- [ ] **E.2** Drawing, `renderer/plot/plot-svg.tsx` (net-new).
  - `<PlotSvg samples width={640} height={360} />`: `viewBox="0 0 640 360"`, 48 px left / 32 px bottom
    gutters, ticks from `niceTicks(min, max, 6)` (steps 1·2·5 × 10^k), grid lines at 8 % opacity, axis
    lines at x = 0 / y = 0 when in range.
  - A path breaks (new `M`) at a `NaN` and wherever consecutive points jump more than 10× the visible
    y-range (asymptotes of `tan(x)`).
  - Colours `PLOT_COLORS = ['#06b6d4', '#f59e0b', '#a855f7', '#22c55e']` in series order; a legend under
    the plot lists `label ?? expr`.
  - Editor: one row per series (expr input + label input + remove, up to 4), x-range min/max inputs,
    y-range `Auto` toggle or min/max inputs.
  - Verified by `renderer/plot/plot-svg.test.tsx`: `niceTicks(0, 10, 6)` is `[0, 2, 4, 6, 8, 10]`; a
    `tan(x)` plot on `[-3, 3]` renders more than one `M` command; two series render two `<path>`s with
    the first two colours.

### F — Molecule viewer cells (L)

- [ ] **F.1** Parsers, `renderer/molecule/parse.ts` (net-new, pure).
  - `parseStructure(text: string, format: 'xyz' | 'pdb' | 'mol'): { ok: true; atoms: Atom[]; bonds: Bond[] }
    | { ok: false; message: string }`, `Atom = { el: string; x: number; y: number; z: number }`,
    `Bond = { a: number; b: number; order: 1 | 2 | 3 }`.
  - **XYZ:** line 1 atom count, line 2 comment, then `El x y z` per line; a count mismatch is an error.
  - **PDB:** `ATOM`/`HETATM` records by fixed columns (x 31–38, y 39–46, z 47–54, element 77–78, falling
    back to the first letters of the atom name 13–16); `CONECT` records become bonds (order 1).
  - **MOL/SDF V2000:** counts line (line 4: atoms 1–3, bonds 4–6), atom block, bond block with order; for
    an SDF only the first record (up to `$$$$`). V3000 → `{ ok: false, message: 'MOL V3000 is not supported yet' }`.
  - More than **50,000 atoms** → `{ ok: false, message: 'Over 50,000 atoms — too large to view' }`.
- [ ] **F.2** Elements and bond inference, `renderer/molecule/elements.ts` + `bonds.ts` (net-new).
  - `ELEMENTS: Record<string, { color: string; covalent: number }>` for H–Kr plus Ag, I, Pt, Au, Hg, Pb
    (Jmol CPK colours, covalent radii in Å); unknown → `#ff1493`, 1.5 Å.
  - `inferBonds(atoms)`: used when the file has no bonds (XYZ, PDB without `CONECT`); a spatial hash
    with 4 Å cells, checking the 27 neighbouring cells; bond when `0.4 Å < d < 1.2 × (rA + rB)`. O(n)
    on real structures, never O(n²).
  - Verified by `renderer/molecule/parse.test.ts` and `bonds.test.ts` with net-new fixtures under
    `renderer/molecule/__fixtures__/` (water XYZ, caffeine MOL from PubChem CID 2519 — public domain —
    a 3-residue PDB): water has 3 atoms and 2 inferred bonds; caffeine MOL has 24 atoms and 25 bonds;
    the PDB's element columns parse; a 50,001-atom synthetic XYZ fails with the size message.
- [ ] **F.3** The view, `renderer/molecule/molecule-view.tsx` (net-new).
  - R3F `<Canvas>` 100 % × 360 px, `OrbitControls` from drei, one `instancedMesh` of spheres (radius
    `0.3 × covalent`, CPK colour per instance) and one of cylinders for bonds (radius 0.12 Å, split
    half-colour at the midpoint is out of scope — single grey `#9ca3af`), camera framed on the bounding
    sphere. Above 5,000 atoms, sphere segments drop from 16 to 8.
  - Cell header: name, atom/bond counts, format; buttons **Reset view** and **Replace…**.
  - Dependencies: `three`, `@react-three/fiber`, `@react-three/drei` at media-model's ranges.
- [ ] **F.4** Import through main.
  - `importStructure` op: main opens `dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name:
    'Structures', extensions: ['xyz', 'pdb', 'mol', 'sdf'] }] })` (injected as `services.showOpenDialog`;
    `apps/science/main/host.ts` passes Electron's), `stat` first and refuses over 10 MB with `{ ok: false,
    kind: 'error', message: 'Larger than 10 MB' }`, reads UTF-8, maps `.sdf` → `mol`, returns `{ name:
    basename, format, text }`; a dismissed dialog → `{ ok: true, value: { cancelled: true } }`. The renderer
    never sees the path.
  - Verified by `main/context.test.ts`: a stubbed dialog returning an 11 MB file answers the size error; a
    cancelled dialog answers `cancelled`.

### G — Templates (S)

- [ ] **G.1** Built-in templates, `renderer/templates/index.ts` (net-new).
  - `SCIENCE_TEMPLATES: readonly { id: string; title: string; discipline: ScienceDiscipline; blurb: string;
    cells: ScienceCell[] }[]` — eight entries: **Function explorer** (maths), **Linear algebra basics**
    (maths), **Kinematics** (physics: `v = u + a t` etc. with units), **Projectile range plot** (physics),
    **Ideal gas law** (chemistry: `P V = n R T` in SI units), **Stoichiometry** (chemistry), **Caffeine**
    (chemistry: the F.2 caffeine MOL in a molecule cell), **Logistic population growth** (biology: a plot
    of `K / (1 + ((K - N0)/N0) * e^(-r x))`).
  - Each template's cells parse with `ScienceCellSchema` and every compute cell evaluates with no error —
    asserted in `renderer/templates/templates.test.ts`, which runs `evaluateNotebook` over each.
- [ ] **G.2** Templates view, `renderer/views/templates-view.tsx` (net-new).
  - A grid of cards (title, discipline chip, blurb), filtered by the same discipline chips as C.1; **Use
    template** calls `science.create({ title, discipline, cells })` with fresh cell ids and then
    `onView('notebooks')` with the new notebook selected. **New notebook** in C.1 creates a blank notebook
    with one empty text cell, titled "Untitled notebook".
  - Verified by `renderer/views/templates-view.test.tsx`: clicking **Use template** on "Kinematics" calls
    `create` with discipline `physics` and switches to the notebooks view.

### H — Launch: catalog, website, docs (S)

- [ ] **H.1** Launcher catalog.
  - [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts): delete `comingSoon: true` from the
    `science` entry in `RAW_APPS`; `MODULES.simulator.comingSoon` stays `true` until Phase 127. Update the
    `science` module's feature blurbs to what shipped: Research → "Notebooks with LaTeX, units and
    matrices", Visualization → "Function plots and 3D molecules", Templates → "Starter notebooks per discipline".
  - [`catalog.test.ts`](../../../apps/launcher/src/common/catalog.test.ts): `appById('science').comingSoon`
    is `undefined`; `module('science', 'simulator').comingSoon` stays `true`.
  - [`app.test.tsx`](../../../apps/launcher/src/renderer/app.test.tsx): the "renders coming-soon apps" case
    switches its example tile from Science to **Health** (`'More for Midnite Health'`).
- [ ] **H.2** Website. [`packages/website/src/apps/catalog.ts`](../../../packages/website/src/apps/catalog.ts)
  gains a `science` entry (accent `#06b6d4`, the tagline and the three features, no dashes as
  punctuation), and `apps/launcher/src/renderer/assets/app-logos/science.png` is copied to
  `packages/website/public/img/apps/science.png`.
- [ ] **H.3** Docs. [`docs/APPS.md`](../../../docs/APPS.md): the host table row "Science | Science, Simulator
  (both coming soon)" → "Science, Simulator (coming soon)", and a new `### App: Science (apps/science) —
  Phase 126` section under "App compositions" naming the store path, the channel, the worker rule and the
  notebook schema version.

## Files this phase touches

| File | Change |
|---|---|
| `packages/modules/science/**` | **net-new** — manifest, renderer (nav, pane, chrome, views, compute, plot, molecule, templates), main (module, context, notebook-store, bridge), tests |
| `apps/science/**` | **net-new** — the host app, copied from [`apps/mind`](../../../apps/mind) |
| [`packages/modules/_template/package.json.tmpl`](../../../packages/modules/_template/package.json.tmpl) | zod `^3.23.8` → `^4.0.0` |
| `packages/runtime/src/json-dir-store.ts` + `.test.ts` | **net-new** — the shared JSON-directory store (also used by 127 and 128) |
| [`packages/runtime/src/index.ts`](../../../packages/runtime/src/index.ts) | export the store |
| `packages/shared/src/science.ts` + `science.test.ts` | **net-new** — schemas, `migrateScienceNotebook` |
| [`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts) | `export * from './science'` |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) | `science` channel |
| [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | `ScienceBridge`, optional `science?` member |
| [`packages/shared/src/midnite-link.ts`](../../../packages/shared/src/midnite-link.ts) + test | `science` becomes linkable |
| [`packages/shared/src/domain/placement.ts`](../../../packages/shared/src/domain/placement.ts) | `'science'` in `PlacementAppIdSchema` |
| [`scripts/affected-apps.mjs`](../../../scripts/affected-apps.mjs) | `'science'` in `PLACEMENT_APPS` |
| [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs) | `'module-science'` in `NODE_PROJECTS` |
| [`scripts/release-bundles.test.mjs`](../../../scripts/release-bundles.test.mjs) | Science bundle case |
| [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) | `'science'` in `STUDIO_MODULES` |
| [`tsconfig.base.json`](../../../tsconfig.base.json) | two path aliases |
| [`apps/launcher/src/common/catalog.ts`](../../../apps/launcher/src/common/catalog.ts) + [`catalog.test.ts`](../../../apps/launcher/src/common/catalog.test.ts) | Science leaves "Coming soon" |
| [`apps/launcher/src/renderer/app.test.tsx`](../../../apps/launcher/src/renderer/app.test.tsx) | coming-soon example → Health |
| [`packages/website/src/apps/catalog.ts`](../../../packages/website/src/apps/catalog.ts), `packages/website/public/img/apps/science.png` | site entry, logo (**net-new** file) |
| [`docs/APPS.md`](../../../docs/APPS.md) | host table, Science section |
| `pnpm-lock.yaml` | new deps (katex, remark-math, rehype-katex, mathjs, three/r3f in the module) |
| [`packages/app/vite.config.ts`](../../../packages/app/vite.config.ts) | (**unchanged**, load-bearing) — the `?worker&inline` rationale D follows |
| [`apps/launcher/src/renderer/app-glyphs.ts`](../../../apps/launcher/src/renderer/app-glyphs.ts) | (**unchanged**) — `science: PiFlaskFill` already present |

## Verification

- [ ] `science.test.ts`: schema round-trip; `../x` id rejected; bad plot range rejected; 501 cells rejected; unknown version migrates to `null`.
- [ ] `json-dir-store.test.ts`: write/list/read; quarantine; `pathOf('../x')` throws; files are 0600.
- [ ] `notebook-store.test.ts`: create/list/read/write; quarantine renames a corrupt file and counts it; remove goes through `trashItem`; write to an unknown id is `{ ok: false }`.
- [ ] `context.test.ts`: invalid payload → `{ ok: false, kind: 'error' }`; 11 MB structure refused; cancelled picker → `cancelled`.
- [ ] `bridge.test.ts`: the Science bridge exposes exactly `report` and `science`.
- [ ] `host.test.ts`: `registerScienceHost` registers exactly `scienceModuleMain.channels`.
- [ ] `host-app.test.tsx`: rail shows the Science group with Notebooks and Templates; `navConfigProblems` is `[]`.
- [ ] `notebook-editor.test.tsx`: `$x^2$` renders `.katex`; unclosed LaTeX does not throw; move-up reorders; autosave fires once 600 ms after an edit.
- [ ] `evaluate.test.ts`: assignments carry across cells; units convert; `det`, complex `sqrt`, `derivative` answer; `import` is disabled.
- [ ] `use-compute.test.tsx`: debounced single run; stale run ignored; 2 s budget terminates and respawns.
- [ ] `sample.test.ts` / `plot-svg.test.tsx`: sampling bounds; asymptote breaks; scope variables; nice ticks; series colours.
- [ ] `parse.test.ts` / `bonds.test.ts`: water, caffeine and PDB fixtures; 50,001-atom refusal; V3000 refusal.
- [ ] `templates.test.ts`: every template's cells parse and evaluate without error.
- [ ] `templates-view.test.tsx`: **Use template** creates a physics notebook and switches view.
- [ ] `midnite-link.test.ts`, `catalog.test.ts`, `app.test.tsx`, `release-bundles.test.mjs`, `affected-apps.test.mjs`, `composition.test.ts` green with the new ids.
- [ ] CI `gate-node` green (it now runs `module-science`).
- [ ] **Open, for a human:** install the built bundle from the launcher; the window is frameless; a caffeine template renders and rotates; a `tan(x)` plot breaks at its asymptotes; Help ▸ Report an Issue opens.

## Not in this phase

- **Python/Jupyter kernels** — a native runtime per user is a packaging and sandboxing project of its own; mathjs covers the maths the catalog promises.
- **Agent/LLM help in notebooks and MCP tools for Science** — the suite apps have no companion host yet ([`docs/APPS.md`](../../../docs/APPS.md) § "Deferred: a pty host"); add once that lands.
- **Studio rendering the Science module** — Studio lists it in `STUDIO_MODULES` only; a Studio view would need `ViewId`s, a rail row and a desktop handler for no user gain while Science is its own app.
- **Undo/redo across cells** — a notebook-wide history is its own design; autosave + Trash covers loss.
- **Export (PDF, LaTeX, `.ipynb`)** and **sharing** — later, once the format has settled past v1.
- **MOL V3000, mmCIF, protein cartoon/ribbon rendering, surfaces** — ChimeraX-grade rendering is far past an MVP viewer.
- **Data tables / CSV import into plots** — plots are functions of x in this phase.

## Decisions / open questions

1. **Resolved — Notebooks are the MVP.** Agreed the first useful Science is a notebook (prose + maths + plots + molecules) rather than a dashboard of separate calculators, because every catalog feature (Research, Visualization, Templates) is a cell kind or a notebook shelf, and one data model carries all three.
2. **Resolved — The code lives in `packages/modules/science`, with no new feature package.** Agreed, because nothing else mounts notebooks yet; a `packages/features/science` would also have to join `STUDIO_FEATURES` and be wired into `packages/app`/`packages/desktop` for a view Studio does not show. Extract to a feature when a second host wants notebooks.
3. **Resolved — Studio lists but does not render Science.** Agreed `STUDIO_MODULES` gains `'science'` (the composition test requires it) and nothing else in Studio changes, because Money's module is listed the same way and Science's rail ids are host-local.
4. **Resolved — `science?` is optional on `MidniteStudioBridge`.** Agreed, following `suiteLink?`'s precedent, because a required member would force Studio's preload to implement a channel it never registers.
5. **Resolved — Compute always reruns from the top in a fresh scope.** Agreed over Jupyter's run-a-cell model, because mathjs evaluation is milliseconds for notebook-sized input and stale hidden state is the classic notebook bug; the 2 s worker budget bounds the worst case.
6. **Resolved — mathjs for compute, KaTeX for typesetting, hand-rolled SVG for plots.** Agreed: a hand-written expression parser is a bug farm and mathjs already has units, matrices, complex numbers and `derivative`; KaTeX is the standard fast LaTeX renderer; `lightweight-charts` (finance) is time-series only and a 2D function plot is ~150 lines of SVG with no dependency.
7. **Resolved — The `comingSoon` flip is the last theme.** Agreed, because `deriveAppState` in [`status.ts`](../../../apps/launcher/src/common/status.ts) treats an unpublished, non-coming-soon app as hosted by Studio, and Studio renders no Science view; the flip lands only once the release matrix (A.5) carries the bundle.
8. **Resolved — Notebook files live under the app's userData, not in a repo.** Agreed `<appData>/Midnite Runtime/apps/science/notebooks/`, because Science is not repo-scoped and the runtime data directory is where every suite app keeps its own state; a "save to folder" option is later scope.
9. **Resolved — Dangerous mathjs functions are disabled.** Agreed to override `import`, `createUnit`, `reviver`, `evaluate`, `parse` and `compile` in the expression namespace, because a notebook can arrive as a file from someone else, and mathjs's own security guidance names exactly these.
10. **Resolved — No new Playwright spec.** Agreed every rule worth asserting (parsers, bonds, sampling, ticks, evaluator, store) is a pure function under vitest, the WebGL render is a human check, and the e2e budget (`scripts/e2e-budget.mjs`) and the 5-job macOS cap stay where they are.
11. **Resolved — The JSON-directory store goes into the runtime now.** Agreed to build `createJsonDirStore` in `packages/runtime` in B rather than inside the module, because Simulator scenarios (127) and Health logs (128) need the same quarantine-and-atomic-write rules and the layer rule forbids one module importing another; posted to the swarm board as a cross-phase contract.
