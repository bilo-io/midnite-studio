import { mediaAudioManifest } from '@midnite/studio-feature-media-audio/manifest';
import { mediaGameManifest } from '@midnite/studio-feature-media-game/manifest';
import { mediaMapManifest } from '@midnite/studio-feature-media-map/manifest';
import { mediaModelManifest } from '@midnite/studio-feature-media-model/manifest';
import { mediaSpriteManifest } from '@midnite/studio-feature-media-sprite/manifest';
import { mediaTerrainManifest } from '@midnite/studio-feature-media-terrain/manifest';

/**
 * The feature manifests that own MCP tools, for Settings ▸ MCP's Tools page (Phase 113 Theme S) — the
 * renderer's copy of `desktop/src/main/mcp/tool-manifests.ts`, importing each manifest's pure-data entry
 * so the page does not pull a feature's renderer into its chunk. `mcp-tool-manifests.test.ts` pins that the
 * two lists name the same manifests.
 */
export const STUDIO_MCP_TOOL_MANIFESTS = [
  mediaAudioManifest,
  mediaModelManifest,
  mediaGameManifest,
  mediaTerrainManifest,
  mediaSpriteManifest,
  mediaMapManifest,
] as const;
