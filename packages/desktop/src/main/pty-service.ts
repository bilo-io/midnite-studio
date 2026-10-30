// Moved to the terminal feature — `packages/features/terminal/main` (Phase 123 Theme E.3). The service
// reaches electron's windows, confinement, the secrets vault, the broker and the in-process pty through
// ports; this module binds them to desktop's own, once, and re-exports the service so importers keep their path.
import { BrowserWindow } from 'electron';

import { setPtyPorts } from '@midnite/studio-feature-terminal/main';

import { createBrokerClient, studioBrokerLocation } from './broker-client';
import { confinementService } from './confinement';
import * as inproc from './inproc-pty';
import { readAgentApiKey, readOllamaApiKey } from './ipc/secrets-handlers';
import { windowForRole } from './window-manager';

setPtyPorts({
  windows: { main: () => windowForRole('main'), fromId: (id) => BrowserWindow.fromId(id) },
  confinement: confinementService,
  readAgentApiKey,
  readOllamaApiKey,
  inproc: {
    isPidAlive: inproc.isPidAlive,
    setAgentWatcher: inproc.setInprocAgentWatcher,
    readScrollback: inproc.inprocReadScrollback,
    seedScrollback: inproc.inprocSeedScrollback,
    scrollbackSessionIds: inproc.inprocScrollbackSessionIds,
    dropScrollback: inproc.inprocDropScrollback,
    createPty: inproc.inprocCreatePty,
    writePty: inproc.inprocWritePty,
    resizePty: inproc.inprocResizePty,
    sessionIdFor: inproc.inprocSessionIdFor,
    livePtyFor: inproc.inprocLivePtyFor,
    killPty: inproc.inprocKillPty,
    killAllPtys: inproc.inprocKillAllPtys,
    activePtyPids: inproc.inprocActivePtyPids,
    ptySessionOwners: inproc.inprocPtySessionOwners,
    ptySessionCount: inproc.inprocPtySessionCount,
  },
  broker: { create: createBrokerClient, location: studioBrokerLocation },
});

export * from '@midnite/studio-feature-terminal/main';
