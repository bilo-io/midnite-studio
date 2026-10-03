import {
  WIDGET_CATEGORIES,
  WIDGET_IDS,
  type WidgetCategory,
  type WidgetId,
  type WidgetSource,
} from './widget-ids';

/**
 * One table describing every widget.
 *
 * The board renders from this, the Add-widget menu lists from this, and the
 * availability gate reads from this — so a new widget is one row rather than an
 * edit in three places, and a widget cannot be renderable but unlistable (or
 * the reverse) because both answers come from the same object.
 *
 * The component itself is deliberately NOT here. Holding a `ReactNode` in the
 * registry would make this module un-importable from the store and from a unit
 * test, and the mapping from id to component is a single `switch` in the board
 * that TypeScript already checks for exhaustiveness.
 */
export type WidgetSpec = {
  id: WidgetId;
  title: string;
  /** One line, shown in the Add-widget menu. */
  description: string;
  source: WidgetSource;
  /** Section in the add-widget picker. */
  category: WidgetCategory;
  /** Smallest useful size, in grid units. Enforced by the grid's own resize. */
  minW: number;
  minH: number;
};

export const WIDGETS: Record<WidgetId, WidgetSpec> = {
  calendar: {
    id: 'calendar',
    title: 'Commit calendar',
    description: 'A day-cell heatmap of commits over the selected window.',
    source: 'stats',
    category: 'git',
    minW: 4,
    minH: 5,
  },
  contributors: {
    id: 'contributors',
    title: 'Contributors',
    description: 'Commits, insertions and deletions per author, most recent name.',
    source: 'stats',
    category: 'git',
    minW: 3,
    minH: 5,
  },
  activity: {
    id: 'activity',
    title: 'Recent activity',
    description: 'The newest commits, filtered by the board author filter.',
    source: 'stats',
    category: 'git',
    minW: 3,
    minH: 5,
  },
  pulls: {
    id: 'pulls',
    title: 'Open pull requests',
    description: 'Open PRs with review state and checks. Needs a GitHub remote.',
    source: 'forge',
    category: 'git',
    minW: 3,
    minH: 4,
  },
  issues: {
    id: 'issues',
    title: 'Open issues',
    description: 'Open issues with labels and age. Needs a GitHub remote.',
    source: 'forge',
    category: 'git',
    minW: 3,
    minH: 4,
  },
  runs: {
    id: 'runs',
    title: 'Latest workflow runs',
    description: 'Recent CI runs grouped by workflow. Needs a GitHub remote.',
    source: 'forge',
    category: 'git',
    minW: 3,
    minH: 4,
  },
  health: {
    id: 'health',
    title: 'Repo health',
    description: 'Branch counts, stale and merged branches, repository size.',
    source: 'stats',
    category: 'git',
    minW: 4,
    minH: 5,
  },
  'agent-roster': {
    id: 'agent-roster',
    title: 'Agent roster',
    description: 'Every agent, whether it is installed, and how many sessions it has running.',
    source: 'none',
    category: 'agents',
    minW: 3,
    minH: 4,
  },
  'live-sessions': {
    id: 'live-sessions',
    title: 'Live sessions',
    description: 'Running and asleep sessions, with what each agent is doing right now.',
    source: 'none',
    category: 'agents',
    minW: 3,
    minH: 4,
  },
  'recent-sessions': {
    id: 'recent-sessions',
    title: 'Recent sessions',
    description: 'The sessions you closed most recently, and how each one ended.',
    source: 'none',
    category: 'agents',
    minW: 3,
    minH: 4,
  },
  'agent-activity': {
    id: 'agent-activity',
    title: 'Per-agent activity',
    description: 'Live and past sessions tallied per agent.',
    source: 'none',
    category: 'agents',
    minW: 3,
    minH: 4,
  },
  'loop-runs': {
    id: 'loop-runs',
    title: 'Loop runs',
    description: 'Running loops and the latest runs from the loop ledger.',
    source: 'none',
    category: 'agents',
    minW: 3,
    minH: 4,
  },
  clock: {
    id: 'clock',
    title: 'Clock',
    description: 'The current time, to the second.',
    source: 'none',
    category: 'datetime',
    minW: 2,
    minH: 3,
  },
  date: {
    id: 'date',
    title: 'Date',
    description: 'Today\u2019s date and week number.',
    source: 'none',
    category: 'datetime',
    minW: 2,
    minH: 3,
  },
  scratchpad: {
    id: 'scratchpad',
    title: 'Scratchpad',
    description: 'Freeform notes that live on this dashboard.',
    source: 'none',
    category: 'productivity',
    minW: 3,
    minH: 4,
  },
};

/** Every widget, in the order the Add-widget menu lists them. */
export const ALL_WIDGETS: readonly WidgetSpec[] = WIDGET_IDS.map((id) => WIDGETS[id]);

/**
 * Whether a widget could ever say anything about this repository.
 *
 * A `forge` widget on a repo with no GitHub remote is not an empty tile — it is
 * a tile that will be empty forever, and the phase's rule is that those are
 * removed from the picker rather than rendered as an explanation. `both` is
 * kept as an arm even with no member today, because the merged activity feed
 * grows run and PR events the moment a forge exists and the gate for that is
 * "renders either way" rather than "needs a forge".
 */
export const isAvailable = (spec: WidgetSpec, hasForge: boolean): boolean =>
  spec.source !== 'forge' || hasForge;

/** Widgets a repo can offer at all — what the Add-widget menu chooses from. */
export const availableWidgets = (hasForge: boolean): readonly WidgetSpec[] =>
  ALL_WIDGETS.filter((spec) => isAvailable(spec, hasForge));

/**
 * The widgets that actually render, given a saved layout.
 *
 * Filtered on BOTH sides: an id the registry no longer knows (a widget removed
 * in a later version, still sitting in someone's persisted board) is dropped,
 * and so is one whose data source this repository does not have. Without the
 * first the board would crash on a stale key; without the second, switching
 * from a GitHub repo to a local one would leave three permanently empty tiles
 * behind.
 */
export const renderableWidgets = (
  layoutIds: readonly string[],
  hasForge: boolean,
): readonly WidgetSpec[] =>
  layoutIds
    .map((id) => (id in WIDGETS ? WIDGETS[id as WidgetId] : undefined))
    .filter((spec): spec is WidgetSpec => spec !== undefined && isAvailable(spec, hasForge));

/** Whether any renderable widget needs the expensive `--numstat` half. */
export const needsChurn = (layoutIds: readonly string[]): boolean =>
  layoutIds.includes('contributors');

/**
 * The add-widget picker's sections: widgets grouped by category in
 * `WIDGET_CATEGORIES` order, filtered by a case-insensitive match on title and
 * description (midnite's `groupWidgetCatalog`). Empty groups are dropped, so a
 * search never leaves a bare heading behind.
 */
export const groupWidgets = (
  specs: readonly WidgetSpec[],
  query: string,
): { category: WidgetCategory; label: string; specs: WidgetSpec[] }[] => {
  const needle = query.trim().toLowerCase();
  const matches = (spec: WidgetSpec): boolean =>
    needle === '' ||
    spec.title.toLowerCase().includes(needle) ||
    spec.description.toLowerCase().includes(needle);
  return WIDGET_CATEGORIES.map(({ key, label }) => ({
    category: key,
    label,
    specs: specs.filter((spec) => spec.category === key && matches(spec)),
  })).filter((group) => group.specs.length > 0);
};
