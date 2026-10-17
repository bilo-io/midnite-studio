import { randomUUID } from 'node:crypto';

import type { StartNodeSessionParams, StartNodeSessionResult, WorkflowsPtyPorts } from '@midnite/studio-feature-workflows/main';
import {
  createActivityClock,
  createActivityDetector,
  createActivityState,
  type ActivityState,
  type BrokerClient,
  type SharedBroker,
} from '@midnite/studio-runtime';
import { WORKFLOW_SESSION_REPO_ID, type AgentDefinition, type TerminalSession } from '@midnite/studio-shared';

import { AGENT_NODE_NEEDS_TERMINAL, createNodeSessionStarter } from './node-session';
import type { ShellRunner } from './shell-runner';

/**
 * Workflow node sessions in Midnite Agents (Phase 113 Theme O slice 4) — an **agent** node on the
 * runtime host's shared broker, a **script** node in a piped login shell.
 *
 * An agent node drives an interactive agent CLI and waits for it to go idle, so it needs a real
 * terminal. Agents ships no pty server; when the runtime host (Studio) has a broker running, Agents
 * attaches to it as a guest and **creates** the node's session there — stamped with `agents` as its
 * owner, so it shows up in Coder's Sessions (and any guest's list) and only Agents may kill it (the
 * broker server enforces that). Its output feeds the same activity detector Studio runs
 * (`runtime/src/broker/activity-detect.ts`), which is what the executor's idle check reads.
 *
 * With no host broker the node fails plainly, as before — it never hangs. A script node stays a piped
 * shell either way: it runs one command and exits, which needs no terminal.
 *
 * Only what Agents created is ever killed: a cancelled node's own pty (the executor's `killPty`), and on
 * quit every one still running (`killAll`). Detaching never touches anyone else's session.
 */
export const NODE_SESSION_COLS = 100;
export const NODE_SESSION_ROWS = 30;

type Owned = {
  agentId: string;
  /** Per session: a multi-byte character split across two chunks must not leak into another pty's text. */
  activity: { decoder: TextDecoder; state: ActivityState; clock: ReturnType<typeof createActivityClock> };
  onData: ((bytes: Uint8Array) => void) | null;
  onExit: ((exitCode: number) => void) | null;
  pending: Uint8Array[];
  exited: number | null;
  client: BrokerClient;
};

export type BrokerNodeSessions = {
  ports: WorkflowsPtyPorts;
  /** Kill every session Agents created that is still running — quit. */
  killAll(): Promise<void>;
  dispose(): Promise<void>;
};

export function createBrokerNodeSessions(options: {
  broker: SharedBroker;
  shell: ShellRunner;
  agents: () => readonly AgentDefinition[];
  /** The environment a session starts with (before the node's own); this process's, by default. */
  baseEnv?: () => Record<string, string>;
  now?: () => number;
  log?: (message: string) => void;
}): BrokerNodeSessions {
  const now = options.now ?? Date.now;
  const log = options.log ?? (() => undefined);
  const owned = new Map<string, Owned>();
  const detector = createActivityDetector(options.agents(), { now, log, onDisabled: () => undefined });
  const startShell = createNodeSessionStarter(options.shell);
  const wired = new WeakSet<BrokerClient>();
  let ticker: ReturnType<typeof setInterval> | null = null;

  const syncTicker = (): void => {
    const live = [...owned.values()].some((o) => o.exited === null);
    if (live && ticker === null) {
      ticker = setInterval(() => {
        for (const o of owned.values()) o.activity.clock.tick();
      }, 1000);
      ticker.unref?.();
    } else if (!live && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  };

  /** Route the client's broadcast output and exits to the sessions Agents owns — once per client. */
  const wire = (client: BrokerClient): void => {
    if (wired.has(client)) return;
    wired.add(client);
    client.onData((ptyId, bytes) => {
      const entry = owned.get(ptyId);
      if (!entry || entry.exited !== null) return;
      const text = entry.activity.decoder.decode(bytes, { stream: true });
      const seen = detector.guess(entry.agentId, entry.activity.state, text);
      if (seen) entry.activity.clock.saw(seen);
      if (entry.onData) entry.onData(bytes);
      else entry.pending.push(bytes);
    });
    client.onExit((ptyId, exitCode) => settle(ptyId, exitCode));
  };

  function settle(ptyId: string, exitCode: number): void {
    const entry = owned.get(ptyId);
    if (!entry || entry.exited !== null) return;
    entry.exited = exitCode;
    entry.activity.clock.dispose();
    entry.onExit?.(exitCode);
    syncTicker();
  }

  async function startAgentSession(params: StartNodeSessionParams): Promise<StartNodeSessionResult> {
    const client = await options.broker.client().catch(() => null);
    if (!client) return { ok: false, message: AGENT_NODE_NEEDS_TERMINAL };
    wire(client);
    const id = randomUUID();
    const created = await client.createPty({
      sessionId: id,
      cwd: params.cwd,
      cols: NODE_SESSION_COLS,
      rows: NODE_SESSION_ROWS,
      env: { ...(options.baseEnv ?? processEnv)(), TERM_PROGRAM: 'midnite-agents', ...params.env },
      initialInput: params.initialInput,
    });
    if (!created.ok) return { ok: false, message: created.message };
    const agentId = params.agentId ?? '';
    owned.set(created.ptyId, {
      agentId,
      activity: { decoder: new TextDecoder(), state: createActivityState(), clock: createActivityClock({ now, onChange: () => undefined }) },
      onData: null,
      onExit: null,
      pending: [],
      exited: null,
      client,
    });
    syncTicker();
    const session: TerminalSession = {
      id,
      kind: 'agent',
      ...(params.agentId === undefined ? {} : { agentId: params.agentId }),
      title: 'Workflow',
      name: params.nodeLabel,
      cwd: params.cwd,
      repoId: WORKFLOW_SESSION_REPO_ID,
      createdAt: now(),
      workflowRunRef: { workflowId: params.workflowId, runId: params.runId, nodeId: params.nodeId },
      ...(params.backend === undefined ? {} : { backend: params.backend }),
      ...(params.ollamaModel === undefined ? {} : { ollamaModel: params.ollamaModel }),
    };
    return { ok: true, session, ptyId: created.ptyId };
  }

  const ports: WorkflowsPtyPorts = {
    startNodeSession: (params) => (params.kind === 'agent' ? startAgentSession(params) : startShell(params)),
    onPty(ptyId, onData, onExit) {
      const entry = owned.get(ptyId);
      if (!entry) return options.shell.onPty(ptyId, onData, onExit);
      entry.onData = onData;
      entry.onExit = onExit;
      for (const bytes of entry.pending.splice(0)) onData(bytes);
      if (entry.exited !== null) onExit(entry.exited);
    },
    offPty(ptyId) {
      const entry = owned.get(ptyId);
      if (!entry) return options.shell.offPty(ptyId);
      entry.onData = null;
      entry.onExit = null;
      if (entry.exited !== null) owned.delete(ptyId);
    },
    killPty(ptyId) {
      const entry = owned.get(ptyId);
      if (!entry) return options.shell.killPty(ptyId);
      if (entry.exited === null) void entry.client.killPty(ptyId);
    },
    activityFor: (ptyId) => owned.get(ptyId)?.activity.clock.current() ?? null,
  };

  const killAll = async (): Promise<void> => {
    const running = [...owned.entries()].filter(([, entry]) => entry.exited === null);
    await Promise.all(running.map(([ptyId, entry]) => entry.client.killPty(ptyId).catch(() => false)));
  };

  return {
    ports,
    killAll,
    dispose: async () => {
      await killAll();
      if (ticker !== null) clearInterval(ticker);
      ticker = null;
      await options.broker.dispose();
    },
  };
}

/** This process's environment as a pty's: strings only. */
function processEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string') env[key] = value;
  return env;
}
