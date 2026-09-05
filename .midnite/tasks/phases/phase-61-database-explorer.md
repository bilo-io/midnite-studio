# Phase 61 — Database Explorer

A DataGrip-style database client, added as a new **Database** entry in the Workspace sidebar
group alongside Explorer/Search/Tests. Connect to Postgres, MySQL, MariaDB, MSSQL and SQLite;
browse a schema tree; open one or more SQL query tabs against a connection using the tab
mechanism the Changes view already built; run queries and see a virtualized, inline-editable
results grid. This is the first phase to touch anything database-shaped — there is no prior art
anywhere in this tracker.

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
- [ ] Add `StatementKind` (`'read' | 'write'`) to the same file — the discriminant Theme I's
      confirm gate switches on.
- [ ] Add channel constants to
      [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts)
      (`mstudio:db:listConnections`, `saveConnection`, `deleteConnection`, `testConnection`,
      `getSchema`, `runQuery`, `applyEdit`), payload schemas in
      [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), and signatures in
      [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts).
- [ ] `database.test.ts`: schema round-trips, `StatementKind` sniffing against representative
      SQL strings (SELECT/CTE-wrapped-SELECT vs UPDATE/DELETE/DROP/TRUNCATE/ALTER/INSERT).

### B — `db-engine`: pure-JS drivers (M)

- [ ] Scaffold `packages/db-engine` (`@midnite/studio-db-engine`), mirroring
      [`packages/git-engine/package.json`](../../../packages/git-engine/package.json)'s shape —
      `dependencies` on `@midnite/studio-shared`, `zod`, plus `pg`, `mysql2`, `mariadb`, `tedious`.
      pnpm's `packages/*` glob in `pnpm-workspace.yaml` already picks it up; no workspace config
      change needed.
- [ ] Add `src/driver.ts`: one `DbDriver` interface (`connect`, `disconnect`, `query(sql):
      QueryResult`, `introspect(): SchemaTree`) every provider driver implements identically.
- [ ] Add `src/drivers/postgres.ts`, `mysql.ts`, `mariadb.ts`, `mssql.ts` against that interface.
- [ ] Add `src/connection-pool.ts`: one pooled connection per `ConnectionConfig.id`, idle-timeout
      eviction, never holding a password in a log-reachable field.
- [ ] Add `src/introspect.ts`: normalizes each driver's own information-schema query into one
      `SchemaTree` shape (tables, views, columns, PK/FK only — see Scope guardrails).
- [ ] Add `src/statement-kind.ts`: the `StatementKind` sniffer implementation Theme A's contract
      declared, shared by Theme I's confirm gate and Theme F's editability checks.
- [ ] Add the new `packages/db-engine/**/*.ts` boundary block to
      [`eslint.config.mjs`](../../../eslint.config.mjs), copying the git-engine block with the
      package name swapped.
- [ ] Driver tests against a real, ephemeral instance per provider (Docker-based fixtures under
      `src/testing/`, following `git-engine`'s own `testing/` precedent) — introspection shape,
      query execution, statement-kind sniffing, connection-pool eviction. CI-gated behind
      whichever providers can run as GitHub Actions service containers.

### C — `db-engine`: SQLite driver, native module (S)

- [ ] Add `src/drivers/sqlite.ts` against the same `DbDriver` interface, using
      `better-sqlite3`.
- [ ] Confirm the native addon rebuilds cleanly against the pinned Electron ABI in this repo's
      packaging pipeline (`moon run desktop:dist`) — the same class of check
      [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md)'s verified native-module-ABI
      constraint already requires of `node-pty`.
- [ ] `sqlite.test.ts`: against a real temp-file SQLite database, no mocking — this driver has no
      server to fixture against, so a real file is the correct and cheapest test double.

### D — `desktop`: IPC + credential vault (M)

- [ ] Add `desktop/src/main/db/connections-store.ts`: non-secret `ConnectionConfig` fields
      (everything but the password) persisted as `db-connections.json`, directory injected —
      following [`repo-store.ts`](../../../packages/desktop/src/main/repo-store.ts)'s own
      pattern so this module carries no `electron` import and stays testable bare.
- [ ] Add `desktop/src/main/db/credential-vault.ts`: the one module in this theme that does
      import `electron` — `safeStorage.encryptString`/`decryptString`, keyed per connection id,
      the encrypted blob stored alongside (not inside) `db-connections.json`. First use of
      `safeStorage` in this repo.
- [ ] Add `desktop/src/main/ipc/database.ts`: handlers for every Theme A channel, calling into
      `db-engine`'s `connection-pool`/`introspect`/drivers, returning the `{ok:true|false}`
      envelope — never throwing across the IPC boundary.
- [ ] Wire `desktop/src/preload/index.ts`'s bridge implementation for `window.midniteStudio.db.*`.
- [ ] `connections-store.test.ts`, `database-ipc.test.ts` (mocked drivers): save/list/delete
      round-trip, a failed connection surfacing `{ok:false}` rather than throwing, the
      credential vault never appearing in a `JSON.stringify` of the non-secret store.

### E — Sidebar nav + Database view shell (S)

- [ ] Add `'database'` to `ViewId` in
      [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) and `viewForPath`.
- [ ] Add a `Database` entry to `WORKSPACE_NAV_ITEMS` in
      [`app.tsx`](../../../packages/app/src/app.tsx) — the fourth entry in the Workspace group,
      after Explorer/Search/Tests, ungated (not in `FORGE_GATED_VIEWS`).
- [ ] Icon: `LuDatabase` from `react-icons/lu`, registered in
      [`components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) per
      [`CLAUDE.md`](../../../CLAUDE.md)'s one-icon-family rule.
- [ ] Add `packages/app/src/features/database/database-view.tsx`: the view shell — a connection
      tree on the left, the tab strip + active tab's content on the right, an empty state when no
      connection exists yet.
- [ ] Add `packages/app/src/store/database-connections-store.ts`: the renderer's connection list
      and active-connection selection, zustand, matching the existing `*-store.ts` pattern.
- [ ] No nav chord — see Decision 4.

### F — Schema tree browser (M)

- [ ] Add `features/database/connection-tree.tsx`: per-connection lazy-loaded tree — schemas →
      tables/views → columns, using the same tree-row primitive
      [`components/tree-section.tsx`](../../../packages/app/src/components/tree-section.tsx)
      already provides.
- [ ] Add `features/database/connection-dialog.tsx`: add/edit-connection form (provider picker,
      host/port/database/username/password fields, a "Test connection" action hitting
      `testConnection` before save).
- [ ] Each connection row exposes an "Open query tab" action and a per-table "Preview data"
      action (runs `SELECT * FROM <table> LIMIT 200` into a new query tab, pre-filled).
- [ ] Column rows carry primary-key and foreign-key markers, feeding Theme H's editability check.
- [ ] `connection-tree.test.tsx`: lazy-load triggering, PK/FK markers rendering.

### G — Query tab editor (M)

- [ ] Generalize `WorkbenchTab`/`WorkbenchTabKind` in
      [`store/workbench-store.ts`](../../../packages/app/src/store/workbench-store.ts) to add a
      `'query'` kind (sql text, connectionId, dirty flag, last result reference) and to be
      instantiable per-view rather than singleton-scoped to the Changes view — the Database view
      creates its own instance.
- [ ] Confirm [`features/workbench/tab-strip.tsx`](../../../packages/app/src/features/workbench/tab-strip.tsx)'s
      `KIND_ICON` map and close/new-tab affordances extend to the new kind with no structural
      change to the component itself — the generalization is entirely in the store's scoping.
- [ ] Add `@codemirror/lang-sql` as a new dependency; add `features/database/query-editor.tsx`
      reusing [`code-editor.tsx`](../../../packages/app/src/features/files/preview/code-editor.tsx)'s
      existing CodeMirror setup with the SQL language extension swapped in.
- [ ] `Mod+Enter` runs the active query tab's statement (consistent with any existing "run"
      chord conventions in `keybindings.ts` — reuse a chord that already exists for "execute" if
      one does, otherwise no chord, following Decision 4's "ungated view gets no chord budget"
      reasoning).
- [ ] `workbench-store.test.ts` additions: `'query'` kind lifecycle, per-view store isolation
      (a Database-view tab strip and the Changes-view tab strip never see each other's tabs).

### H — Results grid + inline editing (L)

- [ ] Add `features/database/results-grid.tsx`: virtualized via `@tanstack/react-virtual`
      (matching `graph-view.tsx`/`diff-view.tsx`'s existing usage pattern), columns from
      `QueryResult.columns`, rows windowed rather than fully mounted.
- [ ] Inline cell editing: double-click commits to a local "pending edits" map keyed by row +
      column, visually marked (matching the unsaved-tab-dot convention `tab-strip.tsx` already
      uses for dirty state).
- [ ] "Submit edits" generates one `UPDATE <table> SET <col>=<val> WHERE <pk>=<original pk
      value>` per edited row, using Theme F's PK metadata — refuses to enable editing on a
      result set whose source table has no detected primary key.
- [ ] Staleness re-check before applying (Decision 2): re-`SELECT` the row by PK immediately
      before the `UPDATE`; if its current values differ from what was read when the cell was
      opened for editing, surface a conflict banner instead of silently overwriting.
- [ ] Export visible results as CSV (a small, self-contained addition riding the same grid data —
      not a generalized import/export system).
- [ ] `results-grid.test.tsx`: virtualization windowing, pending-edit tracking, generated
      `UPDATE` statement shape, the staleness-conflict path.

### I — Destructive-statement safety gate (S)

- [ ] Before executing a query tab's SQL, run Theme B's `statement-kind.ts` sniffer; a `'write'`
      result routes through
      [`confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) naming the
      statement, the target connection, and a row-count estimate (`EXPLAIN`-derived where the
      provider supports it, otherwise omitted rather than guessed).
- [ ] `'read'` statements (including CTE-wrapped `SELECT`s) execute immediately, no dialog.
- [ ] `statement-confirm.test.tsx`: the gate firing for each of
      UPDATE/DELETE/DROP/TRUNCATE/ALTER/INSERT, and passing SELECT/EXPLAIN straight through.

### J — Verification (M)

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: nothing in `db-engine` imports `electron`, `app` or `desktop`;
      `packages/app` reaches every new capability only through `window.midniteStudio.db.*`.
- [ ] Playwright: Database appears in the Workspace nav group; adding a SQLite connection (no
      external service needed in CI), browsing its schema tree, opening a query tab, running a
      `SELECT`, and seeing results render.
- [ ] Playwright: a destructive statement against the SQLite fixture shows the confirm dialog and
      is blocked until confirmed.
- [ ] Playwright: editing a cell, submitting, and re-querying shows the new value; a manufactured
      staleness conflict (row changed between read and submit) shows the conflict banner instead
      of silently overwriting.
- [ ] Playwright: opening two query tabs against the same connection keeps their SQL and results
      independent; closing one leaves the other untouched.
- [ ] Screenshots of the Database view (empty state, connected with schema tree, query tab with
      results, confirm dialog, conflict banner), light and dark.
- [ ] **Open, for a human:** a real round-trip against a real Postgres/MySQL/MariaDB/MSSQL
      instance each (Theme B's CI fixtures cover shape and behavior, not a live network path);
      whether the no-SSH-tunnel restriction (Decision 1) is a blocker for real usage after a
      week of trying it against actual infrastructure.

---

## Files this phase touches

**New**
- [`packages/shared/src/domain/database.ts`](../../../packages/shared/src/domain/database.ts) — contracts (A).
- `packages/db-engine/` (new package) — `src/driver.ts`, `drivers/{postgres,mysql,mariadb,mssql,sqlite}.ts`, `connection-pool.ts`, `introspect.ts`, `statement-kind.ts` (B, C).
- `packages/desktop/src/main/db/connections-store.ts` · `credential-vault.ts` · `packages/desktop/src/main/ipc/database.ts` (D).
- `packages/app/src/store/database-connections-store.ts` (E).
- `packages/app/src/features/database/database-view.tsx` · `connection-tree.tsx` · `connection-dialog.tsx` · `query-editor.tsx` · `results-grid.tsx` (E, F, G, H).

**Changed**
- [`packages/shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) · [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) · [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — new channels (A).
- [`packages/desktop/src/preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — bridge wiring (D).
- [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `ViewId`, `viewForPath` (E).
- [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) — `WORKSPACE_NAV_ITEMS` entry (E).
- [`packages/app/src/components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) — `LuDatabase` mapping (E).
- [`packages/app/src/store/workbench-store.ts`](../../../packages/app/src/store/workbench-store.ts) · [`features/workbench/tab-strip.tsx`](../../../packages/app/src/features/workbench/tab-strip.tsx) — `'query'` kind, per-view scoping (G).
- [`eslint.config.mjs`](../../../eslint.config.mjs) — new `db-engine` boundary block (B).
- `packages/app/package.json` — `@codemirror/lang-sql` (G).

---

## Verification

See Theme J above — reproduced here per house convention: `moon run :typecheck :lint :test`
green, boundary lint clean, the Database view's full connect → browse → query → edit flow proven
end-to-end against a SQLite fixture in CI, and a human pass against real Postgres/MySQL/MariaDB/
MSSQL instances plus a judgment call on the no-SSH-tunnel restriction.

---

## Decisions / open questions

1. **No SSH tunneling or SSL/TLS config in v1.** *Settled in the brainstorm, flagged as a real
   gap.* A connection is host/port/database/user/password typed by hand — many real production
   databases sit behind a bastion or require TLS, and this phase does not solve that. Recorded
   rather than silently dropped; revisit once the core client has usage behind it. See Theme J's
   open human item.
2. **Inline edits re-check for staleness before applying, rather than overwriting blind.**
   *Settled.* An edited cell's row is re-read by primary key immediately before the generated
   `UPDATE` runs; a mismatch against the value read when editing began surfaces a conflict
   banner instead of applying silently.
3. **Five providers, SQLite isolated as its own theme for its native-module risk.** *Settled.*
   Postgres/MySQL/MariaDB/MSSQL are pure-JS; `better-sqlite3` carries the same class of
   per-Electron-version ABI-rebuild risk `node-pty` already does, named explicitly rather than
   bundled in without comment.
4. **No nav chord for the Database view.** *Recommendation, not yet settled.* Mirrors Phase 59
   Decision 5's reasoning: a niche view most sessions may not touch every day doesn't need a
   reserved keybinding slot; reachable via the rail click and the command palette. Revisit if
   usage says otherwise.
5. **`db-engine`'s provider drivers are tested against real, ephemeral instances rather than
   mocked.** *Recommendation, not yet settled.* Postgres/MySQL/MariaDB have official GitHub
   Actions service-container images; MSSQL's is heavier. If CI cost or flakiness makes that
   impractical for all four, the fallback is a documented subset run in CI with the rest
   verified manually per release — this is a call worth making once Theme B is actually being
   built, not before.
