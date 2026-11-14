/**
 * Shared-atlas repair for the integrated terminal's WebGL renderer.
 *
 * Every WebGL terminal with the same font, theme and DPR shares ONE glyph
 * atlas (xterm's `CharAtlasCache`). `WebglAddon.clearTextureAtlas()` wipes
 * that shared atlas but resets only the calling terminal's own renderer
 * model, so every sibling keeps drawing from stale atlas coordinates and the
 * viewport shows garbled glyph fragments (static text included).
 *
 * The rule here: an atlas clear is never per-terminal. Every clear, whether
 * it comes from size-sync (DPR / font / renderer change, which includes every
 * WebGL acquire when the active terminal switches), the page-growth guard or
 * the `terminal.repaint` command, goes through `clearAllAtlases()`, which
 * clears and then refreshes every live WebGL terminal in the same tick. The
 * first clear wipes the shared pages; the rest reset their own model.
 * Clearing is done before refreshing, or the repaint redraws stale glyphs.
 *
 * The page-growth trigger is a mitigation, not a cap: `clearTexture()` blanks
 * pages in place, it does not remove them, so the atlas can still reach
 * xterm's page limit and merge. Clearing every few new pages only prunes
 * glyphs minted by truecolor gradients so the atlas churns less.
 *
 * Pure of xterm imports so vitest drives it with fakes and so this module can
 * sit in the feature's entry chunk without dragging xterm in.
 */

export const ATLAS_MAX_PAGES = 4;
export const ATLAS_REPAINT_DEBOUNCE_MS = 400;

/** The slice of `WebglAddon` the guard uses. */
export interface AtlasAddonLike {
  onAddTextureAtlasCanvas: (cb: (canvas: object) => void) => { dispose: () => void };
  onRemoveTextureAtlasCanvas: (cb: (canvas: object) => void) => { dispose: () => void };
  clearTextureAtlas: () => void;
}

/** The slice of `Terminal` the guard touches. */
export interface AtlasTermLike {
  rows: number;
  refresh: (start: number, end: number) => void;
  element?: HTMLElement | null;
}

interface Entry {
  webgl: AtlasAddonLike;
  term: AtlasTermLike;
}

const live = new Set<Entry>();
let timer: ReturnType<typeof setTimeout> | null = null;
let addedSinceClear = 0;
/**
 * Every renderer forwards the shared atlas's page events, so one new page
 * reaches every attached terminal's listener. Count each canvas once.
 */
let countedPages = new WeakSet<object>();

/**
 * Clear the shared atlas and refresh every live WebGL terminal, now. All
 * clears run before any refresh. Safe with no terminals attached.
 */
export function clearAllAtlases(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  addedSinceClear = 0;
  countedPages = new WeakSet<object>();
  const entries = [...live];
  for (const e of entries) {
    try {
      e.webgl.clearTextureAtlas();
    } catch {
      // Addon already disposed (a lost GPU context) - nothing to clear.
    }
  }
  for (const e of entries) {
    try {
      e.term.refresh(0, e.term.rows - 1);
    } catch {
      // Terminal torn down mid-tick.
    }
  }
}

/** The one shared debounce in front of `clearAllAtlases()`. */
export function scheduleClearAllAtlases(debounceMs: number = ATLAS_REPAINT_DEBOUNCE_MS): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    clearAllAtlases();
  }, debounceMs);
}

/** The `terminal.repaint` command. */
export const repaintAllTerminals = clearAllAtlases;

/**
 * Register one addon/terminal pair. Call right after `loadAddon`; the
 * returned function detaches it and must run when the addon is disposed.
 * Triggers (all via the shared debounce): every `maxPages` atlas pages added
 * since the last clear, any page removal (a merge), and a context restore
 * (a capture listener on the terminal element because `webglcontextrestored`
 * does not bubble from the addon's own canvas). Attaching itself schedules
 * nothing: the acquire-time clear is size-sync's `renderer` clear.
 */
export function attachAtlasGuard(
  webgl: AtlasAddonLike,
  term: AtlasTermLike,
  opts: { maxPages?: number; debounceMs?: number } = {},
): () => void {
  const maxPages = opts.maxPages ?? ATLAS_MAX_PAGES;
  const debounceMs = opts.debounceMs ?? ATLAS_REPAINT_DEBOUNCE_MS;
  const entry: Entry = { webgl, term };
  const schedule = () => scheduleClearAllAtlases(debounceMs);
  const subs = [
    webgl.onAddTextureAtlasCanvas((canvas) => {
      if (countedPages.has(canvas)) return;
      countedPages.add(canvas);
      addedSinceClear += 1;
      if (addedSinceClear >= maxPages) schedule();
    }),
    webgl.onRemoveTextureAtlasCanvas(schedule),
  ];
  const el = term.element ?? null;
  el?.addEventListener('webglcontextrestored', schedule, true);
  live.add(entry);
  return () => {
    live.delete(entry);
    for (const s of subs) s.dispose();
    el?.removeEventListener('webglcontextrestored', schedule, true);
    if (live.size === 0) {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      addedSinceClear = 0;
      countedPages = new WeakSet<object>();
    }
  };
}
