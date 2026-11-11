import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScienceCell } from '@midnite/studio-shared';

import { createUseCompute, STOPPED_MESSAGE, type ComputeWorkerLike } from './use-compute';

class FakeWorker implements ComputeWorkerLike {
  static all: FakeWorker[] = [];
  posts: { runId: number; cells: ScienceCell[] }[] = [];
  terminated = false;
  onmessage: ComputeWorkerLike['onmessage'] = null;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(m: { runId: number; cells: ScienceCell[] }) {
    this.posts.push(m);
  }
  terminate() {
    this.terminated = true;
  }
}

const cell = (source: string): ScienceCell => ({ kind: 'compute', id: 'c-aaaaaaaa', source });
const useCompute = createUseCompute(() => new FakeWorker());

beforeEach(() => {
  FakeWorker.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('useCompute', () => {
  it('posts one run for two quick edits', () => {
    const { rerender } = renderHook(({ cells }) => useCompute(cells), { initialProps: { cells: [cell('1')] } });
    act(() => void vi.advanceTimersByTime(100));
    rerender({ cells: [cell('12')] });
    act(() => void vi.advanceTimersByTime(300));
    expect(FakeWorker.all).toHaveLength(1);
    expect(FakeWorker.all[0]!.posts).toHaveLength(1);
    expect(FakeWorker.all[0]!.posts[0]!.cells).toEqual([cell('12')]);
  });

  it('ignores an answer with a stale runId and takes the current one', () => {
    const { result, rerender } = renderHook(({ cells }) => useCompute(cells), { initialProps: { cells: [cell('1')] } });
    act(() => void vi.advanceTimersByTime(300));
    rerender({ cells: [cell('2')] });
    act(() => void vi.advanceTimersByTime(300));
    const w = FakeWorker.all[0]!;
    act(() => w.onmessage?.({ data: { runId: 1, results: { 'c-aaaaaaaa': { ok: true, text: 'stale' } } } }));
    expect(result.current.results).toEqual({});
    act(() => w.onmessage?.({ data: { runId: 2, results: { 'c-aaaaaaaa': { ok: true, text: 'fresh' } } } }));
    expect(result.current.results['c-aaaaaaaa']).toEqual({ ok: true, text: 'fresh' });
  });

  it('terminates a worker that does not answer in 2 s and builds another', () => {
    const { result } = renderHook(() => useCompute([cell('1')]));
    act(() => void vi.advanceTimersByTime(300));
    const first = FakeWorker.all[0]!;
    act(() => void vi.advanceTimersByTime(2000));
    expect(first.terminated).toBe(true);
    expect(FakeWorker.all).toHaveLength(2);
    expect(result.current.results['c-aaaaaaaa']).toMatchObject({ ok: false, message: STOPPED_MESSAGE });
  });

  it('does not post a run for an edit to a text cell', () => {
    const md = (source: string): ScienceCell => ({ kind: 'markdown', id: 'c-bbbbbbbb', source });
    const { rerender } = renderHook(({ cells }) => useCompute(cells), { initialProps: { cells: [cell('1'), md('a')] } });
    act(() => void vi.advanceTimersByTime(300));
    rerender({ cells: [cell('1'), md('ab')] });
    act(() => void vi.advanceTimersByTime(300));
    expect(FakeWorker.all[0]!.posts).toHaveLength(1);
  });
});
