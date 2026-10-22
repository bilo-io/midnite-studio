import type { VanguardTab } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * Which tab the Vanguard view shows. A store, not component state, so a `midnite-studio://view?id=vanguard&tab=`
 * link (the launcher tile's three features) can land on a tab before the view has mounted.
 */
export type VanguardUiState = {
  tab: VanguardTab;
  setTab: (tab: VanguardTab) => void;
};

export const useVanguardUi = create<VanguardUiState>((set) => ({
  tab: 'findings',
  setTab: (tab) => set({ tab }),
}));
