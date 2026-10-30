import { mediaLibraryMain } from '@midnite/studio-feature-media-library/main';
import { defineFeatureMain } from '@midnite/studio-runtime';

import { registerMediaOn, type MediaElectron, type MediaServices } from './context';

/** What the host hands the Media module: the electron pieces, and a hook that receives the services it built. */
export type MediaModuleServices = {
  electron: MediaElectron;
  /** Called once the channels are registered, with the library and the LAN server the host disposes on quit. */
  onRegistered?: (services: MediaServices) => void;
};

/** The Media module's main half (Phase 124 Theme E.3): the Library feature's channels, mountable through `mountModuleMains`. */
export const mediaModuleMain = defineFeatureMain<MediaModuleServices>({
  feature: 'media',
  channels: [...mediaLibraryMain.channels],
  register(ctx, { electron, onRegistered }) {
    onRegistered?.(registerMediaOn(ctx, electron));
  },
});
