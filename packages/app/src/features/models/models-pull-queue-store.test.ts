import { beforeEach, describe, expect, it } from 'vitest';

import { useModelsPullQueueStore } from './models-pull-queue-store';

beforeEach(() => {
  useModelsPullQueueStore.setState({ pulls: {} });
});

describe('models-pull-queue-store', () => {
  it('queued -> pulling -> success', () => {
    const { queued, progress } = useModelsPullQueueStore.getState();
    queued('p1', 'qwen3.5:14b');
    expect(useModelsPullQueueStore.getState().pulls.p1).toMatchObject({
      status: 'queued',
      done: false,
      failed: false,
    });

    progress({ pullId: 'p1', model: 'qwen3.5:14b', status: 'pulling manifest' });
    expect(useModelsPullQueueStore.getState().pulls.p1).toMatchObject({
      status: 'pulling manifest',
      done: false,
      failed: false,
    });

    progress({
      pullId: 'p1',
      model: 'qwen3.5:14b',
      status: 'downloading sha256:abc',
      total: 1000,
      completed: 500,
    });
    expect(useModelsPullQueueStore.getState().pulls.p1).toMatchObject({
      total: 1000,
      completed: 500,
      done: false,
    });

    progress({ pullId: 'p1', model: 'qwen3.5:14b', status: 'success', done: true });
    const finished = useModelsPullQueueStore.getState().pulls.p1!;
    expect(finished.status).toBe('success');
    expect(finished.done).toBe(true);
    expect(finished.failed).toBe(false);
  });

  it('queued -> pulling -> cancelled marks failed', () => {
    const { queued, progress } = useModelsPullQueueStore.getState();
    queued('p2', 'llama3:8b');
    progress({ pullId: 'p2', model: 'llama3:8b', status: 'pulling manifest' });
    progress({ pullId: 'p2', model: 'llama3:8b', status: 'cancelled', done: true });

    const finished = useModelsPullQueueStore.getState().pulls.p2!;
    expect(finished.done).toBe(true);
    expect(finished.failed).toBe(true);
    expect(finished.status).toBe('cancelled');
  });

  it('queued -> pulling -> failed marks failed with the error status', () => {
    const { queued, progress } = useModelsPullQueueStore.getState();
    queued('p3', 'gpt-oss:120b-cloud');
    progress({
      pullId: 'p3',
      model: 'gpt-oss:120b-cloud',
      status: 'error: connection refused',
      done: true,
    });

    const finished = useModelsPullQueueStore.getState().pulls.p3!;
    expect(finished.done).toBe(true);
    expect(finished.failed).toBe(true);
    expect(finished.status).toBe('error: connection refused');
  });

  it('dismiss removes an entry', () => {
    const { queued, dismiss } = useModelsPullQueueStore.getState();
    queued('p4', 'model-a');
    expect(useModelsPullQueueStore.getState().pulls.p4).toBeDefined();
    dismiss('p4');
    expect(useModelsPullQueueStore.getState().pulls.p4).toBeUndefined();
  });

  it('clearFinished keeps only the in-flight pulls', () => {
    const { queued, progress, clearFinished } = useModelsPullQueueStore.getState();
    queued('p5', 'model-a');
    queued('p6', 'model-b');
    progress({ pullId: 'p5', model: 'model-a', status: 'success', done: true });

    clearFinished();
    const remaining = useModelsPullQueueStore.getState().pulls;
    expect(remaining.p5).toBeUndefined();
    expect(remaining.p6).toBeDefined();
  });

  it('preserves startedAt across progress updates for the same pull', () => {
    const { queued, progress } = useModelsPullQueueStore.getState();
    queued('p7', 'model-a');
    const startedAt = useModelsPullQueueStore.getState().pulls.p7!.startedAt;
    progress({ pullId: 'p7', model: 'model-a', status: 'pulling manifest' });
    expect(useModelsPullQueueStore.getState().pulls.p7!.startedAt).toBe(startedAt);
  });
});
