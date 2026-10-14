import type { StudioStatus } from './bridge';
import { compareVersions } from './version';

/**
 * What a tile says about its app. Every app runs in Studio today, so this is
 * derived from Studio's own status — one install, seven tiles reflecting it.
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
