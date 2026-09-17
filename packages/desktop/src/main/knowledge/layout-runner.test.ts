import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LeanGraph } from '@midnite/studio-knowledge';

import { resolveLayoutWorkerPath, runLayoutInWorker } from './layout-runner';

describe('resolveLayoutWorkerPath', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `layout-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('prefers bundled worker when knowledge-layout-worker.js exists in the provided dir', () => {
    const workerFile = join(testDir, 'knowledge-layout-worker.js');
    writeFileSync(workerFile, '// bundled worker');

    const resolved = resolveLayoutWorkerPath(testDir);
    expect(resolved).toBe(workerFile);
  });

  it('falls back to unbundled layout-worker.js in packages/knowledge when bundled file does not exist', () => {
    const resolved = resolveLayoutWorkerPath(testDir);
    // In our repo/workspace, @midnite/studio-knowledge resolves to packages/knowledge/dist/index.js,
    // so layout-worker.js is found beside it.
    if (existsSync(join(testDir, 'knowledge-layout-worker.js'))) {
      expect(resolved).toBe(join(testDir, 'knowledge-layout-worker.js'));
    } else {
      expect(resolved).toContain('layout-worker.js');
    }
  });
});

/**
 * Every way a worker can end must settle the promise — the renderer's spinner
 * is bound to nothing else. Each case spawns a tiny stand-in worker script
 * (the real one is exercised end-to-end by the packaged app; these are about
 * the runner's handling of the worker's *lifecycle*, not ForceAtlas2).
 */
describe('runLayoutInWorker', () => {
  let testDir: string;
  const lean: LeanGraph = { nodes: [], links: [], builtAtCommit: 'deadbeef' };

  beforeEach(() => {
    testDir = join(tmpdir(), `layout-runner-run-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function workerScript(name: string, body: string): string {
    const path = join(testDir, name);
    writeFileSync(path, body);
    return path;
  }

  it('resolves ok with the positions a well-behaved worker posts', async () => {
    const workerPath = workerScript(
      'ok.js',
      `const { parentPort } = require('node:worker_threads');
       parentPort.postMessage({ type: 'progress', done: 1, total: 2 });
       parentPort.postMessage({ type: 'progress', done: 2, total: 2 });
       parentPort.postMessage({ type: 'done', positions: { a: { x: 1, y: 2 } } });`,
    );
    const progress: Array<[number, number]> = [];
    const result = await runLayoutInWorker(
      lean,
      { totalIterations: 2, batchSize: 1, workerPath },
      (done, total) => progress.push([done, total]),
    );
    expect(result).toEqual({ ok: true, positions: { a: { x: 1, y: 2 } } });
    expect(progress).toEqual([[1, 2], [2, 2]]);
  });

  it('threads layoutId through to the worker as workerData (Phase 89 Theme E)', async () => {
    const workerPath = workerScript(
      'echo-layout.js',
      `const { parentPort, workerData } = require('node:worker_threads');
       parentPort.postMessage({ type: 'done', positions: { layoutId: { x: workerData.layoutId, y: 0 } } });`,
    );
    const result = await runLayoutInWorker(
      lean,
      { layoutId: 'circlepack', totalIterations: 1, batchSize: 1, workerPath },
      () => {},
    );
    expect(result).toEqual({ ok: true, positions: { layoutId: { x: 'circlepack', y: 0 } } });
  });

  it('resolves an error, not a hang, when the worker exits cleanly without ever posting done', async () => {
    const workerPath = workerScript('silent-exit.js', `// does nothing and ends`);
    const result = await runLayoutInWorker(lean, { totalIterations: 1, batchSize: 1, workerPath }, () => {});
    expect(result).toEqual({ ok: false, message: 'Layout worker exited without producing a layout.' });
  });

  it('resolves an error when the worker throws at load', async () => {
    const workerPath = workerScript('throws.js', `throw new Error('boom at load');`);
    const result = await runLayoutInWorker(lean, { totalIterations: 1, batchSize: 1, workerPath }, () => {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('boom at load');
  });

  it('resolves an error when the worker script does not exist', async () => {
    const result = await runLayoutInWorker(
      lean,
      { totalIterations: 1, batchSize: 1, workerPath: join(testDir, 'missing.js') },
      () => {},
    );
    expect(result.ok).toBe(false);
  });

  it('gives up on a worker that stops reporting, and terminates it', async () => {
    const workerPath = workerScript(
      'stalls.js',
      `const { parentPort } = require('node:worker_threads');
       parentPort.postMessage({ type: 'progress', done: 1, total: 4 });
       setInterval(() => {}, 1000); // alive forever, never posts again`,
    );
    const result = await runLayoutInWorker(
      lean,
      { totalIterations: 4, batchSize: 1, workerPath, stallMs: 150 },
      () => {},
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/no progress for \d+s/);
  });

  it('resets the stall clock on every progress message, so a slow-but-alive layout is never cut off', async () => {
    const workerPath = workerScript(
      'slow.js',
      `const { parentPort } = require('node:worker_threads');
       let done = 0;
       const tick = () => {
         done += 1;
         parentPort.postMessage({ type: 'progress', done, total: 4 });
         if (done === 4) parentPort.postMessage({ type: 'done', positions: {} });
         else setTimeout(tick, 120);
       };
       tick();`,
    );
    // Each gap (120ms) is under the budget (200ms); the total (~360ms) is well over it.
    const result = await runLayoutInWorker(
      lean,
      { totalIterations: 4, batchSize: 1, workerPath, stallMs: 200 },
      () => {},
    );
    expect(result).toEqual({ ok: true, positions: {} });
  });
});
