import type { ModelOpenEvent } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * `model_open` (an agent over MCP) asking the window to show a model.
 *
 * The listener lives with the app shell, not the Models tab: the tab may not be mounted when the agent
 * calls, and it is the listener that brings it up (`compose/media-model/use-model-open-listener.ts` in
 * Studio, which also selects the repo and opens Media). The request waits in this tiny store for the tab
 * to consume — `n` makes a repeat request for the same model still a change.
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
