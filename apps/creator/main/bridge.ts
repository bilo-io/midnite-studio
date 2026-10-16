import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

type Media = MidniteStudioBridge['media'];

/**
 * The slice of `window.midniteStudio` Creator exposes — what media-core, Docs and Images read, and
 * nothing else: the media store, its change and export events, Docs' export, and Images'
 * generation. No `secrets` namespace at all, so a provider key cannot be read from the renderer
 * even by accident; no git, pty or browser (`bridge.test.ts` holds the list).
 */
export type CreatorBridge = {
  media: Pick<Media, 'project' | 'file' | 'reveal' | 'ffmpegStatus' | 'export' | 'cancelExport' | 'onChanged' | 'onExportProgress'> & {
    image: Pick<Media['image'], 'providers' | 'generate' | 'cancel' | 'onProgress'>;
    doc: Pick<Media['doc'], 'export'>;
  };
};

export type { RendererIpc };

export function createCreatorBridge(ipc: RendererIpc): CreatorBridge {
  const { call, subscribe } = createBridgeSlice(ipc);
  return {
    media: {
      project: {
        list: (req) => call(CHANNELS.mediaProjectList, req),
        create: (req) => call(CHANNELS.mediaProjectCreate, req),
        rename: (req) => call(CHANNELS.mediaProjectRename, req),
        remove: (req) => call(CHANNELS.mediaProjectRemove, req),
      },
      file: {
        list: (req) => call(CHANNELS.mediaFileList, req),
        read: (req) => call(CHANNELS.mediaFileRead, req),
        write: (req) => call(CHANNELS.mediaFileWrite, req),
        rename: (req) => call(CHANNELS.mediaFileRename, req),
        remove: (req) => call(CHANNELS.mediaFileRemove, req),
      },
      image: {
        providers: () => call(CHANNELS.mediaImageProviders),
        generate: (req) => call(CHANNELS.mediaImageGenerate, req),
        cancel: (req) => call(CHANNELS.mediaImageCancel, req),
        onProgress: (handler) => subscribe(EVENT_CHANNELS.mediaImageProgress, handler),
      },
      reveal: (req) => call(CHANNELS.mediaReveal, req),
      ffmpegStatus: () => call(CHANNELS.mediaFfmpegStatus),
      export: (req) => call(CHANNELS.mediaExport, req),
      cancelExport: (req) => call(CHANNELS.mediaExportCancel, req),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.mediaChanged, handler),
      onExportProgress: (handler) => subscribe(EVENT_CHANNELS.mediaExportProgress, handler),
      doc: {
        export: (req) => call(CHANNELS.mediaDocExport, req),
      },
    },
  };
}
