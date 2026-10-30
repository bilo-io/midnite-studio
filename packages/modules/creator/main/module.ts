import { mediaAudioMain } from '@midnite/studio-feature-media-audio/main';
import { mediaCoreMain, type MediaService } from '@midnite/studio-feature-media-core/main';
import { mediaDocsMain } from '@midnite/studio-feature-media-docs/main';
import { mediaImagesMain } from '@midnite/studio-feature-media-images/main';
import { mediaVideoMain } from '@midnite/studio-feature-media-video/main';
import { reportMain } from '@midnite/studio-feature-report/main';
import { defineFeatureMain } from '@midnite/studio-runtime';

import { registerCreatorOn, type CreatorElectron } from './context';

/** What the host hands the Creator module: the electron pieces, and a hook that receives the media service. */
export type CreatorModuleServices = {
  electron: CreatorElectron;
  /** Called once the channels are registered, with the media service (stop its watchers on quit). */
  onRegistered?: (media: MediaService) => void;
};

/**
 * The Creator module's main half (Phase 124 Theme E.3), on the same seam a feature uses so a host mounts it
 * through `mountModuleMains`: the report feature's channels and the media features' — media-core's store,
 * watcher and export, Docs, Images, Audio and Video. A host whose own module already registers media-core
 * (Gamer) marks those channels `shared` on this mount and hands `electron.media` over.
 */
export const creatorModuleMain = defineFeatureMain<CreatorModuleServices>({
  feature: 'creator',
  channels: [
    ...reportMain.channels,
    ...mediaCoreMain.channels,
    ...mediaDocsMain.channels,
    ...mediaImagesMain.channels,
    ...mediaAudioMain.channels,
    ...mediaVideoMain.channels,
  ],
  register(ctx, { electron, onRegistered }) {
    onRegistered?.(registerCreatorOn(ctx, electron));
  },
});
