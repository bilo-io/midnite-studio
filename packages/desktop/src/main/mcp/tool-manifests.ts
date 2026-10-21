import { mediaAudioManifest } from '@midnite/studio-feature-media-audio/manifest';
import { mediaGameManifest } from '@midnite/studio-feature-media-game/manifest';
import { mediaMapManifest } from '@midnite/studio-feature-media-map/manifest';
import { mediaModelManifest } from '@midnite/studio-feature-media-model/manifest';
import { mediaSpriteManifest } from '@midnite/studio-feature-media-sprite/manifest';
import { mediaTerrainManifest } from '@midnite/studio-feature-media-terrain/manifest';

/**
 * The feature manifests that own MCP tools (`FeatureManifest.mcpTools`) — where a tool's app comes from
 * once its feature is extracted, ahead of `defaultMcpToolOwner`'s table for the tools no manifest claims.
 * Pure data: each manifest imports only `shared`, so the plain-node MCP shim can import this file too.
 *
 * Audio's carries the `music_*` tools for Creator; Model's, Sprite's, Terrain's, Map's and Game's carry the
 * `model_*`, `sprite_*` (with `tileset_generate`, `background_generate` and the sprite-kind `map_*`),
 * `terrain_*`, `map_*` and `game_*` tools for Gamer (Phase 113 Theme S). The tool *handlers* stay with the
 * server (`./dispatch.ts`); only ownership is declared in the feature. A new owning manifest is added
 * here, in the two Tools pages that list tools (`McpToolsView`'s `manifests`: Studio's Settings and
 * Agents' Tools tab) — `tool-manifests.test.ts` fails if one is forgotten.
 */
export const MCP_TOOL_MANIFESTS = [
  mediaAudioManifest,
  mediaModelManifest,
  mediaGameManifest,
  mediaTerrainManifest,
  mediaSpriteManifest,
  mediaMapManifest,
] as const;
