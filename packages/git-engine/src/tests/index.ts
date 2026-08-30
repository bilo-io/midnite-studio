import type { TestPackage } from '@midnite/studio-shared';

import { discoverTests, type DiscoverTestsOptions } from './discover';
import { createDiscoveryCache, type DiscoveryCache } from './discovery-cache';

export * from './classify';
export * from './discover';
export * from './discovery-cache';
export * from './fs';
export * from './workspace';

export type ComputeTestDiscoveryOptions = DiscoverTestsOptions & {
  repoId: string;
};

const defaultCache = createDiscoveryCache<TestPackage[]>();

/** Cached discovery — the `computeStats` shape, keyed on `repoId` alone. */
export async function computeTestDiscovery(
  options: ComputeTestDiscoveryOptions,
  cache: DiscoveryCache<TestPackage[]> = defaultCache,
): Promise<TestPackage[]> {
  const hit = cache.get(options.repoId);
  if (hit) return hit;

  const packages = await discoverTests(options);
  cache.set(options.repoId, packages);
  return packages;
}

/** Drop a repository's cached discovery — wired to the Phase 10 watcher. */
export function invalidateTestDiscovery(
  repoId: string,
  cache: DiscoveryCache<TestPackage[]> = defaultCache,
): void {
  cache.invalidate(repoId);
}
