import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_WEBGL_CONTEXTS, useXtermBudget } from './xterm-budget';

/**
 * vitest/jsdom, not e2e (Phase 82's rule, same call as `xterm-attach.test.ts`):
 * what this proves — that `WebglAddon.onContextLoss` still fires under v6 when
 * its canvas dispatches the browser's own `webglcontextlost` event — needs no
 * real GPU, just a `Terminal`, a fake WebGL2 context (so construction doesn't
 * throw for want of a real one) and a real DOM event. The one thing genuinely
 * GPU-specific — Chromium actually evicting a context — is not exercised here;
 * see the phase doc's Decisions section for why that's out of this test's
 * reach either way.
 *
 * Phase 88 Theme B: `terminal-view.tsx`'s `acquireWebglRef` (the only
 * `WebglAddon` consumer in the repo) hooks its DOM-renderer fallback onto
 * exactly this event — `webgl.onContextLoss(() => { ...; setRenderer(id,
 * 'dom'); ... })`. The phase framing calls out v6's context handling as "the
 * one thing that could silently change the budget's meaning", so this test
 * exercises the real emitter rather than assuming it still fires the same way
 * it did against 5.5.0 / `addon-webgl` 0.18.0.
 */

/** Same shape as `xterm-attach.test.ts`'s stand-in — good enough to construct the addon, never asked to draw a real pixel. */
function fakeGl2(): WebGL2RenderingContext {
  const cache = new Map<string, unknown>();
  const target: Record<string, unknown> = {
    canvas: { width: 300, height: 150, ownerDocument: document },
    drawingBufferWidth: 300,
    drawingBufferHeight: 150,
    isContextLost: () => false,
  };
  return new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      const cached = cache.get(prop);
      if (cached) return cached;
      const fn = (..._args: unknown[]) => {
        if (prop.startsWith('get')) return 1;
        if (prop.startsWith('create')) return {};
        return undefined;
      };
      cache.set(prop, fn);
      return fn;
    },
  }) as unknown as WebGL2RenderingContext;
}

function fakeCtx2d(): CanvasRenderingContext2D {
  const cache = new Map<string, unknown>();
  const target: Record<string, unknown> = { canvas: { width: 300, height: 150, ownerDocument: document } };
  return new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      const cached = cache.get(prop);
      if (cached) return cached;
      const fn = (..._args: unknown[]) => (prop === 'measureText' ? { width: 8 } : undefined);
      cache.set(prop, fn);
      return fn;
    },
  }) as unknown as CanvasRenderingContext2D;
}

afterEach(() => {
  useXtermBudget.setState({ mounts: {}, renderers: {} });
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('WebglAddon.onContextLoss under xterm v6 / addon-webgl 0.19.0', () => {
  it('fires when its own canvas dispatches webglcontextlost, and terminal-view\'s handler shape reacts to it', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((id: string) =>
      id === 'webgl2' ? fakeGl2() : fakeCtx2d()) as typeof HTMLCanvasElement.prototype.getContext);
    // Only `setTimeout` is faked (not `Date`/`queueMicrotask`/etc.) so xterm's
    // own scheduling (cursor blink, the addon's restoration window) still
    // advances deterministically under `vi.advanceTimersByTime` below without
    // otherwise disturbing construction.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const container = document.createElement('div');
    container.style.width = '400px';
    container.style.height = '300px';
    document.body.appendChild(container);

    const term = new Terminal({ cols: 80, rows: 24 });
    term.open(container);

    // The addon appends its own canvas(es) to `screenElement` on activation —
    // diff the canvases present before/after to find them without reaching
    // past the public API for anything but "which elements are these". (In
    // practice this is the WebGL surface plus a cursor-blink overlay canvas;
    // the event is dispatched below on whichever one the addon actually
    // listens on, found by which dispatch flips `lost`.)
    const before = new Set(container.querySelectorAll('canvas'));
    const webgl = new WebglAddon();
    term.loadAddon(webgl);
    const after = [...container.querySelectorAll('canvas')].filter((c) => !before.has(c));
    expect(after.length).toBeGreaterThan(0);

    // Mirrors terminal-view.tsx's own handler: on context loss it disposes the
    // addon, clears the ref, and flips the process-wide budget's renderer for
    // this session to 'dom' — exercised here against xterm-budget's REAL
    // `setRenderer`, not a spy, so a v6 shape change to the event would show
    // up as this assertion failing rather than a mock quietly agreeing with
    // whatever fired.
    const sessionId = 'session-under-test';
    const setRenderer = useXtermBudget.getState().setRenderer;
    let lost = false;
    webgl.onContextLoss(() => {
      lost = true;
      webgl.dispose();
      setRenderer(sessionId, 'dom');
    });

    expect(lost).toBe(false);
    expect(useXtermBudget.getState().renderers[sessionId]).toBeUndefined();

    for (const canvas of after) {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    }

    // The addon does not fire `onContextLoss` synchronously on the browser
    // event — it starts a ~3s internal restoration window first (confirmed
    // from the built bundle: `setTimeout(..., 3e3)` guarding a
    // `webglcontextrestored` counter-listener) and only fires once that
    // window elapses with no restoration. `terminal-view.tsx`'s own docblock
    // on `acquireWebglRef` names this exact window. Advancing fake timers
    // past it is what makes this a real exercise of the v6 timing rather than
    // an assumption that the event is still synchronous.
    vi.advanceTimersByTime(3001);

    expect(lost).toBe(true);
    expect(useXtermBudget.getState().renderers[sessionId]).toBe('dom');

    term.dispose();
  });

  it('MAX_WEBGL_CONTEXTS is a JS-side rationing ceiling, not something v6 controls — confirmed, not retuned', () => {
    // v6's own typings/source (checked in the phase doc's Decisions section)
    // expose no context-count API at all: `WebglAddon` neither reads nor
    // reports how many live WebGL contexts exist anywhere in the process.
    // The number this repo rations against is Chromium's own per-process
    // ceiling (~16), which is browser/GPU-process behaviour untouched by
    // which JS library asked for a context — so there is nothing about the
    // xterm/addon-webgl bump that this constant could have drifted against.
    expect(MAX_WEBGL_CONTEXTS).toBe(12);
    expect(MAX_WEBGL_CONTEXTS).toBeLessThan(16);
  });
});
