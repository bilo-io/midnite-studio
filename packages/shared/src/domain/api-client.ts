import { z } from 'zod';

/**
 * Phase 66 — API Client.
 *
 * The wire contract for a Postman-compatible API client: the on-disk Postman
 * v2.1 collection/environment shape, the renderer's editable request draft,
 * the response envelope, and the IPC result envelope every `mstudio:api-client:*`
 * op returns. This is the first phase to touch anything HTTP-client-shaped.
 *
 * Two things are net-new to this package, both used only in this file:
 *
 * - `z.lazy` — `PostmanItemSchema` is the one recursive schema here (a folder
 *   nests more items), and `z.infer` cannot see through a lazy reference, so
 *   `PostmanItem` is a hand-written interface with the schema typed against it
 *   via `z.ZodType<PostmanItem>`.
 * - `.passthrough()` — every schema that models a real, on-disk Postman object
 *   carries it. A real exported collection has keys this app does not model
 *   (`protocolProfileBehavior`, `_postman_id`, `event[]`, unrecognised `auth`
 *   shapes, …), and a round-trip that dropped them would corrupt a file the
 *   user shares with a team. `ApiResponse` is the one exception — it is ours,
 *   never round-trips to disk, and stays strict.
 */

// --- Postman v2.1 wire shape (on-disk; every object schema is .passthrough()) -

/** A v2.1 collection writes either a bare string or `{raw, host, path, …}`. */
export const PostmanUrlSchema = z.union([z.string(), z.object({ raw: z.string() }).passthrough()]);
export type PostmanUrl = z.infer<typeof PostmanUrlSchema>;

export const PostmanHeaderSchema = z
  .object({
    key: z.string(),
    value: z.string(),
    disabled: z.boolean().optional(),
  })
  .passthrough();
export type PostmanHeader = z.infer<typeof PostmanHeaderSchema>;

/**
 * `mode` is a bare `z.string()`, not an enum of the modes this app renders —
 * a real export can carry a mode this app's Body tab does not have a branch
 * for yet, and passthrough is what keeps that body byte-identical on save.
 */
export const PostmanBodySchema = z
  .object({
    mode: z.string().optional(),
  })
  .passthrough();
export type PostmanBody = z.infer<typeof PostmanBodySchema>;

/**
 * A real export's `auth` carries a `type` plus one array named after it
 * (`bearer: [{key:'token', value:'…', type:'string'}]`, …) for auth schemes
 * this app does not model (Digest, AWS Signature, OAuth2 — see the phase
 * doc's scope guardrails). Passthrough is what lets an import/export round
 * trip preserve them unedited.
 */
export const PostmanAuthSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();
export type PostmanAuth = z.infer<typeof PostmanAuthSchema>;

/**
 * `method` is a bare `z.string()`, not an enum — Postman permits arbitrary
 * verbs and a strict enum would reject a real file on import. The method
 * *dropdown* the request builder offers is a separate, narrower concern.
 */
export const PostmanRequestSchema = z
  .object({
    method: z.string(),
    url: PostmanUrlSchema,
    header: z.array(PostmanHeaderSchema).optional(),
    body: PostmanBodySchema.optional(),
    auth: PostmanAuthSchema.optional(),
  })
  .passthrough();
export type PostmanRequest = z.infer<typeof PostmanRequestSchema>;

/**
 * A folder (`{name, item: PostmanItem[]}`) or a request (`{name, request:
 * PostmanRequest}`) — Postman's own recursive tree shape. Hand-written
 * because `z.lazy` erases the type `z.infer` would otherwise derive.
 */
export interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  [key: string]: unknown;
}

export const PostmanItemSchema: z.ZodType<PostmanItem> = z.lazy(() =>
  z.union([
    z.object({ name: z.string(), item: z.array(PostmanItemSchema) }).passthrough(),
    z.object({ name: z.string(), request: PostmanRequestSchema }).passthrough(),
  ]),
);

/**
 * A collection's own `variable[]` — Postman v2.1's file-local tier of
 * `{{var}}` resolution, resolvable with no environment at all. The second
 * tier (an `.postman_environment.json` file) is `PostmanEnvironmentSchema`
 * below, which nothing reads until Phase 70 Theme A.
 */
export const PostmanVariableSchema = z
  .object({
    key: z.string(),
    value: z.unknown().optional(),
  })
  .passthrough();
export type PostmanVariable = z.infer<typeof PostmanVariableSchema>;

export const PostmanCollectionInfoSchema = z
  .object({
    name: z.string(),
  })
  .passthrough();
export type PostmanCollectionInfo = z.infer<typeof PostmanCollectionInfoSchema>;

export const PostmanCollectionSchema = z
  .object({
    info: PostmanCollectionInfoSchema,
    item: z.array(PostmanItemSchema),
    variable: z.array(PostmanVariableSchema).optional(),
    auth: PostmanAuthSchema.optional(),
  })
  .passthrough();
export type PostmanCollection = z.infer<typeof PostmanCollectionSchema>;

/**
 * Ships here, in Theme A, even though nothing reads it until Phase 70 Theme
 * A — Theme G's importer must *recognise and refuse* a
 * `.postman_environment.json` with a real message rather than failing the
 * collection parse with a schema-shaped wall of text.
 */
export const PostmanEnvironmentValueSchema = z
  .object({
    key: z.string(),
    value: z.string().optional(),
    type: z.enum(['default', 'secret']).optional(),
    enabled: z.boolean().optional(),
  })
  .passthrough();
export type PostmanEnvironmentValue = z.infer<typeof PostmanEnvironmentValueSchema>;

export const PostmanEnvironmentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    values: z.array(PostmanEnvironmentValueSchema),
  })
  .passthrough();
export type PostmanEnvironment = z.infer<typeof PostmanEnvironmentSchema>;

// --- the renderer's editable shape (ours; never round-trips whole) -----------

export const KeyValueRowSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
});
export type KeyValueRow = z.infer<typeof KeyValueRowSchema>;

export const BODY_MODES = [
  'none',
  'json',
  'form-data',
  'urlencoded',
  'raw',
  'binary',
  'graphql',
  'xml',
] as const;
export const BodyModeSchema = z.enum(BODY_MODES);
export type BodyMode = z.infer<typeof BodyModeSchema>;

export const ApiAuthSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: z.string() }),
  z.object({ type: z.literal('basic'), username: z.string(), password: z.string() }),
  z.object({
    type: z.literal('apikey'),
    key: z.string(),
    value: z.string(),
    in: z.enum(['header', 'query']),
  }),
]);
export type ApiAuth = z.infer<typeof ApiAuthSchema>;

/**
 * The renderer's editable shape for one request — deliberately **not** the
 * on-disk `PostmanRequest`. `bodies` is a `Record` keyed by mode, not a
 * single `body` field, so "switch JSON → raw → JSON without losing the JSON"
 * is structural rather than a thing the request builder has to remember.
 */
export const ApiRequestDraftSchema = z.object({
  id: z.string(),
  name: z.string(),
  method: z.string(),
  url: z.string(),
  params: z.array(KeyValueRowSchema),
  headers: z.array(KeyValueRowSchema),
  auth: ApiAuthSchema,
  bodyMode: BodyModeSchema,
  bodies: z.record(BodyModeSchema, z.string()),
  binaryPath: z.string().nullable(),
});
export type ApiRequestDraft = z.infer<typeof ApiRequestDraftSchema>;

/** An empty `bodies` map with every `BodyMode` present, each an empty string. */
function emptyBodies(): Record<BodyMode, string> {
  return BODY_MODES.reduce(
    (acc, mode) => {
      acc[mode] = '';
      return acc;
    },
    {} as Record<BodyMode, string>,
  );
}

/** The body-mode a `PostmanBody.mode` maps onto; unrecognised falls to `'raw'`. */
function bodyModeOf(body: PostmanBody | undefined): BodyMode {
  switch (body?.mode) {
    case 'urlencoded':
      return 'urlencoded';
    case 'formdata':
      return 'form-data';
    case 'graphql':
      return 'graphql';
    case 'raw': {
      const language = (body.options as { raw?: { language?: string } } | undefined)?.raw
        ?.language;
      if (language === 'json') return 'json';
      if (language === 'xml') return 'xml';
      return 'raw';
    }
    case 'file':
      return 'binary';
    default:
      return body ? 'raw' : 'none';
  }
}

/**
 * `PostmanItem` → `ApiRequestDraft`. Only ever called on a request-shaped
 * item (`item.request` present); callers are responsible for walking the
 * tree and only opening request leaves as tabs.
 */
export function toDraft(item: PostmanItem): ApiRequestDraft {
  const request = item.request;
  const url = request ? (typeof request.url === 'string' ? request.url : request.url.raw) : '';
  const bodyMode = bodyModeOf(request?.body);
  const bodies = emptyBodies();
  if (request?.body?.mode === 'raw' && typeof request.body.raw === 'string') {
    bodies[bodyMode] = request.body.raw;
  } else if (request?.body?.mode === 'graphql') {
    const query = (request.body as { graphql?: { query?: string } }).graphql?.query;
    if (typeof query === 'string') bodies.graphql = query;
  }

  return {
    id: item.name,
    name: item.name,
    method: request?.method ?? 'GET',
    url,
    params: [],
    headers: (request?.header ?? []).map((h) => ({
      key: h.key,
      value: h.value,
      enabled: !h.disabled,
    })),
    auth: { type: 'none' },
    bodyMode,
    bodies,
    binaryPath: null,
  };
}

/**
 * `ApiRequestDraft` → `PostmanRequest`, merged **over the original** rather
 * than constructed fresh — that is what makes passthrough keys (an `event[]`,
 * an auth shape this app does not model, …) survive the round trip. `original`
 * is `null` for a request created in this app, with no prior on-disk shape.
 */
export function toPostmanRequest(
  draft: ApiRequestDraft,
  original: PostmanRequest | null,
): PostmanRequest {
  const base: PostmanRequest = original ? { ...original } : { method: draft.method, url: draft.url };
  base.method = draft.method;
  base.url = draft.url;
  base.header = draft.headers
    .filter((row) => row.key.length > 0)
    .map((row) => ({ key: row.key, value: row.value, disabled: !row.enabled }));
  return base;
}

// --- response (ours; strict — never round-trips to disk) ---------------------

export const ApiResponseSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
  bodyIsJson: z.boolean(),
  contentType: z.string().nullable(),
  durationMs: z.number(),
  sizeBytes: z.number(),
  truncated: z.boolean(),
  /**
   * Not in the phase doc's own field list for this schema, added here
   * because Theme E's send engine (same phase, same file) is specified to
   * return "a `warnings: string[]` entry naming" an unresolved `{{var}}` —
   * a field on this response is the only place that can live. Defaulted so
   * every existing caller of `ApiResponseSchema.parse` keeps working.
   */
  warnings: z.array(z.string()).default([]),
});
export type ApiResponse = z.infer<typeof ApiResponseSchema>;

// --- result envelope -----------------------------------------------------------

/**
 * The result envelope every `mstudio:api-client:*` op returns. A third copy
 * of `database.ts`'s `DbOpFailureSchema`/`DbOpResultSchema`/`DbOpResultOf` two-arm
 * shape, deliberately: an API-client op has no `conflict` arm to borrow from
 * `GitOpResult`, exactly as Phase 61 found for the database client, and
 * `database.ts`'s own header says nothing there reuses a git-shaped type.
 *
 * The success arm's payload field is named `value` (not `database.ts`'s
 * `data`) — the phase doc spells this envelope out literally as
 * `{ok:true, value} | {ok:false, kind:'error', message}`, so `value` is
 * followed here as the one place this "copy verbatim" instruction and the
 * file it names actually disagree.
 */
export const ApiOpFailureSchema = z.object({
  ok: z.literal(false),
  kind: z.literal('error'),
  message: z.string(),
});
export type ApiOpFailure = z.infer<typeof ApiOpFailureSchema>;

export const ApiOpResultSchema = z.union([z.object({ ok: z.literal(true) }), ApiOpFailureSchema]);
export type ApiOpResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; value: T })
  | ApiOpFailure;

export const ApiOpResultOf = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.object({ ok: z.literal(true), value: schema }), ApiOpFailureSchema]);

export const apiOk = <T = void>(value?: T): ApiOpResult<T> =>
  (value === undefined ? { ok: true } : { ok: true, value }) as ApiOpResult<T>;

export const apiFailure = <T = void>(message: string): ApiOpResult<T> => ({
  ok: false,
  kind: 'error',
  message,
});

/**
 * A collection as the renderer lists and browses it: the full parsed
 * document plus the on-disk identity (`fileName`, and a stable `id` derived
 * from it) that Postman's own file format has no field for. Not spelled out
 * in the phase doc's Theme A bullets — added here because `apiListCollections`
 * needs a response shape and Theme C's store needs something to hold
 * (`collections: ApiCollectionSummary[]`) before a request is opened.
 */
export const ApiCollectionSummarySchema = z.object({
  id: z.string(),
  fileName: z.string(),
  collection: PostmanCollectionSchema,
});
export type ApiCollectionSummary = z.infer<typeof ApiCollectionSummarySchema>;
