import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

type Media = MidniteStudioBridge['media'];

/**
 * The slice of `window.midniteStudio` Creator exposes — what media-core, Docs, Images, Video and Audio read, and
 * nothing else: the media store, its change and export events, Docs' export, Images' generation,
 * Audio's generate/import and Video's own `video` namespace. No `secrets` namespace at all, so a provider key cannot be read from the renderer
 * even by accident; no git, pty or browser (`bridge.test.ts` holds the list).
 */
export type CreatorBridge = {
  /** The whole Video surface — projects, the studio, renders, the toolchain, Setup and the engine. */
  video: MidniteStudioBridge['video'];
  media: Pick<Media, 'project' | 'file' | 'reveal' | 'ffmpegStatus' | 'export' | 'cancelExport' | 'onChanged' | 'onExportProgress'> & {
    image: Pick<Media['image'], 'providers' | 'generate' | 'cancel' | 'onProgress'>;
    // No `gm` — the General MIDI library belongs to the music editor, which Creator does not have yet.
    audio: Pick<
      Media['audio'],
      'providers' | 'import' | 'onProgress' | 'generate' | 'cancel' | 'engine' | 'installEngine' | 'onEngineProgress' | 'expand'
    >;
    doc: Pick<Media['doc'], 'export'>;
  };
};

export type { RendererIpc };

export function createCreatorBridge(ipc: RendererIpc): CreatorBridge {
  const { call, subscribe } = createBridgeSlice(ipc);
  return {
    video: {
      project: {
        list: () => call(CHANNELS.videoProjectList),
        get: (req) => call(CHANNELS.videoProjectGet, req),
        create: (req) => call(CHANNELS.videoProjectCreate, req),
        remove: (req) => call(CHANNELS.videoProjectRemove, req),
      },
      studio: {
        start: (req) => call(CHANNELS.videoStudioStart, req),
        stop: (req) => call(CHANNELS.videoStudioStop, req),
        status: (req) => call(CHANNELS.videoStudioStatus, req),
      },
      render: {
        start: (req) => call(CHANNELS.videoRenderStart, req),
        cancel: (req) => call(CHANNELS.videoRenderCancel, req),
        list: (req) => call(CHANNELS.videoRenderList, req),
      },
      toolchain: (req) => call(CHANNELS.videoToolchain, req),
      files: (req) => call(CHANNELS.videoProjectFiles, req),
      readFile: (req) => call(CHANNELS.videoProjectReadFile, req),
      revealFile: (req) => call(CHANNELS.videoFileReveal, req),
      openFile: (req) => call(CHANNELS.videoFileOpen, req),
      root: {
        get: () => call(CHANNELS.videoRootGet),
        set: (req) => call(CHANNELS.videoRootSet, req),
        resolve: (req) => call(CHANNELS.videoRootResolve, req),
      },
      setup: (req) => call(CHANNELS.videoSetup, req),
      engine: {
        get: (req) => call(CHANNELS.videoEngineGet, req),
        set: (req) => call(CHANNELS.videoEngineSet, req),
      },
      onStudioChanged: (handler) => subscribe(EVENT_CHANNELS.videoStudioChanged, handler),
      onRenderProgress: (handler) => subscribe(EVENT_CHANNELS.videoRenderProgress, handler),
    },
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
      audio: {
        providers: () => call(CHANNELS.mediaAudioProviders),
        import: (req) => call(CHANNELS.mediaAudioImport, req),
        onProgress: (handler) => subscribe(EVENT_CHANNELS.mediaAudioProgress, handler),
        generate: (req) => call(CHANNELS.mediaAudioGenerate, req),
        cancel: (req) => call(CHANNELS.mediaAudioCancel, req),
        engine: () => call(CHANNELS.mediaAudioEngine),
        installEngine: () => call(CHANNELS.mediaAudioEngineInstall),
        onEngineProgress: (handler) => subscribe(EVENT_CHANNELS.mediaAudioEngineProgress, handler),
        expand: (req) => call(CHANNELS.mediaAudioExpand, req),
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
