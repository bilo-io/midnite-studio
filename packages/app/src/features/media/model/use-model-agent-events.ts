import type { ModelOpenEvent } from '@midnite/studio-shared';
import { useEffect } from 'react';
import { create } from 'zustand';

import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';

/**
 * `model_open` (an agent over MCP) asking the window to show a model.
 *
 * The listener lives with the app shell, not the Models tab: the tab may not be
 * mounted when the agent calls, and it is the listener that brings it up. The
 * request waits in this tiny store for the tab to consume — `n` makes a repeat
 * request for the same model still a change.
 */
type OpenRequestStore = {
  request: (ModelOpenEvent & { n: number }) | null;
  open: (event: ModelOpenEvent) => void;
  clear: () => void;
};

export const useModelOpenRequest = create<OpenRequestStore>((set, get) => ({
  request: null,
  open: (event) => set({ request: { ...event, n: (get().request?.n ?? 0) + 1 } }),
  clear: () => set({ request: null }),
}));

/** Mounted once by the app shell (main window only). */
export function useModelOpenListener(): void {
  useEffect(() => {
    if ((bridge()?.windowRole ?? 'main') !== 'main') return;
    const off = bridge()?.media.model.onOpen((event) => {
      const ui = useUiStore.getState();
      if (ui.selectedRepoId !== event.repoId) ui.selectRepo(event.repoId);
      useModelOpenRequest.getState().open(event);
      ui.openMedia('model');
    });
    return () => off?.();
  }, []);
}
