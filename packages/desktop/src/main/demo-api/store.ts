import { randomUUID } from 'node:crypto';

/**
 * The demo API's data: in-memory collections, reset on stop, nothing persisted.
 *
 * There is deliberately no schema. A collection is created by writing to it, a
 * record is whatever JSON object you POST plus three fields this module owns
 * (`id`, `createdAt`, `updatedAt`) — the point is that a workflow author can
 * point an `http` node at `/anything` and immediately have something to read
 * back, without first configuring a shape.
 */

/** Ids and timestamps are ours; everything else in a record is the caller's. */
export type DemoRecord = {
  id: string;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
};

/**
 * Per-collection ceiling, oldest evicted.
 *
 * A workflow that POSTs in a loop is the expected way to use this thing, and
 * unbounded growth here is main's heap, not a scratch file — so the cap is
 * enforced on insert rather than left to anything downstream.
 */
export const DEMO_COLLECTION_CAP = 1_000;

const collections = new Map<string, DemoRecord[]>();

/**
 * Read-only view of a collection. Never creates one.
 *
 * `DEMO_COLLECTION_CAP` bounds records *within* a collection, but nothing
 * bounds how many collections exist — so a create-on-read would let a workflow
 * looping `GET /{{n.id}}` grow main's heap one permanent empty array at a time
 * until the server is stopped.
 */
const EMPTY: readonly DemoRecord[] = [];

function read(collection: string): readonly DemoRecord[] {
  return collections.get(collection) ?? EMPTY;
}

/** Write path only — this is the one place a collection comes into being. */
function bucket(collection: string): DemoRecord[] {
  const existing = collections.get(collection);
  if (existing) return existing;
  const created: DemoRecord[] = [];
  collections.set(collection, created);
  return created;
}

/** Test-only: proves a read never brings a collection into being. */
export function collectionCount(): number {
  return collections.size;
}

export function resetDemoStore(): void {
  collections.clear();
}

export function listRecords(
  collection: string,
  query: { limit?: number; offset?: number; filters?: Record<string, string> } = {},
): { records: readonly DemoRecord[]; total: number } {
  let records = read(collection);

  const filters = query.filters ?? {};
  const keys = Object.keys(filters);
  if (keys.length > 0) {
    records = records.filter((record) =>
      // Compared as strings: a query param has no types, and `?id=3` matching
      // the number 3 is what a caller means every time.
      keys.every((key) => String(record[key] ?? '') === filters[key]),
    );
  }

  const total = records.length;
  const offset = query.offset ?? 0;
  const limit = query.limit ?? records.length;
  return { records: records.slice(offset, offset + limit), total };
}

export function getRecord(collection: string, id: string): DemoRecord | undefined {
  return read(collection).find((record) => record.id === id);
}

export function createRecord(collection: string, body: Record<string, unknown>): DemoRecord {
  const now = Date.now();
  // `id`/`createdAt`/`updatedAt` are ours: a body carrying its own is
  // overwritten rather than honoured, so two POSTs can never collide on an id.
  const record: DemoRecord = { ...body, id: randomUUID(), createdAt: now, updatedAt: now };
  const records = bucket(collection);
  records.push(record);
  if (records.length > DEMO_COLLECTION_CAP) records.splice(0, records.length - DEMO_COLLECTION_CAP);
  return record;
}

/** PUT: replaces every caller-owned field. The three owned ones survive. */
export function replaceRecord(
  collection: string,
  id: string,
  body: Record<string, unknown>,
): DemoRecord | undefined {
  const records = collections.get(collection);
  if (!records) return undefined;
  const index = records.findIndex((record) => record.id === id);
  const current = records[index];
  if (index === -1 || !current) return undefined;
  const next: DemoRecord = {
    ...body,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
  };
  records[index] = next;
  return next;
}

/** PATCH: merges. The distinction from PUT is the point of shipping both. */
export function mergeRecord(
  collection: string,
  id: string,
  body: Record<string, unknown>,
): DemoRecord | undefined {
  const records = collections.get(collection);
  if (!records) return undefined;
  const index = records.findIndex((record) => record.id === id);
  const current = records[index];
  if (index === -1 || !current) return undefined;
  const next: DemoRecord = { ...current, ...body, id: current.id, createdAt: current.createdAt, updatedAt: Date.now() };
  records[index] = next;
  return next;
}

export function deleteRecord(collection: string, id: string): boolean {
  const records = collections.get(collection);
  if (!records) return false;
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) return false;
  records.splice(index, 1);
  return true;
}
