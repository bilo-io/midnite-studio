import { WIDGET_IDS, type WidgetId, type WidgetSource } from './widget-ids';

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
    minW: 4,
    minH: 5,
  },
  contributors: {
    id: 'contributors',
    title: 'Contributors',
    description: 'Commits, insertions and deletions per author, most recent name.',
    source: 'stats',
    minW: 3,
    minH: 5,
  },
  activity: {
    id: 'activity',
    title: 'Recent activity',
    description: 'The newest commits, filtered by the board author filter.',
    source: 'stats',
    minW: 3,
    minH: 5,
  },
  pulls: {
    id: 'pulls',
    title: 'Open pull requests',
    description: 'Open PRs with review state and checks. Needs a GitHub remote.',
    source: 'forge',
    minW: 3,
    minH: 4,
  },
  issues: {
    id: 'issues',
    title: 'Open issues',
    description: 'Open issues with labels and age. Needs a GitHub remote.',
    source: 'forge',
    minW: 3,
    minH: 4,
  },
  runs: {
    id: 'runs',
    title: 'Latest workflow runs',
    description: 'Recent CI runs grouped by workflow. Needs a GitHub remote.',
    source: 'forge',
    minW: 3,
    minH: 4,
  },
  health: {
    id: 'health',
    title: 'Repo health',
    description: 'Branch counts, stale and merged branches, repository size.',
    source: 'stats',
    minW: 4,
    minH: 5,
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
  spec.source === 'stats' || spec.source === 'both' || hasForge;

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
