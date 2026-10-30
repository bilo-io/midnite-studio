import { pathToFileURL } from 'node:url';

import { effectiveVideoRoot, resolveHandoffPath, stopAllVideoProcesses } from '@midnite/studio-feature-media-video/main';
import { mediaCoreMain } from '@midnite/studio-feature-media-core/main';
import {
  gamerModuleMain,
  resolveGamerFileUrl,
  type GamerElectron,
  type GamerServices,
} from '@midnite/studio-module-gamer/main';
import { CREATOR_REPO_ID, creatorModuleMain, resolveCreatorFileUrl, type CreatorElectron } from '@midnite/studio-module-creator/main';
import {
  connectRuntimeVault,
  createIpcContext,
  mountModuleMains,
  vaultHostSocketPath,
  type ModuleMount,
} from '@midnite/studio-runtime';
import { MSTUDIO_FILE_SCHEME } from '@midnite/studio-shared';

/** What Gamer's host hands the Creator module on top of Gamer's own pieces: Report an Issue, printing and Audio's import. */
export type GamerCreatorPieces = Pick<CreatorElectron, 'report' | 'printToPdf' | 'pickImportFiles' | 'videoTemplateRoot' | 'openPath' | 'fetch'>;

export type GamerHostElectron = Omit<GamerElectron, 'extraRepoIds' | 'resolveVideoExportInput'> & { creator: GamerCreatorPieces };

/**
 * Mounts the Gamer host's modules — Gamer and Creator (Phase 124 Theme E.3) — through `mountModuleMains`. Both
 * serve one media root (`<userData>/media`), so there is one media service and one media-core: Gamer's mount
 * registers it (resolving Creator's repo id too, and Video's outputs for export), and Creator's mount leaves its
 * media-core channels to it (`shared`) and builds on Gamer's service. Report an Issue is Creator's mount's.
 * Returns Gamer's services for the quit path, and the hook that stops Creator's video renders.
 */
export function registerGamerHost(el: GamerHostElectron): GamerServices & { shutdown: () => void } {
  const { creator, ...gamerEl } = el;
  // Creator's image-provider keys, read in main from the runtime vault as `gamer` — never sent to the renderer.
  const vault = connectRuntimeVault({ socketPath: vaultHostSocketPath(el.vaultDirectory), appId: 'gamer', identity: el.pairing });
  let services: GamerServices | null = null;
  const gamerElectron: GamerElectron = {
    ...gamerEl,
    extraRepoIds: [CREATOR_REPO_ID],
    resolveVideoExportInput: async (projectId, name) => {
      const resolved = await resolveHandoffPath(projectId, 'output', name);
      return resolved.ok ? resolved.path : null;
    },
  };
  const creatorElectron: CreatorElectron = {
    ipcMain: el.ipcMain,
    trashItem: el.trashItem,
    send: el.send,
    mediaRoot: el.mediaRoot,
    videoSettingsDir: el.userData,
    revealPath: el.revealPath,
    pickSavePath: el.pickSavePath,
    ffmpegStatus: el.ffmpegStatus,
    readKey: (key) => vault.get('secrets', key),
    media: () => {
      if (services === null) throw new Error('the Gamer module registers before the Creator module');
      return services.media;
    },
    ...creator,
  };
  const mounts: ModuleMount[] = [
    { module: gamerModuleMain, services: { electron: gamerElectron, onRegistered: (s: GamerServices) => void (services = s) } },
    { module: creatorModuleMain, services: { electron: creatorElectron }, shared: mediaCoreMain.channels },
  ];
  mountModuleMains(createIpcContext(el), mounts);
  if (services === null) throw new Error('the Gamer module did not register');
  const gamer: GamerServices = services;
  return {
    ...gamer,
    close: () => {
      gamer.close();
      vault.close();
    },
    shutdown: () => stopAllVideoProcesses(),
  };
}

/** The electron pieces the host's one `mstudio-file://` handler needs. */
export type HostProtocolElectron = {
  handle: (scheme: string, handler: (request: { url: string }) => Promise<Response>) => void;
  fetchFile: (fileUrl: string) => Promise<Response>;
};

/**
 * Electron allows one handler per scheme, so the host's is the two modules' resolvers in turn: Gamer's
 * (`repo/<gamer repo id>/…`), then Creator's (`repo/<creator repo id>/…` and the Video tab's `video/…`). Each
 * answers `null` for a URL that is not its own and jails what it serves to the one media root; no match is a 404.
 */
export function installGamerHostFileProtocol(el: HostProtocolElectron, mediaRoot: string): void {
  el.handle(MSTUDIO_FILE_SCHEME, async (request) => {
    const target = (await resolveGamerFileUrl(request.url, mediaRoot)) ?? (await resolveCreatorFileUrl(request.url, mediaRoot, effectiveVideoRoot));
    if (!target) return new Response('not found', { status: 404 });
    return el.fetchFile(pathToFileURL(target).toString());
  });
}
