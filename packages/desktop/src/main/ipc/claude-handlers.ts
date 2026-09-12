import { BrowserWindow, shell } from 'electron';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import { getClaudeInfo, runClaudeUpdate } from '../claude-cli';
import { handle, handleBare } from './handle';

/** The Agent settings page's invokes: probe the CLI, run update, reveal in Finder. */
export function registerClaudeHandlers(getWindow: () => BrowserWindow | null): void {
  handleBare(CHANNELS.agentClaudeInfo, () => getClaudeInfo());
  handleBare(CHANNELS.agentClaudeUpdate, () => runClaudeUpdate(getWindow));
  handle(
    CHANNELS.agentRevealPath,
    schemas.AgentRevealPathRequest,
    async ({ path }) => {
      shell.showItemInFolder(path);
      return { ok: true };
    },
    (issue) => ({ ok: false, message: issue }),
  );
}

