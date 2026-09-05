import { describe, expect, it } from 'vitest';

import {
  ConnectionConfigSchema,
  DbOpResultOf,
  DbProviderSchema,
  QueryResultSchema,
  SchemaTreeSchema,
  StatementKindSchema,
} from './database';

describe('DbProviderSchema', () => {
  it('round-trips every provider', () => {
    for (const provider of ['postgres', 'mysql', 'mariadb', 'mssql', 'sqlite'] as const) {
      expect(DbProviderSchema.parse(provider)).toBe(provider);
    }
  });
});

describe('ConnectionConfigSchema', () => {
  it('round-trips a host-shaped connection with no password field', () => {
    const config = {
      id: 'c1',
      name: 'Local Postgres',
      provider: 'postgres' as const,
      host: 'localhost',
      port: 5432,
      database: 'app',
      username: 'app_user',
    };
    expect(ConnectionConfigSchema.parse(config)).toEqual(config);
    // The secret never crosses into this shape at all.
    expect('password' in ConnectionConfigSchema.shape).toBe(false);
  });

  it('round-trips a file-shaped SQLite connection with no host/port/username', () => {
    const config = {
      id: 'c2',
      name: 'Local SQLite',
      provider: 'sqlite' as const,
      database: 'main',
      sqlitePath: '/tmp/app.db',
    };
    expect(ConnectionConfigSchema.parse(config)).toEqual(config);
  });
});

describe('SchemaTreeSchema', () => {
  it('round-trips tables, views, columns and a foreign-key reference', () => {
    const tree = {
      connectionId: 'c1',
      tables: [
        {
          name: 'orders',
          schema: 'public',
          kind: 'table' as const,
          columns: [
            { name: 'id', type: 'int4', nullable: false, isPrimaryKey: true, references: null },
            {
              name: 'customer_id',
              type: 'int4',
              nullable: false,
              isPrimaryKey: false,
              references: { table: 'customers', column: 'id' },
            },
          ],
        },
        {
          name: 'order_totals',
          kind: 'view' as const,
          columns: [
            { name: 'total', type: 'numeric', nullable: true, isPrimaryKey: false, references: null },
          ],
        },
      ],
    };
    expect(SchemaTreeSchema.parse(tree)).toEqual(tree);
  });
});

describe('QueryResultSchema', () => {
  it('renders duplicate column names by position, not by key', () => {
    // `SELECT a.id, b.id FROM a JOIN b` — an object keyed by name would
    // silently drop one `id`. Positional rows keep both.
    const result = {
      columns: ['id', 'id'],
      rows: [[1, 2]],
      rowCount: 1,
      durationMs: 4,
    };
    const parsed = QueryResultSchema.parse(result);
    expect(parsed.columns).toEqual(['id', 'id']);
    expect(parsed.rows[0]).toEqual([1, 2]);
  });

  it('accepts normalised bigint/Date/Buffer cells as their encoded string form', () => {
    const result = {
      columns: ['n', 'created_at', 'blob'],
      rows: [['9007199254740993', '2024-01-01T00:00:00.000Z', 'aGVsbG8=']],
      rowCount: 1,
      durationMs: 1,
    };
    expect(QueryResultSchema.parse(result)).toEqual(result);
  });
});

describe('StatementKindSchema', () => {
  it('round-trips read and write', () => {
    expect(StatementKindSchema.parse('read')).toBe('read');
    expect(StatementKindSchema.parse('write')).toBe('write');
  });
});

describe('DbOpResultOf', () => {
  it('round-trips a success carrying data and a plain error', () => {
    const schema = DbOpResultOf(QueryResultSchema);
    const success = {
      ok: true as const,
      data: { columns: ['n'], rows: [[1]], rowCount: 1, durationMs: 1 },
    };
    const failure = { ok: false as const, kind: 'error' as const, message: 'connection refused' };
    expect(schema.parse(success)).toEqual(success);
    expect(schema.parse(failure)).toEqual(failure);
  });
});
