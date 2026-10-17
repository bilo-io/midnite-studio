/**
 * How the browser pane divides the window (moved here from Studio's `ui-store` in Phase 113 Theme L,
 * which re-exports it).
 *
 * `full` is a true full screen — it covers the nav rail as well as the
 * content row, because a rail whose every item navigates the app behind the
 * browser has nothing to offer while the browser is what you are looking at.
 * `left`/`right` are the side-by-side splits, naming the half the BROWSER
 * takes; the other half keeps the active view (the "editor" half), reflowed
 * rather than merely covered.
 */
export type BrowserLayout = 'full' | 'left' | 'right';

/**
 * The three layouts, in launcher order — the one place the copy and the
 * ordering live, shared by the launcher and the toolbar's picker so the two
 * cannot describe the same choice differently.
 *
 * Full screen first because it is the default and the simplest thing to
 * explain; the two splits after it, left before right, matching the shape of
 * the drawings beside them.
 */
export type BrowserLayoutOption = {
  layout: BrowserLayout;
  label: string;
  /** One line under the label — what changes about the window, not a re-label. */
  description: string;
  /** Terse form for the toolbar picker's tooltip, where there is no room for prose. */
  short: string;
};

export const BROWSER_LAYOUT_OPTIONS: readonly BrowserLayoutOption[] = [
  {
    layout: 'full',
    label: 'Full screen',
    description: 'Covers the sidebar too — everything except the footer.',
    short: 'Full screen',
  },
  {
    layout: 'left',
    label: 'Side by side · browser left',
    description: 'Browser on the left, the workspace on the right.',
    short: 'Split, browser left',
  },
  {
    layout: 'right',
    label: 'Side by side · browser right',
    description: 'Workspace on the left, browser on the right.',
    short: 'Split, browser right',
  },
];

/** Index of a layout in {@link BROWSER_LAYOUT_OPTIONS}; 0 for anything unknown. */
export function browserLayoutIndex(layout: BrowserLayout): number {
  const index = BROWSER_LAYOUT_OPTIONS.findIndex((option) => option.layout === layout);
  return index === -1 ? 0 : index;
}

/**
 * The layout `steps` places along from `layout`, clamped rather than wrapped.
 *
 * Clamped because the three options are drawn as a row: an arrow press at the
 * end of a row that jumps back to the start reads as the selection having been
 * lost, not moved.
 */
export function stepBrowserLayout(layout: BrowserLayout, steps: number): BrowserLayout {
  const next = Math.min(
    BROWSER_LAYOUT_OPTIONS.length - 1,
    Math.max(0, browserLayoutIndex(layout) + steps),
  );
  return BROWSER_LAYOUT_OPTIONS[next]!.layout;
}

/**
 * Cycles through the layout options wrapping around.
 *
 * Used by the Mod+B switcher overlay: each press of B advances to the next
 * layout, wrapping from last back to first.
 */
export function cycleBrowserLayout(current: BrowserLayout, step = 1): BrowserLayout {
  const currentIndex = browserLayoutIndex(current);
  const count = BROWSER_LAYOUT_OPTIONS.length;
  const nextIndex = (currentIndex + step) % count;
  return BROWSER_LAYOUT_OPTIONS[nextIndex < 0 ? nextIndex + count : nextIndex]!.layout;
}
