import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The one "repository" Creator's media is scoped to. The renderer's media store addresses everything by
 * `repoId`; the module has no repository list, so it has one id that its main half resolves to the media
 * root the host gives it. Both halves read it here so they cannot drift.
 */
export const CREATOR_REPO_ID = 'creator';

/**
 * The Creator module (Phase 124 Theme C): Docs, Images, Video and Audio over media-core's shell, with Slides
 * as a doc's Present deck. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 * Nothing in it assumes a host: Agents, Media and Gamer all mount it as one nav group.
 */
export const creatorManifest = defineModuleManifest({
  module: 'creator',
  label: 'Creator',
  glyph: 'PiPaletteFill',
  accent: '#ec4899',
  // Placement folders (`FEATURE_PLACEMENT` keys): `media` is five packages (core, docs, images, video, audio).
  features: ['media', 'slides'],
  views: [{ id: 'media', global: false }],
});

export type CreatorManifest = typeof creatorManifest;
