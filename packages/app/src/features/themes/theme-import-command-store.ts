import { create } from 'zustand';

/**
 * The imperative seam between the global `theme.import` command (Theme F) and
 * the Appearance settings page's own hidden file input — the same shape
 * `workflow-run-command-store.ts` uses for `workflow.run` and
 * `commit-box-store.ts` uses for `status.commit`.
 *
 * The Palette accordion (mounted only while the Appearance page is open)
 * registers a handle that opens its own file picker; no handle means the
 * command just navigates there and the user clicks Import themselves, which
 * is what lets `theme.import` stay `enabled: true` unconditionally rather
 * than needing new state to know whether the page is mounted.
 */
export type ThemeImportHandle = {
  run: () => void;
};

type ThemeImportCommandState = {
  handle: ThemeImportHandle | null;
  register: (handle: ThemeImportHandle) => void;
  /** A no-op unless `handle` is still the one being unregistered — guards
   * against a fast remount unregistering the newer handle that replaced it. */
  unregister: (handle: ThemeImportHandle) => void;
};

export const useThemeImportCommandStore = create<ThemeImportCommandState>()((set, get) => ({
  handle: null,
  register: (handle) => set({ handle }),
  unregister: (handle) => {
    if (get().handle === handle) set({ handle: null });
  },
}));
