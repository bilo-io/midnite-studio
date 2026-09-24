import type { CommandId, NavVisibility, ViewId } from '@midnite/studio-shared';

export type { NavVisibility };

/**
 * Every view that can appear as a rail row, in render order — the same
 * sequence `app.tsx`'s four nav lists concatenate. Order is owned elsewhere;
 * this list is only for settings labels and visibility toggles.
 */
export const RAIL_VIEW_IDS: readonly ViewId[] = [
  'dashboard',
  'notes',
  'knowledge',
  'sessions',
  'files',
  'search',
  'optimizer',
  'tests',
  'database',
  'apiClient',
  'issues',
  'projects',
  'graph',
  'changes',
  'actions',
  'reviews',
  'history',
  'councils',
  'workflows',
  'video',
  'models',
];

/** Whether a view's rail row is shown. Landing and Settings are never gated here. */
export function isNavViewVisible(navVisibility: NavVisibility, view: ViewId): boolean {
  if (view === 'landing' || view === 'settings') return true;
  return navVisibility[view] !== false;
}

/**
 * Commands that navigate straight to a rail view. Used to disable chords and
 * palette rows when the destination is hidden in Settings.
 */
export const COMMAND_NAV_VIEW: Partial<Record<CommandId, ViewId>> = {
  'search.open': 'search',
  'view.graph': 'graph',
  'graph.focus': 'graph',
  'view.files': 'files',
  'view.issues': 'issues',
  'view.video': 'video',
  'view.models': 'models',
  'view.apiClient': 'apiClient',
  'status.focus': 'changes',
  'workflow.run': 'workflows',
};

export function navCommandDisabledReason(
  navVisibility: NavVisibility,
  commandId: CommandId,
): string | undefined {
  const view = COMMAND_NAV_VIEW[commandId];
  if (view === undefined || isNavViewVisible(navVisibility, view)) return undefined;
  return 'Hidden in Settings ▸ Sidebar';
}
