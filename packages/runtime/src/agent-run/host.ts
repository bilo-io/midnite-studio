/**
 * An in-app agent run's host (Phase 113 Theme S) — what an iterative run needs from the app that composes it:
 * a **private** MCP server answering one scoped dispatcher, the stdio shim an agent CLI launches to reach it,
 * the roster entry for the CLI, and a way to run it. Media ▸ Models' iterative engine and Media ▸ Games' agent
 * loop both drive a run through this one shape; Studio and Gamer each implement it (Studio's
 * `desktop/src/main/media/iterative-host.ts`, Gamer's `apps/gamer/main/agent-host.ts`).
 *
 * Declared here, not in either feature, because a feature may not import another feature.
 */

/** One answer of a private server's dispatcher — the MCP response arms, minus the id. */
export type DispatchResult = { ok: true; value: unknown } | { ok: false; kind: 'error' | 'not-found' | 'refused'; message: string };
/** A private server's whole tool surface: the run decides what each tool id answers (or refuses). */
export type ScopedDispatch = (tool: string, input: unknown) => Promise<DispatchResult>;

/** A roster CLI, resolved: the exact id the user picked, its command and the flags that make it headless. */
export type ResolvedAgent = {
  id: string;
  label: string;
  command: string;
  baseArgs: string[];
  headlessArgs: string[];
};

export type CliRequest = {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  /** Called once the CLI is spawned; `kill` ends its whole process group. */
  onSpawned: (handle: { kill: () => void }) => void;
};
export type CliResult =
  | { ok: true; exitCode: number | null; output: string; stderr: string }
  | { ok: false; reason: 'not-installed' | 'timed-out' | 'parse-failed'; hint: string };

export type IterativeHost = {
  /** Start the private MCP server answering `dispatch` on a fresh socket; `message` says why it could not. */
  startServer: (req: { dispatch: ScopedDispatch }) => Promise<{ ok: true; socketPath: string; close: () => Promise<void> } | { ok: false; message: string }>;
  /** How an MCP client launches the stdio shim for a socket. */
  shimLaunch: (socketPath: string) => { command: string; args: string[]; env: Record<string, string> };
  resolveAgent: (agentId: string) => Promise<ResolvedAgent | null>;
  runCli: (req: CliRequest) => Promise<CliResult>;
};

/** A run is a conversation of many tool calls; 20 minutes is generous without being open-ended. */
export const AGENT_RUN_TIMEOUT_MS = 20 * 60_000;
/** Hard ceiling on tool calls in one run, whatever the agent does. */
export const AGENT_RUN_MAX_CALLS = 400;
