import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useUiStore } from '../../store/ui-store';
import { revealResource } from '../companion/reveal/reveal';

// The request store moved to media-core (Phase 113 Theme Q); the listeners below stay Studio's.
export {
  useMediaOpenFor,
  useMediaOpenRequest,
  type MediaOpenKind,
  type MediaOpenRequest,
} from '@midnite/studio-feature-media-core/renderer';

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
