import { systemPreferences, safeStorage, utilityProcess } from 'electron';

import { companionMain } from '@midnite/studio-feature-companion/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import type { MicrophoneAccess } from '@midnite/studio-shared';

import { dispatchMcpCall } from '../mcp/dispatch';
import { livePtyActivityCounts } from '../pty-service';
import { listAgents } from '../terminal-service';
import { handle, handleBare, handleSend } from './handle';

/**
 * The companion's channels (Phase 79/80/81, extracted in Phase 123 Theme F) — the handlers live in
 * `@midnite/studio-feature-companion/main`; this file is Studio's binding: it hands over the reaches
 * only Studio's main owns (the MCP dispatcher, the pty counts, the agent roster, `safeStorage`,
 * `utilityProcess.fork` and macOS's microphone verdict) and registers the feature through
 * desktop's `ipcMain` helpers.
 */
export function registerCompanionHandlers(): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    // The companion pushes through the UI bridge's own window getter (`configureUiBridge`), not `emit`.
    emit: () => {},
    trashItem: async () => {},
  };
  companionMain.register(ctx, {
    dispatch: dispatchMcpCall,
    sessionCounts: livePtyActivityCounts,
    agents: listAgents,
    safeStorage,
    forkUtility: (modulePath, args, options) => utilityProcess.fork(modulePath, args, options),
    microphoneAccess: readMicrophoneAccess,
  });
}

/**
 * macOS's own microphone verdict for this app, for `CompanionSttStatusResponse`.
 *
 * Read rather than requested: Chromium raises the system prompt itself on the
 * first `getUserMedia`, so this only has to tell a refusal macOS made apart
 * from one the app's own permission handler made. `'unknown'` on a platform
 * without the API, or if it throws, so the renderer falls back to its generic
 * sentence rather than guessing.
 */
export function readMicrophoneAccess(): MicrophoneAccess {
  try {
    if (typeof systemPreferences?.getMediaAccessStatus !== 'function') return 'unknown';
    const status = systemPreferences.getMediaAccessStatus('microphone');
    return status === 'granted' ||
      status === 'denied' ||
      status === 'restricted' ||
      status === 'not-determined'
      ? status
      : 'unknown';
  } catch {
    return 'unknown';
  }
}
