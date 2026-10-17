import { MCP_TOOL_IDS, type McpToolId } from './mcp';
import type { FeatureManifest } from './domain/feature-manifest';
import { PLACEMENT_APP_IDS, type PlacementAppId, type PlacementLayer } from './domain/placement';

/**
 * Which app owns each MCP tool, and so which tools `tools/list` offers for a
 * given set of installed apps (Phase 113 Theme D).
 *
 * The suite runs ONE `midnite` MCP server (`MCP_SERVER_NAME`) whatever apps
 * are installed, but its tool list is the union of what the installed apps
 * contribute: a tool whose app is not installed is not listed. Studio is the
 * superset build — every app installed — so its list is exactly
 * `MCP_TOOL_IDS`, unchanged from before the split (`mcp-tool-owners.test.ts`
 * pins that).
 *
 * Two sources of ownership, in this order:
 * 1. A feature manifest's `mcpTools` (`FeatureManifest`, e.g. the optimizer
 *    template in `packages/features/optimizer`) — the owner is the manifest's
 *    `owner`. This is where a tool lives once its feature is extracted.
 * 2. {@link defaultMcpToolOwner}, for every tool whose feature has not
 *    been extracted into a package yet. The `music_*` tools left this table for Media ▸ Audio's
 *    manifest (Phase 113 Theme Q), owner `creator`; the rest of Creator's media has no tools.
 *
 * Every consumer that lists tools passes the manifests — the server (`desktop/src/main/mcp/
 * tool-manifests.ts`), the stdio shim and the Tools pages — because a tool no manifest claims and
 * the table does not name is a `frame` tool, which is always listed.
 *
 * Lives in `shared`, not the runtime, because the MCP stdio shim answers
 * `tools/list` under plain `node` and may import nothing else; the runtime
 * (`packages/runtime/src/mcp/`) owns the injected "what is installed" seam
 * that feeds it.
 */

/** Whether an app is installed. Injected: Studio passes {@link ALL_APPS_INSTALLED}. */
export type IsAppInstalled = (app: PlacementAppId) => boolean;

/** Studio = every app installed. */
export const ALL_APPS_INSTALLED: IsAppInstalled = () => true;

/** The predicate for an explicit set of installed app ids. */
export function installedSet(apps: Iterable<PlacementAppId>): IsAppInstalled {
  const set = new Set<PlacementAppId>(apps);
  return (app) => set.has(app);
}

/**
 * The owner of a tool no manifest claims yet. `frame` tools (repo, git read,
 * UI steering, the companion) belong to every app and are always listed.
 * Media's tabs split per `docs/APPS.md`: map, terrain, model, sprite and game to Gamer. Audio's
 * `music_*` tools are Creator's, declared by Audio's manifest rather than named here.
 */
export function defaultMcpToolOwner(id: McpToolId): PlacementLayer {
  if (id.startsWith('forge.')) return 'coder';
  if (id.startsWith('workflow_')) return 'agents';
  if (/^(model|game|terrain|sprite|map)_/.test(id) || id === 'tileset_generate' || id === 'background_generate') {
    return 'gamer';
  }
  // repo.*, status.*, graph.*, diff.*, branch.*, ui.*, companion_*
  return 'frame';
}

/** Tool id → owner, with manifest contributions taking precedence over the default table. */
export function mcpToolOwner(id: McpToolId, manifests: readonly Pick<FeatureManifest, 'owner' | 'mcpTools'>[] = []): PlacementLayer {
  for (const manifest of manifests) {
    if (manifest.mcpTools.includes(id)) return manifest.owner;
  }
  return defaultMcpToolOwner(id);
}

/**
 * The tool ids to list: a frame tool always, an app's tool only when that app
 * is installed. Order is `MCP_TOOL_IDS`'s, so Studio's list is byte-identical
 * to the pre-split one.
 */
export function listMcpToolIds(
  isInstalled: IsAppInstalled,
  manifests: readonly Pick<FeatureManifest, 'owner' | 'mcpTools'>[] = [],
): McpToolId[] {
  return MCP_TOOL_IDS.filter((id) => {
    const owner = mcpToolOwner(id, manifests);
    return owner === 'frame' || isInstalled(owner);
  });
}

/** Every app that owns at least one default-table tool — for tests and docs. */
export const MCP_TOOL_OWNING_APPS: readonly PlacementAppId[] = PLACEMENT_APP_IDS.filter((app) =>
  MCP_TOOL_IDS.some((id) => defaultMcpToolOwner(id) === app),
);
