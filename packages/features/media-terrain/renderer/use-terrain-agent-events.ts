import type { TerrainOpenEvent } from '@midnite/studio-shared';
import { bridge } from '@midnite/studio-frame';
import { useEffect } from 'react';
import { create } from 'zustand';

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

/**
 * Mounted once by the app shell (main window only). Posts the request for the tab, then calls `show` —
 * the one thing a feature cannot do: select the repository and bring the Terrain tab up (Studio's `ui-store`).
 */
export function useTerrainOpenListener(show: (event: TerrainOpenEvent) => void): void {
  useEffect(() => {
    if ((bridge()?.windowRole ?? 'main') !== 'main') return;
    const off = bridge()?.media.terrain.onOpen((event) => {
      useTerrainOpenRequest.getState().open(event);
      show(event);
    });
    return () => off?.();
  }, [show]);
}
