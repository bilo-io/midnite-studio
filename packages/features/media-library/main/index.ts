import { defineFeatureMain } from '@midnite/studio-runtime';
import {
  CHANNELS,
  EVENT_CHANNELS,
  failure,
  schemas,
  type LibraryChanged,
  type LibraryScanProgress,
} from '@midnite/studio-shared';

import { mediaLibraryManifest } from '../manifest';
import { NO_LAN_STREAMING, type LibraryLanController } from './lan';
import type { LibraryService } from './library-service';

export { mediaLibraryManifest, type MediaLibraryManifest } from '../manifest';
export { libraryFileResolver, resolveLibraryFileUrl } from './file-url';
export { NO_LAN_STREAMING, type LibraryLanController } from './lan';
export {
  checkBindAddress,
  isPrivateLanAddress,
  listLanInterfaces,
  type NetworkInterfaces,
} from './lan-addresses';
export {
  createLanStreamServer,
  MAX_TRANSCODES,
  parseRange,
  type LanListen,
  type LanServerDeps,
} from './lan-server';
export {
  FFMPEG_CANDIDATES,
  locateFfmpeg,
  nodeFfmpegPort,
  parseProbe,
  playbackPlan,
  transcodeArgs,
  type FfmpegPort,
  type PlaybackPlan,
  type TranscodeProcess,
} from './ffmpeg';
export {
  createLibraryService,
  itemIdFor,
  rootIdFor,
  type LibraryService,
  type LibraryServiceDeps,
} from './library-service';
export {
  createTmdbProvider,
  type OnlineMatch,
  type OnlineProvider,
  type OnlineQuery,
} from './online';

/** The data directory a composer gives the library, under its own userData. */
export const MEDIA_LIBRARY_DATA_DIR = 'media-library';

/**
 * The library's two events, bound to a composer's `emit` — what it passes to `createLibraryService` so
 * the service never sees a window.
 */
export function libraryEmitters(emit: (channel: string, payload: unknown) => void): {
  emitChanged: (payload: LibraryChanged) => void;
  emitScanProgress: (payload: LibraryScanProgress) => void;
} {
  return {
    emitChanged: (payload) => emit(EVENT_CHANNELS.mediaLibraryChanged, payload),
    emitScanProgress: (payload) => emit(EVENT_CHANNELS.mediaLibraryScanProgress, payload),
  };
}

/**
 * The Library feature's main half (Phase 113 Theme R): roots, scans, items, progress and settings. The
 * service is built by the composer — it decides where the index lives (`dataDir`), what the folder
 * picker is, where the online key comes from (`readKey`, the vault) and whether a provider is wired at
 * all — so this module never imports `electron` and never sees a key's source.
 */
export type MediaLibraryMainServices = {
  library: LibraryService;
  /** The LAN stream server (slice 2); absent, the channels answer that sharing is not available. */
  lan?: LibraryLanController;
};

export const mediaLibraryMain = defineFeatureMain<MediaLibraryMainServices>({
  feature: mediaLibraryManifest.feature,
  channels: mediaLibraryManifest.ipc,
  register(ctx, { library, lan = NO_LAN_STREAMING }) {
    const invalid = (issue: string) => failure(issue);
    const guarded =
      <A extends unknown[], R>(run: (...args: A) => Promise<R>) =>
      async (...args: A) => {
        try {
          return await run(...args);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error)) as R;
        }
      };
    ctx.ipc.handleBare(CHANNELS.mediaLibraryRoots, async () => ({ roots: await library.roots() }));
    ctx.ipc.handleBare(
      CHANNELS.mediaLibraryAddRoot,
      guarded(() => library.addRoot()),
    );
    ctx.ipc.handle(
      CHANNELS.mediaLibraryRemoveRoot,
      schemas.MediaLibraryRemoveRootRequest,
      guarded(({ rootId }: { rootId: string }) => library.removeRoot(rootId)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.mediaLibraryScan,
      schemas.MediaLibraryScanRequest,
      guarded(({ rootId }: { rootId?: string }) => library.scan(rootId)),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.mediaLibraryItems,
      schemas.MediaLibraryItemsRequest,
      async ({ kind }) => ({ items: await library.items(kind) }),
      () => ({ items: [] }),
    );
    ctx.ipc.handle(
      CHANNELS.mediaLibraryProgress,
      schemas.MediaLibraryProgressRequest,
      guarded((req: { itemId: string; positionS: number; durationS: number; ended?: boolean }) =>
        library.setProgress(req),
      ),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.mediaLibraryClearProgress,
      schemas.MediaLibraryClearProgressRequest,
      guarded(({ itemId }: { itemId: string }) => library.clearProgress(itemId)),
      invalid,
    );
    ctx.ipc.handleBare(CHANNELS.mediaLibrarySettingsGet, () => library.getSettings());
    ctx.ipc.handle(
      CHANNELS.mediaLibrarySettingsSet,
      schemas.MediaLibrarySettingsSetRequest,
      guarded((patch: Parameters<LibraryService['setSettings']>[0]) => library.setSettings(patch)),
      invalid,
    );

    // Playlists (slice 2) — kept in the index; ids are main's.
    ctx.ipc.handleBare(CHANNELS.mediaLibraryPlaylists, async () => ({
      playlists: await library.playlists(),
    }));
    ctx.ipc.handle(
      CHANNELS.mediaLibraryPlaylistCreate,
      schemas.MediaLibraryPlaylistCreateRequest,
      guarded((req: Parameters<LibraryService['createPlaylist']>[0]) =>
        library.createPlaylist(req),
      ),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.mediaLibraryPlaylistRename,
      schemas.MediaLibraryPlaylistRenameRequest,
      guarded((req: Parameters<LibraryService['renamePlaylist']>[0]) =>
        library.renamePlaylist(req),
      ),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.mediaLibraryPlaylistSetItems,
      schemas.MediaLibraryPlaylistSetItemsRequest,
      guarded((req: Parameters<LibraryService['setPlaylistItems']>[0]) =>
        library.setPlaylistItems(req),
      ),
      invalid,
    );
    ctx.ipc.handle(
      CHANNELS.mediaLibraryPlaylistDelete,
      schemas.MediaLibraryPlaylistDeleteRequest,
      guarded(({ playlistId }: { playlistId: string }) => library.deletePlaylist(playlistId)),
      invalid,
    );

    // Sharing on the network (slice 2) — the server only ever starts from the user's Start.
    ctx.ipc.handleBare(CHANNELS.mediaLibraryLanStatus, () => lan.status());
    ctx.ipc.handle(
      CHANNELS.mediaLibraryLanStart,
      schemas.MediaLibraryLanStartRequest,
      guarded(({ address }: { address?: string }) => lan.start(address)),
      invalid,
    );
    ctx.ipc.handleBare(
      CHANNELS.mediaLibraryLanStop,
      guarded(() => lan.stop()),
    );
    ctx.ipc.handleBare(
      CHANNELS.mediaLibraryLanRegenerate,
      guarded(() => lan.regenerateToken()),
    );
    ctx.ipc.handle(
      CHANNELS.mediaLibraryLanSettingsSet,
      schemas.MediaLibraryLanSettingsSetRequest,
      guarded((patch: Parameters<LibraryLanController['setSettings']>[0]) =>
        lan.setSettings(patch),
      ),
      invalid,
    );
    ctx.ipc.handleBare(CHANNELS.mediaLibraryLanDetectFfmpeg, () => lan.detectFfmpeg());
  },
});
