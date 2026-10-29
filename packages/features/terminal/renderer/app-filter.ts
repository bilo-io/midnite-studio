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
  /** Whether the first `suitePrefs.get` has answered (or there is none) — the panel's auto-open waits on it. */
  loaded: boolean;
};

const useAppFilterStore = create<AppFilterState>(() => ({ stored: null, loaded: false }));

let subscribed = false;

function applySnapshot(snapshot: SuitePrefsSnapshot) {
  useAppFilterStore.setState({
    stored: snapshot.stored.includes('terminal') ? snapshot.prefs.terminal.showAllApps : null,
    loaded: true,
  });
}

function ensureSubscribed() {
  if (subscribed) return;
  const api = bridge()?.suitePrefs;
  if (!api) {
    useAppFilterStore.setState({ loaded: true });
    return;
  }
  subscribed = true;
  api.get().then(applySnapshot, () => useAppFilterStore.setState({ loaded: true }));
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

/**
 * Whether the stored choice has been read. Until it has, the filter runs on the
 * host default, which can hide sessions the user asked to see — so nothing that
 * acts on "this app has no sessions" should act yet.
 */
export function useAppFilterLoaded(): boolean {
  useEffect(ensureSubscribed, []);
  return useAppFilterStore((s) => s.loaded);
}

/** Whether `session` lists in `appId`'s window. */
export function visibleInApp(session: Pick<TerminalSession, 'appId'>, appId: SuiteAppId, showAll: boolean): boolean {
  return showAll || sessionAppId(session) === appId;
}

/** Test seam: forget the subscription and the cached choice. */
export function __resetAppFilter() {
  subscribed = false;
  useAppFilterStore.setState({ stored: null, loaded: false });
}
