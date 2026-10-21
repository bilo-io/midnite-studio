import { createStore, useStore } from 'zustand';

/**
 * An agent driving the browser — what #853 settled Browser adds beyond Studio's pane: a session in which
 * an agent navigates, inspects and verifies while the user watches, and can take the wheel back.
 *
 * **Still a placeholder.** Nothing drives a tab yet: starting a session records its goal and "Step"
 * appends a simulated action to the log, exactly as #853's mock host did. The real thing needs an agent
 * runtime with tools over the tabs' `WebContents` (navigate, read, click) — a main-side contract this
 * slice does not add. The chrome is in place so that contract has somewhere to land.
 */
export type AgentSessionState = {
  active: boolean;
  status: 'idle' | 'navigating' | 'inspecting' | 'verifying' | 'interacting';
  goal?: string;
  lastAction?: string;
  logs: string[];
};

type AgentSessionStore = AgentSessionState & {
  start: (goal: string) => void;
  step: (action: string) => void;
  stop: () => void;
};

export const agentSessionStore = createStore<AgentSessionStore>((set) => ({
  active: false,
  status: 'idle',
  logs: [],
  start: (goal) =>
    set({ active: true, status: 'navigating', goal, lastAction: `Started session: ${goal}`, logs: [`[agent] Session started with goal: ${goal}`] }),
  step: (action) => set((s) => ({ lastAction: action, status: 'interacting', logs: [...s.logs, `[agent] ${action}`] })),
  stop: () => set((s) => ({ active: false, status: 'idle', logs: [...s.logs, '[agent] Session stopped by user'] })),
}));

export function useAgentSession<T>(selector: (state: AgentSessionStore) => T): T {
  return useStore(agentSessionStore, selector);
}
