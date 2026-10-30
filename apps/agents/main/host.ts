import { stopAllVideoProcesses } from '@midnite/studio-feature-media-video/main';
import { reportMain } from '@midnite/studio-feature-report/main';
import { agentsModuleMain, type AgentsElectron } from '@midnite/studio-module-agents/main';
import { coderModuleMain, type CoderElectron } from '@midnite/studio-module-coder/main';
import { creatorMediaRoot, creatorModuleMain, type CreatorElectron } from '@midnite/studio-module-creator/main';
import {
  connectRuntimeVault,
  createIpcContext,
  mountModuleMains,
  vaultHostSocketPath,
  type ModuleMount,
} from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

/** Report an Issue's channels, registered once (by the Agents mount); the other mounts leave them to it. */
const REPORT_CHANNELS = [...reportMain.channels, CHANNELS.reportError];

/** What Agents' host hands the Coder module on top of Agents' own pieces: dialogs, windows and the script worker. */
export type AgentsCoderPieces = Pick<
  CoderElectron,
  'pickDirectory' | 'senderWindowId' | 'onWindowClosed' | 'windows' | 'dialogs' | 'scriptWorker' | 'openExternal' | 'warn' | 'fetch' | 'apiFetch'
>;

/** What Agents' host hands the Creator module on top of Agents' own pieces: the media dialogs, printing and ffmpeg. */
export type AgentsCreatorPieces = Pick<
  CreatorElectron,
  'revealPath' | 'pickSavePath' | 'printToPdf' | 'ffmpegStatus' | 'pickImportFiles' | 'videoTemplateRoot' | 'openPath' | 'fetch'
>;

export type AgentsHostElectron = AgentsElectron & {
  coder: AgentsCoderPieces;
  creator: AgentsCreatorPieces;
};

/**
 * Mounts the Agents host's modules — Agents, Coder and Creator (Phase 124 Theme E.3) — through `mountModuleMains`,
 * one registration path for all three, under Agents' own identity: one pairing key, one set of vault grants, one
 * userData. Report an Issue is registered once, by the Agents mount (`shared` on the other two). Creator's media
 * lives under `<userData>/media`. Returns what the host's quit path needs.
 */
export function registerAgentsHost(el: AgentsHostElectron): { shutdown: () => Promise<void> } {
  const { coder, creator, ...agentsEl } = el;
  // Creator's image-provider keys, read in main from the runtime vault as `agents` — never sent to the renderer.
  const vault = connectRuntimeVault({ socketPath: vaultHostSocketPath(el.vaultDirectory), appId: 'agents', identity: el.pairing });
  const coderElectron: CoderElectron = {
    ipcMain: el.ipcMain,
    trashItem: el.trashItem,
    send: el.send,
    report: el.report,
    userData: el.userData,
    vaultDirectory: el.vaultDirectory,
    pairing: el.pairing,
    appId: 'agents',
    ...coder,
  };
  const creatorElectron: CreatorElectron = {
    ipcMain: el.ipcMain,
    trashItem: el.trashItem,
    send: el.send,
    report: el.report,
    mediaRoot: creatorMediaRoot(el.userData),
    videoSettingsDir: el.userData,
    readKey: (key) => vault.get('secrets', key),
    ...creator,
  };
  let disposeAgents: (() => Promise<void>) | null = null;
  let disposeCoder: (() => Promise<void>) | null = null;
  let stopMedia: (() => void) | null = null;
  const mounts: ModuleMount[] = [
    { module: agentsModuleMain, services: { electron: agentsEl, onRegistered: (r) => void (disposeAgents = r.dispose) } },
    {
      module: coderModuleMain,
      services: { electron: coderElectron, onRegistered: (r) => void (disposeCoder = r.shutdown) },
      shared: REPORT_CHANNELS,
    },
    {
      module: creatorModuleMain,
      services: { electron: creatorElectron, onRegistered: (media) => void (stopMedia = () => media.stopWatchers()) },
      shared: REPORT_CHANNELS,
    },
  ];
  mountModuleMains(createIpcContext(el), mounts);
  return {
    // A council member's shell, an in-flight workflow, Coder's collection runs, script worker and database
    // connections, Creator's watchers and video render processes: each is stopped here, and only then does quit go on.
    shutdown: async () => {
      stopMedia?.();
      stopAllVideoProcesses();
      await Promise.all([disposeAgents?.(), disposeCoder?.()]);
      vault.close();
    },
  };
}
