import { createStore, useStore } from 'zustand';

import { bridge } from '@midnite/studio-frame';
import type { BrowserAgentSessionState } from '@midnite/studio-shared';

/**
 * The Browser app's view of an agent driving a tab (Phase 117 Theme G).
 *
 * The session itself lives in main (`features/browser/main/browser-agent-session.ts`): its tools
 * (navigate, read, find, click, type, screenshot), its origin allowlist, its egress gate and the
 * questions it pauses on. This store only mirrors it. `start` asks main for a session, every change
 * arrives as an `agent-session` browser event, and the bar's answers and "Take over" go back over the
 * bridge. Nothing here can drive a page or widen the allowlist.
 *
 * What drives the tools is the agent runtime ([Phase 121](../../../.midnite/tasks/phases/phase-121-agents-security.md)),
 * over `browser.agentTool`. Until it lands, a session starts, gates the tab's egress and waits.
 */
export type AgentSessionState = {
  /** The live session, or `null` when none is driving. */
  session: BrowserAgentSessionState | null;
  /** Why the last start was refused, or the last session's closing line. */
  notice: string | null;
  start: (input: { tabId: string; goal: string; allowlist: string[] }) => Promise<void>;
  stop: () => void;
  respond: (decision: 'allow' | 'deny') => void;
  receive: (state: BrowserAgentSessionState) => void;
};

export const agentSessionStore = createStore<AgentSessionState>((set, get) => ({
  session: null,
  notice: null,
  start: async (input) => {
    const api = bridge()?.browser;
    if (!api) return;
    const result = await api.agentStart(input);
    if (result.ok) set({ session: result.state, notice: null });
    else set({ session: null, notice: result.message });
  },
  stop: () => {
    const s = get().session;
    if (!s) return;
    bridge()?.browser.agentStop({ sessionId: s.sessionId });
    set({ session: null, notice: 'You took the wheel.' });
  },
  respond: (decision) => {
    const s = get().session;
    if (!s?.pending) return;
    bridge()?.browser.agentRespond({ sessionId: s.sessionId, pendingId: s.pending.id, decision });
  },
  receive: (state) => {
    const current = get().session;
    // An event for a session this window did not start (or already let go of) is not adopted.
    if (current !== null && current.sessionId !== state.sessionId) return;
    if (state.status === 'stopped') {
      if (current !== null) set({ session: null, notice: state.log[state.log.length - 1]?.replace(/^\[stop\] /, '') ?? null });
      return;
    }
    set({ session: state });
  },
}));

export function useAgentSession<T>(selector: (state: AgentSessionState) => T): T {
  return useStore(agentSessionStore, selector);
}
