import {
  changelogRawUrl,
  extractChangelogSection,
  extractLatestSections,
  type ChangelogAppId,
  type ReleaseNotes,
} from '@midnite/studio-shared';

import { EgressBlockedError, type GuardedFetch } from '../net/guarded-fetch';

const TIMEOUT_MS = 8_000;

export type AppReleaseNotesOptions = {
  app: ChangelogAppId;
  /** This build's version (`app.getVersion()`): the section the renderer is told about. */
  version: string;
  /** Also return the newest N released sections, as Studio's handler does. */
  latest?: number;
  fetch: GuardedFetch;
};

/**
 * One suite app's release notes, read from its public changelog mirror (Phase 131 Theme E). The same
 * envelope as Studio's `release-notes-handlers.ts`: a 404 is "not published yet" (`notes: null`, no
 * error), a blocked or failed fetch is an `error` string. Never throws, never caches: the mirror gains
 * a version's section minutes after the build ships.
 */
export async function fetchAppReleaseNotes(options: AppReleaseNotesOptions): Promise<ReleaseNotes> {
  const { app, version, latest } = options;
  try {
    const res = await options.fetch('launcher', changelogRawUrl(app), {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { version, notes: null, error: null };
    if (!res.ok) return { version, notes: null, error: `changelog: HTTP ${res.status}` };
    const text = await res.text();
    return {
      version,
      notes: extractChangelogSection(text, version),
      error: null,
      ...(latest ? { sections: extractLatestSections(text, latest) } : {}),
    };
  } catch (err) {
    if (err instanceof EgressBlockedError) return { version, notes: null, error: 'Release notes are turned off.' };
    return { version, notes: null, error: err instanceof Error ? err.message : 'unreachable' };
  }
}
