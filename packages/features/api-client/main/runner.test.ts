// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ApiRunEvent, PostmanCollection, PostmanEnvironment } from '@midnite/studio-shared';

import { runCollection } from './runner';
import { runScript } from './script-runner';
import { __resetApiClientForTests, configureApiClient, type ScriptRunner } from './services';

/**
 * Phase 70 Theme C — the collection runner.
 *
 * Two services are injected through `configureApiClient` (Phase 113 Theme O — they were module
 * mocks while the runner lived in the desktop), both load-bearing:
 *
 * - `workdir` resolves to a real temp directory — this suite writes real collection/environment
 *   JSON under it and reads the persisted mutation back off disk at the end of the environment test.
 * - `scriptRunner` calls the *real* `runScript` (`./script-runner`) directly, in-process: the
 *   out-of-process broker needs a forked process, which a unit test does not have. This keeps the
 *   *sandbox logic* real (the same function `script-runner.test.ts` exercises directly) while only
 *   the process transport is faked. The broker's own kill behaviour is `script-runner-broker.test.ts`.
 *
 * Every HTTP request is real, per Decision 8 (`send.test.ts`'s own header) —
 * a throwaway `node:http` server, never a mocked `fetch`.
 */

const inProcessRunner: ScriptRunner = {
  run: (source, context, timeoutMs) => Promise.resolve(runScript(source, context, timeoutMs)),
  dispose: () => undefined,
};

let repoRoot: string;
let server: Server;
let baseUrl: string;
let hits: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    hits.push(url.pathname);
    if (url.pathname === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }, 400);
      return;
    }
    if (url.pathname === '/echo') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ query: url.search }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: url.pathname }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(async () => {
  hits = [];
  repoRoot = await mkdtemp(join(tmpdir(), 'mstudio-runner-'));
  configureApiClient({ workdir: async () => repoRoot, scriptRunner: inProcessRunner });
});

afterEach(async () => {
  __resetApiClientForTests();
  await rm(repoRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

async function writeCollection(id: string, collection: PostmanCollection): Promise<void> {
  const dir = join(repoRoot, '.midnite', 'api', 'collections');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, id), `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
}

async function writeEnvironment(id: string, environment: PostmanEnvironment): Promise<void> {
  const dir = join(repoRoot, '.midnite', 'api', 'environments');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, id), `${JSON.stringify(environment, null, 2)}\n`, 'utf8');
}

describe('runCollection', () => {
  it('walks a nested folder fixture in exact file order', async () => {
    const collectionId = 'order.postman_collection.json';
    await writeCollection(collectionId, {
      info: { name: 'Order' },
      item: [
        { name: 'A', request: { method: 'GET', url: `${baseUrl}/a` } },
        {
          name: 'Folder1',
          item: [
            { name: 'B', request: { method: 'GET', url: `${baseUrl}/b` } },
            { name: 'C', request: { method: 'GET', url: `${baseUrl}/c` } },
          ],
        },
        { name: 'D', request: { method: 'GET', url: `${baseUrl}/d` } },
      ],
    });

    const events: ApiRunEvent[] = [];
    const summary = await runCollection(
      {
        runId: 'run-order',
        repoId: 'repo',
        collectionId,
        environmentId: null,
        target: { kind: 'collection' },
        runAnyway: false,
      },
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(events.map((e) => e.item.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(events.map((e) => e.item.itemPath)).toEqual([
      ['A'],
      ['Folder1', 'B'],
      ['Folder1', 'C'],
      ['D'],
    ]);
    expect(summary).toEqual({
      runId: 'run-order',
      total: 4,
      completed: 4,
      skipped: 0,
      passed: 4,
      failed: 0,
      durationMs: expect.any(Number),
      aborted: false,
    });
  });

  it('leaves the remainder skipped, and still emits a summary, on a mid-run abort', async () => {
    const collectionId = 'abort.postman_collection.json';
    await writeCollection(collectionId, {
      info: { name: 'Abort' },
      item: [
        { name: 'One', request: { method: 'GET', url: `${baseUrl}/a` } },
        { name: 'Two', request: { method: 'GET', url: `${baseUrl}/slow` } },
        { name: 'Three', request: { method: 'GET', url: `${baseUrl}/c` } },
        { name: 'Four', request: { method: 'GET', url: `${baseUrl}/d` } },
      ],
    });

    const controller = new AbortController();
    const events: ApiRunEvent[] = [];
    const runPromise = runCollection(
      {
        runId: 'run-abort',
        repoId: 'repo',
        collectionId,
        environmentId: null,
        target: { kind: 'collection' },
        runAnyway: false,
      },
      (event) => events.push(event),
      controller.signal,
    );

    // "One" (a fast route) has settled and "Two" ("/slow", a 400ms delay) is
    // in flight by the time this fires — Stop aborts that in-flight request
    // and stops before "Three" is dequeued.
    await new Promise((resolve) => setTimeout(resolve, 60));
    controller.abort();

    const summary = await runPromise;

    expect(summary.aborted).toBe(true);
    expect(summary.total).toBe(4);
    expect(summary.completed).toBe(2);
    expect(summary.skipped).toBe(2);

    const byName = Object.fromEntries(events.map((e) => [e.item.name, e.item]));
    expect(byName.One?.status).toBe('passed');
    expect(byName.Two?.status).toBe('error');
    expect(byName.Three?.status).toBe('skipped');
    expect(byName.Four?.status).toBe('skipped');
  });

  it('keeps walking after a transport failure, running the remaining requests', async () => {
    // A port nothing listens on any more — bind then immediately close, so
    // the failure is a real, deterministic connection refusal rather than a
    // guess about which ports are unassigned on this machine.
    const deadServer = createServer();
    await new Promise<void>((resolve) => deadServer.listen(0, '127.0.0.1', () => resolve()));
    const deadAddress = deadServer.address();
    const deadPort = deadAddress && typeof deadAddress === 'object' ? deadAddress.port : 0;
    await new Promise<void>((resolve) => deadServer.close(() => resolve()));

    const collectionId = 'fail.postman_collection.json';
    await writeCollection(collectionId, {
      info: { name: 'Fail' },
      item: [
        { name: 'One', request: { method: 'GET', url: `${baseUrl}/a` } },
        { name: 'Two', request: { method: 'GET', url: `http://127.0.0.1:${deadPort}/unreachable` } },
        { name: 'Three', request: { method: 'GET', url: `${baseUrl}/c` } },
        { name: 'Four', request: { method: 'GET', url: `${baseUrl}/d` } },
      ],
    });

    const events: ApiRunEvent[] = [];
    const summary = await runCollection(
      {
        runId: 'run-fail',
        repoId: 'repo',
        collectionId,
        environmentId: null,
        target: { kind: 'collection' },
        runAnyway: false,
      },
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(summary.total).toBe(4);
    expect(summary.completed).toBe(4);
    expect(summary.skipped).toBe(0);
    expect(summary.aborted).toBe(false);

    const byName = Object.fromEntries(events.map((e) => [e.item.name, e.item]));
    expect(byName.One?.status).toBe('passed');
    expect(byName.Two?.status).toBe('error');
    expect(byName.Two?.response).toBeNull();
    expect(byName.Three?.status).toBe('passed');
    expect(byName.Four?.status).toBe('passed');
  });

  it('threads pm.environment.set forward to the next request in the same run', async () => {
    const collectionId = 'env.postman_collection.json';
    const environmentId = 'env.postman_environment.json';

    await writeEnvironment(environmentId, {
      id: 'env-1',
      name: 'Env',
      values: [{ key: 'token', value: '', type: 'default', enabled: true }],
    });

    await writeCollection(collectionId, {
      info: { name: 'Env' },
      item: [
        {
          name: 'SetToken',
          request: { method: 'GET', url: `${baseUrl}/a` },
          event: [
            {
              listen: 'test',
              script: { exec: ["pm.environment.set('token', 'abc123');"] },
            },
          ],
        },
        { name: 'UseToken', request: { method: 'GET', url: `${baseUrl}/echo?token={{token}}` } },
      ],
    });

    const events: ApiRunEvent[] = [];
    const summary = await runCollection(
      {
        runId: 'run-env',
        repoId: 'repo',
        collectionId,
        environmentId,
        target: { kind: 'collection' },
        runAnyway: false,
      },
      (event) => events.push(event),
      new AbortController().signal,
    );

    expect(summary.passed).toBe(2);

    const useToken = events.find((e) => e.item.name === 'UseToken');
    expect(useToken?.item.response?.body).toContain('abc123');

    // Committed to disk, not left in memory only — the same file
    // `sendApiRequest`'s own `readEnvironment` call reads fresh for every
    // request, which is *how* the next request in the walk saw it.
    const saved = JSON.parse(
      await readFile(join(repoRoot, '.midnite', 'api', 'environments', environmentId), 'utf8'),
    ) as PostmanEnvironment;
    expect(saved.values.find((row) => row.key === 'token')?.value).toBe('abc123');
  });
});
