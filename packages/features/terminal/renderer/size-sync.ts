/**
 * One place that decides when a terminal pane fits its container and tells
 * the pty about it. Pure: no xterm import, every effect arrives through deps,
 * so the rules are unit-testable without a canvas.
 *
 * Why it exists: `safeFit()` used to dedupe on a `lastSent` that was written
 * even when the send was dropped for lack of a ptyId, never re-sent on tab
 * switches, and ran before a live replay (so the pty was resized to the
 * container before the snapshot was parsed, and a TUI redrew over scrollback
 * that had been wrapped at the wrong width).
 */
export type SyncReason =
  | 'observe'
  | 'mount'
  | 'bind'
  | 'active'
  | 'visible'
  | 'fitSignal'
  | 'dpr'
  | 'font'
  | 'fontsLoaded'
  | 'renderer'
  | 'replayed';

/** Reasons that always send, even at an unchanged size (the pty may have been resized by another view). */
const FORCED: ReadonlySet<SyncReason> = new Set(['bind', 'active', 'visible', 'replayed', 'renderer']);
/** Reasons that invalidate the glyph atlas, which must happen before the fit measures cells. */
const CLEARS_ATLAS: ReadonlySet<SyncReason> = new Set(['dpr', 'font', 'fontsLoaded', 'renderer']);

export type SizeSyncDeps = {
  isMeasurable: () => boolean;
  /** `fitAddon.fit()`, then the terminal's size. */
  fit: () => { cols: number; rows: number };
  /** `false` = no ptyId yet, nothing was sent. */
  send: (cols: number, rows: number) => boolean;
  repaint: () => void;
  clearAtlas: () => void;
};

export type SizeSync = {
  sync(reason: SyncReason): void;
  /** Forget the last sent size (the ptyId changed). */
  invalidate(): void;
  /** A live replay is in flight: every `sync()` is dropped until `resume()`. */
  suspend(): void;
  /** Leave suspension, then `sync('replayed')` once. No-op when not suspended. */
  resume(): void;
  last(): { cols: number; rows: number } | null;
};

export function createSizeSync(deps: SizeSyncDeps): SizeSync {
  let last: { cols: number; rows: number } | null = null;
  let suspended = false;

  const sync = (reason: SyncReason): void => {
    if (suspended) return;
    if (!deps.isMeasurable()) return;
    if (CLEARS_ATLAS.has(reason)) deps.clearAtlas();
    let size: { cols: number; rows: number };
    try {
      size = deps.fit();
    } catch {
      return;
    }
    const unchanged = last !== null && last.cols === size.cols && last.rows === size.rows;
    if (FORCED.has(reason) || !unchanged) {
      if (deps.send(size.cols, size.rows)) last = { cols: size.cols, rows: size.rows };
    }
    if (reason !== 'observe') deps.repaint();
  };

  return {
    sync,
    invalidate: () => {
      last = null;
    },
    suspend: () => {
      suspended = true;
    },
    resume: () => {
      if (!suspended) return;
      suspended = false;
      sync('replayed');
    },
    last: () => last,
  };
}
