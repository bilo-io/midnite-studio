/**
 * Widget identity and the default board, with no React in sight.
 *
 * Split from `widget-registry.tsx` so `dashboard-store.ts` can import the ids
 * and the default layout without pulling seven widget components — and their
 * charts, their avatars and their query hooks — into the store's module graph.
 * A store that imported the components would be a store no unit test could load
 * without a DOM.
 */

export const WIDGET_IDS = [
  'calendar',
  'contributors',
  'activity',
  'pulls',
  'issues',
  'runs',
  'health',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export const isWidgetId = (value: string): value is WidgetId =>
  (WIDGET_IDS as readonly string[]).includes(value);

/**
 * What a widget needs before it can say anything.
 *
 * `stats` is always available — it is a local history traversal. `forge` needs
 * a GitHub remote, which is why the two are distinguished at all: a widget
 * declaring `forge` is removed from the picker entirely on a repo with no
 * GitHub remote, rather than rendering a tile whose only content is an
 * explanation of why it is empty.
 */
export type WidgetSource = 'stats' | 'forge' | 'both';

/** The grid is twelve columns wide, the convention `react-grid-layout` ships. */
export const GRID_COLS = 12;

/** Row height in pixels. Tile height is `h * (ROW_HEIGHT + MARGIN) - MARGIN`. */
export const ROW_HEIGHT = 28;
export const GRID_MARGIN: [number, number] = [12, 12];

/**
 * The board a repository shows before anyone has moved anything.
 *
 * Ordered so the two widgets that always have something to say — the calendar
 * and the contributors — are the first thing on the page, and the three that
 * depend on a forge sit below them where their absence leaves no hole at the
 * top of an otherwise-full board.
 */
export const DEFAULT_LAYOUT = [
  { i: 'calendar' as const, x: 0, y: 0, w: 12, h: 6 },
  { i: 'contributors' as const, x: 0, y: 6, w: 6, h: 8 },
  { i: 'activity' as const, x: 6, y: 6, w: 6, h: 8 },
  { i: 'pulls' as const, x: 0, y: 14, w: 4, h: 7 },
  { i: 'issues' as const, x: 4, y: 14, w: 4, h: 7 },
  { i: 'runs' as const, x: 8, y: 14, w: 4, h: 7 },
  { i: 'health' as const, x: 0, y: 21, w: 12, h: 7 },
];
