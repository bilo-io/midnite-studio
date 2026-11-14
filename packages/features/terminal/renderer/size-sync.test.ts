import { describe, expect, it } from 'vitest';

import { createSizeSync, type SyncReason } from './size-sync';

const setup = (over: { measurable?: boolean; sendOk?: boolean; fitThrows?: boolean; owner?: boolean } = {}) => {
  const calls: string[] = [];
  const state = { size: { cols: 100, rows: 30 }, measurable: over.measurable ?? true, sendOk: over.sendOk ?? true, fitThrows: over.fitThrows ?? false };
  const s = createSizeSync({
    isMeasurable: () => state.measurable,
    isOwner: () => over.owner ?? true,
    fit: () => {
      calls.push('fit');
      if (state.fitThrows) throw new Error('boom');
      return state.size;
    },
    send: (c, r) => {
      calls.push(`send:${c}x${r}`);
      return state.sendOk;
    },
    repaint: () => calls.push('repaint'),
    clearAtlas: () => calls.push('clear'),
  });
  return { s, calls, state };
};

describe('createSizeSync', () => {
  it('does nothing while suspended, even for forced reasons', () => {
    const { s, calls } = setup();
    s.suspend();
    for (const r of ['bind', 'active', 'visible', 'renderer', 'observe', 'dpr'] as SyncReason[]) s.sync(r);
    expect(calls).toEqual([]);
    expect(s.last()).toBeNull();
  });

  it('after suspend, resume sends exactly once with the current size and repaints', () => {
    const { s, calls, state } = setup();
    s.suspend();
    s.sync('observe');
    s.sync('bind');
    s.sync('active');
    state.size = { cols: 90, rows: 20 };
    s.resume();
    expect(calls).toEqual(['fit', 'send:90x20', 'repaint']);
    expect(s.last()).toEqual({ cols: 90, rows: 20 });
  });

  it('resume without a prior suspend sends nothing, and two resumes send once', () => {
    const a = setup();
    a.s.resume();
    expect(a.calls).toEqual([]);
    const b = setup();
    b.s.suspend();
    b.s.resume();
    b.s.resume();
    expect(b.calls.filter((c) => c.startsWith('send'))).toHaveLength(1);
  });

  it('does nothing and records nothing when not measurable', () => {
    const { s, calls } = setup({ measurable: false });
    s.sync('bind');
    expect(calls).toEqual([]);
    expect(s.last()).toBeNull();
  });

  it('dedupes an unchanged size on observe, without repainting', () => {
    const { s, calls } = setup();
    s.sync('observe');
    calls.length = 0;
    s.sync('observe');
    expect(calls).toEqual(['fit']);
  });

  it('active pane: active, visible and renderer send at an unchanged size', () => {
    const { s, calls } = setup({ owner: true });
    s.sync('observe');
    calls.length = 0;
    s.sync('active');
    s.sync('visible');
    s.sync('renderer');
    expect(calls.filter((c) => c.startsWith('send'))).toHaveLength(3);
  });

  it('inactive pane: visible and renderer send nothing at an unchanged size, but fit and repaint', () => {
    const { s, calls } = setup({ owner: false });
    s.sync('observe');
    calls.length = 0;
    s.sync('visible');
    s.sync('renderer');
    expect(calls.filter((c) => c.startsWith('send'))).toHaveLength(0);
    expect(calls.filter((c) => c === 'repaint')).toHaveLength(2);
  });

  it('inactive pane still sends on a genuine size change', () => {
    const { s, calls, state } = setup({ owner: false });
    s.sync('observe');
    state.size = { cols: 50, rows: 10 };
    calls.length = 0;
    s.sync('visible');
    expect(calls).toContain('send:50x10');
  });

  it('applies a missed atlas clear on the next real fit (suspended or unmeasurable)', () => {
    const { s, calls, state } = setup();
    s.suspend();
    s.sync('dpr');
    expect(calls).toEqual([]);
    s.resume();
    expect(calls.slice(0, 2)).toEqual(['clear', 'fit']);
    state.measurable = false;
    calls.length = 0;
    s.sync('font');
    expect(calls).toEqual([]);
    state.measurable = true;
    s.sync('observe');
    expect(calls.slice(0, 2)).toEqual(['clear', 'fit']);
  });

  it('records last only when send returns true, so a later bind sends', () => {
    const { s, calls, state } = setup({ sendOk: false });
    s.sync('mount');
    expect(s.last()).toBeNull();
    state.sendOk = true;
    calls.length = 0;
    s.sync('bind');
    expect(calls).toContain('send:100x30');
    expect(s.last()).toEqual({ cols: 100, rows: 30 });
  });

  it('a non-forced sync after a dropped send retries instead of deduping', () => {
    const { s, calls, state } = setup({ sendOk: false });
    s.sync('mount');
    state.sendOk = true;
    calls.length = 0;
    s.sync('fitSignal');
    expect(calls).toContain('send:100x30');
  });

  it('invalidate clears last', () => {
    const { s } = setup();
    s.sync('observe');
    s.invalidate();
    expect(s.last()).toBeNull();
  });

  it('clears the atlas before fit for dpr, font, fontsLoaded and renderer', () => {
    for (const r of ['dpr', 'font', 'fontsLoaded', 'renderer'] as SyncReason[]) {
      const { s, calls } = setup();
      s.sync(r);
      expect(calls.indexOf('clear'), r).toBe(0);
      expect(calls.indexOf('fit'), r).toBe(1);
    }
  });

  it('repaints after every reason except observe', () => {
    const reasons: SyncReason[] = ['mount', 'bind', 'active', 'visible', 'fitSignal', 'dpr', 'font', 'fontsLoaded', 'renderer'];
    for (const r of reasons) {
      const { s, calls } = setup();
      s.sync(r);
      expect(calls, r).toContain('repaint');
    }
    const { s, calls } = setup();
    s.sync('observe');
    expect(calls).not.toContain('repaint');
  });

  it('swallows a throwing fit: nothing sent, nothing recorded', () => {
    const { s, calls } = setup({ fitThrows: true });
    s.sync('bind');
    expect(calls).toEqual(['fit']);
    expect(s.last()).toBeNull();
  });
});
