import type { AgentProbeState, AgentStatus } from '@midnite/studio-shared';
import { create } from 'zustand';

import { bridge } from '../../services/bridge';

/**
 * The ONE renderer-side copy of "which agent CLIs are installed".
 *
 * Main owns the probe (`desktop/src/main/agent-probe-service.ts`): it starts at
 * app boot, re-runs on every renderer load, and pushes each result over
 * `agent.onStatus`. Everything that lists agents reads this store through
 * `useAgents()`; nothing here or anywhere else probes on its own.
 *
 * `probe` is a real state, not a default: `checking` until the first answer
 * (never "installed", never "missing"), `ready` with results, `unknown` when
 * the probe errored or timed out — which, like an absent per-agent status,
 * means "assume it works", not "not installed".
 */
type AgentProbeStore = {
  status: AgentStatus[];
  probe: AgentProbeState;
  /** Whether a pushed event has landed — it supersedes any `agent.list` snapshot. */
  pushed: boolean;
  /** Apply a pushed event (authoritative). */
  applyPush: (event: { status: AgentStatus[]; probe: AgentProbeState }) => void;
  /** Apply the snapshot that came with `agent.list`, unless a push already did. */
  seed: (snapshot: { status: AgentStatus[]; probe?: AgentProbeState }) => void;
  /** Back to `checking` — a manual re-check is in flight with nothing to show. */
  markChecking: () => void;
};

export const useAgentProbeStore = create<AgentProbeStore>((set, get) => ({
  status: [],
  probe: 'checking',
  pushed: false,
  applyPush: ({ status, probe }) => set({ status, probe, pushed: true }),
  seed: ({ status, probe }) => {
    if (get().pushed) return;
    set({ status, probe: probe ?? 'ready' });
  },
  markChecking: () => {
    if (get().status.length === 0) set({ probe: 'checking' });
  },
}));

let subscribed = false;

/**
 * Subscribe to main's pushes, once per renderer. Idempotent and safe without a
 * bridge (jsdom, bare mounts): it simply does nothing and retries next call.
 */
export function ensureAgentProbeSubscription(): void {
  if (subscribed) return;
  const api = bridge();
  if (!api) return;
  subscribed = true;
  api.agent.onStatus((event) => useAgentProbeStore.getState().applyPush(event));
}

/** Ask main for a fresh probe, bypassing its TTL. The answer arrives as a push too. */
export async function recheckAgents(): Promise<void> {
  const api = bridge();
  if (!api) return;
  const store = useAgentProbeStore.getState();
  store.markChecking();
  const snapshot = await api.agent.recheck();
  useAgentProbeStore.getState().applyPush(snapshot);
}

/** Tests only — a fresh store and a re-armed subscription. */
export function resetAgentProbeStore(): void {
  subscribed = false;
  useAgentProbeStore.setState({ status: [], probe: 'checking', pushed: false });
}
