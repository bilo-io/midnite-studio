import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachAtlasGuard,
  createAtlasGuard,
  repaintAllTerminals,
  type AtlasAddonLike,
} from './xterm-atlas-guard';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function guard(calls: string[], maxPages = 3) {
  return createAtlasGuard({
    clear: () => calls.push('clear'),
    refresh: () => calls.push('refresh'),
    maxPages,
    debounceMs: 100,
  });
}

describe('createAtlasGuard', () => {
  it('stays quiet at or below the page threshold', () => {
    const calls: string[] = [];
    const g = guard(calls);
    g.pageAdded();
    g.pageAdded(); // 3 pages == threshold
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
  });

  it('clears then refreshes, debounced, once past the threshold', () => {
    const calls: string[] = [];
    const g = guard(calls);
    for (let i = 0; i < 5; i++) g.pageAdded();
    vi.advanceTimersByTime(99);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['clear', 'refresh']);
  });

  it('collapses a burst into one repaint and restarts the window on each event', () => {
    const calls: string[] = [];
    const g = guard(calls);
    for (let i = 0; i < 3; i++) g.pageAdded();
    vi.advanceTimersByTime(60);
    g.pageAdded();
    vi.advanceTimersByTime(60);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(40);
    expect(calls).toEqual(['clear', 'refresh']);
  });

  it('repaints when a page is removed (a merge)', () => {
    const calls: string[] = [];
    const g = guard(calls);
    g.pageRemoved();
    vi.advanceTimersByTime(100);
    expect(calls).toEqual(['clear', 'refresh']);
  });

  it('ignores atlas events fired by its own clear and resets its page count', () => {
    const calls: string[] = [];
    const g = createAtlasGuard({
      clear: () => {
        calls.push('clear');
        g.pageRemoved();
        g.pageAdded();
      },
      refresh: () => calls.push('refresh'),
      maxPages: 3,
      debounceMs: 100,
    });
    for (let i = 0; i < 3; i++) g.pageAdded();
    vi.advanceTimersByTime(100);
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(['clear', 'refresh']);
    g.pageAdded();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(['clear', 'refresh']);
  });

  it('repaintNow cancels a pending debounce', () => {
    const calls: string[] = [];
    const g = guard(calls);
    g.schedule();
    g.repaintNow();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual(['clear', 'refresh']);
  });

  it('dispose cancels pending work and silences later events', () => {
    const calls: string[] = [];
    const g = guard(calls);
    g.schedule();
    g.dispose();
    g.pageRemoved();
    g.repaintNow();
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([]);
  });
});

describe('attachAtlasGuard', () => {
  function fakes() {
    const handlers = { add: new Set<() => void>(), remove: new Set<() => void>() };
    const sub = (set: Set<() => void>) => (cb: () => void) => {
      set.add(cb);
      return { dispose: () => void set.delete(cb) };
    };
    const calls: string[] = [];
    const webgl: AtlasAddonLike = {
      onAddTextureAtlasCanvas: sub(handlers.add),
      onRemoveTextureAtlasCanvas: sub(handlers.remove),
      clearTextureAtlas: () => void calls.push('clear'),
    };
    const element = document.createElement('div');
    const term = { rows: 24, refresh: (a: number, b: number) => void calls.push(`refresh ${a}-${b}`), element };
    return { handlers, calls, webgl, term, element };
  }

  it('repaints once after acquire, clear before refresh over the full viewport', () => {
    const f = fakes();
    const detach = attachAtlasGuard(f.webgl, f.term, { debounceMs: 100 });
    vi.advanceTimersByTime(100);
    expect(f.calls).toEqual(['clear', 'refresh 0-23']);
    detach();
  });

  it('repaints on atlas growth, on removal and on webglcontextrestored', () => {
    const f = fakes();
    const detach = attachAtlasGuard(f.webgl, f.term, { maxPages: 2, debounceMs: 100 });
    vi.advanceTimersByTime(100);
    f.calls.length = 0;

    for (let i = 0; i < 2; i++) f.handlers.add.forEach((h) => h());
    vi.advanceTimersByTime(100);
    expect(f.calls).toEqual(['clear', 'refresh 0-23']);

    f.calls.length = 0;
    f.handlers.remove.forEach((h) => h());
    vi.advanceTimersByTime(100);
    expect(f.calls).toEqual(['clear', 'refresh 0-23']);

    f.calls.length = 0;
    f.element.dispatchEvent(new Event('webglcontextrestored'));
    vi.advanceTimersByTime(100);
    expect(f.calls).toEqual(['clear', 'refresh 0-23']);
    detach();
  });

  it('catches a restore dispatched on a descendant canvas (non-bubbling)', () => {
    const f = fakes();
    const canvas = document.createElement('canvas');
    f.element.appendChild(canvas);
    const detach = attachAtlasGuard(f.webgl, f.term, { debounceMs: 100 });
    vi.advanceTimersByTime(100);
    f.calls.length = 0;
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    vi.advanceTimersByTime(100);
    expect(f.calls).toEqual(['clear', 'refresh 0-23']);
    detach();
  });

  it('detach unsubscribes, cancels pending work and leaves the repaint-all registry', () => {
    const f = fakes();
    const detach = attachAtlasGuard(f.webgl, f.term, { debounceMs: 100 });
    detach();
    expect(f.handlers.add.size + f.handlers.remove.size).toBe(0);
    vi.advanceTimersByTime(1000);
    repaintAllTerminals();
    expect(f.calls).toEqual([]);
  });

  it('repaintAllTerminals repaints every attached terminal immediately', () => {
    const a = fakes();
    const b = fakes();
    const da = attachAtlasGuard(a.webgl, a.term);
    const db = attachAtlasGuard(b.webgl, b.term);
    repaintAllTerminals();
    expect(a.calls).toEqual(['clear', 'refresh 0-23']);
    expect(b.calls).toEqual(['clear', 'refresh 0-23']);
    da();
    db();
  });
});
