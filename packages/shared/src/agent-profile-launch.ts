/**
 * Custom agents (Phase 154) — how a profile becomes a typed command line.
 *
 * Pure tables and helpers, shared so main's `agentProfile:prepareLaunch` (the
 * one place that builds the line) and a headless companion run read the same
 * rules. The system prompt is always read from a *file*, never typed: that keeps
 * newlines (which `shellQuote` flattens) and keeps the typed line short.
 */
import type { AgentProfile } from './agent-profiles';
import { agentInvocationArgs, shellQuote } from './agent-invocation';
import { modelArgsFor, modelsForAgent } from './ai-models';
import { LoopModelSchema, loopModelArgs } from './loops';
import { MCP_SERVER_NAME } from './media-model-mcp';
import type { AgentDefinition } from './terminal';

/** How a base CLI receives the prompt file: a flag, a quoted `$(cat file)` argument, or not at all. */
export type PromptDelivery = 'flag' | 'argument' | 'none';

/**
 * Agents whose interactive start already takes a prompt word in `start-agent.ts`.
 * `aider` (`--message`) and `copilot` (`suggest`) are one-shot invocations that
 * exit after answering, so they are not offered a system prompt.
 */
const ARGUMENT_PROMPT_AGENTS: ReadonlySet<string> = new Set([
  'codex',
  'agy',
  'opencode',
  'openclaude',
  'goose',
  'cursor',
  'grok',
  'cline',
  'kilo',
]);

export function promptDeliveryFor(baseAgentId: string): PromptDelivery {
  if (baseAgentId === 'claude') return 'flag';
  return ARGUMENT_PROMPT_AGENTS.has(baseAgentId) ? 'argument' : 'none';
}

/** Whether main can restrict a base CLI's midnite tools and count its tool calls (a private MCP socket). */
export function enforcementFor(baseAgentId: string): { tools: boolean; toolCallLimit: boolean } {
  const supported = baseAgentId === 'claude' || baseAgentId === 'codex';
  return { tools: supported, toolCallLimit: supported };
}

/** The text of the prompt file: the system prompt, then a skills nudge. `''` when both are empty. */
export function composeProfilePrompt(profile: Pick<AgentProfile, 'systemPrompt' | 'skills'>): string {
  const prompt = profile.systemPrompt.trim();
  if (profile.skills.length === 0) return prompt;
  const skills = `Prefer these skills when they fit: ${profile.skills.join(', ')}.`;
  return prompt === '' ? skills : `${prompt}\n\n${skills}`;
}

/**
 * The model flag words for `model` (a model-list id) on `baseAgentId`; `[]` for `'default'`. Only an id
 * from the base CLI's own list ever reaches the line: an imported agent file can carry any string, and
 * these words are typed into a shell, so an unknown id adds no flag rather than being passed through.
 */
export function profileModelArgs(baseAgentId: string, model: string): string[] {
  if (model === 'default') return [];
  if (baseAgentId === 'claude') {
    const loopModel = LoopModelSchema.safeParse(model);
    return loopModel.success ? loopModelArgs('claude', loopModel.data) : [];
  }
  const entry = modelsForAgent(baseAgentId).find((candidate) => candidate.id === model);
  return entry ? modelArgsFor(baseAgentId, entry.cliModel ?? entry.id) : [];
}

/**
 * One shell word, single-quoted unless it is plainly safe. Unlike `shellQuote` it keeps the text exactly
 * (no whitespace folding), so a JSON or TOML value survives the trip through the shell unchanged.
 */
export function shellWord(text: string): string {
  return /^[A-Za-z0-9_./:=@%+,-]+$/.test(text) ? text : `'${text.replace(/'/g, String.raw`'\''`)}'`;
}

export interface ProfileLaunchLineInput {
  base: AgentDefinition;
  model: string;
  promptPath: string | null;
  delivery: PromptDelivery;
  mcpArgs: string[];
  resume: boolean;
}

/** The whole typed line, with no trailing `\r`. Pure. */
export function buildProfileLaunchLine(input: ProfileLaunchLineInput): string {
  const { base, model, promptPath, delivery, mcpArgs, resume } = input;
  let promptWords: string[] = [];
  if (promptPath !== null) {
    if (delivery === 'flag') {
      promptWords = ['--append-system-prompt-file', shellQuote(promptPath)];
    } else if (delivery === 'argument' && !resume) {
      promptWords = [...agentInvocationArgs(base.id, 'interactive'), `"$(cat ${shellQuote(promptPath)})"`];
    }
  }
  return [
    base.command,
    ...base.args,
    ...(resume ? (base.resume ?? []) : []),
    ...profileModelArgs(base.id, model).map(shellWord),
    ...mcpArgs,
    ...promptWords,
  ].join(' ');
}

/** How an agent CLI starts the midnite stdio shim on a custom agent's private socket. */
export type ProfileShimLaunch = { command: string; args: string[]; env: Record<string, string> };

const tomlString = (value: string): string => JSON.stringify(value);

/**
 * The words that point a base CLI's `midnite` MCP server at a private socket (Phase 154 Theme G). A
 * per-launch `midnite` replaces a globally registered one for both CLIs (G1, checked 2026-11-25), so
 * `--strict-mcp-config` is added only when the agent's tools are restricted, which also drops the user's
 * other MCP servers. Codex's `-c` deep-merges into a global entry key by key, so all three keys are set.
 * `quote` shell-quotes each word for a typed line; a headless argv passes `false`. `[]` for other CLIs.
 */
export function profileMcpArgs(
  baseAgentId: string,
  launch: ProfileShimLaunch,
  options: { restricted: boolean; quote: boolean },
): string[] {
  const q = options.quote ? shellWord : (word: string) => word;
  if (baseAgentId === 'claude') {
    const config = JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: launch } });
    return ['--mcp-config', q(config), ...(options.restricted ? ['--strict-mcp-config'] : [])];
  }
  if (baseAgentId === 'codex') {
    const server = `mcp_servers.${MCP_SERVER_NAME}`;
    const env = `{ ${Object.entries(launch.env).map(([k, v]) => `${k} = ${tomlString(v)}`).join(', ')} }`;
    return [
      '-c',
      q(`${server}.command=${tomlString(launch.command)}`),
      '-c',
      q(`${server}.args=[${launch.args.map(tomlString).join(', ')}]`),
      '-c',
      q(`${server}.env=${env}`),
    ];
  }
  return [];
}
