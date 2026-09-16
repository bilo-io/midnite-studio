import { z } from 'zod';

/**
 * Phase 87 — Knowledge: the graph the repo already has.
 *
 * The wire contract for the Knowledge view's IPC surface: reading, projecting
 * and laying out the active repo's own `graphify-out/graph.json` (see
 * `@midnite/studio-knowledge`, which owns the electron-free reader/layout
 * engine this wraps). Nothing here ever writes into `graphify-out/` — the app
 * never runs graphify (phase doc, Decision 4).
 */

// --- the lean graph (Theme A's projection, on the wire) ---------------------

export const KnowledgeGraphNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  community: z.number(),
  communityName: z.string(),
  fileType: z.string(),
});
export type KnowledgeGraphNode = z.infer<typeof KnowledgeGraphNodeSchema>;

export const KnowledgeGraphLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  relation: z.string(),
  weight: z.number(),
});
export type KnowledgeGraphLink = z.infer<typeof KnowledgeGraphLinkSchema>;

export const KnowledgeLayoutPositionSchema = z.object({ x: z.number(), y: z.number() });

/**
 * The lean projection plus Theme A's cached (or freshly computed) layout —
 * everything a canvas needs to paint, seeded from the cache rather than
 * running a force simulation in the renderer (Theme D).
 */
export const KnowledgeGraphPayloadSchema = z.object({
  nodes: z.array(KnowledgeGraphNodeSchema),
  links: z.array(KnowledgeGraphLinkSchema),
  /** Keyed by node id — `noUncheckedIndexedAccess` is on, so callers narrow before use. */
  positions: z.record(z.string(), KnowledgeLayoutPositionSchema),
  builtAtCommit: z.string(),
  /** True when the layout came from Theme A's cache rather than a fresh ForceAtlas2 pass. */
  cached: z.boolean(),
});
export type KnowledgeGraphPayload = z.infer<typeof KnowledgeGraphPayloadSchema>;

// --- node detail (a click's "open this file" fetch) -------------------------

export const KnowledgeNodeDetailSchema = z.object({
  sourceFile: z.string(),
  sourceLocation: z.string(),
});
export type KnowledgeNodeDetail = z.infer<typeof KnowledgeNodeDetailSchema>;

// --- result envelope ---------------------------------------------------------

/**
 * The result envelope every `mstudio:knowledge:*` op returns — ops never
 * throw across IPC, per `shared/src/domain/result.ts`'s `GitOpResult`
 * convention.
 *
 * Deliberately its own envelope rather than a reuse of `GitOpResult` or
 * `DbOpResult`: this domain's failure has FOUR arms, not `GitOpResult`'s two
 * (`conflict`/`error`, neither of which means anything for a file that is
 * simply missing) and not `DbOpResult`'s one. `'absent'` is the load-bearing
 * arm — an un-graphified repo is the common case (phase doc, Theme A), not an
 * error, so it carries no `message` at all; `'unreadable'` and `'malformed'`
 * are both real failures but need different copy (a permissions problem
 * versus a file that parsed but isn't shaped like a graph) and both keep
 * `message`. `'error'` covers everything else (a bad `repoId`, a filesystem
 * surprise mid-layout).
 */
export const KnowledgeFailureSchema = z.discriminatedUnion('kind', [
  z.object({ ok: z.literal(false), kind: z.literal('absent') }),
  z.object({ ok: z.literal(false), kind: z.literal('unreadable'), message: z.string() }),
  z.object({ ok: z.literal(false), kind: z.literal('malformed'), message: z.string() }),
  z.object({ ok: z.literal(false), kind: z.literal('error'), message: z.string() }),
]);
export type KnowledgeFailure = z.infer<typeof KnowledgeFailureSchema>;

export const KnowledgeResultSchema = z.union([
  z.object({ ok: z.literal(true) }),
  KnowledgeFailureSchema,
]);
export type KnowledgeResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; value: T })
  | KnowledgeFailure;

export const KnowledgeResultOf = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.object({ ok: z.literal(true), value: schema }), KnowledgeFailureSchema]);

export const knowledgeOk = <T = void>(value?: T): KnowledgeResult<T> =>
  (value === undefined ? { ok: true } : { ok: true, value }) as KnowledgeResult<T>;

export const knowledgeAbsent = <T = void>(): KnowledgeResult<T> => ({ ok: false, kind: 'absent' });

export const knowledgeUnreadable = <T = void>(message: string): KnowledgeResult<T> => ({
  ok: false,
  kind: 'unreadable',
  message,
});

export const knowledgeMalformed = <T = void>(message: string): KnowledgeResult<T> => ({
  ok: false,
  kind: 'malformed',
  message,
});

export const knowledgeError = <T = void>(message: string): KnowledgeResult<T> => ({
  ok: false,
  kind: 'error',
  message,
});

// --- node-detail-specific failure (a "not found" a graph read cannot produce) ---

/**
 * `knowledgeGetNodeDetail`'s own failure shape — mostly `KnowledgeFailure`,
 * plus `'not-found'` for an id the current graph doesn't contain (a stale
 * click racing a repo switch, or a node the detail index never carried
 * because it has no source location — see `buildDetailIndex`).
 */
export const KnowledgeNodeDetailFailureSchema = z.discriminatedUnion('kind', [
  z.object({ ok: z.literal(false), kind: z.literal('absent') }),
  z.object({ ok: z.literal(false), kind: z.literal('unreadable'), message: z.string() }),
  z.object({ ok: z.literal(false), kind: z.literal('malformed'), message: z.string() }),
  z.object({ ok: z.literal(false), kind: z.literal('error'), message: z.string() }),
  z.object({ ok: z.literal(false), kind: z.literal('not-found') }),
]);
export type KnowledgeNodeDetailFailure = z.infer<typeof KnowledgeNodeDetailFailureSchema>;

export const knowledgeNotFound = (): KnowledgeNodeDetailFailure => ({
  ok: false,
  kind: 'not-found',
});
