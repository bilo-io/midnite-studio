import { useCallback, useEffect, useState } from 'react';

import type { AppId } from '../common/catalog';
import {
  appChangelogSummary,
  searchChangelog,
  type ChangelogItem,
  type ChangelogRelease,
} from '../common/changelog';
import { getBridge } from './bridge';

export type ChangelogController = {
  releases: ChangelogRelease[];
  rawMarkdown: string;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  filter: (query?: string, appId?: AppId | 'all') => ChangelogRelease[];
  summaryForApp: (appId: AppId) => {
    latestVersion: string | null;
    latestItems: ChangelogItem[];
    totalItems: number;
  };
};

let cachedPayload: { releases: ChangelogRelease[]; rawMarkdown: string; error: string | null } | null = null;

export function resetChangelogCache(): void {
  cachedPayload = null;
}

export function useSuiteChangelog(): ChangelogController {
  const [releases, setReleases] = useState<ChangelogRelease[]>(cachedPayload?.releases ?? []);
  const [rawMarkdown, setRawMarkdown] = useState<string>(cachedPayload?.rawMarkdown ?? '');
  const [error, setError] = useState<string | null>(cachedPayload?.error ?? null);
  const [loading, setLoading] = useState<boolean>(!cachedPayload);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBridge().changelog.get();
      cachedPayload = res;
      setReleases(res.releases);
      setRawMarkdown(res.rawMarkdown);
      setError(res.error);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cachedPayload) {
      void refresh();
    }
  }, [refresh]);

  const filter = useCallback(
    (query: string = '', appId: AppId | 'all' = 'all') => {
      return searchChangelog(releases, query, appId);
    },
    [releases],
  );

  const summaryForApp = useCallback(
    (appId: AppId) => {
      return appChangelogSummary(releases, appId);
    },
    [releases],
  );

  return {
    releases,
    rawMarkdown,
    error,
    loading,
    refresh,
    filter,
    summaryForApp,
  };
}
