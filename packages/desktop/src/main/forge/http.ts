/**
 * A provider-neutral HTTP client for a forge adapter backed by a real API
 * rather than a CLI — a sibling of `github/gh-shell.ts`, never a replacement:
 * GitHub keeps its `gh` subprocess path unchanged (see `adapter.ts`'s
 * docblock and the phase doc's "Not in this phase" section).
 *
 * Phase 90 Theme D scoped this module and deliberately deferred it: "no
 * consumer exists in this batch (Themes E-G); building it unused would be
 * speculative. The next provider theme builds it against its own first real
 * caller." Theme F (Bitbucket Cloud) is that caller. Kept **provider-neutral
 * rather than Bitbucket-shaped** on the phase doc's own instruction, so
 * Themes E (GitLab) and G (Azure DevOps) can adopt it instead of each writing
 * a second HTTP client — modelled on `api-client/send.ts` and
 * `workflow/executors/http.ts`, which already do HTTP in main, rather than
 * adding a fourth style.
 *
 * **Auth is a strategy object, not a header string**, because the three new
 * providers do not agree on one shape: GitLab's `PRIVATE-TOKEN` header,
 * Bitbucket's HTTP Basic (a workspace login plus an App Password or access
 * token), and Azure's HTTP Basic with an empty username and the PAT as the
 * password. A caller states intent ("this account's bearer token") and this
 * module builds the header.
 */

export type ForgeHttpAuth =
  | { kind: 'bearer'; token: string }
  | { kind: 'basic'; username: string; password: string }
  | { kind: 'header'; name: string; value: string }
  | { kind: 'none' };

export type ForgeHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type ForgeHttpRequest = {
  method: ForgeHttpMethod;
  /** Absolute URL — every adapter builds its own from the account's host. */
  url: string;
  auth: ForgeHttpAuth;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON-serialised onto the body with `Content-Type: application/json`.
   *  Omit for a bodyless request. */
  json?: unknown;
  /**
   * Overrides the `Content-Type` a `json` body is sent with — default
   * `application/json`. Exists for Azure DevOps's work-item PATCH, which
   * takes a JSON Patch array and, per its own documented contract, wants
   * `application/json-patch+json` rather than the plain JSON every other
   * provider's write accepts (`azure-client.ts`'s `azPatch`). No other
   * caller sets this.
   */
  contentType?: string;
  /** `'json'` (default) parses the body; `'text'` is for a log/patch endpoint
   *  that answers with plain text rather than a JSON envelope. */
  responseType?: 'json' | 'text';
  timeoutMs?: number;
};

export type ForgeHttpResult<T = unknown> =
  | { ok: true; status: number; data: T; headers: Record<string, string> }
  | { ok: false; status: number | null; error: string };

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * A 429 is retried once, and only when the wait it names is short enough to
 * actually sit through inline — a five-minute `Retry-After` on an interactive
 * read is a failure the UI should report, not a request the renderer should
 * silently hang on.
 */
const MAX_RETRY_AFTER_MS = 10_000;

function applyAuth(auth: ForgeHttpAuth, headers: Record<string, string>): void {
  switch (auth.kind) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${auth.token}`;
      return;
    case 'basic': {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`, 'utf8').toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
      return;
    }
    case 'header':
      headers[auth.name] = auth.value;
      return;
    case 'none':
      return;
  }
}

/**
 * `Retry-After` as milliseconds — seconds ("120") or an HTTP-date, the two
 * forms the header is allowed to take. `null` when absent or unparseable,
 * which this module treats as "do not retry".
 */
function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The per-host request budget the phase doc asks for — a sliding window
 * rather than a hard block, so a burst waits instead of failing. Deliberately
 * generous: this bounds runaway polling, it does not try to model any one
 * provider's real rate-limit policy (GitLab, Bitbucket and Azure each publish
 * their own, and reconciling three is future work the phase doc leaves open —
 * "start shared, and only split if a provider's rate limit forces it").
 */
const REQUESTS_PER_WINDOW = 100;
const WINDOW_MS = 60_000;
const hostWindows = new Map<string, number[]>();

async function acquireBudget(host: string): Promise<void> {
  for (;;) {
    const now = Date.now();
    const recent = (hostWindows.get(host) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length < REQUESTS_PER_WINDOW) {
      recent.push(now);
      hostWindows.set(host, recent);
      return;
    }
    const oldest = recent[0]!;
    await delay(WINDOW_MS - (now - oldest) + 5);
  }
}

/** Test-only reset — module-level state would otherwise leak between cases. */
export function __resetForgeHttpBudgetForTests(): void {
  hostWindows.clear();
}

/**
 * Best-effort error message out of a provider's JSON error envelope. The
 * three new providers each shape errors differently (GitLab: `message` or
 * `error`; Bitbucket: `error.message`; Azure: `message`), and there is no
 * shared schema to parse against — this tries the common paths and falls
 * back to the HTTP status text rather than inventing a message.
 */
function extractErrorMessage(parsed: unknown, fallback: string): string {
  if (typeof parsed !== 'object' || parsed === null) return fallback;
  const row = parsed as Record<string, unknown>;
  const nestedError = row['error'];
  if (typeof nestedError === 'object' && nestedError !== null) {
    const message = (nestedError as Record<string, unknown>)['message'];
    if (typeof message === 'string' && message.length > 0) return message;
  }
  if (typeof nestedError === 'string' && nestedError.length > 0) return nestedError;
  const message = row['message'];
  if (typeof message === 'string' && message.length > 0) return message;
  return fallback;
}

async function sendOnce(req: ForgeHttpRequest, target: URL): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...req.headers };
  applyAuth(req.auth, headers);
  let body: string | undefined;
  if (req.json !== undefined) {
    headers['Content-Type'] = req.contentType ?? 'application/json';
    body = JSON.stringify(req.json);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(target, {
      method: req.method,
      headers,
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send one request against a forge's HTTP API.
 *
 * A non-2xx is a settled result, not a thrown error — the same rule
 * `workflow/executors/http.ts` and every `Forge*Result` envelope in `shared`
 * follow: only a transport failure (bad URL, timeout, DNS/connection error,
 * abort) resolves `ok: false` with `status: null`; a 404 or a 422 resolves
 * `ok: false` with the real status and the provider's own message, which is
 * what a caller building a `ForgeWriteResult` needs to show the user the
 * provider's actual sentence.
 */
export async function forgeHttpRequest<T = unknown>(req: ForgeHttpRequest): Promise<ForgeHttpResult<T>> {
  let target: URL;
  try {
    target = new URL(req.url);
  } catch {
    return { ok: false, status: null, error: `"${req.url}" is not a valid URL.` };
  }
  for (const [key, value] of Object.entries(req.query ?? {})) {
    if (value === undefined) continue;
    target.searchParams.set(key, String(value));
  }

  await acquireBudget(target.host);

  let response: Response;
  try {
    response = await sendOnce(req, target);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, status: null, error: `Timed out after ${req.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms.` };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: null, error: `${req.method} ${target.href} failed: ${message}` };
  }

  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
    if (retryAfterMs !== null && retryAfterMs <= MAX_RETRY_AFTER_MS) {
      await delay(retryAfterMs);
      await acquireBudget(target.host);
      try {
        response = await sendOnce(req, target);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, status: null, error: `${req.method} ${target.href} failed: ${message}` };
      }
    }
  }

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  if (req.responseType === 'text') {
    const text = await response.text();
    if (!response.ok) return { ok: false, status: response.status, error: text || response.statusText };
    return { ok: true, status: response.status, data: text as unknown as T, headers: responseHeaders };
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    return { ok: false, status: response.status, error: extractErrorMessage(parsed, response.statusText) };
  }
  return { ok: true, status: response.status, data: parsed as T, headers: responseHeaders };
}
