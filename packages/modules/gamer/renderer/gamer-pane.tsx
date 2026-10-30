import { MediaHostProvider, MediaShell, useMediaHost } from '@midnite/studio-feature-media-core/renderer';
import { GameHostProvider } from '@midnite/studio-feature-media-game/renderer';
import { MapHostProvider } from '@midnite/studio-feature-media-map/renderer';
import { ModelHostProvider } from '@midnite/studio-feature-media-model/renderer';
import { SpriteHostProvider } from '@midnite/studio-feature-media-sprite/renderer';
import { SpriteRenderHost } from '@midnite/studio-feature-media-sprite/events';
import { TerrainHostProvider } from '@midnite/studio-feature-media-terrain/renderer';
import { FrameChromeProvider, useSyncedView } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { GAMER_CHROME, GamerDialogHost } from './compose/gamer-chrome';
import {
  GAMER_GAME_HOST,
  GAMER_MAP_HOST,
  GAMER_MEDIA_HOST,
  GAMER_MODEL_HOST,
  GAMER_SPRITE_HOST,
  GAMER_TERRAIN_HOST,
  loadSpriteRenderJob,
} from './compose/gamer-host';
import { GAMER_TABS } from './gamer-manifest';

/** The rail's row is the media tab, which lives in the media host's store — the two stay one value. */
function GamerTabSync({ view, onView }: { view: string; onView: (view: string) => void }) {
  const [tab, setTab] = useMediaHost().useActiveTab();
  useSyncedView(view, onView, tab, (next) => setTab(next as typeof tab));
  return null;
}

/**
 * Gamer as a pane inside a host's shell (Phase 124 Theme E.3): the same host ports as `GamerApp`, the media
 * shell bare, and no `ReportIssueHost` — the host owns the one menu entry.
 */
export function GamerPane({ view, onView }: { view: string; onView: (view: string) => void }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={GAMER_CHROME}>
        <MediaHostProvider host={GAMER_MEDIA_HOST}>
          <GameHostProvider host={GAMER_GAME_HOST}>
            <MapHostProvider host={GAMER_MAP_HOST}>
              <TerrainHostProvider host={GAMER_TERRAIN_HOST}>
                <SpriteHostProvider host={GAMER_SPRITE_HOST}>
                  <ModelHostProvider host={GAMER_MODEL_HOST}>
                    <SpriteRenderHost loadRenderJob={loadSpriteRenderJob} />
                    <GamerTabSync view={view} onView={onView} />
                    <main className="h-full min-h-0" aria-label="Media">
                      <MediaShell tabs={GAMER_TABS} bare />
                    </main>
                  </ModelHostProvider>
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
