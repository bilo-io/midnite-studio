import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

type Media = MidniteStudioBridge['media'];

/**
 * The slice of `window.midniteStudio` Gamer exposes — what media-core and the Maps, Terrain, Sprites and
 * Games tabs read, and nothing else: the media store with its change and export events, the three media
 * namespaces and the whole `games` namespace. No `secrets` namespace at all, so a key cannot be read from
 * the renderer even by accident; no git, pty or browser (`bridge.test.ts` holds the list).
 */
export type GamerBridge = {
  games: MidniteStudioBridge['games'];
  media: Pick<Media, 'project' | 'file' | 'reveal' | 'ffmpegStatus' | 'export' | 'cancelExport' | 'onChanged' | 'onExportProgress' | 'map' | 'terrain' | 'sprite'>;
};

export type { RendererIpc };

export function createGamerBridge(ipc: RendererIpc): GamerBridge {
  const { call, send, subscribe } = createBridgeSlice(ipc);
  return {
    games: {
      settings: {
        get: () => call(CHANNELS.gamesSettingsGet),
        set: (req) => call(CHANNELS.gamesSettingsSet, req),
      },
      list: () => call(CHANNELS.gamesList),
      create: (req) => call(CHANNELS.gamesCreate, req),
      manifest: {
        get: (req) => call(CHANNELS.gamesGetManifest, req),
        set: (req) => call(CHANNELS.gamesSetManifest, req),
      },
      run: (req) => call(CHANNELS.gamesRun, req),
      stop: (req) => call(CHANNELS.gamesStop, req),
      reload: (req) => call(CHANNELS.gamesReload, req),
      // One-way: fires every resize frame.
      setBounds: (req) => send(CHANNELS.gamesSetBounds, req),
      setVisible: (req) => send(CHANNELS.gamesSetVisible, req),
      toolbar: (req) => call(CHANNELS.gamesToolbar, req),
      juice: (req) => call(CHANNELS.gamesJuice, req),
      logs: (req) => call(CHANNELS.gamesLogs, req),
      kitUpgrade: (req) => call(CHANNELS.gamesKitUpgrade, req),
      popOut: (req) => call(CHANNELS.gamesPopOut, req),
      popped: () => call(CHANNELS.gamesPopped),
      onPopState: (handler) => subscribe(EVENT_CHANNELS.gamesPopState, handler),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.gamesChanged, handler),
      onOpen: (handler) => subscribe(EVENT_CHANNELS.gamesOpen, handler),
      onRunState: (handler) => subscribe(EVENT_CHANNELS.gamesRunState, handler),
      onConsole: (handler) => subscribe(EVENT_CHANNELS.gamesConsole, handler),
      agent: {
        run: (req) => call(CHANNELS.gamesAgentRun, req),
        cancel: (req) => call(CHANNELS.gamesAgentCancel, req),
        undo: (req) => call(CHANNELS.gamesAgentUndo, req),
        onProgress: (handler) => subscribe(EVENT_CHANNELS.gamesAgentProgress, handler),
      },
      assets: {
        sources: (req) => call(CHANNELS.gamesAssetSources, req),
        import: (req) => call(CHANNELS.gamesImportAsset, req),
        resync: (req) => call(CHANNELS.gamesResync, req),
      },
      playtests: {
        list: (req) => call(CHANNELS.gamesPlaytests, req),
        run: (req) => call(CHANNELS.gamesPlaytestRun, req),
      },
      export: (req) => call(CHANNELS.gamesExport, req),
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
      reveal: (req) => call(CHANNELS.mediaReveal, req),
      ffmpegStatus: () => call(CHANNELS.mediaFfmpegStatus),
      export: (req) => call(CHANNELS.mediaExport, req),
      cancelExport: (req) => call(CHANNELS.mediaExportCancel, req),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.mediaChanged, handler),
      onExportProgress: (handler) => subscribe(EVENT_CHANNELS.mediaExportProgress, handler),
      map: {
        get: (req) => call(CHANNELS.mediaMapGet, req),
        setView: (req) => call(CHANNELS.mediaMapSetView, req),
        sources: () => call(CHANNELS.mediaMapSources),
        cache: (req) => call(CHANNELS.mediaMapCache, req),
        capture: (req) => call(CHANNELS.mediaMapCapture, req),
        captureCancel: (req) => call(CHANNELS.mediaMapCaptureCancel, req),
        onCaptureProgress: (handler) => subscribe(EVENT_CHANNELS.mediaMapCaptureProgress, handler),
        onOpen: (handler) => subscribe(EVENT_CHANNELS.mediaMapOpen, handler),
      },
      terrain: {
        library: (req) => call(CHANNELS.mediaTerrainLibrary, req),
        get: (req) => call(CHANNELS.mediaTerrainGet, req),
        setSpec: (req) => call(CHANNELS.mediaTerrainSetSpec, req),
        setInput: (req) => call(CHANNELS.mediaTerrainSetInput, req),
        build: (req) => call(CHANNELS.mediaTerrainBuild, req),
        cancel: (req) => call(CHANNELS.mediaTerrainCancel, req),
        paint: (req) => call(CHANNELS.mediaTerrainPaint, req),
        roadKey: (req) => call(CHANNELS.mediaTerrainRoadKey, req),
        export: (req) => call(CHANNELS.mediaTerrainExport, req),
        onProgress: (handler) => subscribe(EVENT_CHANNELS.mediaTerrainProgress, handler),
        onChanged: (handler) => subscribe(EVENT_CHANNELS.mediaTerrainChanged, handler),
        onOpen: (handler) => subscribe(EVENT_CHANNELS.mediaTerrainOpen, handler),
      },
      sprite: {
        library: (req) => call(CHANNELS.mediaSpriteLibrary, req),
        get: (req) => call(CHANNELS.mediaSpriteGet, req),
        setSpec: (req) => call(CHANNELS.mediaSpriteSetSpec, req),
        setReference: (req) => call(CHANNELS.mediaSpriteSetReference, req),
        generate: (req) => call(CHANNELS.mediaSpriteGenerate, req),
        cancel: (req) => call(CHANNELS.mediaSpriteCancel, req),
        patchFrames: (req) => call(CHANNELS.mediaSpritePatchFrames, req),
        export: (req) => call(CHANNELS.mediaSpriteExport, req),
        importMap: (req) => call(CHANNELS.mediaSpriteImportMap, req),
        onProgress: (handler) => subscribe(EVENT_CHANNELS.mediaSpriteProgress, handler),
        onChanged: (handler) => subscribe(EVENT_CHANNELS.mediaSpriteChanged, handler),
        onOpen: (handler) => subscribe(EVENT_CHANNELS.mediaSpriteOpen, handler),
        onRenderRequest: (handler) => subscribe(EVENT_CHANNELS.mediaSpriteRenderRequest, handler),
        renderReady: (req) => call(CHANNELS.mediaSpriteRenderReady, req),
        renderFrames: (req) => call(CHANNELS.mediaSpriteRenderFrames, req),
      },
    },
  };
}
