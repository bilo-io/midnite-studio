import { mediaAudioManifest } from '@midnite/studio-feature-media-audio/manifest';

/**
 * The feature manifests that own MCP tools (`FeatureManifest.mcpTools`) — where a tool's app comes from
 * once its feature is extracted, ahead of `defaultMcpToolOwner`'s table for the tools no manifest claims.
 * Pure data: each manifest imports only `shared`, so the plain-node MCP shim can import this file too.
 *
 * Today that is Audio's, which carries the `music_*` tools for Creator. The tool *handlers* stay with the
 * server (`./dispatch.ts`); only ownership is declared in the feature. A new owning manifest is added
 * here, and in the two Tools pages that list tools (`McpToolsView`'s `manifests`).
 */
export const MCP_TOOL_MANIFESTS = [mediaAudioManifest] as const;
