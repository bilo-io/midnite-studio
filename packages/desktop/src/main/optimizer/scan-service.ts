// Moved into the optimizer feature package (Phase 113 Theme H) so a standalone Cleaner scans too.
// This is Studio's binding: the repo registry as the scan's roots, the main log seam as its log.
import {
  cleanItems as featureCleanItems,
  knownRoots as featureKnownRoots,
  scanWorkspace as featureScanWorkspace,
  type RepoSource,
} from '@midnite/studio-feature-optimizer/main';

import { defaultLogger } from '../log';
import { listRepos, worktreesFor } from '../repo-registry';

export { dirBytes, MAX_WALK_ENTRIES, newWalkState, readDirSafe } from '@midnite/studio-feature-optimizer/main';

export const STUDIO_REPO_SOURCE: RepoSource = { listRepos, worktreesFor };

export const scanWorkspace = (opts: Parameters<typeof featureScanWorkspace>[0]) =>
  featureScanWorkspace({ repos: STUDIO_REPO_SOURCE, log: defaultLogger, ...opts });

export const cleanItems = (
  paths: readonly string[],
  roots: readonly string[],
  trash: (path: string) => Promise<void>,
) => featureCleanItems(paths, roots, trash, defaultLogger);

export const knownRoots = () => featureKnownRoots(STUDIO_REPO_SOURCE);
