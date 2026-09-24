import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ollamaDelete,
  ollamaPs,
  ollamaPull,
  ollamaShow,
  ollamaTags,
  ollamaUnload,
  ollamaVersion,
  resolveOllamaBaseUrl,
} from './client';

/**
 * Never a mocked `fetch` — every case here binds a real, throwaway
 * `node:http` server on `127.0.0.1`, mirroring `api-client/send.test.ts`'s
 * own house rule. Exercises NDJSON chunk-splitting across real reads (not a
 * single buffered body), cancel mid-pull, and the transport failures the
 * phase doc's own guardrail calls out — daemon down, model not found.
 */
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

let activeServer: Server | undefined;
afterEach(async () => {
  if (activeServer) await stopServer(activeServer);
  activeServer = undefined;
});

describe('resolveOllamaBaseUrl', () => {
  it('defaults to the loopback daemon', () => {
    expect(resolveOllamaBaseUrl({})).toBe('http://127.0.0.1:11434');
  });

  it('accepts a bare host:port', () => {
    expect(resolveOllamaBaseUrl({ OLLAMA_HOST: '0.0.0.0:9999' })).toBe('http://0.0.0.0:9999');
  });

  it('leaves a full URL untouched', () => {
    expect(resolveOllamaBaseUrl({ OLLAMA_HOST: 'https://ollama.example.com' })).toBe(
      'https://ollama.example.com',
    );
  });
});

describe('ollamaVersion', () => {
  it('parses the version field', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ version: '0.4.2' }));
    });
    activeServer = server;
    await expect(ollamaVersion({ baseUrl: origin })).resolves.toBe('0.4.2');
  });

  it('throws when nothing is listening (daemon down)', async () => {
    // An address nothing binds to — the http client should reject, not hang.
    await expect(ollamaVersion({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 })).rejects.toThrow();
  });

  it('throws on a timeout rather than hanging', async () => {
    const { server, origin } = await startThrowawayServer(() => {
      // Never responds.
    });
    activeServer = server;
    await expect(ollamaVersion({ baseUrl: origin, timeoutMs: 100 })).rejects.toThrow(/timed out/);
  });
});

describe('ollamaTags', () => {
  it('maps snake_case rows to the camelCase contract', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [
            {
              name: 'qwen3.5:14b',
              model: 'qwen3.5:14b',
              modified_at: '2026-09-24T00:00:00Z',
              size: 123,
              digest: 'sha256:abc',
              details: {
                parent_model: '',
                format: 'gguf',
                family: 'qwen3',
                families: ['qwen3'],
                parameter_size: '14B',
                quantization_level: 'Q4_K_M',
              },
            },
          ],
        }),
      );
    });
    activeServer = server;
    const models = await ollamaTags({ baseUrl: origin });
    expect(models).toEqual([
      {
        name: 'qwen3.5:14b',
        model: 'qwen3.5:14b',
        modifiedAt: '2026-09-24T00:00:00Z',
        size: 123,
        digest: 'sha256:abc',
        details: {
          parentModel: '',
          format: 'gguf',
          family: 'qwen3',
          families: ['qwen3'],
          parameterSize: '14B',
          quantizationLevel: 'Q4_K_M',
        },
      },
    ]);
  });

  it('skips a row missing required fields rather than throwing', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'broken' }] }));
    });
    activeServer = server;
    await expect(ollamaTags({ baseUrl: origin })).resolves.toEqual([]);
  });

  it('returns an empty list for a 404', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    activeServer = server;
    await expect(ollamaTags({ baseUrl: origin })).rejects.toThrow(/404/);
  });
});

describe('ollamaShow', () => {
  it('derives contextLength from model_info', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          modelfile: 'FROM qwen3.5:14b',
          capabilities: ['completion', 'tools'],
          model_info: { 'qwen3.context_length': 65536 },
        }),
      );
    });
    activeServer = server;
    const detail = await ollamaShow('qwen3.5:14b', { baseUrl: origin });
    expect(detail.contextLength).toBe(65536);
    expect(detail.capabilities).toEqual(['completion', 'tools']);
  });

  it('throws for a model Ollama does not have', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'model "nope" not found' }));
    });
    activeServer = server;
    await expect(ollamaShow('nope', { baseUrl: origin })).rejects.toThrow(/404/);
  });
});

describe('ollamaPs', () => {
  it('maps running-model rows', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [
            {
              name: 'qwen3.5:14b',
              model: 'qwen3.5:14b',
              size: 123,
              digest: 'sha256:abc',
              expires_at: '2026-09-24T01:00:00Z',
              size_vram: 456,
              context_length: 65536,
            },
          ],
        }),
      );
    });
    activeServer = server;
    const running = await ollamaPs({ baseUrl: origin });
    expect(running).toEqual([
      {
        name: 'qwen3.5:14b',
        model: 'qwen3.5:14b',
        size: 123,
        digest: 'sha256:abc',
        details: undefined,
        expiresAt: '2026-09-24T01:00:00Z',
        sizeVram: 456,
        contextLength: 65536,
      },
    ]);
  });
});

describe('ollamaDelete / ollamaUnload', () => {
  it('resolves on a 200 delete', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200);
      res.end();
    });
    activeServer = server;
    await expect(ollamaDelete('qwen3.5:14b', { baseUrl: origin })).resolves.toBeUndefined();
  });

  it('unload posts keep_alive: 0', async () => {
    let body = '';
    const { server, origin } = await startThrowawayServer((req, res) => {
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ done: true }));
      });
    });
    activeServer = server;
    await ollamaUnload('qwen3.5:14b', { baseUrl: origin });
    expect(JSON.parse(body)).toEqual({ model: 'qwen3.5:14b', keep_alive: 0 });
  });
});

describe('ollamaPull', () => {
  it('parses NDJSON split across chunks', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      const lines = [
        { status: 'pulling manifest' },
        { status: 'downloading sha256:abc', digest: 'sha256:abc', total: 100, completed: 40 },
        { status: 'downloading sha256:abc', digest: 'sha256:abc', total: 100, completed: 100 },
        { status: 'success' },
      ];
      // Write one line, split the SECOND line across two writes mid-object,
      // to prove the carry-over buffer (not just `split('\n')`) is doing the
      // work — a single-write test would pass even with no carry-over at all.
      const serialized = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
      const mid = Math.floor(serialized.length / 2);
      res.write(serialized.slice(0, mid));
      setTimeout(() => res.end(serialized.slice(mid)), 10);
    });
    activeServer = server;

    const seen: string[] = [];
    await ollamaPull('qwen3.5:14b', {
      baseUrl: origin,
      onLine: (line) => seen.push(line.status),
    });
    expect(seen).toEqual([
      'pulling manifest',
      'downloading sha256:abc',
      'downloading sha256:abc',
      'success',
    ]);
  });

  it('throws on an {error} line and stops reading', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`);
      res.write(`${JSON.stringify({ error: 'model "nope" not found' })}\n`);
    });
    activeServer = server;
    await expect(
      ollamaPull('nope', { baseUrl: origin, onLine: () => {} }),
    ).rejects.toThrow(/not found/);
  });

  it('aborts mid-pull when the signal fires', async () => {
    let closed = false;
    const { server, origin } = await startThrowawayServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`);
      req.on('close', () => {
        closed = true;
      });
      // Otherwise never ends — the test asserts the client gives up, not the server.
    });
    activeServer = server;

    const controller = new AbortController();
    const pullPromise = ollamaPull('qwen3.5:14b', {
      baseUrl: origin,
      signal: controller.signal,
      onLine: () => controller.abort(),
    });
    await expect(pullPromise).rejects.toThrow();
    // Give the server a tick to observe the aborted connection.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(closed).toBe(true);
  });
});
