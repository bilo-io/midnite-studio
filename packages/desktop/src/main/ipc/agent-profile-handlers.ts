import { agentProfilePromptPath, agentProfilesMain, type AgentProfileDialogs } from '@midnite/studio-feature-agent-profiles/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { dialog, type BrowserWindow } from 'electron';

import { createProfileLaunchService } from '../agent-profiles/profile-launch';
import { studioProfileMcpSockets } from '../agent-profiles/studio-profile-sockets';
import { defaultLogger } from '../log';
import { onSessionExit } from '../pty-service';
import { listAgents } from '../terminal-service';
import { handle, handleBare, handleSend } from './handle';

/**
 * Custom agents (Phase 154) are the agent-profiles feature's main half; this is Studio's composition of
 * it. The store lives under `userData` (`index.ts` configures it); the native import / export dialogs are
 * bound here because a dialog is Electron's. `launch` (Themes F + G) builds the typed line over a private
 * MCP socket per session; the socket closes when its session's pty exits.
 */
export function registerAgentProfileHandlers(getWindow: () => BrowserWindow | null): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: () => undefined,
    trashItem: () => Promise.reject(new Error('custom agents never trash')),
  };

  const dialogs: AgentProfileDialogs = {
    pickFile: async ({ title, filters }) => {
      const win = getWindow();
      const options = { title, filters, properties: ['openFile' as const] };
      const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      return picked.canceled ? null : (picked.filePaths[0] ?? null);
    },
    pickSavePath: async ({ title, defaultPath }) => {
      const win = getWindow();
      const options = { title, defaultPath };
      const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      return picked.canceled || !picked.filePath ? null : picked.filePath;
    },
  };

  const launch = createProfileLaunchService({
    sockets: studioProfileMcpSockets(),
    agents: listAgents,
    promptPath: agentProfilePromptPath,
  });
  onSessionExit((sessionId) => {
    void studioProfileMcpSockets()
      .closeForSession(sessionId)
      .catch((error: unknown) => defaultLogger.warn(`agent profile socket: ${String(error)}`));
  });

  agentProfilesMain.register(ctx, { dialogs, launch });
}
