import { CHANNELS, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { agentProbe } from '../agent-probe-runtime';
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
    yet ships `probe: 'checking'` rather than making a file read wait on a login
    shell. The renderer shows that as "checking…" and never as installed or
    missing; the answer follows on the `agentStatus` event.
  */
  handleBare(CHANNELS.agentList, async () => {
    const agents = await listAgents();
    const probe = agentProbe();
    // A list before anything has probed (tests, a very early renderer) starts
    // one; it never waits on it — the answer arrives on `agentStatus`.
    if (!probe.started()) void probe.start();
    return { agents, ...probe.snapshot() };
  });
  handleBare(CHANNELS.agentRecheck, () => agentProbe().start({ force: true }));

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
