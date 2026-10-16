import type { AgentDefinition } from '@midnite/studio-shared';

import {
  workflowsPorts,
  type StartNodeSessionParams,
  type StartNodeSessionResult,
  type WorkflowsPtyPorts,
} from '../../ports';

/**
 * What `executors/agent.ts` and `executors/script.ts` need from the outside
 * world — injected so the checklist's "executor lifecycle for agent/script
 * nodes (fake pty)" tests never spawn a real shell, the same reasoning
 * `EngineDeps`/`CompanionAskDeps` already follow in this codebase. Both
 * executors default to {@link defaultNodePtyDeps}, which is the real thing.
 */
export type NodePtyDeps = {
  listAgents: () => Promise<AgentDefinition[]>;
  startSession: (params: StartNodeSessionParams) => Promise<StartNodeSessionResult>;
  onPty: WorkflowsPtyPorts['onPty'];
  offPty: WorkflowsPtyPorts['offPty'];
  killPty: WorkflowsPtyPorts['killPty'];
  activityFor: WorkflowsPtyPorts['activityFor'];
  now: () => number;
};

export const defaultNodePtyDeps: NodePtyDeps = {
  listAgents: () => workflowsPorts().listAgents(),
  startSession: (params) => workflowsPorts().pty.startNodeSession(params),
  onPty: (ptyId, onData, onExit) => workflowsPorts().pty.onPty(ptyId, onData, onExit),
  offPty: (ptyId) => workflowsPorts().pty.offPty(ptyId),
  killPty: (ptyId) => workflowsPorts().pty.killPty(ptyId),
  activityFor: (ptyId) => workflowsPorts().pty.activityFor(ptyId),
  now: Date.now,
};

/**
 * Poll cadence for cancellation and (agent nodes only) the marker+idle
 * check — matches `http.ts`'s own cancel poll and `delay.ts`'s settle poll,
 * neither of which this module invents a third number for.
 */
export const NODE_PTY_POLL_MS = 100;
