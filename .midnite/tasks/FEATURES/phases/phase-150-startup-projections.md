# Phase 150 — Startup projections

**Refined: x1** · 2026-11-17 · UI/UX, visual design & theming, accessibility, empty/loading/error states, functionality & edge cases, data model & contract, persistence & migration, concurrency, testing & verification, performance, security & blast radius, observability, sequencing, file-map precision, per-item acceptance criteria, out-of-scope tightening

Planned 2026-11-17 · grounded against `main` at `117a664dc`.

A new first view in the **Startup** app, **Projections**: a dense, all-controls-visible model of a compute-node
fleet (hardware, API tiers, power, pricing), showing CapEx, monthly OpEx, revenue, net margin and payback as you
move the sliders. Each projection is a saved, named model; the left pane lists them, the centre shows the results
and the right pane holds the controls.

> **Builds on.**
> - **Phase 130 (Startup app)** — [`phase-130-startup.md`](phase-130-startup.md). The frame, rail, module, workspace
>   store and IPC channel already exist:
>   - [`startup-nav.ts`](../../../packages/modules/startup/renderer/startup-nav.ts) (`STARTUP_NAV_GROUP.views`),
>     [`startup-manifest.ts`](../../../packages/modules/startup/renderer/startup-manifest.ts) (`home: 'startup.overview'`),
>     [`views/startup-home.tsx`](../../../packages/modules/startup/renderer/views/startup-home.tsx) (`TITLES` `:9-15`,
>     loading `:29`, error `:30-37`, **company gate** `:40-46`, view switch `:47-56`; `readOnly` is shown only as a banner
>     on Overview `:53` and passed to no view).
>   - [`shared/src/startup.ts`](../../../packages/shared/src/startup.ts) — `STARTUP_WORKSPACE_VERSION = 1` `:162`,
>     `StartupWorkspaceSchema` `:175-187` (`version: z.literal(STARTUP_WORKSPACE_VERSION)`, every field `.default(...)`),
>     `StartupRequestSchema` `:214` (a `z.discriminatedUnion('op', …)`; `const id = z.uuid()` `:213`),
>     `STARTUP_RESULT_KINDS` `:243`. Re-exported by the barrel `shared/src/index.ts:142`.
>     **`projection` is already an op** (`:223`, Runway's month-by-month projection) — hence the `fleet` prefix below.
>   - [`main/workspace-store.ts`](../../../packages/modules/startup/main/workspace-store.ts) — `migrateWorkspace(raw)`
>     `:30-37` (no per-version chain: a version above current → `newer-version`; anything failing the schema →
>     `corrupt`), `openWorkspaceStore(options)` `:66`, `WorkspaceStore.mutate(change)` `:109-127` (one promise queue,
>     temp + rename, `newer-version` refusal when read-only).
>   - [`main/service.ts`](../../../packages/modules/startup/main/service.ts) — `handleStartupRequest(store, request,
>     deps)` `:72` (`switch (request.op)`), helpers `fail(kind, message)` `:23`, `done(ws)` `:24`, `upsert(items, item)`
>     `:26`, the `MAX_SCENARIOS` guard in `upsertScenario` `:117-122` (the pattern to copy), `deps.now?.() ?? new Date()`.
>   - [`main/bridge.ts`](../../../packages/modules/startup/main/bridge.ts) — `op('<name>')` factory `:22-25`; the
>     bridge **type** lives in [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) `:2414-2441`
>     (`startup?: { … }`, one line per op).
>   - [`renderer/data/use-startup.ts`](../../../packages/modules/startup/renderer/data/use-startup.ts) —
>     `useStartupSnapshot()` `:33`, `useStartupWrite(run)` `:47` (a `useMutation` that invalidates `STARTUP_KEY` on
>     success), `StartupError`, `unwrap`.
>   - Errors surface **inline**: a local `problem` state + `<p role="alert" className="text-xs text-red-500">`
>     ([`runway-view.tsx:64,118-121`](../../../packages/modules/startup/renderer/runway/runway-view.tsx)). No toasts.
>   - Chrome: [`compose/startup-chrome.tsx`](../../../packages/modules/startup/renderer/compose/startup-chrome.tsx) —
>     `STARTUP_CHROME.IconButton` (its `label` is the aria name **and** tooltip; there is no standalone `Tooltip`),
>     `STARTUP_CHROME.useDialogs().confirm({ title, body, confirmLabel, danger, onConfirm })` (see
>     [`invoice-sheet.tsx:54,123-129`](../../../packages/modules/startup/renderer/invoices/invoice-sheet.tsx)).
>   - Local UI prefs: [`roadmap/use-roadmap-ui.ts`](../../../packages/modules/startup/renderer/roadmap/use-roadmap-ui.ts)
>     — plain zustand `create` + hand-rolled `localStorage` in `try/catch` (**not** the `persist` middleware).
> - **Resizable panes** — the frame's [`useResizable`](../../../packages/frame/src/layout/resizable/use-resizable.ts)
>   (`{ size, onSize, min, max, initial, axis, edge?, onCollapse?, onExpand? }` → `{ current, dragging, snap,
>   handleProps }`; `onSize` fires on pointer-up; arrows step 8, Shift+arrows 64, double-click restores `initial`) +
>   [`ResizeHandle`](../../../packages/frame/src/layout/resizable/resize-handle.tsx) (`{ resizable, axis, label }`).
>   Crib: [`tasks-view.tsx:166-176,772-784`](../../../packages/features/tasks/renderer/tasks-view.tsx).
> - **Frame bits** — `EmptyState({ icon?, title, body?, action? })`, `EmptyStateButton({ icon?, label, onClick,
>   disabled? })`, `Skeleton({ className? })` from `@midnite/studio-frame`.
> - **Tailwind** — [`apps/startup/tailwind.config.ts`](../../../apps/startup/tailwind.config.ts) uses
>   `frameContent(__dirname, ['ledger'], ['startup', 'accountant'])`, which scans `packages/modules/startup/renderer/**`.
>   [`packages/app/tailwind.config.ts`](../../../packages/app/tailwind.config.ts) (Studio) does **not** scan
>   `packages/modules/**`. Tokens available: `border`, `background`, `foreground`, `primary`, `muted(-foreground)`,
>   `accent`, `card`, `destructive`, `success`; the default Tailwind palette is not overridden; `darkMode: ['class']`.
> - **E2E harness** — [`packages/app/e2e/suite-shell/startup.spec.ts`](../../../packages/app/e2e/suite-shell/startup.spec.ts)
>   (`installSuiteBridge(page, { frameless: true, answers })`, `SUITE_APP_URLS.startup`, `STARTUP_SEEDED_ANSWERS` from
>   [`test-support/suite-bridge`](../../../packages/app/test-support/)).
> - **The source spec** — a user-supplied "single-pane-of-glass" dashboard brief (dense, glassmorphism, indigo → purple →
>   pink gradient accent, ZAR `R ` currency, no tabs/accordions, KPIs most prominent). It asked for Lucide icons and one
>   single-file component; this repo uses `react-icons` only (eslint bans `lucide-react`) and splits by file.

> **Scope guardrails.** Projections stands alone: it does not read Runway lines, the linked book or invoices, and nothing
> else reads it. Catalogs (hardware, API tiers) are constants in `shared`, not user-editable. Currency is always ZAR,
> printed `R 15,000`; never `$`, never the company currency. No export, no sharing, no MCP tools. The three panes are
> resizable but **never collapse**, and nothing in the view hides behind tabs, accordions, popovers or menus (a
> confirm dialog for destructive actions is the one exception).

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_Price out a compute fleet on one screen._ Pick hardware and an API tier, set the power price, utilisation and
GPU-hour rate, spawn nodes, and the CapEx, monthly OpEx, net margin and payback update as you drag. Projections are
saved in the Startup workspace, so several variants can sit side by side in the list, each showing its net margin.
Planned 2026-11-17; refined x1 the same day. Build order: **wave 1 = A ‖ B** (B stacks on A's first commit),
**wave 2 = C + D + E + F** in one PR.

**Theme A — Contract and store.** ✅ `shared/src/startup-fleet.ts` (schemas, catalogs, starters) landed first; the workspace is at schema v2 with `fleetProjections` and an explicit v1 → v2 step in `migrateWorkspace`; `upsertFleetProjection`, `removeFleetProjection` and `duplicateFleetProjection` run through the write queue, bridge and bridge type, with tests.

**Theme B — Projection model and ZAR formatting.** ✅ Pure `computeFleetProjection` and `formatZar` / `formatCompactZar` landed with the hand-worked fixture checked to the cent and `Intl`-free output proven under `de_DE`.

**Theme C — Projections view frame and list.** ✅ `startup.projections` is first in the rail and the home view, rendered before the company gate; three resizable, never-collapsing panes with persisted widths and selection, a draft hook (draft wins while dirty, 400 ms debounced save), the list with create, rename, duplicate and confirmed delete, and Studio's Tailwind scanning module renderers. The view is lazy-loaded to keep the entry chunk small.

**Theme D — Controls panel.** ✅ Global and Master template groups of clamped, snapping `SliderField`s, the horizon radio group, Spawn node and a confirmed Apply template to all.

**Theme E — Results panel.** ✅ Six KPI tiles (Net margin largest), a lazy Recharts 3 `ComposedChart` with animation off, and a node card grid with overrides, an override dot and per-node figures.

**Theme F — Verification.** ✅ Vitest per component and hook, a Recharts jsdom mock, the `STARTUP_FLEET_ANSWERS` fixture and `startup-projections.spec.ts` (pane clamps, real SVG chart, keyboard Scale).

## Build order

The fleet runs with **at most 2 agents**.

1. **Wave 1, in parallel.**
   - **Agent 1 — Theme A**, branch `feature/phase-150-a-fleet-contract`. Its **first commit is only**
     `packages/shared/src/startup-fleet.ts` + the barrel line, verbatim from **Data model**, pushed at once.
   - **Agent 2 — Theme B**, branch `feature/phase-150-b-fleet-model`, **created from agent 1's first commit**
     (`git fetch && git switch -c feature/phase-150-b-fleet-model origin/feature/phase-150-a-fleet-contract`
     once that commit is on the remote), so it can import the types. It touches only
     `packages/modules/startup/renderer/projections/{fleet-model,format-zar}.ts` and their tests, so the two
     branches never edit the same file. Its PR targets A's branch until A merges, then is retargeted to `main`
     (`gh pr edit <n> --base main` after rebasing).
   - Merge order: A, then B.
2. **Wave 2, one agent — Themes C + D + E + F**, branch `feature/phase-150-cdef-projections-view`, from `main`
   after A and B merge. One PR, because C, D and E all edit `projections-view.tsx`.
3. A partial landing is safe: after wave 1 the data exists and nothing renders it; the nav entry only appears in
   wave 2.

## Data model (normative — Themes A and B implement exactly this)

All money is **integer cents (ZAR)**. Percentages are integers. Rates use integer cents too (R 3.20/kWh = `320`).

```ts
// packages/shared/src/startup-fleet.ts  (net-new; zod only, imports nothing from the workspace)
import { z } from 'zod';

export const HARDWARE_CATALOG = [
  { id: 'rtx-4090-ws', label: 'RTX 4090 workstation', priceCents: 6_500_000,  watts: 650 },
  { id: 'dual-4090',   label: 'Dual RTX 4090 server', priceCents: 12_000_000, watts: 1_200 },
  { id: 'l40s-node',   label: 'L40S node',            priceCents: 22_000_000, watts: 900 },
  { id: 'a100-node',   label: 'A100 80GB node',       priceCents: 45_000_000, watts: 2_000 },
  { id: 'mac-studio',  label: 'Mac Studio (M-Ultra)', priceCents: 9_500_000,  watts: 300 },
  { id: 'cpu-1u',      label: '1U CPU server',        priceCents: 3_500_000,  watts: 350 },
] as const;
export const API_TIERS = [
  { id: 'none',       label: 'None',       monthlyCents: 0 },
  { id: 'starter',    label: 'Starter',    monthlyCents: 150_000 },
  { id: 'pro',        label: 'Pro',        monthlyCents: 750_000 },
  { id: 'enterprise', label: 'Enterprise', monthlyCents: 3_000_000 },
] as const;
export const HARDWARE_IDS = ['rtx-4090-ws', 'dual-4090', 'l40s-node', 'a100-node', 'mac-studio', 'cpu-1u'] as const;
export const API_TIER_IDS = ['none', 'starter', 'pro', 'enterprise'] as const;
// a type-level assertion (or a test) pins HARDWARE_IDS / API_TIER_IDS equal to the catalogs' ids
export type HardwareId = (typeof HARDWARE_IDS)[number];
export type ApiTierId = (typeof API_TIER_IDS)[number];
export const hardwareById = (id: HardwareId) => HARDWARE_CATALOG.find((h) => h.id === id)!;
export const apiTierById = (id: ApiTierId) => API_TIERS.find((t) => t.id === id)!;

export const HOURS_PER_MONTH = 730;
export const MAX_FLEET_PROJECTIONS = 50;
export const MAX_FLEET_NODES = 200;

export const FleetNodeConfigSchema = z.object({
  hardwareId: z.enum(HARDWARE_IDS),
  apiTierId: z.enum(API_TIER_IDS),
  quantity: z.int().min(1).max(64),
  utilisationPct: z.int().min(0).max(100),
  pricePerHourCents: z.int().min(0).max(1_000_000),   // R 0 – R 10,000 per GPU-hour
});
export const FleetNodeSchema = FleetNodeConfigSchema.extend({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  enabled: z.boolean(),
});
export const FleetGlobalsSchema = z.object({
  scalePct: z.int().min(10).max(500),                 // multiplies quantity in the maths only
  electricityRateCents: z.int().min(0).max(10_000),   // per kWh, R 0 – R 100
  demandGrowthPct: z.int().min(-20).max(50),          // monthly, compounding on utilisation, capped 0–100 %
  horizonMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]),
});
export const FleetProjectionSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  createdAt: z.iso.datetime(),                         // as ledger.ts:105 does
  updatedAt: z.iso.datetime(),
  globals: FleetGlobalsSchema,
  template: FleetNodeConfigSchema,                     // what "Spawn node" copies
  nodes: z.array(FleetNodeSchema).max(MAX_FLEET_NODES),
});
export type FleetNodeConfig = z.infer<typeof FleetNodeConfigSchema>;
export type FleetNode = z.infer<typeof FleetNodeSchema>;
export type FleetGlobals = z.infer<typeof FleetGlobalsSchema>;
export type FleetProjection = z.infer<typeof FleetProjectionSchema>;

export const DEFAULT_FLEET_GLOBALS: FleetGlobals = { scalePct: 100, electricityRateCents: 320, demandGrowthPct: 0, horizonMonths: 24 };
export const DEFAULT_FLEET_TEMPLATE: FleetNodeConfig = { hardwareId: 'dual-4090', apiTierId: 'starter', quantity: 1, utilisationPct: 70, pricePerHourCents: 2_500 };

export type FleetStarterId = 'blank' | 'gpu-cluster' | 'api-only';
export const FLEET_STARTERS: readonly { id: FleetStarterId; label: string }[] = [
  { id: 'blank', label: 'Blank' }, { id: 'gpu-cluster', label: 'GPU cluster' }, { id: 'api-only', label: 'API only' },
];
/** Pure: the caller supplies ids and the clock, so tests are deterministic. */
export function buildFleetStarter(
  starter: FleetStarterId,
  ids: { projectionId: string; nodeId: () => string },
  nowIso: string,
  name: string,
): FleetProjection;
// blank       → DEFAULT_FLEET_GLOBALS, DEFAULT_FLEET_TEMPLATE, nodes: []
// gpu-cluster → template dual-4090 / pro / qty 1 / 70 % / R 25,00; 4 nodes "Node 1…4" from it, all enabled
// api-only    → template cpu-1u / enterprise / qty 1 / 50 % / R 8,00; 2 nodes "Node 1…2"
```

**Formulas** (`computeFleetProjection(p: FleetProjection): FleetProjectionResult`). Per **enabled** node,
`q = quantity × scalePct / 100` (kept fractional), `h = hardwareById`, `t = apiTierById`, `g = demandGrowthPct / 100`,
`u(m) = clamp(utilisationPct × (1 + g)^m, 0, 100) / 100` for month `m = 0 … horizonMonths − 1`:

| Figure | Formula |
|---|---|
| CapEx | Σ `h.priceCents × q` |
| Energy / month | Σ `h.watts × 730 / 1000 × electricityRateCents × q` — **full draw, independent of utilisation** (Decision 6) |
| API / month | Σ `t.monthlyCents × q` |
| OpEx / month | energy + API (constant across months) |
| Revenue (month m) | Σ `pricePerHourCents × 730 × u(m) × q` |
| Net (month m) | revenue(m) − OpEx |
| Cumulative (month m) | −CapEx + Σ₀..m net |
| Payback month | first `m` (0-based) with cumulative ≥ 0, reported as `m + 1` months; `null` if none within the horizon |
| Margin % | `revenue(0) > 0 ? net(0) / revenue(0) × 100 : null` |

```ts
export type FleetMonth = { month: number; energy: number; api: number; revenue: number; net: number; cumulative: number };
export type FleetNodeFigures = { capex: number; opex: number; revenue: number; net: number };   // month 0
export type FleetProjectionResult = {
  capexCents: number; energyMonthlyCents: number; apiMonthlyCents: number; opexMonthlyCents: number;
  revenueMonthlyCents: number; netMarginMonthlyCents: number;          // month 0
  marginPct: number | null; paybackMonths: number | null;
  series: FleetMonth[];                                                // length === horizonMonths
  perNode: Record<string, FleetNodeFigures>;                           // every node id; disabled → all 0
};
```

Values stay unrounded floats in the result; **only `formatZar` rounds** (to whole rands by default).

## Deliverables

### A — Contract and store (M)

- [x] **First commit, alone:** `packages/shared/src/startup-fleet.ts` verbatim from **Data model**, plus
  `export * from './startup-fleet';` in [`shared/src/index.ts`](../../../packages/shared/src/index.ts) after `:142`. Push it
  immediately — agent 2 branches from it.
  - `buildFleetStarter` implemented as specified; `HARDWARE_IDS`/`API_TIER_IDS` equality with the catalogs asserted in
    the test below.
  - Accept: `pnpm --filter @midnite/studio-shared typecheck` passes on that commit alone.
- [x] Workspace v2 in [`shared/src/startup.ts`](../../../packages/shared/src/startup.ts):
  `STARTUP_WORKSPACE_VERSION = 2`; `StartupWorkspaceSchema` gains
  `fleetProjections: z.array(FleetProjectionSchema).max(MAX_FLEET_PROJECTIONS).default([])` (imported from
  `./startup-fleet`).
  - Why bump although the field defaults: a v1 build reading a v2 file would strip `fleetProjections` (zod drops
    unknown keys) and write the file back without them. With v2, that build opens it read-only.
- [x] Explicit v1 → v2 step in [`migrateWorkspace`](../../../packages/modules/startup/main/workspace-store.ts) (`:30-37`):
  before `safeParse`, if `raw` is an object whose `version === 1`, parse `{ ...raw, version: 2 }` instead. Nothing else
  changes. Without this step every v1 file fails `z.literal(2)` and is renamed `workspace.corrupt-*.json` — **data loss**.
  - Update the doc comment above `migrateWorkspace` to "v1 → v2 adds `fleetProjections: []`; a version above
    current is read-only; anything failing the schema is corrupt".
  - The next write persists `version: 2` (the store writes `current`).
- [x] Three ops appended to `StartupRequestSchema` (after `ledgerSummary`):
  `z.object({ op: z.literal('upsertFleetProjection'), projection: FleetProjectionSchema })`,
  `z.object({ op: z.literal('removeFleetProjection'), id })`,
  `z.object({ op: z.literal('duplicateFleetProjection'), id, name: z.string().trim().min(1).max(80) })`.
- [x] Handlers in [`service.ts`](../../../packages/modules/startup/main/service.ts) `handleStartupRequest`, each a
  `case` returning `store.mutate((ws) => …)`, copying `upsertScenario`'s shape (`:117-122`):
  - `upsertFleetProjection`: `isNew` + `ws.fleetProjections.length >= MAX_FLEET_PROJECTIONS` →
    `fail('invalid', 'A company has at most 50 projections.')`. Sets `updatedAt = (deps.now?.() ?? new Date()).toISOString()`;
    keeps the stored `createdAt` on update (ignores the request's). Uses `upsert(...)`.
  - `removeFleetProjection`: unknown id → `fail('not-found', 'That projection no longer exists.')`.
  - `duplicateFleetProjection`: unknown id → the same `not-found`; at the cap → the same `invalid`; else appends a
    copy with `id: crypto.randomUUID()`, every node `id: crypto.randomUUID()`, the request's `name`, and `createdAt` =
    `updatedAt` = now. The copy is inserted **directly after** the source in the array.
- [x] Bridge: `upsertFleetProjection: op('upsertFleetProjection')`, `removeFleetProjection: op(...)`,
  `duplicateFleetProjection: op(...)` in [`main/bridge.ts`](../../../packages/modules/startup/main/bridge.ts), and three lines in
  the `startup?: { … }` block of [`shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) (`:2414-2441`), each
  `(req: Omit<Extract<StartupRequest, { op: '<name>' }>, 'op'>) => Promise<StartupResult<StartupSnapshot>>;`.
- [x] Tests — `packages/shared/src/startup-fleet.test.ts` (net-new):
  - `FleetProjectionSchema` rejects `quantity: 0`, `utilisationPct: 101`, `scalePct: 5`, `horizonMonths: 18`,
    an unknown `hardwareId`, a whitespace-only name, and 201 nodes.
  - Every starter parses; `gpu-cluster` has 4 enabled nodes; ids come from the supplied `nodeId()`.
  - `HARDWARE_IDS` equals `HARDWARE_CATALOG.map(h => h.id)` (and the same for API tiers).
- [x] Tests — [`service.test.ts`](../../../packages/modules/startup/main/service.test.ts) gains `describe('fleet projections')`
  (reusing `open()`, `run()`, `u(n)`): upsert inserts and sets `updatedAt` from an injected `now`; upsert of an
  existing id keeps `createdAt`; the 51st insert answers `invalid`; remove/duplicate of `u(999)` answer `not-found`;
  duplicate yields new projection and node ids, sits at source index + 1, and leaves the source unchanged.
  [`workspace-store.test.ts`](../../../packages/modules/startup/main/workspace-store.test.ts) `describe('migrateWorkspace')`
  gains: a v1 object with milestones → `ok`, `version: 2`, `fleetProjections: []`, milestones intact; `version: 3` →
  `newer-version`; `version: 2` with a bad projection → `corrupt`. [`bridge.test.ts`](../../../packages/modules/startup/main/bridge.test.ts):
  the three methods call `CHANNELS.startup` with `{ op: '<name>', … }`.

### B — Projection model and ZAR formatting (S)

- [x] `packages/modules/startup/renderer/projections/fleet-model.ts` (net-new) exports
  `computeFleetProjection(p: FleetProjection): FleetProjectionResult` and the result types exactly as **Data model**.
  - Disabled nodes contribute 0 everywhere, and still appear in `perNode` with zeros.
  - No nodes (or all disabled) → every figure 0, `marginPct: null`, `paybackMonths: null`, `series` of `horizonMonths`
    zero months (cumulative 0).
  - CapEx 0 with net ≥ 0 at month 0 → `paybackMonths: 1`.
  - Pure: no `Date`, no randomness, no rounding, no mutation of `p` (deep-freeze it in a test).
- [x] `packages/modules/startup/renderer/projections/format-zar.ts` (net-new):
  `formatZar(cents: number, opts?: { decimals?: 0 | 2 }): string` and `formatCompactZar(cents: number): string`.
  - Rounds half away from zero to the chosen decimals; groups thousands with `,` by hand (no `Intl` currency or locale
    formatting), so the output is identical under any `LANG`.
  - Negative → U+2212 before the `R`: `−R 4,200`. Zero → `R 0`. `-0` → `R 0`. `NaN`/`±Infinity` → `—`.
  - Compact: `< R 1,000` → `R 950`; `< R 1m` → `R 450k` (one decimal when < 10k: `R 4.5k`); else `R 1.2m`; same sign rule.
  - Does **not** replace Runway's `formatMinor` (`runway-types.ts:24`); that stays untouched.
- [x] Tests — `fleet-model.test.ts` (net-new), a hand-worked fixture checked to the cent: one node, dual-4090 (R 120,000,
  1,200 W), pro tier (R 7,500), qty 1, 70 %, R 25/h, scale 100 %, R 3.20/kWh, growth 0, horizon 12:
  CapEx `12_000_000`; energy `1200 × 0.73 × 320 = 280_320`; API `750_000`; OpEx `1_030_320`;
  revenue `2_500 × 730 × 0.7 = 1_277_500`; net `247_180`; payback needs 49 months → `null` at horizons 12 and 36.
  Then price R 100/h (`10_000`): revenue `5_110_000`, net `4_079_680`, cumulative M1 `−7_920_320`, M2 `−3_840_640`,
  M3 `239_040` → `paybackMonths: 3`.
  Plus: scale 200 % doubles CapEx/OpEx/revenue; growth 50 % caps `u` at 1.0 by month 1 (70 → 100); growth −20 % decays;
  a disabled node zeroes its `perNode` entry; input object unchanged (frozen).
- [x] Tests — `format-zar.test.ts` (net-new): `0 → 'R 0'`, `1_500_000 → 'R 15,000'`, `123_450 with decimals 2 →
  'R 1,234.50'`, `-420_000 → '−R 4,200'`, `150 → 'R 2'` (half away from zero), `NaN → '—'`, compact `45_000_000 →
  'R 450k'`, `120_000_000 → 'R 1.2m'`; and the same outputs with `process.env.LANG = 'de_DE.UTF-8'` and
  `Intl.NumberFormat` stubbed to throw (proves no `Intl`).

### C — Projections view frame and list (L — re-tagged from M: the draft hook, layout persistence and Studio CSS joined it)

- [x] Nav and home:
  - [`startup-nav.ts`](../../../packages/modules/startup/renderer/startup-nav.ts): `{ id: 'startup.projections', label:
    'Projections', icon: LuChartArea }` **first** in `views` (`LuChartArea` exists in react-icons 5.7.0).
  - [`startup-manifest.ts`](../../../packages/modules/startup/renderer/startup-manifest.ts): `home: 'startup.projections'`.
  - [`startup-home.tsx`](../../../packages/modules/startup/renderer/views/startup-home.tsx): `TITLES` gains
    `'startup.projections': 'Projections'`; `startupViewTitle`'s fallback stays `'Overview'`.
  - In `StartupHome`, `if (view === 'startup.projections') return <ProjectionsView projections={workspace.fleetProjections}
    readOnly={readOnly} />;` goes **after** the loading/error returns and **before** the company gate (`:40`), so
    Projections works with no company profile.
  - Accept: `startup-pane.test.tsx` — with no company and view `startup.projections`, "Set up your company" is absent and
    the Projections heading is present; with view `startup.roadmap` the gate still shows.
- [x] `renderer/projections/projections-view.tsx` (net-new): `<main aria-label="Projections" className="flex h-full min-h-0">`
  holding `ProjectionList | ResizeHandle | ResultsPanel | ResizeHandle | ControlsPanel`.
  - Left: `useResizable({ size, onSize, axis: 'x', initial: 240, min: 200, max: 360 })`, `ResizeHandle label="Resize
    projection list"`. Right: `useResizable({ …, axis: 'x', edge: 'end', initial: 340, min: 300, max: 480 })`,
    `label="Resize controls"`. **Neither passes `onCollapse`/`onExpand`**, so a drag past the limit clamps.
  - Centre: `flex-1 min-w-[480px] overflow-y-auto`. Side panes: `overflow-y-auto`, `style={{ width: r.current }}`,
    `transition-[width]` only when not dragging (tasks-view pattern).
- [x] `renderer/projections/use-projections-ui.ts` (net-new), the `use-roadmap-ui.ts` pattern (plain zustand + `try/catch`
  localStorage, no `persist`): keys `midnite-startup.projections.listWidth`, `.controlsWidth`, `.selectedId`.
  - `load` clamps stored widths into [min, max] and falls back to `initial` on garbage.
  - Selection resolves as: stored id if it exists in `projections`, else the first projection's id, else `null`.
- [x] `renderer/projections/use-fleet-draft.ts` (net-new):
  `useFleetDraft(source: FleetProjection | null, readOnly: boolean): { draft: FleetProjection | null; result:
  FleetProjectionResult | null; update: (fn: (p: FleetProjection) => FleetProjection) => void; pending: boolean;
  problem: string | null }`.
  - `result = useMemo(() => draft && computeFleetProjection(draft), [draft])`.
  - `update` applies `fn` to the draft (callers return new objects with spread/`map`; never mutate), marks it dirty and
    (re)starts a **400 ms** timer that calls `useStartupWrite((b, p) => b.upsertFleetProjection({ projection: p }))`.
  - **Draft wins while dirty** (Decision 8): re-seed the draft from `source` only when `source.id` changes, or when
    there is no pending timer, no in-flight save, and `source.updatedAt > draft.updatedAt`.
  - On `source.id` change and on unmount, a pending save is flushed immediately (not dropped).
  - On save error: keep the draft, set `problem` to the `StartupError.message`; the next successful save clears it.
  - `readOnly` → `update` is a no-op.
- [x] `renderer/projections/projection-list.tsx` (net-new), left pane:
  - Header row: `<h2>Projections</h2>` and a **New** `EmptyStateButton`-styled button; New toggles an inline starter
    row (three buttons from `FLEET_STARTERS`, rendered in the pane, not a popover) — choosing one calls
    `upsertFleetProjection` with `buildFleetStarter(id, { projectionId: crypto.randomUUID(), nodeId: () =>
    crypto.randomUUID() }, new Date().toISOString(), uniqueName('Projection'))` and selects it.
    `uniqueName` appends ` 2`, ` 3`… until no existing projection has that name.
  - Rows are a `<ul role="listbox" aria-label="Projections">` of `<li role="option" aria-selected>`; Up/Down move
    selection, Enter/F2 starts rename. Each row shows the name, `N nodes`, and `formatZar(netMarginMonthlyCents)`
    + ` /mo` in `text-success` when ≥ 0, `text-destructive` when < 0. Row figures come from
    `computeFleetProjection`, memoised per row on `id + updatedAt`.
  - Per-row actions, always visible, via `STARTUP_CHROME.IconButton`: Rename (`LuPencil`, label "Rename"),
    Duplicate (`LuCopy`, "Duplicate" → `duplicateFleetProjection({ id, name: uniqueName(`${name} copy`) })`),
    Delete (`LuTrash2`, "Delete").
  - Rename is an inline `<input aria-label="Projection name">`: Enter or blur saves (trimmed); Esc cancels; empty or
    over 80 characters keeps the input open with an inline `role="alert"` "Name must be 1–80 characters".
  - Delete → `STARTUP_CHROME.useDialogs().confirm({ title: 'Delete <name>?', body: '<N> nodes will be deleted. This
    can\'t be undone.', confirmLabel: 'Delete projection', danger: true, onConfirm })`. After delete, selection moves
    to the next row (or the previous, or none).
  - At `MAX_FLEET_PROJECTIONS`: New and Duplicate are `disabled` with `disabledReason="You can have at most 50
    projections."`.
- [x] Empty, loading, error and read-only states:
  - No projections: the centre shows `EmptyState({ icon: LuChartArea, title: 'No projections yet', body: 'Start
    from a template to model a compute fleet.', action: <the three starter buttons> })`; the side panes still render
    (list header with New; the controls pane shows "Select a projection" in `text-muted-foreground`).
  - Loading and snapshot error stay owned by `StartupHome` (`:29-37`); nothing new.
  - Op failure (any `StartupError`): an inline `<p role="alert" className="text-xs text-red-500">` at the top of the
    pane whose action failed (list for create/rename/duplicate/delete; results header for the draft save).
  - `readOnly`: the existing banner text ("This workspace was written by a newer Midnite Startup. It is read-only
    here.") renders at the top of the centre pane; every mutating control in all three panes is `disabled`.
- [x] Theming (Decision 3, hybrid), scoped to classes inside `renderer/projections/**`:
  - Panes: `bg-card/60 backdrop-blur-md border-border rounded-xl` (tokens, so light and dark both work).
  - Labels `text-xs text-muted-foreground`; values `text-foreground`.
  - The gradient `bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500` is used **only** for: the primary
    button (New / Spawn node), the selected list row's 2 px left bar, the Net-margin tile's border, and the chart's
    series colours (Theme E). Text on the gradient is `text-white`.
  - Export the class strings as constants from `renderer/projections/styles.ts` (`PANE`, `LABEL`, `GRADIENT`,
    `GRADIENT_BORDER`), so D and E share one source.
- [x] Studio's Tailwind scans module renderers: in [`packages/app/tailwind.config.ts`](../../../packages/app/tailwind.config.ts)
  add `'../modules/*/renderer/**/*.{ts,tsx}'` to `content`.
  - Accept: after `moon run app:build`, `grep -c 'via-purple-500' packages/app/dist/assets/*.css` ≥ 1 (a class used only
    by Projections). Note the finding in the PR body: whether other module views were missing classes in Studio before.

### D — Controls panel (M)

- [x] `renderer/projections/slider-field.tsx` (net-new) — one control used everywhere in D and E:
  `SliderField({ id, label, value, min, max, step, format, parse, onChange, disabled })`, rendering
  `<label htmlFor>`, `<input type="range">`, and a numeric `<input type="text" inputMode="decimal" aria-label={label}>`.
  - The text input shows `format(value)`; on blur or Enter it `parse`s, clamps into [min, max], snaps to `step`, and
    calls `onChange`; unparsable input reverts to the previous value.
  - The range input calls `onChange` on every `input` event (the draft debounces the save).
- [x] `renderer/projections/controls-panel.tsx` (net-new), right pane, two `<section aria-labelledby>` groups, no
  collapsing:
  - **Global** — Scale (`scalePct` 10–500, step 10, `150 %`); Electricity (`electricityRateCents` 0–10,000, step 10,
    shown `R 3.20 /kWh`); Demand growth (`demandGrowthPct` −20–50, step 1, `+5 %/mo`); Horizon — three toggle buttons
    `12 · 24 · 36` (`role="radiogroup"`, `aria-checked`, the active one with the gradient).
  - **Master template** — Hardware `<select>` (options `"<label> — R 120,000 · 1,200 W"`), API tier `<select>`
    (`"Pro — R 7,500 /mo"`), Quantity 1–64, Utilisation 0–100 %, Price per GPU-hour (`pricePerHourCents` 0–1,000,000,
    step 50, `R 25.00 /h`).
  - Actions: **Spawn node** appends `{ ...draft.template, id: crypto.randomUUID(), name: 'Node <n>', enabled: true }`
    where `n` = 1 + the highest existing `Node <k>` suffix; disabled at `MAX_FLEET_NODES` with reason "A projection has
    at most 200 nodes."
  - **Apply template to all** → `confirm({ title: 'Apply the template to all nodes?', body: 'Overwrites hardware, API
    tier, quantity, utilisation and price on <N> nodes. Names and on/off stay.', confirmLabel: 'Apply to <N> nodes',
    danger: true })`; disabled when there are no nodes.
  - Footer: `Illustrative list prices.` in `text-[11px] text-muted-foreground`.
- [x] Keyboard and accessibility: tab order is Global top to bottom, then Template, then actions; every control has an
  accessible name equal to its visible label; the resize handles keep `useResizable`'s keyboard (arrows ±8 px,
  Shift ±64, Home/End).

### E — Results panel (L)

- [x] `renderer/projections/results-panel.tsx` (net-new), centre, top to bottom: header (projection name as `<h2>`, the
  draft `problem` alert, "Saving…" in `text-muted-foreground` while `pending`), KPI strip, chart, node grid.
  - **KPI strip** — `grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3`, six `<div role="group"
    aria-label="<name>">` tiles: CapEx, OpEx /mo, Revenue /mo, **Net margin /mo**, Margin % (`—` when `null`),
    Payback (`<n> mo` or `Not within <horizon> mo`). Values `text-2xl font-semibold tabular-nums`; Net margin
    `text-3xl` inside a `GRADIENT_BORDER`, `text-success`/`text-destructive` by sign. These are the largest text in
    the view.
- [x] `renderer/projections/fleet-chart.tsx` (net-new), imported via `React.lazy(() => import('./fleet-chart'))` inside
  `<Suspense fallback={<Skeleton className="h-80 w-full" />}>`:
  - `recharts@^3` added to [`packages/modules/startup/package.json`](../../../packages/modules/startup/package.json)
    `dependencies` (v3 for React 19 support; check its peer range against React 19.2 at install).
  - `<ResponsiveContainer width="100%" height={320}><ComposedChart data={series}>`: `Area` energy and `Area` api with
    `stackId="cost"`, `Area` revenue (unstacked, low opacity) — all on a left `YAxis yAxisId="monthly"` — and `Line` cumulative
    (`strokeWidth={2}`, `dot={false}`) on its own right `YAxis yAxisId="cumulative" orientation="right"`,
    `ReferenceLine y={0}` and `ReferenceLine x={paybackMonths - 1}` (labelled `Payback` when not null) on the cumulative axis.
    `XAxis dataKey="month"` with `tickFormatter={(m) => `M${m + 1}`}`, both `YAxis` with `tickFormatter={formatCompactZar}`,
    `Tooltip formatter={(v) => formatZar(v)}`, `Legend`. `isAnimationActive={false}` on every series (dragging a
    slider must not replay the animation).
  - Colours: indigo-500 energy, purple-500 api, pink-500 revenue, `hsl(var(--foreground))` cumulative.
  - `role="img"` wrapper with `aria-label="Monthly costs, revenue and cumulative cash over <horizon> months"`.
- [x] `renderer/projections/node-card.tsx` (net-new), in `grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3`:
  - Header: inline-rename name input (`aria-label="Node name"`, same 1–60 rule), an on/off switch (`role="switch"`,
    `aria-checked`, label "Enabled"), a Remove `IconButton` (`LuTrash2`, "Remove node") with **no confirm** (Decision 9).
  - Body: Hardware and API tier selects, then `SliderField`s for Quantity, Utilisation and Price/hour, then three
    figures (CapEx, OpEx /mo, Net /mo) from `result.perNode[id]`.
  - A 6 px dot with `title="Differs from the template"` when any `FleetNodeConfig` field ≠ `draft.template`.
  - Disabled node: card `opacity-50`, figures `R 0`, controls still editable.
  - Every edit goes through `update(p => ({ ...p, nodes: p.nodes.map(n => n.id === id ? { ...n, …change } : n) }))`.
- [x] Performance and bundle:
  - `computeFleetProjection` runs once per draft change (≤ 200 nodes × 36 months, no further memo needed); list rows
    are memoised per `id + updatedAt` (C).
  - Bundle: `moon run startup:build` (the Startup app's Vite build) before and after; read the entry chunk from its
    `.vite/manifest.json` and quote both sizes in the PR. Accept: the entry grows < 5 KB and `recharts` appears only in
    a non-entry chunk (`grep -l recharts` over the dist's js files names no file marked `isEntry`).

### F — Verification (M — re-tagged from S: fixtures, mocks and per-item assertions)

- [x] Test support: `renderer/projections/test-fixtures.ts` (net-new) exporting `fleetProjection(overrides?)` and
  `fleetNode(n, overrides?)` built with `buildFleetStarter` and `u(n)`-style ids; and in
  [`test-support/suite-bridge`](../../../packages/app/test-support/) a `STARTUP_FLEET_ANSWERS` (the `get` answer carrying
  a v2 workspace with one `gpu-cluster` projection and `company: null`) beside `STARTUP_SEEDED_ANSWERS`.
- [x] Vitest (jsdom) — net-new files under `renderer/projections/`, one assertion set each:
  - `projections-view.test.tsx`: no projections → "No projections yet" and three starter buttons; stored selected id
    missing → first projection selected; read-only → banner text present and every `button`/`input`/`select` in the
    view `disabled`.
  - `projection-list.test.tsx`: create from "GPU cluster" calls `upsertFleetProjection` with 4 nodes and name
    `Projection` (then `Projection 2`); rename Esc restores; empty name shows the alert and does not call the bridge;
    duplicate calls `duplicateFleetProjection` with `"<name> copy"`; delete opens confirm and calls
    `removeFleetProjection` only on confirm; negative net renders `text-destructive`; at 50 New is disabled;
    ArrowDown moves `aria-selected`.
  - `use-fleet-draft.test.ts` (fake timers): five `update`s within 400 ms → exactly one `upsertFleetProjection`, 400 ms
    after the last; a newer `source.updatedAt` arriving while a save is pending does **not** replace the draft; it does
    after the save resolves; unmount with a pending timer saves immediately; the previous draft's `nodes` array is
    referentially unchanged after an `update` (immutability); `readOnly` → no call.
  - `slider-field.test.tsx`: typing `999` into Scale clamps to `500`; `abc` reverts; step snapping (`137` → `140`).
  - `controls-panel.test.tsx`: Spawn adds `Node 5` to a 4-node draft; Apply-to-all opens confirm and rewrites every
    node's config but not names or `enabled`; horizon toggle has `aria-checked` on one button.
  - `node-card.test.tsx`: override dot appears after changing utilisation; disabling zeroes the three figures;
    Remove calls `update` with the node gone and opens no dialog.
  - `results-panel.test.tsx` with `vi.mock('recharts', …)` replacing `ResponsiveContainer` by a fixed 800×320 `div`:
    KPI tiles show `formatZar` values for the B fixture; no `$` anywhere in `container.textContent`; payback copy
    `Not within 12 mo`.
- [x] Functional e2e `packages/app/e2e/suite-shell/startup-projections.spec.ts` (net-new), header
  `// e2e-capability: getBoundingClientRect, pointer drag` with a comment naming why (real pane widths, real SVG):
  - `installSuiteBridge(page, { frameless: true, answers: STARTUP_FLEET_ANSWERS })`, viewport 1440×900,
    `page.goto(SUITE_APP_URLS.startup)`.
  - Lands on Projections with no company gate; the chart's `svg path` count > 0.
  - Drag the list handle −200 px → width 200; +400 px → 360; drag the controls handle +300 px (leftwards growth is
    `edge: 'end'`, so drag −300) → 480; neither pane ever has width 0.
  - Move the Scale slider with the keyboard (focus, `ArrowRight` ×5) → the Net margin tile text changes.
  - Reuses the existing `pageErrors` afterEach assertion; no Electron or broker is started (Vite + bridge stub only).
  - Bump `scripts/e2e-budget.mjs`'s declared count if the ratchet requires it, in the same commit.
- [x] Existing tests kept green: [`startup-pane.test.tsx`](../../../packages/modules/startup/renderer/startup-pane.test.tsx),
  [`manifest.test.ts`](../../../packages/modules/startup/manifest.test.ts), and [`startup.spec.ts`](../../../packages/app/e2e/suite-shell/startup.spec.ts) — the
  latter's first test ("asks to set up the company before anything else") now lands on Projections; update it to
  `goto(page, 'startup.overview')` first, and say so in the PR.

## Files this phase touches

| File | Theme | Kind |
|---|---|---|
| [`packages/shared/src/startup-fleet.ts`](../../../packages/shared/src/) (+ `.test.ts`) | A | net-new |
| [`packages/shared/src/index.ts`](../../../packages/shared/src/index.ts) | A | edited (one line) |
| [`packages/shared/src/startup.ts`](../../../packages/shared/src/startup.ts) | A | edited (version, field, 3 ops) |
| [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | A | edited (3 lines) |
| [`packages/modules/startup/main/workspace-store.ts`](../../../packages/modules/startup/main/workspace-store.ts) (+ test) | A | edited |
| [`packages/modules/startup/main/service.ts`](../../../packages/modules/startup/main/service.ts) (+ test) | A | edited |
| [`packages/modules/startup/main/bridge.ts`](../../../packages/modules/startup/main/bridge.ts) (+ test) | A | edited |
| `packages/modules/startup/renderer/projections/fleet-model.ts`, `format-zar.ts` (+ tests) | B | net-new |
| [`packages/modules/startup/renderer/startup-nav.ts`](../../../packages/modules/startup/renderer/startup-nav.ts), [`startup-manifest.ts`](../../../packages/modules/startup/renderer/startup-manifest.ts), [`views/startup-home.tsx`](../../../packages/modules/startup/renderer/views/startup-home.tsx) | C | edited |
| `renderer/projections/{projections-view,projection-list}.tsx`, `{use-projections-ui,use-fleet-draft,styles}.ts` | C | net-new |
| [`packages/app/tailwind.config.ts`](../../../packages/app/tailwind.config.ts) | C | edited (one glob) |
| `renderer/projections/{slider-field,controls-panel}.tsx` | D | net-new |
| `renderer/projections/{results-panel,fleet-chart,node-card}.tsx`, [`packages/modules/startup/package.json`](../../../packages/modules/startup/package.json), `pnpm-lock.yaml` | E | net-new / edited |
| `renderer/projections/test-fixtures.ts`, the `*.test.ts(x)` above | F | net-new |
| [`packages/app/test-support/suite-bridge`](../../../packages/app/test-support/) | F | edited (one fixture) |
| `packages/app/e2e/suite-shell/startup-projections.spec.ts` | F | net-new |
| [`packages/app/e2e/suite-shell/startup.spec.ts`](../../../packages/app/e2e/suite-shell/startup.spec.ts) | F | edited (first test navigates to Overview) |
| [`runway/runway-types.ts`](../../../packages/modules/startup/renderer/runway/runway-types.ts) `formatMinor`, Runway's `projection` op | — | (**unchanged**, load-bearing: Runway keeps its own formatter and op) |

## Verification

- [ ] `moon run :typecheck :lint :test` green in CI (no `lucide-react`; per-set `react-icons/lu` imports only).
- [x] A — `startup-fleet.test.ts`, `service.test.ts › fleet projections`, `workspace-store.test.ts › migrateWorkspace` (v1 → v2
  keeps milestones; v3 read-only; bad v2 corrupt) and `bridge.test.ts` pass.
- [x] B — `fleet-model.test.ts` hits the hand-worked fixture to the cent; `format-zar.test.ts` passes with `Intl` stubbed
  to throw and `LANG=de_DE.UTF-8`.
- [x] C — with no company, Startup opens on Projections and shows no setup form; the other five views still gate.
- [x] C — `use-fleet-draft.test.ts`: one save per 400 ms burst; draft not clobbered while dirty; flush on unmount.
- [x] C — Studio's built CSS contains `via-purple-500`.
- [x] D — slider clamp/snap/revert and Apply-to-all confirm assertions pass.
- [x] E — no `$` in the rendered results; Net margin is the largest text (`text-3xl`); Startup entry chunk grows < 5 KB and
  Recharts sits in a lazy chunk (numbers in the PR).
- [x] F — `startup-projections.spec.ts` passes on the macOS e2e shard: pane widths clamp at 200/360 and 300/480, never 0;
  chart SVG has paths; Scale via keyboard changes Net margin.
- [ ] **Open, for a human:** screenshots at 3440×1440 and 1280×800 in light and dark (session scratchpad, not
  committed): every control visible without opening anything, no overlap, KPIs the most prominent text.

## Not in this phase

- **User-editable catalogs or live hardware prices** — constants keep the model testable; editing is a separate
  feature with its own persistence.
- **Linking a projection to Runway lines or the ledger** — Projections stands alone so its maths stays pure and
  testable; a "send to Runway" bridge is a later phase.
- **Currency other than ZAR; tax, depreciation, financing, FX** — the spec fixes ZAR, and each of these changes the
  model's meaning.
- **Utilisation-scaled energy** — deliberately full draw (Decision 6); a one-line model change if wanted later.
- **CSV / PDF export, MCP tools, sharing, multi-user** — no consumer yet.
- **A forced dark surface** — the view follows the app theme through tokens (Decision 3).
- **Animated chart transitions** — off, so slider drags stay smooth.

## Decisions / open questions

1. **Resolved — Projections is a view in the existing Startup app**, first in the rail and the home view. Phase 130
   built the frame; a second app would duplicate it.
2. **Resolved — the cards model a compute-node fleet** (hardware + API tier + power + GPU-hour pricing), the spec's own
   example.
3. **Resolved — hybrid theming.** Panes use frame tokens (`bg-card/60 backdrop-blur-md border-border`) so the view
   matches its siblings in both themes; the indigo → purple → pink gradient is only an accent (primary button,
   selected row bar, Net-margin border, chart series). Forcing the spec's raw dark palette would break light mode.
4. **Resolved — Recharts 3**, a startup-module dependency, lazy-loaded; v3 because the repo is on React 19. The Runway
   chart stays hand-drawn SVG.
5. **Resolved — persisted in the Startup workspace at schema v2, ZAR fixed.** Bumping the version is what stops a
   v1 build from silently dropping the projections; the explicit v1 → v2 step in `migrateWorkspace` is what stops a
   v2 build from treating every existing file as corrupt.
6. **Resolved — energy at full draw**, `watts × 730 / 1000 × rate`, independent of utilisation, as the spec states.
   Chosen over an idle-floor model to keep the spec's formula verbatim.
7. **Resolved — illustrative catalog prices**, labelled "Illustrative list prices." in the controls footer; real
   quotes or editing are out of scope.
8. **Resolved — the draft wins while dirty.** The 400 ms save triggers `onChanged` → refetch; re-seeding on every
   snapshot would make sliders jump mid-drag. The draft re-seeds only on selection change or a strictly newer
   `updatedAt` with nothing pending.
9. **Resolved — confirms only where work is lost in bulk**: deleting a projection and Apply-to-all confirm; removing
   one node does not (one click re-spawns it).
10. **Resolved — `fleet` prefix in code** (`fleetProjections`, `upsertFleetProjection`, `FleetProjectionSchema`,
    `startup-fleet.ts`) because `projection` is already Runway's op; the UI still says "Projections".
11. **Resolved — Projections renders before the company gate**: it needs no company, and as the home view a new user
    should land on something usable.
12. **Resolved — Studio's Tailwind scans `packages/modules/*/renderer`**, because Studio mounts the startup module and
    would otherwise ship without the view's classes.
13. **Resolved — wave plan for a 2-agent fleet**: A ‖ B (B stacked on A's first commit), then C–F in one PR. C, D and E
    share `projections-view.tsx`, so splitting wave 2 would only buy merge friction.
14. **Resolved — no new logging.** Failures surface as inline `role="alert"` text where the action happened, matching
    the rest of the module; there is no diagnostics surface for Startup.
15. **Resolved — cumulative cash on its own right axis (screenshot review, user agreed).** Cumulative cash runs to the negative of CapEx, which squashed the monthly cost and revenue series into a thin band at R 0 on a shared axis. Node-card hardware options use the compact form (`<label> · R 120k · 1,200 W`) so they do not clip at wide widths, and the list row keeps its monthly figure on one line.
