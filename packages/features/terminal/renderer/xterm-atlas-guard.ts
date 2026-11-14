/**
 * Mitigation for WebGL glyph-atlas corruption (garbled glyph fragments in the
 * integrated terminal).
 *
 * `@xterm/addon-webgl` rasterises every glyph+fg+bg combination into texture
 * atlas pages. Truecolor gradients (spinners, status lines) mint new
 * combinations constantly, so the atlas grows, merges and drops pages under a
 * live terminal; under GPU/context pressure a page upload or merge can leave
 * cells sampling stale coordinates. xterm exposes no repair beyond
 * `clearTextureAtlas()`, so this guard fires it — debounced, and always
 * followed by a full-viewport refresh — when the atlas grows past
 * `maxPages`, when a page is added over that mark or removed (a merge), and
 * when a WebGL context is (re)acquired or restored.
 *
 * Order matters (same rule as the DPR effect in `terminal-view.tsx`): clear
 * the atlas BEFORE refreshing, or the repaint redraws from the corrupt one.
 *
 * Pure of xterm imports so vitest drives it with fakes and so the registry
 * below can sit in the feature's entry chunk without dragging xterm in.
 */

export const ATLAS_MAX_PAGES = 4;
export const ATLAS_REPAINT_DEBOUNCE_MS = 400;

export interface AtlasGuardOptions {
  /** `webgl.clearTextureAtlas()` */
  clear: () => void;
  /** `term.refresh(0, term.rows - 1)` */
  refresh: () => void;
  maxPages?: number;
  debounceMs?: number;
}

export interface AtlasGuard {
  pageAdded: () => void;
  pageRemoved: () => void;
  /** Debounced clear + refresh (context acquire / restore). */
  schedule: () => void;
  /** Clear + refresh right now (manual command). */
  repaintNow: () => void;
  dispose: () => void;
}

export function createAtlasGuard(opts: AtlasGuardOptions): AtlasGuard {
  const maxPages = opts.maxPages ?? ATLAS_MAX_PAGES;
  const debounceMs = opts.debounceMs ?? ATLAS_REPAINT_DEBOUNCE_MS;
  let pages = 1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let repainting = false;

  const repaintNow = () => {
    if (disposed) return;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    // The clear itself drops/adds pages and fires our own events; ignore them.
    repainting = true;
    try {
      opts.clear();
      opts.refresh();
    } finally {
      repainting = false;
    }
    pages = 1;
  };

  const schedule = () => {
    if (disposed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      repaintNow();
    }, debounceMs);
  };

  return {
    pageAdded: () => {
      if (repainting || disposed) return;
      pages += 1;
      if (pages > maxPages) schedule();
    },
    pageRemoved: () => {
      if (repainting || disposed) return;
      pages = Math.max(1, pages - 1);
      schedule();
    },
    schedule,
    repaintNow,
    dispose: () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

/** The slice of `WebglAddon` the guard listens to. */
export interface AtlasAddonLike {
  onAddTextureAtlasCanvas: (cb: () => void) => { dispose: () => void };
  onRemoveTextureAtlasCanvas: (cb: () => void) => { dispose: () => void };
  clearTextureAtlas: () => void;
}

/** The slice of `Terminal` the guard touches. */
export interface AtlasTermLike {
  rows: number;
  refresh: (start: number, end: number) => void;
  element?: HTMLElement | null;
}

const live = new Set<AtlasGuard>();

/** Clear + refresh every mounted WebGL terminal (the `terminal.repaint` command). */
export function repaintAllTerminals(): void {
  for (const g of live) g.repaintNow();
}

/**
 * Wire a guard to one addon/terminal pair. Call right after `loadAddon`;
 * the returned function detaches everything and must run when the addon is
 * disposed. The context-restore listener is a capture listener on the
 * terminal element because `webglcontextrestored` does not bubble from the
 * addon's own canvas.
 */
export function attachAtlasGuard(
  webgl: AtlasAddonLike,
  term: AtlasTermLike,
  opts: { maxPages?: number; debounceMs?: number } = {},
): () => void {
  const guard = createAtlasGuard({
    ...opts,
    clear: () => webgl.clearTextureAtlas(),
    refresh: () => term.refresh(0, term.rows - 1),
  });
  const subs = [
    webgl.onAddTextureAtlasCanvas(() => guard.pageAdded()),
    webgl.onRemoveTextureAtlasCanvas(() => guard.pageRemoved()),
  ];
  const el = term.element ?? null;
  const onRestore = () => guard.schedule();
  el?.addEventListener('webglcontextrestored', onRestore, true);
  live.add(guard);
  // A fresh acquire: repaint once the first frames have settled.
  guard.schedule();
  return () => {
    live.delete(guard);
    for (const s of subs) s.dispose();
    el?.removeEventListener('webglcontextrestored', onRestore, true);
    guard.dispose();
  };
}
