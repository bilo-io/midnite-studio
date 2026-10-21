import { startScriptRunnerWorker } from '@midnite/studio-feature-api-client/script-runner-worker';

/**
 * The `utilityProcess` entry the API client's script broker forks (bundled beside `main.cjs` as
 * `script-runner-worker.cjs`): its own OS process, no Electron APIs, no main-process privileges. The
 * sandbox itself — the `vm` allow-list, the context flags, `pm.expect` — is the feature's
 * `script-runner.ts`, unchanged; this is the one line that hands it Electron's parent port.
 */
startScriptRunnerWorker(process.parentPort);
