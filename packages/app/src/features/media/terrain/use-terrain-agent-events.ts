import type { TerrainOpenEvent } from '@midnite/studio-shared';
import { useEffect } from 'react';
import { create } from 'zustand';

import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';

/**
 * `terrain_open` (an agent over MCP) asking the window to show a terrain — the Models pattern
 * (`use-model-agent-events.ts`): the listener lives with the app shell because the tab may not be
 * mounted when the agent calls, and it is the listener that brings the tab up. The request waits
 * here for the tab to consume; `n` makes a repeat request for the same terrain still a change.
 */
type OpenRequestStore = {
  request: (TerrainOpenEvent & { n: number }) | null;
  open: (event: TerrainOpenEvent) => void;
  clear: () => void;
};

export const useTerrainOpenRequest = create<OpenRequestStore>((set, get) => ({
  request: null,
  open: (event) => set({ request: { ...event, n: (get().request?.n ?? 0) + 1 } }),
  clear: () => set({ request: null }),
}));

/** Mounted once by the app shell (main window only). */
export function useTerrainOpenListener(): void {
  useEffect(() => {
    if ((bridge()?.windowRole ?? 'main') !== 'main') return;
    const off = bridge()?.media.terrain.onOpen((event) => {
      const ui = useUiStore.getState();
      if (ui.selectedRepoId !== event.repoId) ui.selectRepo(event.repoId);
      useTerrainOpenRequest.getState().open(event);
      ui.openMedia('terrain');
    });
    return () => off?.();
  }, []);
}
