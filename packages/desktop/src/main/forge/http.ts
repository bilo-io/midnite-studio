/**
 * The shared HTTP client Phase 90 Themes E-G's adapters use — GitLab,
 * Bitbucket and Azure DevOps all speak plain REST over `fetch`, with no
 * `gh`-style CLI to lean on. Theme D deferred this ("no consumer exists in
 * this batch — the next provider theme builds it against its own first real
 * caller"); Theme E is that caller, and this module is what its
 * `gitlab/` adapter is built on.
 *
 * Modelled on `api-client/send.ts` and `workflow/executors/http.ts` — both
 * already do HTTP in main — rather than adding a fourth style: the timeout +
 * `AbortController` shape is the same here. Two things neither of those
 * needed, which this one does:
 *
 * - **Auth as a strategy, not a header string.** GitLab takes a
 *   `PRIVATE-TOKEN` header, Bitbucket's workspace token is a bearer
 *   credential (its legacy App Password is Basic), and Azure's PAT is Basic
 *   with an empty username. One shape (`HttpAuthStrategy`) is what lets a
 *   sibling adapter drop in its own auth without a second client.
 * - **A per-host request budget and `Retry-After`.** A board or a pipeline
 *   listing fans out into several calls (jobs-per-pipeline, items-per-list);
 *   an unbounded burst against `gitlab.com` earns a 429, and honouring the
 *   header the API actually sends with a single retry resolves that without
 *   a bespoke backoff loop in every adapter.
 */

/** One credential shape. `header` is the general case — GitLab's
 *  `PRIVATE-TOKEN: <token>` today, any future single-header scheme later. */
export type HttpAuthStrategy =
  | { readonly kind: 'none' }
  | { readonly kind: 'bearer'; readonly token: string }
  | { readonly kind: 'basic'; readonly username: string; readonly password: string }
  | { readonly kind: 'header'; readonly name: string; readonly value: string };

export function applyHttpAuth(headers: Record<string, string>, auth: HttpAuthStrategy): void {
  switch (auth.kind) {
    case 'none':
      return;
    case 'bearer':
      headers['authorization'] = `Bearer ${auth.token}`;
      return;
    case 'basic':
      headers['authorization'] =
        `Basic ${Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString('base64')}`;
      return;
    case 'header':
      headers[auth.name] = auth.value;
      return;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_HOST_CONCURRENCY = 6;
/** Never wait longer than this for a `Retry-After` the API asked for — a
 *  slow-but-bounded retry beats a caller that blocks for whatever a server
 *  happened to send. */
const MAX_RETRY_AFTER_MS = 10_000;

export type HttpRequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** JSON-serialised as the body when present; `content-type` is set for you. */
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Concurrent in-flight requests this call's host is allowed at once. */
  hostConcurrency?: number;
  signal?: AbortSignal;
};

export type HttpResult<T> =
  | { ok: true; status: number; data: T; headers: Record<string, string> }
  | { ok: false; status: number | null; error: string };

/**
 * Per-host in-flight counters, so one adapter's fan-out (jobs-per-pipeline,
 * a board's per-list item pages) never bursts past what a single host is
 * asked to tolerate. Module-level and shared across every call this process
 * makes to that host, across every adapter — the budget is about the host,
 * not the caller.
 */
const hostSlots = new Map<string, { active: number; queue: Array<() => void> }>();

async function acquireHostSlot(host: string, limit: number): Promise<() => void> {
  let state = hostSlots.get(host);
  if (!state) {
    state = { active: 0, queue: [] };
    hostSlots.set(host, state);
  }
  const bucket = state;
  const release = (): void => {
    bucket.active -= 1;
    const next = bucket.queue.shift();
    if (next) next();
  };
  if (bucket.active < limit) {
    bucket.active += 1;
    return release;
  }
  await new Promise<void>((resolve) => bucket.queue.push(resolve));
  bucket.active += 1;
  return release;
}

function buildUrl(baseUrl: string, path: string, query?: HttpRequestOptions['query']): URL {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** `Retry-After` as either a delta-seconds count or an HTTP-date, capped so a
 *  server's own number never turns into an unbounded wait. */
function retryDelayMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const at = Date.parse(header);
  if (!Number.isNaN(at)) return Math.max(0, Math.min(at - Date.now(), MAX_RETRY_AFTER_MS));
  return null;
}

type Attempt = { ok: true; response: Response; text: string } | { ok: false; error: string };

/** One fetch, with its own host-slot acquire/release and timeout — no
 *  recursion, so the retry loop in {@link rawRequest} owns the "try again"
 *  decision instead of it being buried in a `finally`. */
async function attemptOnce(
  target: URL,
  auth: HttpAuthStrategy,
  options: HttpRequestOptions,
): Promise<Attempt> {
  const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
  applyHttpAuth(headers, auth);

  let body: string | undefined;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const release = await acquireHostSlot(target.host, options.hostConcurrency ?? DEFAULT_HOST_CONCURRENCY);
  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  deadline.unref?.();

  try {
    const response = await fetch(target, {
      method: options.method ?? 'GET',
      headers,
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await response.text();
    return { ok: true, response, text };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: `Timed out after ${timeoutMs} ms.` };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `${options.method ?? 'GET'} ${target.href} failed: ${message}` };
  } finally {
    clearTimeout(deadline);
    release();
  }
}

/**
 * One request, with a single `Retry-After`-honouring retry on 429/503 —
 * never more than one, so a host that keeps saying "not yet" fails the call
 * rather than blocking it indefinitely.
 */
async function rawRequest(
  baseUrl: string,
  path: string,
  auth: HttpAuthStrategy,
  options: HttpRequestOptions,
): Promise<Attempt> {
  const target = buildUrl(baseUrl, path, options.query);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await attemptOnce(target, auth, options);
    if (!result.ok) return result;

    const retryable = result.response.status === 429 || result.response.status === 503;
    if (retryable && attempt === 0) {
      const delay = retryDelayMs(result.response.headers.get('retry-after'));
      if (delay !== null) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
    return result;
  }
  // Unreachable — the loop always returns on its second iteration — but the
  // typechecker needs an exhaustive return.
  return { ok: false, error: 'Retry budget exhausted.' };
}

/** A provider's error body, reduced to one sentence. GitLab, Bitbucket and
 *  Azure DevOps all send a JSON body with `message`/`error`/`error_description`
 *  on failure; this reads whichever is present and falls back to the status
 *  alone when the body is not JSON at all (an HTML error page, a proxy's 502). */
export function describeHttpFailure(status: number, body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      const row = parsed as Record<string, unknown>;
      const message = row['message'] ?? row['error'] ?? row['error_description'];
      if (typeof message === 'string' && message.length > 0) return message;
      if (Array.isArray(message)) return message.map(String).join('; ');
      if (message && typeof message === 'object') {
        // GitLab's validation errors come back as `{message: {field: [...]}}`.
        const parts = Object.entries(message as Record<string, unknown>).map(
          ([field, errors]) => `${field} ${Array.isArray(errors) ? errors.join(', ') : String(errors)}`,
        );
        if (parts.length > 0) return parts.join('; ');
      }
    }
  } catch {
    // Not JSON — fall through to the status-only message.
  }
  return `Request failed with status ${status}.`;
}

/** One JSON call. `T` is trusted, not validated — every caller in this
 *  module parses the shape it actually needs out of the result, the same
 *  posture `gh-parse.ts` takes with `gh`'s own JSON. */
export async function requestJson<T = unknown>(
  baseUrl: string,
  path: string,
  auth: HttpAuthStrategy,
  options: HttpRequestOptions = {},
): Promise<HttpResult<T>> {
  const result = await rawRequest(baseUrl, path, auth, options);
  if (!result.ok) return { ok: false, status: null, error: result.error };
  const { response, text } = result;
  if (!response.ok) {
    return { ok: false, status: response.status, error: describeHttpFailure(response.status, text) };
  }
  if (text.length === 0) {
    return { ok: true, status: response.status, data: undefined as T, headers: headersToRecord(response.headers) };
  }
  try {
    return {
      ok: true,
      status: response.status,
      data: JSON.parse(text) as T,
      headers: headersToRecord(response.headers),
    };
  } catch {
    return { ok: false, status: response.status, error: 'The response was not valid JSON.' };
  }
}

/** One plain-text call — a job/pipeline trace, which is never JSON. */
export async function requestText(
  baseUrl: string,
  path: string,
  auth: HttpAuthStrategy,
  options: HttpRequestOptions = {},
): Promise<HttpResult<string>> {
  const result = await rawRequest(baseUrl, path, auth, options);
  if (!result.ok) return { ok: false, status: null, error: result.error };
  const { response, text } = result;
  if (!response.ok) {
    return { ok: false, status: response.status, error: describeHttpFailure(response.status, text) };
  }
  return { ok: true, status: response.status, data: text, headers: headersToRecord(response.headers) };
}
