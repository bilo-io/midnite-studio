import { createConnection, type Connection, type FieldInfo } from 'mariadb';

import type { ConnectionConfig } from '@midnite/studio-shared';

import type { DbDriver } from '../driver';
import { foldSchemaTree, type RawColumnRow } from '../introspect';
import { normalizeRow } from '../normalize';

/** Same shape as `mysql.ts` — MariaDB shares MySQL's `information_schema` dialect. */
const INTROSPECT_SQL = `
SELECT
  c.TABLE_SCHEMA AS table_schema,
  c.TABLE_NAME AS table_name,
  CASE WHEN t.TABLE_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS table_kind,
  c.COLUMN_NAME AS column_name,
  c.DATA_TYPE AS data_type,
  (c.IS_NULLABLE = 'YES') AS nullable,
  (pk.COLUMN_NAME IS NOT NULL) AS is_primary_key,
  fk.REFERENCED_TABLE_NAME AS foreign_table_name,
  fk.REFERENCED_COLUMN_NAME AS foreign_column_name
FROM information_schema.COLUMNS c
JOIN information_schema.TABLES t
  ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
LEFT JOIN (
  SELECT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME
  FROM information_schema.TABLE_CONSTRAINTS tc
  JOIN information_schema.KEY_COLUMN_USAGE kcu
    ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
   AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
   AND kcu.TABLE_NAME = tc.TABLE_NAME
  WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
) pk ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA AND pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
LEFT JOIN (
  SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE REFERENCED_TABLE_NAME IS NOT NULL
) fk ON fk.TABLE_SCHEMA = c.TABLE_SCHEMA AND fk.TABLE_NAME = c.TABLE_NAME AND fk.COLUMN_NAME = c.COLUMN_NAME
WHERE c.TABLE_SCHEMA = DATABASE()
ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION;
`;

export function createMariadbDriver(config: ConnectionConfig, password: string | undefined): DbDriver {
  let connection: Connection | null = null;

  const requireConnection = (): Connection => {
    if (!connection) throw new Error('MariaDB driver used before connect()');
    return connection;
  };

  return {
    connect: async () => {
      connection = await createConnection({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.username,
        password,
      });
    },

    disconnect: async () => {
      if (connection) await connection.end();
      connection = null;
    },

    query: (sql, onBatch, { batchSize, signal }) =>
      new Promise((resolve, reject) => {
        const conn = requireConnection();
        let columns: string[] = [];
        let batch: unknown[][] = [];
        let total = 0;
        let settled = false;

        const flush = () => {
          if (batch.length === 0) return;
          onBatch({ columns, rows: batch.map(normalizeRow) });
          total += batch.length;
          batch = [];
        };

        const stream = conn.queryStream({ sql, rowsAsArray: true });

        const onAbort = () => {
          if (settled) return;
          settled = true;
          stream.destroy();
          resolve({ rowCount: total });
        };
        signal.addEventListener('abort', onAbort, { once: true });

        stream.on('columns', (fields: FieldInfo[]) => {
          columns = fields.map((f) => f.name());
        });
        stream.on('data', (row: unknown[]) => {
          if (settled) return;
          batch.push(row);
          if (batch.length >= batchSize) {
            stream.pause();
            flush();
            stream.resume();
          }
        });
        stream.on('end', () => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          flush();
          resolve({ rowCount: total });
        });
        stream.on('error', (err: Error) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          reject(err);
        });
      }),

    introspect: async () => {
      const conn = requireConnection();
      const results = (await conn.query({ sql: INTROSPECT_SQL })) as {
        table_schema: string;
        table_name: string;
        table_kind: 'table' | 'view';
        column_name: string;
        data_type: string;
        nullable: number | boolean;
        is_primary_key: number | boolean;
        foreign_table_name: string | null;
        foreign_column_name: string | null;
      }[];

      const rows: RawColumnRow[] = results.map((row) => ({
        tableSchema: row.table_schema,
        tableName: row.table_name,
        tableKind: row.table_kind,
        columnName: row.column_name,
        dataType: row.data_type,
        nullable: Boolean(row.nullable),
        isPrimaryKey: Boolean(row.is_primary_key),
        references:
          row.foreign_table_name !== null && row.foreign_column_name !== null
            ? { table: row.foreign_table_name, column: row.foreign_column_name }
            : null,
      }));
      return foldSchemaTree(config.id, rows);
    },
  };
}
