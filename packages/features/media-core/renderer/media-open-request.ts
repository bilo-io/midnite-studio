import type { MediaOpenKind, MediaOpenRequest } from '@midnite/studio-frame';
import { create } from 'zustand';

/**
 * Phase 112 Theme E — the one-shot "show this" request for the media tabs that had no store of their
 * own (doc, image, video, audio, map, game), the same pattern the Models / Terrain / Sprites tabs
 * already use (`use-*-agent-events.ts`). The reveal engine (or an app-level listener for an agent's
 * `music_open` / `map_goto` / `game_open`) writes it; the tab consumes it on mount and on change,
 * and clears it only when the request is for that tab, so a request survives the tab not being
 * mounted yet. `n` makes a repeat request for the same item still a change.
 *
 * The app-level listeners that turn an agent's `music_open` / `map_goto` / `game_open` into a
 * reveal stay with the app (Studio's `features/media/media-open-request.ts`): they reach its
 * companion and repository state.
 */
export type { MediaOpenKind, MediaOpenRequest };

type MediaOpenStore = {
  request: MediaOpenRequest | null;
  open: (request: Omit<MediaOpenRequest, 'n'>) => void;
  clear: () => void;
};

export const useMediaOpenRequest = create<MediaOpenStore>((set, get) => ({
  request: null,
  open: (request) => set({ request: { ...request, n: (get().request?.n ?? 0) + 1 } }),
  clear: () => set({ request: null }),
}));

/** The request addressed to `media` in `repoId` (any repo for a game — the games list is global), else null. */
export function useMediaOpenFor(media: MediaOpenKind, repoId: string | null): MediaOpenRequest | null {
  const request = useMediaOpenRequest((s) => s.request);
  if (!request || request.media !== media) return null;
  if (media !== 'game' && request.repoId !== repoId) return null;
  return request;
}
