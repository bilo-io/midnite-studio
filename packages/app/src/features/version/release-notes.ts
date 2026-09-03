import { useQuery } from '@tanstack/react-query';
import type { ReleaseNotes } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';

/**
 * This build's changelog section, fetched through main from the public mirror.
 *
 * `enabled` is the popover's open state: the notes are one network round-trip
 * for a panel most sessions never open, so nothing is fetched until it is.
 *
 * `retry: false` because the two ways this fails are both permanent for the
 * moment — offline, or the mirror has no section for this version yet — and
 * neither is improved by three more requests. Reopening the popover after
 * `gcTime` retries, which is the right cadence for "did the release land yet".
 */
export function useReleaseNotes(version: string, enabled: boolean) {
  return useQuery<ReleaseNotes>({
    queryKey: ['release-notes', version],
    queryFn: async () =>
      (await bridge()?.update.releaseNotes({ version })) ?? {
        version,
        notes: null,
        error: 'No bridge',
      },
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });
}
