import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

type Media = MidniteStudioBridge['media'];

/**
 * The slice of `window.midniteStudio` Media exposes — the Library's channels and events, plus the media
 * shell's change event (which nothing in Media fires; the shell subscribes to it whatever its tabs are).
 * No `secrets` namespace at all, so the TMDB key cannot be read from the renderer even by accident; no
 * media store, git, pty or browser (`bridge.test.ts` holds the list).
 */
export type MediaBridge = {
  media: Pick<Media, 'library' | 'onChanged'>;
};

export type { RendererIpc };

export function createMediaBridge(ipc: RendererIpc): MediaBridge {
  const { call, subscribe } = createBridgeSlice(ipc);
  return {
    media: {
      library: {
        roots: () => call(CHANNELS.mediaLibraryRoots),
        addRoot: () => call(CHANNELS.mediaLibraryAddRoot),
        removeRoot: (req) => call(CHANNELS.mediaLibraryRemoveRoot, req),
        scan: (req) => call(CHANNELS.mediaLibraryScan, req),
        items: (req) => call(CHANNELS.mediaLibraryItems, req),
        progress: (req) => call(CHANNELS.mediaLibraryProgress, req),
        clearProgress: (req) => call(CHANNELS.mediaLibraryClearProgress, req),
        settings: () => call(CHANNELS.mediaLibrarySettingsGet),
        setSettings: (req) => call(CHANNELS.mediaLibrarySettingsSet, req),
        onChanged: (handler) => subscribe(EVENT_CHANNELS.mediaLibraryChanged, handler),
        onScanProgress: (handler) => subscribe(EVENT_CHANNELS.mediaLibraryScanProgress, handler),
        playlists: {
          list: () => call(CHANNELS.mediaLibraryPlaylists),
          create: (req) => call(CHANNELS.mediaLibraryPlaylistCreate, req),
          rename: (req) => call(CHANNELS.mediaLibraryPlaylistRename, req),
          setItems: (req) => call(CHANNELS.mediaLibraryPlaylistSetItems, req),
          delete: (req) => call(CHANNELS.mediaLibraryPlaylistDelete, req),
        },
        lan: {
          status: () => call(CHANNELS.mediaLibraryLanStatus),
          start: (req) => call(CHANNELS.mediaLibraryLanStart, req),
          stop: () => call(CHANNELS.mediaLibraryLanStop),
          regenerateToken: () => call(CHANNELS.mediaLibraryLanRegenerate),
          setSettings: (req) => call(CHANNELS.mediaLibraryLanSettingsSet, req),
          detectFfmpeg: () => call(CHANNELS.mediaLibraryLanDetectFfmpeg),
        },
      },
      onChanged: (handler) => subscribe(EVENT_CHANNELS.mediaChanged, handler),
    },
  };
}
