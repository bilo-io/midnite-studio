import type { DbProvider } from '@midnite/studio-shared';

/**
 * Quote an identifier (table/column/schema name) per the target provider's own
 * dialect, so a generated statement never interpolates a raw name — the same
 * rule Theme H's generated `UPDATE` and the "Preview data" action's `SELECT`
 * both depend on.
 */
export function quoteIdentifier(provider: DbProvider, name: string): string {
  switch (provider) {
    case 'mysql':
    case 'mariadb':
      return `\`${name.replace(/`/g, '``')}\``;
    case 'mssql':
      return `[${name.replace(/]/g, ']]')}]`;
    case 'postgres':
    case 'sqlite':
      return `"${name.replace(/"/g, '""')}"`;
  }
}

/** `schema.table`, quoted, when a schema exists — otherwise just the table. */
export function quoteQualifiedTable(
  provider: DbProvider,
  table: { name: string; schema?: string },
): string {
  const quotedTable = quoteIdentifier(provider, table.name);
  return table.schema ? `${quoteIdentifier(provider, table.schema)}.${quotedTable}` : quotedTable;
}
