import type { GmProgress } from '@midnite/studio-shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { bridge } from '../../../services/bridge';
import { noBridge } from '../../../services/bridge-result';

/** GM instrument sample state for the picker (Phase 101 Theme D): what is cached, what is downloading. */
export const GM_STATUS_KEY = ['media-music-gm-status'] as const;

export type GmDownloadState = Record<number, { fraction: number; error?: string }>;

export function useGmSamples() {
  const client = useQueryClient();
  const [downloads, setDownloads] = useState<GmDownloadState>({});

  const status = useQuery<number[]>({
    queryKey: GM_STATUS_KEY,
    queryFn: async () => (await bridge()?.media.audio.gm.status())?.cached ?? [],
    staleTime: 15_000,
  });

  useEffect(() => {
    const off = bridge()?.media.audio.gm.onProgress((event: GmProgress) => {
      setDownloads((prev) => {
        if (event.phase === 'ready') {
          const { [event.program]: _done, ...rest } = prev;
          return rest;
        }
        return {
          ...prev,
          [event.program]: event.phase === 'failed' ? { fraction: 0, error: event.message ?? 'Download failed' } : { fraction: event.fraction },
        };
      });
      if (event.phase === 'ready') void client.invalidateQueries({ queryKey: GM_STATUS_KEY });
    });
    return () => off?.();
  }, [client]);

  const download = useCallback(
    async (program: number) => {
      setDownloads((prev) => ({ ...prev, [program]: { fraction: 0 } }));
      const result = (await bridge()?.media.audio.gm.ensure({ program })) ?? noBridge();
      if (!result.ok) {
        setDownloads((prev) => ({
          ...prev,
          [program]: { fraction: 0, error: result.kind === 'error' ? result.message : 'Download failed' },
        }));
      }
      await client.invalidateQueries({ queryKey: GM_STATUS_KEY });
    },
    [client],
  );

  return { cached: new Set(status.data ?? []), downloads, download };
}
