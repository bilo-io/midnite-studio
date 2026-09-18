import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { describe, expect, it, vi } from 'vitest';

/**
 * vitest/jsdom, not e2e (Phase 82's rule): proving `@xterm/xterm` and its two
 * addons actually bind needs no real GPU or layout — it needs a `Terminal`
 * instance and a canvas that doesn't return `null` from `getContext`, which a
 * local `vi.spyOn` (the pattern `vitest-setup.ts` documents) supplies in
 * seconds. The one real browser capability this would want — an actual WebGL
 * rasterizer — is never exercised: the addon's own construction path is.
 *
 * Phase 88 Theme E, replacing the guard that `@xterm/addon-fit`/
 * `@xterm/addon-webgl` `0.11.0`/`0.19.0` removed: both dropped their
 * `'@xterm/xterm': ^5.0.0'` peer dependency (they target 6.x now), so pnpm no
 * longer refuses a mismatched core/addon pair — nothing does, except this.
 *
 * [PR #242](https://github.com/bilo-io/midnite-studio/pull/242) tried the
 * addon bump alone, core left at `^5.5.0`. It never got past e2e: every
 * terminal-backed spec failed, and the real error — pulled from that run's
 * `panel-snap.spec.ts` trace (`pageError`) — was
 *
 * ```
 * TypeError: Cannot read properties of undefined (reading '_isDisposed')
 *     at @xterm_addon-webgl.js … Object.dispose … xt2.clear … xt2.dispose … xr.dispose
 *     at t2.AddonManager._wrappedAddonDispose (@xterm_xterm.js)
 * ```
 *
 * `WebglAddon.activate()` registers a dispose callback that reads
 * `terminal._core._store._isDisposed` — `_store` is a field xterm core
 * `6.0.0` added (`grep`-confirmed: zero hits in `5.5.0`'s bundle, 27 in
 * `6.0.0`'s) and `5.5.0` has no such property, so the read throws the moment
 * anything disposes the terminal. Activation itself never throws — both
 * `FitAddon.activate()` and `WebglAddon.activate()` are structurally
 * tolerant of the old core's shape — which is exactly why this test disposes
 * the terminal rather than stopping at `loadAddon`: attaching *and tearing
 * down clean* is the actual contract, and #242's failure only ever showed up
 * on the second half.
 */

/**
 * A WebGL2-shaped proxy, not a real context: every method the addon might
 * call resolves through one trap, so a bump that starts calling a `gl.*`
 * method this file doesn't already know about still returns *something*
 * (falling back to `undefined`, i.e. "call succeeded, no return value")
 * rather than `TypeError: gl.foo is not a function`. `get*` calls return a
 * truthy `1` (WebGL status queries: compiled/linked/ok), `create*` calls
 * return an opaque `{}` handle good enough to pass back into a later `bind*`
 * call. Real pixels are never produced and never asked for.
 */
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

/** Same shape, for the DOM-renderer's own canvas layers (`BaseRenderLayer`, `TextureAtlas`). */
function fakeCtx2d(): CanvasRenderingContext2D {
  const cache = new Map<string, unknown>();
  const target: Record<string, unknown> = {
    canvas: { width: 300, height: 150, ownerDocument: document },
  };
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

/** One real `Terminal`, attached to a real (jsdom) element, with both addons loaded. */
function mountTerminalWithAddons(): { term: Terminal; fit: FitAddon; webgl: WebglAddon } {
  const container = document.createElement('div');
  container.style.width = '400px';
  container.style.height = '300px';
  document.body.appendChild(container);

  const term = new Terminal({ cols: 80, rows: 24 });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(container);

  const webgl = new WebglAddon();
  term.loadAddon(webgl);

  return { term, fit, webgl };
}

describe('xterm v6 core / addon-fit / addon-webgl attach', () => {
  it('binds FitAddon and WebglAddon to a real Terminal, and disposes clean', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((id: string) =>
      id === 'webgl2' ? fakeGl2() : fakeCtx2d()) as typeof HTMLCanvasElement.prototype.getContext);

    const { term, fit } = mountTerminalWithAddons();

    // FitAddon actually bound to this terminal's core, not just constructed.
    expect(() => fit.fit()).not.toThrow();

    // The #242 condition: disposing must not throw. This is where it threw.
    expect(() => term.dispose()).not.toThrow();

    vi.restoreAllMocks();
  });

  it('fails against a deliberately mismatched core/addon pair (proof, not decoration)', () => {
    // A structural stand-in for xterm core 5.5.0's `_core`: no `_store`
    // field (added in 6.0.0 — confirmed via the release's own bundle), which
    // is exactly the shape `WebglAddon`'s dispose callback breaks on. This
    // does not reinstall an old package; it reproduces the one field access
    // that PR #242 actually broke on, so this test cannot pass by accident
    // if a future addon bump starts reading the store correctly.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((id: string) =>
      id === 'webgl2' ? fakeGl2() : fakeCtx2d()) as typeof HTMLCanvasElement.prototype.getContext);

    const { term, webgl } = mountTerminalWithAddons();
    const core = (term as unknown as { _core: { _store?: unknown } })._core;
    const realStore = core._store;
    delete core._store;

    expect(() => webgl.dispose()).toThrow(/_isDisposed/);

    core._store = realStore;
    vi.restoreAllMocks();
  });
});
