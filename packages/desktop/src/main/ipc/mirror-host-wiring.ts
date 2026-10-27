import { join } from 'node:path';

import { parseRemoteUrl } from '@midnite/studio-git-engine';
import { activeAccountFor, adapterFor } from '@midnite/studio-feature-forge/main';
import { createMirrorHost, type MirrorHost } from '@midnite/studio-feature-forge-host/main';

import { defaultLogger } from '../log';

/** Let the window and the first poll settle before the first mirror run starts cloning. */
export const MIRROR_START_DELAY_MS = 60_000;

/**
 * Studio's composition of the forge-host mirror scheduler (Phase 119 Theme A): `mirrors.json` under
 * userData, and an adapter per configured repo from the forge feature's registry, acting as the
 * active account for that repo's host. `forge-host` never imports `forge`, so this is the seam. A repo
 * whose forge has no adapter or no account is still mirrored (refs only).
 */
export function createStudioMirrorHost(userData: string): MirrorHost {
  return createMirrorHost({
    configFile: join(userData, 'mirrors.json'),
    warn: (message) => defaultLogger.warn(`[mirror] ${message}`),
    resolve: async (repo) => {
      const forge = parseRemoteUrl(repo.url);
      if (!forge) return null;
      const account = await activeAccountFor(forge);
      const adapter = adapterFor(forge, account);
      if (!adapter) return null;
      // A `gh`-delegated GitHub account has no token to name; the manifest records the login either way.
      return { forge, adapter, account: account?.login ?? 'gh' };
    },
  });
}
