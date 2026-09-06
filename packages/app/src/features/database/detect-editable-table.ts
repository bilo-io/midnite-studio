import type { SchemaTree } from '@midnite/studio-shared';

export type EditableTable = { schema?: string; name: string; primaryKeyColumns: string[] };

/**
 * Whether a query's result set can be edited: only when the SQL is
 * recognisably `SELECT * FROM <table>` (optionally schema-qualified,
 * optionally `LIMIT n`) against a table this connection's schema tree knows
 * about **and which has a detected primary key**.
 *
 * Deliberately a SQL-shape sniff, not a real parser — this app has none, and
 * a false negative here is safe (editing simply stays off) while a false
 * positive is not. Every join, aggregate, computed column, or plain `SELECT
 * col1, col2 FROM …` therefore returns `null`: none of those are provably
 * "one row of one real table" from the SQL text alone, which is exactly the
 * doc's own bar ("refuses to enable editing at all when the result set's
 * source table has no detected primary key — which includes every join,
 * aggregate and expression column").
 */
const SIMPLE_SELECT_STAR = /^\s*SELECT\s+\*\s+FROM\s+([`"[\]\w.]+)\s*(?:LIMIT\s+\d+\s*)?;?\s*$/i;

export function detectEditableTable(
  sql: string,
  schemaTree: SchemaTree | undefined,
): EditableTable | null {
  if (!schemaTree) return null;
  const match = SIMPLE_SELECT_STAR.exec(sql);
  if (!match) return null;

  const raw = match[1] ?? '';
  const unquoted = raw.replace(/[`"[\]]/g, '');
  const parts = unquoted.split('.');
  const name = parts[parts.length - 1] ?? unquoted;
  const schema = parts.length > 1 ? parts[0] : undefined;

  const table = schemaTree.tables.find(
    (t) => t.name === name && (schema === undefined || t.schema === schema),
  );
  if (!table) return null;

  const primaryKeyColumns = table.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
  if (primaryKeyColumns.length === 0) return null;

  return { ...(table.schema ? { schema: table.schema } : {}), name: table.name, primaryKeyColumns };
}
