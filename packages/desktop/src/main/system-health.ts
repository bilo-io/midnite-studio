import {
  fetchOllamaPort,
  parseSshVersion,
  probeBinary,
  readSystemHealth as readSystemHealthWith,
  startSshAgent,
  type OllamaPort,
} from '@midnite/studio-feature-monitor/main';
import type { SystemHealth, ToolchainBinary } from '@midnite/studio-shared';

import { ollamaVersion, resolveOllamaBaseUrl } from '@midnite/studio-feature-models/main';

/**
 * The toolchain/ssh-agent/Ollama probes moved into the monitor feature's main
 * half (Phase 113 Theme I) — `probeBinary` is still imported from here by the
 * media and optimizer handlers, so this stays as their path. `readSystemHealth`
 * binds desktop's own Ollama client to the feature's probe port.
 */
export type { SystemHealth, ToolchainBinary };
export { fetchOllamaPort, parseSshVersion, probeBinary, startSshAgent };

export const DESKTOP_OLLAMA: OllamaPort = {
  baseUrl: () => resolveOllamaBaseUrl(),
  version: ({ baseUrl, timeoutMs }) => ollamaVersion({ baseUrl, timeoutMs }),
};

export const readSystemHealth = (): Promise<SystemHealth> => readSystemHealthWith(DESKTOP_OLLAMA);
