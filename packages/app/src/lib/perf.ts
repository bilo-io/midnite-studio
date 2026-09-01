import type { RendererMarkName } from '@midnite/studio-shared';

import { bridge } from '../services/bridge';

/**
 * Renderer-side perf marks — Phase 36 Theme A.
 *
 * Three marks, each recorded twice: once as a `performance.mark` so a DevTools
 * timeline shows it in place, and once over the bridge so a script watching
 * main's stdout can read it without attaching a debugger.
 *
 * Everything is gated on `perf.enabled`, resolved in the preload from
 * `MSTUDIO_PERF`. With the flag unset — every real run — a mark site costs one
 * property read and returns.
 */

/**
 * Marks already emitted.
 *
 * `first-view-rendered` and `graph-first-batch` both live on paths that repeat:
 * a layout effect re-runs under StrictMode's double-mount, and every graph batch
 * after the first arrives through the same callback. "First" has to mean first,
 * so the guard is here rather than restated at each site.
 */
const emitted = new Set<RendererMarkName>();

/** Record `name` the first time it happens; later calls are no-ops. */
export function markOnce(name: RendererMarkName): void {
  const api = bridge();
  // `perf?.` and not `perf.`: the e2e mock bridge and the unit tests' partial
  // bridges are cast, not constructed, so a mark site must survive a bridge that
  // predates this key rather than throwing inside someone else's spec.
  if (!api?.perf?.enabled) return;
  if (emitted.has(name)) return;
  emitted.add(name);
  performance.mark(name);
  api.perf.mark({ name, tMs: performance.now() });
}

/** Test seam — the once-guard is module state, and a test needs a clean one. */
export function __resetPerfMarks(): void {
  emitted.clear();
}
