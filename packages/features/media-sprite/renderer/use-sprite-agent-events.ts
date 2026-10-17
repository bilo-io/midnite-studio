import type { SpriteOpenEvent } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * `sprite_open` (an agent over MCP, Phase 106 Theme K) asking the window to show an asset — the Terrain
 * pattern. The request lives here; the listener that hears `mediaSpriteOpen` and brings the Sprites tab
 * up belongs to the composing app (it owns "which repository" and "which tab"), and posts to this store.
 * `n` makes a repeat request a change.
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
