import { CHANNELS, schemas } from '@midnite/git-shared';
import { ipcMain } from 'electron';

import { agentStatusWithin } from '../agent-probe';
import { getBrokerStatus } from '../pty-service';
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
  handleBare(CHANNELS.terminalList, async () => ({
    sessions: await listTerminals(),
    broker: getBrokerStatus(),
  }));
  /*
    The roster and what this machine has of it, in one answer. `status` may be
    shorter than `agents`, or empty outright — a probe that could not resolve an
    entry omits it rather than calling it missing, and one that has not answered
    inside `FIRST_ANSWER_MS` ships nothing at all rather than making a file read
    wait on a login shell. The renderer reads absent as "assume it works", so
    every one of those degradations costs the menu an explanation and never an
    item.
  */
  handleBare(CHANNELS.agentList, async () => {
    const agents = await listAgents();
    return { agents, status: await agentStatusWithin(agents) };
  });

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
