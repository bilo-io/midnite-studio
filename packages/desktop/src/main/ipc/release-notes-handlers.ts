import {
  CHANNELS,
  RELEASE_CHANGELOG_RAW_URL,
  ReleaseNotesRequest,
  extractChangelogSection,
  type ReleaseNotes,
} from '@midnite/studio-shared';

import { handle } from './handle';

/**
 * One version's release notes, read from the public changelog mirror.
 *
 * Registered outside `registerUpdater`'s packaged/unpackaged split on purpose:
 * electron-updater is inert in a dev run (there is no signed bundle to replace),
 * but the notes are just a document, and a surface that only works in a shipped
 * build is a surface nobody develops against.
 *
 * Never cached across a session. The mirror gains this version's section at some
 * point *after* this build ships — the release flow copies it across when the
 * tag publishes — so a "no notes" answer memoised at first open would outlive
 * the reason for it, and a relaunch is not a reasonable price for a reload.
 */
const TIMEOUT_MS = 8_000;

export function registerReleaseNotesHandlers(
  fetchImpl: typeof fetch = fetch,
): void {
  handle<typeof ReleaseNotesRequest, ReleaseNotes>(
    CHANNELS.updateReleaseNotes,
    ReleaseNotesRequest,
    async ({ version }) => {
      try {
        const res = await fetchImpl(RELEASE_CHANGELOG_RAW_URL, {
          // The mirror is a branch tip, so a CDN copy of it can be minutes stale
          // — and the one moment this matters is the minutes after a release.
          cache: 'no-store',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return { version, notes: null, error: `changelog: HTTP ${res.status}` };
        return { version, notes: extractChangelogSection(await res.text(), version), error: null };
      } catch (err) {
        return { version, notes: null, error: err instanceof Error ? err.message : 'unreachable' };
      }
    },
    (issue) => ({ version: '', notes: null, error: issue }),
  );
}
