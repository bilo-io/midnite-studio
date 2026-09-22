import { Terminal } from '@xterm/xterm';
import { describe, expect, it, vi } from 'vitest';

/**
 * vitest/jsdom, not e2e (Phase 82's rule, same call as the other Phase 88
 * repro tests): the defect lives entirely inside `@xterm/xterm`'s own
 * dispose ordering — no real GPU, layout or browser capability is needed to
 * reach it, only a real `Terminal` and a real (jsdom) container element.
 *
 * Phase 88 Theme F — the first of the two debts parked on this bump
 * ([`outstanding.md`](../../../../../.midnite/tasks/outstanding.md), "xterm
 * throws on unmount under the dev server", originally cited from Phase 41
 * and Phase 51's own guardrails). The historically observed trace was:
 *
 * ```
 * TypeError: Cannot read properties of undefined (reading 'dimensions')
 *     at get dimensions (@xterm/xterm)
 *     at Viewport.syncScrollArea (@xterm/xterm)
 * ```
 *
 * **Verdict: still present in `@xterm/xterm` 6.0.0, confirmed by reading the
 * shipped source rather than assumed.** The method xterm's own trace named
 * — `Viewport.syncScrollArea` — no longer exists under that name: v6
 * rewrote `Viewport` on top of the `vs/base` `Scrollable`/
 * `SmoothScrollableElement` machinery and renamed it to a private `_sync`.
 * But the defect it throws from is unchanged in kind and in mechanism:
 * `RenderService.get dimensions()` (`browser/services/RenderService.ts`)
 * still reads `this._renderer.value!.dimensions` — a non-null assertion
 * against a `MutableDisposable<IRenderer>` whose `.value` getter starts
 * returning `undefined` (not throwing, not staying pinned to the last
 * value) the instant `MutableDisposable.dispose()` runs
 * (`vs/base/common/lifecycle.ts`). `Viewport._sync` (queued via
 * `RenderService.addRefreshCallback`, itself a thin wrapper over
 * `RenderDebouncer`'s shared animation-frame handle) reads
 * `this._renderService.dimensions` unconditionally once it runs — its own
 * guard (`if (!this._renderService || this._isSyncing) return;`) checks
 * whether the *service* reference is falsy, which it never is once
 * constructed; it does not check whether the service has been disposed.
 * `RenderDebouncer.dispose()` does cancel its own pending
 * `requestAnimationFrame` handle, which is why this is StrictMode-only
 * rather than a permanent crash: in the ordinary single-mount case nothing
 * outraces the cancellation. StrictMode's synchronous mount → unmount →
 * mount, racing an already-scheduled `ResizeObserver`-driven `queueSync()`
 * against the first mount's teardown, is what can land a `_sync` call after
 * `RenderService` has already been disposed — exactly what this test
 * reproduces directly, the same way Theme E's `xterm-attach.test.ts`
 * reaches into `_core._store` rather than racing real dispose timing: this
 * test disposes the real `RenderService` xterm itself constructed, then
 * calls the real, unmodified v6 `Viewport._sync` and asserts it throws the
 * exact `TypeError` shape the original trace recorded.
 *
 * **Not fixed here.** Both `_renderer.value!` and `Viewport._sync`'s
 * service-presence-only guard are internal to `@xterm/xterm`, so there is
 * nothing on this repo's side of the boundary to patch — re-parked in
 * `outstanding.md` with this v6 verdict rather than silently left as
 * "worth revisiting on the next xterm bump", which already happened.
 */

/** One real `Terminal`, attached to a real (jsdom) element — no addons needed, the defect is core-only. */
function mountTerminal(): Terminal {
  const container = document.createElement('div');
  container.style.width = '400px';
  container.style.height = '300px';
  document.body.appendChild(container);

  const term = new Terminal({ cols: 80, rows: 24 });
  term.open(container);
  return term;
}

describe('Viewport dispose-ordering throw under xterm v6', () => {
  it('RenderService.dimensions throws once its MutableDisposable renderer clears, not before', () => {
    const term = mountTerminal();
    const core = (term as unknown as { _core: { _renderService: { dispose(): void; dimensions: unknown } } })._core;
    const renderService = core._renderService;

    // Sanity: dimensions reads clean before dispose — the getter itself is
    // fine, only its post-dispose behaviour is the defect.
    expect(() => renderService.dimensions).not.toThrow();

    renderService.dispose();

    expect(() => renderService.dimensions).toThrow(/Cannot read properties of undefined \(reading 'dimensions'\)/);

    term.dispose();
  });

  it("Viewport._sync throws the historically-observed shape once RenderService is disposed out from under it", () => {
    const term = mountTerminal();
    const core = (term as unknown as {
      _core: {
        _viewport: { _sync(ydisp?: number): void };
        _renderService: { dispose(): void };
      };
    })._core;
    const { _viewport: viewport, _renderService: renderService } = core;

    // The exact race `outstanding.md` describes: a queued sync callback
    // firing after the renderer it reads from has already been torn down.
    // `RenderDebouncer` normally cancels this handle on dispose, which is
    // why the bug is StrictMode-timing-dependent rather than constant —
    // reaching straight for the disposed-then-sync ordering, as Theme E's
    // `_core._store` deletion does for its own defect, makes the outcome
    // deterministic instead of racing a real animation frame.
    renderService.dispose();

    let thrown: unknown;
    try {
      viewport._sync();
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(TypeError);
    expect((thrown as TypeError).message).toMatch(/Cannot read properties of undefined \(reading 'dimensions'\)/);

    term.dispose();
  });

  it('a disposed Terminal that never races a queued sync tears down clean (the ordinary, non-StrictMode path)', () => {
    // Confirms the defect is genuinely conditional on the race, not a
    // blanket "xterm.dispose() always throws" regression — the ordinary
    // single-mount lifecycle this app's packaged build always takes is
    // unaffected, matching `outstanding.md`'s "never in a packaged build".
    const term = mountTerminal();
    expect(() => term.dispose()).not.toThrow();
  });
});

describe('xterm v6 Viewport method naming, for anyone grepping the historical trace', () => {
  it("the public method the original trace named, 'syncScrollArea', no longer exists — v6 renamed it to a private '_sync'", () => {
    const term = mountTerminal();
    const core = (term as unknown as { _core: { _viewport: Record<string, unknown> } })._core;

    expect(core._viewport.syncScrollArea).toBeUndefined();
    expect(typeof core._viewport._sync).toBe('function');

    vi.spyOn(console, 'error').mockImplementation(() => {});
    term.dispose();
    vi.restoreAllMocks();
  });
});
