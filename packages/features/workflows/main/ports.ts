import type {
  AgentDefinition,
  AgentOllamaBinding,
  Forge,
  ForgeIssueCommentsResult,
  ForgeIssueCreateResult,
  ForgePull,
  ForgePullCommentsResult,
  ForgeSubscriptionKind,
  ForgeWriteResult,
  SessionActivity,
  StatusCounts,
  TerminalSession,
  TerminalSessionKind,
} from '@midnite/studio-shared';

/**
 * Everything the workflows feature's main half needs from the app that
 * composes it (Phase 113 Theme N) — the services that are not workflows.
 *
 * Workflows is the first feature whose engine reaches that far out: an agent
 * node launches a roster CLI in a terminal session, a gate posts to a forge, a
 * trigger watches pull requests, a `git-status` node reads a working copy. None
 * of those belong to the engine, and an app that has no repository registry, no
 * forge accounts or no terminal sessions (Midnite Agents) must still run every
 * node that does not need them. So each is a **port**: Studio implements them
 * over its pty service, forge adapters and repo registry (`packages/desktop`);
 * Agents implements the few it can (the agent roster, a piped login shell for
 * agent/script nodes) and leaves the rest `undefined`, which the engine reads
 * as "this node kind cannot run here" and reports as that node's own failure —
 * never a crash.
 *
 * The engine, the executors and the stores keep taking their dependencies as
 * parameters (that is how their suites inject fakes); this module is only what
 * the *default* wiring reaches for.
 */

/** The log seam — callable (a `warn`) with explicit levels, like the host's `Logger`. */
export type WorkflowLogger = ((message: string) => void) & {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, err?: unknown): void;
};

/** Discards everything — what logs before a composer has configured the feature, and what tests use. */
export const silentWorkflowLogger: WorkflowLogger = Object.assign(() => undefined, {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});

/** What an agent/script node hands to start a terminal session for one run of one node. */
export type StartNodeSessionParams = {
  workflowId: string;
  runId: string;
  nodeId: string;
  kind: TerminalSessionKind;
  agentId?: string;
  nodeLabel: string;
  cwd: string;
  initialInput: string;
  env?: Record<string, string>;
  backend?: 'native' | 'ollama';
  ollamaModel?: string;
};

export type StartNodeSessionResult =
  | { ok: true; session: TerminalSession; ptyId: string }
  | { ok: false; message: string };

/** The slice of a forge adapter a gate, a `forge-comment` node and a `forge-issue` node use. */
export type WorkflowForgeAdapter = {
  commentPull(forge: Forge, number: number, body: string): Promise<ForgeWriteResult>;
  commentIssue(forge: Forge, number: number, body: string): Promise<ForgeWriteResult>;
  pullComments(forge: Forge, number: number): Promise<ForgePullCommentsResult>;
  issueComments(forge: Forge, number: number): Promise<ForgeIssueCommentsResult>;
  createIssue(
    forge: Forge,
    request: { title: string; body?: string; labels?: string[]; assignees?: string[]; milestone?: string },
  ): Promise<ForgeIssueCreateResult>;
};

export type ResolvedWorkflowForge = { forge: Forge; adapter: WorkflowForgeAdapter };

/** Forge-shaped needs. Absent in an app with no forge accounts. */
export type WorkflowsForgePorts = {
  /** The repo's forge and adapter, or `null` when it is not open or has no supported remote. */
  resolveAdapter(repoId: string): Promise<ResolvedWorkflowForge | null>;
  /** The login this app comments as on a forge — a gate only honours a decision from that account. */
  commentOwnerLogin(forge: Forge): Promise<string | null>;
  /** A repo's open pull requests, one-shot, or `null` on any failure. */
  fetchOpenPulls(repoId: string): Promise<ForgePull[] | null>;
  /** The shared poller's subscription seam — what a `forge-pr` trigger rides. */
  subscribePulls(repoId: string): void;
  unsubscribePulls(repoId: string): void;
  onChanged(listener: (repoId: string, kind: ForgeSubscriptionKind) => void): () => void;
};

/** Working-copy reads for a `git-status` node. Absent in an app with no repository registry. */
export type WorkflowsRepoPorts = {
  resolveWorkdir(repoId: string): Promise<string | null>;
  currentBranch(path: string): Promise<string | null>;
  revParse(path: string, rev: string): Promise<string | null>;
  readStatusCounts(path: string): Promise<StatusCounts>;
};

export type WorkflowsPtyPorts = {
  onPty(ptyId: string, onData: (bytes: Uint8Array) => void, onExit: (exitCode: number) => void): void;
  offPty(ptyId: string): void;
  killPty(ptyId: string): void;
  /** The pty's current activity, or `null` when it is not tracked (an app without a pty tracks none). */
  activityFor(ptyId: string): SessionActivity | null;
  /**
   * Starts one node's session. Studio mints a terminal session (so the run's node shows up in the
   * Terminal view) and pushes it to the window; Agents has no terminal view and starts a piped shell.
   */
  startNodeSession(params: StartNodeSessionParams): Promise<StartNodeSessionResult>;
};

export type WorkflowsPorts = {
  log: WorkflowLogger;
  /** The agent roster an `agent`, `ai-*` or `verify` node resolves against. */
  listAgents(): Promise<AgentDefinition[]>;
  /** The per-agent Ollama binding mirrored from Settings, if any. */
  agentBinding(agentId: string): AgentOllamaBinding | undefined;
  ollamaBaseUrl(): string;
  /** The Ollama cloud key — read in main, typed into one session's environment, never an answer to a channel. */
  ollamaApiKey(): Promise<string | null>;
  /** One non-interactive prompt to a local Ollama model (the `ai-*` nodes' local path). */
  ollamaPrompt(
    model: string,
    prompt: string,
    timeoutMs: number,
  ): Promise<{ ok: true; data: string } | { ok: false; message: string }>;
  pty: WorkflowsPtyPorts;
  /** Absent where there is no repository registry. */
  repos?: WorkflowsRepoPorts;
  /** Absent where there are no forge accounts. */
  forge?: WorkflowsForgePorts;
  /** Desktop notification and clipboard seams for the `notify` and `clipboard` nodes. */
  desktop?: {
    notify?: { isSupported(): boolean; show(input: { title: string; body: string }): void };
    writeClipboard?: (text: string) => Promise<void> | void;
  };
};

let current: WorkflowsPorts | null = null;

/** The composer's one call, before any workflow runs. `null` resets (tests). */
export function configureWorkflowsPorts(next: WorkflowsPorts | null): void {
  current = next;
}

export function workflowsPorts(): WorkflowsPorts {
  if (!current) throw new Error('The workflows feature is not configured: call configureWorkflowsPorts first.');
  return current;
}

/** The configured ports, or `null` before configuration — for the few readers that degrade rather than throw. */
export function optionalWorkflowsPorts(): WorkflowsPorts | null {
  return current;
}

/** The log seam, usable before configuration (a trigger or a poll may log before the composer has run). */
export function workflowsLog(): WorkflowLogger {
  return current?.log ?? silentWorkflowLogger;
}
