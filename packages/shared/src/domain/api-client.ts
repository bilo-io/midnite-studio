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
  /**
   * Phase 70 Theme B — the two `pm.*` scripts a request tab carries, edited
   * in the builder's fifth ("Scripts") tab. Both default `''` so every
   * existing caller that builds an `ApiRequestDraft` object literal (every
   * fixture in this package that predates Theme B) keeps compiling without
   * having to know about a field it never asked for.
   *
   * Deliberately **not** the on-disk shape: a real Postman export carries
   * these as `item.event: [{listen:'prerequest'|'test', script:{exec}}]`
   * (`toDraft` below reads that shape in, seeding these two flat strings),
   * but nothing here writes them back out to `item.event` — Theme F's own
   * "Save" round trip (`toPostmanRequest`) does not yet persist *any*
   * builder-tab edit to disk (headers and body included), and scripts are
   * not a special case of that pre-existing gap.
   */
  preRequestScript: z.string().default(''),
  testScript: z.string().default(''),
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
 * A real v2.1 export's `item.event[]` — sibling to `item.request`, not
 * nested inside it — is how Postman itself carries a pre-request/test
 * script. `script.exec` is either the array-of-lines shape a real export
 * uses or a single string; either way this joins it back into the one
 * multi-line string `MonacoField` edits. Absent/malformed/no matching
 * `listen` all resolve to `''` — an item with no script is the overwhelming
 * common case, not an error.
 */
function scriptFromEvent(item: PostmanItem, listen: 'prerequest' | 'test'): string {
  const events = item['event'];
  if (!Array.isArray(events)) return '';
  for (const raw of events) {
    if (!raw || typeof raw !== 'object') continue;
    const event = raw as { listen?: unknown; script?: { exec?: unknown } };
    if (event.listen !== listen) continue;
    const exec = event.script?.exec;
    if (Array.isArray(exec)) {
      return exec.filter((line): line is string => typeof line === 'string').join('\n');
    }
    if (typeof exec === 'string') return exec;
  }
  return '';
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
    preRequestScript: scriptFromEvent(item, 'prerequest'),
    testScript: scriptFromEvent(item, 'test'),
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

/**
 * Phase 70 Theme A — an environment as the renderer lists and browses it,
 * mirroring `ApiCollectionSummary` exactly: the merged (base + `.local.json`
 * overlay) document the editor reads and writes as a whole, plus the on-disk
 * identity Postman's own file format has no field for. `id` is the file
 * name, exactly as a collection's `id` is — `environment-io.ts`'s
 * `listEnvironments`/`saveEnvironment` are the only source of one.
 */
export const ApiEnvironmentSummarySchema = z.object({
  id: z.string(),
  fileName: z.string(),
  environment: PostmanEnvironmentSchema,
});
export type ApiEnvironmentSummary = z.infer<typeof ApiEnvironmentSummarySchema>;

/**
 * `saveEnvironment`'s own result, carried inside `ApiOpResultOf`'s success
 * arm rather than as a new failure `kind` — the envelope every api-client op
 * returns stays exactly `{ok:true, value} | {ok:false, kind:'error', message}`,
 * and "the save needs a human decision first" is still a *successful* call
 * (nothing was written, nothing threw), just one whose `value` says so.
 *
 * `needs-confirm` fires once per repo: the first time a save would write a
 * secret-valued row into a repository `environment-io.ts`'s
 * `isGitignoreProtected` cannot yet prove is protected. The renderer's own
 * confirm (`ConfirmDialog`, `blastRadiusKind: 'secrets'`) re-sends the same
 * save with `confirmed: true`, which is what actually writes the overlay and
 * the `.gitignore`.
 */
/**
 * Phase 70 Theme D — one row of the persisted request history at
 * `.midnite/api/history.local.json`. Metadata only, deliberately: **no
 * headers, no request body, no response body** ever reach this shape, which
 * is what keeps a 200-row file small and safe to leave gitignored rather
 * than encrypted. `url` is the resolved wire URL with its query string, any
 * secret-typed environment variable's value already rewritten to `{{key}}`
 * (`redactSecretValues`, `shared/src/redact.ts`) — never the raw draft URL,
 * which would still carry an unresolved `{{token}}` that tells a reader
 * nothing about what actually went out.
 *
 * `collectionId`/`itemPath` name the collection item the request came from,
 * so a history row can be re-opened as a tab seeded from *that item* — never
 * from the row itself, which carries no draft to reopen with (no headers, no
 * body). Nullable because a row predates a request being tied to one, or
 * names an item since renamed or deleted; the UI falls back to "open the
 * collection" when the path no longer resolves.
 */
export const ApiHistoryEntrySchema = z.object({
  id: z.string(),
  at: z.number().int().nonnegative(),
  method: z.string(),
  url: z.string(),
  status: z.number().int(),
  durationMs: z.number().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  collectionId: z.string().nullable(),
  itemPath: z.array(z.string()).nullable(),
  environmentId: z.string().nullable(),
});
export type ApiHistoryEntry = z.infer<typeof ApiHistoryEntrySchema>;

export const SaveEnvironmentOutcomeSchema = z.discriminatedUnion('status', [
  // `fileName` is the environment's id (`ApiEnvironmentSummary.id` is its file
  // name) — the caller's only way to learn what a brand-new environment
  // (`environmentId: null` on the request) actually landed as, slug
  // de-duplication included, so the UI can select it immediately.
  z.object({ status: z.literal('saved'), fileName: z.string() }),
  z.object({
    status: z.literal('needs-confirm'),
    secretCount: z.number().int().nonnegative(),
    gitignorePath: z.string(),
  }),
]);
export type SaveEnvironmentOutcome = z.infer<typeof SaveEnvironmentOutcomeSchema>;

// --- pm.* test runner (Phase 70 Theme B) --------------------------------------
//
// `main/api-client/script-runner.ts`'s wire shapes. The runner itself lives in
// desktop (it runs a `vm` sandbox, in a spawned `utilityProcess` — see that
// file's header for why), but its input/output cross two process boundaries
// (main → the utilityProcess, main → renderer over IPC) and both cross
// through this same shared, zod-validated shape rather than a bespoke one
// per hop.

/** The read-only `pm.request` a script sees — the *draft* as the renderer
 *  already holds it, `{{var}}` tokens unresolved, never the interpolated
 *  wire request `send.ts` actually sent. That is deliberate: the resolved
 *  request can carry a secret (a bearer token substituted from an
 *  environment's secret tier), and this object crosses back into
 *  `logs`/`mutations` on the renderer's own screen the moment a script does
 *  `console.log(pm.request)` — a risk this file's `pm.request` is built to
 *  not carry in the first place, rather than a redaction bolted on after. */
export const ScriptRequestInfoSchema = z.object({
  method: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
});
export type ScriptRequestInfo = z.infer<typeof ScriptRequestInfoSchema>;

/** The read-only `pm.response` a **Tests** script sees — `null` for a
 *  **Pre-request** script, which runs before anything has been sent. Unlike
 *  `ScriptRequestInfo` this is safe to pass through unmodified: it is what
 *  the server sent back, already visible to the user in the Response Viewer
 *  the moment `sendRequest` settles, so a script's `console.log(pm.response)`
 *  discloses nothing the response pane was not already showing. */
export const ScriptResponseInfoSchema = z.object({
  code: z.number(),
  status: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
  bodyIsJson: z.boolean(),
});
export type ScriptResponseInfo = z.infer<typeof ScriptResponseInfoSchema>;

/**
 * Everything one `runScript` call needs, besides the source text itself.
 * `environment`/`collectionVariables` are flat, already-merged
 * `Record<string,string>` maps — exactly `send.ts`'s own
 * `collectEnvironmentVariables`/`collectVariables` shape — loaded fresh in
 * main immediately before the run, the same "never accept a variable *value*
 * from the renderer, only the id that names where to load it from" rule
 * `ApiSendRequestRequest.environmentId` already follows. A secret-typed
 * environment value can be present here (a script may legitimately need
 * `pm.environment.get('apiKey')`), which is why this object is built in main
 * and never in the renderer.
 */
export const ScriptContextSchema = z.object({
  environment: z.record(z.string(), z.string()),
  collectionVariables: z.record(z.string(), z.string()),
  request: ScriptRequestInfoSchema,
  response: ScriptResponseInfoSchema.nullable(),
});
export type ScriptContext = z.infer<typeof ScriptContextSchema>;

export const AssertionResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  error: z.string().optional(),
});
export type AssertionResult = z.infer<typeof AssertionResultSchema>;

/**
 * `runScript`'s whole return value. **Never a thrown error, never a rejected
 * promise** — a throw outside `pm.test` (or a `vm` timeout) lands in
 * `error`, with `results` empty; a throw *inside* one becomes that test's
 * own `{passed:false, error}` and every other test still runs.
 *
 * `mutations` is what `pm.environment.set`/`pm.collectionVariables.set`
 * wrote — in memory only, during this one run. Nothing in this module ever
 * touches disk; the IPC handler is what applies `mutations.environment`
 * through Theme A's `saveEnvironment` (the secret split and the write-queue
 * both stay exactly where Theme A put them) and folds
 * `mutations.collectionVariables` into the collection's own `variable[]`
 * through Theme A's own `saveCollection`.
 */
export const ScriptRunSchema = z.object({
  results: z.array(AssertionResultSchema),
  logs: z.array(z.string()),
  mutations: z.object({
    environment: z.record(z.string(), z.string()),
    collectionVariables: z.record(z.string(), z.string()),
  }),
  error: z.string().nullable(),
});
export type ScriptRun = z.infer<typeof ScriptRunSchema>;

/**
 * `apiRunScript`'s success-arm payload — mirrors `SaveEnvironmentOutcome`'s
 * own "a decision, not a write" shape: **`needs-consent` runs nothing at
 * all**, script or sandbox included, and is what the renderer's consent bar
 * (`test-results-panel.tsx`) renders instead of a result list. The renderer
 * resends the identical request once the user picks *Run once* or *Always*
 * (`ApiRunScriptRequest.runAnyway: true` — see that schema's own comment for
 * why a third request field, not a second channel, is what lets "Run once"
 * skip the trust check without persisting it).
 */
export const ScriptRunOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ran'), run: ScriptRunSchema }),
  z.object({ status: z.literal('needs-consent') }),
]);
export type ScriptRunOutcome = z.infer<typeof ScriptRunOutcomeSchema>;

// --- the collection runner (Phase 70 Theme C) ---------------------------------
//
// `main/api-client/runner.ts`'s wire shapes. A run is a flat, depth-first walk
// of the target's item tree in file order, calling Phase 66's `sendApiRequest`
// then Theme B's `runScript` per request — streamed, unlike the single-request
// `apiSendRequest`/`apiRunScript` calls above, because a run is unbounded in
// duration and a partial run is exactly what the user wants to watch.

/**
 * What a run walks: the whole collection, or one folder inside it (picked by
 * the same folder-name `path` a tab's `itemPath` already uses — Postman
 * items have no stable id, so a path is the only address that survives a
 * sibling being inserted above).
 */
export const ApiRunTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('collection') }),
  z.object({ kind: z.literal('folder'), path: z.array(z.string()) }),
]);
export type ApiRunTarget = z.infer<typeof ApiRunTargetSchema>;

/** One request leaf's outcome, in `ApiRunEvent.item` and the summary's own
 *  detail list alike. `'error'` covers both a transport failure (Property 2
 *  — a settled `response` is `null`) and a script whose `pm.test` calls
 *  themselves ran but whose script otherwise threw (`response` is present,
 *  `error` names the script's own failure); `'failed'` is a settled response
 *  whose script ran cleanly but produced at least one failing assertion;
 *  `'skipped'` is Property 3 — never dequeued because Stop landed first. */
export const ApiRunItemStatusSchema = z.enum(['passed', 'failed', 'error', 'skipped']);
export type ApiRunItemStatus = z.infer<typeof ApiRunItemStatusSchema>;

export const ApiRunItemResultSchema = z.object({
  itemPath: z.array(z.string()),
  name: z.string(),
  method: z.string(),
  status: ApiRunItemStatusSchema,
  durationMs: z.number().nonnegative(),
  /** `null` for a transport failure (nothing settled) and for `skipped`. */
  response: ApiResponseSchema.nullable(),
  /** Empty when the item carries no test script, or a settled `response`
   *  never reached the script (a transport failure). */
  assertions: z.array(AssertionResultSchema),
  /** The transport failure's message, or the script's own `ScriptRun.error`
   *  — never both, since a script only runs after a response has settled. */
  error: z.string().nullable(),
});
export type ApiRunItemResult = z.infer<typeof ApiRunItemResultSchema>;

/** One `apiRunProgress` push — one request leaf's just-settled result, plus
 *  its place in the walk so the renderer's list can render it in order even
 *  if a later batch somehow arrived first (it never does, over one IPC
 *  channel, but `index`/`total` cost nothing and remove the assumption). */
export const ApiRunEventSchema = z.object({
  runId: z.string(),
  index: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  item: ApiRunItemResultSchema,
});
export type ApiRunEvent = z.infer<typeof ApiRunEventSchema>;

/** The header strip a finished (or aborted) run renders. `skipped` is the
 *  requests that never ran at all (Property 3) — disjoint from `failed`,
 *  which only ever counts a request that *did* run. `completed` is
 *  `total - skipped`, `passed + failed` is `completed` minus any transport
 *  failure recorded with `status: 'error'` and no assertions to fail. */
export const ApiRunSummarySchema = z.object({
  runId: z.string(),
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  aborted: z.boolean(),
});
export type ApiRunSummary = z.infer<typeof ApiRunSummarySchema>;

/** The terminal `apiRunDone` push — mirrors `dbQueryDone`'s "one event ends
 *  the stream" shape, carrying the whole summary rather than a bare ping,
 *  since nothing else holds the run's numbers once it is over (a run is
 *  in-memory only; see the phase doc's own note on why it does not persist). */
export const ApiRunDoneEventSchema = z.object({
  runId: z.string(),
  summary: ApiRunSummarySchema,
});
export type ApiRunDoneEvent = z.infer<typeof ApiRunDoneEventSchema>;

/**
 * `apiRunCollection`'s own success-arm payload — mirrors `ScriptRunOutcome`'s
 * "a decision, not a result" shape: `needs-consent` starts nothing at all
 * (no controller registered, no progress event, no `apiRunDone`), and is what
 * the collection runner's own consent bar renders instead of the results
 * pane. The renderer resends the identical request with `runAnyway: true`
 * (*Run once*) or after `apiClient.setScriptTrust({trusted:true})` (*Always*),
 * exactly as the single-script flow already does.
 */
export const ApiRunStartOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('started') }),
  z.object({ status: z.literal('needs-consent') }),
]);
export type ApiRunStartOutcome = z.infer<typeof ApiRunStartOutcomeSchema>;
