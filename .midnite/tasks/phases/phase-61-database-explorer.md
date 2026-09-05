# Phase 61 — Database Explorer

**Refined: x1** · 2026-09-05 · data model & IPC contract, concurrency & cancellation, persistence & migration, security & blast radius, performance & scale, testing & verification, sequencing & dependencies, file-map precision, per-item acceptance criteria, out-of-scope tightening

A DataGrip-style database client, added as a new **Database** entry in the Workspace sidebar
group alongside Explorer/Search/Tests. Connect to Postgres, MySQL, MariaDB, MSSQL and SQLite;
browse a schema tree; open one or more SQL query tabs against a connection using the tab
mechanism the Changes view already built; run queries and see a virtualized, inline-editable
results grid. This is the first phase to touch anything database-shaped — there is no prior art
anywhere in this tracker.

**The x1 refinement found six wrong premises and one architectural conflict.** Each is one grep, and
each changes what gets built:

1. **Theme C creates a dual-ABI consumer, which this repo has deliberately never had.**
   [`rebuild-native.mjs:5-8`](../../../packages/desktop/scripts/rebuild-native.mjs) says it in as many
   words: *"Only node-pty is native here, and it is used **only** in the main process — which is what
   makes this a one-line story rather than midnite's dual-ABI staging. There is no Node-ABI consumer
   of the same module in this repo."* Theme C's `sqlite.test.ts` runs `better-sqlite3` under bare
   vitest on **Node 22.12.0 (ABI 127)** while the app ships it under **Electron 33.4.11 (ABI 130)** —
   the same module, two ABIs. See Decision 6.
2. **Theme G's store change is architectural, not "entirely in the store's scoping".** There is **no
   vanilla-zustand precedent in the repo** (`grep -rn "createStore\|from 'zustand/vanilla'" packages/app/src`
   → **0**; all 15 stores are module-scope `create()`). Worse, two callers reach the store from
   *outside* React's tree, and one of them cannot be reached from a view-scoped provider by design:
   [`use-prune-closed-repos.ts:28-29`](../../../packages/app/src/features/repos/use-prune-closed-repos.ts)
   is mounted from `Shell`, **not** `Workbench` — deliberately, so it runs when the Changes view is
   not rendered at all. See Decision 7.
3. **`TabStrip` has no new-tab affordance to extend.** `grep -n "+" ` finds no add button in
   [`features/workbench/tab-strip.tsx`](../../../packages/app/src/features/workbench/tab-strip.tsx);
   tabs are only ever created by `openTab` called from the sidebar, the graph context menu or commit
   detail. The component that *does* have one is `features/browser/tab-strip.tsx`, a different and
   much larger file.
4. **The "unsaved-tab-dot convention `tab-strip.tsx` already uses" does not exist.**
   `grep -n "dirty\|unsaved\|●" packages/app/src/features/workbench/tab-strip.tsx` → **0**. What the
   strip actually has is a `stats?: ReactNode` slot (`:125`, rendered at `:159`), filled only for
   `all-changes`. The app's one real dirty dot is a literal `●` span at
   [`file-preview.tsx:147-151`](../../../packages/app/src/features/files/preview/file-preview.tsx).
5. **`Mod+Enter` is taken.** [`keybindings.ts:214`](../../../packages/shared/src/keybindings.ts) binds
   it to `status.commit`, and `:263` states the `Mod+Shift+` space is *"nearly exhausted"*. See
   Decision 4.
6. **`tree-section.tsx` fights lazy loading rather than supporting it.** It renders children into a
   `<Collapse>` that **keeps them mounted while closed** — a trap this repo has already been caught
   by, documented at
   [`forge-sections.tsx:378-383`](../../../packages/app/src/features/repos/forge-sections.tsx):
   *"a group left open from a previous visit would keep issuing its `gh` subprocess while the section
   above it is shut."* Its `depth` is also capped at `0 | 1 | 2 | 3`, and a schema tree is four levels.

And the thing the plan most needs and never mentions: **a full streaming IPC precedent already
exists, and `runQuery` as a plain `invoke` is the wrong shape.**
[`stream-registry.ts`](../../../packages/desktop/src/main/stream-registry.ts) has `BATCH_SIZE = 500`,
a `StreamKind` union and a **total** `POLICY: Record<StreamKind, 'supersede' | 'concurrent'>`;
`log-service.ts` pushes `logBatch` events and a terminal `logDone` carrying `truncated` — precisely
the "result set was capped" signal a grid needs. See Decision 8.

**Builds on.**
- [`packages/git-engine`](../../../packages/git-engine) as the structural crib for a new
  **`packages/db-engine`**: plain Node/TS, no `electron` import, unit-testable in isolation
  (`@midnite/studio-git-engine`'s own `package.json` is the template for
  `@midnite/studio-db-engine`'s).
- [`eslint.config.mjs`](../../../eslint.config.mjs)'s git-engine boundary block (`files:
  ['packages/git-engine/**/*.ts']`, denying `electron` plus `@midnite/studio-app`/`-desktop`) is
  copied verbatim for `packages/db-engine/**/*.ts` — same shape, new package name.
- [`shared/src/domain/result.ts`](../../../packages/shared/src/domain/result.ts) and
  [`git-engine`'s `GitOpResult`](../../../packages/git-engine) — the "ops never throw across
  IPC" discriminated-envelope convention every new `mstudio:db:*` channel follows: `{ok:true,
  data} | {ok:false, kind:'error', message}`. A query has no `conflict` arm to borrow from
  `GitOpResult` — it is the lighter two-arm shape Phase 59 already used for its own new channels.
- [`store/workbench-store.ts`](../../../packages/app/src/store/workbench-store.ts) and
  [`features/workbench/tab-strip.tsx`](../../../packages/app/src/features/workbench/tab-strip.tsx) —
  **the tab mechanism named in the brief.** `WorkbenchTab`/`WorkbenchTabKind` today only power the
  Changes view's own tab strip (`all-changes | run | review | commit`); this phase adds a `'query'`
  kind and lifts the store to be usable per-view rather than Changes-only, so the Database view
  gets its own `<TabStrip>` instance for free instead of a parallel implementation.
- [`features/files/preview/code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx) —
  the existing CodeMirror 6 wiring (`@codemirror/language`, `@codemirror/state`,
  `@codemirror/view`, `@codemirror/commands`, `@codemirror/autocomplete` are all already
  dependencies). The query editor reuses this setup plus one new dependency,
  `@codemirror/lang-sql`, rather than adopting Monaco or a second editor stack.
- [`@tanstack/react-virtual`](../../../packages/app/package.json) — already used by
  `features/graph/graph-view.tsx`, `features/diff/diff-view.tsx` and the Projects table/board.
  The results grid is a new consumer of the same library, not a new grid dependency.
- [`components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) —
  the blast-radius confirm pattern every destructive git op already uses
  ([`CLAUDE.md`](../../../CLAUDE.md)'s "destructive ops need a confirm dialog showing blast
  radius" rule). Theme I's destructive-statement gate is this pattern's next consumer, not a new
  one.
- [`desktop/src/main/repo-store.ts`](../../../packages/desktop/src/main/repo-store.ts) and
  [`diagnostics/trust-store.ts`](../../../packages/desktop/src/main/diagnostics/trust-store.ts) —
  the "`userData`-rooted JSON store, directory injected rather than read via `app.getPath`
  directly" precedent Theme D's non-secret connections store follows, so it stays testable
  without Electron in the loop.
- [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts)'s `ViewId` (line 85) and
  [`app.tsx`](../../../packages/app/src/app.tsx)'s `WORKSPACE_NAV_ITEMS` — the "workspace group at
  the top of the sidenav" the brief asked for is this exact array (Explorer/Search/Tests today);
  Database becomes its fourth entry, ungated (no `FORGE_GATED_VIEWS` entry — this feature has
  nothing to do with a GitHub remote).

**Scope guardrails.**
- **`git-engine` gains nothing.** This is not git-domain; every new module lives in `shared`,
  the new `db-engine` package, `desktop` or `app`.
- **Five providers, one native.** Postgres (`pg`), MySQL (`mysql2`), MariaDB (`mariadb`) and
  MSSQL (`tedious`/`mssql`) are pure-JS drivers. SQLite (`better-sqlite3`) is a native Node
  addon — the same class of per-Electron-version ABI-rebuild risk `node-pty` already carries —
  so it is isolated as its own theme (C) rather than bundled in blind with the rest.
  **Expanding beyond these five providers is explicitly out of scope for this phase.**
- **Schema introspection is tables, views, columns, and primary/foreign keys — nothing deeper.**
  Indexes, triggers and stored procedures/functions are not read in v1.
- **The results grid supports inline editing, generating a PK-keyed `UPDATE`** on commit — this
  was chosen over a read-only grid despite the read-only grid's smaller footprint. Editability
  requires per-table primary-key detection (Theme F) and a staleness re-check before the
  generated `UPDATE` applies (Decision 2), not a blind overwrite.
- **Non-`SELECT` statements are gated behind a confirm dialog** naming the statement, the target
  connection, and an estimated row count where feasible — the same blast-radius posture every
  other destructive op in this app already has.
- **No SSH tunneling, no SSL/TLS certificate configuration, no connection-string import from a
  repo's own `.env`/`docker-compose` files.** A connection is host/port/database/user/password
  typed by hand. This is a real gap for many production databases and is recorded in
  Decision 1 rather than silently dropped.
- **No query history, no saved queries, no CSV import, no dump/restore, no ER diagrams, no
  NL-to-SQL.** Each is a natural follow-on phase once the core client has real usage behind it.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Shared contracts (S)

- [ ] Add [`packages/shared/src/domain/database.ts`](../../../packages/shared/src/domain/database.ts):
      zod schemas for `DbProvider` (`'postgres' | 'mysql' | 'mariadb' | 'mssql' | 'sqlite'`),
      `ConnectionConfig` (id, name, provider, host, port, database, username — no password field;
      the secret never crosses into a schema that could log or serialize it whole),
      `SchemaTree`/`SchemaTable`/`SchemaColumn` (name, type, nullable, isPrimaryKey,
      references), `QueryRequest` (connectionId, sql), and `QueryResult` (columns, rows,
      rowCount, durationMs) plus the `{ok:true, data} | {ok:false, kind:'error', message}`
      envelope every op returns.
  - `ConnectionConfig` carries **`sqlitePath?: string`** and makes `host`/`port`/`username`
    optional — SQLite is a file, not a host, and a single required-host shape cannot describe both.
  - `QueryResult.rows` is `unknown[][]` (positional), **not** `Record<string, unknown>[]`. SQL
    permits duplicate column names in one result set (`SELECT a.id, b.id FROM …`) and an object keyed
    by name silently drops one. The grid renders by index against `columns`.
  - Every driver normalises `Date`, `Buffer`, `bigint` and `null` before they reach the schema —
    `bigint` does not survive `JSON.stringify` over IPC and throws. Encode as string; the column's
    declared type tells the grid how to render it.
- [ ] Add `StatementKind` (`'read' | 'write'`) to the same file — the discriminant Theme I's
      confirm gate switches on.
- [ ] Add channel constants to
      [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts). `mstudio:db:*` is
      free (`grep -rn "mstudio:db" packages/` → **0**) and follows the `mstudio:<domain>:<verb>` rule
      stated at `:6-8`. **Split across both objects**, per Decision 8:
  - In `CHANNELS` (request/response `invoke`): `dbListConnections`, `dbSaveConnection`,
    `dbDeleteConnection`, `dbTestConnection`, `dbGetSchema`, `dbApplyEdit`, plus
    **`dbQueryStart`** and **`dbQueryCancel`** — mirroring `logStart`/`logCancel` at `:35-36`.
  - In `EVENT_CHANNELS` (`webContents.send` pushes, `:612-707`): **`dbQueryBatch`** and
    **`dbQueryDone`** — mirroring `logBatch` (`:614`) and `logDone` (`:616`).
- [ ] Payload schemas in [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) and signatures in
      [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts), copying the `log` group's shape
      (`bridge.ts:117-126`): `start`, `cancel`, `onBatch`, `onDone`, the last two returning
      `Unsubscribe`. `DbQueryDoneEvent` carries `{ requestId, rowCount, truncated, durationMs, error? }`
      — `truncated` is the capped-result signal, exactly as `LogDoneEvent` (`schemas.ts:186`) uses it.
- [ ] `database.test.ts`: schema round-trips, `StatementKind` sniffing against representative
      SQL strings (SELECT/CTE-wrapped-SELECT vs UPDATE/DELETE/DROP/TRUNCATE/ALTER/INSERT), and the
      duplicate-column-name case surviving a round-trip intact.

### B — `db-engine`: pure-JS drivers (M)

- [ ] Scaffold `packages/db-engine` (`@midnite/studio-db-engine`) from
      [`packages/git-engine/package.json`](../../../packages/git-engine/package.json) verbatim:
      **no `"type"` field** (implicitly CommonJS), `main`/`types`/`exports`/`files: ["dist"]`, the
      four scripts, `dependencies` on `@midnite/studio-shared` (`workspace:*`) and `zod`, devDeps
      `@types/node`, `typescript`, `vitest`. `pnpm-workspace.yaml`'s `packages/*` glob and
      `.moon/workspace.yml`'s both pick it up with **zero config change**.
- [ ] `packages/db-engine/tsconfig.json` copying git-engine's: `extends ../../tsconfig.base.json`,
      `module: "commonjs"`, `moduleResolution: "node"`, `types: ["node"]`,
      `references: [{ "path": "../shared" }]`. **Hand-written, because
      [`.moon/toolchain.yml:23-24`](../../../.moon/toolchain.yml) sets
      `typescript.syncProjectReferences: false`.** Add the matching `paths` pair to
      [`tsconfig.base.json:20-25`](../../../tsconfig.base.json).
- [ ] `packages/db-engine/moon.yml` copying git-engine's: **declares no commands**, only
      `language: 'typescript'`, `dependsOn: ['shared']`, `typecheck.deps: ['^:build']`, and a
      `test.inputs` list that includes `/packages/shared/src/**/*` so a shared-only change
      invalidates the cache. Plus `vitest.config.ts` with the `@midnite/studio-shared` →
      `../shared/src/index.ts` alias.
- [ ] Add `src/driver.ts`: one `DbDriver` interface every provider implements identically —
      `connect()`, `disconnect()`, `query(sql, onBatch)`, `introspect(): SchemaTree`.
      **`query` takes a batch callback rather than returning rows**, so the streaming contract of
      Theme A reaches all the way down and no driver ever materialises a whole result set.
- [ ] Add `src/drivers/postgres.ts`, `mysql.ts`, `mariadb.ts`, `mssql.ts` against that interface,
      each using its client's **cursor/stream API**, not its buffered one — `pg` via `pg-cursor`
      or `pg-query-stream`, `mysql2` via `connection.query(...).stream()`, `tedious` via its
      row-event callback.
- [ ] Add `src/connection-pool.ts`: one pooled connection per `ConnectionConfig.id`, idle-timeout
      eviction, never holding a password in a log-reachable field.
  - **Guard the concurrent-connect race with an in-flight promise map**, and put the check *after*
    no `await` — [`demo-api/server.ts:36-42`](../../../packages/desktop/src/main/demo-api/server.ts)
    documents this exact bug already: *"The `server !== null` early-out below is checked BEFORE the
    first await, so two overlapping … invokes … both bound a socket."* Copy the fix, not the bug.
  - Note plainly: **connection pooling has no precedent in this repo** (`grep -n "pool\|Pool" packages/desktop/src/main/*.ts`
    → nothing relevant). This is new machinery, not a reuse.
- [ ] Add `src/introspect.ts`: normalizes each driver's own information-schema query into one
      `SchemaTree` shape (tables, views, columns, PK/FK only — see Scope guardrails).
- [ ] Add `src/statement-kind.ts`: the `StatementKind` sniffer implementation Theme A's contract
      declared, shared by Theme I's confirm gate and Theme F's editability checks.
  - Strip leading comments (`--`, `/* */`) and any `WITH …` CTE prefix before matching the first
    keyword — a `WITH x AS (…) DELETE FROM y` is a **write** whose first keyword is `WITH`, and
    naive prefix matching classifies it as a read. This is the one case that must not be wrong.
  - Multi-statement input (`a; b;`) classifies as `'write'` if **any** statement is a write.
- [ ] Add the new `packages/db-engine/**/*.ts` boundary block to
      [`eslint.config.mjs`](../../../eslint.config.mjs), copying the git-engine block at **`:82-92`**
      with the package name swapped (it reuses the shared `NO_ELECTRON` const at `:26-30`).
      **Two further edits the plan missed:** add `@midnite/studio-db-engine` to the renderer's deny
      group at **`:105-114`** (the renderer must reach the DB only over IPC), and add a `db-engine`
      line to the dependency-graph doc comment at **`:7-23`**.
- [ ] Driver tests against a real, ephemeral instance per provider, following `git-engine`'s
      `src/testing/` precedent — one file exporting a helper class, **deliberately absent from
      `src/index.ts`'s barrel** exactly as `temp-repo.ts` is. CI-gated per Decision 5.

### C — `db-engine`: SQLite driver, native module (M — was S)

*Re-tagged: the x1 audit found this theme carries the phase's only genuinely novel packaging risk.*

- [ ] Add `src/drivers/sqlite.ts` against the same `DbDriver` interface, using `better-sqlite3`.
- [ ] **Resolve the dual-ABI question before writing the driver** (Decision 6). `better-sqlite3`
      must load under **both** Node 22.12.0 (ABI 127, bare vitest) and Electron 33.4.11 (ABI 130,
      the shipped app). `node-pty` avoids this by being main-process-only, and
      [`rebuild-native.mjs:5-8`](../../../packages/desktop/scripts/rebuild-native.mjs) says so
      explicitly. The chosen answer is the **`electron: false` marker + a per-consumer rebuild**, and
      whichever way it is settled it is written down before code.
- [ ] Declare `better-sqlite3` in **`packages/desktop/package.json`'s `dependencies`**, not
      `devDependencies` — the opposite of the three `@midnite/*` workspace packages, which sit in
      `devDependencies` deliberately (`packages/desktop/moon.yml:15-21`: electron-builder walks
      `dependencies` through pnpm's workspace symlinks and dies).
- [ ] Add `'better-sqlite3'` to the `external` array in
      [`packages/desktop/scripts/bundle.mjs:54`](../../../packages/desktop/scripts/bundle.mjs),
      beside `electron`, `node-pty` and `dugite`. **esbuild inlines everything else**, and a `.node`
      binary cannot be inlined.
- [ ] Extend `rebuild-native.mjs`'s hardcoded `--only node-pty` (`:37`) to a comma-separated list.
      The script already reads the Electron version dynamically from `electron/package.json`, so no
      other edit is needed there.
- [ ] Add `'**/node_modules/better-sqlite3/**'` to `asarUnpack` in
      [`electron-builder.yml:48-57`](../../../packages/desktop/electron-builder.yml). The existing
      `'**/*.node'` glob covers the binary but not the module's own resolution path.
- [ ] Load it through an **unpacked-path fallback**, copying the broker's three-step `require` at
      [`broker/index.ts:47-63`](../../../packages/desktop/src/broker/index.ts) (try
      `app.asar.unpacked/node_modules/...`, then `require.resolve`, then bare) and logging a fatal
      rather than crashing.
- [ ] **Add the packaging assertion that does not exist today.**
      [`verify-dist.mjs`](../../../packages/desktop/scripts/verify-dist.mjs) has **no** native-module
      check (`grep -n "unpacked\|\.node" ` → 0) — nothing currently verifies node-pty survived
      packaging either. Assert `better-sqlite3`'s `.node` is present and loadable in the packed app.
- [ ] Note that [`.npmrc:15-20`](../../../.npmrc)'s `side-effects-cache=false` +
      `package-import-method=clone-or-copy` already exist for exactly this reason and now protect a
      second module. pnpm is 9.15.0, which still runs install scripts by default, so **no
      `onlyBuiltDependencies` allowlist is needed** (that is a pnpm 10 concern).
- [ ] `sqlite.test.ts`: against a real temp-file SQLite database, no mocking — subject to Decision 6.

### D — `desktop`: IPC + credential vault (M)

- [ ] Add `desktop/src/main/db/connections-store.ts`, modelled on
      [`diagnostics/trust-store.ts`](../../../packages/desktop/src/main/diagnostics/trust-store.ts)
      rather than `repo-store.ts` — it is the closer template: a keyed map
      (`{version: 1, connections: Record<string, ConnectionConfig>}`), a lazy in-memory cache, a
      `createConnectionsStore(directory: string)` factory taking a **plain string** and importing no
      `electron`, and a `nullConnectionsStore` fallback.
  - **Validate with real zod, not a hand-rolled guard.** `trust-store.ts:121-127` states the rule:
    hand-rolled is fine for main-only trivia, zod once the value is shared with the renderer or
    becomes an argument vector. A connection record is both.
  - **Writes are not atomic in this codebase** (`repo-store.ts:44` is a plain `writeFile`;
    `grep -rn "rename" packages/desktop/src/main/*store*.ts` → 0). If the vault wants atomicity it is
    *introducing* a pattern — say so in the module docstring rather than implying precedent.
- [ ] Add `desktop/src/main/db/credential-vault.ts` — the one module here importing `electron`:
      `safeStorage.encryptString`/`decryptString`, keyed per connection id, the encrypted blob stored
      **alongside, not inside** `db-connections.json`. First real use of `safeStorage` in this repo
      (`grep -rniE "safeStorage|keytar"` → one *comment*, no calls).
  - Do **not** claim the app has never handled a secret. It has, two ways, and both matter:
    the GitHub token is never stored at all (everything shells out through
    [`forge/gh-shell.ts:70`](../../../packages/desktop/src/main/forge/gh-shell.ts)), and
    [`finance-store.ts:14-20`](../../../packages/app/src/features/finance/finance-store.ts) persists
    an API key **in plaintext renderer localStorage**, in a docstring that names `safeStorage` as the
    thing it deliberately skipped. That is the anti-pattern this vault fixes.
  - Check `safeStorage.isEncryptionAvailable()` and degrade to *refusing to save a password* (the
    connection still saves; the password is prompted per session). **Do not overstate this as a
    release blocker**: `grep -in linux packages/desktop/electron-builder.yml` → **0**; the only ship
    target is mac arm64. It is a dev-machine case.
- [ ] Add `desktop/src/main/ipc/database.ts` following the repo's **`register*Handlers()` +
      `configure*()` split**, which is not optional here: handlers are registered at
      [`index.ts:241-301`](../../../packages/desktop/src/main/index.ts), **before** `userData` is
      resolved at `:309`. `registerDbHandlers()` takes no store; `configureDb(...)` is called in the
      synchronous store block at `:322-344`, beside `configureDiagnostics(createTrustStore(userData))`
      at `:343`. A vault factory that awaits breaks that block's stated invariant (`:316-321`).
- [ ] Use the [`ipc/handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts) helpers, and never
      throw: `handle(channel, schema, fn, onInvalid)` resolves on validation failure by design
      (`:15-19`), because an exception across `invoke` reaches the renderer as an opaque
      *"Error invoking remote method…"*.
- [ ] Register `'query'` in [`stream-registry.ts`](../../../packages/desktop/src/main/stream-registry.ts):
      add it to the `StreamKind` union (`:5`) **and** to `POLICY` (`:13`) as **`'supersede'`** — a new
      run in a tab replaces that tab's previous run, matching `log`. `POLICY` is a total `Record`, so
      forgetting the second edit is a compile error. Window teardown already cancels everything via
      the `win.once('closed')` hook at `:24-26`.
- [ ] The query producer mirrors [`log-service.ts:35-80`](../../../packages/desktop/src/main/log-service.ts):
      a guarded `if (!win.isDestroyed()) win.webContents.send(...)` closure, batches of
      `BATCH_SIZE` (500), a terminal `dbQueryDone` carrying `truncated`, a `finished` flag against
      post-cancel sends, and registry release in a **`.finally`, not `.then`** — the comment at
      `:77-80` documents the leak that caused.
- [ ] Wire `window.midniteStudio.db.*` into
      [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts): add `| 'db'` to the
      `Pick<MidniteStudioBridge, …>` union at `:101-145` (ordering there is phase-landing order, not
      alphabetical) so a half-wired group is a compile error (`:95-100`), and implement it in the
      object body copying the `log:` group's shape at `:167-172`.
- [ ] `connections-store.test.ts`, `credential-vault.test.ts`, `database-ipc.test.ts` (mocked
      drivers): save/list/delete round-trip, a failed connection surfacing `{ok:false}` rather than
      throwing, the vault never appearing in a `JSON.stringify` of the non-secret store, and
      `isEncryptionAvailable() === false` degrading rather than throwing.

### E — Sidebar nav + Database view shell (M — was S)

*Re-tagged: adding a `ViewId` is **17 sites**, not the four this theme listed.*

- [ ] Add `'database'` to the `ViewId` union
      ([`ui-store.ts:85-111`](../../../packages/app/src/store/ui-store.ts)) **and to `VIEW_IDS`
      (`:113-131`)**. `VIEW_IDS` is a plain array, **not** compiler-enforced — and `viewForPath`
      (`:1826`) derives from it, so omitting it silently breaks routing while everything compiles.
      `pathForView` (`:1815`) is generic and needs no edit.
- [ ] The **seven compiler-enforced** `Record<ViewId, …>` sites, each of which fails the build until
      filled: `VIEW_ICON` ([`nav-icons.ts:43`](../../../packages/app/src/components/nav-icons.ts)),
      `VIEW_LABELS` ([`title-bar-nav.tsx:32-50`](../../../packages/app/src/components/title-bar-nav.tsx)),
      `VIEW_LABELS` and `VIEW_KEYWORDS`
      ([`services/palette/providers.ts:26-45` and `:46-66`](../../../packages/app/src/services/palette/providers.ts)),
      `VIEW_LABELS` ([`sidebar-page.tsx:25-44`](../../../packages/app/src/features/settings/settings-pages/sidebar-page.tsx)),
      and `VIEW_FILTERS` ([`view-sections.ts:181-219`](../../../packages/app/src/features/repos/view-sections.ts)).
- [ ] The **not-enforced** sites, which fail silently: `filtersByDefault` (`view-sections.ts:228-229`,
      a ternary defaulting to `false`), `ALL_NAV_ITEMS` ([`app.tsx:357-362`](../../../packages/app/src/app.tsx),
      the label lookup `Placeholder` reads), and `VIEW_COMMAND`
      ([`nav-chords.ts:34-40`](../../../packages/app/src/components/nav-chords.ts), a `Partial` — no
      entry, per Decision 4).
- [ ] Add a `Database` entry to `WORKSPACE_NAV_ITEMS`
      ([`app.tsx:333-337`](../../../packages/app/src/app.tsx)) as the fourth entry after
      Explorer/Search/Tests: `{ view: 'database', label: 'Database', icon: VIEW_ICON.database }`.
      Ungated — **not** in `FORGE_GATED_VIEWS` (`app.tsx:371`), since this has nothing to do with a
      GitHub remote.
- [ ] **Place the render arm ABOVE the `!selectedRepoId` guard.** The view-render ternary
      ([`app.tsx:1313-1356`](../../../packages/app/src/app.tsx)) is ordered, and the guard at
      **`:1334`** short-circuits to `<EmptyWorkspace/>`. Global views (`landing`, `settings`,
      `councils`, `workflows`, `video`) sit above it; repo-scoped ones below. **A database connection
      is not repo-scoped**, so Database belongs with the global group — put it below and the view is
      unreachable until a repo is open, for no reason. The chain has no exhaustiveness check: a
      missing arm silently renders `<Placeholder>` (`:457`).
- [ ] Icon: `LuDatabase` from `react-icons/lu`, per [`CLAUDE.md`](../../../CLAUDE.md)'s
      one-icon-family rule.
- [ ] Add `packages/app/src/features/database/database-view.tsx`: connection tree left, tab strip +
      active tab right.
  - Empty state via [`EmptyState`](../../../packages/app/src/components/empty-state.tsx)
    (`{icon?, title, body?, bodySize?}`) — `icon={VIEW_ICON.database}`,
    `title="No connections yet"`, `body="Add a database connection to get started."`
  - Loading via [`LoadingRegion`](../../../packages/app/src/components/skeleton.tsx) wrapping
    `Skeleton` rows in a new `features/database/database-skeletons.tsx`, following the per-feature
    `*-skeletons.tsx` convention (`issues-skeletons.tsx`, `reviews-skeletons.tsx`).
    `skeleton.tsx:130` states every skeleton must go through `LoadingRegion` for its
    `role="status" aria-busy`.
  - Errors are prose through `EmptyState`, not a skeleton — the rule at `skeleton.tsx:7-20`.
- [ ] Add `packages/app/src/store/database-connections-store.ts`: module-scope `create()` like every
      other store in `packages/app/src/store/`.
- [ ] No nav chord — see Decision 4.

### F — Schema tree browser (M)

- [ ] Add `features/database/connection-tree.tsx` — per-connection lazy tree: connections → schemas →
      tables/views → columns.
  - **`TreeSection` supplies the chrome only.** Its children go into a `<Collapse>` that keeps them
    **mounted while closed**, so the consumer must own `const [open, setOpen] = useState(false)` and
    AND it into the query's `enabled` flag — the established workaround at
    [`forge-sections.tsx:399-400`](../../../packages/app/src/features/repos/forge-sections.tsx)
    (`useForgePulls(repoId, sectionOpen && open, …)`). Without it an open-from-last-visit schema node
    keeps querying a database while its parent is shut.
  - **`depth` is typed `0 | 1 | 2 | 3`** ([`tree-section.tsx:69`](../../../packages/app/src/components/tree-section.tsx)).
    Four levels fits exactly; a fifth needs that union widened, which is a shared-component change.
- [ ] Add `features/database/connection-dialog.tsx`: add/edit form with a **Test connection** action.
      There is no test-connection UX anywhere in the app today (`grep -rn "testConnection\|Test Connection"` → 0),
      so it is assembled from three real cribs, named so the executor does not invent a fourth:
  - Structure from [`council-create-dialog.tsx:11-45`](../../../packages/app/src/features/councils/council-create-dialog.tsx)
    — `useFocusTrap`, `role="dialog" aria-modal`, backdrop cancel, `<form onSubmit>`, disabled-when-empty.
  - The async-action state machine from
    [`agent/setup-dialog.tsx:29`](../../../packages/app/src/features/agent/setup-dialog.tsx) —
    a `Phase` union (`'idle' | 'testing' | 'ok' | 'error'`), `LuLoaderCircle` spinner, inline error.
    Its docblock (`:21-26`) is the repo's stated rule: reuse the overlay/focus-trap/button
    conventions, do **not** invent a new modal system, and do not force structured content through
    `ConfirmDialog`'s `body`.
  - The password field and provider-conditional layout from
    [`finance-panel.tsx:109-215`](../../../packages/app/src/features/finance/finance-panel.tsx)'s
    `WatchlistEditor` (`<input type="password">` bound to a store).
  - **The form is provider-conditional**: SQLite shows a file path and hides host/port/username/password.
- [ ] Each connection row exposes an "Open query tab" action and a per-table "Preview data"
      action (runs `SELECT * FROM <table> LIMIT 200` into a new query tab, pre-filled), with the
      identifier quoted per provider (`"` for Postgres/SQLite, `` ` `` for MySQL/MariaDB, `[]` for
      MSSQL) rather than interpolated raw.
- [ ] Column rows carry primary-key and foreign-key markers, feeding Theme H's editability check.
- [ ] `connection-tree.test.tsx`: lazy-load triggering **only when both fold states agree**, PK/FK
      markers rendering, and a closed section issuing no query.

### G — Query tab editor (L — was M)

*Re-tagged: the store change is architectural, not mechanical (Decision 7).*

- [ ] Add `'query'` to `WorkbenchTab`
      ([`workbench-store.ts:20-26`](../../../packages/app/src/store/workbench-store.ts)):
      `{ kind: 'query'; id: string; connectionId: string; label: string; sql: string }`.
  - **It carries no `repoId`, and that breaks two things.** `closeRepoTabs` (`:120`) reads
    `tab.repoId` on every arm, and Phase 28's
    [`use-prune-closed-repos.ts`](../../../packages/app/src/features/repos/use-prune-closed-repos.ts)
    prunes by repo. Both must learn to skip non-repo-scoped tabs. See Decision 7.
  - `tabId(tab)` (`:50-61`) is a `switch` with **no `default`** returning `string`; a missing arm
    makes it `string | undefined` and errors downstream at `:100` rather than cleanly.
  - `KIND_ICON` ([`tab-strip.tsx:33-38`](../../../packages/app/src/features/workbench/tab-strip.tsx))
    is a total `Record<WorkbenchTabKind, IconComponent>` — **the one real exhaustiveness gate**.
  - The content chain ([`workbench.tsx:72-86`](../../../packages/app/src/features/workbench/workbench.tsx))
    ends in an **unguarded** `: <ReviewView …/>`. It errors only because `active.number` is absent on
    the query arm. Add an explicit arm; do not rely on that.
- [ ] **Build the new-tab affordance, because `TabStrip` has none.** No `+` button exists (`:40-53`
      props are `tabs`/`activeTabId`/`workingTreeLabel`/`onFocus`/`onClose`). Add an optional
      `onNew?: () => void` prop rendering a `LuPlus` button when supplied, so the Changes strip is
      unchanged and the Database strip gains one.
- [ ] Dirty marking: the query tab's unsaved dot uses the strip's existing **`stats?: ReactNode`
      slot** (`:125`, rendered at `:159`) with a `●` span copied from
      [`file-preview.tsx:147-151`](../../../packages/app/src/features/files/preview/file-preview.tsx).
      There is no dirty-dot convention in `tab-strip.tsx` to match — `grep "dirty\|unsaved\|●"` → 0.
- [ ] Add `features/database/query-editor.tsx` with `@codemirror/lang-sql`.
      **Coordinate with [Phase 64](phase-64-offline-monaco-and-themes.md)** — it replaces
      `code-editor.tsx` with Monaco and its Theme G removes the seven `@codemirror/*` packages,
      gated on this phase. See Decision 9.
- [ ] **A chord for "run query" is not `Mod+Enter`** — that is `status.commit`
      ([`keybindings.ts:214`](../../../packages/shared/src/keybindings.ts)). Handle Enter-with-modifier
      **locally on the focused editor element**, registering no `COMMANDS` entry at all. See Decision 4.
- [ ] `workbench-store.test.ts` additions: `'query'` kind lifecycle, `closeRepoTabs` leaving query
      tabs alone, and — if Decision 7 goes the scoped way — per-view isolation.

### H — Results grid + inline editing (L)

- [ ] Add `features/database/results-grid.tsx`, virtualized with `@tanstack/react-virtual`.
  - Copy the **recipe documented at
    [`projects-view.tsx:366-372`](../../../packages/app/src/features/projects/projects-view.tsx)**,
    not any component: fixed `estimateSize: () => ROW_HEIGHT`, `overscan: 24` (the house constant at
    all 7 call sites), a sticky flex header, and `absolute` rows positioned by `transform: translateY(…)`.
  - **There is no generic table component to reuse.** `ProjectItemsTable` is module-local, unexported,
    with hardcoded flex spans and Projects domain types in its props.
  - **Column virtualization is net-new**: `grep -rn "horizontal: true\|columnVirtualizer"` → **0**;
    all 7 existing virtualizers are vertical-only. Decision 10 settles how far to go.
- [ ] Rows arrive by subscription, not by return value. Subscribe **once** in an effect with `[]`
      deps and key the start/cancel effect on the query separately — the split at
      [`use-graph-stream.ts:29-50` vs `:52-79`](../../../packages/app/src/features/graph/use-graph-stream.ts),
      whose comment (`:11-16`) records that re-subscribing per query loses batches in flight.
      `requestId` is a monotonic `${connectionId}#${seq}` and the store **discards batches whose id
      it no longer wants** — that is the entire staleness story.
- [ ] Render `truncated` from `dbQueryDone` as a visible "showing first N rows" bar. A silently
      capped result set is the worst failure mode a SQL client has.
- [ ] Inline cell editing: double-click commits to a local pending-edits map keyed by row + column,
      marked with the same `●` span as Theme G.
- [ ] "Submit edits" generates one `UPDATE <table> SET <col>=<val> WHERE <pk>=<original pk value>`
      per edited row using Theme F's PK metadata, **parameterised, never string-interpolated**, and
      refuses to enable editing at all when the result set's source table has no detected primary key
      — which includes every join, aggregate and expression column.
- [ ] Staleness re-check before applying (Decision 2): re-`SELECT` the row by PK immediately
      before the `UPDATE`; a mismatch surfaces a conflict banner rather than overwriting. Wrap
      re-read and update in one transaction where the provider supports it, so the check is not
      itself racy.
- [ ] Export visible results as CSV via a `Blob` + synthetic `<a download>` in the renderer, copying
      [`workflow-list.tsx:67-75`](../../../packages/app/src/features/workflows/workflow-list.tsx).
      **Add no IPC channel** — [`workflow-io.ts:8-16`](../../../packages/app/src/features/workflows/workflow-io.ts)
      already settled this: *"the only file dialog this app exposes today opens a folder, not a
      save-as file picker."*
- [ ] `results-grid.test.tsx`: windowing, batch append and stale-batch discard, pending-edit tracking,
      generated `UPDATE` shape, the staleness-conflict path, and editing disabled with no PK.

### I — Destructive-statement safety gate (S)

- [ ] Before executing, run Theme B's sniffer; a `'write'` routes through
      [`useDialogs().confirm`](../../../packages/app/src/components/dialog-host.tsx) — callers never
      render `ConfirmDialog` directly.
- [ ] **Do not pass `blastRadius`.** Its type is git-shaped —
      `{count: number; sample: {sha: string; subject: string}[]}`
      ([`confirm-dialog.tsx:17-20`](../../../packages/app/src/components/confirm-dialog.tsx)) — and a
      SQL row estimate has no shas. Use `warnings: string[]` for the estimate and `danger: true`.
      The tri-state on `blastRadius` (`undefined` = still counting, `null` = nothing to lose) is
      load-bearing and easy to misuse; passing `null` is correct here.
- [ ] The row-count estimate is `EXPLAIN`-derived where the provider supports it and **omitted
      rather than guessed** otherwise.
- [ ] `'read'` statements (including CTE-wrapped `SELECT`s) execute immediately, no dialog.
- [ ] `statement-confirm.test.tsx`: the gate firing for UPDATE/DELETE/DROP/TRUNCATE/ALTER/INSERT and
      for `WITH … DELETE`; SELECT, `WITH … SELECT` and EXPLAIN passing straight through.

### J — Test suites and CI wiring (M)

*Re-scoped: J is the work of building the suites; the assertions they must make now live in
`## Verification`, per house style.*

- [ ] Playwright spec: Database in the Workspace nav, add a SQLite connection, browse the schema
      tree, open a query tab, run a `SELECT`, see rows.
- [ ] Playwright spec: destructive statement → confirm dialog → blocked until confirmed.
- [ ] Playwright spec: edit a cell, submit, re-query; and a manufactured staleness conflict.
- [ ] Playwright spec: two query tabs against one connection stay independent.
- [ ] Screenshots (empty, connected, query+results, confirm, conflict), light and dark. **Coordinate
      with [Phase 56](phase-56-e2e-speed-run.md) Theme G**, which refactored all `*-shots.spec.ts`
      onto a shared fixture helper — use that helper, do not add a 26th bespoke shots file.
- [ ] CI service containers per Decision 5, with the fallback documented in the workflow file itself.

## Files this phase touches

| File | What |
|---|---|
| [`packages/shared/src/domain/database.ts`](../../../packages/shared/src/domain/database.ts) | **new** — contracts; positional `rows`, `sqlitePath`, bigint/Date/Buffer normalisation (A) |
| [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) | 8 in `CHANNELS`, **2 in `EVENT_CHANNELS`** (`dbQueryBatch`/`dbQueryDone`) (A) |
| [`packages/shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) | payloads + a `db` group shaped like `log` at `bridge.ts:117-126` (A) |
| `packages/db-engine/` | **new package** — `package.json`, `tsconfig.json`, `moon.yml`, `vitest.config.ts`, `src/{index,driver,connection-pool,introspect,statement-kind}.ts`, `src/drivers/*`, `src/testing/` (B, C) |
| [`tsconfig.base.json`](../../../tsconfig.base.json) | the `paths` pair — **required**, `syncProjectReferences: false` (B) |
| [`eslint.config.mjs`](../../../eslint.config.mjs) | boundary block copying `:82-92`, **plus** the renderer deny at `:105-114` and the graph comment at `:7-23` (B) |
| [`packages/desktop/package.json`](../../../packages/desktop/package.json) | `better-sqlite3` in **`dependencies`**; db-engine in **`devDependencies`** (C) |
| [`packages/desktop/scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) | `'better-sqlite3'` added to `external` at `:54` (C) |
| [`packages/desktop/scripts/rebuild-native.mjs`](../../../packages/desktop/scripts/rebuild-native.mjs) | `--only` becomes a list; the `:5-8` docblock's claim is now false and must be rewritten (C) |
| [`packages/desktop/electron-builder.yml`](../../../packages/desktop/electron-builder.yml) | `asarUnpack` entry (C) |
| [`packages/desktop/scripts/verify-dist.mjs`](../../../packages/desktop/scripts/verify-dist.mjs) | the native-module assertion that does not exist today (C) |
| `packages/desktop/src/main/db/connections-store.ts` · `credential-vault.ts` | **new** — trust-store shape; first `safeStorage` use (D) |
| `packages/desktop/src/main/ipc/database.ts` | **new** — `registerDbHandlers()` + `configureDb()` (D) |
| [`packages/desktop/src/main/index.ts`](../../../packages/desktop/src/main/index.ts) | `registerDbHandlers()` by `:301`; `configureDb(...)` in the sync block at `:322-344` (D) |
| [`packages/desktop/src/main/stream-registry.ts`](../../../packages/desktop/src/main/stream-registry.ts) | `'query'` in `StreamKind` (`:5`) **and** `POLICY` (`:13`) as `'supersede'` (D) |
| `packages/desktop/src/main/db/query-service.ts` | **new** — the batch producer, mirroring `log-service.ts:35-80` (D) |
| [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) | `\| 'db'` in the `Pick` at `:101-145`; body copying `log:` at `:167-172` (D) |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | `ViewId` (`:85`) **and `VIEW_IDS` (`:113`)** — the second is not enforced (E) |
| [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) | `WORKSPACE_NAV_ITEMS` (`:333`), `ALL_NAV_ITEMS` (`:357`), render arm **above the `:1334` guard** (E) |
| [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) · [`title-bar-nav.tsx`](../../../packages/app/src/components/title-bar-nav.tsx) · [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) · [`sidebar-page.tsx`](../../../packages/app/src/features/settings/settings-pages/sidebar-page.tsx) · [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts) | the six compiler-enforced `Record<ViewId, …>` sites + `filtersByDefault` (E) |
| [`packages/app/src/components/nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) | (**unchanged**) — `Partial`, and Database gets no chord (Decision 4) |
| `packages/app/src/store/database-connections-store.ts` | **new** — module-scope `create()` (E) |
| `packages/app/src/features/database/` | **new** — `database-view.tsx`, `database-skeletons.tsx`, `connection-tree.tsx`, `connection-dialog.tsx`, `query-editor.tsx`, `results-grid.tsx` (E–H) |
| [`packages/app/src/store/workbench-store.ts`](../../../packages/app/src/store/workbench-store.ts) | `'query'` arm, `tabId` case, `closeRepoTabs` skipping non-repo tabs (G) |
| [`packages/app/src/features/workbench/tab-strip.tsx`](../../../packages/app/src/features/workbench/tab-strip.tsx) | `KIND_ICON` entry + a new optional `onNew?` prop — the `+` button does not exist today (G) |
| [`packages/app/src/features/workbench/workbench.tsx`](../../../packages/app/src/features/workbench/workbench.tsx) | an explicit `'query'` arm before the unguarded `ReviewView` fall-through at `:85` (G) |
| [`packages/app/src/features/repos/use-prune-closed-repos.ts`](../../../packages/app/src/features/repos/use-prune-closed-repos.ts) | must skip non-repo-scoped tabs (G) |
| [`packages/app/src/components/tree-section.tsx`](../../../packages/app/src/components/tree-section.tsx) | (**unchanged** unless a 5th level is needed) — `depth` is `0\|1\|2\|3` (F) |
| [`packages/app/src/components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) | (**unchanged**) — `BlastRadius` is git-shaped; use `warnings` (I) |
| `packages/app/package.json` | `@codemirror/lang-sql` — **coordinate with Phase 64** (G) |
| `packages/app/e2e/database*.spec.ts` | **new** — via Phase 56 Theme G's shared fixture helper (J) |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean **in both directions**: nothing in `db-engine` imports `electron`, `app` or
      `desktop`; and nothing in `packages/app/src` imports `@midnite/studio-db-engine` — the second
      needs the new deny entry at `eslint.config.mjs:105-114` or it is unenforced.
- [ ] `moon run desktop:bundle` succeeds with `better-sqlite3` **absent** from `dist/bundle/main.js`
      and present in `node_modules` — the `external` edit proven, not assumed.
- [ ] `moon run desktop:dist && moon run desktop:verify-dist` passes **with the new native assertion**:
      `better-sqlite3`'s `.node` is under `app.asar.unpacked` and `require`s successfully in the
      packaged app.
- [ ] **The dual-ABI question is answered by a passing test on both sides**: `moon run db-engine:test`
      green under Node 22 **and** a SQLite query succeeds in the packaged Electron app. If Decision 6
      settled on dropping bare-vitest SQLite tests, this reduces to the packaged check plus a recorded
      note — but not silently.
- [ ] A 200,000-row `SELECT` streams: first batch renders before the query completes, memory does not
      track total row count, and `truncated` renders a visible cap notice.
- [ ] Cancelling mid-query (closing the tab, or re-running) stops the producer: no `dbQueryBatch`
      arrives after `dbQueryCancel`, and `stream-registry.countOf(win, 'query')` returns to 0.
- [ ] Closing the window mid-query cancels it — via the existing `win.once('closed')` hook.
- [ ] Two query tabs on one connection run independently, and a **third** run in tab 1 supersedes only
      tab 1's — the `'supersede'` policy is per-request, not per-connection.
- [ ] `WITH x AS (SELECT …) DELETE FROM y` is classified **write** and shows the confirm dialog; a
      plain `WITH … SELECT` does not. This is the sniffer's one must-not-fail case.
- [ ] A result set with duplicate column names (`SELECT a.id, b.id FROM a JOIN b`) renders both
      columns.
- [ ] A `bigint` column round-trips over IPC without throwing.
- [ ] Editing is **disabled** on a join, an aggregate and a PK-less table, with a visible reason.
- [ ] Submitting an edit whose row changed underneath shows the conflict banner and writes nothing.
- [ ] The generated `UPDATE` is parameterised — a cell value of `'); DROP TABLE users;--` updates one
      cell and drops nothing.
- [ ] A schema node left open, whose parent section is then collapsed, issues **no** further query —
      the `forge-sections.tsx:399-400` fold-AND behaviour, tested rather than trusted.
- [ ] `safeStorage.isEncryptionAvailable() === false` leaves the app usable: connections save,
      passwords are prompted per session, nothing throws.
- [ ] A password never appears in `JSON.stringify(connectionsStore)`, in any log line, or in a
      `{ok:false}` error message.
- [ ] Closing a repo prunes its Changes tabs and **leaves query tabs open** — the `closeRepoTabs`
      invariant change, asserted.
- [ ] Database is reachable **with no repository open** — the render-arm placement above `app.tsx:1334`.
- [ ] `viewForPath('/database')` returns `'database'` — proves `VIEW_IDS` was updated, which the
      existing round-trip test at `ui-store.test.ts:184` cannot catch on its own.
- [ ] **Open, for a human:** a real round-trip against a real Postgres, MySQL, MariaDB and MSSQL
      instance each; and after a week, whether the no-SSH-tunnel restriction (Decision 1) is a
      blocker in practice.

---

## Not in this phase

- **SSH tunneling, SSL/TLS config, `.env`/`docker-compose` import.** Decision 1.
- **Indexes, triggers, stored procedures, functions.** Introspection is tables/views/columns/PK/FK.
- **Query history, saved queries, CSV *import*, dump/restore, ER diagrams, NL-to-SQL.**
- **A generic data-grid component.** The results grid is built for this view. Extracting a shared
  table is a real want (`ProjectItemsTable` would be its second consumer) and a different phase.
- **Column virtualization beyond Decision 10's cap.**
- **Migrating `twelveDataApiKey` onto the new vault.** Named in Theme D as the anti-pattern the vault
  fixes, but moving it means an IPC channel that store deliberately avoided — its own follow-up.
- **Making the workbench store per-view if Decision 7 lands on the simpler branch.**
- **Expanding beyond the five providers.**

---

## Decisions / open questions

1. **Resolved (unchanged) — no SSH tunneling or SSL/TLS config in v1.** A connection is
   host/port/database/user/password typed by hand. Many production databases sit behind a bastion or
   require TLS; this phase does not solve that. Recorded, not dropped.

2. **Resolved (unchanged) — inline edits re-check for staleness before applying.** x1 adds one
   clause: the re-read and the `UPDATE` go in **one transaction** where the provider supports it,
   otherwise the check is itself racy and merely narrows the window it claims to close.

3. **Resolved (unchanged) — five providers, SQLite isolated for its native-module risk.** x1
   promotes Theme C from S to M, because the isolation was the right instinct and the cost was
   understated: six packaging edits, not one driver file. See Decision 6.

4. **Resolved — no chord for the view, and "run query" is a local key handler, not a command.**
   `Mod+Enter` is `status.commit` ([`keybindings.ts:214`](../../../packages/shared/src/keybindings.ts)),
   and `:263` states the `Mod+Shift+` space is "nearly exhausted". Three options existed: rebind
   `status.commit` (hostile — it is a daily-use chord in the app's core surface); take a free chord
   like `Mod+Shift+b`; or register nothing. **Register nothing.** Handle Enter-with-modifier on the
   focused editor element, where it cannot collide because the dispatcher only claims chords that
   exist in `COMMANDS`. This also sidesteps the trap the file documents at `:236-240`: off macOS
   `Mod+<letter>` is `Ctrl+<letter>`, which readline owns.

5. **Resolved — CI runs Postgres/MySQL/MariaDB as service containers; MSSQL is manual.** Was
   "not yet settled". MSSQL's image is ~1.5 GB and needs a EULA env var and a slow health-gate; the
   other three are small and start in seconds. The fallback the original doc floated *is* the answer,
   made specific: three in CI, MSSQL in the human pass, and the workflow file says so in a comment so
   the gap is visible to whoever next reads it rather than inferred from a missing job.

6. **Open — the dual-ABI question, and it gates Theme C.** `better-sqlite3` must load under **Node
   22.12.0 (ABI 127)** for `db-engine`'s bare-vitest tests and **Electron 33.4.11 (ABI 130)** for the
   shipped app.
   [`rebuild-native.mjs:5-8`](../../../packages/desktop/scripts/rebuild-native.mjs) states the repo
   has deliberately never had such a consumer, and names "midnite's dual-ABI staging" as the thing
   avoided. Three options:
   (a) **Keep bare-vitest SQLite tests and stage two builds** — honest coverage, but it imports the
   exact complexity the repo wrote that comment to avoid, and `.npmrc`'s `side-effects-cache=false`
   exists because one shared native artifact already poisoned checkouts.
   (b) **Drop `better-sqlite3` from `db-engine`'s test run** and exercise SQLite only through the
   packaged app and Playwright — one ABI, at the cost of the "real file, no mocking" property Theme C
   was written around.
   (c) **Use `node:sqlite`** (built into Node 22 and Electron 33), removing the native dependency
   entirely — no ABI story at all, at the cost of a different API surface and a younger, less
   battle-tested implementation.
   *Recommendation:* **(c), and fall back to (b) if `node:sqlite` proves too thin.** A phase that
   introduces the repo's second native module — and its first dual-ABI one — for the *optional* fifth
   provider is paying its largest packaging cost for its smallest feature. Settle this before Theme C
   starts; it changes what gets written.

7. **Open — does `workbench-store` actually become per-view?** The original said the generalization
   is "entirely in the store's scoping". It is not. There is no vanilla-zustand precedent in the repo
   (`grep -rn "createStore"` → 0 across 15 stores), and two callers reach the store from outside
   React: [`use-graph-actions.ts:292`](../../../packages/app/src/features/graph/use-graph-actions.ts)
   (cross-view, Graph → Changes) and
   [`use-prune-closed-repos.ts:28-29`](../../../packages/app/src/features/repos/use-prune-closed-repos.ts),
   which `workbench.tsx:39-42` says is mounted from `Shell` **specifically so it runs when the
   Changes view is not rendered**. A `Workbench`-scoped provider is unreachable from there by design.
   *Recommendation:* **do not scope the store.** Keep the single store, add the `'query'` arm, and
   give the Database view its own `<TabStrip>` fed by a filtered selector (`tabs.filter(t => t.kind === 'query')`)
   while Changes filters to the rest. It is a one-line selector against a two-file architectural
   change, it keeps both out-of-tree callers working, and it leaves Phase 66's Decision 1 undisturbed.
   The cost is that the two strips share one `activeTabId`, which needs one extra field
   (`activeQueryTabId`) rather than a store refactor.

8. **Resolved — `runQuery` streams; it is not an `invoke`.** The original returned `QueryResult` whole.
   A `SELECT *` on a large table would then serialise every row through one IPC reply, with no
   cancellation, no progress and no cap signal. The repo already solved this once:
   `logStart`/`logCancel` + `logBatch`/`logDone`, [`stream-registry.ts`](../../../packages/desktop/src/main/stream-registry.ts)
   (`BATCH_SIZE = 500`, a total `POLICY` record), and a `truncated` flag on the done event.
   `'query'` joins as `'supersede'`. This is the single largest change x1 makes to the contract, and
   it pushes down into `DbDriver.query` taking a batch callback so no driver buffers a full result.

9. **Resolved — the CodeMirror seam with [Phase 64](phase-64-offline-monaco-and-themes.md), stated
   from both ends.** P64 replaces `code-editor.tsx` with Monaco and its Theme G removes the seven
   `@codemirror/*` packages — **gated on this phase**, per P64's own Decision 2. The reciprocal rule
   here: this phase's `query-editor.tsx` is written as a **standalone CodeMirror setup**, not an
   import of `code-editor.tsx`, so P64 can replace that file without touching the Database view. If
   P64 lands first, `@codemirror/lang-sql` plus the core packages stay for this consumer alone; if
   this lands first, P64's Theme G records itself skipped. Neither blocks the other, and the coupling
   is one `package.json` stanza rather than a shared component.

10. **Resolved — rows virtualize, columns do not, up to a cap.** No 2-D virtualization exists in the
    repo (`grep -rn "horizontal: true\|columnVirtualizer"` → 0) and building the first one inside an
    already-large theme is how Theme H becomes the phase. Render all columns, cap the grid at **60**
    and show a "N columns hidden" affordance beyond it. `SELECT *` on a wide table is the common case
    and 60 covers it; a genuinely 200-column result is a report, not a browse.

11. **Resolved — the connections store uses `trust-store.ts`'s shape, not `repo-store.ts`'s.** It is
    the closer template: a keyed map rather than an array, a lazy in-memory cache, and **real zod**
    validation — which `trust-store.ts:121-127` says is the rule once a value is shared with the
    renderer or becomes an argument vector, and a connection record is both. Note the pattern worth
    stealing wholesale: trust-store stores a *fingerprint* so editing the thing revokes its approval
    (`:25-29`). A connection whose host or database changes should likewise re-prompt rather than
    silently reusing a stored password.

12. **Open — is this one phase?** x1 took it from 53 to 94 items across ten themes, and it contains
    at least three separable pieces: a **new workspace package with five drivers** (A–C), a
    **desktop capability with a credential vault and a streaming query service** (D, I), and a
    **new view with a tab system change and a bespoke data grid** (E–H). Theme H alone is an L with no
    reusable grid to build on. *Recommendation:* **split into three phases along exactly those seams,
    landing in that order** — each is independently shippable (the package is testable with no UI, the
    IPC layer is exercisable from a test before a view exists), and the current shape asks one PR to
    add a package, a native module, a credential store, a streaming protocol, a view, a store
    refactor and a data grid. Recorded rather than actioned; renumbering is the human's call.
