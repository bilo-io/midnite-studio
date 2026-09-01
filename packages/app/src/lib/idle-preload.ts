/**
 * Warm a lazy chunk once the browser is otherwise idle — Phase 36 Theme C.
 *
 * Splitting a chunk out of the entry trades boot bytes for a fetch at first use.
 * For a view the user navigates to that trade is free — they are already waiting
 * on an intentional action. For the terminal it is not: `Ctrl+`` is expected to
 * be instant, and it is the one surface in this app with a keystroke as its
 * entire interaction. Preloading after first paint keeps both halves — the chunk
 * is out of the entry, and by the time anyone presses the chord it is in memory.
 *
 * `requestIdleCallback` where it exists, a `setTimeout` where it does not (it is
 * unimplemented in Safari, and this renderer is Chromium — but the fallback
 * costs one line and removes a browser assumption). Same shape as
 * `line-highlight.ts`'s idle scheduling.
 *
 * Rejections are swallowed on purpose: this is speculative work. A chunk that
 * fails to preload will be requested again, and reported, when it is genuinely
 * needed — an unhandled rejection at idle would be noise pointing at nothing the
 * user did.
 */
export function idlePreload(loader: () => Promise<unknown>): void {
  const run = (): void => {
    void loader().catch(() => {});
  };

  const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (typeof idle === 'function') {
    idle(run);
    return;
  }
  setTimeout(run, 0);
}
