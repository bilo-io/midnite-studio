// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createSfxBroker, type SfxWorkerHandle } from './sfx-broker';
import type { SfxWorkerIn, SfxWorkerOut } from './worker-protocol';

const take = { prompt: 'zap', negativePrompt: '', seconds: 1, steps: 8, cfgScale: 1, seed: 1 };

/** A real `utilityProcess` exits asynchronously after `kill()`, so the fake does too. */
function fakeWorker(reply: (msg: SfxWorkerIn, post: (m: SfxWorkerOut) => void) => void) {
  const listeners: { message: Array<(m: unknown) => void>; exit: Array<(c: number) => void> } = { message: [], exit: [] };
  const handle: SfxWorkerHandle & { killed: boolean; posted: SfxWorkerIn[] } = {
    killed: false,
    posted: [],
    postMessage: (m) => {
      handle.posted.push(m as SfxWorkerIn);
      reply(m as SfxWorkerIn, (out) => queueMicrotask(() => listeners.message.forEach((l) => l(out))));
    },
    on: ((event: 'message' | 'exit', l: never) => listeners[event].push(l)) as SfxWorkerHandle['on'],
    kill: () => {
      handle.killed = true;
      setTimeout(() => listeners.exit.forEach((l) => l(0)), 0);
    },
  };
  return handle;
}

const okReply = (msg: SfxWorkerIn, post: (m: SfxWorkerOut) => void) => {
  post({ type: 'stage', id: msg.id, stage: 'sampling', fraction: 0.5 });
  post({ type: 'reply', id: msg.id, ok: true, channels: [Float32Array.of(0.1), Float32Array.of(0.2)], sampleRate: 44_100 });
};

describe('SFX broker', () => {
  it('forks lazily, relays stages, resolves the take, and reuses the worker', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const spawn = vi.fn(() => {
      const w = fakeWorker(okReply);
      workers.push(w);
      return w;
    });
    const broker = createSfxBroker({ spawn, idleMs: 60_000 });
    expect(spawn).not.toHaveBeenCalled();
    const stages: string[] = [];
    const result = await broker.run({ assetsDir: '/a', take }, { signal: new AbortController().signal, onStage: (s) => stages.push(s) });
    expect(result.sampleRate).toBe(44_100);
    expect(stages).toEqual(['sampling']);
    await broker.run({ assetsDir: '/a', take }, { signal: new AbortController().signal, onStage: () => undefined });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(workers[0]!.posted[0]).toMatchObject({ type: 'generate', assetsDir: '/a', take });
    broker.dispose();
  });

  it('a cancel kills the worker at once, and the next take forks a fresh one', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const broker = createSfxBroker({
      spawn: () => {
        const w = fakeWorker(workers.length === 0 ? () => undefined : okReply);
        workers.push(w);
        return w;
      },
    });
    const controller = new AbortController();
    const pending = broker.run({ assetsDir: '/a', take }, { signal: controller.signal, onStage: () => undefined });
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(workers[0]!.killed).toBe(true);
    await expect(broker.run({ assetsDir: '/a', take }, { signal: new AbortController().signal, onStage: () => undefined })).resolves.toBeTruthy();
    expect(workers).toHaveLength(2);
    broker.dispose();
  });

  it('turns a crash into a plain error instead of a hang', async () => {
    let worker: ReturnType<typeof fakeWorker> | null = null;
    const broker = createSfxBroker({ spawn: () => (worker = fakeWorker(() => queueMicrotask(() => worker!.kill()))) });
    await expect(broker.run({ assetsDir: '/a', take }, { signal: new AbortController().signal, onStage: () => undefined })).rejects.toThrow(/stopped unexpectedly/);
  });

  it('ends an idle worker after the timeout, never one that is busy', async () => {
    const timers: Array<() => void> = [];
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const broker = createSfxBroker({
      spawn: () => {
        const w = fakeWorker(okReply);
        workers.push(w);
        return w;
      },
      idleMs: 10,
      setTimer: ((fn: () => void) => {
        timers.push(fn);
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout,
      clearTimer: (() => undefined) as typeof clearTimeout,
    });
    await broker.run({ assetsDir: '/a', take }, { signal: new AbortController().signal, onStage: () => undefined });
    expect(broker.running()).toBe(true);
    timers.at(-1)!();
    expect(workers[0]!.killed).toBe(true);
    expect(broker.running()).toBe(false);
  });

  it('a killed worker’s late exit never fails the take queued behind it on the next worker', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const broker = createSfxBroker({
      spawn: () => {
        // The first worker never answers; the second answers only after the first has exited.
        const w = fakeWorker(workers.length === 0 ? () => undefined : (msg, post) => setTimeout(() => okReply(msg, post), 5));
        workers.push(w);
        return w;
      },
    });
    const a = new AbortController();
    const first = broker.run({ assetsDir: '/a', take }, { signal: a.signal, onStage: () => undefined });
    const second = broker.run({ assetsDir: '/a', take }, { signal: new AbortController().signal, onStage: () => undefined });
    await Promise.resolve();
    a.abort();
    await expect(first).rejects.toThrow('cancelled');
    await expect(second).resolves.toMatchObject({ sampleRate: 44_100 });
    expect(workers).toHaveLength(2);
    broker.dispose();
  });

  it('dispose fails every outstanding take and ends the worker', async () => {
    let worker: ReturnType<typeof fakeWorker> | null = null;
    const broker = createSfxBroker({ spawn: () => (worker = fakeWorker(() => undefined)) });
    const run = broker.run({ assetsDir: '/a', take }, { signal: new AbortController().signal, onStage: () => undefined });
    await Promise.resolve();
    broker.dispose();
    await expect(run).rejects.toThrow(/stopped unexpectedly/);
    expect(worker!.killed).toBe(true);
    expect(broker.running()).toBe(false);
  });

  it('ends the worker after it answers an error, so the next take starts on a fresh one', async () => {
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const broker = createSfxBroker({
      spawn: () => {
        const w = fakeWorker(workers.length === 0 ? (msg, post) => post({ type: 'reply', id: msg.id, ok: false, message: 'bad shape' }) : okReply);
        workers.push(w);
        return w;
      },
    });
    await expect(broker.run({ assetsDir: '/a', take }, { signal: new AbortController().signal, onStage: () => undefined })).rejects.toThrow('bad shape');
    expect(workers[0]!.killed).toBe(true);
    await expect(broker.run({ assetsDir: '/a', take }, { signal: new AbortController().signal, onStage: () => undefined })).resolves.toBeTruthy();
    expect(workers).toHaveLength(2);
    broker.dispose();
  });
});
