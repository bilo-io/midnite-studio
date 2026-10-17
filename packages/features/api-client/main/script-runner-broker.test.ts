// @vitest-environment node
import type { ScriptContext, ScriptRun } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createScriptRunnerBroker, scriptRunnerWorkerPath, type ScriptWorkerHandle } from './script-runner-broker';

/**
 * The script runner's lifecycle, against a fake worker handle — no process is forked. What the user
 * script does inside the sandbox is `script-runner.test.ts`; what this file holds is the part that
 * keeps user code from outliving its welcome: the child is killed on a cancelled run, on a timeout
 * and on quit, and a replacement is forked for the run after.
 */

const context: ScriptContext = {
  environment: {},
  collectionVariables: {},
  request: { method: 'GET', url: 'http://x', headers: {} },
  response: null,
};

const okRun: ScriptRun = { results: [], logs: [], mutations: { environment: {}, collectionVariables: {} }, error: null };

class FakeWorker implements ScriptWorkerHandle {
  posted: { runId: string; source: string; timeoutMs: number }[] = [];
  killed = false;
  private messageListener: ((message: unknown) => void) | null = null;
  private exitListener: ((code: number) => void) | null = null;

  postMessage = (message: unknown): void => {
    this.posted.push(message as { runId: string; source: string; timeoutMs: number });
  };

  on(event: 'message' | 'exit', listener: ((message: unknown) => void) | ((code: number) => void)): void {
    if (event === 'message') this.messageListener = listener as (message: unknown) => void;
    else this.exitListener = listener as (code: number) => void;
  }

  kill = (): void => {
    this.killed = true;
    // A real process's `exit` arrives after the kill, never during it.
    queueMicrotask(() => this.exitListener?.(1));
  };

  reply(index: number, run: ScriptRun = okRun): void {
    this.messageListener?.({ runId: this.posted[index]?.runId, run });
  }
}

function harness() {
  const workers: FakeWorker[] = [];
  const broker = createScriptRunnerBroker({
    spawn: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { broker, workers };
}

afterEach(() => vi.useRealTimers());

describe('script runner broker', () => {
  it('forks lazily and hands back the run the child answers', async () => {
    const { broker, workers } = harness();
    expect(workers).toHaveLength(0);

    const pending = broker.run('pm.test("a", () => {})', context, 1000);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.posted[0]?.source).toBe('pm.test("a", () => {})');
    workers[0]?.reply(0);

    await expect(pending).resolves.toEqual(okRun);
    expect(workers[0]?.killed).toBe(false);
  });

  it('reuses the child across runs', async () => {
    const { broker, workers } = harness();
    const first = broker.run('1', context, 1000);
    workers[0]?.reply(0);
    await first;
    const second = broker.run('2', context, 1000);
    workers[0]?.reply(1);
    await second;
    expect(workers).toHaveLength(1);
  });

  it('kills the child when the run is cancelled, and forks a fresh one for the next', async () => {
    const { broker, workers } = harness();
    const controller = new AbortController();
    const pending = broker.run('while (true) {}', context, 60_000, controller.signal);

    controller.abort();

    const run = await pending;
    expect(run.error).toBe('Script cancelled.');
    expect(workers[0]?.killed).toBe(true);

    const next = broker.run('1', context, 1000);
    expect(workers).toHaveLength(2);
    workers[1]?.reply(0);
    await next;
  });

  it('refuses to start a run whose signal is already aborted, and forks nothing', async () => {
    const { broker, workers } = harness();
    const controller = new AbortController();
    controller.abort();

    const run = await broker.run('1', context, 1000, controller.signal);

    expect(run.error).toBe('Script cancelled.');
    expect(workers).toHaveLength(0);
  });

  it('kills a wedged child at the parent-side deadline, past the sandbox’s own timeout', async () => {
    vi.useFakeTimers();
    const { broker, workers } = harness();
    const pending = broker.run('1', context, 100);

    await vi.advanceTimersByTimeAsync(100 + 750);

    expect((await pending).error).toBe('Script timed out after 100 ms.');
    expect(workers[0]?.killed).toBe(true);
  });

  it('ignores a late reply from a child already killed for timing out', async () => {
    vi.useFakeTimers();
    const { broker, workers } = harness();
    const pending = broker.run('1', context, 10);
    await vi.advanceTimersByTimeAsync(10 + 750);
    await pending;

    expect(() => workers[0]?.reply(0)).not.toThrow();
  });

  it('kills the child on dispose — quit — and settles whatever was waiting on it', async () => {
    const { broker, workers } = harness();
    const pending = broker.run('while (true) {}', context, 60_000);

    broker.dispose();

    expect((await pending).error).toMatch(/stopped/);
    expect(workers[0]?.killed).toBe(true);
  });

  it('dispose with no child alive does nothing', () => {
    const { broker, workers } = harness();
    expect(() => broker.dispose()).not.toThrow();
    expect(workers).toHaveLength(0);
  });

  it('finds the worker bundle beside the composer’s own, unpacked from the asar', () => {
    expect(scriptRunnerWorkerPath('/Apps/X.app/Contents/Resources/app.asar/dist/bundle')).toBe(
      '/Apps/X.app/Contents/Resources/app.asar.unpacked/dist/bundle/script-runner-worker.js',
    );
  });
});
