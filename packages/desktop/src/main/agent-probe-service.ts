import type { AgentDefinition, AgentProbeState, AgentStatus } from '@midnite/studio-shared';

import { probeAgents } from './agent-probe';

/**
 * What the renderer is told about agent installs: results plus where the probe
 * stands. `checking` is a real state — until the first answer arrives nothing
 * may claim an agent is installed or missing.
 */
export type AgentProbeSnapshot = { status: AgentStatus[]; probe: AgentProbeState };

export type AgentProbeServiceDeps = {
  getRoster: () => Promise<AgentDefinition[]>;
  /** Pushed on every state change; production broadcasts to all windows. */
  emit: (snapshot: AgentProbeSnapshot) => void;
  probe?: (
    agents: readonly AgentDefinition[],
    opts: { force: boolean },
  ) => Promise<AgentStatus[]>;
  log?: (message: string) => void;
};

export type AgentProbeService = {
  snapshot(): AgentProbeSnapshot;
  /** Whether any probe has ever been requested. */
  started(): boolean;
  /**
   * Run a probe and push the result. `force` bypasses the TTL cache (renderer
   * reload, manual re-check). Concurrent calls share one run.
   */
  start(opts?: { force?: boolean }): Promise<AgentProbeSnapshot>;
};

/**
 * The single owner of "which agents are installed", in main.
 *
 * It exists so that probing is never a side effect of a menu opening: the app
 * starts one right after `whenReady` (off the first-paint path, fire and
 * forget), every renderer load forces another, and the TTL in `probeAgents`
 * still lets a CLI installed in the terminal un-grey itself on the next one.
 *
 * Fail-soft: a probe that produced no usable frame for a non-empty roster (shell
 * killed on the timeout, broken rc file) is `unknown` — surfaced, but it keeps
 * whatever answer was held before and never reports anything as missing.
 */
export function createAgentProbeService(deps: AgentProbeServiceDeps): AgentProbeService {
  const probe = deps.probe ?? ((agents, opts) => probeAgents(agents, opts));
  let current: AgentProbeSnapshot = { status: [], probe: 'checking' };
  let began = false;
  let inFlight: Promise<AgentProbeSnapshot> | null = null;

  const publish = (next: AgentProbeSnapshot): void => {
    current = next;
    deps.emit(next);
  };

  return {
    snapshot: () => current,
    started: () => began,
    start(opts = {}) {
      began = true;
      if (inFlight) return inFlight;
      // Re-probing with an answer in hand keeps showing it; only a probe with
      // nothing to show reports `checking`.
      if (current.status.length === 0 && current.probe !== 'checking') {
        publish({ status: [], probe: 'checking' });
      }
      const run = (async (): Promise<AgentProbeSnapshot> => {
        try {
          const roster = await deps.getRoster();
          const statuses = await probe(roster, { force: opts.force === true });
          const answered = statuses.length > 0 || roster.length === 0;
          publish(
            answered
              ? { status: statuses, probe: 'ready' }
              : { status: current.status, probe: 'unknown' },
          );
        } catch (error) {
          deps.log?.(
            `[agent-probe] failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          publish({ status: current.status, probe: 'unknown' });
        }
        return current;
      })().finally(() => {
        inFlight = null;
      });
      inFlight = run;
      return run;
    },
  };
}
