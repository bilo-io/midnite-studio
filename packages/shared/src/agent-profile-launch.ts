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

/** The model flag words for `model` (a model-list id) on `baseAgentId`; `[]` for `'default'`. */
export function profileModelArgs(baseAgentId: string, model: string): string[] {
  if (model === 'default') return [];
  if (baseAgentId === 'claude') {
    const loopModel = LoopModelSchema.safeParse(model);
    return loopModel.success ? loopModelArgs('claude', loopModel.data) : [];
  }
  const cliModel = modelsForAgent(baseAgentId).find((entry) => entry.id === model)?.cliModel;
  return modelArgsFor(baseAgentId, cliModel ?? model);
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
    ...profileModelArgs(base.id, model),
    ...mcpArgs,
    ...promptWords,
  ].join(' ');
}
