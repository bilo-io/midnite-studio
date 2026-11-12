import { useEffect, useState } from 'react';

import type { ReleaseNotes } from '@midnite/studio-shared';

import { bridge } from '../../bridge';

/** How many released sections the drop-up asks for: the running version plus the three it lists beneath. */
const LATEST = 4;

/**
 * This app's own release notes through `suiteReleaseNotes.get`, once per mount of the panel (the popover
 * mounts its panel only while open, so mounting is the laziness). Not react-query: the rail sits above any
 * module's `QueryClientProvider`. Never rejects — a failed call reads as an error envelope.
 */
export function useSuiteReleaseNotes(version: string): { data: ReleaseNotes | undefined; isLoading: boolean } {
  const [data, setData] = useState<ReleaseNotes | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const get = bridge()?.suiteReleaseNotes?.get;
    if (get === undefined) {
      setData({ version, notes: null, error: 'No bridge' });
      return undefined;
    }
    get({ latest: LATEST }).then(
      (res) => {
        if (live) setData(res);
      },
      (err: unknown) => {
        if (live) setData({ version, notes: null, error: err instanceof Error ? err.message : 'unreachable' });
      },
    );
    return () => {
      live = false;
    };
  }, [version]);
  return { data, isLoading: data === undefined };
}
