# Phase 152 — Projections ↔ Runway

Planned 2026-11-18 · grounded against `main` after Phase 150 (`a7897cc63`) and PR #1309.

Projections stop being a sandbox. A projection can be sent into Runway as linked cost and revenue lines and
re-synced when it changes. The hardware and API catalog becomes editable. Money follows the company's currency
(USD before a company exists) instead of fixed ZAR. Projections and the runway export to CSV, and a projection
also exports to a one-page PDF.

> **Builds on.**
> - **Phase 150 (Startup projections)**: [`phase-150-startup-projections.md`](phase-150-startup-projections.md).
>   - [`shared/src/startup-fleet.ts`](../../../packages/shared/src/startup-fleet.ts) — `HARDWARE_CATALOG`, `API_TIERS`
>     (constants priced in ZAR cents), `FleetNodeConfigSchema` (`hardwareId: z.enum(HARDWARE_IDS)`,
>     `pricePerHourCents`), `FleetGlobalsSchema` (`electricityRateCents`), `FleetProjectionSchema`, `buildFleetStarter`.
>   - [`renderer/projections/fleet-model.ts`](../../../packages/modules/startup/renderer/projections/fleet-model.ts) —
>     `computeFleetProjection`; [`format-zar.ts`](../../../packages/modules/startup/renderer/projections/format-zar.ts) —
>     `formatZar` / `formatCompactZar` (no `Intl`, locale-proof).
>   - Views: `projections-view.tsx`, `projection-list.tsx`, `controls-panel.tsx`, `results-panel.tsx`,
>     `fleet-chart.tsx`, `node-card.tsx` (`TemplateSelects` with a `compact` prop), `use-fleet-draft.ts`.
> - **Phase 130 (Startup app)**: [`phase-130-startup.md`](phase-130-startup.md).
>   - [`shared/src/startup.ts`](../../../packages/shared/src/startup.ts) — `STARTUP_WORKSPACE_VERSION = 2`,
>     `CompanyProfileSchema.currency`, `PlanLineSchema` (`kind`, `category` ∈ `PLAN_CATEGORIES`, `minor`,
>     `cadence` ∈ `PLAN_CADENCES`, `start`/`end` `YearMonth`, `growthBpPerMonth`, `contractId?`), `StartupRequestSchema`.
>   - [`main/workspace-store.ts`](../../../packages/modules/startup/main/workspace-store.ts) — `migrateWorkspace`, which
>     already has an explicit v1 → v2 step (Phase 150). This phase adds v2 → v3 beside it.
>   - [`main/service.ts`](../../../packages/modules/startup/main/service.ts) — `handleStartupRequest`, `fail`/`done`/`upsert`.
>   - [`main/runway.ts`](../../../packages/modules/startup/main/runway.ts) — `projectRunway(input)`, `RunwayMonth`.
>   - [`main/invoice-pdf.ts`](../../../packages/modules/startup/main/invoice-pdf.ts) — `InvoicePdfPort { printToPdf, savePdf }`
>     and `exportInvoicePdf` (temp HTML → hidden-window print → save dialog; cancel is `{ saved: false }`).
>   - [`apps/startup/main/host.ts`](../../../apps/startup/main/host.ts) — `StartupHostElectron` already carries
>     `saveCsv(defaultName)` (wired in `apps/startup/main/index.ts`) and `pdf?: InvoicePdfPort`.
>   - [`renderer/runway/runway-view.tsx`](../../../packages/modules/startup/renderer/runway/runway-view.tsx),
>     [`runway-types.ts`](../../../packages/modules/startup/renderer/runway/runway-types.ts) (`formatMinor`).
>   - [`renderer/startup-settings.tsx`](../../../packages/modules/startup/renderer/startup-settings.tsx) — `STARTUP_SETTINGS`
>     (one page today: `app:startup-company`).
>   - [`renderer/money-input.ts`](../../../packages/modules/startup/renderer/money-input.ts) — `minorExponent(currency)`,
>     `toMinor`, `fromMinor`.

> **Scope guardrails.** No currency conversion anywhere: a workspace has one money currency, and every amount in
> it (catalog, projections, Runway) is in that currency's minor units. No live or fetched prices. No MCP tools and
> no investor update (Phase 153). Runway's own maths (`projectRunway`) is untouched: the bridge only writes
> ordinary `PlanLine`s.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_One model, not two._ A projection built in Projections lands in Runway as real cost and revenue lines, stays
linked, and says when it has drifted. Prices come from a catalog the user can edit, in the company's own currency.
Planned 2026-11-18; build order **A**, then **B ‖ C**, then **D ‖ E**, then **F**, then **G**.

**Theme A — Workspace v3 and the money currency.** ✅ Workspace v3 with a seeded, workspace-held fleet catalog, `…Minor` money fields, the energy switch, `PlanLine.source`, and all six new ops declared (unimplemented ones answer `invalid`). Renderer runs on an interim USD-seeded catalog adapter until Theme B.

**Theme B — Model and money formatting.** ✅ `formatMoney` / `formatCompactMoney` replace the ZAR-only formatter (symbol
table, exponent from `minorExponent`, still no `Intl`), and the company currency and workspace catalog reach every
formatter and the model through a `MoneyProvider` that `ProjectionsView` fills (a context rather than a prop through
six components). `computeFleetProjection(p, catalog)` has no default catalog, wires the energy switch (energy follows
the grown utilisation, so 70 % busy draws × 0.7), and a missing catalog entry prices at zero and is listed in `missing`.

**Theme C — Editable catalog.** ✅ Settings ▸ Catalog edits hardware and API tiers (add, rename, price in the company
currency, hide; delete for custom rows only, refused inline when a node uses it), saved through `upsertFleetCatalog`
after 400 ms; main refuses duplicate ids (`invalid`) and a removed id still in use (`in-use`). Dropdowns show a hidden
selected entry as `(hidden)` and an unknown id as `Missing (<id>)`. Changing the company currency does not re-seed or
convert the catalog (no FX); Restore defaults re-seeds the built-ins in the current currency and keeps custom rows.

**Theme D — Send to Runway.** ✅ A pure `fleetToRunwayLines` (hardware, running costs, revenue; revenue and capped
OpEx split in two where utilisation caps out), an idempotent send/update and an unlink op in one `store.mutate` each, a
Send / Update Runway dialog with a start month and a line preview, a `Linked · synced` status and Stale pill in the
results header, a `From <projection>` badge and Stale pill on Runway lines, and a delete prompt that can take the lines
with it or keep them. The fleet maths and the lines function moved to `packages/shared` (`startup-fleet-model.ts`,
`startup-fleet-runway.ts`) because a module's main and renderer halves may not import each other; the old paths
re-export them.

**Theme E — Export.** ✅ A projection CSV (month series, then a node table), a runway CSV and a one-page A4-landscape
projection PDF, all written in main (`fleet-export.ts` builds the text, `fleet-export-ops.ts` owns the dialogs and files).
CSVs are UTF-8 with a BOM, CRLF, RFC 4180 quoted, amounts in decimal major units (JPY has none). The PDF page is
script-less with an inline-SVG chart and goes through the same hidden-window port as the invoice. The Projections
results header gets an Export CSV / PDF pair, and Runway gets Export CSV beside the horizon switch; a cancelled dialog
shows nothing and a failure shows inline. `formatMoney` moved to `packages/shared` (`startup-format-money.ts`) so the PDF
can use it; the renderer path re-exports it. The Phase 150-era ticks on the service handlers and tests were false (the
ops still returned "not available") and are now real.

**Theme F — Energy switch and Phase 150 polish.** ◻ "Scale energy with utilisation" in Global controls. Duplicate
selects the copy, and list rows become individually focusable.

**Theme G — Verification.** ◻ Vitest to the minor unit for the migration, model, line generation and CSV. One
functional e2e for send → edit → stale → update.

## Build order

1. **A** — every other theme reads its types. First commit: `shared` schemas only, pushed at once.
2. **B ‖ C** — B is pure renderer maths, C is the settings page plus the dropdowns. Disjoint files.
3. **D ‖ E** — D owns `shared` op additions for the bridge plus `main/fleet-runway.ts` and the Runway/Projections
   UI; E owns `main/fleet-export.ts` plus the export buttons. The one shared file, `startup.ts`'s op union, goes in A
   (all ops declared up front) so D and E never edit it.
4. **F**, then **G**.

## Data model (normative)

```ts
// packages/shared/src/startup-fleet.ts — v3 shapes (replace the Phase 150 ones)
export const DEFAULT_MONEY_CURRENCY = 'USD';

export const FleetHardwareSchema = z.object({
  id: z.string().min(1).max(40),            // built-ins keep their Phase 150 ids ('dual-4090', …); new ones are uuids
  label: z.string().trim().min(1).max(60),
  priceMinor: z.int().min(0),
  watts: z.int().min(0).max(100_000),
  builtIn: z.boolean(),
  hidden: z.boolean().default(false),       // hidden = not offered in dropdowns; still resolves for existing nodes
});
export const FleetApiTierSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  monthlyMinor: z.int().min(0),
  builtIn: z.boolean(),
  hidden: z.boolean().default(false),
});
export const FleetCatalogSchema = z.object({
  hardware: z.array(FleetHardwareSchema).max(100),
  apiTiers: z.array(FleetApiTierSchema).max(50),
});

/** Built-ins in MAJOR units; seeded into minor units with `minorExponent(currency)` (illustrative list prices). */
export const BUILT_IN_HARDWARE = [
  { id: 'rtx-4090-ws', label: 'RTX 4090 workstation', price: 3_600,  watts: 650 },
  { id: 'dual-4090',   label: 'Dual RTX 4090 server', price: 6_500,  watts: 1_200 },
  { id: 'l40s-node',   label: 'L40S node',            price: 12_000, watts: 900 },
  { id: 'a100-node',   label: 'A100 80GB node',       price: 25_000, watts: 2_000 },
  { id: 'mac-studio',  label: 'Mac Studio (M-Ultra)', price: 5_000,  watts: 300 },
  { id: 'cpu-1u',      label: '1U CPU server',        price: 2_000,  watts: 350 },
] as const;
export const BUILT_IN_API_TIERS = [
  { id: 'none', label: 'None', monthly: 0 }, { id: 'starter', label: 'Starter', monthly: 99 },
  { id: 'pro', label: 'Pro', monthly: 499 }, { id: 'enterprise', label: 'Enterprise', monthly: 1_999 },
] as const;
export function seedFleetCatalog(currency: string): FleetCatalog;      // builtIn: true, hidden: false
export function moneyCurrency(company: { currency: string } | null): string;   // company?.currency ?? 'USD'

// FleetNodeConfigSchema: hardwareId: z.string().min(1).max(40); apiTierId: z.string().min(1).max(40);
//                        pricePerHourMinor (was pricePerHourCents), same bounds
// FleetGlobalsSchema:    electricityRateMinor (was electricityRateCents), same bounds;
//                        energyScalesWithUtilisation: z.boolean().default(false)
// DEFAULT_FLEET_GLOBALS: { scalePct: 100, electricityRateMinor: 15, demandGrowthPct: 0, horizonMonths: 24, energyScalesWithUtilisation: false }
//                        (15 = $0.15/kWh in a 2-decimal currency; scale by minorExponent like the seed)
// DEFAULT_FLEET_TEMPLATE: pricePerHourMinor 150 ($1.50/h)

// packages/shared/src/startup.ts — v3
// STARTUP_WORKSPACE_VERSION = 3
// StartupWorkspaceSchema gains: fleetCatalog: FleetCatalogSchema.nullable().default(null)   // null → seeded on first read in main
// PlanLineSchema gains:
//   source: z.object({ kind: z.literal('fleetProjection'), projectionId: z.uuid(),
//                      part: z.enum(['capex', 'opex', 'revenue', 'revenue-capped']),
//                      syncedAt: z.iso.datetime() }).optional()
```

**v2 → v3 migration** (`migrateWorkspace`, after the existing v1 → v2 step, same style): rename every projection's
`globals.electricityRateCents` → `electricityRateMinor` and every node/template `pricePerHourCents` →
`pricePerHourMinor`, keeping the numbers; set `energyScalesWithUtilisation: false`; leave `fleetCatalog: null`;
set `version: 3`. **Numbers are not converted:** no release carried v2 (checked 2026-11-18: no tag contains
`4608b3660`), so the only v2 files are dev ones.

**Formulas changed from Phase 150** (`computeFleetProjection(p, catalog)`):

| Figure | Change |
|---|---|
| Hardware / tier lookup | From `catalog` by id, hidden entries included. An id missing from the catalog contributes **0** and adds the node id to `result.missing: string[]`. |
| Energy / month | `watts × 730 / 1000 × electricityRateMinor × q × (energyScalesWithUtilisation ? u(m) : 1)`. With the switch on, energy varies by month, so `series[m].energy` is per month and `energyMonthlyMinor` is month 0. |
| Field names | Every `…Cents` in `FleetProjectionResult` becomes `…Minor`. |

## Deliverables

### A — Workspace v3 and the money currency (M)

- [x] **First commit, alone:** `startup-fleet.ts` reshaped as in **Data model** (catalog schemas, `BUILT_IN_*`,
  `seedFleetCatalog`, `moneyCurrency`, renamed fields, energy switch). `HARDWARE_CATALOG`, `API_TIERS`,
  `HARDWARE_IDS`, `API_TIER_IDS`, `hardwareById` and `apiTierById` are **deleted**, and their importers move to the
  catalog. Push the commit immediately.
  - `seedFleetCatalog` multiplies major units by `10 ** minorExponent(currency)`. Move `minorExponent` from
    `renderer/money-input.ts` into `shared/src/startup-fleet.ts` (or a new `shared/src/money-exponent.ts`) and
    re-export it from `money-input.ts`, so both halves share one table.
- [x] `startup.ts`: version 3, `fleetCatalog`, `PlanLineSchema.source`, and **all** of this phase's new ops declared
  now (D and E only implement them):
  - `upsertFleetCatalog { catalog }`
  - `sendFleetProjectionToRunway { projectionId, start: YearMonthSchema }`
  - `unlinkFleetProjectionLines { projectionId, removeLines: z.boolean() }`
  - `exportFleetProjectionCsv { projectionId }`
  - `exportRunwayCsv { scenarioId: id, months: 12 | 24 | 36 }`
  - `exportFleetProjectionPdf { projectionId }`
  - Bridge type lines are added to `shared/src/ipc/bridge.ts`, and bridge methods to `main/bridge.ts`. Unimplemented
    handlers return `fail('invalid', NOT_YET)`, the existing `service.ts:33` constant.
- [x] `migrateWorkspace`: the v2 → v3 step as specified. `get` in `service.ts` seeds the catalog when
  `fleetCatalog === null`, through one `store.mutate` using `seedFleetCatalog(moneyCurrency(ws.company))`, so every
  later read has one.
- [x] Tests:
  - `workspace-store.test.ts`: a v2 file with one projection migrates to v3. The renamed fields keep their values,
    `energyScalesWithUtilisation` is false, and `fleetCatalog` is null. A v1 file goes all the way to v3. v4 opens
    read-only.
  - `startup-fleet.test.ts`: `seedFleetCatalog('USD')` gives a dual-4090 price of `650_000` and
    `seedFleetCatalog('JPY')` gives `6_500`; `moneyCurrency(null)` is `'USD'`.
  - `service.test.ts`: the first `get` seeds exactly once.

### B — Model and money formatting (S)

- [x] `renderer/projections/format-money.ts` (net-new) replaces `format-zar.ts` (deleted, along with its test, which
  is ported):
  - `formatMoney(minor: number, currency: string, opts?: { decimals?: 0 | 2 }): string`
  - `formatCompactMoney(minor: number, currency: string): string`
  - Symbol table: `USD '$'`, `EUR '€'`, `GBP '£'`, `ZAR 'R '`, `JPY '¥'`, anything else `'<CODE> '`.
  - The exponent comes from the shared `minorExponent`. Sign, grouping, rounding and `NaN` → `—` follow Phase 150's
    `formatZar` exactly, still with no `Intl`.
- [x] `computeFleetProjection(p, catalog)` per the changed formulas, with `missing: string[]`. Callers pass the
  workspace catalog.
- [x] Every `formatZar` / `formatCompactZar` call site in `renderer/projections/**` moves to `formatMoney(…,
  currency)`, with `currency = moneyCurrency(workspace.company)` threaded from `ProjectionsView` as a prop.
  - Accept: `grep -r "formatZar\|Zar\b" packages/modules/startup/renderer` finds nothing.
- [x] Tests:
  - `format-money.test.ts`: `USD 150_000 → '$1,500'`, `ZAR 1_500_000 → 'R 15,000'`, `JPY 6_500 → '¥6,500'`,
    `CHF 100 → 'CHF 1'`, negatives use U+2212, and output is identical under `LANG=de_DE.UTF-8` with `Intl` stubbed to
    throw.
  - `fleet-model.test.ts`: Phase 150's fixture re-priced in USD minor units, checked to the unit. The energy switch
    at 70 % utilisation gives energy × 0.7. A missing hardware id gives zero for that node and `missing: [id]`.

### C — Editable catalog (M)

- [x] `renderer/settings/catalog-settings.tsx` (net-new), added to `STARTUP_SETTINGS` as `{ id: 'app:startup-catalog',
  label: 'Catalog', group: 'general', scope: 'app', icon: LuServer }`.
  - Two tables, Hardware and API tiers. Each row has: label, price (a text input parsed with `toMinor(text,
    currency)`), watts (hardware only), a Hidden switch, and Delete (custom rows only; built-ins can only be hidden).
  - An **Add hardware** / **Add API tier** button appends a row with `id: crypto.randomUUID()` and `builtIn: false`.
  - **Restore defaults** (confirm via `STARTUP_CHROME.useDialogs().confirm`) resets built-ins to the seed and keeps
    custom rows.
  - Saves go through `upsertFleetCatalog`, debounced 400 ms like `use-fleet-draft`. Errors show inline as
    `role="alert"`.
  - Delete is refused inline ("In use by N nodes — hide it instead.") when any projection's node or template uses
    the id; `main` enforces the same rule with `fail('in-use', …)`.
- [x] `service.ts` `upsertFleetCatalog`:
  - Validates the schema.
  - Refuses a removed id that is still referenced (`in-use`).
  - Refuses duplicate ids (`invalid`).
- [x] Dropdowns in `controls-panel.tsx` and `node-card.tsx` (`TemplateSelects`) list catalog entries where
  `hidden === false`, **plus** the currently selected id even when it is hidden (labelled `<label> (hidden)`). A
  missing id renders as `Missing (<id>)`. Option labels use `formatMoney` / `formatCompactMoney`.
- [x] The footer copy becomes "Illustrative list prices — edit them in Settings ▸ Catalog."
- [x] Tests: `catalog-settings.test.tsx` covers adding, hiding, deleting a custom row, the delete refusal when in
  use, restore-defaults confirm, and a JPY workspace parsing `6500` to `6_500`. `service.test.ts` covers
  `upsertFleetCatalog`'s `in-use` and duplicate-id refusals.

### D — Send to Runway (L)

- [x] `packages/modules/startup/main/fleet-runway.ts` (net-new, pure) exports
  `fleetToRunwayLines(p: FleetProjection, catalog: FleetCatalog, start: YearMonth, now: string, ids: () => string):
  PlanLine[]`. Every line carries `source: { kind: 'fleetProjection', projectionId: p.id, part, syncedAt: now }`.
  - **capex**: `kind: 'cost'`, `category: 'hardware'`, `cadence: 'one-off'`, `minor = round(capexMinor)`, `start`,
    name `"<projection name> — hardware"`.
  - **opex**: `kind: 'cost'`, `category: 'other'`, `cadence: 'monthly'`, `minor = round(month-0 OpEx)`, `start`,
    name `"<name> — running costs"`.
    - With the energy switch on, OpEx varies by month. The line takes month 0's value with `growthBpPerMonth`
      derived from the energy growth, using the same cap split as revenue below.
  - **revenue**: `kind: 'revenue'`, `category: 'revenue'`, `cadence: 'monthly'`, `minor = round(month-0 revenue)`,
    `growthBpPerMonth = demandGrowthPct × 100`, `start`.
    - If utilisation reaches 100 % at month `c < horizonMonths`, this line gets `end = start + c − 1` and a
      **revenue-capped** line follows with `start = start + c`, `minor = round(revenue at the cap)` and growth 0.
    - Negative growth never caps, so it is a single line.
  - Lines whose `minor` is 0 are omitted, except that capex is always written.
- [x] `service.ts` `sendFleetProjectionToRunway`: one `store.mutate` that removes every line whose
  `source.projectionId` matches, then appends `fleetToRunwayLines(…)`. This makes send and update the same op.
  - Errors: unknown projection → `not-found`.
  - No company → `fail('invalid', 'Set up your company first — Runway needs it.')`.
  - Lines land in the **base** plan (`ws.lines`), not a scenario.
- [x] `service.ts` `unlinkFleetProjectionLines { removeLines }`: `true` deletes the linked lines; `false` strips
  `source` so they become ordinary lines.
- [x] Projections UI:
  - **Send to Runway** in the results header (`LuSend`). It opens a dialog (the module's sheet pattern, like
    `line-sheet.tsx`) with a `<input type="month">` defaulting to next month and the list of lines it will create
    (from `fleetToRunwayLines`, previewed in the renderer by importing the pure function through a renderer re-export).
  - Once linked, the button reads **Update Runway** and the header shows `Linked to Runway · synced <date>`.
  - When `projection.updatedAt > min(line.source.syncedAt)`, the header shows a **Stale** amber pill instead.
  - Disabled with reason "Set up your company first" when `company === null`.
- [x] Runway UI: linked lines show a small `From <projection name>` badge (`LuChartArea`) and a Stale pill when out
  of date. Clicking the badge navigates to `startup.projections` with that projection selected (through
  `onView` + `useProjectionsUi.setSelected`). Editing a linked line in `line-sheet.tsx` shows the note "Editing
  unlinks this line from its projection." and saves without `source`.
- [x] Deleting a projection that has linked lines: the existing confirm gains a choice, "Also remove its N Runway
  lines" (default on). The handler calls `unlinkFleetProjectionLines` before `removeFleetProjection`.
- [x] Tests:
  - `fleet-runway.test.ts` checks to the minor unit:
    - The basic 3-line case.
    - The cap split: 70 % utilisation and +10 %/mo caps at month 4 → revenue `end` = start+3, then capped revenue
      from start+4.
    - Negative growth gives one line.
    - Zero OpEx is omitted.
    - The energy switch.
  - `service.test.ts`: send twice leaves exactly one set of lines; unlink with and without removal; no company →
    `invalid`.

### E — Export (M)

- [x] `packages/modules/startup/main/fleet-export.ts` (net-new):
  - `fleetProjectionCsv(p, result, currency): string` — two sections separated by a blank line.
    - `month,energy,api,opex,revenue,net,cumulative`, with amounts as **decimal major units** (`(minor / 10**exp).toFixed(exp)`).
    - Then `node,hardware,api tier,quantity,utilisation %,price per hour,capex,opex,net`.
    - RFC 4180 quoting (double quotes around fields containing `,`, `"` or newline, with quotes doubled). Lines end
      in `\r\n`, and the file is UTF-8 with a BOM so Excel opens it.
  - `runwayCsv(projection: RunwayProjection, currency): string` — `month,revenue,costs,net,cash`.
  - `renderFleetProjectionHtml(p, result, currency, company): string` — one A4-landscape page:
    - Header with the projection name and date.
    - The six KPIs.
    - An inline **SVG** chart: monthly stacked areas on a left scale and a cumulative line on a right scale, drawn
      with plain `<path>`s; Recharts is renderer-only.
    - The node table.
    - Self-contained styles, no external requests, no scripts (the hidden print window is script-less).
- [x] `service.ts` handlers:
  - `exportFleetProjectionCsv` / `exportRunwayCsv` write through a new `StartupServiceDeps.csv?: { saveCsv:
    (defaultName) => Promise<string | null> }`, wired in `apps/startup/main/host.ts` from the existing
    `StartupHostElectron.saveCsv`.
  - `exportFleetProjectionPdf` mirrors `exportInvoicePdf` (temp dir, `port.printToPdf`, cleanup in `finally`).
  - All three return `StartupResult<{ saved: boolean }>`; a cancelled dialog is `{ saved: false }`.
  - Default names: `<projection name>.csv`, `runway-<YYYY-MM>.csv`, `<projection name>.pdf`, sanitised to
    `[\w .-]`.
- [x] Buttons:
  - Projections results header: an **Export** pair, CSV (`LuFileSpreadsheet`) and PDF (`LuFileDown`), as
    `STARTUP_CHROME.IconButton`s.
  - Runway view: **Export CSV** beside the horizon switch.
  - A failure shows inline as `role="alert"`; success shows nothing (the file is where the user chose).
- [x] Tests: `fleet-export.test.ts` covers a CSV snapshot for the B fixture (USD), quoting of a node named
  `Node, "A"`, the BOM and `\r\n`, JPY with no decimals, and the HTML containing no `<script` and no `http`.
  `service.test.ts` covers export with a stub port: cancel gives `saved: false`, and the temp dir is removed on
  both success and failure.

### F — Energy switch and Phase 150 polish (S)

- [ ] `controls-panel.tsx` Global group gets a `role="switch"` labelled "Scale energy with utilisation", wired to
  `globals.energyScalesWithUtilisation` through `update`.
- [ ] `projection-list.tsx`:
  - Duplicate selects the new copy once the snapshot returns it. Find it by id from the op's returned snapshot, as
    the copy directly after the source.
  - Rows use a roving tabindex: the selected row is `tabIndex=0` and the others `-1`. Up/Down still move, Tab leaves
    the list, and each row's action buttons are reachable with Tab from that row.
- [x] Tests: `controls-panel.test.tsx` checks the switch toggles the field; `projection-list.test.tsx` checks
  duplicate selects the copy and that only one row has `tabIndex=0`.

### G — Verification (M)

- [ ] Fixtures:
  - `renderer/projections/test-fixtures.ts` gains `fleetCatalog()` (`seedFleetCatalog('USD')`).
  - `packages/app/test-support/suite-bridge.ts` `STARTUP_BASE` moves to `version: 3` with `fleetCatalog: null`.
  - `STARTUP_FLEET_ANSWERS` gets a company in USD, so Send is enabled.
- [ ] Functional e2e: `packages/app/e2e/suite-shell/startup-projections.spec.ts` gains one test, with a header
  comment naming the browser need (a multi-view flow).
  - Send the GPU-cluster projection to Runway → Runway shows the linked lines with `From GPU cluster` badges.
  - Change Scale in Projections → both views show **Stale**.
  - Update Runway → Stale clears.
  - The suite-bridge stub must answer the new ops; extend `installSuiteBridge`'s answer map rather than special-casing.
- [ ] The existing Startup specs and vitest suites stay green: `startup.spec.ts`, `startup-projections.spec.ts`, and
  the module, shared and `apps/startup` suites.

## Files this phase touches

| File | Theme | Kind |
|---|---|---|
| [`packages/shared/src/startup-fleet.ts`](../../../packages/shared/src/startup-fleet.ts) (+ test) | A | edited (catalog, renames, switch) |
| [`packages/shared/src/startup.ts`](../../../packages/shared/src/startup.ts), [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | A | edited (v3, `source`, 6 ops) |
| [`main/workspace-store.ts`](../../../packages/modules/startup/main/workspace-store.ts), [`main/service.ts`](../../../packages/modules/startup/main/service.ts), [`main/bridge.ts`](../../../packages/modules/startup/main/bridge.ts) (+ tests) | A, C, D, E | edited |
| [`renderer/money-input.ts`](../../../packages/modules/startup/renderer/money-input.ts) | A | edited (re-exports shared `minorExponent`) |
| `renderer/projections/format-money.ts` (+ test); `format-zar.ts` (+ test) | B | net-new; **deleted** |
| [`renderer/projections/fleet-model.ts`](../../../packages/modules/startup/renderer/projections/fleet-model.ts) and every projections view | B, C, D, E, F | edited |
| `renderer/settings/catalog-settings.tsx` (+ test), [`startup-settings.tsx`](../../../packages/modules/startup/renderer/startup-settings.tsx) | C | net-new; edited |
| `main/fleet-runway.ts` (+ test) | D | net-new |
| [`renderer/runway/runway-view.tsx`](../../../packages/modules/startup/renderer/runway/runway-view.tsx), [`line-sheet.tsx`](../../../packages/modules/startup/renderer/runway/line-sheet.tsx) | D, E | edited |
| `main/fleet-export.ts` (+ test) | E | net-new |
| [`apps/startup/main/host.ts`](../../../apps/startup/main/host.ts) | E | edited (`csv` dep) |
| [`packages/app/test-support/suite-bridge.ts`](../../../packages/app/test-support/suite-bridge.ts), `e2e/suite-shell/startup-projections.spec.ts` | G | edited |
| [`main/runway.ts`](../../../packages/modules/startup/main/runway.ts) `projectRunway` | — | (**unchanged**, load-bearing: the bridge writes ordinary lines) |

## Verification

- [ ] `moon run :typecheck :lint :test` green (in CI once Actions is unlocked; until then the focused local gate per
  the billing-lock rule, named in each PR).
- [ ] A — v1 and v2 files reach v3 with values intact; the catalog seeds once, in the company currency (USD without one).
- [ ] B — the formatter is identical under a hostile locale; no `formatZar` remains; the model with the switch on matches the hand fixture.
- [ ] C — built-ins can be hidden but not deleted; a referenced custom entry cannot be deleted; a hidden entry still prices its nodes.
- [ ] D — send is idempotent; the cap split lands in the right months; editing a linked line unlinks it; Stale appears and clears.
- [ ] E — the CSVs open cleanly (BOM, CRLF, quoting); the PDF has no script or remote request; cancel saves nothing.
- [ ] F — the energy switch changes OpEx only when on; Duplicate selects the copy; one tab stop for the list.
- [ ] G — the send → stale → update e2e passes.
- [ ] **Open, for a human:** in a packaged build with a GBP company, edit the catalog, send a projection, open the exported CSV in Numbers/Excel and the PDF in Preview.

## Not in this phase

- **Currency conversion / FX rates.** A workspace has one money currency; converting needs a rate source and a date.
- **Live or fetched hardware prices.** No network dependency in a local-first app.
- **Sending into a Runway scenario** rather than the base plan. Scenarios are capped at 3 and multiply lines; base-plan lines keep the bridge simple.
- **MCP tools and the investor update.** These are Phase 153 (Startup for agents).
- **Two-way sync** (editing Runway lines back into a projection). Editing a line unlinks it.
- **Animated chart transitions.** Still off, as Phase 150 decided.

## Decisions / open questions

1. **Resolved — money follows the company currency, USD before a company exists**, replacing Phase 150's fixed
   ZAR (user decision 2026-11-18). This removes the currency clash with Runway by construction.
2. **Resolved — no conversion of existing projections.** No release carried workspace v2, so renamed fields keep
   their numbers.
3. **Resolved — linked, re-syncable lines in the base plan**, tagged by `source.projectionId`. Send and Update are
   one idempotent op.
4. **Resolved — revenue that caps within the horizon becomes two lines**, growing then flat, because Runway's
   `growthBpPerMonth` compounds without a ceiling.
5. **Resolved — workspace catalog with built-in defaults**, editable in Settings ▸ Catalog. Built-ins can be hidden,
   not deleted. A referenced entry cannot be deleted.
6. **Resolved — energy switch defaults to full draw**, so existing numbers do not move.
7. **Resolved — CSV and PDF are written in main** through the host's existing `saveCsv` and `InvoicePdfPort`; the
   PDF chart is plain SVG.
8. **Resolved — all six new ops are declared in Theme A**, so the parallel themes D and E never edit the op union.
