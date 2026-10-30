import { mediaCoreMain } from '@midnite/studio-feature-media-core/main';
import { mediaGameMain } from '@midnite/studio-feature-media-game/main';
import { mediaMapMain } from '@midnite/studio-feature-media-map/main';
import { mediaModelMain } from '@midnite/studio-feature-media-model/main';
import { mediaSpriteMain } from '@midnite/studio-feature-media-sprite/main';
import { mediaTerrainMain } from '@midnite/studio-feature-media-terrain/main';
import { defineFeatureMain } from '@midnite/studio-runtime';

import { registerGamerOn, type GamerElectron, type GamerServices } from './context';

/** What the host hands the Gamer module: the electron pieces, and a hook that receives the services it built. */
export type GamerModuleServices = {
  electron: GamerElectron;
  /** Called once the channels are registered, with the services to dispose on quit. */
  onRegistered?: (services: GamerServices) => void;
};

/**
 * The Gamer module's main half (Phase 124 Theme E.3), on the same seam a feature uses so a host mounts it through
 * `mountModuleMains`: media-core's store, watcher and export, and the Maps, Terrain, Sprites, Models and Games
 * features'. Gamer registers no report channel — its host owns Report an Issue.
 */
export const gamerModuleMain = defineFeatureMain<GamerModuleServices>({
  feature: 'gamer',
  channels: [
    ...mediaCoreMain.channels,
    ...mediaModelMain.channels,
    ...mediaTerrainMain.channels,
    ...mediaMapMain.channels,
    ...mediaSpriteMain.channels,
    ...mediaGameMain.channels,
  ],
  register(ctx, { electron, onRegistered }) {
    onRegistered?.(registerGamerOn(ctx, electron));
  },
});
