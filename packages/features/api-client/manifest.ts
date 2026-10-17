import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The API client feature — one of Coder's tabs (Phase 113 Theme O).
 *
 * The main half is the collection and environment stores (Postman v2.1 files
 * under `.midnite/api/` in the open repository), request history, the send
 * engine, the collection runner and the sandboxed `pm.*` script runner, moved
 * out of `packages/desktop/src/main/api-client` and `ipc/api-client-handlers.ts`.
 * Every channel takes a `repoId`, never a path: main resolves the checkout from
 * the composer's `workdir` port, and every file it reads or writes is confined
 * to that checkout.
 *
 * **The script runner executes user code**, so it keeps its sandbox exactly: the
 * `vm` allow-list lives in `main/script-runner.ts`, the code runs in a separate
 * OS process the composer forks, and that process is killed on a cancelled run,
 * on a timeout and on quit. A collection's scripts only run once the user has
 * trusted it on this machine (`collection-trust.ts`).
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const apiClientManifest = defineFeatureManifest({
  feature: 'api-client',
  owner: 'coder',
  views: [
    {
      id: 'apiClient',
      global: false,
      rail: { group: 'workspace', label: 'API Client', description: 'Send requests from collections stored in the repository' },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.apiListCollections,
    CHANNELS.apiReadCollection,
    CHANNELS.apiSaveCollection,
    CHANNELS.apiImportCollection,
    CHANNELS.apiDeleteCollection,
    CHANNELS.apiExportCollection,
    CHANNELS.apiSendRequest,
    CHANNELS.apiCancelRequest,
    CHANNELS.apiPickBinaryFile,
    CHANNELS.apiListEnvironments,
    CHANNELS.apiReadEnvironment,
    CHANNELS.apiSaveEnvironment,
    CHANNELS.apiDeleteEnvironment,
    CHANNELS.apiListHistory,
    CHANNELS.apiClearHistory,
    CHANNELS.apiRunScript,
    CHANNELS.apiSetScriptTrust,
    CHANNELS.apiRunCollection,
    CHANNELS.apiCancelRun,
  ],
  events: [EVENT_CHANNELS.apiRunProgress, EVENT_CHANNELS.apiRunDone],
  mcpTools: [],
});

export type ApiClientManifest = typeof apiClientManifest;
