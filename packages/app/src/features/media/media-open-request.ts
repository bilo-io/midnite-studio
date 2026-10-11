import type { MediaKind } from '@midnite/studio-shared';
import { useEffect } from 'react';
import { create } from 'zustand';

import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { revealResource } from '../companion/reveal/reveal';

/**
 * Phase 112 Theme E — the one-shot "show this" request for the media tabs that had no store of their
 * own (doc, image, video, audio, map, game), the same pattern the Models / Terrain / Sprites tabs
 * already use (`use-*-agent-events.ts`). The reveal engine (or an app-level listener for an agent's
 * `music_open` / `map_goto` / `game_open`) writes it; the tab consumes it on mount and on change,
 * and clears it only when the request is for that tab, so a request survives the tab not being
 * mounted yet. `n` makes a repeat request for the same item still a change.
 */
export type MediaOpenKind = Extract<MediaKind, 'doc' | 'image' | 'video' | 'audio' | 'map' | 'game'>;

export type MediaOpenRequest = {
  repoId: string;
  media: MediaOpenKind;
  /** The project (doc/image/audio/map/video), or the game id for `game`. */
  project: string;
  /** A file within the project (a song name for audio, an iteration filename for video). */
  path?: string;
  n: number;
};

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

/**
 * Mounted once by the app shell (main window only). An agent's `music_open`, `map_goto` and
 * `game_open` used to be heard only by a mounted tab, so they did nothing from another view; they
 * now go through the same reveal as everything else, which switches repo, view and tab first.
 */
export function useMediaOpenListeners(): void {
  useEffect(() => {
    if ((bridge()?.windowRole ?? 'main') !== 'main') return;
    const api = bridge();
    const offs = [
      api?.media.music.onOpen?.((e) => {
        void revealResource({ kind: 'media', repoId: e.repoId, media: 'audio', project: e.project, path: e.name }, { caller: 'mcp' });
      }),
      api?.media.map.onOpen((e) => {
        void revealResource({ kind: 'media', repoId: e.repoId, media: 'map', project: e.project }, { caller: 'mcp' });
      }),
      api?.games.onOpen((e) => {
        // The payload carries no repo — games are app-global — so reveal in the current one,
        // or the first open repo when none is selected.
        void (async () => {
          const repoId = useUiStore.getState().selectedRepoId ?? (await api.repos.list())[0]?.id;
          if (!repoId) return;
          await revealResource({ kind: 'media', repoId, media: 'game', project: e.gameId }, { caller: 'mcp' });
        })();
      }),
    ];
    return () => offs.forEach((off) => off?.());
  }, []);
}
