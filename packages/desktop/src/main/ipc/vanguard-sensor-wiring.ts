import type { PtyOutputChunk, PtyOutputSource } from '@midnite/studio-feature-vanguard/main';

/**
 * Wires Vanguard's two session-aware sensor inputs to the terminal layer (Phase 120 Theme D). Pure over
 * injected seams (no `electron`, no pty-service import) so it is tested under bare vitest.
 *
 * Read-only: the source only observes bytes a pty already produced, and the session list is only read.
 */

export interface TerminalRow {
  session: { id: string; kind?: string; agentId?: string };
  live: { pid: number } | null;
}

export interface VanguardWiringSeams {
  /** Observe every pty's output; returns an unsubscribe (pty-service's `observePtyOutput`). */
  observe(observer: (ptyId: string, bytes: Uint8Array) => void): () => void;
  /** The session behind a pty, if any (pty-service's `sessionIdFor`). */
  sessionIdFor(ptyId: string): string | undefined;
  /** A session ended (pty-service's `onSessionExit`); drops its decoder. Optional. */
  onSessionExit?(hook: (sessionId: string) => void): () => void;
  /** The terminal sessions and their live ptys (terminal-service's `listTerminals`). */
  listTerminals(): Promise<readonly TerminalRow[]>;
}

const agentIdOf = (row: TerminalRow): string | undefined =>
  row.session.kind === 'agent' && row.session.agentId ? row.session.agentId : undefined;

/** `pid -> sessionId` of every live agent pty: the roots the process sensor attributes descendants to. */
export function agentSessionPids(seams: VanguardWiringSeams): () => Promise<Map<number, string>> {
  return async () => {
    const out = new Map<number, string>();
    for (const row of await seams.listTerminals())
      if (row.live !== null && agentIdOf(row) !== undefined) out.set(row.live.pid, row.session.id);
    return out;
  };
}

/** The paste sensor's output source: chunks from agent ptys only, carrying the session id and agent id. */
export function agentPtyOutputSource(seams: VanguardWiringSeams): PtyOutputSource {
  return {
    subscribe(listener) {
      /** `null`: known not to be an agent, so its output is dropped before any work. */
      const agents = new Map<string, string | null>();
      /** One streaming decoder per agent session, so a split multi-byte character never joins another pty's bytes. */
      const decoders = new Map<string, TextDecoder>();
      let chain: Promise<unknown> = Promise.resolve();
      let live = true;
      const unobserve = seams.observe((ptyId, bytes) => {
        const sessionId = seams.sessionIdFor(ptyId);
        if (sessionId === undefined || agents.get(sessionId) === null) return;
        // The chunk's bytes are kept as they arrive; decoding and the agent lookup happen in order per session.
        const copy = bytes.slice();
        chain = chain
          .then(async () => {
            if (!live) return;
            if (!agents.has(sessionId)) {
              const row = (await seams.listTerminals()).find((r) => r.session.id === sessionId);
              // A session not saved yet is looked up again on the next chunk, never cached as "not an agent".
              if (row) agents.set(sessionId, agentIdOf(row) ?? null);
            }
            const agentId = agents.get(sessionId);
            if (!agentId) return;
            let decoder = decoders.get(sessionId);
            if (!decoder) decoders.set(sessionId, (decoder = new TextDecoder()));
            const chunk: PtyOutputChunk = {
              sessionId,
              agentId,
              data: decoder.decode(copy, { stream: true }),
            };
            listener(chunk);
          })
          .catch(() => undefined);
      });
      const unexit = seams.onSessionExit?.((sessionId) => {
        decoders.delete(sessionId);
        agents.delete(sessionId);
      });
      return () => {
        live = false;
        unobserve();
        unexit?.();
        decoders.clear();
      };
    },
  };
}
