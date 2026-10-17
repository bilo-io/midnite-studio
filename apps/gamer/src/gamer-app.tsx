import { MediaHostProvider } from '@midnite/studio-feature-media-core/renderer';
import { GameHostProvider } from '@midnite/studio-feature-media-game/renderer';
import { MapHostProvider } from '@midnite/studio-feature-media-map/renderer';
import { SpriteHostProvider } from '@midnite/studio-feature-media-sprite/renderer';
import { TerrainHostProvider } from '@midnite/studio-feature-media-terrain/renderer';
import { FrameChromeProvider } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { GAMER_CHROME, GamerDialogHost } from './compose/gamer-chrome';
import { GAMER_GAME_HOST, GAMER_MAP_HOST, GAMER_MEDIA_HOST, GAMER_SPRITE_HOST, GAMER_TERRAIN_HOST } from './compose/gamer-host';
import { GamerHome } from './views/gamer-home';

/**
 * Midnite Gamer — media-core's shell with the Games, Maps, Terrain and Sprites tab features, composed over
 * the frame as its own app: the frame chrome, a query client for the media store's cache, and the host
 * ports Gamer implements (`compose/gamer-host.tsx`), nested. Everything is mounted inside these providers;
 * the Games popout window is not offered, so nothing renders outside them.
 */
export function GamerApp() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={GAMER_CHROME}>
        <MediaHostProvider host={GAMER_MEDIA_HOST}>
          <GameHostProvider host={GAMER_GAME_HOST}>
            <MapHostProvider host={GAMER_MAP_HOST}>
              <TerrainHostProvider host={GAMER_TERRAIN_HOST}>
                <SpriteHostProvider host={GAMER_SPRITE_HOST}>
                  <GamerHome />
                </SpriteHostProvider>
              </TerrainHostProvider>
            </MapHostProvider>
          </GameHostProvider>
        </MediaHostProvider>
        <GamerDialogHost />
      </FrameChromeProvider>
    </QueryClientProvider>
  );
}
