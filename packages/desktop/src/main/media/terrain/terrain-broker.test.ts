import { TERRAIN_BUILD_CANCELLED, TERRAIN_WORKER_CRASHED, TERRAIN_SPEC_DEFAULTS, type TerrainBuildStage, type TerrainStats } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { createTerrainBroker, type TerrainWorkerHandle } from './terrain-broker';
import type { TerrainWorkerIn, TerrainWorkerOut } from './worker-protocol';

class FakeWorker implements TerrainWorkerHandle {
  posted: TerrainWorkerIn[] = [];
  kill = vi.fn(() => this.exit());
  private messageListeners: Array<(m: unknown) => void> = [];
  private exitListeners: Array<(code: number) => void> = [];
  postMessage = (message: unknown) => {
    this.posted.push(message as TerrainWorkerIn);
  };
  on(event: 'message' | 'exit', listener: ((m: unknown) => void) | ((code: number) => void)): void {
    if (event === 'message') this.messageListeners.push(listener as (m: unknown) => void);
    else this.exitListeners.push(listener as (code: number) => void);
  }
  emit(message: TerrainWorkerOut) {
    for (const l of this.messageListeners) l(message);
  }
  exit() {
    for (const l of this.exitListeners) l(1);
  }
}

const stats: TerrainStats = {
  resolution: 129,
  worldSize: 1024,
  vertexCount: 16641,
  triangleCount: 32768,
  chunkCount: 4,
  lodCount: 4,
  buildMs: 5,
  minHeight: 0,
  maxHeight: 10,
  histogram: new Array<number>(16).fill(0),
  warnings: [],
};

const request = (key: string, buildId?: string) => ({
  key,
  dir: `/t/${key}`,
  outDir: 'build.tmp-x',
  spec: TERRAIN_SPEC_DEFAULTS,
  stages: ['decode', 'heightfield', 'write'] as TerrainBuildStage[],
  ...(buildId ? { buildId } : {}),
});

function setup() {
  const workers: FakeWorker[] = [];
  const broker = createTerrainBroker({
    spawn: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { broker, workers };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createTerrainBroker', () => {
  it('forwards progress and resolves with the stats', async () => {
    const { broker, workers } = setup();
    const progress: Array<[string, number]> = [];
    const run = broker.build(request('a'), (stage, fraction) => progress.push([stage, fraction]));
    await tick();
    const worker = workers[0]!;
    expect(worker.posted).toHaveLength(1);
    worker.emit({ type: 'progress', id: run.buildId, stage: 'decode', fraction: 0.5 });
    worker.emit({ type: 'reply', id: run.buildId, ok: true, stats });
    expect(await run.done).toEqual({ ok: true, stats });
    expect(progress).toEqual([['decode', 0.5]]);
  });

  it('surfaces a worker failure message', async () => {
    const { broker, workers } = setup();
    const run = broker.build(request('a'));
    await tick();
    workers[0]!.emit({ type: 'reply', id: run.buildId, ok: false, message: 'bad heightmap' });
    expect(await run.done).toEqual({ ok: false, message: 'bad heightmap' });
  });

  it('cancels the running build when a second one for the same terrain starts (latest wins)', async () => {
    const { broker, workers } = setup();
    const first = broker.build(request('a'));
    await tick();
    const second = broker.build(request('a'));
    expect(await first.done).toMatchObject({ ok: false, message: TERRAIN_BUILD_CANCELLED, cancelled: true });
    expect(workers[0]!.kill).toHaveBeenCalledTimes(1);
    await tick();
    // The next build forks a fresh worker.
    expect(workers).toHaveLength(2);
    workers[1]!.emit({ type: 'reply', id: second.buildId, ok: true, stats });
    expect(await second.done).toEqual({ ok: true, stats });
  });

  it('queues builds of different terrains on one lane, one child', async () => {
    const { broker, workers } = setup();
    const a = broker.build(request('a'));
    const b = broker.build(request('b'));
    await tick();
    expect(workers[0]!.posted).toHaveLength(1);
    workers[0]!.emit({ type: 'reply', id: a.buildId, ok: true, stats });
    await a.done;
    await tick();
    expect(workers).toHaveLength(1);
    expect(workers[0]!.posted).toHaveLength(2);
    workers[0]!.emit({ type: 'reply', id: b.buildId, ok: true, stats });
    expect((await b.done).ok).toBe(true);
  });

  it('cancelling a queued build does not kill the child running another', async () => {
    const { broker, workers } = setup();
    const a = broker.build(request('a'));
    const b = broker.build(request('b'));
    await tick();
    b.cancel();
    expect(await b.done).toMatchObject({ cancelled: true });
    expect(workers[0]!.kill).not.toHaveBeenCalled();
    workers[0]!.emit({ type: 'reply', id: a.buildId, ok: true, stats });
    expect((await a.done).ok).toBe(true);
    await tick();
    expect(workers[0]!.posted).toHaveLength(1);
  });

  it('settles every pending build with the crash message when the child exits', async () => {
    const { broker, workers } = setup();
    const a = broker.build(request('a'));
    await tick();
    workers[0]!.exit();
    expect(await a.done).toEqual({ ok: false, message: TERRAIN_WORKER_CRASHED });
  });

  it('cancel by id kills the running child and resolves Build cancelled.', async () => {
    const { broker, workers } = setup();
    const run = broker.build(request('a', 'my-build'));
    await tick();
    expect(broker.cancel('my-build')).toBe(true);
    expect(workers[0]!.kill).toHaveBeenCalled();
    expect(await run.done).toMatchObject({ ok: false, message: 'Build cancelled.' });
    expect(broker.cancel('my-build')).toBe(false);
  });

  it('a late exit from a killed child does not fail the build that replaced it', async () => {
    const { broker, workers } = setup();
    const first = broker.build(request('a'));
    await tick();
    first.cancel();
    const second = broker.build(request('b'));
    await tick();
    expect(workers).toHaveLength(2);
    workers[0]!.exit(); // the old child's exit event arrives after the new build started
    workers[1]!.emit({ type: 'reply', id: second.buildId, ok: true, stats });
    expect((await second.done).ok).toBe(true);
  });
});
