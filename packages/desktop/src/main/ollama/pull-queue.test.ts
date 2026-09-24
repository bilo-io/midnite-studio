import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import type { OllamaPullProgressEvent } from '@midnite/studio-shared';

import {
  cancelOllamaPull,
  configureOllamaPullQueue,
  resetOllamaPullQueueState,
  startOllamaPull,
} from './pull-queue';

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

/** Polls `check` until it returns true or `timeoutMs` elapses — a fixed
 *  `setTimeout` sleep flakes under a full-suite run's own load; this waits
 *  only as long as it actually needs to. */
async function waitForCondition(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

let activeServer: Server | undefined;

/** A minimal stand-in for `BrowserWindow` — only `isDestroyed`/`webContents.send`
 *  are ever called by `pull-queue.ts`. */
function fakeWindow(sink: OllamaPullProgressEvent[]) {
  return {
    isDestroyed: () => false,
    webContents: { send: (_channel: string, event: OllamaPullProgressEvent) => sink.push(event) },
  } as unknown as import('electron').BrowserWindow;
}

afterEach(async () => {
  resetOllamaPullQueueState();
  configureOllamaPullQueue(() => null);
  if (activeServer) await stopServer(activeServer);
  activeServer = undefined;
});

describe('startOllamaPull', () => {
  it('joins an already-pulling model instead of starting a second stream', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      // Never finishes on its own — held open for the duration of this test.
    });
    activeServer = server;
    const originalBaseUrl = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = origin;
    try {
      const first = startOllamaPull('qwen3.5:14b');
      const second = startOllamaPull('qwen3.5:14b');
      expect(second.pullId).toBe(first.pullId);
    } finally {
      process.env.OLLAMA_HOST = originalBaseUrl;
    }
  });
});

describe('cancelOllamaPull', () => {
  it('is a no-op on an unknown id', () => {
    expect(cancelOllamaPull('does-not-exist')).toEqual({ found: false });
  });

  it('aborts an in-flight pull and reports cancelled', async () => {
    let serverSawClose = false;
    const { server, origin } = await startThrowawayServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`);
      req.on('close', () => {
        serverSawClose = true;
      });
    });
    activeServer = server;

    const events: OllamaPullProgressEvent[] = [];
    configureOllamaPullQueue(() => fakeWindow(events));

    const originalBaseUrl = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = origin;
    try {
      const { pullId } = startOllamaPull('qwen3.5:14b');
      // Wait for the pull to actually reach the server and receive the first
      // line, rather than a fixed sleep — this suite runs alongside the rest
      // of the repo's tests, and a fixed delay flakes under that load.
      await waitForCondition(() => events.some((e) => e.pullId === pullId));
      expect(cancelOllamaPull(pullId)).toEqual({ found: true });
      await waitForCondition(() => serverSawClose);

      expect(serverSawClose).toBe(true);
      await waitForCondition(() => events.some((e) => e.pullId === pullId && e.done));
      const terminal = events.find((e) => e.pullId === pullId && e.done);
      expect(terminal?.status).toBe('cancelled');
    } finally {
      process.env.OLLAMA_HOST = originalBaseUrl;
    }
  });
});

describe('progress throttling', () => {
  it('always delivers the terminal success event even under a burst', async () => {
    const { server, origin } = await startThrowawayServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      // A burst of rapid progress lines, well under the 100ms throttle window,
      // followed by the terminal line.
      for (let i = 0; i < 20; i++) {
        res.write(`${JSON.stringify({ status: 'downloading', total: 100, completed: i * 5 })}\n`);
      }
      res.end(`${JSON.stringify({ status: 'success' })}\n`);
    });
    activeServer = server;

    const events: OllamaPullProgressEvent[] = [];
    configureOllamaPullQueue(() => fakeWindow(events));

    const originalBaseUrl = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = origin;
    try {
      const { pullId } = startOllamaPull('qwen3.5:14b');
      await waitForCondition(() => events.some((e) => e.pullId === pullId && e.done));

      // Fewer events reached the window than the server sent — the throttle
      // did its job — but the final `done: true` always got through.
      expect(events.length).toBeLessThan(21);
      const terminal = events.find((e) => e.pullId === pullId && e.done);
      expect(terminal?.status).toBe('success');
    } finally {
      process.env.OLLAMA_HOST = originalBaseUrl;
    }
  });
});
