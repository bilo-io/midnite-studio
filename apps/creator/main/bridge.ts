import { createReportBridge, type ReportBridge } from '@midnite/studio-feature-report/bridge';
import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

type Media = MidniteStudioBridge['media'];

/**
 * The slice of `window.midniteStudio` Creator exposes — what media-core, Docs, Images, Video and Audio read, and
 * nothing else: the media store, its change and export events, Docs' export, Images' generation,
 * Audio's generate/import, the music editor's songs and Video's own `video` namespace. No `secrets` namespace at all, so a provider key cannot be read from the renderer
 * even by accident; no git, pty or browser (`bridge.test.ts` holds the list).
 */
export type CreatorBridge = {
  /** Report an Issue: the dialog's channels and the Help-menu event (`createReportBridge`). */
  report: ReportBridge;
  /** The whole Video surface — projects, the studio, renders, the toolchain, Setup and the engine. */
  video: MidniteStudioBridge['video'];
  media: Pick<Media, 'project' | 'file' | 'reveal' | 'ffmpegStatus' | 'export' | 'cancelExport' | 'onChanged' | 'onExportProgress'> & {
    image: Pick<Media['image'], 'providers' | 'generate' | 'cancel' | 'onProgress'>;
    audio: Pick<
      Media['audio'],
      'providers' | 'import' | 'onProgress' | 'generate' | 'cancel' | 'engine' | 'installEngine' | 'onEngineProgress' | 'expand' | 'gm'
    >;
    // The editor's song store and exports. No agent engines, chat thread or Antigravity (Creator has no
    // agents); `onChanged`/`onOpen` are the MCP server's, which Creator does not run, so they never fire.
    music: Pick<Media['music'], 'list' | 'read' | 'write' | 'import' | 'delete' | 'export' | 'sendToGenerator' | 'onChanged' | 'onOpen'>;
    doc: Pick<Media['doc'], 'export'>;
  };
};

export type { RendererIpc };

export function createCreatorBridge(ipc: RendererIpc): CreatorBridge {
  const { call, send, subscribe } = createBridgeSlice(ipc);
  return {
    // Report an Issue — the report feature's own preload half (`@midnite/studio-feature-report/bridge`).
    report: createReportBridge({ call, send, subscribe }),
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
        gm: {
          status: () => call(CHANNELS.mediaGmStatus),
          ensure: (req) => call(CHANNELS.mediaGmEnsure, req),
          load: (req) => call(CHANNELS.mediaGmLoad, req),
          onProgress: (handler) => subscribe(EVENT_CHANNELS.mediaGmProgress, handler),
        },
      },
      music: {
        list: (req) => call(CHANNELS.mediaMusicList, req),
        read: (req) => call(CHANNELS.mediaMusicRead, req),
        write: (req) => call(CHANNELS.mediaMusicWrite, req),
        import: (req) => call(CHANNELS.mediaMusicImport, req),
        delete: (req) => call(CHANNELS.mediaMusicDelete, req),
        export: (req) => call(CHANNELS.mediaMusicExport, req),
        sendToGenerator: (req) => call(CHANNELS.mediaMusicSendToGenerator, req),
        onChanged: (handler) => subscribe(EVENT_CHANNELS.mediaMusicChanged, handler),
        onOpen: (handler) => subscribe(EVENT_CHANNELS.mediaMusicOpen, handler),
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
