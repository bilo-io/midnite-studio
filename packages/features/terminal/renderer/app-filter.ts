import { useEffect } from 'react';
import { create } from 'zustand';

import { bridge } from '@midnite/studio-frame';
import { sessionAppId, type SuitePrefsSnapshot, type SuiteAppId, type TerminalSession } from '@midnite/studio-shared';

import { useTerminalHost } from './host';

/**
 * Whose sessions the list shows (Phase 123 Theme E, Decision 1): each app its
 * own by default, every app's with "Show all apps" on. The choice is the
 * suite-prefs `terminal.showAllApps` field, so it follows the user from app
 * to app; until someone has toggled it (`stored` does not name the group) each
 * app falls back to its host's own default — Studio, the superset, shows all.
 */
type AppFilterState = {
  /** The persisted choice, or `null` while the file holds no `terminal` group. */
  stored: boolean | null;
};

const useAppFilterStore = create<AppFilterState>(() => ({ stored: null }));

let subscribed = false;

function applySnapshot(snapshot: SuitePrefsSnapshot) {
  useAppFilterStore.setState({
    stored: snapshot.stored.includes('terminal') ? snapshot.prefs.terminal.showAllApps : null,
  });
}

function ensureSubscribed() {
  if (subscribed) return;
  const api = bridge()?.suitePrefs;
  if (!api) return;
  subscribed = true;
  api.get().then(applySnapshot, () => undefined);
  api.onChanged(applySnapshot);
}

/** `[showAll, setShowAll]` for this window. */
export function useShowAllApps(): [boolean, (showAll: boolean) => void] {
  const host = useTerminalHost();
  useEffect(ensureSubscribed, []);
  const stored = useAppFilterStore((s) => s.stored);
  const set = (showAll: boolean) => {
    useAppFilterStore.setState({ stored: showAll });
    void bridge()?.suitePrefs.set({ key: 'terminal', value: { showAllApps: showAll } });
  };
  return [stored ?? host.showAllAppsByDefault, set];
}

/** Whether `session` lists in `appId`'s window. */
export function visibleInApp(session: Pick<TerminalSession, 'appId'>, appId: SuiteAppId, showAll: boolean): boolean {
  return showAll || sessionAppId(session) === appId;
}

/** Test seam: forget the subscription and the cached choice. */
export function __resetAppFilter() {
  subscribed = false;
  useAppFilterStore.setState({ stored: null });
}
