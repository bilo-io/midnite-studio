# Phase 129 — Accountant module

**Refined: x1** · 2026-11-11 · UI/UX, empty/loading/error states, functionality & edge cases, data model & IPC contract, persistence & migration, concurrency, testing & verification, security & blast radius, sequencing, file-map precision, per-item acceptance criteria, out-of-scope tightening

Planned 2026-11-11 by an unattended swarm agent (agent-B) · grounded against the tree as of `c9bef6832`.

Money gets its second module, **Accountant**: double-entry books kept on the user's disk, a chart of
accounts, a journal, bank-statement import with rules, the four standard reports (trial balance, profit
and loss, balance sheet, cash flow), and a tax **estimate** for one reference jurisdiction. The launcher
already lists it as a `comingSoon` module on the Money tile
([`catalog.ts`](../../../apps/launcher/src/common/catalog.ts) `MODULES.accountant`), and `shared` already
names it (`MODULE_IDS`, `APP_MODULES.money = ['money', 'accountant']`,
`RETIRED_APP_ALIASES.accountant` in [`modules.ts`](../../../packages/shared/src/modules.ts)). This phase
makes that tile real.

> **Builds on.**
> - **Modules and hosts** ([Phase 124](phase-124-apps-into-modules.md), [`docs/APPS.md`](../../../docs/APPS.md)
>   § Modules and hosts). The unfilled skeleton is [`packages/modules/_template/`](../../../packages/modules/_template/README.md).
>   Mind is the nearest two-module host: [`apps/mind/main/host.ts`](../../../apps/mind/main/host.ts)
>   (`mountModuleMains`), [`apps/mind/src/host-nav.ts`](../../../apps/mind/src/host-nav.ts) (`navFromModules`),
>   [`apps/mind/src/host-app.tsx`](../../../apps/mind/src/host-app.tsx) (`ModuleViewRouter` + panes),
>   [`apps/mind/main/preload.ts`](../../../apps/mind/main/preload.ts) (`unionBridgeSlices`). Money today is a
>   one-module host with none of those four files: [`apps/money/main/index.ts`](../../../apps/money/main/index.ts)
>   calls `registerMoneyHandlers` directly and [`apps/money/src/main.tsx`](../../../apps/money/src/main.tsx)
>   renders the module's `MoneyApp`.
> - **The feature/module split.** The `money` module composes the `finance` feature
>   ([`packages/features/finance`](../../../packages/features/finance/manifest.ts)); the accountant module
>   composes a new `ledger` feature the same way. Putting the engine in a feature (not the module) is what
>   lets Studio, which composes features, show it, and what lets Phase 130's Startup app reuse it.
> - **Persistence precedent.** `createPortfolioStore` in
>   [`portfolio-store.ts`](../../../packages/features/finance/main/markets/portfolio-store.ts) (temp + rename);
>   append-only NDJSON in [`findings-ledger.ts`](../../../packages/runtime/src/security/findings-ledger.ts).
>   The shared data root is `runtimeDataDirectory` in
>   [`data-directory.ts`](../../../packages/runtime/src/data-directory.ts).
> - **One channel with an `op` union**, like `mediaAnimation`: `AnimationRequestSchema` in
>   [`media-animation.ts`](../../../packages/shared/src/media-animation.ts), `CHANNELS` in
>   [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts).
> - **Phase 130 (Startup)** consumes this phase's ledger contract and mounts this module as its "Books" group.
>   The ownership split is on the swarm board and in Decisions below.

> **Scope guardrails.** Local-first, single-user books. No bank feeds, no e-filing, no payroll, no
> multi-currency postings, no accountant-client sharing. Tax is an *estimate* behind a fixed
> "not tax advice" notice, for one reference jurisdiction, through a pluggable rule interface.

> **Effort tags:** **XS** < 30 min · **S** 30 min – 2 h · **M** 2 – 4 h · **L** 4 – 8 h · **XL** 1 – 2 d.

## Headlines

_Books that balance, on your own disk._ Money shows what you hold; it does not keep books. Freelancers and
small teams still export a CSV into a spreadsheet to answer "what did I earn, what do I owe, what will the
tax be". This phase adds a double-entry ledger that refuses an unbalanced entry, corrects by reversal
rather than edit, reads a bank statement, produces the four standard reports, and estimates the tax for
one jurisdiction, plainly labelled as an estimate. Planned 2026-11-11; build order **B → A → C → D**, then
**E, F, G** in parallel, then **H**.

**Theme A — Module scaffold, and Money as a two-module host.** ◻ `packages/modules/accountant` and the
empty `packages/features/ledger` package; Money gains `main/host.ts`, `src/host-nav.ts`,
`src/host-app.tsx` and the accountant bridge in its preload; Studio composes the ledger feature as a
`books` view. The catalog stays `comingSoon` until Theme H.

**Theme B — Money amounts and the ledger contract.** ◻ `shared/src/money-amount.ts` (integer minor units +
ISO-4217) and `shared/src/ledger.ts` (books, accounts, journal entries, the `ledger` channel's op union and
result envelope). Phase 130 builds on both.

**Theme C — Book store and posting engine.** ◻ Books under `<appData>/Midnite Runtime/books/<id>/`: a
`book.json` plus an append-only `journal.ndjson`, one writer per book by lock file, balanced-or-rejected
posting, reversal instead of edit, period lock, idempotent posting by source reference, chart templates.

**Theme D — Books, accounts and journal UI.** ◻ Overview, Accounts and Journal views in the ledger
feature's renderer, mounted as the Accountant nav group: create a book, browse balances, post and reverse
entries, with every empty, loading, read-only and error state written down.

**Theme E — Bank CSV import and rules.** ◻ Pick a statement, map its columns, preview, categorise by rules,
post; re-importing the same file posts nothing twice.

**Theme F — Financial reports.** ◻ Trial balance, profit and loss, balance sheet and cash flow (indirect)
computed in main from the journal, rendered as tables, exported as CSV. The balance sheet always balances
and the cash flow always reconciles, or says by how much it does not.

**Theme G — Tax estimates.** ◻ A `TaxJurisdiction` interface and registry, the UK (England, Wales and
Northern Ireland) as the reference: income tax + Class 4 NIC for a sole trader, corporation tax with
marginal relief for a company. Every screen carries the fixed not-tax-advice notice.

**Theme H — Verification and the catalog flip.** ◻ Shots spec over the mock bridge, the packaged-app pass,
and `comingSoon` removed from `MODULES.accountant`.

## Build order

1. **B** first: the schemas are what A's bridge types and C's store are written against.
2. **A** next: the packages, the Money host conversion and the Studio view, rendering Theme D's empty state.
3. **C** (needs B), then **D** (needs C's ops).
4. **E**, **F**, **G** in parallel (each needs C; G also reads F's `profitAndLoss`).
5. **H** last. Phase 130 Theme F needs B and C merged.

## Deliverables

### A — Module scaffold, and Money as a two-module host (M)

- [ ] Net-new feature package `packages/features/ledger` (`@midnite/studio-feature-ledger`)
  - Copy [`finance`](../../../packages/features/finance/)'s `package.json`, `moon.yml`, `tsconfig.json`,
    `tsconfig.main.json`, `vitest.config.ts`; moon id `feature-ledger`, tags `app-money`, `app-studio`
    (130 Theme F adds `app-startup`).
  - Exports: `./renderer` (source), `./main` (built), `./bridge` is **not** needed (the module owns the bridge).
  - `manifest.ts`: `ledgerManifest = defineFeatureManifest({ feature: 'ledger', owner: 'money', views: [],
    settingsPages: [], ipc: [CHANNELS.ledger], events: [EVENT_CHANNELS.ledgerChanged], mcpTools: [] })`.
  - `FEATURE_PLACEMENT.ledger = 'money'` in [`placement.ts`](../../../packages/shared/src/domain/placement.ts).
  - Added to `NODE_PROJECTS` in [`gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs) (else CI fails).
  - Verified by `packages/features/ledger/manifest.test.ts`: `ledgerManifest.ipc` equals `[CHANNELS.ledger]` and
    `FEATURE_PLACEMENT.ledger === 'money'`.
- [ ] Net-new module package `packages/modules/accountant` (`@midnite/studio-module-accountant`) from `_template`
  - Drop the `.tmpl` suffixes, replace `__ID__`/`__LABEL__`; moon id `module-accountant`, tags `layer-module`,
    `app-money`, `app-studio`; `dependsOn` `shared`, `frame`, `runtime`, `feature-ledger`.
  - `manifest.ts`: `accountantManifest = defineModuleManifest({ module: 'accountant', label: 'Accountant',
    glyph: 'PiCalculatorFill', accent: '#14b8a6', features: ['ledger'], views: [] })` — the glyph matches
    the launcher's `accountant: PiCalculatorFill` in [`app-glyphs.ts`](../../../apps/launcher/src/renderer/app-glyphs.ts).
  - `main/module.ts`: `accountantModuleMain = defineFeatureMain<LedgerMainServices>({ feature: 'ledger',
    channels: ledgerMain.channels, register: (ctx, s) => ledgerMain.register(ctx, s) })`, as
    [`capture/main/module.ts`](../../../packages/modules/capture/main/module.ts) does.
  - `main/bridge.ts`: `createAccountantBridge(ipc: RendererIpc): AccountantBridge` where
    `AccountantBridge = { ledger: MidniteStudioBridge['ledger'] }`, one method per op (Theme B).
  - `main/context.ts`: `createAccountantServices(el: AccountantElectron): LedgerMainServices`, with
    `AccountantElectron = { appDataBase: string; appId: SuiteAppId; pickCsv: () => Promise<string | null>;
    saveCsv: (defaultName: string) => Promise<string | null>; send: (channel: string, payload: unknown) => void;
    warn?: (message: string) => void }`. No `electron` import (the layer rule).
  - `renderer/`: `ACCOUNTANT_NAV_GROUP: NavGroup` (`id: 'accountant'`, label/accent from the manifest, icon
    `PiCalculatorFill`, views `accountant.overview` · `accountant.journal` · `accountant.accounts` ·
    `accountant.reports` · `accountant.tax` · `accountant.import`), `AccountantPane: ModulePane` (its own
    `QueryClientProvider` + `FrameChromeProvider` with `createFrameChrome()`), and `ACCOUNTANT_APP`.
  - Added to `NODE_PROJECTS` as `module-accountant`.
  - Verified by `packages/modules/accountant/manifest.test.ts` (template's test: module id in `MODULE_IDS`, glyph,
    `features` equals `['ledger']`) and `main/bridge.test.ts` (each op calls `CHANNELS.ledger` with its payload).
- [ ] Money becomes a two-module host, copying Mind's four files
  - Net-new `apps/money/main/host.ts`: `registerMoneyHost(el: MoneyHostElectron):
    { ledger: LedgerService; dispose: () => Promise<void>; stopRates: () => void }` calls `registerMoneyHandlers(el)`
    unchanged (money keeps its own registration; wrapping it in a `defineFeatureMain` is not this phase's) and
    `mountModuleMains(createIpcContext(el), [{ module: accountantModuleMain, services: createAccountantServices(…) }])`.
  - [`apps/money/main/index.ts`](../../../apps/money/main/index.ts): replace the direct `registerMoneyHandlers` call with
    `registerMoneyHost`; `app.on('will-quit')` awaits `dispose()` (releases book locks, Theme C).
  - [`apps/money/main/preload.ts`](../../../apps/money/main/preload.ts): `unionBridgeSlices(createMoneyBridge(…),
    createAccountantBridge(ipcRenderer), …)`.
  - Net-new `apps/money/src/host-nav.ts`: `MONEY_HOST_NAV = navFromModules(APP_MODULES.money, { money: MONEY_NAV_GROUP,
    accountant: ACCOUNTANT_NAV_GROUP })`. `MONEY_NAV_GROUP` is exported from the money module (net-new
    `renderer/money-nav.ts`, moving the inline group out of [`money-manifest.ts`](../../../packages/modules/money/renderer/money-manifest.ts)).
  - Net-new `apps/money/src/host-app.tsx`: `MoneyHostApp` renders `SuiteAppShell` with `ModuleViewRouter`, panes
    `{ money: MoneyPane, accountant: AccountantPane }`. `MoneyPane` is net-new in the money module: today's
    `MoneyApp` body minus `SuiteAppShell` (query client, `FinanceHostProvider`, `MoneyHome`, `MoneyDialogHost`).
  - [`apps/money/src/main.tsx`](../../../apps/money/src/main.tsx) renders `MoneyHostApp`;
    [`apps/money/tailwind.config.ts`](../../../apps/money/tailwind.config.ts) becomes `frameContent(__dirname, ['finance', 'ledger'], ['money', 'accountant'])` (features, then modules).
  - [`apps/money/moon.yml`](../../../apps/money/moon.yml) and `package.json`: `module-accountant`, `feature-ledger`.
  - Verified by net-new `apps/money/main/host.test.ts` (over `createRecordingContext`: `CHANNELS.ledger` and every
    finance channel registered exactly once) and `apps/money/src/host-app.test.tsx` (nav shows a "Money" and an
    "Accountant" group; clicking `accountant.overview` renders the Accountant pane's empty state).
- [ ] Studio composes the ledger feature as a `books` view
  - `FEATURE_VIEWS.ledger = ['books']` and `'books'` after `'dashboard'` in `STUDIO_VIEW_ORDER`
    ([`feature-registrations.ts`](../../../packages/shared/src/domain/feature-registrations.ts)); the test that pins
    the old literal list gains `'books'`.
  - [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx): lazy `books` →
    `LedgerWorkspace` from `@midnite/studio-feature-ledger/renderer` (one component with an internal tab strip for
    Overview · Journal · Accounts · Reports · Tax · Import, because Studio has one view per feature);
    [`nav-groups.ts`](../../../packages/app/src/components/nav-groups.ts) adds it under the group that holds `dashboard`, icon `LuBookOpen`.
  - Net-new `packages/desktop/src/main/ipc/ledger-handlers.ts`: `registerLedgerHandlers(): () => Promise<void>`, called
    beside `registerFinanceHandlers()` in [`desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts),
    `appId: 'studio'`; preload exposes `ledger` in [`desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts).
  - [`composition.ts`](../../../apps/studio/src/composition.ts): `'ledger'` in `STUDIO_FEATURES`, `'accountant'` in
    `STUDIO_MODULES` (its test globs `packages/modules/*/package.json` and fails otherwise).
  - [`packages/app/test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts): an in-memory `ledger` mock
    (one seeded book, Theme D's fixture) used by RTL and the shots spec.
  - Verified by `apps/studio/src/composition.test.ts` (existing, now passing with the module) and
    `packages/app/src/components/view-registry.test.ts` (`books` resolves).
- [ ] The catalog keeps `comingSoon: true` on `MODULES.accountant` in this theme; Theme H removes it
  - Reason: a tile that opens onto an empty pane with no posting is a broken promise.

### B — Money amounts and the ledger contract (S)

- [ ] Net-new `packages/shared/src/money-amount.ts`, exported from the shared barrel
  - `CurrencyCodeSchema` is `MarketCurrencyCodeSchema` from [`markets.ts`](../../../packages/shared/src/markets.ts) re-exported
    (one ISO regex in the repo).
  - `MoneyAmountSchema = z.object({ minor: z.int(), currency: CurrencyCodeSchema })` — zod 4's `z.int()` is
    the safe-integer check, so `minor` is always within ±2^53.
  - `CURRENCY_MINOR_UNITS: Readonly<Record<string, 0 | 2 | 3>>` (`JPY 0`, `KRW 0`, `BHD 3`, `KWD 3`, `OMR 3`,
    `TND 3`, everything else listed in `MARKET_CURRENCIES` 2) and `minorUnitsOf(code): 0 | 2 | 3` (unknown → 2).
  - `parseAmount(text: string, currency: string): { ok: true; minor: number } | { ok: false; reason: 'empty' |
    'not-a-number' | 'too-many-decimals' | 'too-large' }` — splits on the decimal point as a string; never
    multiplies a float. Accepts a leading `-`, thousands `,` and surrounding whitespace.
  - `formatAmount(amount: MoneyAmount, locale?: string): string` — `Intl.NumberFormat` with
    `style: 'currency'` and min = max fraction digits = `minorUnitsOf`.
  - `percentOfMinor(minor: number, basisPoints: number): number` — BigInt intermediate, round half away from zero.
  - `allocateMinor(minor: number, weights: readonly number[]): number[]` — largest remainder; parts sum to `minor` exactly.
  - Verified by net-new `money-amount.test.ts`: `parseAmount('1,234.56','USD')` → `123456`; `'0.1'+'0.2'` sums to
    `30`; `parseAmount('1.234','USD')` → `too-many-decimals`; `parseAmount('1234','JPY')` → `1234`;
    `percentOfMinor(-125, 2000)` → `-25`; `allocateMinor(100, [1,1,1])` → `[34,33,33]`;
    `formatAmount({minor: 123456, currency: 'GBP'}, 'en-GB')` → `£1,234.56`.
- [ ] Net-new `packages/shared/src/ledger.ts`: the domain schemas
  - `LedgerIdSchema = z.uuid()`; `IsoDateSchema = z.iso.date()` (`YYYY-MM-DD`).
  - `AccountTypeSchema = z.enum(['asset', 'liability', 'equity', 'income', 'expense'])`;
    `normalSide(type): 'debit' | 'credit'` (asset, expense → debit).
  - `AccountSubtypeSchema = z.enum(['cash', 'bank', 'receivable', 'current-asset', 'fixed-asset', 'payable',
    'tax-payable', 'loan', 'current-liability', 'owner-equity', 'share-capital', 'drawings', 'retained-earnings',
    'sales', 'other-income', 'cost-of-sales', 'operating-expense', 'other-expense'])`.
  - `LedgerAccountSchema = { id, code: z.string().regex(/^[0-9]{3,6}$/), name: z.string().trim().min(1).max(80),
    type, subtype, archived: z.boolean().default(false), taxTreatment: z.enum(['allowable', 'disallowable',
    'none']).default('none') }`; a subtype must belong to its type (`SUBTYPES_BY_TYPE`, refined).
  - `LedgerBookSchema = { version: z.literal(1), id, name (1–80), entity: z.enum(['personal', 'sole-trader',
    'company']), currency: CurrencyCodeSchema, fiscalYearStart: { month: 1–12, day: 1–31 }, lockedThrough:
    IsoDateSchema.nullable().default(null), jurisdiction: TaxJurisdictionIdSchema.nullable().default(null),
    accounts: LedgerAccountSchema[], rules: ImportRuleSchema[] (Theme E, `.default([])`), createdAt: z.iso.datetime() }`.
  - `JournalSourceSchema = { app: SuiteAppIdSchema, kind: z.enum(['manual', 'import', 'invoice', 'payment',
    'bill', 'reversal']), ref: z.string().min(1).max(120).optional() }`.
  - `JournalLineSchema = { accountId, side: z.enum(['debit', 'credit']), minor: z.int().positive(),
    memo: z.string().max(200).optional() }` — one positive amount and a side, not a signed number, so a sign
    error cannot pass validation.
  - `JournalEntrySchema = { id, date, description (1–200), lines: 2–200, source, reverses: LedgerIdSchema.optional(),
    postedAt }`, refined: Σ debit `minor` === Σ credit `minor`.
  - `LedgerPostInputSchema` = the entry minus `id`, `postedAt`; `LedgerPostRequest = { bookId, entry: LedgerPostInput }`
    — the shape Phase 130's `LedgerPort.post` takes.
  - Every optional is `.optional()`/`.default()` so a book written by a later build still loads.
  - Verified by net-new `ledger.test.ts`: round-trip of each schema; an entry with Σdebit ≠ Σcredit fails with path
    `['lines']`; a `subtype: 'bank'` on an `income` account fails; an unknown extra field on a book is stripped, not fatal.
- [ ] The `ledger` channel: one request union, one envelope
  - `CHANNELS.ledger = 'mstudio:ledger:op'`; `EVENT_CHANNELS.ledgerChanged = 'mstudio:ledger:changed'` with payload
    `{ bookId: string; revision: number }`.
  - `LedgerRequestSchema = z.discriminatedUnion('op', [...])`, ops: `listBooks` · `createBook { name, entity,
    currency, fiscalYearStart, template }` · `updateBook { bookId, patch: { name?, lockedThrough?, jurisdiction? } }` ·
    `upsertAccount { bookId, account }` · `archiveAccount { bookId, accountId }` · `post { bookId, entry }` (renderer
    posts are `source.kind: 'manual'` only; main stamps `source.app`) · `reverse { bookId, entryId, date, reason }` ·
    `journal { bookId, from?, to?, accountId?, query?, cursor?, limit ≤ 500 }` · `balances { bookId, asOf }` ·
    `report { bookId, kind, from, to }` (Theme F) · `exportReport { bookId, kind, from, to }` (Theme F) ·
    `importPick { bookId }` / `importPreview { bookId, mapping }` / `importCommit { bookId, rows }` (Theme E) ·
    `taxEstimate { bookId, taxYear }` (Theme G).
  - `LedgerErrorKindSchema = z.enum(['invalid', 'unbalanced', 'locked-period', 'not-found', 'read-only',
    'archived-account', 'currency-mismatch', 'corrupt', 'io'])`;
    `LedgerResult<T> = { ok: true; value: T } | { ok: false; kind: LedgerErrorKind; message: string }`.
    Ops never throw across the boundary.
  - Schema registered for the channel in [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts); `MidniteStudioBridge['ledger']`
    in [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) with one typed method per op, as `mediaAnimation`'s is.
  - Verified by the channel-parse table in `ipc.test.ts` (the existing test that walks `CHANNELS`) plus
    `ledger.test.ts`: a renderer `post` with `source.kind: 'invoice'` is rejected by the request schema.

### C — Book store and posting engine (L)

- [ ] Net-new `packages/features/ledger/main/book-store.ts`: `openBookStore({ dir, appId, now, warn }):
  Promise<BookStore>` — one book's files and its in-memory index
  - Files: `<dir>/book.json` (the `LedgerBook`, written temp + rename), `<dir>/journal.ndjson` (one `JournalEntry`
    per line, appended with `open(path, 'a')` → `write` → `datasync`), `<dir>/writer.lock`.
  - In memory: `entries: JournalEntry[]` in posting order, `balances: Map<accountId, { debit: number; credit: number }>`,
    `bySource: Map<string, entryId>` keyed `${app}|${kind}|${ref}`, `revision` (= entry count).
  - Every write runs through one in-process promise queue per book, so two posts cannot interleave.
  - Verified by net-new `book-store.test.ts` over a temp dir: post → reopen → same balances; 20 concurrent posts →
    20 lines, `revision === 20`.
- [ ] One writer per book: the lock file
  - `writer.lock` created with `open(path, 'wx')`, holding `{ pid, appId, startedAt }`. Exists and
    `process.kill(pid, 0)` succeeds → the store opens **read-only**; exists and the pid is dead → replaced (stale).
  - A read-only store re-reads `journal.ndjson` when its `mtimeMs`/size changed, checked at the start of every read op.
  - Write ops on a read-only store return `{ ok: false, kind: 'read-only', message: 'Open in <appId> — this book is
    being written there.' }`; `dispose()` unlinks the lock only if it still holds this pid.
  - Verified: a second store on the same dir is read-only; after the first `dispose()` a third opens writable; a lock
    naming a dead pid (spawn and wait for `process.execPath -e ''`) is taken over.
- [ ] Load is tolerant of a torn tail, strict about the middle
  - A last line without a trailing `\n` that fails to parse is a torn append: the file is truncated to the last
    newline and `warn('ledger: dropped a torn final line in <bookId>')`.
  - Any other line that fails `JournalEntrySchema` opens the book **read-only** with `corrupt: { lines: number[] }`;
    the UI shows it (Theme D) and nothing is silently dropped — an accounting record is never discarded by a parser.
  - A `book.json` that fails its schema is moved to `book.corrupt-<ts>.json` and the book is listed with
    `kind: 'corrupt'` rather than crashing boot.
  - Verified with fixtures: torn tail → truncated, reopens writable; bad line 3 of 5 → read-only, `corrupt.lines = [3]`.
- [ ] Posting rules, enforced in `post(input, source)` and nowhere else
  - Balanced (re-checked server-side), every `accountId` exists and is not archived (`archived-account`), `date` is after
    `lockedThrough` (`locked-period`), 2–200 lines.
  - Idempotent: a `source.ref` already in `bySource` returns `{ ok: true, value: { entry: existing, duplicate: true } }`
    and appends nothing.
  - Main assigns `id = crypto.randomUUID()` and `postedAt = now()`.
  - Verified: unbalanced → `unbalanced`; post dated on `lockedThrough` → `locked-period`; same `ref` twice → one line in the file.
- [ ] Corrections are reversals; there is no edit and no delete op
  - `reverse(entryId, date, reason)` posts the mirror (sides swapped), `source.kind: 'reversal'`, `reverses: entryId`,
    description `Reversal: <original> — <reason>`; reversing an entry twice returns the existing reversal (`ref = entryId`).
  - Reason: an append-only journal is the audit trail, and it is what lets the file stay append-only on disk.
  - Verified: post then reverse → every balance back to 0; second reverse → `duplicate: true`.
- [ ] Net-new `ledger-service.ts`: `createLedgerService({ root, appId, now?, warn? }): LedgerService`
  - `root` is `join(runtimeDataDirectory(appDataBase), 'books')`; one folder per book, named by its uuid.
  - Methods: `listBooks()`, `createBook(input)`, `updateBook(id, patch)`, `upsertAccount`, `archiveAccount`, `post(req:
    LedgerPostRequest, source: JournalSource)`, `reverse(bookId, entryId, date, reason)`, `journal(query)`, `balances(bookId, asOf)`,
    `report(bookId, kind, from, to)` (Theme F), `taxEstimate(bookId, taxYear)` (Theme G), `dispose()`; each returns `Promise<LedgerResult<…>>`.
  - `post` is what Phase 130's `LedgerPort` wraps: it takes `source` from the caller in main, never from the renderer.
  - Stores open lazily on first use and stay open until `dispose()`.
  - After each write: `send(EVENT_CHANNELS.ledgerChanged, { bookId, revision })`.
- [ ] Net-new `main/index.ts`: `ledgerMain = defineFeatureMain<LedgerMainServices>({ feature: 'ledger', channels:
  [CHANNELS.ledger], register })`; the handler switches on `op`, catches everything into the envelope (`io` for an fs error)
  - `LedgerMainServices = { service: LedgerService; pickCsv: () => Promise<string | null>; saveCsv: (defaultName: string) =>
    Promise<string | null> }`; `send` goes into `createLedgerService`. A host keeps the `service` it built, which is how
    Phase 130's Startup host reaches the same books (its `LedgerPort` wraps `service.post`/`service.balances`).
  - Verified by net-new `main/index.test.ts` over `createRecordingContext`: each op answers `ok: true` on the seeded book;
    an fs error injected into the store becomes `{ ok: false, kind: 'io' }`, never a throw.
- [ ] Net-new `chart-templates.ts`: `CHART_TEMPLATES: Record<'personal' | 'sole-trader' | 'company', LedgerAccountInput[]>`
  - `sole-trader`: 1000 Bank (bank), 1010 Cash (cash), 1100 Accounts receivable, 1500 Equipment (fixed-asset),
    2000 Accounts payable, 2100 Sales tax payable (tax-payable), 2200 Loans (loan), 3000 Owner's capital, 3100 Drawings,
    3900 Retained earnings, 4000 Sales, 4900 Other income, 5000 Cost of sales, 6000 Software & subscriptions, 6100 Travel,
    6200 Office & home, 6300 Professional fees, 6400 Bank fees, 6500 Equipment (expensed), 6800 Entertainment
    (`taxTreatment: 'disallowable'`), 6900 Other expenses; every other expense `allowable`.
  - `company`: the sole-trader set with 3000 Share capital instead of Owner's capital, no Drawings, plus 2300 Payroll
    liabilities, 2400 Corporation tax payable, 6600 Salaries, 6700 Rent.
  - `personal`: Bank, Cash, Credit card (current-liability), Equity, Salary, Other income, Housing, Food, Transport,
    Subscriptions, Other expenses.
  - Verified: every template parses with `LedgerAccountSchema`, codes are unique, and each has exactly one `retained-earnings`
    account (except `personal`, which needs none because it has no tax estimate).

### D — Books, accounts and journal UI (L)

- [ ] Net-new `packages/features/ledger/renderer/ledger-ui-store.ts` (zustand `persist`, as
  [`finance-ui-store.ts`](../../../packages/features/finance/renderer/dashboard/finance-ui-store.ts) does)
  - `name: 'midnite-studio.ledger-ui'`, `version: 1`, `migrate: (raw, v) => v < 1 ? DEFAULTS : raw`; persisted:
    `bookId: string | null`, `journalFilter: { accountId: string | null; query: string }`, `reportRange: 'month' | 'quarter' |
    'fiscal-year' | 'custom'`.
  - A persisted `bookId` that no longer exists falls back to the first book (or the empty state).
  - Verified by `ledger-ui-store.test.ts`: a v0 blob migrates to defaults; an unknown `bookId` resolves to the first book.
- [ ] Data access through react-query over `bridge().ledger`, keyed `['ledger', bookId, op, args]`
  - `ledgerChanged` invalidates `['ledger', bookId]`; reads use `staleTime: 30_000`.
- [ ] Overview (`accountant.overview`): book picker, create-book form, and the four headline numbers
  - No books: centred "No books yet" + **Create a book** (name, entity, currency select from `MARKET_CURRENCIES`, fiscal
    year start, template preselected from entity).
  - With a book: Cash (Σ cash + bank), Owed to you (receivable), You owe (payable + tax-payable), Profit this fiscal year;
    each a link to the filtered journal.
  - Read-only book: an amber banner "Read-only — this book is open for writing in <app>." Corrupt: a red banner naming the
    line numbers and the book folder's path, with a **Copy path** button (`navigator.clipboard.writeText`); no new reveal op.
- [ ] Accounts (`accountant.accounts`): the chart grouped by type, balance per account as of today
  - Columns: code, name, subtype, balance (normal-side sign, `formatAmount`); archived accounts hidden behind a "Show archived" toggle.
  - Add / rename / archive in a side sheet; archiving an account with a non-zero balance is refused in the UI with the
    balance named (main also refuses: `archived-account` on post is the backstop).
- [ ] Journal (`accountant.journal`): entries newest first, filter by account and text, 100 per page (`cursor`)
  - Row: date, description, source badge (Manual · Import · Invoice · Payment · Reversal), total, expand to lines.
  - **New entry** sheet: date, description, ≥ 2 line rows (account combobox, debit, credit, memo), a live
    "Difference" footer; **Post** is disabled until the difference is `0` and every row has an account.
  - **Reverse** on an entry opens a confirm with the reversal's date and a required reason; a reversed entry shows
    "Reversed on <date>" and loses the button.
  - Amount inputs go through `parseAmount`; a bad value marks the cell `aria-invalid` with the reason.
- [ ] Every `{ ok: false }` renders as an inline error under the control that sent it, with `message`; `locked-period` adds
  "Books are locked through <date>." and a link to the book's settings
- [ ] Book settings (a sheet from the Overview picker): rename, lock books through a date, tax jurisdiction (Theme G)
  - Moving `lockedThrough` later goes through `useDialogs().confirm({ title: 'Lock books through <date>?', body: '<n> entries fall in the newly locked range and can no longer be reversed into it.', confirmLabel: 'Lock' })` (the frame's `ConfirmRequest`; `n` from the `journal` op's count).
- [ ] Keyboard: `↑/↓` move in the journal list, `Enter` expands, `N` opens New entry while the journal has focus; nothing joins
  `COMMANDS` in [`keybindings.ts`](../../../packages/shared/src/keybindings.ts)
- [ ] Tests: net-new RTL `overview.test.tsx`, `accounts.test.tsx`, `journal.test.tsx` over the mock bridge
  - Assertions: empty state copy; create book → picker shows it; Post disabled at difference `0.01`, enabled at `0`; reverse
    confirm requires a reason; read-only banner renders for a `readOnly: true` book; `locked-period` error copy renders.

### E — Bank CSV import and rules (M)

- [ ] Net-new `main/import/csv.ts`: `parseCsv(text: string): { rows: string[][]; delimiter: ',' | ';' | '\t' }`
  - RFC 4180 quoting, `""` escapes, CRLF/LF, a UTF-8 BOM stripped, delimiter sniffed from the first non-empty line (most
    frequent of `,` `;` `\t` outside quotes). Hand-written: one function, no dependency.
  - Caps: 5 MB file, 20 000 rows; over either → `{ ok: false, kind: 'invalid', message: 'Statement is larger than …' }`.
  - Verified by `csv.test.ts`: a quoted field with a comma and a newline, a BOM, a `;` file, a trailing empty line.
- [ ] `importPick` opens the injected `pickCsv()` (main-side native dialog), returns `{ token, header, sample: first 10 rows }`
  - The path stays in main behind an opaque `token` (a uuid in a map, expires on the next pick); the renderer never sends a path.
- [ ] `ImportMappingSchema`: `{ token, bankAccountId, date: { column, format: 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' },
  description: column, amount: { kind: 'single', column, negativeIsOutflow: boolean } | { kind: 'split', inColumn, outColumn } }`
  - `importPreview` returns each row as `{ index, date, description, minor, suggestedAccountId | null, duplicate: boolean,
    error?: string }`.
- [ ] Rules: `ImportRuleSchema = { id, match: { field: 'description'; contains: string (case-insensitive) }, accountId,
  priority: z.int() }` stored on the book
  - First matching rule by ascending `priority` wins; a row with no match goes to a "Needs an account" bucket and is not
    posted until it has one.
  - "Remember for next time" on a manual pick adds a rule with `contains` prefilled from the description.
- [ ] Idempotency: each row posts with `source = { kind: 'import', ref: sha256(bankAccountId|date|minor|description|n) }`,
  where `n` counts identical earlier rows in the same file, so two genuine identical payments are both kept and a
  re-import posts neither again
- [ ] `importCommit` posts one entry per row (bank line + categorised line), returns `{ posted, duplicates, failed[{index,
  reason}] }`; one bad row never aborts the batch
- [ ] Import view (`accountant.import`): pick → map (selects for each column, live preview of 10 rows) → review table with
  per-row account combobox → **Post N entries**; summary line after commit
- [ ] Tests: `import-service.test.ts` (mapping both amount kinds, three date formats, rule priority, re-import → 0 posted,
  two identical rows → 2 posted), RTL `import-view.test.tsx` (Post disabled while a row needs an account)

### F — Financial reports (M)

- [ ] Net-new `main/reports.ts`: pure functions over `(book, entries)`; every number is integer minor units
  - `trialBalance({ asOf })` → rows `{ accountId, debit, credit }`, totals equal.
  - `profitAndLoss({ from, to })` → income rows, cost-of-sales, gross profit, operating expenses, net profit.
  - `balanceSheet({ asOf })` → assets, liabilities, equity, plus two computed lines: **Retained earnings** (Σ income − expense
    before the fiscal year containing `asOf`, added to any posted retained-earnings balance) and **Profit this year** (from that
    fiscal year's start to `asOf`). No closing entries are posted; the split is computed.
  - `cashFlow({ from, to })` (indirect): net profit; ± change in receivable, current-asset, payable, tax-payable,
    current-liability (operating); − change in fixed-asset (investing); ± change in loan, owner-equity, share-capital,
    drawings (financing); equals Δ(cash + bank). A non-zero remainder is shown as a red "Unreconciled" row, never hidden.
  - Verified by `reports.test.ts`: a hand-worked fixture year (12 entries) with the expected numbers written in the test; and a
    seeded generator (an LCG, no new dependency) of 500 random balanced entries asserting assets − liabilities − equity −
    computed lines === 0 and the cash-flow remainder === 0.
- [ ] Reports view (`accountant.reports`): a report picker, range presets (this month, last month, this quarter, fiscal
  year to date, last fiscal year, custom), tables with indented groups and totals; rows link to the filtered journal
- [ ] `exportReport` writes CSV via the injected `saveCsv(defaultName)` (`<book>-<kind>-<from>-<to>.csv`, amounts as decimal
  strings with the currency's minor units, no float); cancel → `{ ok: true, value: { saved: false } }`
- [ ] Tests: RTL `reports-view.test.tsx` (range preset → request args; the Unreconciled row renders when the mock returns a remainder)

### G — Tax estimates (M)

- [ ] Net-new `main/tax/jurisdiction.ts`: the interface every rule set implements
  - `TaxJurisdiction = { id: TaxJurisdictionId; label: string; currency: string; entities: readonly ('sole-trader' |
    'company')[]; taxYears: readonly string[]; yearRange(taxYear): { from: string; to: string }; estimate(input: TaxInput):
    TaxEstimate }`.
  - `TaxInput = { taxYear; entity; profitMinor; disallowableMinor }` — `profitMinor` from `profitAndLoss` over `yearRange`,
    `disallowableMinor` = Σ expense accounts with `taxTreatment: 'disallowable'`, added back.
  - `TaxEstimate = { lines: { label; basisMinor; rateBp; taxMinor }[]; totalMinor; effectiveRateBp; payments: { due: string;
    minor: number; label: string }[]; notes: string[]; source: { url: string; checkedOn: string } }` (in `shared/src/ledger.ts`).
  - `TAX_JURISDICTIONS` registry; `TaxJurisdictionIdSchema = z.enum(['uk-ew-ni'])` (adding a jurisdiction is a new file plus one enum value).
- [ ] Net-new `main/tax/uk-ew-ni.ts`: the reference jurisdiction, rates as data in `uk-rates.ts` keyed by tax year
  - Sole trader: personal allowance tapered £1 per £2 over £100 000; basic 20 % / higher 40 % / additional 45 % bands;
    Class 4 NIC (main rate between the lower and upper profits limits, additional rate above). Scotland is excluded
    (its bands differ) and the jurisdiction label says so.
  - Company: corporation tax 19 % small profits rate, 25 % main rate, marginal relief (fraction 3/200) between the lower and
    upper limits; associated companies and short periods are out of scope and listed in `notes`.
  - Payments on account for a sole trader: when the liability exceeds the threshold, two equal payments on 31 January and
    31 July, shown as information.
  - Ships the 2025-26 table. Before merge the executor transcribes the current tax year's figures from GOV.UK into the same
    table, with `source.url` and `checkedOn`; the test file's worked examples are rewritten from those figures.
  - Verified by `uk-ew-ni.test.ts` (2025-26 figures): sole-trader profit £60 000 → income tax £11 432, Class 4 £2 456.60,
    total £13 888.60; profit £110 000 → personal allowance £7 570; company profit £100 000 → £22 750 (marginal relief £2 250).
- [ ] `taxEstimate` op: refuses with `invalid` when the book has no `jurisdiction`, the entity is `personal`, or the tax year
  is not in `taxYears`
- [ ] Tax view (`accountant.tax`): jurisdiction + tax year selects, the estimate table, payment dates, the notes, and the
  fixed notice
  - `TAX_DISCLAIMER` (in `shared/src/ledger.ts`): "Estimate only — not tax advice. Based on the <label> rules for <tax year>,
    checked <date>. Confirm with the tax authority or an accountant before you file or pay." It renders above the table on
    every estimate and cannot be dismissed.
  - No jurisdiction set: an empty state with a select that writes `updateBook({ jurisdiction })`.
- [ ] Tests: RTL `tax-view.test.tsx` (the notice is present in every rendered state; personal entity → the "not available"
  copy; estimate rows render formatted amounts)

### H — Verification and the catalog flip (S)

- [ ] Net-new `packages/app/e2e/accountant-shots.spec.ts` (Studio's `books` view, `installMockBridge` from
  [`e2e/shots-helper.ts`](../../../packages/app/e2e/shots-helper.ts), repos panel closed): Overview, Journal with the new-entry
  sheet open, Balance sheet, Tax estimate; shots under `docs/screenshots/p129/`
  - Header comment names the browser capability it needs: real layout of the four-table report page.
- [ ] Catalog: remove `comingSoon` from `MODULES.accountant`; `home: { kind: 'view', view: 'books' }` and each feature's target
  `view('books')` in [`catalog.ts`](../../../apps/launcher/src/common/catalog.ts); the Money tile's `vision` keeps its
  "Bookkeeping and tax follow as the Accountant module" sentence rewritten in the present tense
  - Verified by `apps/launcher/src/common/catalog.test.ts`: no module on the Money tile is `comingSoon`.
  - [`apps/launcher/src/renderer/app.test.tsx`](../../../apps/launcher/src/renderer/app.test.tsx)'s "lists a coming-soon module
    with no way to open it" case uses the Accountant region today: rewrite it to assert the sheet's **Open Accountant
    module** button calls `open('money', 'module:accountant')`, and move the coming-soon assertion to the Science tile's
    Simulator region (still `comingSoon` until Phase 127 flips it; whichever phase flips the last coming-soon module deletes
    that case).
- [ ] The gate (`moon run :typecheck :lint :test`) is green in CI, including `layer-boundaries.test.mjs` and `gate-projects-check`
- [ ] **Open, for a human:** in the packaged Money app, create a sole-trader book, import a real bank CSV, post two manual
  entries, reverse one, read the four reports and a UK estimate; then open Studio at the same time and see the read-only banner

## Files this phase touches

| File | Theme | Change |
|---|---|---|
| `packages/shared/src/money-amount.ts` (+ test) | B | **net-new** |
| `packages/shared/src/ledger.ts` (+ test) | B, G | **net-new** |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) | B | `ledger`, `ledgerChanged` |
| [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) | B | ledger request schema |
| [`packages/shared/src/ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | B | `MidniteStudioBridge['ledger']` |
| [`packages/shared/src/markets.ts`](../../../packages/shared/src/markets.ts) | B | (**unchanged**, load-bearing: `MarketCurrencyCodeSchema`, `MARKET_CURRENCIES`) |
| [`packages/shared/src/modules.ts`](../../../packages/shared/src/modules.ts) | — | (**unchanged**: `accountant` already in `MODULE_IDS` and `APP_MODULES.money`) |
| [`packages/shared/src/domain/placement.ts`](../../../packages/shared/src/domain/placement.ts) | A | `ledger: 'money'` |
| [`packages/shared/src/domain/feature-registrations.ts`](../../../packages/shared/src/domain/feature-registrations.ts) | A | `ledger: ['books']`, view order |
| `packages/features/ledger/**` | A, C–G | **net-new** feature package |
| `packages/modules/accountant/**` | A | **net-new** module package |
| [`packages/modules/money/renderer/money-manifest.ts`](../../../packages/modules/money/renderer/money-manifest.ts) | A | nav group moved to `money-nav.ts` |
| `packages/modules/money/renderer/money-nav.ts`, `money-pane.tsx` | A | **net-new** |
| [`apps/money/main/index.ts`](../../../apps/money/main/index.ts), [`preload.ts`](../../../apps/money/main/preload.ts) | A | host + bridge union |
| `apps/money/main/host.ts` (+ test), `apps/money/src/host-nav.ts`, `host-app.tsx` (+ test) | A | **net-new** |
| [`apps/money/src/main.tsx`](../../../apps/money/src/main.tsx), [`tailwind.config.ts`](../../../apps/money/tailwind.config.ts), [`moon.yml`](../../../apps/money/moon.yml), `package.json` | A | wiring |
| [`apps/studio/src/composition.ts`](../../../apps/studio/src/composition.ts) | A | `ledger`, `accountant` |
| [`packages/app/src/components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx), [`nav-groups.ts`](../../../packages/app/src/components/nav-groups.ts) | A | `books` view |
| `packages/desktop/src/main/ipc/ledger-handlers.ts` | A | **net-new** |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts), [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | A | register + expose |
| [`packages/app/test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts) | A, D | ledger mock |
| [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs) | A | `feature-ledger`, `module-accountant` |
| [`apps/launcher/src/common/catalog.ts`](../../../apps/launcher/src/common/catalog.ts) | H | flip `comingSoon`, targets |
| [`apps/launcher/src/renderer/app.test.tsx`](../../../apps/launcher/src/renderer/app.test.tsx) | H | coming-soon case moves to Simulator |
| `packages/app/e2e/accountant-shots.spec.ts`, `docs/screenshots/p129/` | H | **net-new** |

## Verification

- [ ] `money-amount.test.ts`: exact parse, no float drift, minor units per currency, half-away rounding, largest-remainder allocation.
- [ ] `ledger.test.ts`: schemas round-trip; unbalanced entry rejected at `['lines']`; renderer `post` of a non-manual kind rejected.
- [ ] `book-store.test.ts`: reopen → same balances; 20 concurrent posts serialised; torn tail truncated; bad middle line → read-only.
- [ ] Lock: second store read-only; stale pid taken over; read-only store sees another writer's append after an mtime change.
- [ ] Posting: unbalanced / archived account / locked period each return their `kind`; duplicate `ref` appends nothing.
- [ ] Reversal: balances return to zero; a second reversal is a duplicate.
- [ ] `main/index.test.ts`: every op answers through the envelope; an injected fs error is `io`, never a throw.
- [ ] `apps/money/main/host.test.ts`: ledger + finance channels each registered once; `host-app.test.tsx`: two nav groups.
- [ ] `csv.test.ts` + `import-service.test.ts`: quoting, BOM, delimiter sniff, caps, rule priority, idempotent re-import.
- [ ] `reports.test.ts`: the hand-worked year; 500 random balanced entries keep the balance sheet balanced and cash flow reconciled.
- [ ] `uk-ew-ni.test.ts`: the three worked examples above.
- [ ] RTL: overview, accounts, journal, import, reports and tax views as listed per theme; the tax notice in every state.
- [ ] `accountant-shots.spec.ts` screenshots committed under `docs/screenshots/p129/`.
- [ ] `catalog.test.ts`: Accountant no longer `comingSoon`.
- [ ] **Open, for a human:** the packaged-app pass in Theme H.

## Not in this phase

- **Multi-currency postings and FX revaluation** — one currency per book keeps every sum exact and every report a single column; the schema leaves room (`MoneyAmount` carries its code).
- **Bank feeds (Open Banking, Plaid)** — needs a provider contract and credential flow; CSV covers every bank today.
- **Invoices, bills, customers and vendors** — Phase 130 (Startup) owns them and posts into this ledger.
- **VAT/sales-tax returns and e-filing (MTD)** — filing is regulated software; this phase only estimates.
- **Payroll** — jurisdiction-heavy and out of a bookkeeping MVP.
- **Editing or deleting a posted entry** — reversal is the correction, by design.
- **Year-end closing entries** — retained earnings are computed, so no closing journal is needed.
- **PDF report export** — CSV first; a printed report can reuse the `printToPdf` path the hosts already have later.
- **An MCP tool surface over the books** — a follow-up once the contract settles.

## Decisions / open questions

- **Resolved — integer minor units plus an ISO-4217 code.** Agreed over decimals or floats, because sums must be exact,
  `number` survives JSON, IPC and zod without a decimal library, and ±2^53 minor units is far beyond any book this app
  will hold. BigInt is used only inside `percentOfMinor`'s multiply.
- **Resolved — the engine is a feature (`ledger`), the module is the place (`accountant`).** Agreed, because that is how
  `money` composes `finance`, because Studio composes features rather than modules, and because Phase 130's Startup host
  can then mount the same module and reach the same service through a host port without a module importing a module.
- **Resolved — NDJSON journal plus a JSON book file, not SQLite.** Agreed, because `better-sqlite3` is a native module only
  `desktop` and `db-engine` carry, and adding it to every suite app means a per-app ABI rebuild; an append is O(1) and
  the file is human-readable. A book of 100 000 entries is a few tens of MB and loads once per process.
- **Resolved — books live under `Midnite Runtime/books`, one writer per book.** Agreed over per-app folders, because Money,
  Studio and Startup must see the same books; the lock file makes the second process read-only instead of letting two
  writers race, and it re-reads on change so the read-only view stays current.
- **Resolved — corrections by reversal only, plus a period lock.** Agreed, because an immutable journal is the audit trail
  every accountant expects and it keeps the file append-only.
- **Resolved — one currency per book.** Agreed, because exact single-column reports are the MVP; `currency-mismatch` is
  reserved in the error kinds for the later multi-currency phase.
- **Resolved — the UK (England, Wales, Northern Ireland) is the reference jurisdiction.** Agreed, because one national
  income-tax system with no state layer makes an honest single reference, and both a sole-trader and a company estimate
  fit it. Rates are data with a source URL and a checked-on date; the executor re-checks them against GOV.UK before merge.
- **Resolved — the renderer may only post `manual` entries.** Agreed, because `source.app` and the non-manual kinds are
  provenance claims; main stamps them, and only main-side callers (import, Phase 130's port) can make them.
- **Resolved — the catalog flips last (Theme H).** Agreed, because opening a tile onto an engine with no UI is worse than
  "coming soon".
- **Resolved — Studio shows Accountant as one `books` view with tabs.** Agreed, because Studio has one view per feature and
  the module's six nav rows exist only inside suite hosts.
