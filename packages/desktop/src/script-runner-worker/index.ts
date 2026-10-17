import { startScriptRunnerWorker } from '@midnite/studio-feature-api-client/script-runner-worker';

/**
 * Phase 70 Theme B — the `utilityProcess` entry point the API client feature's broker forks. The
 * worker itself (the `vm` sandbox, its allow-list, the message plumbing) lives in the feature
 * (Phase 113 Theme O); this is the one line that hands it Electron's parent port.
 */
startScriptRunnerWorker(process.parentPort);
