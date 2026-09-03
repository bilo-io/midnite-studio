import { COUNCIL_OUTPUT_CAP_BYTES } from '@midnite/studio-shared';

import { appendCapped } from '../../council-output';
import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate, interpolateRecord } from '../interpolate';

/**
 * The `http` node — the MVP's centre of gravity.
 *
 * Node 22's global `fetch`, no new dependency (`.prototools` pins 22.12.0).
 *
 * **A non-2xx is a success.** Counter-intuitive enough to be worth stating: a
 * 404 is a *result* — it is what a workflow checking whether a record exists
 * is looking for — so it settles `ok: true` with the status recorded, and a
 * downstream `condition` node decides what it means. Only a transport failure
 * (DNS, connection refused, the deadline) is `ok: false`; there is no answer to
 * record at all in that case.
 */

/**
 * Same cap as a council member's captured output, reused rather than a second
 * number invented for the same job: bound what a run stores, and tell the user
 * when it bit.
 */
export const HTTP_RESPONSE_CAP_BYTES = COUNCIL_OUTPUT_CAP_BYTES;

export type HttpNodeOutput = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  /**
   * Whether `body` is parsed JSON or the raw text. `{{...}}` interpolation
   * against a string body can only ever produce the whole string, so a
   * downstream node needs to know which it got.
   */
  bodyIsJson: boolean;
  durationMs: number;
  /** The response hit {@link HTTP_RESPONSE_CAP_BYTES} and was cut off. */
  truncated: boolean;
};

/** Reads the whole body, stopping at the cap rather than buffering the lot. */
async function readCapped(response: Response): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: '', truncated: false };

  let buffer: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let truncated = false;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const capped = appendCapped(buffer, value, HTTP_RESPONSE_CAP_BYTES);
      buffer = capped.buffer as Uint8Array<ArrayBuffer>;
      truncated = truncated || capped.truncated;
      // Nothing more can be kept, so stop pulling bytes off the wire rather
      // than reading a 40 MB body to throw it away.
      if (truncated) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return { text: new TextDecoder().decode(buffer), truncated };
}

export const httpExecutor: NodeExecutor = async (node, context): Promise<NodeOutcome> => {
  if (node.kind !== 'http') return { ok: false, error: 'Not an http node.' };
  const config = node.config;

  const url = interpolate(config.url, context.upstream);
  if (!url.ok) return { ok: false, error: url.error };
  const headers = interpolateRecord(config.headers, context.upstream);
  if (!headers.ok) return { ok: false, error: headers.error };
  const params = interpolateRecord(config.params, context.upstream);
  if (!params.ok) return { ok: false, error: params.error };

  let target: URL;
  try {
    target = new URL(url.value);
  } catch {
    return { ok: false, error: `"${url.value}" is not a valid URL.` };
  }
  // `queryShaped` is what the feature note calls the QUERY verb; params are
  // honoured whenever they are present, and the flag is what a UI toggles.
  for (const [key, value] of Object.entries(params.value)) target.searchParams.set(key, value);

  let body: string | undefined;
  if (config.body !== undefined && config.method !== 'GET' && config.method !== 'HEAD') {
    const interpolated = interpolate(config.body, context.upstream);
    if (!interpolated.ok) return { ok: false, error: interpolated.error };
    body = interpolated.value;
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), context.timeoutMs);
  deadline.unref?.();
  // A cancel arriving between nodes is caught by the engine; one arriving
  // mid-request has to reach the socket, which is what this poll is for.
  const cancelPoll = setInterval(() => {
    if (context.signal.cancelled()) controller.abort();
  }, 100);
  cancelPoll.unref?.();

  const startedAt = Date.now();
  try {
    const response = await fetch(target, {
      method: config.method,
      headers: headers.value,
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
      redirect: 'follow',
    });

    const { text, truncated } = await readCapped(response);
    const contentType = response.headers.get('content-type') ?? '';
    let parsed: unknown = text;
    let bodyIsJson = false;
    // Only claim JSON when the body actually parsed: a truncated JSON response
    // is a `content-type: application/json` that is no longer valid JSON, and
    // recording it as an object nobody can read helps nobody.
    if (/\bjson\b/i.test(contentType) && text !== '' && !truncated) {
      try {
        parsed = JSON.parse(text);
        bodyIsJson = true;
      } catch {
        parsed = text;
      }
    }

    /*
      A plain object, not the `Headers` instance: a `Headers` does not survive
      `JSON.stringify` into the run store — it serialises as `{}` — and the
      headers are exactly what a downstream `{{node.headers.location}}` wants.
      Built with `forEach` because this package's lib does not carry the DOM
      iterable declarations, so `Headers` is not iterable to the typechecker.
    */
    const headerRecord: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headerRecord[key] = value;
    });

    const output: HttpNodeOutput = {
      status: response.status,
      headers: headerRecord,
      body: parsed,
      bodyIsJson,
      durationMs: Date.now() - startedAt,
      truncated,
    };
    return { ok: true, output, truncated };
  } catch (error) {
    if (context.signal.cancelled()) return { ok: false, error: 'Cancelled.' };
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: `Timed out after ${context.timeoutMs} ms.` };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `${config.method} ${target.href} failed: ${message}` };
  } finally {
    clearTimeout(deadline);
    clearInterval(cancelPoll);
  }
};
