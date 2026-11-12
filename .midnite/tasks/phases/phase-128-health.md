# Phase 128 — Health app

**Refined: x1** · 2026-11-11 · UI/UX & interaction, empty/loading/error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency & cancellation, performance & scale, testing & verification, security & privacy, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

Planned by an unattended swarm agent (agent-A) · 2026-11-11 · grounded against the tree at `c9bef6832`.

Health is a launcher tile and nothing else: `RAW_APPS` in
[`apps/launcher/src/common/catalog.ts`](../../../apps/launcher/src/common/catalog.ts) lists it with
`comingSoon: true`, `modules: []` and four features (Biometrics, Nutrition, Workout Plans, Progress), and
its vision reads *"Track your personal wellness with total privacy: log biometrics, record meals and
calories, plan progressive workout routines, and analyze long-term trends."* `SUITE_APP_IDS` already names
`health` and the logos exist, but there is no `apps/health`, no module and no entry in `MODULE_IDS`. This
phase builds the app and its one module: an optional profile and body-measurement log, a meal logger with
a calorie target, workout plans with a progressive-overload rule, a Today dashboard and trend charts — all
stored as private local files, never sent anywhere — and flips the tile to installable.

> **Builds on.**
> - **The host pattern.** [`apps/mind`](../../../apps/mind) (`main/host.ts` + `mountModuleMains`,
>   `src/host-app.tsx` with `SuiteAppShell` + `ModuleViewRouter`, `src/host-nav.ts` with `navFromModules`)
>   and [`apps/money`](../../../apps/money) (`main/identity.ts`'s `moneyUserData`, `main/preload.ts`'s
>   `unionBridgeSlices`). [Phase 126](phase-126-science.md) Theme A walks the same copy for Science; this
>   phase follows it file for file.
> - **The module skeleton.** [`packages/modules/_template/`](../../../packages/modules/_template/) (its zod
>   pin is fixed to `^4.0.0` by 126 A.1) and [`docs/APPS.md`](../../../docs/APPS.md).
> - **The shared store.** `createJsonDirStore` in `packages/runtime/src/json-dir-store.ts`, net-new in
>   [Phase 126](phase-126-science.md) B.3 (board contract): one 0600 JSON file per item, id-pattern path
>   jail, corrupt-file quarantine. 128 B depends on it.
> - **Private files.** `writePrivateFile` / `ensurePrivateDir` in
>   [`runtime/src/private-files.ts`](../../../packages/runtime/src/private-files.ts).
> - **IPC.** One zod channel with an `op` union answering `GitOpResult`
>   ([`shared/src/domain/result.ts`](../../../packages/shared/src/domain/result.ts)), as
>   `AnimationRequestSchema` in [`shared/src/media-animation.ts`](../../../packages/shared/src/media-animation.ts).
> - **Dialogs.** `useFrameChrome().useDialogs()` (`confirm`, `prompt`, `openMenu`) and `IconButton` from
>   [`frame/src/kit/frame-chrome.tsx`](../../../packages/frame/src/kit/frame-chrome.tsx); `BlastRadiusKind`
>   `'trash'`.

> **Scope guardrails.** macOS arm64 only. Every icon from `react-icons/<set>`. The renderer reaches main
> only through `window.midniteStudio`. **No network, no telemetry, no LLM**: Health data never leaves the
> machine except through the user's own explicit Export (Theme G), and never appears in a log line or an
> issue report (Decision 6). Not medical advice — every calculated number is labelled an estimate.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_Your numbers, on your Mac._ Health turns the launcher's promise into an app: log what you weigh, what you
eat and what you lift, get a calorie target and a next-session prescription worked out from your own
history, and watch the trend lines — with every byte in four kinds of private JSON file under the app's
data directory. Planned 2026-11-11; first slice is **A + B**, then **C + D**, **E**, **F**, **G**, and **H** last.

**Theme A — App and module scaffold.** ✅ PR (Phase 128 A PR) `apps/health` and `packages/modules/health` from the Science scaffold (itself the Mind host); `health` is in every id list (`MODULE_IDS`, `MODULE_HOST_IDS`, `APP_MODULES`, `MidniteAppId`, placement, `STUDIO_MODULES`, `NODE_PROJECTS`, tsconfig paths, launcher `MODULES.health` still `comingSoon`) and the release matrix and per-app changelog lists (Phase 131 added those, so `CHANGELOG_APP_IDS` and the feed titles gained `health` too). The five rail views are empty states; port 5196. The attribution test's "unlisted id" stand-in moved from `app-health` to `app-accountant`.

**Theme B — Health data store and IPC.** ✅ PR (Phase 128 B PR) `shared/src/health.ts` (schemas, `HealthRequestSchema`, `migrate*`, `healthMonthSpan`), the `health` channel and optional `HealthBridge`, `createHealthStore` on `createJsonDirStore` (one month per file, one promise chain for every mutation, corrupt single files and months quarantined), `registerHealthOn` (logs op and error code only) and the renderer hooks with an optimistic `usePutDay`. `exportAll` already writes the file (Theme G adds the UI and its test). The frame's `notify` has no `tone`, so the save-failure notice is title and body only. A also left `apps/health/main/index.ts` without the `app`/`appVersion` that Phase 131 E added to `registerSuiteMain`; fixed here.

**Theme C — Profile and biometrics.** ✅ An all-optional profile (units, sex, birth year, height, activity,
goal), a measurement log (weight, body fat, waist, resting heart rate, sleep), and pure BMI / BMR
(Mifflin–St Jeor) / TDEE / calorie-target calculations shown as estimates. Pure calc in `renderer/calc/` with worked-example tests; waist stays in cm under both unit systems; every save merges into the day read from a single-month query so a weigh-in never drops that day's meals.

**Theme D — Nutrition logger.** ✅ Meals per day by slot, a saved-foods library with servings, kcal and
macros, daily totals against the target. Editing a meal changes its own numbers (no rescale by servings); "Duplicate to today" reads today fresh from main before merging.

**Theme E — Workout plans and progressive overload.** ✅ Plans of weekday sessions and exercises, three
starter plans, session logging, and a double-progression rule that prescribes the next weight and reps. A zero increment holds the weight (aiming at the top of the range), the deload rounds down to 0.5 kg, the plan editor saves 600 ms after the last edit and flushes on leaving, and the session sheet prefills from the last three months of history.

**Theme F — Today and Progress.** ✅ A Today dashboard (calories left, macros, quick weigh-in, today's
session) and a Progress view of hand-rolled SVG charts: weight with a 7-day average and weekly rate,
calories against target, training volume and per-exercise top set, plus a weekly report card. Trend maths is pure (`calc/trends.ts`, calendar-day windows, ISO weeks by the Thursday rule); the charts are a hand-rolled `TimeChart` with a hidden data table; the range persists under `midnite-health.ui`; weekly volume bars are dated to that week's Monday.

**Theme G — Privacy: export and erase.** ✅ A "Your data" card at the foot of Biometrics names the data folder (`HEALTH_DATA_HINT`), exports everything as one JSON file through a save dialog (the `exportAll` op already existed from B), and "Erase all Health data…" behind a files blast-radius confirm that moves the folder to the Trash and invalidates every `['health']` query. `privacy.test.ts` fails on any network API, network module import or non-report/monitor feature import under the module, with a planted-string case proving the matcher fires.

**Theme H — Launch: catalog, website, docs.** ✅ `comingSoon` dropped from the Health tile and `MODULES.health`, blurbs set to what shipped, a Health entry and logo on the website, and `docs/APPS.md` gains the host row and an App: Health section. Startup had already flipped, so no coming-soon app is left in the launcher; the app test now uses `queryAllByRole` so zero Coming soon buttons passes.

## Build order

1. **A** first and alone (after [Phase 126](phase-126-science.md) A has merged, since both edit the same id
   lists — textual conflicts only).
2. **B** next, after 126 B.3 has merged (`createJsonDirStore`). C–G all read or write through it.
3. **C + D** together (D's daily target comes from C's calculations), then **E**, then **F** (it draws what
   C–E store), then **G**.
4. **H** last, after the release matrix carries the bundle (Decision 9).

## Deliverables

### A — App and module scaffold (L)

- [x] **A.1** Create `packages/modules/health/` from the template.
  - Copy [`packages/modules/_template/`](../../../packages/modules/_template/) to `packages/modules/health/`
    (net-new), drop `.tmpl`, replace `__ID__` → `health`, `__LABEL__` → `Health`. `package.json` keeps
    `"zod": "^4.0.0"` (126 A.1 fixed the template).
  - `manifest.ts`: `export const healthManifest = defineModuleManifest({ module: 'health', label: 'Health',
    glyph: 'PiHeartbeatFill', accent: '#f43f5e', features: [], views: [] })` — empty lists for the same
    reason as `scienceManifest`: the code lives in the module and the rail ids are host-local strings.
  - `moon.yml`: `id: 'module-health'`, tags `layer-module`, `app-health`, `app-studio`.
  - Verified by `packages/modules/health/manifest.test.ts`: `healthManifest.module === 'health'`,
    `MODULE_IDS` contains it, and `APP_MODULES.health` equals `['health']`.
- [x] **A.2** Shared id lists (the board's wiring contract; append, never reorder).
  - [`shared/src/modules.ts`](../../../packages/shared/src/modules.ts): insert `'health'` into `MODULE_IDS`
    directly after `'simulator'` (with the other suite modules; no test pins the order) and into
    `MODULE_HOST_IDS` after `'science'`; add `health: ['health']` to `APP_MODULES`. `studio: MODULE_IDS`
    picks it up automatically.
  - [`shared/src/midnite-link.ts`](../../../packages/shared/src/midnite-link.ts): append `'health'` to
    `MIDNITE_APP_IDS` (after 126 removed the `Exclude<…, 'science'>`, `MidniteAppId = ModuleHostId` already
    includes it); `midnite-link.test.ts`'s "names exactly the module hosts" case passes unchanged.
  - [`shared/src/domain/placement.ts`](../../../packages/shared/src/domain/placement.ts)
    `PlacementAppIdSchema` and [`scripts/affected-apps.mjs`](../../../scripts/affected-apps.mjs)
    `PLACEMENT_APPS`: append `'health'` after `'science'`.
  - [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) `STUDIO_MODULES`: append
    `'health'`. [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs)
    `NODE_PROJECTS`: append `'module-health'`. [`tsconfig.base.json`](../../../tsconfig.base.json) paths:
    `@midnite/studio-module-health/main` → `./packages/modules/health/main/index.ts`,
    `@midnite/studio-module-health/bridge` → `./packages/modules/health/main/bridge.ts`.
  - Launcher (type-checked against `ModuleId`, so it must land in the same PR):
    [`app-glyphs.ts`](../../../apps/launcher/src/renderer/app-glyphs.ts) `MODULE_GLYPHS.health =
    PiHeartbeatFill` (already imported for `APP_GLYPHS`);
    [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts) gains `MODULES.health = { id: 'health',
    name: 'Health', tagline: 'Body metrics, meals, workouts and trends', home: view('landing'), features:
    [the four features moved verbatim from the app entry], comingSoon: true }`, and the `health` app entry
    takes `modules: [MODULES.health]` and drops its own `features` (`APPS` derives them from modules).
  - [`catalog.test.ts`](../../../apps/launcher/src/common/catalog.test.ts) line 32: `appById('health').modules`
    → `.map((m) => m.id)` equals `['health']`; the `MODULE_HOST_IDS` loop (lines 25–28) now covers Health.
  - Verified by the existing `midnite-link.test.ts`, `placement.test.ts`, `affected-apps.test.mjs`,
    `composition.test.ts`, `catalog.test.ts` and `scripts/gate-projects-check.test.mjs` passing with the new ids.
- [x] **A.3** The module's renderer entry: nav group, pane, chrome.
  - `renderer/health-nav.ts` (net-new): `export const HEALTH_NAV_GROUP: NavGroup = { id: 'health', label:
    healthManifest.label, icon: PiHeartbeatFill, accent: healthManifest.accent, views: [ { id: 'today',
    label: 'Today', icon: LuLayoutDashboard }, { id: 'biometrics', label: 'Biometrics', icon: LuScale },
    { id: 'nutrition', label: 'Nutrition', icon: LuUtensils }, { id: 'workouts', label: 'Workouts', icon:
    LuDumbbell }, { id: 'progress', label: 'Progress', icon: LuTrendingUp } ] }` (`react-icons/pi`,
    `react-icons/lu`; the four rail ids after Today match the catalog feature ids).
  - `renderer/health-manifest.ts` (net-new): `HEALTH_APP = { id: 'health', name: 'Midnite Health', tagline:
    'Body metrics, meals, workouts and trends', accent: '#f43f5e', home: 'today' } as const`.
  - `renderer/compose/health-chrome.tsx` (net-new): `HEALTH_CHROME = createFrameChrome()` plus its
    `DialogHost`, as `modules/mind/renderer/compose/mind-chrome.tsx`.
  - `renderer/health-pane.tsx` (net-new): `export function HealthPane({ view, onView }: { view: string;
    onView: (view: string) => void })` with its own `QueryClientProvider` and `FrameChromeProvider
    chrome={HEALTH_CHROME}`, switching on `view` to `TodayView` / `BiometricsView` / `NutritionView` /
    `WorkoutsView` / `ProgressView`; an unknown id renders `TodayView`.
  - In A every view is an empty state: centred 48 px glyph of its rail row, a heading and one line of body
    (Today: "Nothing logged today" / "Your numbers stay on this Mac.").
  - `renderer/index.ts` exports `HEALTH_NAV_GROUP`, `HEALTH_APP`, `HealthPane`, `HEALTH_CHROME`, `healthManifest`.
  - Verified by `renderer/health-nav.test.ts`: every rail icon is a function (names resolve) and
    `navConfigProblems({ groups: [HEALTH_NAV_GROUP] })` is `[]`.
- [x] **A.4** The module's main half and bridge.
  - `main/module.ts` (net-new): `export type ShowSaveDialog = (opts: { defaultPath: string; filters: { name:
    string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath?: string }>`;
    `export type HealthModuleServices = { userData: string; showSaveDialog?: ShowSaveDialog }`;
    `export const healthModuleMain = defineFeatureMain<HealthModuleServices>({ feature: 'health', channels:
    [], register() {} })`. B.4 fills `channels: [CHANNELS.health]` and `register`.
  - `main/bridge.ts` (net-new): `export type HealthAppBridge = { report: ReportBridge }` and
    `createHealthBridge(ipc: RendererIpc): HealthAppBridge`, shaped like
    [`createMindBridge`](../../../packages/modules/mind/main/bridge.ts); B.2 adds `health: HealthBridge`.
  - `package.json` exports `"./bridge": "./main/bridge.ts"` (source, as `modules/mind/package.json`).
  - Verified by `main/bridge.test.ts`: top-level keys are exactly `['report']` after A and
    `['health', 'report']` (sorted) after B.
- [x] **A.5** `apps/health/` from `apps/mind/`.
  - Net-new, each copied from its `apps/mind` twin and renamed: `package.json` (`"name":
    "@midnite/app-health"`, `"version"` equal to `apps/money/package.json`'s — `scripts/version-check.mjs`
    keeps `apps/*` in lockstep), `moon.yml` (`id: 'app-health'`, tags `layer-app`, `app-health`, `dependsOn`
    `shared`, `frame`, `runtime`, `feature-report`, `feature-monitor`, `module-health`; `inputs` list
    `/packages/modules/health/**`), `tsconfig.json`, `vite.config.ts` (`server: { port: 5196, strictPort:
    true }` — the board's claim), `vitest.config.ts`, `tailwind.config.ts` (`frameContent(__dirname, [])` plus
    the module's `renderer/**`), `postcss.config.js`, `scripts/bundle-main.mjs`, `src/index.html`,
    `src/main.tsx`, `src/styles.css`, `src/index.ts`.
  - `main/identity.ts`: `HEALTH_NAME = 'Midnite Health'`, `HEALTH_BUNDLE_ID = 'io.bilo.midnite-health'`,
    `SMOKE_ENV = 'MIDNITE_HEALTH_SMOKE'`, `USER_DATA_ENV = 'MIDNITE_HEALTH_USER_DATA'`, `SMOKE_READY_LINE =
    'midnite-health:ready'`, `healthUserData(appData, override?)` → `join(runtimeDataDirectory(appData),
    'apps', 'health')` (copy of `moneyUserData`). No vault, no pairing.
  - `main/host.ts`: `export function registerHealthHost(el: HealthHostElectron): void` mounting
    `[{ module: healthModuleMain, services: { userData: el.userData, showSaveDialog: el.showSaveDialog } }]`
    via `mountModuleMains(createIpcContext(el), mounts)`; `HealthHostElectron = IpcContextElectron & {
    userData: string; showSaveDialog: ShowSaveDialog }` (`index.ts` passes `(o) =>
    dialog.showSaveDialog(win, o)`).
  - `main/index.ts`: Money's with `registerHealthHost`; keeps `registerSuiteMain`, `registerSuiteMonitor`,
    `createFileSink({ name: 'health.log' })`, `registerReport`, the single-instance lock, `second-instance`
    → `suite?.handleArgv(argv)`, `suiteWindowOptions(process.platform)` + `--mstudio-frameless`.
  - `main/preload.ts`: `unionBridgeSlices(createHealthBridge(ipcRenderer), createMonitorFeatureBridge(
    createBridgeSlice(ipcRenderer)), createSuiteBridge(ipcRenderer, process.argv, process.platform))`, each
    by subpath.
  - `src/host-nav.ts`: `HEALTH_HOST_NAV = navFromModules(APP_MODULES.health, { health: HEALTH_NAV_GROUP })`.
    `src/host-app.tsx`: `HealthHostApp` — Mind's with `HEALTH_PANES = { health: HealthPane }`,
    `app="health"`, `ReportIssueHost app="midnite-health"`, `createSuiteMonitorSegment({ hosted: new
    Set(['health']) })`.
  - `resources/icon.icns`: `moon run launcher:icons` writes it
    ([`app-icons.cjs`](../../../apps/launcher/scripts/app-icons.cjs), master `resources/app-logos/health.png`
    exists). Commit the binary.
  - Verified by `apps/health/main/identity.test.ts` (path, override, smoke flag), `main/host.test.ts`
    (`createRecordingContext()`: registered channels equal `healthModuleMain.channels`) and
    `src/host-app.test.tsx` (rail shows the "Health" group with its five rows).
- [x] **A.6** Release wiring.
  - [`scripts/release-bundles.test.mjs`](../../../scripts/release-bundles.test.mjs): `describe('apps/health
    (Phase 128)')` mirroring Money's (line 68) — `bundleMatrix(apps, has).include` contains `{ app: 'health',
    project: 'app-health', dir: 'apps/health' }` and `apps/health/resources/icon.icns` starts with the
    `icns` magic. `bundleMatrix` itself needs no edit (it picks up any `apps/<id>/moon.yml` outside
    `NOT_BUNDLES`).
  - `pnpm install` updates `pnpm-lock.yaml`; commit it.

### B — Health data store and IPC (M)

- [x] **B.1** Schemas in net-new `packages/shared/src/health.ts` (zod only, exported from the barrel). All
  stored quantities are metric (Decision 3).
  - Keys: `HealthDateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)` (a local
    calendar date), `HealthMonthIdSchema = z.string().regex(/^log-\d{4}-(0[1-9]|1[0-2])$/)`,
    `HealthPlanIdSchema = z.string().regex(/^plan-[a-z0-9]{12}$/)`, short ids `z.string().regex(/^[a-z]-[a-z0-9]{8}$/)`
    for meals (`m-`), foods (`f-`), plan days (`d-`), exercises (`x-`) and sessions (`w-`).
  - `HealthProfileSchema = z.object({ version: z.literal(1), units: z.enum(['metric', 'imperial']), sex:
    z.enum(['female', 'male', 'unspecified']).default('unspecified'), birthYear: z.number().int().min(1900)
    .max(2100).optional(), heightCm: z.number().min(50).max(272).optional(), activity: z.enum(['sedentary',
    'light', 'moderate', 'active', 'very-active']).default('sedentary'), goal: z.enum(['lose', 'maintain',
    'gain']).default('maintain'), kcalTargetOverride: z.number().int().min(800).max(6000).optional(),
    updatedAt: z.string().datetime() })`. Every body field optional (catalog: "Optional height, weight, age").
  - `HealthMealSchema = { id, slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']), name:
    z.string().min(1).max(120), kcal: z.number().int().min(0).max(10_000), proteinG/carbsG/fatG:
    z.number().min(0).max(1000).optional(), foodId?: food id, servings: z.number().min(0.1).max(50).default(1) }`.
  - `HealthSetSchema = { reps: z.number().int().min(0).max(100), kg: z.number().min(0).max(1000) }`;
    `HealthSessionSchema = { id, planId, planDayId, exercises: z.array(z.object({ exerciseId, name:
    z.string().max(80), sets: z.array(HealthSetSchema).max(10) })).max(20), minutes:
    z.number().int().min(0).max(600).optional() }`.
  - `HealthDaySchema = z.object({ weightKg: z.number().min(20).max(400).optional(), bodyFatPct:
    z.number().min(2).max(70).optional(), waistCm: z.number().min(30).max(250).optional(), restingHr:
    z.number().int().min(25).max(220).optional(), sleepHours: z.number().min(0).max(24).optional(), note:
    z.string().max(500).optional(), meals: z.array(HealthMealSchema).max(60).default([]), sessions:
    z.array(HealthSessionSchema).max(10).default([]) })`.
  - `HealthMonthLogSchema = z.object({ version: z.literal(1), id: HealthMonthIdSchema, updatedAt, days:
    z.record(HealthDateSchema, HealthDaySchema) }).refine(every day key starts with the id's YYYY-MM)`.
  - `HealthFoodSchema = { id, name: z.string().min(1).max(120), serving: z.string().max(40), kcal, proteinG,
    carbsG, fatG }` (macros required here, default 0); `HealthFoodLibrarySchema = { version: z.literal(1),
    updatedAt, foods: z.array(HealthFoodSchema).max(2000) }`.
  - `HealthPlanSchema = { version: z.literal(1), id, name: z.string().min(1).max(80), createdAt, updatedAt,
    days: z.array(z.object({ id, name: z.string().max(40), weekday: z.number().int().min(1).max(7)
    .optional(), exercises: z.array(HealthExerciseSchema).max(20) })).min(1).max(7) }` with
    `HealthExerciseSchema = { id, name: z.string().min(1).max(80), sets: z.number().int().min(1).max(10),
    repsMin: int 1–100, repsMax: int 1–100, startKg: z.number().min(0).max(1000), incrementKg:
    z.number().min(0).max(50).default(2.5), deloadPct: z.number().min(0).max(50).default(10) }.refine(repsMax
    >= repsMin)`. `weekday` is ISO (1 = Monday).
  - `migrateHealthProfile`, `migrateHealthMonthLog`, `migrateHealthFoods`, `migrateHealthPlan`: each
    `(raw: unknown) => T | null`, `version: 1` parses, anything else `null` (so v2 adds an arm, not a seam).
  - Verified by net-new `packages/shared/src/health.test.ts`: each schema round-trips a valid fixture; a
    profile with no body fields parses; `weightKg: 401` fails; a month log `log-2026-11` holding day key
    `2026-12-01` fails; `repsMax < repsMin` fails; `plan-../x` fails; every `migrate*({ version: 2 })` is `null`.
- [x] **B.2** Request union, channel, bridge type.
  - `HealthRequestSchema = z.discriminatedUnion('op', [ { op: 'getProfile' }, { op: 'putProfile', profile },
    { op: 'getMonths', from: YYYY-MM, to: YYYY-MM } (refined: `from <= to`, at most 36 months), { op:
    'putDay', date, day: HealthDaySchema }, { op: 'getFoods' }, { op: 'upsertFood', food }, { op:
    'removeFood', id }, { op: 'listPlans' }, { op: 'writePlan', plan }, { op: 'removePlan', id }, { op:
    'exportAll' }, { op: 'eraseAll' } ])`.
  - [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts): `health: 'mstudio:health:op'`.
  - [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts): `export type HealthBridge = {
    getProfile(): Promise<GitOpResult<{ profile: HealthProfile | null }>>; putProfile(req: { profile }):
    Promise<GitOpResult>; getMonths(req: { from; to }): Promise<GitOpResult<{ months: HealthMonthLog[];
    quarantined: number }>>; putDay(req: { date; day }): Promise<GitOpResult<{ updatedAt: string }>>;
    getFoods(): Promise<GitOpResult<{ foods: HealthFood[] }>>; upsertFood(req: { food }): Promise<GitOpResult>;
    removeFood(req: { id }): Promise<GitOpResult>; listPlans(): Promise<GitOpResult<{ plans: HealthPlan[];
    quarantined: number }>>; writePlan(req: { plan }): Promise<GitOpResult>; removePlan(req: { id }):
    Promise<GitOpResult>; exportAll(): Promise<GitOpResult<{ path: string } | { cancelled: true }>>;
    eraseAll(): Promise<GitOpResult> }` and `health?: HealthBridge` on `MidniteStudioBridge` — **optional**,
    like `suiteLink?` and 126's `science?`, because only the Health host carries it.
  - `createHealthBridge` fills `health` with one `call(CHANNELS.health, { op, … })` per method.
  - Verified by `health.test.ts`: `getMonths` with `from > to` and with a 37-month span both fail; an
    unknown `op` fails.
- [x] **B.3** The store, `packages/modules/health/main/health-store.ts` (net-new).
  - `export function createHealthStore(dataDir: string, trashItem: (path: string) => Promise<void>):
    HealthStore`, `dataDir = <userData>/data`. Layout: `profile.json`, `foods.json`, `logs/log-YYYY-MM.json`,
    `plans/plan-<12>.json`.
  - Months: `createJsonDirStore({ dir: join(dataDir, 'logs'), prefix: 'log-', idPattern:
    /^log-\d{4}-(0[1-9]|1[0-2])$/, parse: migrateHealthMonthLog })`. Plans: `createJsonDirStore({ dir:
    join(dataDir, 'plans'), prefix: 'plan-', idPattern: /^plan-[a-z0-9]{12}$/, parse: migrateHealthPlan })`.
    One file per **calendar month** (Decision 2).
  - `profile.json` and `foods.json` are single files through a module-local `readSingle(path, migrate)` /
    `writeSingle(path, value)` over `writePrivateFile`; a corrupt single file is renamed
    `<name>.json.corrupt-<epoch ms>` and read as "none" (profile `null`, foods `[]`), never deleted.
  - `getMonths(from, to)` reads each month id in the range with `months.read(id)` (a missing month is
    skipped, not an error) — at most 36 reads, so a year of trends is 12 small files.
  - `putDay(date, day)`: read `log-<YYYY-MM>` (or start `{ version: 1, id, days: {} }`), set `days[date] =
    day` — or delete the key when the day is empty (no measurements, no meals, no sessions, no note) — stamp
    `updatedAt`, write. Returns `{ updatedAt }`.
  - **Every mutation runs through one per-store promise chain** (`serialize<T>(fn: () => Promise<T>)` in the
    same file) so two quick `putDay`s on the same month cannot interleave read-modify-write and lose one
    (Decision 5).
  - `removePlan(id)` → `trashItem(plans.pathOf(id))`. `eraseAll()` → `trashItem(dataDir)` then recreates
    nothing (the next write makes the dirs with `ensurePrivateDir`).
  - Verified by net-new `main/health-store.test.ts` (tmp dir): `putDay` then `getMonths` returns it;
    `Promise.all` of two `putDay`s on different dates of one month keeps both; an emptied day removes its
    key; a corrupt `profile.json` is quarantined and `getProfile` answers `null`; a garbage `log-2026-10.json`
    is quarantined and counted; `eraseAll` calls `trashItem` with `dataDir`; files are mode `0o600`.
- [x] **B.4** IPC handlers, `packages/modules/health/main/context.ts` (net-new).
  - `export function registerHealthOn(ctx: FeatureMainContext, services: HealthModuleServices): void` —
    `ctx.ipc.handle(CHANNELS.health, …)`: `HealthRequestSchema.safeParse`; a miss answers `{ ok: false,
    kind: 'error', message: 'Invalid request' }`; dispatch by `op` to the store; any thrown error is caught
    and answered `{ ok: false, kind: 'error', message }` — never a throw across the boundary.
  - **Nothing logs a payload.** Handlers log nothing on success; on failure they log only `health:<op>
    failed: <error.code ?? error.name>` — never the message of a zod issue (it can quote a value) and never
    a field (Decision 6).
  - `exportAll`: `services.showSaveDialog?.({ defaultPath: 'midnite-health-<YYYY-MM-DD>.json', filters:
    [{ name: 'JSON', extensions: ['json'] }] })`; cancelled or no dialog → `{ ok: true, value: { cancelled:
    true } }`; else write (G.1).
  - `healthModuleMain` becomes `channels: [CHANNELS.health]`, `register(ctx, s) { registerHealthOn(ctx, s) }`.
  - Verified by net-new `main/context.test.ts` with `createRecordingContext()`: an invalid payload answers
    `{ ok: false, kind: 'error' }`; a store throw answers `{ ok: false }`; with a `console` spy, a failing
    `putDay` carrying `weightKg: 81.3` logs nothing containing `81.3`; a cancelled save dialog answers
    `cancelled: true`.
- [x] **B.5** Renderer data hooks, `renderer/data/use-health.ts` (net-new).
  - `useProfile()`, `useMonths(from, to)`, `useFoods()`, `usePlans()` — TanStack Query over
    `window.midniteStudio.health` with keys `['health', 'profile']`, `['health', 'months', from, to]`, etc.;
    a `{ ok: false }` result throws inside the query fn so the view's `isError` branch renders.
  - `usePutDay()` mutation: optimistic — patch every cached `months` query containing that month, roll back
    on `{ ok: false }` and show `useDialogs().notify({ tone: 'error', title: "Couldn't save", body: 'Your
    last change was not saved. Try again.' })`.
  - `localDateKey(d: Date): string` in `renderer/data/dates.ts` (net-new) from `getFullYear/getMonth/getDate`
    — never `toISOString()`, which is UTC and files a 23:30 dinner in Johannesburg under tomorrow.
  - A missing bridge (`window.midniteStudio.health` undefined — Studio) renders "Health runs in its own app."
    instead of crashing.
  - Verified by `renderer/data/use-health.test.tsx` (mock bridge): an optimistic `putDay` shows immediately
    and rolls back on `{ ok: false }`; and `dates.test.ts`: `localDateKey(new Date(2026, 10, 11, 23, 30))`
    is `'2026-11-11'` under `TZ=Africa/Johannesburg`.

### C — Profile and biometrics (M)

- [x] **C.1** Pure calculations, `renderer/calc/body.ts` (net-new).
  - `bmi(weightKg, heightCm): number` = kg / m², and `bmiBand(bmi): 'under' | 'healthy' | 'over' | 'obese'`
    at the WHO cut-offs 18.5 / 25 / 30.
  - `bmrMifflin({ weightKg, heightCm, age, sex }): number` = `10·kg + 6.25·cm − 5·age + s`, `s` = +5 male,
    −161 female, −78 unspecified (their midpoint, Decision 4).
  - `ACTIVITY_FACTOR = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, 'very-active': 1.9 }`;
    `tdee(bmr, activity)`.
  - `kcalTarget(profile, latestWeightKg, year): { kcal: number; source: 'override' | 'estimate'; floored:
    boolean } | { missing: ('weight' | 'height' | 'birthYear')[] }` — override wins; else `tdee` + `{ lose:
    −500, maintain: 0, gain: +300 }`, rounded to 10, floored at 1200 (`floored: true`).
  - `ageFrom(birthYear, year) = year − birthYear` (year precision on purpose, Decision 4).
  - Unit display, `renderer/calc/units.ts`: `kgToLb` (×2.20462), `lbToKg`, `cmToFtIn` → `{ ft, in }` with
    inches rounded to 0.5, `ftInToCm`; `formatWeight(kg, units)` → `'81.3 kg'` / `'179.2 lb'` (one decimal).
  - Verified by net-new `renderer/calc/body.test.ts`: `bmi(80, 180)` ≈ 24.69; `bmiBand(25)` is `'over'`;
    `bmrMifflin({ 80, 180, 30, male })` = 1780; female = 1614; `kcalTarget` with no height answers
    `{ missing: ['height'] }`; a `lose` target below 1200 is `1200` with `floored: true`; and
    `units.test.ts`: `lbToKg(kgToLb(81.3))` within 1e-9; `cmToFtIn(180)` = `{ ft: 5, in: 11 }`.
- [x] **C.2** Profile form in `BiometricsView` (`renderer/views/biometrics-view.tsx`, net-new).
  - A card "Profile — all optional": Units (segmented Metric / Imperial), Sex (Female / Male / Prefer not to
    say), Birth year (number), Height (cm, or ft + in when imperial), Activity (select with one-line
    descriptions), Goal (Lose / Maintain / Gain), "Set my own calorie target" (toggle + number).
  - Saves on blur through `putProfile` (no Save button); a field outside its schema range shows the range
    under it ("Between 50 and 272 cm") and is not sent.
  - Under the form, the derived block: BMI with band, BMR, TDEE, daily target — or, when inputs are missing,
    "Add your height to estimate a target." Each number carries "estimate" and the card ends with
    "Not medical advice. Talk to a clinician before big changes." (also on Today, F.1).
  - Verified by `biometrics-view.test.tsx` (mock bridge): switching to Imperial re-renders 180 cm as `5 ft 11
    in` without a write; entering height `300` shows the range hint and sends no `putProfile`; with weight,
    height and birth year set the target renders.
- [x] **C.3** Measurement log in `BiometricsView`.
  - A date row (defaults to today, `‹ ›` `IconButton`s with `label="Previous day"`/`"Next day"`, no future
    dates) and fields Weight, Body fat %, Waist, Resting heart rate, Sleep (hours), Note; each saves on blur
    via `usePutDay`, merging into that day's existing meals and sessions.
  - Below it, the last 30 days that have any measurement, newest first, as a table (date, weight, body fat,
    waist, RHR, sleep); clicking a row selects that date.
  - Empty state: "No measurements yet. Weigh in to start your trend."
  - Verified by `biometrics-view.test.tsx`: entering weight `81.3` on 2026-11-11 calls `putDay` with that
    day's existing meals intact; the future-day button is disabled on today.

### D — Nutrition logger (M)

- [x] **D.1** Meal log in `NutritionView` (`renderer/views/nutrition-view.tsx`, net-new).
  - Same date row as C.3. Four sections (Breakfast, Lunch, Dinner, Snacks), each listing its meals (name,
    servings, kcal, P/C/F grams) with a section total, an **Add** button and a per-row `openMenu` (Edit,
    Duplicate to today, Delete). Delete needs no confirm (one meal, undo by re-adding) — this is the one
    destructive op below the blast-radius bar, recorded in Decision 8.
  - **Add** opens a `Modal` with a search box over saved foods (case-insensitive substring, top 8) plus
    "Custom entry" (name, kcal, optional macros); choosing a food asks for servings (default 1) and stores
    `kcal`/macros multiplied by servings and rounded (kcal to 1, grams to 0.1), plus `foodId`.
  - The day total bar: `eaten / target kcal` with "N kcal left" or "N kcal over", and P/C/F grams; no
    target → total only and "Set up your profile for a target" linking to Biometrics (`onView('biometrics')`).
  - Verified by `nutrition-view.test.tsx` (mock bridge): adding 2 servings of a 250 kcal food stores
    `kcal: 500`; the total shows `500 / 2200 kcal`; Delete removes the row through `putDay`.
- [x] **D.2** Saved foods.
  - A "Foods" tab in `NutritionView` listing the library (name, serving, kcal, P/C/F) with **New food**, Edit
    and Delete (Delete through `useDialogs().confirm({ title: "Delete '<name>'?", body: 'Meals already
    logged keep their numbers.', confirmLabel: 'Delete', danger: true })` — logged meals copy their numbers,
    so nothing else changes).
  - A custom entry in D.1 offers "Save to my foods" (checkbox), which `upsertFood`s it with servings 1.
  - The library ships empty (Decision 7).
  - Verified by `nutrition-view.test.tsx`: "Save to my foods" calls `upsertFood` once; deleting a food leaves
    an already-logged meal's kcal unchanged.

### E — Workout plans and progressive overload (L)

- [x] **E.1** The overload rule, `renderer/calc/overload.ts` (net-new).
  - `export function nextPrescription(ex: HealthExercise, history: { date: string; sets: HealthSet[] }[]):
    { kg: number; repsTarget: number; reason: 'start' | 'hold' | 'increase' | 'deload' }`, `history` oldest
    first, already filtered to this exercise id.
  - **Double progression** (Decision 1): no history → `startKg`, `repsMin`, `'start'`. Take the last
    session's working weight (the most common `kg` across its sets). If every one of `ex.sets` sets reached
    `repsMax` at that weight → `kg + incrementKg`, `repsMin`, `'increase'`. If the last **two** sessions at
    that weight each had a set below `repsMin` → `kg × (1 − deloadPct/100)` rounded down to the nearest 0.5
    kg (never below 0), `repsMin`, `'deload'`. Otherwise same `kg`, `repsTarget = min(repsMax, best reps of
    the weakest set + 1)`, `'hold'`.
  - A session with fewer logged sets than `ex.sets` never triggers `'increase'`.
  - Verified by net-new `renderer/calc/overload.test.ts`: empty history → start; 3×12 at 60 with range 8–12
    → 62.5 increase; two sessions with a 6 at 60 → 54 deload (60 × 0.9); one bad session → hold; 2 of 3
    sets logged at 12 → hold; `incrementKg: 0` never increases weight.
- [x] **E.2** Plans list and editor in `WorkoutsView` (`renderer/views/workouts-view.tsx`, net-new).
  - The list: plan cards (name, days per week, exercises) with **New plan**, a per-card `openMenu` (Rename
    via `prompt`, Duplicate, Delete) and "Starter plans" below.
  - Delete: `useDialogs().confirm({ title: "Move '<name>' to the Trash?", body: 'Logged sessions stay in
    your history. You can restore the plan from the Trash in Finder.', confirmLabel: 'Move to Trash', danger:
    true, blastRadius: { count: 1, sample: [] }, blastRadiusKind: 'trash' })` → `removePlan`.
  - The editor: days (name + optional weekday select Mon–Sun, at most 7, no two on one weekday), each with
    exercises (name, sets, rep range, start weight, increment, deload %) — add, reorder (move up/down
    `IconButton`s), delete; debounced 600 ms `writePlan`.
  - Starter plans in `renderer/workouts/starters.ts` (net-new): "Full body, 3 days" (Mon/Wed/Fri: squat,
    bench press, barbell row), "Upper/lower, 4 days", "Push/pull/legs, 6 days"; all `startKg: 20` (an empty
    barbell), rep range 8–12, 3 sets. **Use** copies one with fresh ids.
  - Verified by `workouts-view.test.tsx` (mock bridge): **Use** on "Full body, 3 days" calls `writePlan` with
    3 days on weekdays 1/3/5; choosing a weekday already used shows "Already on Monday" and is not saved;
    and `starters.test.ts`: every starter parses with `HealthPlanSchema`.
- [x] **E.3** Logging a session.
  - "Log session" on a plan day (and on Today, F.1) opens a session sheet: per exercise, the prescription
    line from `nextPrescription` ("3 × 8–12 @ 62.5 kg · up from 60") and one row per set prefilled with
    `{ reps: repsTarget, kg }`, editable, plus "Add set" and Minutes.
  - History for the rule comes from `useMonths` over the last 3 months, flattening `sessions[].exercises`
    by `exerciseId`.
  - **Save** appends a `HealthSession` to the chosen date's `sessions` via `usePutDay`; closing with edits
    asks `confirm({ title: 'Discard this session?', confirmLabel: 'Discard', danger: true })`.
  - Weights display in the profile's units and are stored in kg (imperial input converted with `lbToKg`,
    rounded to 0.01).
  - Verified by `session-sheet.test.tsx`: with a prior 3×12 at 60 the first set prefills 62.5 and the line
    reads "up from 60"; Save calls `putDay` with one session; an imperial `135` lb input stores `61.24` kg.

### F — Today and Progress (L)

- [x] **F.1** `TodayView` (`renderer/views/today-view.tsx`, net-new).
  - Calories card: a ring (SVG, `stroke-dasharray`) of eaten / target with "N kcal left", and P/C/F grams;
    **Log a meal** opens D.1's Add modal for today.
  - Weigh-in card: today's weight or a single input "Weight" + **Save**; shows the 7-day average and its
    change from a week ago once there are ≥ 3 weights in the window.
  - Training card: the plan day whose `weekday` is today's ISO weekday across all plans (first match), with
    each exercise's prescription and **Log session**; none → "Rest day" and a link to Workouts.
  - The "Not medical advice" footer.
  - First run (no profile, no logs): one card "Start with whatever you like" with three buttons — Add a
    weigh-in, Log a meal, Pick a starter plan.
  - Loading: skeleton cards; error: "Couldn't read your Health data." + Retry (re-runs the queries); a
    `quarantined > 0` answer shows a one-line notice "N damaged files were set aside in your Health data
    folder." on Today only.
  - Verified by `today-view.test.tsx` (mock bridge, clock at Wed 2026-11-11): a Mon/Wed/Fri plan shows the
    Wednesday day; 1700 eaten of 2200 reads "500 kcal left"; an empty bridge shows the first-run card;
    `quarantined: 2` shows the notice.
- [x] **F.2** Trend maths, `renderer/calc/trends.ts` (net-new).
  - `movingAverage(points: { date: string; value: number }[], days = 7): { date; value }[]` — trailing
    window of **calendar** days ending at each point (missing days do not stretch it), emitted only where
    the window holds ≥ 3 points.
  - `weeklyRate(points, days = 28): number | null` — least-squares slope over the last `days` calendar days,
    × 7, in kg/week; `null` under 4 points.
  - `isoWeekKey(date): string` (`'2026-W46'`, Monday-start) and `weeklySummary(months, weekKey): { avgKcal:
    number | null; daysLogged: number; sessions: number; volumeKg: number; weightChangeKg: number | null }`
    where volume is Σ reps × kg.
  - Verified by net-new `renderer/calc/trends.test.ts`: a 7-day average skips a gap correctly; a linear
    −0.1 kg/day series gives `weeklyRate` −0.7; `isoWeekKey('2026-11-11')` is `'2026-W46'` and
    `'2027-01-01'` is `'2026-W53'`; volume of 3×10 at 60 is 1800.
- [x] **F.3** Chart primitives, `renderer/charts/` (net-new; written here, not shared with Science's plot,
  because a module may not import a module — Decision 10).
  - `TimeChart({ series: { id; label; points: { date; value }[]; kind: 'line' | 'dots' | 'bars'; tone:
    'accent' | 'muted' | 'good' | 'bad' }[]; refLine?: { value; label }; yUnit: string; range: { from;
    to } })` — one SVG with a `viewBox`, `preserveAspectRatio="none"` on the plot group only, nice-number y
    ticks (1/2/5 × 10ⁿ, 4–6 ticks), x ticks per week or per month by span, colours from CSS variables
    (`--accent` = `#f43f5e`), and a visually hidden `<table>` of the same data for screen readers.
  - Hover: a vertical rule + tooltip with the date and each series' value at the nearest date.
  - Verified by `charts/time-chart.test.tsx`: ticks for 61.2–83.9 are 60, 65, 70, 75, 80, 85; a bars
    series renders one `rect` per point; the hidden table has one row per date.
- [x] **F.4** `ProgressView` (`renderer/views/progress-view.tsx`, net-new).
  - Range tabs 30 days / 90 days / 1 year (persisted in `createPersistedStore('midnite-health.ui', {
    defaults: { v: 1, range: '90d' } })`, a `v` mismatch reads as defaults — the board's rule).
  - Charts: Weight (dots + 7-day average line, header "−0.4 kg/week"); Calories (bars + target ref line);
    Training volume (weekly bars); Top set (per-exercise line, exercise picker of every exercise logged in
    range).
  - Weekly report card above the charts for the current and previous ISO week from `weeklySummary`:
    "Avg 2,105 kcal · 6 days logged · 3 sessions · 14,200 kg moved · weight −0.3 kg".
  - Each chart with no data shows its own "Nothing to plot yet" line, never an empty axis.
  - The 1-year range requests 13 months — within B.2's 36-month cap.
  - Verified by `progress-view.test.tsx` (mock bridge): switching to 1 year calls `getMonths` with a 13-month
    span; the weight header reads the `weeklyRate` result; an empty range shows four "Nothing to plot yet".

### G — Privacy: export and erase (S)

- [x] **G.1** Export all data.
  - `exportAll` (B.4) writes `{ format: 'midnite-health-export', version: 1, exportedAt, profile, foods,
    plans, months }` — every month file, every plan — with `writePrivateFile` (0600) to the chosen path.
  - A "Your data" card at the bottom of `BiometricsView`: "Everything Health stores is on this Mac, in
    ~/Library/Application Support/Midnite Runtime/apps/health/data." with **Export…** and **Erase all Health
    data…**. The path is `HEALTH_DATA_HINT`, a constant in `health-manifest.ts`, because the bridge exposes
    no filesystem paths to the renderer.
  - Verified by `context.test.ts`: `exportAll` with a stub dialog returning `/tmp/x.json` writes a file whose
    JSON has `format: 'midnite-health-export'` and the fixture's month; mode `0o600`.
- [x] **G.2** Erase all data.
  - **Erase all Health data…** → `useDialogs().confirm({ title: 'Erase all Health data?', body: 'Your
    profile, every log, every food and every plan move to the Trash. You can restore the folder from the
    Trash in Finder.', confirmLabel: 'Move to Trash', danger: true, blastRadius: { count: <months + plans +
    2>, sample: ['profile.json', 'foods.json', …first months] }, blastRadiusKind: 'files' })` → `eraseAll`,
    then `queryClient.invalidateQueries({ queryKey: ['health'] })` so every view reads empty.
  - Verified by `biometrics-view.test.tsx`: confirming calls `eraseAll` once and Today then shows the
    first-run card; cancelling calls nothing.
- [x] **G.3** The no-network guard, `packages/modules/health/privacy.test.ts` (net-new).
  - Reads every `.ts`/`.tsx` under `packages/modules/health/` (excluding tests) and fails on any of:
    `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, an import of `node:http`,
    `node:https`, `node:net`, `node:dgram`, `undici`, `electron` (`net`), or `@midnite/studio-feature-*`
    other than `report`/`monitor`. Message: "Health data never leaves the machine — see Phase 128 Decision 6."
  - Verified by the test itself, plus a planted-`fetch(` fixture string case asserting the matcher fires.

### H — Launch: catalog, website, docs (S)

- [x] **H.1** Launcher catalog.
  - [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts): delete `comingSoon: true` from the
    `health` app entry and from `MODULES.health`; update the blurbs to what shipped: Biometrics → "Optional
    profile, weight and body measurements", Nutrition → "Meal log, saved foods and a calorie target",
    Workout Plans → "Weekly plans with automatic progressive overload", Progress → "Trend charts and a
    weekly report".
  - [`catalog.test.ts`](../../../apps/launcher/src/common/catalog.test.ts): `appById('health').comingSoon`
    is `undefined`.
  - [`app.test.tsx`](../../../apps/launcher/src/renderer/app.test.tsx): the "renders coming-soon apps" case
    (moved to the Health tile by 126 H.1) moves to **Startup** (`'More for Midnite Startup'`); if Phase 130
    has already flipped Startup, replace the tile lookup with a catalog fixture that marks one app
    `comingSoon` (agreed with agent-B on the board).
- [x] **H.2** Website. [`packages/website/src/apps/catalog.ts`](../../../packages/website/src/apps/catalog.ts)
  gains a `health` entry (accent `#f43f5e`, the tagline and four features, no dashes as punctuation), and
  `apps/launcher/src/renderer/assets/app-logos/health.png` is copied to
  `packages/website/public/img/apps/health.png` (net-new).
- [x] **H.3** Docs. [`docs/APPS.md`](../../../docs/APPS.md): the host table gains "Health | Health", and a
  `### App: Health (apps/health) — Phase 128` section naming the data layout, the channel, the
  month-per-file rule, the no-network guard and the not-medical-advice rule.

## Files this phase touches

| File | Change |
|---|---|
| `packages/modules/health/**` | **net-new** — manifest, renderer (nav, pane, chrome, views, calc, charts, data hooks, starters), main (module, context, health-store, bridge), tests, `privacy.test.ts` |
| `apps/health/**` | **net-new** — the host app, copied from [`apps/mind`](../../../apps/mind) |
| `packages/shared/src/health.ts` + `health.test.ts` | **net-new** — schemas, request union, `migrate*` |
| [`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts) | `export * from './health'` |
| [`packages/shared/src/modules.ts`](../../../packages/shared/src/modules.ts) | `health` in `MODULE_IDS`, `MODULE_HOST_IDS`, `APP_MODULES` |
| [`packages/shared/src/midnite-link.ts`](../../../packages/shared/src/midnite-link.ts) | `'health'` in `MIDNITE_APP_IDS` |
| [`packages/shared/src/domain/placement.ts`](../../../packages/shared/src/domain/placement.ts) | `'health'` in `PlacementAppIdSchema` |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) | `health` channel |
| [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | `HealthBridge`, optional `health?` member |
| [`scripts/affected-apps.mjs`](../../../scripts/affected-apps.mjs) | `'health'` in `PLACEMENT_APPS` |
| [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs) | `'module-health'` in `NODE_PROJECTS` |
| [`scripts/release-bundles.test.mjs`](../../../scripts/release-bundles.test.mjs) | Health bundle case |
| [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) | `'health'` in `STUDIO_MODULES` |
| [`tsconfig.base.json`](../../../tsconfig.base.json) | two path aliases |
| [`apps/launcher/src/common/catalog.ts`](../../../apps/launcher/src/common/catalog.ts) + [`catalog.test.ts`](../../../apps/launcher/src/common/catalog.test.ts) | `MODULES.health`; Health leaves "Coming soon" |
| [`apps/launcher/src/renderer/app-glyphs.ts`](../../../apps/launcher/src/renderer/app-glyphs.ts) | `MODULE_GLYPHS.health` |
| [`apps/launcher/src/renderer/app.test.tsx`](../../../apps/launcher/src/renderer/app.test.tsx) | coming-soon example → Startup (or a fixture) |
| [`packages/website/src/apps/catalog.ts`](../../../packages/website/src/apps/catalog.ts), `packages/website/public/img/apps/health.png` | site entry, logo (**net-new** file) |
| [`docs/APPS.md`](../../../docs/APPS.md) | host table, Health section |
| `pnpm-lock.yaml` | the new workspace packages (no new third-party dependency) |
| `packages/runtime/src/json-dir-store.ts` | (**unchanged here**, load-bearing) — built by [Phase 126](phase-126-science.md) B.3 |

## Verification

- [ ] `health.test.ts`: every schema round-trips; empty profile parses; out-of-range weight, cross-month day key, bad rep range, bad plan id, oversized `getMonths` span and unknown `op` fail; `migrate*` of v2 is `null`.
- [ ] `health-store.test.ts`: `putDay`/`getMonths`; concurrent `putDay`s on one month both survive; empty day removed; corrupt single file and corrupt month quarantined; `eraseAll` trashes `dataDir`; files 0600.
- [ ] `context.test.ts`: invalid payload and store throw answer `{ ok: false }`; no logged string contains a payload value; cancelled export answers `cancelled`; export file has the format tag and is 0600.
- [ ] `bridge.test.ts`: the Health bridge exposes exactly `health` and `report`.
- [ ] `host.test.ts` / `host-app.test.tsx` / `identity.test.ts`: channels, five-row rail, userData path.
- [ ] `body.test.ts` / `units.test.ts`: BMI, band, Mifflin–St Jeor (male, female), target floor and missing inputs; unit round-trips.
- [ ] `overload.test.ts`: start, increase, hold, deload, partial session, zero increment.
- [ ] `trends.test.ts`: moving average across a gap, weekly rate, ISO week keys at the year boundary, volume.
- [ ] `time-chart.test.tsx`: nice ticks, bar count, hidden data table.
- [ ] View tests: `biometrics-view`, `nutrition-view`, `workouts-view`, `session-sheet`, `today-view`, `progress-view`, `use-health`, `dates` — as named in each item.
- [ ] `privacy.test.ts`: no network API or forbidden import under `packages/modules/health/`.
- [ ] `midnite-link.test.ts`, `catalog.test.ts`, `app.test.tsx`, `release-bundles.test.mjs`, `affected-apps.test.mjs`, `composition.test.ts` green with the new ids.
- [ ] CI `gate-node` green (it now runs `module-health`).
- [ ] **Open, for a human:** install the built bundle from the launcher; the window is frameless; log a weigh-in, a meal and a starter-plan session; Progress draws them; Export writes a readable JSON; Erase moves the folder to the Trash; Help ▸ Report an Issue's preview shows no health numbers.

## Not in this phase

- **Apple Health / HealthKit, Strava, wearables and Apple Health export import** — each is an integration with its own permission model; the app must be useful on typed-in data first.
- **A food database (Open Food Facts, USDA) or barcode scanning** — a download or a network lookup breaks the no-network rule (Decision 6); a curated offline dataset can be a later phase.
- **Encryption at rest beyond FileVault and 0600** — Decision 6; tracked for `outstanding.md`.
- **Cloud or cross-device sync** — no account, no server.
- **Cardio and distance tracking (runs, rides, GPS)** — the catalog's Strava comparison is aspirational; plans here are strength sessions with an optional minutes field.
- **Studio rendering Health** — listed in `STUDIO_MODULES` only, as Science and Money.
- **Agent/LLM coaching and MCP tools** — health data to a model is a privacy decision of its own, not a drive-by.
- **Reminders and notifications** — no background scheduler in suite apps yet.
- **CSV import/export** — the JSON export covers portability; CSV can follow once the shape has settled.

## Decisions / open questions

1. **Resolved — Double progression is the overload rule.** Agreed: weight goes up by the exercise's increment once every set reaches the top of the rep range, holds otherwise, and deloads 10 % after two sessions with a set under the range floor, because it is the rule most beginner and intermediate programmes use, needs only reps and weight, and is predictable enough to show its reason ("up from 60") on every prescription.
2. **Resolved — One file per calendar month.** Agreed over one file per day or one file for everything, because a year of trends is 12 small reads instead of 365, a write rewrites at most 31 days (well under 1 MB at the schema caps), and a corrupt file costs one month, quarantined, not the whole history.
3. **Resolved — Store metric, display per profile.** Agreed every quantity is kg/cm on disk and converted only in the view, because mixed-unit history makes every trend and the overload rule unit-aware for no gain, and switching units must never rewrite data.
4. **Resolved — Age by birth year; sex optional with a midpoint.** Agreed to store a birth year rather than a birth date, because year precision moves Mifflin–St Jeor by at most 5 kcal and a full date is more personal data than the estimate needs; "Prefer not to say" uses the midpoint constant (−78) and the result is labelled an estimate like every other.
5. **Resolved — Main serialises writes per store.** Agreed a promise chain in `health-store.ts` rather than renderer-side locking, because main is the only writer and a read-modify-write of a month file is exactly the lost-update shape; the renderer stays optimistic and rolls back on `{ ok: false }`.
6. **Resolved — Privacy is local files, 0600, no network, no payload in logs; no app-level encryption yet.** Agreed: the module makes no network call (G.3 guards it), files are 0600 in a 0700 directory, handlers log op names and error codes only so a crash log or Report an Issue attachment carries no health value, and the user can export and erase everything. App-level encryption is deferred because the runtime vault binds Electron `safeStorage` through the host, a keychain-bound key turns a lost keychain item into total data loss, and FileVault already encrypts the disk on a default Apple-silicon setup; record it in `outstanding.md` when this phase lands.
7. **Resolved — The food library ships empty.** Agreed, because any bundled nutrition table is a licensing and accuracy question this phase should not answer; saved foods grow from the user's own custom entries.
8. **Resolved — Single-meal delete has no confirm; plan delete and erase do.** Agreed: a meal is one line the user just typed and re-adding it is cheaper than a dialog on every tidy-up, while a plan (Trash) and Erase all (Trash, blast radius in files) follow the repo's destructive-op rule.
9. **Resolved — The `comingSoon` flip is the last theme.** Agreed, for the same reason as Phase 126 Decision 7: `deriveAppState` in [`status.ts`](../../../apps/launcher/src/common/status.ts) treats an unpublished, non-coming-soon app as hosted by Studio, and Studio renders no Health view.
10. **Resolved — Charts are hand-rolled SVG inside the module.** Agreed over `lightweight-charts` (a finance dependency, canvas-drawn so jsdom cannot assert on it) and over reusing Science's plot (a module may not import a module), because four time-series charts with nice ticks are a small component whose every rule is testable under vitest.
11. **Resolved — Calorie target floor at 1200 kcal.** Agreed the estimate never proposes less than 1200 kcal/day and says so when it clamps, because a calculator that suggests a crash diet is the one harmful output this app could produce; a user who sets their own target (800–6000) is taken at their word.
12. **Resolved — No new Playwright spec.** Agreed every rule (schemas, store, calculations, overload, trends, ticks) is a pure function or a jsdom view test, so the e2e budget and the 5-job macOS cap stay unchanged; port 5297 stays unclaimed.
