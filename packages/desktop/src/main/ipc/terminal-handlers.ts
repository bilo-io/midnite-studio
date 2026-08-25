import { CHANNELS, schemas } from '@midnite/git-shared';
import { ipcMain } from 'electron';

import {
  forgetTerminal,
  listAgents,
  listTerminals,
  reorderTerminals,
  saveTerminal,
} from '../terminal-service';
import { handleBare } from './handle';

/**
 * The durable half of the terminal — session rows, not processes.
 *
 * `list` and the agent roster are `invoke`s because the renderer cannot start
 * without their answers. Save, forget and reorder are one-way `send`s: they are
 * bookkeeping, and a dropped one costs the user an ordering, not correctness —
 * the next change rewrites the whole list anyway.
 */
export function registerTerminalHandlers(): void {
  handleBare(CHANNELS.terminalList, async () => ({ sessions: await listTerminals() }));
  handleBare(CHANNELS.agentList, async () => ({ agents: await listAgents() }));

  ipcMain.on(CHANNELS.terminalSave, (_event, raw: unknown) => {
    const parsed = schemas.TerminalSaveRequest.safeParse(raw);
    if (parsed.success) saveTerminal(parsed.data.session);
  });

  ipcMain.on(CHANNELS.terminalForget, (_event, raw: unknown) => {
    const parsed = schemas.TerminalForgetRequest.safeParse(raw);
    if (parsed.success) forgetTerminal(parsed.data.sessionId);
  });

  ipcMain.on(CHANNELS.terminalReorder, (_event, raw: unknown) => {
    const parsed = schemas.TerminalReorderRequest.safeParse(raw);
    if (parsed.success) reorderTerminals(parsed.data.sessionIds);
  });
}
