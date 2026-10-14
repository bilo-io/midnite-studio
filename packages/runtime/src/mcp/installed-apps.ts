import {
  ALL_APPS_INSTALLED,
  installedSet,
  listMcpToolIds,
  type FeatureManifest,
  type IsAppInstalled,
  type McpToolId,
  type PlacementAppId,
} from '@midnite/studio-shared';

/**
 * Where the runtime learns which apps are installed — the seam between the
 * `midnite` MCP server and the launcher (Phase 113 Theme D / E).
 *
 * The eventual source is the launcher's `installed.json`
 * (`apps/launcher/src/common/installed-state.ts`, one record per installed
 * bundle). That file is read in another process, so reading it here would be
 * cross-process plumbing this slice deliberately does not build: the runtime
 * takes an **injected** {@link InstalledAppsSource} instead. Studio injects
 * {@link studioInstalledApps} (every app installed — it is the superset
 * build), so today's tool list is unchanged; the launcher-hosted runtime will
 * inject a source over `installed.json` and nothing else here changes.
 */
export type InstalledAppsSource = () => IsAppInstalled;

/** Studio: every app counts as installed. */
export const studioInstalledApps: InstalledAppsSource = () => ALL_APPS_INSTALLED;

/** A fixed set — what a test, or a future `installed.json` reader, builds. */
export function installedAppsFromIds(ids: Iterable<PlacementAppId>): InstalledAppsSource {
  const predicate = installedSet(ids);
  return () => predicate;
}

export type McpToolListing = {
  /** The tool ids `tools/list` offers right now. Re-reads the source, so an install shows up without a restart. */
  list(): McpToolId[];
  /** Whether a call to `id` should be served: an unlisted tool is refused, not just hidden. */
  isListed(id: McpToolId): boolean;
};

export function createMcpToolListing(opts: {
  installed: InstalledAppsSource;
  /** Feature manifests whose `mcpTools` contribute (and own) tools — the optimizer template's seam. */
  manifests?: readonly Pick<FeatureManifest, 'owner' | 'mcpTools'>[];
}): McpToolListing {
  const manifests = opts.manifests ?? [];
  const list = (): McpToolId[] => listMcpToolIds(opts.installed(), manifests);
  return { list, isListed: (id) => list().includes(id) };
}
