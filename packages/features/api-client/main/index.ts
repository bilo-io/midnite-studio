import { defineFeatureMain } from '@midnite/studio-runtime';

import { apiClientManifest } from '../manifest';
import { cancelAllApiRuns, registerApiClientHandlers, type ApiClientDialogs } from './handlers/api-client-handlers';
import { configureApiClient, disposeScriptRunner, type ScriptRunner } from './services';

export { apiClientManifest, type ApiClientManifest } from '../manifest';
export { type ApiClientDialogs } from './handlers/api-client-handlers';
export {
  createScriptRunnerBroker,
  scriptRunnerWorkerPath,
  type ScriptWorkerHandle,
} from './script-runner-broker';
// `startScriptRunnerWorker` is deliberately not here: it pulls the `vm` sandbox in, and the sandbox runs
// only in the worker process — never inside main's own bundle. Apps reach it through the
// package's `./script-runner-worker` export.
export { unavailableScriptRunner, type ScriptRunner } from './services';

/**
 * The API client feature's main half (Phase 113 Theme O) — collections, environments, history, the
 * send engine, the collection runner and the script runner's IPC, moved out of
 * `packages/desktop/src/main/api-client` and `ipc/api-client-handlers.ts`.
 *
 * What only the composer knows arrives here:
 *
 * - **`workdir`** — a repository's checkout from a `repoId` (`null` for one that is no longer open).
 *   Every collection, environment and history file is confined to it.
 * - **`dialogs`** — the native open and save pickers (`ApiClientDialogs`). The renderer never names a path.
 * - **`scriptRunner`** — runs a user script in a separate OS process the composer forks
 *   (`createScriptRunnerBroker({ spawn })` over Electron's `utilityProcess`). Left out, scripts answer
 *   "cannot run in this app" and nothing runs. **The sandbox did not move**: the `vm` allow-list is still
 *   `script-runner.ts`, run by the worker; the child is killed on a cancelled run, a timeout and quit.
 * - **`fetch`** — the HTTP transport; the global `fetch` when absent. Tests inject a fake.
 *
 * Call {@link shutdownApiClient} on quit: it aborts running collection runs and kills the script child.
 */
export type ApiClientMainServices = {
  workdir: (repoId: string) => Promise<string | null>;
  dialogs: ApiClientDialogs;
  scriptRunner?: ScriptRunner;
  fetch?: typeof fetch;
};

export const apiClientMain = defineFeatureMain<ApiClientMainServices>({
  feature: apiClientManifest.feature,
  channels: apiClientManifest.ipc,
  register(ctx, services) {
    configureApiClient({
      workdir: services.workdir,
      ...(services.scriptRunner ? { scriptRunner: services.scriptRunner } : {}),
      ...(services.fetch ? { fetch: services.fetch } : {}),
    });
    registerApiClientHandlers(ctx, services.dialogs);
  },
});

/** Quit: stop every running collection run and kill the script runner's child process. */
export function shutdownApiClient(): void {
  cancelAllApiRuns();
  disposeScriptRunner();
}
