import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ConnectionConfig } from '@midnite/studio-shared';

import { createSqliteDriver } from './sqlite';

/**
 * Against a real temp-file SQLite database — no mocking (Decision 6/Theme C).
 * `better-sqlite3` is loaded exactly the way the driver loads it in
 * production: a plain `require`, since there is no asar in a bare-vitest run
 * and `loadBetterSqlite3`'s unpacked-path check simply finds nothing and
 * falls through.
 */
describe('createSqliteDriver', () => {
  let dir: string;
  let dbPath: string;
  let config: ConnectionConfig;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mstudio-sqlite-'));
    dbPath = join(dir, 'test.db');
    config = { id: 'sqlite-test', name: 'sqlite-test', provider: 'sqlite', database: 'test', sqlitePath: dbPath };
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('connects, creates a table, and runs a batched SELECT', async () => {
    const driver = createSqliteDriver(config);
    await driver.connect();
    try {
      await driver.query(
        'CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
        () => {},
        { batchSize: 500, signal: new AbortController().signal },
      );
      await driver.query(
        "INSERT INTO people (id, name) VALUES (1, 'Ada'), (2, 'Grace')",
        () => {},
        { batchSize: 500, signal: new AbortController().signal },
      );

      const batches: { columns: string[]; rows: unknown[][] }[] = [];
      const { rowCount } = await driver.query(
        'SELECT id, name FROM people ORDER BY id',
        (batch) => batches.push(batch),
        { batchSize: 1, signal: new AbortController().signal },
      );

      expect(rowCount).toBe(2);
      expect(batches).toHaveLength(2);
      expect(batches.flatMap((b) => b.rows)).toEqual([
        [1, 'Ada'],
        [2, 'Grace'],
      ]);
      expect(batches[0]?.columns).toEqual(['id', 'name']);
    } finally {
      await driver.disconnect();
    }
  });

  it('stops issuing batches once the signal aborts', async () => {
    const driver = createSqliteDriver(config);
    await driver.connect();
    try {
      await driver.query(
        'CREATE TABLE nums (n INTEGER)',
        () => {},
        { batchSize: 500, signal: new AbortController().signal },
      );
      const values = Array.from({ length: 20 }, (_, i) => `(${i})`).join(',');
      await driver.query(`INSERT INTO nums (n) VALUES ${values}`, () => {}, {
        batchSize: 500,
        signal: new AbortController().signal,
      });

      const controller = new AbortController();
      const batches: { columns: string[]; rows: unknown[][] }[] = [];
      await driver.query(
        'SELECT n FROM nums ORDER BY n',
        (batch) => {
          batches.push(batch);
          controller.abort();
        },
        { batchSize: 1, signal: controller.signal },
      );

      expect(batches.length).toBeLessThan(20);
    } finally {
      await driver.disconnect();
    }
  });

  it('introspects tables, columns, primary keys and foreign keys', async () => {
    const driver = createSqliteDriver(config);
    await driver.connect();
    try {
      const noop = () => {};
      const sig = () => new AbortController().signal;
      await driver.query(
        'CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL)',
        noop,
        { batchSize: 500, signal: sig() },
      );
      await driver.query(
        'CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT, author_id INTEGER REFERENCES authors(id))',
        noop,
        { batchSize: 500, signal: sig() },
      );
      await driver.query('CREATE VIEW book_titles AS SELECT title FROM books', noop, {
        batchSize: 500,
        signal: sig(),
      });

      const tree = await driver.introspect();
      expect(tree.connectionId).toBe('sqlite-test');

      const authors = tree.tables.find((t) => t.name === 'authors');
      expect(authors?.kind).toBe('table');
      expect(authors?.schema).toBeUndefined();
      const idColumn = authors?.columns.find((c) => c.name === 'id');
      expect(idColumn?.isPrimaryKey).toBe(true);

      const books = tree.tables.find((t) => t.name === 'books');
      const authorIdColumn = books?.columns.find((c) => c.name === 'author_id');
      expect(authorIdColumn?.references).toEqual({ table: 'authors', column: 'id' });

      const view = tree.tables.find((t) => t.name === 'book_titles');
      expect(view?.kind).toBe('view');
    } finally {
      await driver.disconnect();
    }
  });

  it('runs a non-SELECT statement via run() and reports changes as rowCount', async () => {
    const driver = createSqliteDriver(config);
    await driver.connect();
    try {
      const sig = () => new AbortController().signal;
      await driver.query('CREATE TABLE t (n INTEGER)', () => {}, { batchSize: 500, signal: sig() });
      const { rowCount } = await driver.query(
        'INSERT INTO t (n) VALUES (1), (2), (3)',
        () => {},
        { batchSize: 500, signal: sig() },
      );
      expect(rowCount).toBe(3);
    } finally {
      await driver.disconnect();
    }
  });

  it('rejects when connect() is called without a sqlitePath', async () => {
    const driver = createSqliteDriver({ ...config, sqlitePath: undefined });
    await expect(driver.connect()).rejects.toThrow(/file path/i);
  });
});
