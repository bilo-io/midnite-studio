/**
 * Coalesces a burst of resize observations into at most one `fit()` per
 * animation frame (Phase 51 Theme D).
 *
 * `terminal-view.tsx`'s `ResizeObserver` had no debouncing at all: a
 * drag-resize calls its callback — and therefore a full xterm re-measure —
 * once per observation, which browsers can fire faster than once per frame.
 * `lastSentRef` (in `terminal-view.tsx`) already dedupes the IPC `resize`
 * this triggers when cols/rows land unchanged, but that guard runs *after*
 * the measurement; it does nothing about the measurement/reflow storm itself.
 *
 * `raf`/`cancelRaf` are injected (default to the real globals) so a test can
 * step through frames by hand instead of racing the browser's real timing.
 */
export type FitCoalescer = {
  /** Schedule `fit` for the next frame, replacing any already-pending one. */
  schedule: () => void;
  /** Drop a pending fit without running it — call on unmount/teardown. */
  cancel: () => void;
};

export function createFitCoalescer(
  fit: () => void,
  raf: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelRaf: (handle: number) => void = cancelAnimationFrame,
): FitCoalescer {
  let handle: number | null = null;

  return {
    schedule: () => {
      if (handle !== null) cancelRaf(handle);
      handle = raf(() => {
        handle = null;
        fit();
      });
    },
    cancel: () => {
      if (handle !== null) {
        cancelRaf(handle);
        handle = null;
      }
    },
  };
}
