import type { AppsStatus, StudioStatus } from './bridge';
import type { AppId } from './catalog';
import { compareVersions } from './version';

/**
 * What a tile says about its app (Phase 113 Theme E). Studio's tile reads Studio's own install.
 * Every other tile reads the launcher's installed-bundle record (`installed.json`) against
 * `catalog.json` — never "is Studio installed?". An app with no bundle and nothing published yet
 * falls back to Studio, which still hosts it, so today's users see nothing change.
 */
export type AppInstallState = 'checking' | 'not-installed' | 'installed' | 'update';

export function installState(status: StudioStatus | null): AppInstallState {
  if (status === null) return 'checking';
  if (status.installed === null) return 'not-installed';
  const { version } = status.installed;
  if (status.latest !== null && version !== null && compareVersions(status.latest.version, version) > 0) {
    return 'update';
  }
  return 'installed';
}

/** Where a tile's state came from: its own bundle, or Studio hosting it. */
export type AppSource = 'bundle' | 'studio';

export type AppState = {
  state: AppInstallState;
  source: AppSource;
  /** The version shown on the tile, or `null` when none is known. */
  version: string | null;
  /** The version an Update would install. */
  latest: string | null;
  /** When `latest` was released, when the feed said. */
  releasedAt: string | null;
  /** Studio is installed and will open this app when its own bundle is absent. */
  studioFallback: boolean;
};

/**
 * Pure: catalog x installed record x Studio status -> one tile's state.
 *
 *  - Studio itself: its own status.
 *  - a bundle is recorded: Installed, or Update when the catalog publishes a different version
 *    (lockstep mismatch included) or its stub was cloned from another runtime version.
 *  - no record, but the catalog publishes it: Not installed (Install pulls the bundle).
 *  - no record and nothing published: Studio's state, because Studio hosts it today.
 */
export function deriveAppState(id: AppId, studio: StudioStatus | null, apps: AppsStatus | null): AppState {
  if (id === 'studio') {
    return {
      state: installState(studio),
      source: 'studio',
      version: studio?.installed?.version ?? studio?.latest?.version ?? null,
      latest: studio?.latest?.version ?? null,
      releasedAt: studio?.latest?.releasedAt ?? null,
      studioFallback: false,
    };
  }
  const studioFallback = studio?.installed != null;
  if (apps === null) {
    return { state: 'checking', source: 'bundle', version: null, latest: null, releasedAt: null, studioFallback };
  }
  const record = apps.installed.find((a) => a.id === id);
  const entry = apps.catalog?.apps.find((a) => a.id === id);
  if (record !== undefined) {
    const behind = entry !== undefined && entry.version !== record.version;
    const staleStub = record.runtimeVersion !== (apps.catalog?.runtimeVersion ?? apps.runtimeVersion);
    return {
      state: behind || staleStub ? 'update' : 'installed',
      source: 'bundle',
      version: record.version,
      latest: entry?.version ?? null,
      releasedAt: null,
      studioFallback,
    };
  }
  if (entry !== undefined) {
    return { state: 'not-installed', source: 'bundle', version: null, latest: entry.version, releasedAt: null, studioFallback };
  }
  const hosted = installState(studio);
  return {
    state: hosted,
    source: 'studio',
    version: studio?.installed?.version ?? studio?.latest?.version ?? null,
    latest: studio?.latest?.version ?? null,
    releasedAt: studio?.latest?.releasedAt ?? null,
    studioFallback,
  };
}
