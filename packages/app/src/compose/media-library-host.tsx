import { LIBRARY_KEYS, type LibraryHost } from '@midnite/studio-feature-media-library/renderer';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ApiKeyRow } from '../features/media/image/image-settings';
import { useImageSecretHas } from '../features/media/image/use-images';

/**
 * Studio's side of Media ▸ Library's host port (Phase 113 Theme R).
 *
 * The online provider's key field is Studio's vault-backed key row — the one Images' provider keys use —
 * writing `media.tmdbApiKey` into the vault through `secrets.set`; the value never comes back. When the
 * key appears or goes, the library's settings query refreshes so its "key available" line follows.
 * Playback stays the feature's own player (see `LibraryHost.Player`).
 */
function TmdbKeyField() {
  const client = useQueryClient();
  const has = useImageSecretHas('media.tmdbApiKey');
  const hasKey = has.data?.hasKey;
  useEffect(() => {
    if (hasKey === undefined) return;
    void client.invalidateQueries({ queryKey: LIBRARY_KEYS.settings });
  }, [hasKey, client]);
  return <ApiKeyRow label="TMDB" secretKey="media.tmdbApiKey" />;
}

export const STUDIO_LIBRARY_HOST: LibraryHost = {
  OnlineKeyField: TmdbKeyField,
};
