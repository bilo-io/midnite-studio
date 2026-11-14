import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachAtlasGuard,
  clearAllAtlases,
  repaintAllTerminals,
  scheduleClearAllAtlases,
  type AtlasAddonLike,
} from './xterm-atlas-guard';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/**
 * Terminals sharing one atlas, as xterm's CharAtlasCache hands out. Every
 * renderer forwards the shared atlas's page events (WebglRenderer.ts), so a
 * page added or removed on the shared atlas reaches every terminal's listener
 * with the same canvas.
 */
function world() {
  const log: string[] = [];
  const detach: Array<() => void> = [];
  const allAdd = new Set<(canvas: object) => void>();
  const allRemove = new Set<(canvas: object) => void>();
  function terminal(name: string, opts: { maxPages?: number } = {}) {
    const add = new Set<(canvas: object) => void>();
    const remove = new Set<(canvas: object) => void>();
    const sub =
      (own: Set<(canvas: object) => void>, all: Set<(canvas: object) => void>) =>
      (cb: (canvas: object) => void) => {
        own.add(cb);
        all.add(cb);
        return {
          dispose: () => {
            own.delete(cb);
            all.delete(cb);
          },
        };
      };
    // Faithful to WebglAddon 0.19: clearing wipes the shared pages and resets
    // this terminal's own model. It fires no add/remove atlas event.
    const webgl: AtlasAddonLike = {
      onAddTextureAtlasCanvas: sub(add, allAdd),
      onRemoveTextureAtlasCanvas: sub(remove, allRemove),
      clearTextureAtlas: () => void log.push(`clear ${name}`),
    };
    const element = document.createElement('div');
    const term = {
      rows: 24,
      element,
      refresh: (a: number, b: number) => void log.push(`refresh ${name} ${a}-${b}`),
    };
    detach.push(attachAtlasGuard(webgl, term, { debounceMs: 100, ...opts }));
    return {
      addPage: () => {
        const canvas = {};
        allAdd.forEach((h) => h(canvas));
      },
      removePage: () => {
        const canvas = {};
        allRemove.forEach((h) => h(canvas));
      },
      element,
      subs: () => add.size + remove.size,
    };
  }
  return { log, terminal, cleanup: () => detach.forEach((d) => d()) };
}

describe('shared atlas fan-out', () => {
  it('clearAllAtlases clears every terminal, then refreshes every terminal', () => {
    const w = world();
    w.terminal('a');
    w.terminal('b');
    clearAllAtlases();
    expect(w.log).toEqual(['clear a', 'clear b', 'refresh a 0-23', 'refresh b 0-23']);
    w.cleanup();
  });

  it('growth seen by one terminal clears and refreshes the other too', () => {
    const w = world();
    const a = w.terminal('a', { maxPages: 2 });
    w.terminal('b', { maxPages: 2 });
    a.addPage();
    a.addPage();
    vi.advanceTimersByTime(99);
    expect(w.log).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(w.log).toEqual(['clear a', 'clear b', 'refresh a 0-23', 'refresh b 0-23']);
    w.cleanup();
  });

  it('a page removal on one terminal repaints both', () => {
    const w = world();
    const a = w.terminal('a');
    w.terminal('b');
    a.removePage();
    vi.advanceTimersByTime(100);
    expect(w.log).toEqual(['clear a', 'clear b', 'refresh a 0-23', 'refresh b 0-23']);
    w.cleanup();
  });

  it('shares one debounce across terminals and restarts it on each event', () => {
    const w = world();
    const a = w.terminal('a');
    const b = w.terminal('b');
    a.removePage();
    vi.advanceTimersByTime(60);
    b.removePage();
    vi.advanceTimersByTime(60);
    expect(w.log).toEqual([]);
    vi.advanceTimersByTime(40);
    expect(w.log.filter((l) => l.startsWith('clear'))).toEqual(['clear a', 'clear b']);
    w.cleanup();
  });

  it('one shared page seen by N terminals counts once', () => {
    const w = world();
    const a = w.terminal('a', { maxPages: 2 });
    w.terminal('b', { maxPages: 2 });
    w.terminal('c', { maxPages: 2 });
    w.terminal('d', { maxPages: 2 });
    a.addPage();
    vi.advanceTimersByTime(1000);
    expect(w.log).toEqual([]);
    a.addPage();
    vi.advanceTimersByTime(100);
    expect(w.log.filter((l) => l.startsWith('clear'))).toHaveLength(4);
    w.cleanup();
  });

  it('resets the page count when the last terminal detaches', () => {
    const w1 = world();
    const a = w1.terminal('a', { maxPages: 2 });
    a.addPage();
    w1.cleanup();
    const w2 = world();
    const b = w2.terminal('b', { maxPages: 2 });
    b.addPage();
    vi.advanceTimersByTime(1000);
    expect(w2.log).toEqual([]);
    w2.cleanup();
  });

  it('page growth counts since the last clear, not per terminal', () => {
    const w = world();
    const a = w.terminal('a', { maxPages: 3 });
    const b = w.terminal('b', { maxPages: 3 });
    a.addPage();
    b.addPage();
    vi.advanceTimersByTime(1000);
    expect(w.log).toEqual([]);
    a.addPage();
    vi.advanceTimersByTime(100);
    expect(w.log.filter((l) => l.startsWith('clear'))).toHaveLength(2);
    w.log.length = 0;
    a.addPage();
    vi.advanceTimersByTime(1000);
    expect(w.log).toEqual([]);
    w.cleanup();
  });

  it('attaching schedules nothing (the acquire clear is size-sync\'s)', () => {
    const w = world();
    w.terminal('a');
    vi.advanceTimersByTime(1000);
    expect(w.log).toEqual([]);
    w.cleanup();
  });

  it('a context restore on one terminal repaints all, via a descendant canvas', () => {
    const w = world();
    const a = w.terminal('a');
    w.terminal('b');
    const canvas = document.createElement('canvas');
    a.element.appendChild(canvas);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    vi.advanceTimersByTime(100);
    expect(w.log.filter((l) => l.startsWith('clear'))).toEqual(['clear a', 'clear b']);
    w.cleanup();
  });

  it('clearAllAtlases cancels a pending debounce', () => {
    const w = world();
    w.terminal('a');
    scheduleClearAllAtlases(100);
    clearAllAtlases();
    vi.advanceTimersByTime(1000);
    expect(w.log).toEqual(['clear a', 'refresh a 0-23']);
    w.cleanup();
  });

  it('repaintAllTerminals is the same fan-out', () => {
    const w = world();
    w.terminal('a');
    w.terminal('b');
    repaintAllTerminals();
    expect(w.log).toEqual(['clear a', 'clear b', 'refresh a 0-23', 'refresh b 0-23']);
    w.cleanup();
  });

  it('a throwing clear on one terminal does not stop the others', () => {
    const log: string[] = [];
    const bad: AtlasAddonLike = {
      onAddTextureAtlasCanvas: () => ({ dispose: () => {} }),
      onRemoveTextureAtlasCanvas: () => ({ dispose: () => {} }),
      clearTextureAtlas: () => {
        throw new Error('disposed');
      },
    };
    const d = attachAtlasGuard(bad, { rows: 2, refresh: () => void log.push('refresh bad') });
    const w = world();
    w.terminal('ok');
    clearAllAtlases();
    expect(w.log).toEqual(['clear ok', 'refresh ok 0-23']);
    expect(log).toEqual(['refresh bad']);
    d();
    w.cleanup();
  });

  it('detach unsubscribes, drops the terminal and cancels pending work', () => {
    const w = world();
    const a = w.terminal('a');
    a.removePage();
    w.cleanup();
    expect(a.subs()).toBe(0);
    vi.advanceTimersByTime(1000);
    clearAllAtlases();
    expect(w.log).toEqual([]);
  });
});
