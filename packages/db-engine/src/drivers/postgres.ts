import Cursor from 'pg-cursor';
import { Client, type QueryResult } from 'pg';

import type { ConnectionConfig } from '@midnite/studio-shared';

import type { DbDriver } from '../driver';
import { foldSchemaTree, type RawColumnRow } from '../introspect';
import { normalizeRow } from '../normalize';

/**
 * Every table/view/column, plus PK/FK, in one pass — the same three-join
 * shape most tools use over `information_schema`. Schema introspection stops
 * at PK/FK; indexes, triggers and stored procedures are not read (v1 scope).
 */
const INTROSPECT_SQL = `
SELECT
  c.table_schema AS table_schema,
  c.table_name AS table_name,
  CASE WHEN t.table_type = 'VIEW' THEN 'view' ELSE 'table' END AS table_kind,
  c.column_name AS column_name,
  c.data_type AS data_type,
  (c.is_nullable = 'YES') AS nullable,
  (pk.column_name IS NOT NULL) AS is_primary_key,
  fk.foreign_table_name AS foreign_table_name,
  fk.foreign_column_name AS foreign_column_name
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
LEFT JOIN (
  SELECT kcu.table_schema, kcu.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY'
) pk ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name
LEFT JOIN (
  SELECT kcu.table_schema, kcu.table_name, kcu.column_name,
         ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
) fk ON fk.table_schema = c.table_schema AND fk.table_name = c.table_name AND fk.column_name = c.column_name
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position;
`;

/** Read a batch off a pg-cursor with the callback overload, which is the only one that also hands back `result.fields`. */
function readCursorBatch(
  cursor: Cursor,
  maxRows: number,
): Promise<{ rows: unknown[][]; fields: QueryResult['fields'] }> {
  return new Promise((resolve, reject) => {
    cursor.read(maxRows, (err, rows, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ rows: rows as unknown[][], fields: result.fields });
    });
  });
}

export function createPostgresDriver(config: ConnectionConfig, password: string | undefined): DbDriver {
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password,
  });

  return {
    connect: async () => {
      await client.connect();
    },
    disconnect: async () => {
      await client.end();
    },

    query: async (sql, onBatch, { batchSize, signal }) => {
      const cursor = client.query(new Cursor(sql, [], { rowMode: 'array' }));
      let cancelled = false;
      const onAbort = () => {
        cancelled = true;
      };
      signal.addEventListener('abort', onAbort, { once: true });

      let total = 0;
      let columns: string[] = [];
      try {
        for (;;) {
          if (cancelled) break;
          const { rows, fields } = await readCursorBatch(cursor, batchSize);
          if (columns.length === 0 && fields.length > 0) columns = fields.map((f) => f.name);
          if (cancelled) break;
          if (rows.length > 0) {
            onBatch({ columns, rows: rows.map(normalizeRow) });
            total += rows.length;
          }
          if (rows.length < batchSize) break;
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
        await cursor.close();
      }
      return { rowCount: total };
    },

    introspect: async () => {
      const result = await client.query<{
        table_schema: string;
        table_name: string;
        table_kind: 'table' | 'view';
        column_name: string;
        data_type: string;
        nullable: boolean;
        is_primary_key: boolean;
        foreign_table_name: string | null;
        foreign_column_name: string | null;
      }>(INTROSPECT_SQL);

      const rows: RawColumnRow[] = result.rows.map((row) => ({
        tableSchema: row.table_schema,
        tableName: row.table_name,
        tableKind: row.table_kind,
        columnName: row.column_name,
        dataType: row.data_type,
        nullable: row.nullable,
        isPrimaryKey: row.is_primary_key,
        references:
          row.foreign_table_name !== null && row.foreign_column_name !== null
            ? { table: row.foreign_table_name, column: row.foreign_column_name }
            : null,
      }));
      return foldSchemaTree(config.id, rows);
    },
  };
}
