import { defineFeatureMain } from '@midnite/studio-runtime';
import { CHANNELS, SCROLLBACK_BYTES, schemas } from '@midnite/studio-shared';

import { terminalManifest } from '../manifest';
import {
  createPty,
  fetchScrollbackSnapshot,
  killPty,
  resizePty,
  sessionIdFor,
  subscribeWindowToPty,
  unsubscribeWindowFromPty,
  writePty,
} from './pty-service';
import { forgetTerminal, listAgents, listTerminals, reorderTerminals, saveTerminal } from './terminal-service';
import { trimScrollback } from './terminal-store';

export { terminalManifest, type TerminalManifest } from '../manifest';
export { agentFingerprintEnv, agentKeyEnv } from './pty-env';
export * from './pty-service';
export type * from './pty-ports';
export { createAgentsStore, mergeAgents, type AgentsStore } from './agents-store';
export {
  createSessionHistoryStore,
  evictClosed,
  nullSessionHistoryStore,
  parseHistoryState,
  transcriptPath,
  type SessionHistoryStore,
} from './session-history-store';
export {
  createTerminalStore,
  nullTerminalStore,
  parseStoredSessions,
  safeId,
  scrollbackPath,
  trimScrollback,
  type TerminalStore,
} from './terminal-store';
export {
  agentSessionDetail,
  configureTerminals,
  flushScrollback,
  forgetTerminal,
  getOrLocateConversationId,
  listAgents,
  listSessionIds,
  listTerminals,
  liveAgentSessions,
  noteSessionExitForTest,
  reorderTerminals,
  resetTerminalsForTest,
  saveTerminal,
  setTerminalPorts,
  shutdownTerminals,
  startTerminalFlush,
  watchSessionExits,
  whenArchivesSettle,
  type ForgetIntent,
  type TerminalPorts,
  type TerminalPtyPort,
} from './terminal-service';

/**
 * What the terminal's durable half needs from its composer (Phase 123 Theme E.3).
 *
 * The roster probe and the broker status come from the composer because the probe shells out through
 * the app's login-shell environment and the broker status is the pty service's, which stays in
 * `packages/desktop` while it reaches `electron`, the window manager and confinement.
 */
export type TerminalMainServices = {
  /** The pty service's broker status (`getBrokerStatus`). */
  brokerStatus(): unknown;
  /** The agent probe: `started`/`start` and the last `snapshot` to ship beside the roster. */
  agentProbe(): {
    started(): boolean;
    start(options?: { force?: boolean }): Promise<unknown> | unknown;
    snapshot(): Record<string, unknown>;
  };
  /** Where a malformed one-way payload is reported; dropped when absent. */
  warn?: (issue: string) => void;
};

/**
 * The terminal's session rows — not processes. `list` and the agent roster are `invoke`s because the
 * renderer cannot start without their answers; save, forget and reorder are one-way sends, since a
 * dropped one costs an ordering, not correctness: the next change rewrites the whole list anyway.
 * The pty channels register here too: `create`/`snapshot` are `invoke`s, input/resize/kill are one-way
 * sends fired on every keystroke (a round-trip per key would add typing latency for nothing), and
 * subscribe/unsubscribe are sender-aware (Phase 55) — a popout subscribes ITSELF to a ptyId's output.
 */
export const terminalMain = defineFeatureMain<TerminalMainServices>({
  feature: terminalManifest.feature,
  channels: [
    CHANNELS.terminalList,
    CHANNELS.agentList,
    CHANNELS.agentRecheck,
    CHANNELS.ptyCreate,
    CHANNELS.ptySnapshot,
  ],
  register(ctx, services) {
    const { ipc } = ctx;
    const warn = (issue: string): void => services.warn?.(issue);
    // Sender-aware: the composer must provide `sendFromSender`; refusing loudly beats a silently dead popout.
    // Checked before anything registers, so a refusal leaves no half-registered channels behind.
    const fromSender = ipc.sendFromSender?.bind(ipc);
    if (!fromSender) throw new Error('terminalMain needs an ipc with sendFromSender');

    ipc.handleBare(CHANNELS.terminalList, async () => ({
      sessions: await listTerminals(),
      broker: services.brokerStatus(),
    }));
    /*
      The roster and what this machine has of it, in one answer. `status` may be shorter than `agents`, or
      empty outright — a probe that could not resolve an entry omits it rather than calling it missing, and
      one that has not answered yet ships `probe: 'checking'` rather than making a file read wait on a login
      shell. The renderer shows that as "checking…" and never as installed or missing; the answer follows on
      the `agentStatus` event.
    */
    ipc.handleBare(CHANNELS.agentList, async () => {
      const agents = await listAgents();
      const probe = services.agentProbe();
      // A list before anything has probed (tests, a very early renderer) starts one; it never waits on
      // it — the answer arrives on `agentStatus`.
      if (!probe.started()) void probe.start();
      return { agents, ...probe.snapshot() };
    });
    ipc.handleBare(CHANNELS.agentRecheck, () => services.agentProbe().start({ force: true }));

    ipc.send(CHANNELS.terminalSave, schemas.TerminalSaveRequest, ({ session }) => saveTerminal(session), warn);
    ipc.send(
      CHANNELS.terminalForget,
      schemas.TerminalForgetRequest,
      ({ sessionId, reason }) => forgetTerminal(sessionId, reason ?? 'closed'),
      warn,
    );
    ipc.send(CHANNELS.terminalReorder, schemas.TerminalReorderRequest, ({ sessionIds }) => reorderTerminals(sessionIds), warn);

    ipc.handle(CHANNELS.ptyCreate, schemas.PtyCreateRequest, (req) => createPty(req), (issue) => ({
      ok: false as const,
      message: issue,
    }));
    ipc.send(CHANNELS.ptyInput, schemas.PtyInputRequest, ({ ptyId, data }) => writePty(ptyId, data), warn);
    ipc.send(CHANNELS.ptyResize, schemas.PtyResizeRequest, ({ ptyId, cols, rows }) => resizePty(ptyId, cols, rows), warn);
    ipc.send(CHANNELS.ptyKill, schemas.PtyKillRequest, ({ ptyId }) => killPty(ptyId), warn);
    ipc.handle(
      CHANNELS.ptySnapshot,
      schemas.PtySnapshotRequest,
      async ({ ptyId }) => {
        const sessionId = sessionIdFor(ptyId);
        if (!sessionId) return { bytes: new Uint8Array(0) };
        return { bytes: trimScrollback(await fetchScrollbackSnapshot(sessionId), SCROLLBACK_BYTES) };
      },
      () => ({ bytes: new Uint8Array(0) }),
    );

    fromSender(CHANNELS.ptySubscribe, schemas.PtySubscribeRequest, ({ ptyId }, win) => {
      if (win) subscribeWindowToPty(ptyId, win);
    }, warn);
    fromSender(CHANNELS.ptyUnsubscribe, schemas.PtyUnsubscribeRequest, ({ ptyId }, win) => {
      if (win) unsubscribeWindowFromPty(ptyId, win);
    }, warn);
  },
});
