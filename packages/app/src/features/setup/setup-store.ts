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
  /** The page to open at; `null` starts at the intro (or resumes, below). */
  startPageId: string | null;
  /**
   * Open at wherever setup was left (Phase 98 Theme C — the FAB's Resume
   * setup leaf). The frame works out the page itself (`resumePageId`), so
   * this store — and the quick-access menu that writes it — never has to
   * import the page registry and its components.
   */
  resume: boolean;
  openSetup: (startPageId?: string | null) => void;
  resumeSetup: () => void;
  /**
   * Keep the overlay mounted after its gate has closed. X and Skip write
   * `dismissedAt` at once, which ends `isFirstRun` — without this the frame
   * would unmount mid-handoff, before the arrow had pointed at anything.
   */
  holdOpen: () => void;
  closeSetup: () => void;
};

export const useSetupStore = create<SetupRequests>((set) => ({
  requested: false,
  startPageId: null,
  resume: false,
  openSetup: (startPageId = null) => set({ requested: true, startPageId, resume: false }),
  resumeSetup: () => set({ requested: true, startPageId: null, resume: true }),
  holdOpen: () => set({ requested: true }),
  closeSetup: () => set({ requested: false, startPageId: null, resume: false }),
}));
