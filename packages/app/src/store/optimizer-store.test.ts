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

    expect(localStorage.length).toBe(0);
  });
});
