# Phase 130 — Startup app

**Refined: x1** · 2026-11-11 · UI/UX, empty/loading/error states, functionality & edge cases, data model & IPC contract, persistence & migration, testing & verification, security & blast radius, sequencing, file-map precision, per-item acceptance criteria, out-of-scope tightening

Planned 2026-11-11 by an unattended swarm agent (agent-B) · grounded against the tree as of `c9bef6832`.

A new installable suite app, **Midnite Startup**: a roadmap of milestones, a costs-and-runway model, and a
lightweight ERP (customers and invoices, vendors and contracts). The launcher lists it today as a
`comingSoon` tile with no modules ([`catalog.ts`](../../../apps/launcher/src/common/catalog.ts), id
`startup`, accent `#8b5cf6`, "Like Linear, Carta and NetSuite"), `SUITE_APP_IDS` and the launcher's
`APP_IDS` already name it, and the launcher already has its glyph (`startup: PiBuildingsFill` in
[`app-glyphs.ts`](../../../apps/launcher/src/renderer/app-glyphs.ts)). There is no `apps/startup` and no
`startup` module. This phase builds both, and makes the tile real.

> **Builds on.**
> - **How an app is wired** — Money is the nearest: [`apps/money`](../../../apps/money/moon.yml) (main, preload, identity,
>   pairing, report, bundle script, icon) over [`packages/modules/money`](../../../packages/modules/money/manifest.ts).
>   Mind is the nearest *two-module* host ([`apps/mind/main/host.ts`](../../../apps/mind/main/host.ts),
>   [`src/host-nav.ts`](../../../apps/mind/src/host-nav.ts), [`src/host-app.tsx`](../../../apps/mind/src/host-app.tsx)).
>   Layers and the new-app guide: [`docs/APPS.md`](../../../docs/APPS.md) § Building a new app on the kit, § Adding a module to a host.
> - **The new-app id lists**, as agreed on the swarm board with Phases 126 (Science) and 128 (Health): every app is a
>   module host even with one module; append (never reorder) `MODULE_IDS`, `MODULE_HOST_IDS`, `APP_MODULES`
>   ([`modules.ts`](../../../packages/shared/src/modules.ts)), `MIDNITE_APP_IDS` ([`midnite-link.ts`](../../../packages/shared/src/midnite-link.ts)),
>   `PlacementAppIdSchema` ([`placement.ts`](../../../packages/shared/src/domain/placement.ts)), `PLACEMENT_APPS`
>   ([`affected-apps.mjs`](../../../scripts/affected-apps.mjs)), `STUDIO_MODULES` ([`composition.ts`](../../../apps/studio/src/composition.ts)),
>   `NODE_PROJECTS` ([`gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs)) and `tsconfig.base.json` paths.
>   Vite dev port **5198**.
> - **Release** — [`release-bundles.mjs`](../../../scripts/release-bundles.mjs) builds every `apps/<id>` with a `moon.yml`
>   (bar `studio`, `launcher`), so the bundle is discovered, not registered; `resources/icon.icns` comes from
>   `moon run launcher:icons`. The launcher's `identityForApp` ([`production.ts`](../../../apps/launcher/src/main/bundles/production.ts))
>   already resolves any `APP_IDS` entry.
> - **Phase 129 (Accountant)** owns the ledger: [`phase-129-accountant.md`](phase-129-accountant.md). Its
>   `shared/src/money-amount.ts` (integer minor units + ISO-4217) is the only money type this phase uses; its
>   `LedgerService` is what Startup's invoices post into; its `accountant` module becomes Startup's "Books" group in
>   Theme F. Startup never re-implements a ledger.

> **Scope guardrails.** Local-first, one company per install, one currency (the company's). No sync, no
> multi-user, no payment collection, no e-invoicing networks, no cap table. The ERP is invoices,
> customers, vendors and contracts, and nothing that needs a bank or a tax authority on the other end.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_The company on one screen: what is next, how long the money lasts, who owes what._ An early-stage team keeps a
roadmap in one tool, a runway spreadsheet in another and invoices in a third, and none of them knows about the
others. Startup keeps the three together, local-first: milestones with dependencies, a month-by-month runway
model whose opening cash and actual burn can come from the books, and invoices that post their own journal
entries into the Accountant ledger. Planned 2026-11-11; build order **A → B**, then **C, D, E** in parallel,
then **F** (after Phase 129 B + C), then **G**.

**Theme A — App scaffold and wiring.** ✅ [PR #1137](https://github.com/bilo-io/midnite-studio/pull/1137). `apps/startup` cloned from the Mind host shape, a `startup` module (manifest, main half with no channel yet, report-only bridge, five-view nav, placeholder panes), every id list appended, Studio's module list, the release case and the icon. The launcher tile now carries `MODULES.startup` (still `comingSoon`) because the catalog test requires each module host's tile to list its `APP_MODULES`; that moved part of Theme G's flip forward. Phase 129's money type is not on main, so Theme B keeps amounts as local integer minor units.

**Theme B — Workspace store and the startup contract.** ✅ PR pending. `shared/src/startup.ts` (every record schema, the `op` union, `StartupResult`, a pure `milestoneCycle` that Theme C reuses), `CHANNELS.startup` and `startupChanged`, an optional `startup` bridge namespace, and a versioned workspace store (temp + rename through one queue, newer versions read-only, corrupt files moved aside) behind a module-main `op` handler with `in-use`/`cycle`/`locked` integrity. The renderer has a react-query data layer, the first-run company form and Settings ▸ Company. Amounts are local integer minor units because Phase 129's money type is not on main; ops whose behaviour belongs to C to F (projection, contract files, issue/pay/void, PDF, link book) answer a clear refusal until then.

**Theme C — Roadmap and milestones.** ✅ PR pending. A pure `roadmap-model.ts` (`wouldCreateCycle` over Theme B's `milestoneCycle`, `atRisk`, `overdue`, `timelineRange`, `positionInRange`), the roadmap view with a remembered List | Timeline switch, an add/edit sheet that greys out loop-making dependencies and shows main's `cycle` message, and an SVG timeline with today line and dependency arrows. The timeline's real-layout geometry stays for Theme G's browser spec, as the phase says.

**Theme D — Costs and runway.** ✅ Cost and revenue lines with cadence and growth, up to three scenarios, a
36-month projection, runway, zero-cash month and default-alive, with opening cash and actual burn read from
the linked book when there is one.

**Theme E — Vendors and contracts.** ✅ Vendors, contracts with term, renewal and notice dates, an attached
file kept in the app's folder, a deadlines list, and one linked cost line per priced contract.

**Theme F — Invoicing posted to the books.** ✅ PR pending. Startup mounts the Accountant module as its Books group
(`APP_MODULES.startup = ['startup', 'accountant']`, the ledger placement tuple, the preload bridge, the nav group, the
pane and the Tailwind globs). A `StartupLedgerPort` in the module is implemented by the host over the `LedgerService`
from `createAccountantServices`, which stamps `source.app` itself. Invoices go draft, issued, paid or void in main: the
number is gapless at issue and survives a void, posting is the commit point (the workspace is written only after the
ledger answers, and the ledger's `source.ref` idempotency heals a crash), and transitions run one at a time per store.
`linkBook` resolves the four accounts at link time and fixes the link once an invoice is posted. The invoice PDF is a
script-less printed page with every value escaped. The Invoices, Customers and Overview views and Settings ▸ Company ▸
Books are in, and Theme D's actuals (book cash as opening cash, three-month actual burn beside the modelled burn)
ride the same port. Two things worth knowing: Theme A's `startup-settings.ts` stub shadowed the real
`startup-settings.tsx` (a `.ts` resolves before a `.tsx`), so the Company page never showed; the stub is deleted. And the
launcher's catalog test requires a host's tile to list `APP_MODULES`, so the tile gained `MODULES.accountant` here
(still `comingSoon`; Theme G flips it).

**Theme G — Verification and the catalog flip.** ✅ PR pending. `suite-shell/startup.spec.ts` (3 tests, its own Vite
server on 5298): the first-run form, each timeline dependency arrow's endpoints on its two bars' edges (±2 px, read
through the SVG's screen matrix), and the Overview, Roadmap, Runway and invoice shots, written to `MSTUDIO_SHOTS_DIR`
and never committed (the phase's `docs/screenshots/p130/` is dropped: PNGs stay out of git). The tile left
`comingSoon` with `modules: [startup, accountant]`; the one `status.test.ts` "Coming soon" case moved to Health. The
site lists Startup with the launcher's tile image. `lineNet` now rounds half away from zero for negative products too
(it was only right for positive ones). The gate was the local subset because CI is billing-locked. **Still open for a
human:** the packaged-app pass.

**Verification (2026-11-13).** Ticked from local runs of `module-startup:test` (117 passed), `shared:test` and `app-startup:test`: `startup`, `workspace-store`, integrity (`in-use`, in `service.test.ts`), `roadmap-model`, `runway`. **Still open:** the `contracts.test.ts` box (no such file; `contract-dates.test.ts` and `contract-files.test.ts` pass but no test by that name covers one linked ledger line per contract) and the packaged-app pass.

## Build order

1. **A** (scaffold), then **B** (contract + store) — every view reads B's ops.
2. **C**, **D**, **E** in parallel; D's "actuals from the books" sub-item waits for F's port and degrades to manual
   opening cash until then.
3. **F** needs Phase 129 **A + B + C** merged (the `accountant` module, the ledger contract, `LedgerService.post`).
4. **G** last.

## Deliverables

### A — App scaffold and wiring (L)

- [x] Ids, appended per the board contract
  - [`modules.ts`](../../../packages/shared/src/modules.ts): `'startup'` appended to `MODULE_IDS` and `MODULE_HOST_IDS`;
    `APP_MODULES.startup = ['startup']` (Theme F makes it `['startup', 'accountant']`).
  - [`midnite-link.ts`](../../../packages/shared/src/midnite-link.ts): `'startup'` appended to `MIDNITE_APP_IDS` (the
    `_allAppsListed` assertion makes a miss a compile error).
  - [`placement.ts`](../../../packages/shared/src/domain/placement.ts) `PlacementAppIdSchema` and
    [`affected-apps.mjs`](../../../scripts/affected-apps.mjs) `PLACEMENT_APPS`: `'startup'` after `'vanguard'` (and after
    `'science'`/`'health'` if 126/128 landed first; the lists are pinned equal by `affected-apps.test.mjs`).
  - [`suite-apps.ts`](../../../packages/shared/src/suite-apps.ts) and the launcher's `APP_IDS` (**unchanged**: both already list `startup`).
  - Verified by `modules.test.ts` (existing: every host's own module first), `midnite-link.test.ts` (`MIDNITE_APP_IDS`
    equals `MODULE_HOST_IDS` minus the documented exclusions), `affected-apps.test.mjs`.
- [x] Net-new module `packages/modules/startup` (`@midnite/studio-module-startup`) from [`_template`](../../../packages/modules/_template/README.md)
  - `manifest.ts`: `startupManifest = defineModuleManifest({ module: 'startup', label: 'Startup', glyph: 'PiBuildingsFill',
    accent: '#8b5cf6', features: [], views: [] })` — the code lives in the module, not a feature (Decision 2).
  - moon id `module-startup`, tags `layer-module`, `app-startup`, `app-studio`; `dependsOn` `shared`, `frame`, `runtime`,
    `feature-report`; `NODE_PROJECTS` gains `module-startup`; `tsconfig.base.json` paths
    `@midnite/studio-module-startup/main` → `main/index.ts`, `/bridge` → `main/bridge.ts`.
  - `main/module.ts`: `startupModuleMain = defineFeatureMain<StartupMainServices>({ feature: 'startup', channels:
    [CHANNELS.startup], register })` (`feature` is a string label here, as capture's is).
  - `main/bridge.ts`: `createStartupBridge(ipc: RendererIpc): StartupBridge` = `{ startup: MidniteStudioBridge['startup'];
    report: ReportBridge }`, one method per op (Theme B), copying [`money/main/bridge.ts`](../../../packages/modules/money/main/bridge.ts).
  - `renderer/`: `STARTUP_NAV_GROUP: NavGroup` with views `startup.overview` (`LuGauge`), `startup.roadmap` (`LuMilestone`),
    `startup.runway` (`LuHourglass`), `startup.invoices` (`LuReceipt`), `startup.vendors` (`LuHandshake`); `StartupPane:
    ModulePane` (its own `QueryClientProvider`, `FrameChromeProvider` with `createFrameChrome()`, a `switch` on `view`);
    `STARTUP_APP = { id: 'startup', name: 'Midnite Startup', tagline, accent: '#8b5cf6', home: 'startup.overview' }`;
    `STARTUP_SETTINGS: SettingsPageDef[]` with one `scope: 'app'` page, **Company** (Theme B's profile form).
  - Verified by `manifest.test.ts` (template), `main/bridge.test.ts` (each op → `CHANNELS.startup`), and a renderer test
    that every nav view id renders a pane without throwing over the mock bridge.
- [x] Net-new `apps/startup`, copying [`apps/money`](../../../apps/money/package.json)'s files one for one
  - `package.json` (`@midnite/app-startup`, `"build": "vite build && node scripts/bundle-main.mjs"`), `moon.yml` (id
    `app-startup`, tags `layer-app`, `app-startup`; `dependsOn` `shared`, `frame`, `runtime`, `feature-report`,
    `feature-monitor`, `module-startup`), `tsconfig.json`, `vite.config.ts` (`server: { port: 5198, strictPort: true }`),
    `vitest.config.ts`, `tailwind.config.ts` (`frameContent(__dirname, [], ['startup'])` — features, then modules, as Money's `frameContent(__dirname, ['finance'], ['money'])`),
    `postcss.config.js`, `scripts/bundle-main.mjs`, `resources/icon.icns` (from `moon run launcher:icons`).
  - `main/identity.ts`: `STARTUP_NAME = 'Midnite Startup'`, `STARTUP_BUNDLE_ID = 'io.bilo.midnite-startup'`,
    `SMOKE_ENV = 'MIDNITE_STARTUP_SMOKE'`, `USER_DATA_ENV = 'MIDNITE_STARTUP_USER_DATA'`, `SMOKE_READY_LINE =
    'midnite-startup:ready'`, `startupUserData(appData, override?)` → `appDataDirectory(appData, 'startup')`.
  - `main/index.ts`: Money's `index.ts` with Money's names swapped: single-instance lock, `registerSuiteMain`,
    `registerSuiteMonitor`, crash log `startup.log`, `registerReport`, `guardAppWindow`, `suiteWindowOptions`, smoke line.
    No vault connection and no `pairing.ts`: nothing in Startup holds a secret.
  - `main/host.ts`: `registerStartupHost(el: StartupHostElectron): { dispose: () => Promise<void> }` →
    `mountModuleMains(createIpcContext(el), [{ module: startupModuleMain, services: createStartupServices(el) }])`.
  - `main/preload.ts`: `unionBridgeSlices(createStartupBridge(ipcRenderer), createMonitorFeatureBridge(…), createSuiteBridge(…))`.
  - `src/host-nav.ts` (`STARTUP_HOST_NAV = navFromModules(APP_MODULES.startup, { startup: STARTUP_NAV_GROUP })`),
    `src/host-app.tsx` (`StartupHostApp`: `SuiteAppShell app="startup"` + `ModuleViewRouter`, `ReportIssueHost
    app="midnite-startup"`, `settingsPages={STARTUP_SETTINGS}`), `src/main.tsx`, `src/index.html`, `src/styles.css`, `src/index.ts`.
  - Verified by net-new `main/identity.test.ts` (user data path, smoke detection; `STARTUP_BUNDLE_ID` equals
    `stubIdentity('startup', 'Startup').bundleId` from the launcher's `layout.ts`), `main/host.test.ts`
    (`CHANNELS.startup` registered once over `createRecordingContext`), `src/host-app.test.tsx` (the Startup group and its
    five rows render), and the repo-wide guards that scan every app: `scripts/app-window-guard.test.mjs`,
    `scripts/app-moon-inputs.test.mjs`.
- [x] Release wiring: a `describe('apps/startup')` case in [`release-bundles.test.mjs`](../../../scripts/release-bundles.test.mjs),
  copying the `apps/money (Theme P)` case — `bundleMatrix(apps, has).include` contains `{ app: 'startup', project:
  'app-startup', dir: 'apps/startup' }` and `apps/startup/resources/icon.icns` is a valid `icns`
- [x] Studio: `'startup'` appended to `STUDIO_MODULES` in [`composition.ts`](../../../apps/studio/src/composition.ts) (its test globs
  `packages/modules/*/package.json`); Studio renders no Startup view in this phase (Decision 6)
- [x] The tile stays `comingSoon: true` through Themes A–F; Theme G flips it (the launcher falls back to Studio for an
  unpublished non-`comingSoon` app, and Studio renders no Startup view)

### B — Workspace store and the startup contract (M)

- [x] Net-new `packages/shared/src/startup.ts` (zod only), exported from the shared barrel; amounts are `MoneyAmountSchema` /
  integer `minor` from Phase 129's [`money-amount.ts`](phase-129-accountant.md#b--money-amounts-and-the-ledger-contract-s)
  - `CompanyProfileSchema = { name (1–120), legalName?, currency: CurrencyCodeSchema, address: z.string().max(400).default(''),
    taxId: z.string().max(40).optional(), invoicePrefix: z.string().regex(/^[A-Z0-9-]{0,8}$/).default('INV-'),
    paymentTermsDays: z.int().min(0).max(365).default(30), openingCash: { minor: z.int(), asOf: IsoDateSchema } }`.
  - `MilestoneSchema`, `PlanLineSchema`, `RunwayScenarioSchema`, `CustomerSchema`, `InvoiceSchema`, `VendorSchema`,
    `ContractSchema` — fields in Themes C–F.
  - `StartupWorkspaceSchema = { version: z.literal(1), company: CompanyProfileSchema.nullable(), milestones, lines,
    scenarios, customers, invoices, vendors, contracts, invoiceCounter: z.int().min(0).default(0), ledger: { bookId:
    LedgerIdSchema; accounts: { receivable; sales; taxPayable; bank } }.nullable().default(null) }`; every array `.default([])`.
  - Verified by net-new `startup.test.ts`: an empty `{ version: 1 }` parses to a full workspace; each schema round-trips.
- [x] The channel: `CHANNELS.startup = 'mstudio:startup:op'`, `EVENT_CHANNELS.startupChanged = 'mstudio:startup:changed'` (payload
  `{ revision: number }`)
  - `StartupRequestSchema = z.discriminatedUnion('op', [...])`: `get` · `updateCompany` · `upsertMilestone` / `removeMilestone` ·
    `upsertLine` / `removeLine` · `upsertScenario` / `removeScenario` · `projection { scenarioId, months: 12 | 24 | 36 }` ·
    `upsertVendor` / `removeVendor` · `upsertContract` / `removeContract` · `attachContractFile { contractId }` ·
    `openContractFile { contractId }` · `upsertCustomer` / `removeCustomer` · `upsertInvoice` · `issueInvoice { id, issueDate }` ·
    `markPaid { id, paidDate }` · `voidInvoice { id, reason }` · `exportInvoicePdf { id }` · `linkBook { bookId: string | null }` ·
    `ledgerSummary`.
  - `StartupResult<T> = { ok: true; value: T } | { ok: false; kind: 'invalid' | 'not-found' | 'in-use' | 'cycle' | 'locked' |
    'no-book' | 'ledger' | 'newer-version' | 'io'; message: string }`. Ops never throw across the boundary.
  - Registered in [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) and `MidniteStudioBridge['startup']` in
    [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts); the existing `ipc.test.ts` walk covers the parse.
- [x] Net-new `packages/modules/startup/main/workspace-store.ts`: `openWorkspaceStore({ dir, now, warn }): Promise<WorkspaceStore>`
  - File `<userData>/startup/workspace.json`, written temp + rename through one promise queue (the
    [`portfolio-store.ts`](../../../packages/features/finance/main/markets/portfolio-store.ts) pattern); every write bumps
    `revision` and sends `startupChanged`.
  - `migrateWorkspace(raw: unknown): { ok: true; workspace } | { ok: false; reason: 'newer-version' | 'corrupt' }` — v1 is the
    identity; a `version` above 1 opens **read-only** (writes return `newer-version`, "This workspace was written by a newer
    Midnite Startup."); a file that fails the schema is moved to `workspace.corrupt-<ts>.json` and an empty workspace starts.
  - No lock file: Startup is single-instance (`requestSingleInstanceLock`) and Studio does not open this file.
  - Verified by net-new `workspace-store.test.ts`: write → reopen equal; 10 concurrent upserts → 10 records; `version: 2` →
    read-only; garbage → moved aside, empty workspace.
- [x] Referential integrity is main's job: `removeVendor` with contracts, `removeCustomer` with invoices, `removeMilestone` with
  dependents each return `in-use` and name the count; the UI shows that message, never a cascade
- [x] Company first-run: with `company: null`, every view shows "Set up your company" (name, currency from
  `MARKET_CURRENCIES`, opening cash and its date); the currency is fixed once the first invoice is issued (`locked`)
- [x] Data access in the renderer through react-query keyed `['startup', op, args]`; `startupChanged` invalidates `['startup']`

### C — Roadmap and milestones (M)

- [x] `MilestoneSchema = { id: z.uuid(), title (1–120), description: z.string().max(2000).default(''), status: z.enum(['planned',
  'in-progress', 'done', 'dropped']), start: IsoDateSchema.optional(), due: IsoDateSchema, dependsOn: z.array(z.uuid()).max(20),
  owner: z.string().max(80).optional(), tags: z.array(z.string().max(24)).max(8).default([]) }`
- [x] Net-new pure `renderer/roadmap/roadmap-model.ts`
  - `wouldCreateCycle(milestones, id, dependsOn): boolean` (DFS); main re-checks on `upsertMilestone` and returns `cycle`
    naming the loop's titles.
  - `atRisk(m, byId): boolean` — not `done`/`dropped`, and a dependency that is not `done` is due on or after `m.due`; also
    `overdue(m, today)` — due before today and not `done`/`dropped`.
  - `timelineRange(milestones, today): { from: 'YYYY-MM'; to: 'YYYY-MM' }` — earliest start/due minus a month to latest due
    plus a month, at least 6 months, at most 36 (beyond is clipped with a "+N later" marker).
  - Verified by `roadmap-model.test.ts`: A→B→A is a cycle; self-dependency is a cycle; at-risk and overdue truth tables.
- [x] Roadmap view (`startup.roadmap`): a **List | Timeline** switch, persisted in the module's UI store
  - List: grouped by status, sorted by due; badges "At risk" (amber) and "Overdue" (red); a side sheet to add/edit with a
    dependency multi-select that greys out choices `wouldCreateCycle` rejects.
  - Timeline: month columns (CSS grid), one bar per milestone from `start ?? due` to `due`, colour by status, a today line,
    dependency arrows as an SVG overlay between bar ends; clicking a bar opens the same sheet.
  - Empty: "No milestones yet" + **Add milestone**.
- [x] Tests: RTL `roadmap-view.test.tsx` (add, the cycle option disabled, `cycle` error copy from the mock, status badges);
  the timeline's geometry is asserted in Theme G's shots spec (it needs real layout)

### D — Costs and runway (L)

- [x] `PlanLineSchema = { id, kind: z.enum(['cost', 'revenue']), name (1–80), category: z.enum(['people', 'software', 'premises',
  'marketing', 'professional', 'hardware', 'revenue', 'other']), minor: z.int().nonnegative(), cadence: z.enum(['monthly',
  'quarterly', 'yearly', 'one-off']), start: z.string().regex(/^\d{4}-\d{2}$/), end: same.optional(), growthBpPerMonth:
  z.int().min(-10000).max(10000).default(0), contractId: z.uuid().optional() }`
- [x] `RunwayScenarioSchema = { id, name (1–40), costMultiplierBp: z.int().min(0).max(100000).default(10000), revenueMultiplierBp:
  same, extraLines: PlanLineSchema[] }`; at most 3 scenarios; "Base" (multipliers 10000, no extras) always exists and cannot be removed
- [x] Net-new pure `main/runway.ts`: `projectRunway(input: { openingCashMinor: number; startMonth: 'YYYY-MM'; lines: PlanLine[];
  scenario: RunwayScenario; months: 12 | 24 | 36 }): RunwayProjection`
  - Per month: each line contributes when `start ≤ month ≤ end`; `quarterly`/`yearly` fall in the start month and every 3/12
    after; `one-off` only in `start`; growth compounds monthly from `start` with `percentOfMinor` rounding each month.
  - `RunwayProjection = { months: { month; revenueMinor; costMinor; netMinor; cashMinor }[]; burnMinor (mean net of the first 3
    months, negative = burning); runwayMonths: number | null (null = cash never goes below 0 in the horizon); zeroCashMonth:
    string | null; defaultAlive: boolean (net turns ≥ 0 in some month before cash < 0) }`.
  - Runs in main because the actuals come from the ledger there; the renderer only draws.
  - Verified by `runway.test.ts`: £100 000 cash, £10 000/month cost, no revenue → `runwayMonths 10`, `zeroCashMonth` the 11th
    month; a yearly £12 000 line lands only in month 1 and 13; 10 % monthly revenue growth from £1 000 against £5 000 cost
    → `defaultAlive` true/false at the hand-computed crossover; a 0 % line equals a flat line exactly.
- [x] Actuals from the books, when a book is linked (Theme F's port; until F lands this sub-item renders "Link a book to use actuals")
  - Opening cash = the book's cash + bank balance as of today (overrides `company.openingCash`, shown as "from <book>").
  - "Actual burn" = mean monthly (expense − income) over the last 3 full months from the book, shown beside the modelled burn
    with the difference.
- [x] Runway view (`startup.runway`): lines table (add/edit/remove in a sheet), scenario tabs (Base + up to 2), horizon select
  (12/24/36), headline cards (cash today, monthly burn, runway in months or "Beyond <horizon>", zero-cash month, Default
  alive / Default dead), and a cash line chart
  - Chart: inline SVG polyline (one series per scenario, the zero line marked); no chart dependency.
  - Empty: "Add your first cost" + **Add line**.
- [x] Tests: RTL `runway-view.test.tsx` (headline copy for `runwayMonths: null` → "Beyond 36 months"; scenario tab switches the
  `projection` request; Base has no remove button)

### E — Vendors and contracts (M)

- [x] `VendorSchema = { id, name (1–120), category: PlanLineSchema's category enum, website: z.url().optional(), contact:
  z.string().max(200).optional(), notes: z.string().max(2000).default('') }`
- [x] `ContractSchema = { id, title (1–120), counterparty: { kind: z.enum(['vendor', 'customer']), id: z.uuid() }, start:
  IsoDateSchema, end: IsoDateSchema.optional(), autoRenews: z.boolean().default(false), renewalTermMonths: z.int().min(1).max(60)
  .optional(), noticeDays: z.int().min(0).max(365).default(0), value: { minor: z.int().nonnegative(), cadence: PlanLine cadence
  }.optional(), file: { name: z.string().max(260), sha256: z.string().regex(/^[a-f0-9]{64}$/), ext: z.enum(['pdf', 'docx',
  'png', 'jpg']) }.optional() }`
- [x] Net-new pure `contract-dates.ts`: `currentTermEnd(c, today)` (rolls an auto-renewing contract forward by
  `renewalTermMonths` until ≥ today), `noticeDeadline(c, today) = currentTermEnd − noticeDays`, `contractStatus(c, today):
  'active' | 'notice-due' (deadline within 30 days) | 'ending' (non-renewing, end within 30 days) | 'ended'`
  - Verified by `contract-dates.test.ts`: a 12-month auto-renewing contract from 2025-01-01 with 30 days' notice on 2026-11-11
    → term end 2026-12-31, deadline 2026-12-01, `notice-due`; a non-renewing one past its end → `ended`.
- [x] Attachments: `attachContractFile` opens the host-injected `pickContractFile()` (pdf/docx/png/jpg, ≤ 25 MB), copies it to
  `<userData>/startup/contracts/<sha256>.<ext>`; `openContractFile` resolves the stored name through `confineToRoot`
  ([`fs-jail.ts`](../../../packages/runtime/src/fs-jail.ts)) and calls the injected `openPath`
  - The renderer never sends or receives a path; replacing a file leaves the old copy only if another contract references its hash.
- [x] Priced contracts drive the runway: saving a contract with `value` creates or updates exactly one `PlanLine` with
  `contractId` (kind `cost` for a vendor, `revenue` for a customer, `start` = contract start month, `end` = term end month
  unless `autoRenews`); removing the contract asks, through the frame's `confirm`, whether to remove that line too
- [x] Vendors view (`startup.vendors`): **Vendors | Contracts** tabs; an "Action needed" strip at the top listing `notice-due` and
  `ending` contracts with their dates; contract sheet with counterparty picker, dates, value, file attach/open
- [x] Tests: `contracts.test.ts` in main (attach copies and hashes; open refuses a stored name that escapes the folder; contract
  save creates one linked line and a second save updates it); RTL `vendors-view.test.tsx` (Action needed lists a
  `notice-due` contract; remove-vendor `in-use` copy)

### F — Invoicing posted to the books (L)

- [x] Startup mounts the Accountant module (needs Phase 129 A–C merged)
  - `APP_MODULES.startup = ['startup', 'accountant']`; `FEATURE_PLACEMENT.ledger = ['money', 'startup']`; `feature-ledger` and
    `module-accountant` gain the `app-startup` tag; `apps/startup/main/host.ts` mounts `accountantModuleMain` with `createAccountantServices({ appDataBase, appId: 'startup', … })`, the
    preload adds `createAccountantBridge`, `host-nav.ts` adds `accountant: ACCOUNTANT_NAV_GROUP`, the panes add `accountant:
    AccountantPane`, `tailwind.config.ts` becomes `frameContent(__dirname, ['ledger'], ['startup', 'accountant'])`.
  - The books are the shared ones under `Midnite Runtime/books` (Phase 129 Theme C), so a company book made in Money shows here.
  - Verified by `apps/startup/main/host.test.ts`: `CHANNELS.ledger` and `CHANNELS.startup` each registered once.
- [x] Net-new `packages/modules/startup/main/ledger-port.ts`: the port Startup declares and its host implements
  - `StartupLedgerPort = { listBooks(): Promise<LedgerResult<{ id: string; name: string; entity: string; currency: string }[]>>;
    post(req: LedgerPostRequest, source: { kind: 'invoice' | 'payment'; ref: string }): Promise<LedgerResult<{ entryId: string;
    duplicate: boolean }>>; reverse(bookId: string, entryId: string, date: string, reason: string): Promise<LedgerResult<{ entryId:
    string }>>; cashBalance(bookId: string, asOf: string): Promise<LedgerResult<{ minor: number }>>; monthlyNet(bookId: string,
    from: string, to: string): Promise<LedgerResult<{ month: string; incomeMinor: number; expenseMinor: number }[]>> }`.
  - The host builds it from the `LedgerService` it got from `createAccountantServices` (`service.post(req, { app: 'startup',
    ...source })`, `service.balances`, `service.report('profit-loss', …)` per month); `source.app` is stamped by the host, never
    by the module or renderer. The module imports only types from `shared/src/ledger.ts`, never the ledger feature or the
    accountant module.
  - Until Theme F, `createStartupServices` receives `ledger: null` and every ledger op answers `no-book`.
- [x] `linkBook`: Settings ▸ Company lists books from the port whose currency equals the company currency (others shown disabled
  with "Different currency"); linking resolves `ledger.accounts` by subtype — first non-archived `receivable`, `sales`,
  `tax-payable`, `bank` by code — and refuses with `ledger` "<book> has no <subtype> account" when one is missing
- [x] `CustomerSchema = { id, name (1–120), email: z.email().optional(), address: z.string().max(400).default(''), taxId:
  z.string().max(40).optional() }`
- [x] `InvoiceSchema = { id, number: z.string().max(20).nullable() (null while draft), customerId, issueDate:
  IsoDateSchema.nullable(), dueDate: IsoDateSchema.nullable(), lines: { description (1–200), quantityMilli: z.int().positive(),
  unitMinor: z.int().nonnegative(), taxRateBp: z.int().min(0).max(10000) }[] (1–100), notes: z.string().max(1000).default(''),
  status: z.enum(['draft', 'issued', 'paid', 'void']), entries: { issued?: uuid; paid?: uuid; void?: uuid }, paidDate?, voidReason? }`
  - Net-new pure `invoice-math.ts`: `lineNet = round(quantityMilli × unitMinor / 1000)` (BigInt, half away from zero),
    `lineTax = percentOfMinor(lineNet, taxRateBp)`, `totals(invoice) = { netMinor, taxMinor, totalMinor, taxByRate:
    Map<bp, minor> }`.
  - Verified by `invoice-math.test.ts`: 1.5 h × £80.00 at 20 % → net 12000, tax 2400; 3 × £0.333 → 999 (no float drift);
    two lines at different rates group by rate.
- [x] The state machine, in main, each transition one ledger call
  - `issueInvoice`: draft only, needs a linked book; assigns `number = invoicePrefix + String(++invoiceCounter).padStart(4, '0')`
    (gapless, assigned at issue so drafts burn no numbers); `dueDate = issueDate + paymentTermsDays`; posts Dr receivable
    `total` / Cr sales `net` / Cr tax-payable `tax` (the tax line omitted at 0), `source { kind: 'invoice', ref: invoice.id }`.
  - `markPaid`: issued only; posts Dr bank / Cr receivable `total`, `source { kind: 'payment', ref: invoice.id }`.
  - `voidInvoice`: issued (unpaid) only, reason required; `port.reverse(issued entry)`; the number stays used and the invoice
    keeps it, marked VOID. A paid invoice cannot be voided (`invalid`: "Refunds are not supported yet").
  - Issued invoices are read-only; only drafts take `upsertInvoice`.
  - A ledger failure leaves the invoice in its previous state (the workspace write happens only after `ok: true`); a retry is
    safe because posting is idempotent on `source.ref` (Phase 129).
  - Verified by `invoices.test.ts` against an in-memory port: issue → one post with the three lines and number `INV-0001`; a
    second issue of another draft → `INV-0002`; pay → Dr bank; void → one `reverse`; port returning `locked-period` →
    invoice still `draft`, counter unchanged; retry after a crash between post and write → `duplicate: true`, one entry.
- [x] `exportInvoicePdf`: pure `renderInvoiceHtml(invoice, company, customer): string` (every interpolated value HTML-escaped,
  inline CSS, no script), written to a temp file and printed by the host-injected `printToPdf(htmlFile): Promise<Buffer>` —
  the hidden `javascript: false` window Gamer and Agents already use ([`apps/gamer/main/index.ts`](../../../apps/gamer/main/index.ts)
  `printToPdf`) — then saved via `savePdf(defaultName)`; cancel → `{ ok: true, value: { saved: false } }`
  - Verified by `invoice-html.test.ts`: a customer named `<script>` renders escaped; totals and the VOID stamp appear.
- [x] Invoices view (`startup.invoices`): **Invoices | Customers** tabs; filter by status; columns number, customer, issue, due,
  total, status (Overdue derived: issued and `dueDate` < today); draft editor sheet with line rows and live totals; actions
  Issue · Mark paid · Void · Export PDF, each confirming with what will be posted ("Posts £1,440.00 to <book>: receivable,
  sales, tax")
  - No linked book: Issue is disabled with "Link a book in Settings ▸ Company to issue invoices."
- [x] Overview (`startup.overview`): cash today, runway, next 3 milestones by due, overdue invoices total, contracts needing action;
  each card links to its view
- [x] Tests: RTL `invoices-view.test.tsx` (Issue disabled without a book; issue confirm copy names the amount and book; a void
  invoice shows VOID and no actions) and `overview.test.tsx` (cards render from the mock; empty company → setup prompt)

### G — Verification and the catalog flip (S)

- [x] Net-new Playwright `packages/app/e2e/suite-shell/startup.spec.ts`, served the way Vanguard and Agents already are
  - [`packages/app/playwright.config.ts`](../../../packages/app/playwright.config.ts) gains `STARTUP_PORT =
    Number(process.env.MSTUDIO_E2E_STARTUP_PORT ?? 5298)` and a `webServer` entry `pnpm exec vite --port ${STARTUP_PORT}
    --strictPort` with `cwd: '../../apps/startup'`; `SUITE_APP_URLS.startup` and a `STARTUP_EMPTY_ANSWERS` /
    `STARTUP_SEEDED_ANSWERS` pair in [`test-support/suite-bridge.ts`](../../../packages/app/test-support/suite-bridge.ts), installed with
    `installSuiteBridge(page, { frameless: true, answers })` as [`suite-shell.spec.ts`](../../../packages/app/e2e/suite-shell/suite-shell.spec.ts) does.
  - Header comment names the capability: real layout for the timeline's bar geometry and the SVG arrows.
  - Asserts each dependency arrow's endpoints sit on its two bars' edges (± 2 px) via `getBoundingClientRect`, and saves
    shots of Overview, Roadmap timeline, Runway with two scenarios and an invoice draft under `docs/screenshots/p130/`.
  - `scripts/e2e-budget.mjs`'s declared-test count is raised by exactly the tests this file adds.
- [x] Catalog flip in [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts): the startup tile gets `modules: [MODULES.startup,
  MODULES.accountant]` (a net-new `MODULES.startup` entry carrying today's three features, retargeted to
  `module:startup`), loses `comingSoon` and its tile-level `features` (derived from modules, as every module host's are)
  - [`apps/launcher/src/renderer/app.test.tsx`](../../../apps/launcher/src/renderer/app.test.tsx): whichever "Coming soon" case
    still points at Startup moves to a tile that is still `comingSoon`, or is deleted when none is (the board's note).
  - Verified by `catalog.test.ts`: Startup is installable and lists two modules.
- [x] Website: a `startup` entry in [`packages/website/src/apps/catalog.ts`](../../../packages/website/src/apps/catalog.ts) (the site lists
  available apps only), copy from the launcher's tagline and vision; no link to this repo or `midnite-apps`; the
  `apps-page.test.tsx` count moves by one
- [x] The gate (`moon run :typecheck :lint :test`) green (local subset; CI is billing-locked), including `layer-boundaries.test.mjs`, `gate-projects-check`,
  `release-bundles.test.mjs`
- [ ] **Open, for a human:** install Midnite Startup from the launcher in a packaged build; set up a company, link a book made in
  Money, add milestones with a dependency, model runway with a priced contract, issue and pay an invoice, then open Money ▸
  Accountant and see both entries in the journal

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| [`packages/shared/src/modules.ts`](../../../packages/shared/src/modules.ts) | A, F | `startup` ids; `APP_MODULES.startup` |
| [`packages/shared/src/midnite-link.ts`](../../../packages/shared/src/midnite-link.ts) | A | `MIDNITE_APP_IDS` |
| [`packages/shared/src/domain/placement.ts`](../../../packages/shared/src/domain/placement.ts) | A, F | `startup` app id; `ledger` tuple |
| [`packages/shared/src/suite-apps.ts`](../../../packages/shared/src/suite-apps.ts) | — | (**unchanged**: already lists `startup`) |
| `packages/shared/src/startup.ts` (+ test) | B–F | **net-new** |
| `packages/shared/src/money-amount.ts`, `ledger.ts` | B, F | (**unchanged** here, load-bearing: Phase 129 Theme B) |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | B | `startup` channel |
| `packages/modules/startup/**` | A–F | **net-new** module (manifest, main: module, bridge, context, workspace-store, runway, contracts, invoices, ledger-port; renderer: nav, pane, views) |
| `apps/startup/**` | A, F | **net-new** app (copied from `apps/money`) |
| [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) | A | `STUDIO_MODULES` |
| [`scripts/affected-apps.mjs`](../../../scripts/affected-apps.mjs), [`gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs), [`release-bundles.test.mjs`](../../../scripts/release-bundles.test.mjs) | A | ids, project, release case |
| `tsconfig.base.json` | A | module paths |
| `packages/features/ledger/moon.yml`, `packages/modules/accountant/moon.yml` | F | `app-startup` tag |
| [`apps/launcher/src/common/catalog.ts`](../../../apps/launcher/src/common/catalog.ts), [`app.test.tsx`](../../../apps/launcher/src/renderer/app.test.tsx) | G | flip + modules |
| [`apps/launcher/src/main/bundles/production.ts`](../../../apps/launcher/src/main/bundles/production.ts) | — | (**unchanged**, load-bearing: `identityForApp` covers `startup`) |
| [`packages/website/src/apps/catalog.ts`](../../../packages/website/src/apps/catalog.ts) | G | Startup listing |
| [`packages/app/playwright.config.ts`](../../../packages/app/playwright.config.ts), [`test-support/suite-bridge.ts`](../../../packages/app/test-support/suite-bridge.ts) | G | Startup web server + answers |
| `packages/app/e2e/suite-shell/startup.spec.ts`, `docs/screenshots/p130/` | G | **net-new** |

## Verification

- [x] `startup.test.ts`: `{ version: 1 }` parses to a full workspace; every schema round-trips.
- [x] `workspace-store.test.ts`: reopen equal; concurrent upserts serialised; newer version read-only; corrupt file moved aside.
- [x] Integrity: removing a referenced vendor, customer or milestone returns `in-use` with the count.
- [x] `roadmap-model.test.ts`: cycles (incl. self), at-risk and overdue tables.
- [x] `runway.test.ts`: the four worked projections above, exact to the minor unit.
- [ ] `contract-dates.test.ts` + `contracts.test.ts`: renewal roll-forward, notice deadline, jailed open, one linked line per contract.
- [x] `invoice-math.test.ts`, `invoices.test.ts`, `invoice-html.test.ts`: totals, gapless numbering, each transition's posting,
  failure leaves state unchanged, idempotent retry, escaping.
- [x] Host tests: `CHANNELS.startup` (A) and `CHANNELS.ledger` (F) registered once; `identity.test.ts` bundle id equals the launcher's.
- [x] `release-bundles.test.mjs`: `app-startup` in the matrix with an icon.
- [x] RTL: roadmap, runway, vendors, invoices and overview views as listed per theme.
- [x] `e2e/suite-shell/startup.spec.ts`: arrow endpoints on bar edges; shots saved outside git.
- [x] `catalog.test.ts`: Startup installable with two modules.
- [ ] **Open, for a human:** the packaged-app pass in Theme G.

## Not in this phase

- **A ledger of Startup's own** — Phase 129's books are the only ledger; Startup posts into them.
- **Bills and purchase orders** — vendor costs enter the books by bank import (Phase 129 Theme E); a bills workflow is the next ERP slice.
- **Refunds, credit notes and partial payments** — each needs its own posting pattern; void-before-payment covers the MVP.
- **Multi-currency invoices** — the company has one currency, as the book does.
- **Payment collection (Stripe links), e-invoicing networks (Peppol), sending email** — an external service and its credentials; export the PDF and send it yourself.
- **Cap table, fundraising and equity** — Carta's other half; out of an ops MVP.
- **Syncing milestones with GitHub or Linear** — the forge integration is Studio's; a link-out can follow.
- **Startup views inside Studio** — Startup ships as its own bundle; Studio only lists its module (Decision 6).
- **Hiring plans as people records** — headcount is a `people` cost line for now.

## Decisions / open questions

- **Resolved — Accountant owns the ledger and the money type; Startup owns invoices and posts.** Agreed with Phase 129 on the
  swarm board, because one ledger is the only way the books and the invoices agree, and a module may not import another
  module: Startup declares `StartupLedgerPort` and its host implements it over the `LedgerService` from
  `createAccountantServices`.
- **Resolved — Startup's code lives in the `startup` module, with no new feature package.** Agreed, because nothing else
  composes it and Studio does not render it; a feature package would add moon, CI and tsconfig plumbing for no reuse,
  the same call Phase 125 made for animations.
- **Resolved — Startup mounts the Accountant module as its Books group (Theme F).** Agreed, because a startup's books are
  the same thing Money's Accountant shows, and Creator already proves one module in several hosts.
- **Resolved — invoice numbers are assigned at issue, gapless, and survive a void.** Agreed, because most jurisdictions
  expect a continuous sequence, and numbering drafts would burn numbers on abandoned drafts.
- **Resolved — posting is the commit point.** Agreed: the workspace is written only after the ledger answers `ok`, and
  Phase 129's idempotent `source.ref` makes the retry after a crash harmless, so there is no two-phase commit to build.
- **Resolved — Studio renders no Startup view this phase.** Agreed, because Startup is a standalone bundle, the tile stays
  `comingSoon` until that bundle is published, and a second render path would double the UI tests for no user.
- **Resolved — the runway projection runs in main.** Agreed, because the opening cash and actual burn come from the books in
  main, and the renderer then draws one already-computed series per scenario.
- **Resolved — one workspace per install, no lock file.** Agreed, because Startup is single-instance and no other process
  opens `workspace.json`; the books, which Money and Studio also open, carry Phase 129's lock.
- **Resolved — charts are inline SVG.** Agreed, because one line chart and one timeline do not justify a chart dependency in
  a new bundle.
- **Resolved — Startup's browser test rides Studio's Playwright config, not one of its own.** Agreed, because
  `packages/app/playwright.config.ts` already serves Vanguard's and Agents' Vite servers for `e2e/suite-shell/` with a
  deep-proxy bridge (`installSuiteBridge`), so one more `webServer` entry on port 5298 costs nothing new, while a second
  Playwright project would need its own CI wiring and browser download.
