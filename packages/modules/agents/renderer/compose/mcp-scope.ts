import { mediaAudioManifest } from '@midnite/studio-feature-media-audio/manifest';
import { mediaGameManifest } from '@midnite/studio-feature-media-game/manifest';
import { mediaMapManifest } from '@midnite/studio-feature-media-map/manifest';
import { mediaModelManifest } from '@midnite/studio-feature-media-model/manifest';
import { mediaSpriteManifest } from '@midnite/studio-feature-media-sprite/manifest';
import { mediaTerrainManifest } from '@midnite/studio-feature-media-terrain/manifest';
import { installedSet } from '@midnite/studio-shared';

/** Agents' own tools and the frame's: no Gamer, Creator or Coder tool is offered by an app that is not installed. */
export const AGENTS_INSTALLED_APPS = installedSet(['agents']);

/**
 * The manifests that say which app owns which tool: Audio's `music_*` are Creator's, and Model's, Game's,
 * Terrain's, Sprite's and Map's are Gamer's — pure data, imported by their `/manifest` entry so no feature's
 * renderer comes with them. Without them those tools would read as the frame's, which every app lists.
 * The Tools tab and the custom agents' tool allowlist read the same scope.
 */
export const AGENTS_TOOL_MANIFESTS = [mediaAudioManifest, mediaModelManifest, mediaGameManifest, mediaTerrainManifest, mediaSpriteManifest, mediaMapManifest] as const;
