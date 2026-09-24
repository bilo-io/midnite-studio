import { activityFor, killPty, offPty, onPty } from '../../pty-service';
import { listAgents } from '../../terminal-service';
import { startNodeSession, type StartNodeSessionParams, type StartNodeSessionResult } from '../node-sessions';

/**
 * What `executors/agent.ts` and `executors/script.ts` need from the outside
 * world — injected so the checklist's "executor lifecycle for agent/script
 * nodes (fake pty)" tests never spawn a real shell, the same reasoning
 * `EngineDeps`/`CompanionAskDeps` already follow in this codebase. Both
 * executors default to {@link defaultNodePtyDeps}, which is the real thing.
 */
export type NodePtyDeps = {
  listAgents: typeof listAgents;
  startSession: (params: StartNodeSessionParams) => Promise<StartNodeSessionResult>;
  onPty: typeof onPty;
  offPty: typeof offPty;
  killPty: typeof killPty;
  activityFor: typeof activityFor;
  now: () => number;
};

export const defaultNodePtyDeps: NodePtyDeps = {
  listAgents,
  startSession: startNodeSession,
  onPty,
  offPty,
  killPty,
  activityFor,
  now: Date.now,
};

/**
 * Poll cadence for cancellation and (agent nodes only) the marker+idle
 * check — matches `http.ts`'s own cancel poll and `delay.ts`'s settle poll,
 * neither of which this module invents a third number for.
 */
export const NODE_PTY_POLL_MS = 100;
