import { bridge } from '@midnite/studio-frame';
import type { ImageProviderStatus } from '@midnite/studio-shared';
import { useQuery } from '@tanstack/react-query';

/**
 * Which image providers can run, and with which models — the same query (and key) Images' create panel
 * reads, so the two tabs share one cache entry in an app that composes both. Read here rather than
 * imported from the Images package, which a feature may not do. Keys never cross: main reports only
 * whether one is set.
 */
export function useImageProviders() {
  return useQuery<ImageProviderStatus[]>({
    queryKey: ['media-image-providers'],
    queryFn: async () => (await bridge()?.media.image.providers())?.providers ?? [],
    staleTime: 30_000,
  });
}
