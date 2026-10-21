/**
 * v33 -> v34 (Phase 113 Theme A): the Phase 83 third-party apps rail became
 * `web-apps`, so "app" can mean one of the twelve Midnite apps without a
 * collision. The persisted fields and the Settings page id moved with it:
 *
 *   enabledApps      -> enabledWebApps
 *   appDiscardIdle   -> webAppDiscardIdle
 *   lastOpenedAppId  -> lastOpenedWebAppId
 *   detachedApps     -> detachedWebApps
 *   settingsPage 'apps' -> 'web-apps'
 *
 * An existing new-name value wins over an old-name one, so a blob a newer build
 * already touched is never clobbered. The app ids inside (`spotify`,
 * `google-calendar`, `youtube`) and the `persist:app-<id>` session partitions
 * are unchanged — a rename of the field must never sign anyone out.
 *
 * Mutates and returns the raw blob; exported for its test.
 */
const FIELD_RENAMES = [
  ['enabledApps', 'enabledWebApps'],
  ['appDiscardIdle', 'webAppDiscardIdle'],
  ['lastOpenedAppId', 'lastOpenedWebAppId'],
  ['detachedApps', 'detachedWebApps'],
] as const;

export function migrateAppsToWebApps(state: Record<string, unknown>): Record<string, unknown> {
  for (const [from, to] of FIELD_RENAMES) {
    if (from in state) {
      if (!(to in state)) state[to] = state[from];
      delete state[from];
    }
  }
  if (state.settingsPage === 'apps') state.settingsPage = 'web-apps';
  return state;
}
