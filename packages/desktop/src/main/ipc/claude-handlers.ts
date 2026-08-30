import type { BrowserWindow } from 'electron';

import { CHANNELS } from '@midnite/studio-shared';

import { getClaudeInfo, runClaudeUpdate } from '../claude-cli';
import { handleBare } from './handle';

/** The Agent settings page's two invokes: probe the CLI, run its update. */
export function registerClaudeHandlers(getWindow: () => BrowserWindow | null): void {
  handleBare(CHANNELS.agentClaudeInfo, () => getClaudeInfo());
  handleBare(CHANNELS.agentClaudeUpdate, () => runClaudeUpdate(getWindow));
}
