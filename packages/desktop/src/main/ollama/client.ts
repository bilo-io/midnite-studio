import type {
  OllamaModel,
  OllamaModelDetail,
  OllamaModelDetails,
  OllamaRunningModel,
} from '@midnite/studio-shared';
import { deriveContextLength } from '@midnite/studio-shared';

/**
 * The main-side Ollama client (Phase 96 Theme B) — every HTTP call to the
 * local daemon lives here, never in the renderer (see the phase doc's own
 * "Scope guardrails": the renderer reaches Ollama only through
 * `window.midniteStudio`).
 *
 * Ollama's REST responses are snake_case (`parent_model`, `modified_at`,
 * `size_vram`, `context_length`, …); every mapper in this file translates
 * into this app's camelCase contract (`shared/src/ollama.ts`) before the
 * result crosses back toward IPC — nothing downstream of this module ever
 * sees a raw Ollama field name.
 *
 * Style follows `api-client/send.ts`: throw for a transport failure (bad
 * URL, refused connection, timeout, abort), resolve for any settled HTTP
 * response. The IPC handler layer (`ipc/ollama-handlers.ts`) is what converts
 * a throw into a `GitOpResult` failure — this module never builds one itself.
 */

const DEFAULT_HOST = 'http://127.0.0.1:11434';
/** Short — this is probed eagerly (Health page, Models view on focus), and an
 *  absent daemon must never make either page feel stuck. */
const DEFAULT_TIMEOUT_MS = 3000;
/** Pull has no data budget — a large model can take minutes — so it gets no
 *  fetch-level timeout at all; only the caller's own cancel (an AbortSignal)
 *  ends it early. */

/**
 * `OLLAMA_HOST` may be a bare `host:port`, `host`, or a full URL — Ollama
 * itself accepts all three. Normalised to a URL origin so callers can just
 * concatenate a path.
 */
export function resolveOllamaBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.OLLAMA_HOST?.trim();
  if (!raw) return DEFAULT_HOST;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
  return `http://${raw.replace(/\/+$/, '')}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  deadline.unref?.();
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (timedOut) throw new Error(`Ollama request to ${url} timed out after ${timeoutMs} ms.`);
      throw new Error('Ollama request cancelled.');
    }
    throw error;
  } finally {
    clearTimeout(deadline);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;
}
function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapDetails(raw: unknown): OllamaModelDetails | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  return {
    parentModel: asString(record.parent_model),
    format: asString(record.format),
    family: asString(record.family),
    families: asStringArray(record.families),
    parameterSize: asString(record.parameter_size),
    quantizationLevel: asString(record.quantization_level),
  };
}

function mapTagsRow(raw: Record<string, unknown>): OllamaModel | null {
  const name = asString(raw.name ?? raw.model);
  const model = asString(raw.model ?? raw.name);
  const digest = asString(raw.digest);
  const size = asNumber(raw.size);
  if (!name || !model || digest === undefined || size === undefined) return null;
  return {
    name,
    model,
    modifiedAt: asString(raw.modified_at) ?? null,
    size,
    digest,
    details: mapDetails(raw.details),
  };
}

function mapTagsBody(body: unknown): OllamaModel[] {
  const rows = asRecord(body)?.models;
  if (!Array.isArray(rows)) return [];
  const models: OllamaModel[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const mapped = mapTagsRow(record);
    if (mapped) models.push(mapped);
  }
  return models;
}

/** Throws on a transport failure; degrade-to-null is the caller's job (the
 *  IPC handler wraps this and returns a `GitOpResult` failure). */
export async function ollamaVersion(
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<string> {
  const baseUrl = opts.baseUrl ?? resolveOllamaBaseUrl();
  const res = await fetchWithTimeout(`${baseUrl}/api/version`, {}, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Ollama /api/version returned ${res.status}.`);
  const body = (await res.json()) as unknown;
  const version = asString(asRecord(body)?.version);
  if (!version) throw new Error('Ollama /api/version returned no version field.');
  return version;
}

export async function ollamaTags(
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<OllamaModel[]> {
  const baseUrl = opts.baseUrl ?? resolveOllamaBaseUrl();
  const res = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Ollama /api/tags returned ${res.status}.`);
  return mapTagsBody(await res.json());
}

/** ollama.com itself — separate origin from the local daemon's own `OLLAMA_HOST`. */
const CLOUD_ORIGIN = 'https://ollama.com';

/**
 * The cloud catalogue (Phase 96 Theme F) — `GET https://ollama.com/api/tags`,
 * the same shape as the local daemon's own `/api/tags`, so it reuses
 * {@link mapTagsBody}. Key-authenticated when `apiKey` is given (the vault's
 * `ollama.apiKey`, resolved by the IPC handler, never read here).
 */
export async function ollamaCloudTags(
  opts: { apiKey?: string; timeoutMs?: number } = {},
): Promise<OllamaModel[]> {
  const res = await fetchWithTimeout(
    `${CLOUD_ORIGIN}/api/tags`,
    { headers: opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {} },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`ollama.com/api/tags returned ${res.status}.`);
  return mapTagsBody(await res.json());
}

/**
 * A model this app expects ollama.com's cloud catalogue to keep carrying —
 * verified present when this was written (Phase 96, 2026-09-24). Used only
 * as {@link ollamaSignedIn}'s cheap probe target, never pulled or run.
 */
export const OLLAMA_SIGNIN_PROBE_MODEL = 'qwen3.5:cloud';

/**
 * Sign-in detection (Phase 96 Theme F) — "can the local daemon already reach
 * a cloud model" is exactly what a `show` on a known `:cloud` name answers:
 * signed out, the daemon's own error names that; signed in, `show` resolves
 * (or fails for an unrelated reason, which this treats as "can't tell,
 * assume not signed in" — the false negative costs a `run ollama signin`
 * suggestion the user didn't need, not a broken launch).
 */
export async function ollamaSignedIn(
  opts: { baseUrl?: string; timeoutMs?: number; probeModel?: string } = {},
): Promise<boolean> {
  try {
    await ollamaShow(opts.probeModel ?? OLLAMA_SIGNIN_PROBE_MODEL, {
      baseUrl: opts.baseUrl,
      timeoutMs: opts.timeoutMs,
    });
    return true;
  } catch {
    return false;
  }
}

export async function ollamaShow(
  model: string,
  opts: { verbose?: boolean; baseUrl?: string; timeoutMs?: number } = {},
): Promise<OllamaModelDetail> {
  const baseUrl = opts.baseUrl ?? resolveOllamaBaseUrl();
  const res = await fetchWithTimeout(
    `${baseUrl}/api/show`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, verbose: opts.verbose ?? false }),
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Ollama /api/show returned ${res.status} for "${model}".`);
  const body = (await res.json()) as unknown;
  const record = asRecord(body) ?? {};
  const modelInfo = asRecord(record.model_info);
  return {
    modelfile: asString(record.modelfile),
    parameters: asString(record.parameters),
    template: asString(record.template),
    license: Array.isArray(record.license)
      ? asStringArray(record.license)
      : asString(record.license),
    details: mapDetails(record.details),
    modelInfo,
    capabilities: asStringArray(record.capabilities),
    contextLength: deriveContextLength(modelInfo),
  };
}

export async function ollamaPs(
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<OllamaRunningModel[]> {
  const baseUrl = opts.baseUrl ?? resolveOllamaBaseUrl();
  const res = await fetchWithTimeout(`${baseUrl}/api/ps`, {}, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Ollama /api/ps returned ${res.status}.`);
  const body = (await res.json()) as unknown;
  const rows = asRecord(body)?.models;
  if (!Array.isArray(rows)) return [];
  const models: OllamaRunningModel[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const name = asString(record.name ?? record.model);
    const model = asString(record.model ?? record.name);
    const digest = asString(record.digest);
    const size = asNumber(record.size);
    if (!name || !model || digest === undefined || size === undefined) continue;
    models.push({
      name,
      model,
      size,
      digest,
      details: mapDetails(record.details),
      expiresAt: asString(record.expires_at) ?? null,
      sizeVram: asNumber(record.size_vram),
      contextLength: asNumber(record.context_length),
    });
  }
  return models;
}

export async function ollamaDelete(
  model: string,
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<void> {
  const baseUrl = opts.baseUrl ?? resolveOllamaBaseUrl();
  const res = await fetchWithTimeout(
    `${baseUrl}/api/delete`,
    { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model }) },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Ollama /api/delete returned ${res.status} for "${model}".`);
}

/** `keep_alive: 0` against `/api/generate` — Ollama's documented way to
 *  unload a model without generating anything. Never touches the daemon
 *  itself; see the phase doc's "never quit the user's daemon" guardrail. */
export async function ollamaUnload(
  model: string,
  opts: { baseUrl?: string; timeoutMs?: number } = {},
): Promise<void> {
  const baseUrl = opts.baseUrl ?? resolveOllamaBaseUrl();
  const res = await fetchWithTimeout(
    `${baseUrl}/api/generate`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, keep_alive: 0 }),
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`Ollama /api/generate (unload) returned ${res.status} for "${model}".`);
}

/**
 * `POST /api/create` — builds a new model from an existing one plus
 * overriding parameters (Theme G's one-click `<model>-64k` context variant is
 * the first caller). Consumes the NDJSON stream itself and resolves once a
 * terminal `{status:"success"}` line arrives, or rejects on the first
 * `{error}` line — Theme G's own progress UI is out of scope for this PR, so
 * this awaits completion rather than exposing per-line progress the way
 * {@link ollamaPull} does.
 */
export async function ollamaCreate(
  req: { from: string; name: string; parameters?: Record<string, string | number> },
  opts: { baseUrl?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const baseUrl = opts.baseUrl ?? resolveOllamaBaseUrl();
  const res = await fetchWithTimeout(
    `${baseUrl}/api/create`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: req.name,
        from: req.from,
        ...(req.parameters ? { parameters: req.parameters } : {}),
      }),
    },
    // Model creation has no fixed budget either — bounded only by the caller's signal.
    24 * 60 * 60 * 1000,
    opts.signal,
  );
  if (!res.ok || !res.body) {
    throw new Error(`Ollama /api/create returned ${res.status} for "${req.name}".`);
  }
  await consumeNdjson(res.body, (line) => {
    if (typeof line.error === 'string') throw new Error(line.error);
  });
}

/** One decoded NDJSON line from a streaming Ollama response. */
type NdjsonLine = Record<string, unknown>;

/**
 * Reads a streaming NDJSON body, splitting on `\n` with a carry-over buffer
 * for a line a chunk boundary split mid-object — no existing module in this
 * repo streams NDJSON over a live HTTP response (see the phase doc's own
 * research), so this is written fresh rather than copied from a precedent.
 */
async function consumeNdjson(
  body: ReadableStream<Uint8Array>,
  onLine: (line: NdjsonLine) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  try {
    await readLines();
  } catch (error) {
    // A line's `onLine` threw (e.g. Ollama's `{error: "..."}` line) — stop
    // reading rather than leaving the response stream open.
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }

  async function readLines(): Promise<void> {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      for (const raw of lines) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          continue; // A line split across two chunks despite the carry-over — skip, never throw.
        }
        const record = asRecord(parsed);
        if (record) onLine(record);
      }
    }
    const rest = carry.trim();
    if (rest) {
      try {
        const record = asRecord(JSON.parse(rest));
        if (record) onLine(record);
      } catch {
        // Trailing partial line at stream end — nothing more to parse.
      }
    }
  }
}

export type OllamaPullLine = {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
};

/**
 * `POST /api/pull`, streamed. `onLine` is called once per NDJSON line with
 * the fields the pull queue needs; throttling and `pullId`/`done` bookkeeping
 * live in `pull-queue.ts`, not here — this module stays a thin, testable
 * wrapper over the wire protocol.
 */
export async function ollamaPull(
  model: string,
  opts: { onLine: (line: OllamaPullLine) => void; baseUrl?: string; signal?: AbortSignal },
): Promise<void> {
  const baseUrl = opts.baseUrl ?? resolveOllamaBaseUrl();
  const res = await fetchWithTimeout(
    `${baseUrl}/api/pull`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
    },
    // A pull can run for as long as the download takes — no fetch-level
    // timeout, only the caller's cancel (see the module doc comment above).
    24 * 60 * 60 * 1000,
    opts.signal,
  );
  if (!res.ok || !res.body) {
    throw new Error(`Ollama /api/pull returned ${res.status} for "${model}".`);
  }
  await consumeNdjson(res.body, (line) => {
    if (typeof line.error === 'string') throw new Error(line.error);
    const status = asString(line.status);
    if (status === undefined) return;
    opts.onLine({
      status,
      digest: asString(line.digest),
      total: asNumber(line.total),
      completed: asNumber(line.completed),
    });
  });
}

export type OllamaChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * `POST /api/chat`, one-shot (`stream: false`) — Theme I's wand and Plan with
 * AI, the one place this app calls a model's HTTP API directly rather than
 * going through a CLI (see the phase doc's "Wand / Plan-with-AI on Ollama
 * call `/api/chat` directly" decision: Ollama is local with no key to store,
 * and a pty round-trip would only add latency).
 *
 * Not streamed: both callers (`main/ai/improve-field.ts`,
 * `main/ai/plan-blueprint.ts`) want the whole reply before doing anything
 * with it — a rewrite drops straight into a field, a blueprint has to parse
 * as JSON — so there is nothing a partial chunk would let either do sooner.
 * `opts.signal` still cancels the in-flight request exactly like every other
 * export here; there is just no NDJSON stream to interrupt mid-line.
 */
export async function ollamaChat(
  req: { model: string; messages: OllamaChatMessage[] },
  opts: { baseUrl?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const baseUrl = opts.baseUrl ?? resolveOllamaBaseUrl();
  const res = await fetchWithTimeout(
    `${baseUrl}/api/chat`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: req.model, messages: req.messages, stream: false }),
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    opts.signal,
  );
  if (!res.ok) throw new Error(`Ollama /api/chat returned ${res.status} for "${req.model}".`);
  const body = (await res.json()) as unknown;
  const content = asString(asRecord(asRecord(body)?.message)?.content);
  if (content === undefined) throw new Error('Ollama /api/chat returned no message content.');
  return content;
}
