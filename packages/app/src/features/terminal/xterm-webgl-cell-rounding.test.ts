import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';

/**
 * vitest/jsdom, not e2e (Phase 82's rule, same call as the other Phase 88
 * repro tests): the claim under test is a pure arithmetic property of
 * `@xterm/addon-webgl`'s own dimension calculation — reachable with a real
 * `Terminal`, a real `WebglAddon` and a fake WebGL2 context (construction
 * only, never asked to draw a pixel), no real GPU or layout required.
 *
 * Phase 88 Theme F — the second of the two debts parked on this bump: Phase
 * 51's "xterm computes a fractional cell height the WebGL renderer rounds
 * *per row*, worst at small sizes" ([`terminal-font.ts`](./terminal-font.ts)'s
 * own docblock, `.midnite/tasks/done.md`'s Theme B entry).
 *
 * **Verdict: the mechanism as described does not exist, under v6 or under
 * the pre-bump 5.5.0 / addon-webgl 0.18.0 pairing — checked against v6's
 * real, shipped source, not assumed.** `WebglRenderer._updateDimensions()`
 * (`@xterm/addon-webgl/src/WebglRenderer.ts`) computes exactly one
 * `device.cell.height` per dimension recalculation —
 * `Math.floor(device.char.height * lineHeight)` — and every row's draw
 * position is a single multiplication against that one integer,
 * `y * this._deviceCellHeight` (`renderLayer/BaseRenderLayer.ts`), with no
 * `Math.round`/`Math.floor` inside the per-row path at all. There is no
 * per-row rounding call for a bug to live in: cell height is quantized to a
 * whole device pixel exactly once, and every row inherits the identical
 * integer, so two rows can never receive different heights or an
 * accumulating rounding drift. This is unchanged, byte-for-byte, between
 * `addon-webgl@0.18.0` (paired with `xterm@5.5.0`) and `0.19.0` (paired
 * with `xterm@6.0.0`) — confirmed by diffing the two packages' shipped
 * `WebglRenderer.ts` — so the bump did not fix this because there was
 * nothing in this specific mechanism for it to fix.
 *
 * The real, uneven-text symptom Phase 51 actually observed has its own,
 * already-shipped explanation: Theme B's own landing note already
 * suspected as much ("not yet the fix for the uneven baselines themselves
 * — closer to Theme C's WebGL story"), and Theme C's finding — panes
 * silently and permanently falling from the WebGL renderer to the DOM
 * renderer once Chromium evicted their context, with nothing re-acquiring
 * one — is a real, structural cause of "two panes render differently" that
 * this repo has fixed (`xterm-budget.ts`'s process-wide re-acquisition).
 * A dropped WebGL context producing a DOM-rendered pane next to WebGL-
 * rendered ones is visually indistinguishable from "uneven rounding" until
 * you go looking for which renderer each pane is actually on.
 *
 * Nothing to fix here: re-parked in the phase doc's own Decisions section
 * with this v6 verdict, per Theme F's own instruction to encode a finding
 * rather than write a fix for a defect that, on inspection, isn't there.
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

function fakeCtx2d(): CanvasRenderingContext2D {
  const cache = new Map<string, unknown>();
  const target: Record<string, unknown> = { canvas: { width: 300, height: 150, ownerDocument: document } };
  return new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      const cached = cache.get(prop);
      if (cached) return cached;
      // `getImageData` backs `TextureAtlas`'s glyph pre-cache pass (a
      // background `TaskQueue` that runs once real, non-zero cell
      // dimensions exist — exactly what this file's tests deliberately
      // produce) via its own `clearColor()` reading `.data`; a real
      // `Uint8ClampedArray` here is what keeps that async pass from
      // throwing on an unhandled timer well after a test has finished.
      const fn = (...args: unknown[]) => {
        if (prop === 'measureText') return { width: 8 };
        if (prop === 'getImageData') {
          const [, , w = 1, h = 1] = args as number[];
          return { data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: w, height: h };
        }
        return undefined;
      };
      cache.set(prop, fn);
      return fn;
    },
  }) as unknown as CanvasRenderingContext2D;
}

type WebglRendererInternals = {
  handleResize(cols: number, rows: number): void;
  dimensions: {
    device: { cell: { height: number }; char: { height: number }; canvas: { height: number } };
  };
};

type CharSizeServiceStub = { width: number; height: number };

/** One real `Terminal` + real `WebglAddon`, with direct access to the private renderer/char-size-service xterm itself constructed. */
function mountWithWebgl(): { term: Terminal; renderer: WebglRendererInternals; charSizeService: CharSizeServiceStub } {
  const container = document.createElement('div');
  container.style.width = '400px';
  container.style.height = '300px';
  document.body.appendChild(container);

  const term = new Terminal({ cols: 80, rows: 24 });
  term.open(container);

  const webgl = new WebglAddon();
  term.loadAddon(webgl);

  const renderer = (webgl as unknown as { _renderer: WebglRendererInternals })._renderer;
  const charSizeService = (term as unknown as { _core: { _charSizeService: CharSizeServiceStub } })._core
    ._charSizeService;

  return { term, renderer, charSizeService };
}

describe('WebGL cell-height quantization under xterm v6 / addon-webgl 0.19.0', () => {
  it.each([
    { charHeight: 17.3, lineHeight: 1, label: 'fractional char height, default line height' },
    { charHeight: 12.75, lineHeight: 1.2, label: 'fractional char height, fractional line height' },
    { charHeight: 21.9, lineHeight: 1.6, label: 'fractional char height, max line height' },
    { charHeight: 8.4, lineHeight: 1, label: 'fractional char height at a small font size' },
  ])(
    'produces one whole-pixel cell height applied identically to every row — $label',
    ({ charHeight, lineHeight }) => {
      globalThis.HTMLCanvasElement.prototype.getContext = ((id: string) =>
        id === 'webgl2' ? fakeGl2() : fakeCtx2d()) as typeof HTMLCanvasElement.prototype.getContext;

      const { term, renderer, charSizeService } = mountWithWebgl();

      term.options.lineHeight = lineHeight;
      // Simulate a real font measurement landing on a fractional CSS pixel
      // value — exactly what `terminal-font.ts`'s own docblock describes as
      // the trigger ("xterm computes a fractional cell height"). jsdom does
      // no real font layout, so the measured value is written directly
      // rather than produced by a real `CharSizeService.measure()` pass.
      charSizeService.width = 8;
      charSizeService.height = charHeight;
      renderer.handleResize(term.cols, term.rows);

      const { cell, char } = renderer.dimensions.device;

      // The one quantity a "rounds per row" bug would have to vary: if cell
      // height were fractional, or recomputed per row, canvas height would
      // drift from `rows * cellHeight`. It never does — cell height is a
      // single integer, computed once, and every row is an exact multiple
      // of it.
      expect(Number.isInteger(cell.height)).toBe(true);
      expect(cell.height).toBeGreaterThanOrEqual(char.height);
      expect(renderer.dimensions).toMatchObject({
        device: { canvas: { height: term.rows * cell.height } },
      });

      term.dispose();
    },
  );
});
