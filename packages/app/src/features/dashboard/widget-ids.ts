/**
 * Widget identity and the default board, with no React in sight.
 *
 * Split from `widget-registry.tsx` so `dashboard-store.ts` can import the ids
 * and the default layout without pulling seven widget components — and their
 * charts, their avatars and their query hooks — into the store's module graph.
 * A store that imported the components would be a store no unit test could load
 * without a DOM.
 */

/** The seven panels the original (single) dashboard carried — now the "Git" dashboard's set. */
export const GIT_WIDGET_IDS = [
  'calendar',
  'contributors',
  'activity',
  'pulls',
  'issues',
  'runs',
  'health',
] as const;

/** Cards over the Agents section and the Sessions view — the "Agents" dashboard's set. */
export const AGENT_WIDGET_IDS = [
  'agent-roster',
  'live-sessions',
  'recent-sessions',
  'agent-activity',
  'loop-runs',
] as const;

/** Repository-independent utility cards, ported from midnite's catalogue. */
export const GENERAL_WIDGET_IDS = ['clock', 'date', 'scratchpad'] as const;

export const WIDGET_IDS = [
  ...GIT_WIDGET_IDS,
  ...AGENT_WIDGET_IDS,
  ...GENERAL_WIDGET_IDS,
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
 * explanation of why it is empty. `none` needs no repository at all (the
 * agent cards and the utility cards).
 */
export type WidgetSource = 'stats' | 'forge' | 'both' | 'none';

/**
 * The section a widget is filed under in the add-widget picker; order is
 * display order. Mirrors midnite's `WIDGET_CATEGORIES`.
 */
export const WIDGET_CATEGORIES = [
  { key: 'git', label: 'Git' },
  { key: 'agents', label: 'Agents & sessions' },
  { key: 'datetime', label: 'Date & time' },
  { key: 'productivity', label: 'Productivity' },
] as const;
export type WidgetCategory = (typeof WIDGET_CATEGORIES)[number]['key'];

/** The grid is twelve columns wide, the convention `react-grid-layout` ships. */
export const GRID_COLS = 12;

/** Row height in pixels. Tile height is `h * (ROW_HEIGHT + MARGIN) - MARGIN`. */
export const ROW_HEIGHT = 28;
export const GRID_MARGIN: [number, number] = [12, 12];

/** Footprint a widget gets when it is added to a board, in grid units. */
export const WIDGET_DEFAULT_SIZE: Record<WidgetId, { w: number; h: number }> = {
  calendar: { w: 4, h: 8 },
  contributors: { w: 4, h: 8 },
  activity: { w: 4, h: 8 },
  pulls: { w: 4, h: 7 },
  issues: { w: 4, h: 7 },
  runs: { w: 4, h: 7 },
  health: { w: 12, h: 7 },
  'agent-roster': { w: 4, h: 8 },
  'live-sessions': { w: 4, h: 8 },
  'recent-sessions': { w: 4, h: 8 },
  'agent-activity': { w: 6, h: 7 },
  'loop-runs': { w: 6, h: 7 },
  clock: { w: 3, h: 5 },
  date: { w: 3, h: 5 },
  scratchpad: { w: 4, h: 7 },
};

/**
 * The board a repository shows before anyone has moved anything.
 *
 * Ordered so the two widgets that always have something to say — the calendar
 * and the contributors — are the first thing on the page, and the three that
 * depend on a forge sit below them where their absence leaves no hole at the
 * top of an otherwise-full board.
 */
export const DEFAULT_LAYOUT = [
  { i: 'calendar' as const, x: 0, y: 0, w: 4, h: 8 },
  { i: 'contributors' as const, x: 4, y: 0, w: 4, h: 8 },
  { i: 'activity' as const, x: 8, y: 0, w: 4, h: 8 },
  { i: 'pulls' as const, x: 0, y: 8, w: 4, h: 7 },
  { i: 'issues' as const, x: 4, y: 8, w: 4, h: 7 },
  { i: 'runs' as const, x: 8, y: 8, w: 4, h: 7 },
  { i: 'health' as const, x: 0, y: 15, w: 12, h: 7 },
];

/**
 * The "Agents" dashboard's seed: the roster and what is running beside it,
 * then the history, the per-agent tally and the loop ledger.
 */
export const AGENTS_LAYOUT = [
  { i: 'agent-roster' as const, x: 0, y: 0, w: 4, h: 8 },
  { i: 'live-sessions' as const, x: 4, y: 0, w: 4, h: 8 },
  { i: 'recent-sessions' as const, x: 8, y: 0, w: 4, h: 8 },
  { i: 'agent-activity' as const, x: 0, y: 8, w: 6, h: 7 },
  { i: 'loop-runs' as const, x: 6, y: 8, w: 6, h: 7 },
];

/** A freshly created dashboard: just the time and date, like midnite's new tab. */
export const NEW_DASHBOARD_LAYOUT = [
  { i: 'clock' as const, x: 0, y: 0, w: 3, h: 5 },
  { i: 'date' as const, x: 3, y: 0, w: 3, h: 5 },
];
