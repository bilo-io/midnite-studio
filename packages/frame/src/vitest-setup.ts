/**
 * jsdom gap-filling for the frame's component tests (Phase 113 Theme M, the Knowledge view's tests moved here).
 *
 * `@tanstack/react-virtual` reads a first size off `offsetHeight` (always 0 under jsdom) and learns every
 * later one from a `ResizeObserver` callback - so a `ResizeObserver` that never fires means a virtualized
 * list renders zero rows, silently. This one fires once per `observe()` with a fixed rect, the same
 * stub `packages/app/src/vitest-setup.ts` documents at length.
 */
const RECT = { width: 800, height: 600 };

class FiringResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.targets.add(target);
    queueMicrotask(() => {
      if (!this.targets.has(target)) return;
      const { width, height } = RECT;
      const size: ResizeObserverSize = { inlineSize: width, blockSize: height };
      const rect = {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }),
      } as DOMRectReadOnly;
      this.callback(
        [
          {
            target,
            contentRect: rect,
            borderBoxSize: [size],
            contentBoxSize: [size],
            devicePixelContentBoxSize: [size],
          },
        ],
        this,
      );
    });
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = FiringResizeObserver;
}
