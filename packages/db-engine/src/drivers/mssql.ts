import { Connection, Request } from 'tedious';

import type { ConnectionConfig } from '@midnite/studio-shared';

import type { DbDriver } from '../driver';
import { foldSchemaTree, type RawColumnRow } from '../introspect';
import { normalizeRow } from '../normalize';

/**
 * T-SQL has no boolean scalar in a SELECT list — unlike Postgres's
 * `(expr) AS alias`, this needs `CASE WHEN … THEN 1 ELSE 0 END`, read back as
 * an integer. Otherwise the same three-join `INFORMATION_SCHEMA` shape as
 * `postgres.ts` (SQL Server implements the same ANSI views Postgres does,
 * unlike MySQL/MariaDB's simpler single-table `KEY_COLUMN_USAGE`).
 */
const INTROSPECT_SQL = `
SELECT
  c.TABLE_SCHEMA AS table_schema,
  c.TABLE_NAME AS table_name,
  CASE WHEN t.TABLE_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS table_kind,
  c.COLUMN_NAME AS column_name,
  c.DATA_TYPE AS data_type,
  CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS nullable,
  CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
  fk.foreign_table_name AS foreign_table_name,
  fk.foreign_column_name AS foreign_column_name
FROM INFORMATION_SCHEMA.COLUMNS c
JOIN INFORMATION_SCHEMA.TABLES t
  ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
LEFT JOIN (
  SELECT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
  WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
) pk ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA AND pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
LEFT JOIN (
  SELECT kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.COLUMN_NAME,
         ccu.TABLE_NAME AS foreign_table_name, ccu.COLUMN_NAME AS foreign_column_name
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
  JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
    ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND kcu.TABLE_SCHEMA = tc.TABLE_SCHEMA
  JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
    ON ccu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND ccu.TABLE_SCHEMA = tc.TABLE_SCHEMA
  WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
) fk ON fk.TABLE_SCHEMA = c.TABLE_SCHEMA AND fk.TABLE_NAME = c.TABLE_NAME AND fk.COLUMN_NAME = c.COLUMN_NAME
WHERE c.TABLE_SCHEMA <> 'sys'
ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION;
`;

type TediousRowColumn = { value: unknown };
type TediousColumnMeta = { colName: string };

function rowValues(columns: TediousRowColumn[] | Record<string, TediousRowColumn>): unknown[] {
  const list = Array.isArray(columns) ? columns : Object.values(columns);
  return list.map((c) => c.value);
}

function columnNames(
  columns: TediousColumnMeta[] | Record<string, TediousColumnMeta>,
): string[] {
  const list = Array.isArray(columns) ? columns : Object.values(columns);
  return list.map((c) => c.colName);
}

export function createMssqlDriver(config: ConnectionConfig, password: string | undefined): DbDriver {
  const connection = new Connection({
    server: config.host ?? 'localhost',
    authentication: {
      type: 'default',
      options: { userName: config.username ?? '', password: password ?? '' },
    },
    options: {
      port: config.port,
      database: config.database,
      trustServerCertificate: true,
    },
  });

  return {
    connect: () =>
      new Promise((resolve, reject) => {
        connection.connect((err) => (err ? reject(err) : resolve()));
      }),

    disconnect: () =>
      new Promise((resolve) => {
        connection.on('end', () => resolve());
        connection.close();
      }),

    query: (sql, onBatch, { batchSize, signal }) =>
      new Promise((resolve, reject) => {
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

        const onAbort = () => {
          if (settled) return;
          settled = true;
          connection.cancel();
          resolve({ rowCount: total });
        };
        signal.addEventListener('abort', onAbort, { once: true });

        // No wire-level backpressure primitive is exposed here the way
        // `pg-cursor`'s FETCH-based `.read()` gives one — rows are batched
        // on the JS side as they arrive rather than pulled on demand.
        const request = new Request(sql, (err) => {
          if (settled) return;
          settled = true;
          signal.removeEventListener('abort', onAbort);
          if (err) {
            reject(err);
            return;
          }
          flush();
          resolve({ rowCount: total });
        });

        request.on('columnMetadata', (cols) => {
          columns = columnNames(cols as TediousColumnMeta[] | Record<string, TediousColumnMeta>);
        });

        request.on('row', (cols) => {
          if (settled) return;
          batch.push(rowValues(cols as TediousRowColumn[] | Record<string, TediousRowColumn>));
          if (batch.length >= batchSize) flush();
        });

        connection.execSql(request);
      }),

    introspect: () =>
      new Promise((resolve, reject) => {
        const rows: unknown[][] = [];
        const request = new Request(INTROSPECT_SQL, (err) => {
          if (err) {
            reject(err);
            return;
          }
          const raw: RawColumnRow[] = rows.map((row) => ({
            tableSchema: row[0] as string,
            tableName: row[1] as string,
            tableKind: row[2] as 'table' | 'view',
            columnName: row[3] as string,
            dataType: row[4] as string,
            nullable: row[5] === 1,
            isPrimaryKey: row[6] === 1,
            references:
              row[7] !== null && row[8] !== null
                ? { table: row[7] as string, column: row[8] as string }
                : null,
          }));
          resolve(foldSchemaTree(config.id, raw));
        });
        request.on('row', (cols) => {
          rows.push(rowValues(cols as TediousRowColumn[] | Record<string, TediousRowColumn>));
        });
        connection.execSql(request);
      }),
  };
}
