import type { Song } from '@midnite/studio-shared';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { bridge } from '../../../../services/bridge';
import { usePageVisible } from '../../../../lib/use-page-visible';
import type { MusicEngine } from './engine';

/**
 * Owns one {@link MusicEngine} for the Editor tab. Tone.js is imported only when this hook mounts —
 * which is only when the (lazy) Editor tab opens. The engine is built on mount but the AudioContext
 * is not touched until `play()`, which the transport bar calls from a click.
 */
export function useMusicEngine(song: Song) {
  const [engine, setEngine] = useState<MusicEngine | null>(null);
  const songRef = useRef(song);
  songRef.current = song;
  const visible = usePageVisible();

  useEffect(() => {
    let cancelled = false;
    let created: MusicEngine | null = null;
    void (async () => {
      const [{ createMusicEngine }, { createToneHost }] = await Promise.all([
        import('./engine'),
        import('./tone-host'),
      ]);
      const host = await createToneHost(bridge()?.media.audio);
      if (cancelled) return host.dispose();
      created = createMusicEngine(host);
      await created.setSong(songRef.current);
      if (!cancelled) setEngine(created);
    })();
    return () => {
      cancelled = true;
      created?.dispose();
      setEngine(null);
    };
  }, []);

  useEffect(() => {
    void engine?.setSong(song);
  }, [engine, song]);

  useEffect(() => {
    engine?.setHidden(!visible);
  }, [engine, visible]);

  const subscribe = useCallback(
    (fn: () => void) => engine?.subscribe(fn) ?? (() => undefined),
    [engine],
  );
  const state = useSyncExternalStore(subscribe, () => engine?.getState() ?? 'stopped');
  return { engine, state };
}
