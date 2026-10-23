import { createCommandTracker } from '@midnite/studio-runtime';
import type { NewAgentAuditRecord } from '@midnite/studio-shared';

/**
 * Records the command lines typed into agent ptys (Phase 121 Theme G). Pure over injected seams — no
 * `electron`, no pty-service import — so it is tested under bare vitest. Read-only: it observes bytes a pty
 * already carries and never writes to one. Only sessions that are agent sessions are tracked; a plain shell
 * the user types into is not the audit trail's business.
 */
export interface AgentCommandAuditSeams {
  observeInput(observer: (ptyId: string, data: string) => void): () => void;
  observeOutput(observer: (ptyId: string, bytes: Uint8Array) => void): () => void;
  sessionIdFor(ptyId: string): string | undefined;
  onSessionExit(hook: (sessionId: string) => void): () => void;
  listTerminals(): Promise<readonly { session: { id: string; kind?: string; agentId?: string; cwd?: string } }[]>;
  record(record: NewAgentAuditRecord): void;
}

export function startAgentCommandAudit(seams: AgentCommandAuditSeams): () => void {
  /** `null` = known not to be an agent session. */
  const agents = new Map<string, { agentId: string; cwd?: string } | null>();
  const decoders = new Map<string, TextDecoder>();
  const tracker = createCommandTracker(({ sessionId, command, source }) => {
    const agent = agents.get(sessionId);
    if (!agent) return;
    seams.record({
      kind: 'command',
      sessionId,
      command,
      source,
      agentId: agent.agentId,
      ...(agent.cwd ? { cwd: agent.cwd } : {}),
    });
  });
  // Chunks are handled in order per process, because the session lookup is async.
  let chain: Promise<unknown> = Promise.resolve();
  const handle = (ptyId: string, feed: (sessionId: string) => void): void => {
    const sessionId = seams.sessionIdFor(ptyId);
    if (sessionId === undefined || agents.get(sessionId) === null) return;
    chain = chain
      .then(async () => {
        if (!agents.has(sessionId)) {
          const row = (await seams.listTerminals()).find((r) => r.session.id === sessionId);
          // Not saved yet: looked up again on the next chunk, never cached as "not an agent".
          if (!row) return;
          const { kind, agentId, cwd } = row.session;
          agents.set(sessionId, kind === 'agent' && agentId ? { agentId, ...(cwd ? { cwd } : {}) } : null);
        }
        if (agents.get(sessionId)) feed(sessionId);
      })
      .catch(() => undefined);
  };
  const offInput = seams.observeInput((ptyId, data) => handle(ptyId, (id) => tracker.input(id, data)));
  const offOutput = seams.observeOutput((ptyId, bytes) => {
    const copy = bytes.slice();
    handle(ptyId, (id) => {
      let decoder = decoders.get(id);
      if (!decoder) decoders.set(id, (decoder = new TextDecoder()));
      tracker.output(id, decoder.decode(copy, { stream: true }));
    });
  });
  const offExit = seams.onSessionExit((sessionId) => {
    tracker.end(sessionId);
    agents.delete(sessionId);
    decoders.delete(sessionId);
  });
  return () => {
    offInput();
    offOutput();
    offExit();
  };
}
