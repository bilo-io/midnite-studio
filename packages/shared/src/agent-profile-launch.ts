/**
 * Custom agents (Phase 154) — how a profile becomes a typed command line.
 *
 * Pure tables and helpers, shared so main's `agentProfile:prepareLaunch` (the
 * one place that builds the line) and a headless companion run read the same
 * rules. The system prompt is always read from a *file*, never typed: that keeps
 * newlines (which `shellQuote` flattens) and keeps the typed line short.
 */
import type { AgentProfile } from './agent-profiles';
import { agentHeadlessArgs, agentInvocationArgs, shellQuote } from './agent-invocation';
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
  /** A first prompt for the session (a skill hand-off): one shell-quoted word, after the agent's own prompt. */
  prompt?: string | undefined;
  /**
   * `'headless'` types the base CLI's print mode ahead of the prompt (a skill hand-off in headless mode), with
   * the same model, socket and prompt-file words. Needs a first prompt and a base with a print mode;
   * anything else, and every resume, stays interactive.
   */
  mode?: 'interactive' | 'headless' | undefined;
}

/** The whole typed line, with no trailing `\r`. Pure. */
export function buildProfileLaunchLine(input: ProfileLaunchLineInput): string {
  const { base, model, promptPath, delivery, mcpArgs, resume } = input;
  const first = input.prompt?.trim() ? shellQuote(input.prompt) : null;
  const printMode = input.mode === 'headless' && first !== null && !resume ? agentHeadlessArgs(base.id) : null;
  if (printMode !== null) {
    let words: string[] = [];
    if (promptPath !== null && delivery === 'flag') {
      words = ['--append-system-prompt-file', shellQuote(promptPath), first!];
    } else if (promptPath !== null && delivery === 'argument') {
      words = [`"$(cat ${shellQuote(promptPath)}; printf '\\n\\n%s' ${first})"`];
    } else {
      words = [first!];
    }
    return [base.command, ...base.args, ...printMode, ...profileModelArgs(base.id, model).map(shellWord), ...mcpArgs, ...words].join(' ');
  }
  let promptWords: string[] = [];
  if (promptPath !== null) {
    if (delivery === 'flag') {
      promptWords = ['--append-system-prompt-file', shellQuote(promptPath), ...(first ? [first] : [])];
    } else if (delivery === 'argument' && !resume) {
      // One positional word carries both: the agent's prompt file, then the first prompt after a blank line.
      const joined = first ? `$(cat ${shellQuote(promptPath)}; printf '\\n\\n%s' ${first})` : `$(cat ${shellQuote(promptPath)})`;
      promptWords = [...agentInvocationArgs(base.id, 'interactive'), `"${joined}"`];
    } else if (first) {
      promptWords = [...(delivery === 'argument' ? agentInvocationArgs(base.id, 'interactive') : []), first];
    }
  } else if (first) {
    promptWords = [...agentInvocationArgs(base.id, 'interactive'), first];
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
 *
 * #1697: Codex has no strict flag, so a restricted Codex agent turns each of the user's other servers off
 * by name (`otherMcpServers`, read from their config by main) with `-c mcp_servers.<name>.enabled=false`
 * (checked on codex 0.162.0; `-c mcp_servers={…}` merges rather than replaces). `-c` splits its key on
 * every dot, so a name outside {@link CODEX_MCP_NAME_PATTERN} (`a.b`) cannot be a dotted key; #1713: those go
 * in one inline table, `-c mcp_servers={"a.b"={enabled=false}}`, whose quoted key stays whole. It leads the
 * words, because a later `-c mcp_servers={…}` replaces the earlier `mcp_servers.*` overrides (the `midnite`
 * keys) while dotted keys after it merge in (both checked on codex 0.162.0).
 */
export function profileMcpArgs(
  baseAgentId: string,
  launch: ProfileShimLaunch,
  options: { restricted: boolean; quote: boolean; otherMcpServers?: readonly string[] },
): string[] {
  const q = options.quote ? shellWord : (word: string) => word;
  if (baseAgentId === 'claude') {
    const config = JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: launch } });
    return ['--mcp-config', q(config), ...(options.restricted ? ['--strict-mcp-config'] : [])];
  }
  if (baseAgentId === 'codex') {
    const server = `mcp_servers.${MCP_SERVER_NAME}`;
    const env = `{ ${Object.entries(launch.env).map(([k, v]) => `${k} = ${tomlString(v)}`).join(', ')} }`;
    const disabled = options.restricted ? codexDisableArgs(options.otherMcpServers ?? []) : { table: [], keys: [] };
    return [
      ...disabled.table.map(q),
      '-c',
      q(`${server}.command=${tomlString(launch.command)}`),
      '-c',
      q(`${server}.args=[${launch.args.map(tomlString).join(', ')}]`),
      '-c',
      q(`${server}.env=${env}`),
      ...disabled.keys.map(q),
    ];
  }
  return [];
}

/** A Codex MCP server name a `-c mcp_servers.<name>.…` dotted key can address (no dots, no quotes). */
export const CODEX_MCP_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Plain names as dotted keys; any other name in one leading inline table (see {@link profileMcpArgs}). */
function codexDisableArgs(names: readonly string[]): { table: string[]; keys: string[] } {
  const others = [...new Set(names)].filter((name) => name !== MCP_SERVER_NAME);
  const plain = others.filter((name) => CODEX_MCP_NAME_PATTERN.test(name));
  const quoted = others.filter((name) => !CODEX_MCP_NAME_PATTERN.test(name));
  return {
    table: quoted.length > 0 ? ['-c', `mcp_servers={${quoted.map((name) => `${tomlString(name)}={enabled=false}`).join(', ')}}`] : [],
    keys: plain.flatMap((name) => ['-c', `mcp_servers.${name}.enabled=false`]),
  };
}

export interface ProfileHeadlessArgvInput {
  base: AgentDefinition;
  model: string;
  /** The prompt file, when the composed prompt is not empty. */
  promptPath: string | null;
  /** The private socket's shim launch; `null` when the base CLI has none. */
  launch: ProfileShimLaunch | null;
  /** `profile.mcpTools !== null`. */
  restricted: boolean;
  /** #1697: the user's other MCP servers, turned off for a restricted Codex agent. */
  otherMcpServers?: readonly string[];
}

/**
 * A custom agent's one-shot argv (Phase 154 Theme H) — the companion's headless run, with no shell between
 * it and the CLI, so nothing is quoted. Everything but the final prompt word: base args, print mode, model,
 * private MCP socket and (Claude) the prompt file flag. A base with `'argument'` delivery takes the prompt
 * file's *text* ahead of the question instead, which the caller adds. `null` when the base has no print mode.
 */
export function buildProfileHeadlessArgv(input: ProfileHeadlessArgvInput): string[] | null {
  const headless = agentHeadlessArgs(input.base.id);
  if (headless === null) return null;
  return [...input.base.args, ...headless, ...buildProfileHeadlessExtras(input)];
}

/**
 * What a custom agent adds to a one-shot run beyond the base CLI's own print-mode words: its model, its
 * private MCP socket and (Claude) the prompt file flag. {@link buildProfileHeadlessArgv} is these after the
 * base args; a caller with its own invocation (a chat turn, which streams and resumes) puts them before its
 * final prompt word instead.
 */
export function buildProfileHeadlessExtras(input: ProfileHeadlessArgvInput): string[] {
  const { base, model, promptPath, launch, restricted, otherMcpServers } = input;
  const promptWords =
    promptPath !== null && promptDeliveryFor(base.id) === 'flag' ? ['--append-system-prompt-file', promptPath] : [];
  return [
    ...profileModelArgs(base.id, model),
    ...(launch ? profileMcpArgs(base.id, launch, { restricted, quote: false, ...(otherMcpServers ? { otherMcpServers } : {}) }) : []),
    ...promptWords,
  ];
}
