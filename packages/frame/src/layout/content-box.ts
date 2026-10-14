/*
  Moved out of \`app.tsx\` (Phase 113 Theme C) — the first layout pieces the
  frame owns. Every app's window wears the same title bar, so every app's
  content box holds the same height clear beneath it.
*/

/**
 * The app's box: the whole viewport, with the title bar's height held clear at
 * the top. `--titlebar-h` is published by <TitleBar> while mounted and is
 * absent in a framed window, where the fallback of 0 is exactly right.
 *
 * PADDING, not a top margin — the distinction is the whole of a bug that made
 * the app unusable. A margin here collapses straight out through `<main>` and
 * `#root`, both of which are plain blocks with no border or padding of their
 * own, so it stops being space INSIDE the page and becomes the page's own
 * offset: a 100vh document sitting 48px down, i.e. 48px taller than the window.
 *
 * `body { overflow: hidden }` hides that from the wheel but not from the
 * platform. `focus()` and `scrollIntoView()` scroll an overflow-hidden viewport
 * quite happily, and clicking into a terminal focuses xterm's hidden textarea —
 * so one click scrolled the whole app up under the fixed title bar, where the
 * bar's own controls then answered every click meant for what was behind them.
 * A maximized terminal, whose header is the topmost thing in the column, lost
 * its restore button that way and could not be put back. Nothing scrolled it
 * home either: an overflow-hidden viewport takes no user gesture.
 *
 * Padding is inside the border box, so this box is exactly 100vh however tall
 * the bar is, and the document has nothing left to scroll.
 */
export const CONTENT_BOX = {
  height: '100vh',
  paddingTop: 'var(--titlebar-h, 0px)',
} as const;
