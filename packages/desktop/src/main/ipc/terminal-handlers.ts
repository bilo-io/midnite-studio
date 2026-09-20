import { CHANNELS, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { agentStatusWithin } from '../agent-probe';
import { getBrokerStatus } from '../pty-service';
import {
  forgetTerminal,
  listAgents,
  listTerminals,
  reorderTerminals,
  saveTerminal,
} from '../terminal-service';
import { handleBare, handleSend } from './handle';

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

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

  handleSend(
    CHANNELS.terminalSave,
    schemas.TerminalSaveRequest,
    ({ session }) => saveTerminal(session),
    warnInvalid,
  );

  handleSend(
    CHANNELS.terminalForget,
    schemas.TerminalForgetRequest,
    ({ sessionId, reason }) => forgetTerminal(sessionId, reason ?? 'closed'),
    warnInvalid,
  );

  handleSend(
    CHANNELS.terminalReorder,
    schemas.TerminalReorderRequest,
    ({ sessionIds }) => reorderTerminals(sessionIds),
    warnInvalid,
  );
}
