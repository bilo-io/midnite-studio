import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

import {
  apiOk,
  ApiSendRequestRequest,
  type ApiAuth,
  type ApiOpResult,
  type ApiRequestDraft,
  type ApiResponse,
  type BodyMode,
  type PostmanEnvironmentValue,
  type PostmanVariable,
} from '@midnite/studio-shared';
import type { z } from 'zod';

import { confineTree } from '../fs-scope-write';
import { resolveWorkdir } from '../repo-registry';
import { readCapped } from '../workflow/executors/http';
import { readEnvironment } from './environment-io';
import { interpolateTiered } from './interpolate';

/**
 * Phase 66 Theme E — the main-process send engine.
 *
 * Structured on `workflow/executors/http.ts:84-161` (the MVP's `http` node),
 * with three differences that come from this being an interactive request
 * rather than a workflow step:
 *
 * - `{{var}}` interpolation runs here, immediately before the request is
 *   built (Decision 7) — an unresolved token is left literally in place and
 *   named in `warnings[]` rather than substituted with `''`. Phase 70 Theme A
 *   adds the environment tier at this exact call site (`interpolateTiered`),
 *   which is why interpolation was put in main from day one: the environment
 *   is loaded from disk, right here, and a secret value never crosses into
 *   renderer memory to get here.
 * - Cancellation is IPC-driven, not polled: `cancelRequest` calls
 *   `controller.abort()` directly from a module-level map, no 100 ms poll
 *   (Decision 6 / the phase doc's Theme E notes — `http.ts`'s poll exists
 *   only because a workflow's cancel arrives on a `context.signal.cancelled()`
 *   check, which an IPC invoke has no equivalent of).
 * - `ApiResponse.body` is always the raw text — never `JSON.parse`d into an
 *   object — because `ApiResponseSchema.body` is a `string`; `bodyIsJson` is
 *   the flag a downstream reader uses to decide whether to parse it.
 *
 * **Where the try/catch lives:** this function throws for every transport
 * failure (invalid URL, refused binary path, abort, timeout, DNS/connection
 * errors) and only ever *returns* for a settled HTTP response — 404 included,
 * exactly as `http.ts` treats a non-2xx as a success. `ApiSendRequestResponse`
 * is `ApiOpResultOf(ApiResponseSchema)`, i.e. the envelope the IPC handler
 * (`api-client-handlers.ts`, out of scope here) is expected to build with its
 * own try/catch around a call to `sendApiRequest` — mirroring how every other
 * handler in this codebase converts a thrown error to `{ok:false, kind:
 * 'error', message}` rather than letting it reject the `invoke` call.
 */

/** The wire shape of one `apiSendRequest` call, inferred from the shared schema
 *  rather than duplicated — `ApiSendRequestRequest` carries no sibling
 *  `z.infer` export of its own (the `Api*` group's convention). */
export type ApiSendRequest = z.infer<typeof ApiSendRequestRequest>;

const DEFAULT_TIMEOUT_MS = 30_000;

/** In-flight sends, keyed by `requestId` — populated on send, removed in the
 *  send's own `finally`. The single source of truth `cancelRequest` reads. */
const activeControllers = new Map<string, AbortController>();

/**
 * Cancel an in-flight send by `requestId`. A no-op on an unknown id — the
 * response landing just as the user clicks Cancel is a normal race, not a
 * failure — so this always resolves `{ok:true}` and never throws.
 */
export function cancelRequest(requestId: string): ApiOpResult {
  activeControllers.get(requestId)?.abort();
  return apiOk();
}

/** Test-only introspection: how many sends are currently tracked. Used to
 *  assert that an aborted/settled send actually cleared its map entry. */
export function pendingRequestCount(): number {
  return activeControllers.size;
}

/** A collection's `variable[]` reduced to the plain string map `interpolate`
 *  wants. A variable with no `value` at all resolves nothing — it is treated
 *  as absent, not as an empty string, so its `{{token}}` still warns. */
function collectVariables(variables: readonly PostmanVariable[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variable of variables) {
    if (variable.value === undefined) continue;
    out[variable.key] = typeof variable.value === 'string' ? variable.value : String(variable.value);
  }
  return out;
}

/**
 * An environment's `values[]` reduced to the plain string map
 * `interpolateTiered` wants for its `environment` tier (Phase 70 Theme A).
 * A row with `enabled: false` is excluded outright — never merely resolved
 * to `''` — so it neither shadows the collection tier nor answers with an
 * empty string; a disabled row behaves exactly as if it were not there.
 * `type` ('default' vs 'secret') makes no difference here: by the time this
 * runs, `readEnvironment` has already merged the secret overlay back in, so
 * every row's `value` is simply a value.
 */
function collectEnvironmentVariables(values: readonly PostmanEnvironmentValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of values) {
    if (row.enabled === false) continue;
    if (row.value === undefined) continue;
    out[row.key] = row.value;
  }
  return out;
}

/** Sets `name: value` unless a same-named header (case-insensitively) is
 *  already present — how a body-mode's default `content-type` yields to
 *  whatever the user typed on the Headers tab. */
function setHeaderIfAbsent(headers: Record<string, string>, name: string, value: string): void {
  const lower = name.toLowerCase();
  if (Object.keys(headers).some((key) => key.toLowerCase() === lower)) return;
  headers[name] = value;
}

function applyAuth(
  auth: ApiAuth,
  headers: Record<string, string>,
  target: URL,
  interp: (input: string) => string,
): void {
  switch (auth.type) {
    case 'none':
      return;
    case 'bearer':
      headers['Authorization'] = `Bearer ${interp(auth.token)}`;
      return;
    case 'basic': {
      const credentials = `${interp(auth.username)}:${interp(auth.password)}`;
      headers['Authorization'] = `Basic ${Buffer.from(credentials, 'utf8').toString('base64')}`;
      return;
    }
    case 'apikey': {
      const key = interp(auth.key);
      const value = interp(auth.value);
      if (auth.in === 'header') headers[key] = value;
      else target.searchParams.set(key, value);
      return;
    }
  }
}

/** The default `content-type` a body mode implies, or `null` for a mode
 *  (`raw`, `binary` handled separately) that carries no implicit one. */
function contentTypeFor(mode: BodyMode): string | null {
  switch (mode) {
    case 'json':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    case 'graphql':
      return 'application/json';
    case 'urlencoded':
      return 'application/x-www-form-urlencoded';
    case 'form-data':
      return 'multipart/form-data';
    default:
      return null;
  }
}

type BuiltBody = { body: string | ReadableStream<Uint8Array> | undefined; duplex?: 'half' };

/**
 * The request body per `bodyMode`. `binary` is the one mode that isn't a
 * plain string in `draft.bodies` — it streams `draft.binaryPath` off disk,
 * but only after `confineTree` has cleared it against the *open repository's*
 * root, so a crafted collection cannot point `binaryPath` at `~/.ssh/id_rsa`
 * (or anywhere else outside the repo) and have this app read it back out
 * over the network.
 */
async function buildBody(
  draft: ApiRequestDraft,
  headers: Record<string, string>,
  repoId: string,
  interp: (input: string) => string,
): Promise<BuiltBody> {
  const method = draft.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return { body: undefined };
  if (draft.bodyMode === 'none') return { body: undefined };

  if (draft.bodyMode === 'binary') {
    if (!draft.binaryPath) return { body: undefined };
    const root = await resolveWorkdir(repoId);
    if (!root) throw new Error('That repository is no longer open.');
    const confined = await confineTree(root, draft.binaryPath);
    if (!confined) {
      throw new Error('The request body file is outside the open repository and was refused.');
    }
    setHeaderIfAbsent(headers, 'content-type', 'application/octet-stream');
    // Node's `fetch` requires `duplex: 'half'` whenever the body is a stream
    // rather than a buffered value — see the `duplex` entry this returns,
    // threaded into `RequestInit` at the call site.
    const webStream = Readable.toWeb(createReadStream(confined)) as unknown as ReadableStream<Uint8Array>;
    return { body: webStream, duplex: 'half' };
  }

  const contentType = contentTypeFor(draft.bodyMode);
  if (contentType) setHeaderIfAbsent(headers, 'content-type', contentType);
  return { body: interp(draft.bodies[draft.bodyMode] ?? '') };
}

/**
 * Send one API request, resolving `{{var}}` against `req.collectionVariables`
 * and — when `req.environmentId` names one — the merged environment loaded
 * fresh from disk, immediately before building the request (Phase 70 Theme
 * A's two-tier resolution: environment shadows collection). Settles with the
 * full `ApiResponse` for any completed HTTP exchange — a 404 included — and
 * throws for anything that never got that far: an unresolvable URL, a
 * refused binary path, a timeout, an abort, or a transport-level failure.
 * The caller (the IPC handler) is expected to wrap this in its own try/catch
 * and convert a throw into `{ok:false, kind:'error', message}`.
 *
 * `signal` is an externally-supplied `AbortSignal` this send also honours
 * (e.g. the caller tearing down for an unrelated reason); `cancelRequest`
 * below is the other, IPC-driven way to abort the same in-flight send, via
 * the module-level map keyed on `req.requestId`.
 */
export async function sendApiRequest(req: ApiSendRequest, signal: AbortSignal): Promise<ApiResponse> {
  const warnings: string[] = [];

  // A secret value is read from disk here, in main, interpolated into the
  // outgoing request, and never stored anywhere else — it is never accepted
  // as a variable *value* from the renderer (`ApiSendRequestRequest` carries
  // only the id), and it never lives in this function's return value.
  let environmentVariables: Record<string, string> = {};
  if (req.environmentId !== null) {
    const repoRoot = await resolveWorkdir(req.repoId);
    if (!repoRoot) throw new Error('That repository is no longer open.');
    const environment = await readEnvironment(repoRoot, req.environmentId);
    if (environment.ok) {
      environmentVariables = collectEnvironmentVariables(environment.value.values);
    } else {
      // The environment named by a stale tab (deleted since it was picked)
      // is not a transport failure — the send still runs, against the
      // collection tier alone, with a warning naming what happened.
      warnings.push(`Could not load the selected environment: ${environment.message}`);
    }
  }

  const collectionVariables = collectVariables(req.collectionVariables);
  const interp = (input: string): string => {
    const result = interpolateTiered(input, {
      environment: environmentVariables,
      collection: collectionVariables,
    });
    for (const warning of result.warnings) {
      if (!warnings.includes(warning)) warnings.push(warning);
    }
    return result.text;
  };

  const draft = req.draft;
  const rawUrl = interp(draft.url);
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new Error(`"${rawUrl}" is not a valid URL.`);
  }

  for (const row of draft.params) {
    if (!row.enabled || row.key === '') continue;
    target.searchParams.set(interp(row.key), interp(row.value));
  }

  const headers: Record<string, string> = {};
  for (const row of draft.headers) {
    if (!row.enabled || row.key === '') continue;
    headers[interp(row.key)] = interp(row.value);
  }
  applyAuth(draft.auth, headers, target, interp);

  const { body, duplex } = await buildBody(draft, headers, req.repoId, interp);

  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', () => controller.abort(), { once: true });
  activeControllers.set(req.requestId, controller);

  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  deadline.unref?.();

  const startedAt = performance.now();
  try {
    const init: RequestInit & { duplex?: 'half' } = {
      method: draft.method,
      headers,
      signal: controller.signal,
      redirect: 'follow',
      ...(body === undefined ? {} : { body }),
      ...(duplex ? { duplex } : {}),
    };
    const response = await fetch(target, init);

    const { text, truncated, bytes } = await readCapped(response);
    const contentType = response.headers.get('content-type');
    let bodyIsJson = false;
    // Only claim JSON when the body actually parses: a truncated JSON
    // response is `content-type: application/json` that is no longer valid
    // JSON, and claiming otherwise helps nobody reading the viewer.
    if (contentType && /\bjson\b/i.test(contentType) && text !== '' && !truncated) {
      try {
        JSON.parse(text);
        bodyIsJson = true;
      } catch {
        bodyIsJson = false;
      }
    }

    const headerRecord: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headerRecord[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: headerRecord,
      body: text,
      bodyIsJson,
      contentType,
      durationMs: performance.now() - startedAt,
      sizeBytes: bytes,
      truncated,
      warnings,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (timedOut) throw new Error(`Timed out after ${timeoutMs} ms.`);
      throw new Error('Request cancelled.');
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${draft.method} ${target.href} failed: ${message}`);
  } finally {
    clearTimeout(deadline);
    activeControllers.delete(req.requestId);
  }
}
