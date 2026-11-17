import { homedir } from 'node:os';

import { resolveHeadlessAgent, toAgentPrompt, type AgentDefinition } from '@midnite/studio-shared';

/**
 * One prompt through the roster's headless CLI (or an Ollama model), answered as trimmed plain text.
 *
 * Moved here from desktop's `ai/improve-field.ts` (Phase 153 Theme A) so any suite app can run a
 * prompt: the runtime may import neither `electron` nor a feature, so the process runner, the
 * agent roster and Ollama come in as ports and the host builds them. The result is a plain
 * envelope; Studio's wrapper maps it back onto `GitOpResult`.
 */

export type HeadlessProcessResult =
  | { ok: true; stdout: string }
  | { ok: false; message: string; timedOut?: boolean };

export type HeadlessTextPorts = {
  /** Run a CLI to completion and hand back its stdout. Never throws. */
  runProcess: (
    command: string,
    args: string[],
    opts: { cwd?: string; timeoutMs: number },
  ) => Promise<HeadlessProcessResult>;
  /** The roster `resolveHeadlessAgent` walks. */
  listAgents: () => Promise<AgentDefinition[]>;
  /** Absent in an app with no Ollama: an Ollama model then fails with a sentence. */
  runOllama?: (
    model: string,
    prompt: string,
    timeoutMs: number,
  ) => Promise<{ ok: true; data: string } | { ok: false; message: string }>;
  /** Working directory when the input names none. Defaults to the home directory. */
  home?: () => string;
  /** Overrides the caller's default timeout. */
  timeoutMs?: number;
};

export type HeadlessTextInput = {
  prompt: string;
  agentId?: string | undefined;
  repoPath?: string | null | undefined;
  ollamaModel?: string | undefined;
  /** Picks the model: the wand passes its cheap tier, a doc edit whatever the thread chose. */
  modelArgs: (agentId: string) => string[];
  /** Names the job in the "no CLI" sentence. */
  what: string;
};

export type HeadlessTextResult = { ok: true; text: string } | { ok: false; message: string };

const fail = (message: string): HeadlessTextResult => ({ ok: false, message });

/** Never throws; an empty reply is a failure, since no caller has a fallback to render. */
export async function runHeadlessText(
  input: HeadlessTextInput,
  ports: HeadlessTextPorts,
  defaultTimeoutMs: number,
): Promise<HeadlessTextResult> {
  const timeoutMs = ports.timeoutMs ?? defaultTimeoutMs;
  if (input.ollamaModel) {
    if (!ports.runOllama) return fail('Ollama is not available in this app.');
    const reply = await ports.runOllama(input.ollamaModel, input.prompt, timeoutMs);
    if (!reply.ok) return fail(reply.message);
    const text = reply.data.trim();
    return text.length === 0 ? fail(`${input.ollamaModel} answered with nothing.`) : { ok: true, text };
  }

  const roster = await ports.listAgents();
  const resolved = resolveHeadlessAgent(roster, input.agentId);
  if (!resolved) {
    return fail(`No agent CLI with a headless mode is installed, so ${input.what} has nothing to run.`);
  }

  const prompt = toAgentPrompt(input.prompt, resolved.agent.id);
  const cwd = input.repoPath ?? (ports.home ?? homedir)();

  const outcome = await ports.runProcess(
    resolved.agent.command,
    [...(resolved.agent.args ?? []), ...resolved.args, ...input.modelArgs(resolved.agent.id), prompt],
    { cwd, timeoutMs },
  );

  if (!outcome.ok) {
    return fail(
      outcome.timedOut
        ? 'That took too long, so the rewrite was cancelled.'
        : `Could not run ${resolved.agent.label}: ${outcome.message}`,
    );
  }

  const text = outcome.stdout.trim();
  return text.length === 0 ? fail(`${resolved.agent.label} answered with nothing.`) : { ok: true, text };
}
