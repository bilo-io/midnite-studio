import { z } from 'zod';

/**
 * Phase 61 — Database Explorer.
 *
 * The wire contract for a DataGrip-style database client: connections, schema
 * introspection, and query results. This is the first phase to touch anything
 * database-shaped, so nothing here reuses a git-shaped type even where the
 * shape looks similar — see `DbOpResultSchema` below for the one that matters
 * most.
 */

// --- providers ---------------------------------------------------------------

/**
 * Five providers, one of them (`sqlite`) native. Expanding this list is out of
 * scope for this phase (see the phase doc's "Scope guardrails").
 */
export const DB_PROVIDERS = ['postgres', 'mysql', 'mariadb', 'mssql', 'sqlite'] as const;
export const DbProviderSchema = z.enum(DB_PROVIDERS);
export type DbProvider = z.infer<typeof DbProviderSchema>;

// --- connections ---------------------------------------------------------------

/**
 * A saved connection, as it is safe to hand to the renderer, log, or
 * `JSON.stringify`. There is deliberately **no password field** — the secret
 * never crosses into a schema that could log or serialise it whole. The
 * plaintext password exists only transiently, in the IPC *request* that saves
 * or tests a connection (see `schemas.ts`'s `DbSaveConnectionRequest`), and is
 * handed to `credential-vault.ts` immediately rather than kept on this shape.
 *
 * `host`/`port`/`username` are optional and `sqlitePath` exists because SQLite
 * is a file, not a host — a single required-host shape cannot describe both a
 * TCP connection and a file path.
 */
export const ConnectionConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: DbProviderSchema,
  host: z.string().min(1).optional(),
  port: z.number().int().positive().optional(),
  database: z.string().min(1),
  username: z.string().min(1).optional(),
  /** SQLite only — an absolute path to the `.db` file. */
  sqlitePath: z.string().min(1).optional(),
});
export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;

// --- schema introspection ------------------------------------------------------

/**
 * A foreign key target. Introspection stops at primary/foreign keys —
 * indexes, triggers and stored procedures/functions are not read in v1 (see
 * the phase doc's "Scope guardrails").
 */
export const SchemaColumnReferenceSchema = z.object({
  table: z.string().min(1),
  column: z.string().min(1),
});
export type SchemaColumnReference = z.infer<typeof SchemaColumnReferenceSchema>;

export const SchemaColumnSchema = z.object({
  name: z.string().min(1),
  /** The provider's own type name (`varchar(255)`, `int4`, …), shown as-is. */
  type: z.string().min(1),
  nullable: z.boolean(),
  isPrimaryKey: z.boolean(),
  /** `null` when this column is not a foreign key. */
  references: SchemaColumnReferenceSchema.nullable(),
});
export type SchemaColumn = z.infer<typeof SchemaColumnSchema>;

export const SchemaTableKindSchema = z.enum(['table', 'view']);
export type SchemaTableKind = z.infer<typeof SchemaTableKindSchema>;

export const SchemaTableSchema = z.object({
  name: z.string().min(1),
  /** The provider's own namespace (`public`, `dbo`, …), when it has one. */
  schema: z.string().optional(),
  kind: SchemaTableKindSchema,
  columns: z.array(SchemaColumnSchema),
});
export type SchemaTable = z.infer<typeof SchemaTableSchema>;

export const SchemaTreeSchema = z.object({
  connectionId: z.string().min(1),
  tables: z.array(SchemaTableSchema),
});
export type SchemaTree = z.infer<typeof SchemaTreeSchema>;

// --- statements ------------------------------------------------------------

/**
 * `'write'` covers everything that is not a plain read — the discriminant
 * Theme I's confirm gate switches on. A `WITH x AS (…) DELETE FROM y` is
 * `'write'` even though its first keyword is `WITH`; see
 * `db-engine/src/statement-kind.ts` for the sniffer this type describes.
 */
export const StatementKindSchema = z.enum(['read', 'write']);
export type StatementKind = z.infer<typeof StatementKindSchema>;

// --- queries -----------------------------------------------------------------

export const QueryRequestSchema = z.object({
  connectionId: z.string().min(1),
  sql: z.string().min(1),
});
export type QueryRequest = z.infer<typeof QueryRequestSchema>;

/**
 * A normalised query result.
 *
 * `rows` is **positional** (`unknown[][]`), not `Record<string, unknown>[]`:
 * SQL permits duplicate column names in one result set (`SELECT a.id, b.id
 * FROM a JOIN b`), and an object keyed by name silently drops one. The grid
 * renders by index against `columns`.
 *
 * Every driver normalises `Date`, `Buffer`, `bigint` and `null` before a cell
 * reaches this shape — `bigint` does not survive `JSON.stringify` over IPC
 * and throws. Encode as a string; the column's declared `type` tells the grid
 * how to render it.
 */
export const QueryResultSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.unknown())),
  rowCount: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});
export type QueryResult = z.infer<typeof QueryResultSchema>;

// --- result envelope ---------------------------------------------------------

/**
 * The result envelope every `mstudio:db:*` op returns. Ops never throw across
 * IPC — see `shared/src/domain/result.ts`'s `GitOpResult` for the convention
 * this follows.
 *
 * This is the **lighter, two-arm shape**, not `GitOpResult`: a database
 * operation has no `conflict` arm to borrow — a SQL row estimate has no shas
 * and a stale write here is a distinct concept (Decision 2's re-`SELECT`
 * check, not a git merge conflict) — so this is its own envelope rather than
 * a reuse that would leave `kind: 'conflict'` permanently unreachable.
 */
export const DbOpFailureSchema = z.object({
  ok: z.literal(false),
  kind: z.literal('error'),
  /** Human-readable, already mapped from the driver's own error where recognised. */
  message: z.string(),
});
export type DbOpFailure = z.infer<typeof DbOpFailureSchema>;

export const DbOpResultSchema = z.union([z.object({ ok: z.literal(true) }), DbOpFailureSchema]);
export type DbOpResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | DbOpFailure;

export const DbOpResultOf = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.object({ ok: z.literal(true), data: schema }), DbOpFailureSchema]);

export const dbOk = <T = void>(data?: T): DbOpResult<T> =>
  (data === undefined ? { ok: true } : { ok: true, data }) as DbOpResult<T>;

export const dbFailure = <T = void>(message: string): DbOpResult<T> => ({
  ok: false,
  kind: 'error',
  message,
});
