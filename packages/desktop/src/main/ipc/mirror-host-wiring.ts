import { join } from 'node:path';

import { parseRemoteUrl } from '@midnite/studio-git-engine';
import { activeAccountFor, adapterFor, githubWhoami } from '@midnite/studio-feature-forge/main';
import { createMirrorHost, type MirrorConfigRepo, type MirrorHost, type ResolvedMirrorForge } from '@midnite/studio-feature-forge-host/main';

import { defaultLogger } from '../log';

/** Let the window and the first poll settle before the first mirror run starts cloning. */
export const MIRROR_START_DELAY_MS = 60_000;

/** The forge feature's lookups, injectable so the composition rules are testable without a vault or `gh`. */
export type MirrorForgePorts = {
  parse: typeof parseRemoteUrl;
  activeAccountFor: typeof activeAccountFor;
  adapterFor: typeof adapterFor;
  githubWhoami: typeof githubWhoami;
};

const realPorts: MirrorForgePorts = { parse: parseRemoteUrl, activeAccountFor, adapterFor, githubWhoami };

/**
 * `null` mirrors the refs only. Beyond GitHub (where `gh` is the credential) a forge with no active
 * account for its host has nothing to authenticate with: its adapter would answer every listing with an
 * error and the repo would read `degraded` on every run, so it is refs only instead.
 */
export async function resolveMirrorForge(repo: MirrorConfigRepo, ports: MirrorForgePorts = realPorts): Promise<ResolvedMirrorForge | null> {
  const forge = ports.parse(repo.url);
  if (!forge) return null;
  const account = await ports.activeAccountFor(forge);
  if (account === null && forge.kind !== 'github') return null;
  const adapter = ports.adapterFor(forge, account);
  if (!adapter) return null;
  // Record who the adapter really acts as: the account's login, or for a `gh`-delegated GitHub the
  // identity `gh` is signed in as (the same lookup the workflow gate uses), never a placeholder.
  const login = account ? account.login : ((await ports.githubWhoami(forge.host))?.login ?? 'unknown');
  return { forge, adapter, account: login };
}

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
    resolve: (repo) => resolveMirrorForge(repo),
  });
}
