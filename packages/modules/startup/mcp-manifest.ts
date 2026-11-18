import { STARTUP_MCP_TOOL_IDS, type FeatureManifest } from '@midnite/studio-shared';

/**
 * Who owns Startup's MCP tools (Phase 153 Theme C): Startup, so a build without it never lists them and the
 * `midnite` shim routes them to Startup's own socket. Every consumer that passes manifests — Studio's server and
 * shim (`desktop/src/main/mcp/tool-manifests.ts`) and the Tools pages (`app/src/compose/mcp-tool-manifests.ts`)
 * — imports this one, so ownership cannot drift. Shaped like a {@link FeatureManifest} but only the two fields
 * ownership reads: Startup is a module, with no feature folder of its own to name.
 *
 * Pure data: imports `@midnite/studio-shared` and nothing else, so the plain-node shim can bundle it.
 */
export const startupMcpManifest = {
  owner: 'startup',
  mcpTools: [...STARTUP_MCP_TOOL_IDS],
} as const satisfies Pick<FeatureManifest, 'owner' | 'mcpTools'>;
