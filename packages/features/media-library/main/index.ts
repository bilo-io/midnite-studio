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
import type { LibraryService } from './library-service';

export { mediaLibraryManifest, type MediaLibraryManifest } from '../manifest';
export { libraryFileResolver, resolveLibraryFileUrl } from './file-url';
export { NO_LAN_STREAMING, type LibraryStreamServer } from './lan';
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
};

export const mediaLibraryMain = defineFeatureMain<MediaLibraryMainServices>({
  feature: mediaLibraryManifest.feature,
  channels: mediaLibraryManifest.ipc,
  register(ctx, { library }) {
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
  },
});
