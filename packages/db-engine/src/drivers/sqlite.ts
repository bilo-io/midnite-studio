import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConnectionConfig } from '@midnite/studio-shared';

import type { DbDriver } from '../driver';
import { foldSchemaTree, type RawColumnRow } from '../introspect';
import { normalizeRow } from '../normalize';

// eslint-disable-next-line @typescript-eslint/no-require-imports
type BetterSqlite3Ctor = typeof import('better-sqlite3');
type BetterSqlite3Db = InstanceType<BetterSqlite3Ctor>;

/**
 * `better-sqlite3` is the repo's second native module and its first with a
 * genuine dual-ABI story: it must load under **Node 22.12.0** (ABI 127) for
 * `db-engine`'s own bare-vitest run and under **Electron 33.4.11** (ABI 130)
 * for the packaged app (see `rebuild-native.mjs`, extended in this same batch
 * to rebuild this module alongside `node-pty`).
 *
 * Decision 6 recommended `node:sqlite` first, to sidestep the dual-ABI story
 * entirely. Checked against this repo's actual pins rather than assumed:
 * `node:sqlite` needs Node ≥22.5 behind `--experimental-sqlite`, which Node
 * 22.12.0 (this repo's pin) satisfies — but **Electron 33.4.11 bundles Node
 * 20.18.3**, not 22, so `node:sqlite` is not merely thin there, it does not
 * exist at all (`No such built-in module: node:sqlite`, verified by running
 * the packaged Electron binary directly). That rules out (c) outright, so
 * this driver is (a): `better-sqlite3`, rebuilt per-ABI by `rebuild-native.mjs`.
 *
 * Loaded through the same unpacked-path fallback the broker already uses for
 * `node-pty` (`broker/index.ts`): when this module is bundled into `main.js`
 * its own `.node` binary cannot be inlined by esbuild (it stays `external`,
 * see `bundle.mjs`) and ships unpacked alongside the asar
 * (`electron-builder.yml`'s `asarUnpack`). Under bare vitest there is no asar
 * at all, so the unpacked path simply does not exist and this falls straight
 * through to a normal `require`.
 */
function loadBetterSqlite3(): BetterSqlite3Ctor {
  try {
    const unpacked = join(
      __dirname,
      '..',
      '..',
      'app.asar.unpacked',
      'node_modules',
      'better-sqlite3',
    );
    if (existsSync(unpacked)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(unpacked) as BetterSqlite3Ctor;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('better-sqlite3') as BetterSqlite3Ctor;
  } catch (err) {
    throw new Error(
      `Failed to load better-sqlite3 (native module) — it may need rebuilding for this ` +
        `runtime's ABI (see \`moon run desktop:rebuild-native\`): ${
          err instanceof Error ? err.message : String(err)
        }`,
      { cause: err },
    );
  }
}

type TableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};

type ForeignKeyRow = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
};

type SqliteMasterRow = { name: string; type: 'table' | 'view' };

/** `"` doubled, matching every other double-quoted dialect (Postgres too). */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * SQLite's `DbDriver`. `config.sqlitePath` is required (validated at
 * `connect()` time rather than construction, matching the other drivers,
 * which do not validate their own required fields until a real connect is
 * attempted either).
 *
 * `password` is accepted (for `DbDriverFactory` shape parity) and ignored —
 * a SQLite file has no credential.
 */
export function createSqliteDriver(config: ConnectionConfig): DbDriver {
  let db: BetterSqlite3Db | null = null;

  const requireDb = (): BetterSqlite3Db => {
    if (!db) throw new Error('SQLite driver is not connected.');
    return db;
  };

  return {
    connect: async () => {
      if (!config.sqlitePath) {
        throw new Error('This SQLite connection has no file path configured.');
      }
      const Database = loadBetterSqlite3();
      db = new Database(config.sqlitePath);
    },

    disconnect: async () => {
      db?.close();
      db = null;
    },

    /**
     * `better-sqlite3` is synchronous end-to-end — there is no cursor/stream
     * API to reach for, unlike the pure-JS drivers. `Statement.iterate()` is
     * the closest analogue: it steps the prepared statement one row at a
     * time rather than materialising the whole result set, which is what
     * lets this batch without ever holding more than `batchSize` rows.
     * `signal.aborted` is checked between rows — the only cancellation point
     * a synchronous engine offers.
     *
     * Only a single statement is supported per call (`better-sqlite3.prepare`
     * itself refuses more than one) — a genuinely multi-statement input falls
     * back to `db.exec`, which runs all of them but returns no rows, matching
     * a DDL/migration-style batch rather than a browsable result set.
     */
    query: async (sql, onBatch, { batchSize, signal }) => {
      const database = requireDb();
      let stmt;
      try {
        stmt = database.prepare(sql);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('more than one statement')) {
          database.exec(sql);
          return { rowCount: 0 };
        }
        throw err;
      }

      if (!stmt.reader) {
        const info = stmt.run();
        return { rowCount: info.changes };
      }

      stmt.raw(true);
      const columns = stmt.columns().map((c) => c.name);
      let total = 0;
      let batch: unknown[][] = [];
      for (const row of stmt.iterate() as IterableIterator<unknown[]>) {
        if (signal.aborted) break;
        batch.push(normalizeRow(row));
        total += 1;
        if (batch.length >= batchSize) {
          onBatch({ columns, rows: batch });
          batch = [];
        }
      }
      if (batch.length > 0 && !signal.aborted) onBatch({ columns, rows: batch });
      return { rowCount: total };
    },

    /**
     * `sqlite_master` for tables/views, `PRAGMA table_info`/`foreign_key_list`
     * per table for columns/PK/FK — SQLite has no `information_schema`. No
     * `tableSchema` (`null`), matching `RawColumnRow`'s own note: SQLite has
     * no schema namespace.
     */
    introspect: async () => {
      const database = requireDb();
      const tables = database
        .prepare(
          `SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`,
        )
        .all() as SqliteMasterRow[];

      const rows: RawColumnRow[] = [];
      for (const table of tables) {
        const quoted = quoteIdent(table.name);
        const columns = database.prepare(`PRAGMA table_info(${quoted})`).all() as TableInfoRow[];
        const fks = database.prepare(`PRAGMA foreign_key_list(${quoted})`).all() as ForeignKeyRow[];
        for (const column of columns) {
          const fk = fks.find((f) => f.from === column.name);
          rows.push({
            tableSchema: null,
            tableName: table.name,
            tableKind: table.type,
            columnName: column.name,
            dataType: column.type || 'TEXT',
            nullable: column.notnull === 0,
            isPrimaryKey: column.pk > 0,
            references: fk ? { table: fk.table, column: fk.to } : null,
          });
        }
      }
      return foldSchemaTree(config.id, rows);
    },
  };
}
