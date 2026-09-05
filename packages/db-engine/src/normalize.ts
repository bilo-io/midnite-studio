/**
 * Every driver normalises `Date`, `Buffer`/`Uint8Array`, `bigint` and `null`
 * before a cell reaches the wire — `bigint` does not survive
 * `JSON.stringify` over IPC and throws, and neither `Date` nor `Buffer`
 * structured-clone into anything the renderer's grid can render directly.
 *
 * One shared function rather than four copies (one per driver): every
 * provider's client can hand back any of these four shapes for an ordinary
 * column type (a `numeric`/`bigint` column, a `timestamp`, a `bytea`/`BLOB`),
 * and the encoding has to be identical regardless of which driver produced
 * it — a `bigint` from Postgres and one from MySQL must serialise to the
 * same string shape, or the grid would need to know which provider it was
 * rendering.
 */
export function normalizeCell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  return value;
}

export function normalizeRow(row: readonly unknown[]): unknown[] {
  return row.map(normalizeCell);
}
