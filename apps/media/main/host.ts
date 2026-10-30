import { pathToFileURL } from 'node:url';

import { effectiveVideoRoot, stopAllVideoProcesses } from '@midnite/studio-feature-media-video/main';
import {
  creatorMediaRoot,
  creatorModuleMain,
  resolveCreatorFileUrl,
  type CreatorModuleServices,
  type CreatorElectron,
} from '@midnite/studio-module-creator/main';
import {
  mediaModuleMain,
  resolveMediaFileUrl,
  type MediaElectron,
  type MediaServices,
} from '@midnite/studio-module-media/main';
import { createIpcContext, mountModuleMains, type ModuleMount } from '@midnite/studio-runtime';
import { MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

/** What Media's host hands the Creator module on top of Media's own pieces: the media dialogs, printing and ffmpeg. */
export type MediaCreatorPieces = Pick<
  CreatorElectron,
  'report' | 'revealPath' | 'pickSavePath' | 'printToPdf' | 'ffmpegStatus' | 'pickImportFiles' | 'videoTemplateRoot' | 'openPath' | 'readKey' | 'fetch'
> & {
  /** Creator's userData: where its media root and Video's settings live. */
  userData: string;
};

export type MediaHostElectron = MediaElectron & { creator: MediaCreatorPieces };

/**
 * Mounts the Media host's modules — Media and Creator (Phase 124 Theme E.3) — through `mountModuleMains`.
 * Creator's media lives under `<userData>/media` (the Library's index stays in `<userData>/media-library`);
 * Report an Issue is Creator's mount's (Media registers none of its own). Returns the library and LAN server the
 * host disposes on quit, and the quit hook for Creator's watchers and video renders.
 */
export function registerMediaHost(el: MediaHostElectron): MediaServices & { shutdown: () => void } {
  const { creator, ...mediaEl } = el;
  const { userData, ...creatorPieces } = creator;
  const creatorElectron: CreatorElectron = {
    ipcMain: el.ipcMain,
    trashItem: el.trashItem,
    send: el.send,
    mediaRoot: creatorMediaRoot(userData),
    videoSettingsDir: userData,
    ...creatorPieces,
  };
  let services: MediaServices | null = null;
  let stopMedia: (() => void) | null = null;
  const creatorServices: CreatorModuleServices = { electron: creatorElectron, onRegistered: (media) => void (stopMedia = () => media.stopWatchers()) };
  const mounts: ModuleMount[] = [
    { module: mediaModuleMain, services: { electron: mediaEl, onRegistered: (s: MediaServices) => void (services = s) } },
    { module: creatorModuleMain, services: creatorServices },
  ];
  mountModuleMains(createIpcContext(el), mounts);
  if (services === null) throw new Error('the media module did not register');
  return {
    ...(services as MediaServices),
    shutdown: () => {
      stopMedia?.();
      stopAllVideoProcesses();
    },
  };
}

/** The electron pieces the host's one `mstudio-file://` handler needs. */
export type HostProtocolElectron = {
  handle: (scheme: string, handler: (request: { url: string; headers: Headers }) => Promise<Response>) => void;
  /** `net.fetch` of a `file://` URL, forwarding the request's headers so a player's Range requests seek. */
  fetchFile: (fileUrl: string, headers: Headers) => Promise<Response>;
};

/**
 * Electron allows one handler per scheme, so the host's is the two modules' resolvers in turn: the Library's
 * (`mstudio-file://library/…`) first, then Creator's (`repo/<id>/…` and the Video tab's `video/…`). Each answers
 * `null` for a URL that is not its own, and each jails what it serves to its own root; no match is a 404.
 */
export function installMediaHostFileProtocol(
  el: HostProtocolElectron,
  resolveLibrary: (rawUrl: string) => Promise<string | null>,
  userData: string,
): void {
  const mediaRoot = creatorMediaRoot(userData);
  el.handle(MSTUDIO_FILE_SCHEME, async (request) => {
    const target =
      (await resolveMediaFileUrl(request.url, resolveLibrary)) ?? (await resolveCreatorFileUrl(request.url, mediaRoot, effectiveVideoRoot));
    if (!target) return new Response('not found', { status: 404 });
    return el.fetchFile(pathToFileURL(target).toString(), request.headers);
  });
}
