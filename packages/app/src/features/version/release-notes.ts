import { useQuery } from '@tanstack/react-query';
import type { ReleaseNotes } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';

/**
 * One version's changelog section, fetched through main from the public mirror.
 *
 * No `enabled` flag: the only caller is the popover's panel, which the popover
 * does not render while closed. Mounting *is* the laziness, and a second switch
 * saying the same thing is one more place for the two to disagree.
 *
 * `retry: false` because the two ways this fails are both permanent for the
 * moment — offline, or the mirror has no section for this version yet — and
 * neither is improved by three more requests. Reopening the popover after
 * `staleTime` refetches, which is the right cadence for "did the release land
 * yet".
 */
export function useReleaseNotes(version: string) {
  return useQuery<ReleaseNotes>({
    queryKey: ['release-notes', version],
    queryFn: async () =>
      (await bridge()?.update.releaseNotes({ version })) ?? {
        version,
        notes: null,
        error: 'No bridge',
      },
    retry: false,
    staleTime: 5 * 60_000,
  });
}
