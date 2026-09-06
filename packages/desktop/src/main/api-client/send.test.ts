import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { BODY_MODES, type ApiRequestDraft, type BodyMode } from '@midnite/studio-shared';

import { startFixtureServer, type FixtureServer } from '../demo-api/fixture-server';
import { HTTP_RESPONSE_CAP_BYTES } from '../workflow/executors/http';
import { cancelRequest, pendingRequestCount, sendApiRequest, type ApiSendRequest } from './send';

/**
 * Two servers back this suite, per Decision 8 — never a mocked `fetch`.
 *
 * `startFixtureServer()` (Theme D's demo API) covers the plain 200/404 cases;
 * confirmed by reading `demo-api/routes.ts` that it has no hang, abort, or
 * oversized route of its own, the timeout/abort/truncation cases below stand
 * up their own throwaway `node:http` servers instead. Every one of them binds
 * `127.0.0.1` on an ephemeral port, so this file's acceptance criterion is the
 * same as the http executor's: it passes with the machine's network cable
 * out.
 */

let api: FixtureServer;
let counter = 0;

beforeAll(async () => {
  api = await startFixtureServer();
});

afterAll(async () => {
  await api.stop();
});

function nextRequestId(): string {
  counter += 1;
  return `req-${counter}`;
}

function emptyBodies(): Record<BodyMode, string> {
  return Object.fromEntries(BODY_MODES.map((mode) => [mode, ''])) as Record<BodyMode, string>;
}

function draft(over: Partial<ApiRequestDraft> = {}): ApiRequestDraft {
  return {
    id: 'r',
    name: 'r',
    method: 'GET',
    url: '',
    params: [],
    headers: [],
    auth: { type: 'none' },
    bodyMode: 'none',
    bodies: emptyBodies(),
    binaryPath: null,
    ...over,
  };
}

function send(over: Partial<ApiSendRequest> & { draft: ApiRequestDraft }): ReturnType<typeof sendApiRequest> {
  return sendApiRequest(
    {
      repoId: 'demo',
      requestId: nextRequestId(),
      collectionVariables: [],
      ...over,
    },
    new AbortController().signal,
  );
}

/** Starts a throwaway `node:http` server and resolves its loopback origin. */
async function startThrowawayServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: Server; origin: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Server bound no port.');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function stopServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe('sendApiRequest — against the fixture server', () => {
  it('sets bodyIsJson on a 200 with a JSON body', async () => {
    const response = await send({ draft: draft({ url: `${api.baseUrl}/items` }) });

    expect(response.status).toBe(200);
    expect(response.bodyIsJson).toBe(true);
    expect(response.warnings).toEqual([]);
    expect(typeof response.durationMs).toBe('number');
  });

  it('resolves a 404 as a normal response rather than throwing', async () => {
    const response = await send({ draft: draft({ url: `${api.baseUrl}/items/does-not-exist` }) });

    expect(response.status).toBe(404);
    expect(response.bodyIsJson).toBe(true);
  });

  it('surfaces an unresolved {{var}} as a warning rather than substituting empty', async () => {
    const response = await send({
      draft: draft({ url: `${api.baseUrl}/items?tag={{missing}}` }),
      collectionVariables: [{ key: 'unused', value: 'x' }],
    });

    expect(response.status).toBe(200);
    expect(response.warnings).toEqual(['Unresolved variable {{missing}} — left as-is.']);
  });

  it('resolves a collection variable used in the URL with no warning', async () => {
    const response = await send({
      draft: draft({ url: '{{base}}/items' }),
      collectionVariables: [{ key: 'base', value: api.baseUrl }],
    });

    expect(response.status).toBe(200);
    expect(response.warnings).toEqual([]);
  });
});

describe('sendApiRequest — timeout', () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    ({ server, origin } = await startThrowawayServer(() => {
      // Never responds — the request must hit its own deadline.
    }));
  });

  afterAll(() => stopServer(server));

  it('names the millisecond budget in the failure', async () => {
    await expect(send({ draft: draft({ url: origin }), timeoutMs: 50 })).rejects.toThrow(/50 ms/);
    expect(pendingRequestCount()).toBe(0);
  });
});

describe('sendApiRequest — abort mid-body', () => {
  let server: Server;
  let origin: string;

  beforeAll(async () => {
    ({ server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('partial-data-then-silence');
      // Deliberately never `res.end()` — the client must abort mid-body.
    }));
  });

  afterAll(() => stopServer(server));

  it('throws and clears the controller map when cancelled mid-flight', async () => {
    const requestId = nextRequestId();
    const pending = sendApiRequest(
      { repoId: 'demo', requestId, draft: draft({ url: origin }), collectionVariables: [] },
      new AbortController().signal,
    );

    // Give the request a moment to reach the server and start streaming
    // headers/body before cancelling it.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pendingRequestCount()).toBe(1);

    expect(cancelRequest(requestId)).toEqual({ ok: true });

    await expect(pending).rejects.toThrow();
    expect(pendingRequestCount()).toBe(0);

    // A cancel on the same (now-settled) id is a no-op, not an error.
    expect(cancelRequest(requestId)).toEqual({ ok: true });
  });
});

describe('sendApiRequest — oversized response', () => {
  const CHUNK_BYTES = 64 * 1024;
  const TOTAL_CHUNKS = 40; // 2.5 MiB total, well past the 500 KiB cap.

  let server: Server;
  let origin: string;
  let finishedWriting = false;
  let socketClosedEarly = false;

  afterEach(async () => {
    await stopServer(server);
  });

  it('stops reading at the cap and the server observes the early close', async () => {
    finishedWriting = false;
    socketClosedEarly = false;
    let chunksWritten = 0;

    ({ server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.on('close', () => {
        if (!finishedWriting) socketClosedEarly = true;
      });

      const chunk = Buffer.alloc(CHUNK_BYTES, 'x');
      const timer = setInterval(() => {
        if (chunksWritten >= TOTAL_CHUNKS || res.destroyed || res.writableEnded) {
          clearInterval(timer);
          if (!res.writableEnded) {
            finishedWriting = true;
            res.end();
          }
          return;
        }
        chunksWritten += 1;
        res.write(chunk);
      }, 15);
      res.on('close', () => clearInterval(timer));
    }));

    const response = await send({ draft: draft({ url: origin }) });

    expect(response.truncated).toBe(true);
    expect(response.sizeBytes).toBeLessThanOrEqual(HTTP_RESPONSE_CAP_BYTES);

    // Give the server a beat to observe the client tearing its socket down.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(finishedWriting).toBe(false);
    expect(socketClosedEarly).toBe(true);
  });
});
