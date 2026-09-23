import { create } from 'zustand';

import { useUiStore } from '../store/ui-store';

/**
 * Transient requests aimed at the account switcher and Settings ▸ Accounts
 * (Phase 90 Theme L). Never persisted: a request is "do this now", and
 * replaying one on the next launch would open a menu or steal focus nobody
 * asked for.
 *
 * The two differ in shape on purpose. `openRequest` is a nonce: the switcher
 * is already mounted when it is asked, so it reacts to a change. The add-form
 * request is a pending flag the page consumes: it is usually made from
 * another view, before `AccountsPage` has mounted to see any change at all.
 *
 * Its own tiny store rather than two more fields on `ui-store.ts`, whose
 * every key is either persisted or view state the rest of the app reads;
 * these two have exactly one reader each.
 */
type AccountSwitcherRequests = {
  /** Bumped by `account.switcher.open`; the mounted switcher opens its menu. */
  openRequest: number;
  /** Set by "Add account…"; `AccountsPage` focuses its add form and clears it. */
  addFormPending: boolean;
  requestOpen: () => void;
  requestAddForm: () => void;
  consumeAddForm: () => void;
};

export const useAccountSwitcherStore = create<AccountSwitcherRequests>((set) => ({
  openRequest: 0,
  addFormPending: false,
  requestOpen: () => set((s) => ({ openRequest: s.openRequest + 1 })),
  requestAddForm: () => set({ addFormPending: true }),
  consumeAddForm: () => set({ addFormPending: false }),
}));

/**
 * Navigate to Settings ▸ Accounts — the switcher's "Manage accounts…", and
 * with `focusAddForm` its "Add account…" and zero-account placeholder too.
 */
export function openAccountsSettings({ focusAddForm = false }: { focusAddForm?: boolean } = {}) {
  const ui = useUiStore.getState();
  ui.setActiveView('settings');
  ui.setSettingsPage('accounts');
  if (focusAddForm) useAccountSwitcherStore.getState().requestAddForm();
}
