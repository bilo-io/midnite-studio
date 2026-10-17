import { BrowserWindow, dialog } from 'electron';

import { mediaGameMain, type GameAgentsPort, type GamePlaytestsPort, type GamesRuntime } from '@midnite/studio-feature-media-game/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';

import { defaultLogger } from '../log';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';

/**
 * `mstudio:games:*` (Phase 107 Themes A + B) — composed here from the `media-game` feature (Phase 113
 * Theme S), which owns the thin adapters over one `GameService`. This is Studio's half: the Electron
 * save dialog for a single-file export, and the agent and play-test services that still live in this
 * package (they need the Model tab's iterative harness and the MCP server) passed in as ports.
 */
export function registerGamesHandlers(runtime: GamesRuntime, agents?: GameAgentsPort, playtests?: GamePlaytestsPort): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: () => Promise.reject(new Error('games never trash through this context')),
  };
  mediaGameMain.register(ctx, {
    runtime,
    log: defaultLogger,
    pickSavePath: async (options) => {
      const win = BrowserWindow.getFocusedWindow();
      const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      return picked.canceled || !picked.filePath ? null : picked.filePath;
    },
    agents,
    playtests,
  });
}
