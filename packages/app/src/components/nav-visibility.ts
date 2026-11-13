import {
  disabledViews,
  FEATURE_OFF_REASON,
  isCommandOff,
  isViewOff,
  type CommandId,
  type FeatureToggleId,
  type NavVisibility,
  type ViewId,
} from '@midnite/studio-shared';

export type { NavVisibility };

/**
 * Every view that can appear as a rail row, in render order — the same
 * sequence `app.tsx`'s four nav lists concatenate. Order is owned elsewhere;
 * this list is only for settings labels and visibility toggles.
 */
export const RAIL_VIEW_IDS: readonly ViewId[] = [
  'dashboard',
  'books',
  'notes',
  'chats',
  'sessions',
  'knowledge',
  'files',
  'search',
  'optimizer',
  'monitor',
  'vault',
  'capture',
  'vanguard',
  'tests',
  'database',
  'apiClient',
  'tasks',
  'graph',
  'actions',
  'reviews',
  'history',
  'councils',
  'workflows',
  'media',
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
  'view.issues': 'tasks',
  'view.media': 'media',
  'view.video': 'media',
  'view.models': 'models',
  'view.chats': 'chats',
  'view.apiClient': 'apiClient',
  'status.focus': 'graph',
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

/**
 * The rail's visibility once switched-off features are folded in (Phase 135 Theme C): a view whose feature is
 * off is hidden whatever the Sidebar page says, and the user's own choice comes back when the feature does.
 */
export function effectiveNavVisibility(navVisibility: NavVisibility, disabled: readonly FeatureToggleId[]): NavVisibility {
  if (disabled.length === 0) return navVisibility;
  const next: NavVisibility = { ...navVisibility };
  for (const view of disabledViews(disabled)) next[view] = false;
  return next;
}

/** Why a command is off because its feature is — its own, or the view it navigates to. */
export function featureCommandOffReason(disabled: readonly FeatureToggleId[], commandId: CommandId): string | undefined {
  if (disabled.length === 0) return undefined;
  if (isCommandOff(disabled, commandId)) return FEATURE_OFF_REASON;
  const view = COMMAND_NAV_VIEW[commandId];
  return view !== undefined && isViewOff(disabled, view) ? FEATURE_OFF_REASON : undefined;
}

type GatedEntry = { enabled: boolean; disabledReason?: string; run: () => void };

/**
 * A command runtime with every switched-off feature's commands disabled, so the chord does nothing and the
 * palette (which omits a row disabled for {@link FEATURE_OFF_REASON}) does not offer it.
 */
export function withFeatureToggles<R extends Record<CommandId, GatedEntry>>(disabled: readonly FeatureToggleId[], runtime: R): R {
  if (disabled.length === 0) return runtime;
  const next = { ...runtime };
  for (const id of Object.keys(runtime) as CommandId[]) {
    const reason = featureCommandOffReason(disabled, id);
    if (reason !== undefined) next[id] = { ...runtime[id], enabled: false, disabledReason: reason } as R[CommandId];
  }
  return next;
}
