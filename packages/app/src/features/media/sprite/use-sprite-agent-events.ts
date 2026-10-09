import type { SpriteOpenEvent } from '@midnite/studio-shared';
import { useEffect } from 'react';
import { create } from 'zustand';

import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';

/**
 * `sprite_open` (an agent over MCP, Phase 106 Theme K) asking the window to show an asset — the Terrain
 * pattern: the listener lives with the app shell because the Sprites tab may not be mounted when the
 * agent calls, and it is the listener that brings the tab up. `n` makes a repeat request a change.
 */
type OpenRequestStore = {
  request: (SpriteOpenEvent & { n: number }) | null;
  open: (event: SpriteOpenEvent) => void;
  clear: () => void;
};

export const useSpriteOpenRequest = create<OpenRequestStore>((set, get) => ({
  request: null,
  open: (event) => set({ request: { ...event, n: (get().request?.n ?? 0) + 1 } }),
  clear: () => set({ request: null }),
}));

/** Mounted once by the app shell (main window only). */
export function useSpriteOpenListener(): void {
  useEffect(() => {
    if ((bridge()?.windowRole ?? 'main') !== 'main') return;
    const off = bridge()?.media.sprite.onOpen((event) => {
      const ui = useUiStore.getState();
      if (ui.selectedRepoId !== event.repoId) ui.selectRepo(event.repoId);
      useSpriteOpenRequest.getState().open(event);
      ui.openMedia('sprite');
    });
    return () => off?.();
  }, []);
}
