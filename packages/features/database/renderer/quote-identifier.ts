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

/**
 * The bind-parameter placeholder for position `index` (0-based), per
 * provider — the piece that makes a generated statement's parameterisation
 * real rather than nominal. `db-engine`'s drivers bind values through each
 * client's own native API (Theme H); this only has to emit the placeholder
 * TEXT that API expects in the `sql` string itself.
 */
export function placeholderFor(provider: DbProvider, index: number): string {
  switch (provider) {
    case 'postgres':
      return `$${index + 1}`;
    case 'mssql':
      return `@p${index}`;
    case 'mysql':
    case 'mariadb':
    case 'sqlite':
      return '?';
  }
}
