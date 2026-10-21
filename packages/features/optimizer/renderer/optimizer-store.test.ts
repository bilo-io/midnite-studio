import { beforeEach, describe, expect, it } from 'vitest';

import { useOptimizerStore } from './optimizer-store';

const emptyResult = { totalBytes: 0, byCategory: {}, items: [], truncated: false } as never;

describe('useOptimizerStore', () => {
  beforeEach(() => {
    useOptimizerStore.setState({
      tab: 'smartScan',
      scan: { state: 'idle', progress: 0, result: null, message: null },
      processes: [],
      gpu: null,
    });
    localStorage.clear();
  });

  it('switches tabs', () => {
    useOptimizerStore.getState().setTab('storage');
    expect(useOptimizerStore.getState().tab).toBe('storage');
  });

  it('walks scan.state through idle -> scanning -> done', () => {
    expect(useOptimizerStore.getState().scan.state).toBe('idle');

    useOptimizerStore.getState().startScan();
    expect(useOptimizerStore.getState().scan.state).toBe('scanning');

    useOptimizerStore.getState().scanDone(emptyResult);
    expect(useOptimizerStore.getState().scan.state).toBe('done');
    expect(useOptimizerStore.getState().scan.progress).toBe(100);
    expect(useOptimizerStore.getState().scan.result).toBe(emptyResult);
  });

  it('walks scan.state through scanning -> error', () => {
    useOptimizerStore.getState().startScan();
    useOptimizerStore.getState().scanError('permission denied');

    expect(useOptimizerStore.getState().scan.state).toBe('error');
    expect(useOptimizerStore.getState().scan.message).toBe('permission denied');
  });

  it('progress is a percentage of done/total, not the raw counts', () => {
    useOptimizerStore.getState().startScan();
    useOptimizerStore.getState().scanProgress(50, 200);
    expect(useOptimizerStore.getState().scan.progress).toBe(25);
  });

  it('the store never touches localStorage — it is deliberately not persisted', () => {
    useOptimizerStore.getState().startScan();
    useOptimizerStore.getState().scanProgress(1, 2);
    useOptimizerStore.getState().scanDone(emptyResult);
    useOptimizerStore.getState().setTab('memory');
    useOptimizerStore.getState().setGpu({ model: 'x', vramBytes: 1, loadPercent: 2 });
    useOptimizerStore.getState().removeScanItem('/repo/node_modules');

    expect(localStorage.length).toBe(0);
  });

  it('removeScanItem drops exactly the removed path and leaves byCategory/byEcosystem untouched (Phase 72 Theme F)', () => {
    const result = {
      totalBytes: 300,
      byCategory: { dependencies: 200, buildOutput: 100 },
      byEcosystem: { node: 300 },
      detectors: {},
      items: [
        {
          path: '/repo/node_modules',
          bytes: 200,
          category: 'dependencies',
          repoId: 'repo-1',
          detectorId: 'node-modules',
          ecosystem: 'node',
          reclaim: 'costly',
        },
        {
          path: '/repo/dist',
          bytes: 100,
          category: 'buildOutput',
          repoId: 'repo-1',
          detectorId: 'node-dist',
          ecosystem: 'node',
          reclaim: 'cheap',
        },
      ],
      truncated: false,
      truncatedRoots: [],
    } as never;

    useOptimizerStore.getState().scanDone(result);
    useOptimizerStore.getState().removeScanItem('/repo/node_modules');

    const after = useOptimizerStore.getState().scan.result;
    expect(after?.items.map((item) => item.path)).toEqual(['/repo/dist']);
    // The aggregate totals are deliberately NOT recomputed here — they still
    // reflect the scan that ran, not the list after a clean.
    expect(after?.byCategory).toEqual({ dependencies: 200, buildOutput: 100 });
    expect(after?.byEcosystem).toEqual({ node: 300 });
  });
});
