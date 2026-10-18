import { createStandaloneMediaHost } from '@midnite/studio-feature-media-core/renderer';
import type { LibraryHost } from '@midnite/studio-feature-media-library/renderer';

/**
 * The host ports Media implements (Phase 113 Theme R).
 *
 * Media has no repository: the Library reads only the folders the user picked, which main keeps in its
 * own index, so the media shell is scoped to no repo at all. Its state — the tab, pane widths — persists
 * in Media's own localStorage, never in Studio's. The Library plays through the feature's own player
 * (no `Player` override), and the TMDB key is not something Media's renderer can set or see: it lives in
 * the runtime vault, so the Metadata section says where to put it instead of offering a field.
 */
export const MEDIA_MEDIA_HOST = createStandaloneMediaHost({
  repoId: null,
  key: 'midnite-media.ui',
  initialTab: 'library',
  noRepoBody: (_tab, label) => `${label} reads the folders you add.`,
});

export const MEDIA_LIBRARY_HOST: LibraryHost = {
  onlineKeyHint: 'Add a TMDB key in Vault and grant it to Midnite Media.',
};
