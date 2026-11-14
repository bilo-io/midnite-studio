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

/** Terminals sharing one atlas, as xterm's CharAtlasCache hands out. */
function world() {
  const log: string[] = [];
  const detach: Array<() => void> = [];
  function terminal(name: string, opts: { maxPages?: number } = {}) {
    const add = new Set<() => void>();
    const remove = new Set<() => void>();
    const sub = (set: Set<() => void>) => (cb: () => void) => {
      set.add(cb);
      return { dispose: () => void set.delete(cb) };
    };
    // Faithful to WebglAddon 0.19: clearing wipes the shared pages and resets
    // this terminal's own model. It fires no add/remove atlas event.
    const webgl: AtlasAddonLike = {
      onAddTextureAtlasCanvas: sub(add),
      onRemoveTextureAtlasCanvas: sub(remove),
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
      addPage: () => add.forEach((h) => h()),
      removePage: () => remove.forEach((h) => h()),
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
