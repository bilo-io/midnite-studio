import { create } from 'zustand';

/**
 * Transient requests to open the setup overlay (Phase 98 Theme A) — the
 * `setup.open` command and Settings ▸ Accounts' "Resume setup". Never
 * persisted: a request is "open it now", and replaying one on the next launch
 * would raise a full-window overlay nobody asked for.
 *
 * The first-run auto-open is NOT here — it is derived from the persisted
 * `setupState` (`isFirstRun`), so a profile that has never finished or left
 * setup opens it without anything having to ask.
 *
 * Its own tiny store rather than more fields on `ui-store.ts`, for the reason
 * `account-switcher-store.ts` gives: these have exactly one reader.
 */
type SetupRequests = {
  /** Whether something asked for the overlay this session. */
  requested: boolean;
  /** The page to open at; `null` starts at the intro. */
  startPageId: string | null;
  openSetup: (startPageId?: string | null) => void;
  closeSetup: () => void;
};

export const useSetupStore = create<SetupRequests>((set) => ({
  requested: false,
  startPageId: null,
  openSetup: (startPageId = null) => set({ requested: true, startPageId }),
  closeSetup: () => set({ requested: false, startPageId: null }),
}));
