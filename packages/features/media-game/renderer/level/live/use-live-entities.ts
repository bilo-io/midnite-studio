import { bridge } from '@midnite/studio-frame';
import type { GameEntitiesResult } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';

/** What the editor holds of the running game's entities: the latest snapshot, or why there is none. */
export type LiveEntities = { result: GameEntitiesResult | null };

const NONE: LiveEntities = { result: null };

/**
 * Subscribe to a running game's entity feed while `enabled` (Phase 140 Theme E): `games.entities.watch` starts the
 * 4 Hz poll in main, `games.onEntityState` delivers it. Turning off, unmounting, or the window being hidden
 * unsubscribes, so a toggled-off editor costs the game nothing. The first snapshot is read with one `get` so the
 * ghosts do not wait a tick.
 */
export function useLiveEntities(gameId: string, enabled: boolean): LiveEntities {
  const [live, setLive] = useState<LiveEntities>(NONE);
  useEffect(() => {
    if (!enabled) {
      setLive(NONE);
      return undefined;
    }
    const games = bridge()?.games;
    if (!games?.entities || !games.onEntityState) return undefined;
    let stopWatch: (() => void) | null = null;
    let stopEvents: (() => void) | null = null;
    let cancelled = false;
    const subscribe = () => {
      if (stopWatch || cancelled) return;
      stopEvents = games.onEntityState((event) => {
        if (event.gameId === gameId) setLive({ result: event.result });
      });
      stopWatch = games.entities.watch({ gameId });
    };
    const unsubscribe = () => {
      stopWatch?.();
      stopEvents?.();
      stopWatch = null;
      stopEvents = null;
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? unsubscribe() : subscribe());
    if (document.visibilityState !== 'hidden') subscribe();
    document.addEventListener('visibilitychange', onVisibility);
    void games.entities.get({ gameId }).then((r) => {
      if (!cancelled && r.ok) setLive((cur) => (cur.result ? cur : { result: r.value }));
    });
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
    };
  }, [gameId, enabled]);
  return enabled ? live : NONE;
}
