import { homedir } from 'node:os';

import {
  modelArgsFor,
  toAgentPrompt,
  type AgentDefinition,
  type WorkflowAiExtractField,
} from '@midnite/studio-shared';

import { resolveHeadlessAgent } from '../../companion/ask';
import { runOllamaPrompt, type OllamaHeadlessDeps } from '../../ai/ollama-headless';
import { OUTPUT_TAIL_CAP, runProcess, type ProcessSink, type SpawnFn } from '../../process-runner';
import { listAgents } from '../../terminal-service';
import type { ExecutorContext, NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate } from '../interpolate';

/**
 * The `ai-prompt` and `ai-extract` nodes — one headless, print-mode call per
 * run of the node, the path the wand (`ai/improve-field.ts`) and the companion
 * (`companion/ask.ts`) already take: `resolveHeadlessAgent` picks a roster CLI
 * with a known print mode, `runProcess` runs it with no pty and no stdin, and
 * stdout is the answer. An `ollamaModel` swaps the CLI for one `/api/chat`
 * call, as the wand's Ollama path does.
 *
 * This is what separates them from the `agent` node, which drives an
 * interactive session until a done marker: nothing here opens a terminal, so
 * there is no session for the run panel to reveal and no marker to wait for.
 */

const AI_CANCEL_POLL_MS = 50;

/** How much of `ai-extract`'s source text is sent — a long document keeps its head, where titles and summaries sit. */
export const AI_EXTRACT_SOURCE_CAP = 8000;

export type AiExecutorDeps = {
  agents: () => Promise<AgentDefinition[]>;
  spawn?: SpawnFn;
  home?: () => string;
  ollama?: OllamaHeadlessDeps;
};

export const defaultAiExecutorDeps: AiExecutorDeps = { agents: listAgents };

type AiTarget = { agentId: string; model?: string | undefined; ollamaModel?: string | undefined };

function textSink(): ProcessSink<string> {
  let buffer = '';
  return {
    push: (chunk) => {
      buffer = (buffer + chunk).slice(-OUTPUT_TAIL_CAP);
    },
    finish: () => ({ ok: true, data: buffer }),
  };
}

/** One prompt, one answer. Never throws; an empty answer is a failure, not an empty success. */
export async function runHeadlessPrompt(
  prompt: string,
  target: AiTarget,
  context: Pick<ExecutorContext, 'signal' | 'timeoutMs'>,
  deps: AiExecutorDeps,
): Promise<{ ok: true; text: string; via: string } | { ok: false; error: string }> {
  const ollamaModel = target.ollamaModel?.trim();
  if (ollamaModel) {
    const reply = await runOllamaPrompt(ollamaModel, prompt, context.timeoutMs, deps.ollama);
    if (!reply.ok) return { ok: false, error: reply.message };
    const text = reply.data.trim();
    return text === '' ? { ok: false, error: `${ollamaModel} answered with nothing.` } : { ok: true, text, via: ollamaModel };
  }

  const resolved = resolveHeadlessAgent(await deps.agents(), target.agentId.trim() || undefined);
  if (!resolved) return { ok: false, error: 'No agent CLI with a headless mode is installed.' };
  if (target.agentId.trim() !== '' && resolved.agent.id !== target.agentId.trim()) {
    return { ok: false, error: `"${target.agentId}" is not on the roster, or has no headless mode.` };
  }

  const model = target.model?.trim();
  const modelArgs = model ? modelArgsFor(resolved.agent.id, model) : [];
  let cancelled = false;
  let poll: ReturnType<typeof setInterval> | undefined;
  const outcome = await runProcess<string>(
    resolved.agent.command,
    [...(resolved.agent.args ?? []), ...resolved.args, ...modelArgs, toAgentPrompt(prompt, resolved.agent.id)],
    (deps.home ?? homedir)(),
    {
      sink: textSink(),
      timeoutMs: context.timeoutMs,
      ...(deps.spawn ? { spawn: deps.spawn } : {}),
      onSpawned: (handle) => {
        poll = setInterval(() => {
          if (context.signal.cancelled()) {
            cancelled = true;
            handle.kill();
          }
        }, AI_CANCEL_POLL_MS);
        poll.unref?.();
      },
    },
  );
  if (poll !== undefined) clearInterval(poll);
  if (cancelled) return { ok: false, error: 'Cancelled.' };
  if (!outcome.ok) {
    return {
      ok: false,
      error: outcome.reason === 'timed-out' ? outcome.hint : `Could not run ${resolved.agent.label}: ${outcome.hint}`,
    };
  }
  if (outcome.exitCode !== null && outcome.exitCode !== 0) {
    const detail = outcome.stderr.trim().split('\n').at(-1) ?? '';
    return { ok: false, error: `${resolved.agent.label} exited with code ${outcome.exitCode}${detail ? `: ${detail}` : '.'}` };
  }
  const text = outcome.data.trim();
  if (text === '') return { ok: false, error: `${resolved.agent.label} answered with nothing.` };
  return { ok: true, text, via: resolved.agent.id };
}

/**
 * A model's "JSON" reply, parsed: the whole text, else the body of a
 * markdown code fence, else the outermost `{…}`/`[…]` span. `undefined` when
 * none of those parse — the caller turns that into a named failure.
 */
export function parseJsonReply(text: string): unknown {
  const attempts: string[] = [text.trim()];
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(text);
  if (fence?.[1]) attempts.push(fence[1].trim());
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start !== -1 && end > start) attempts.push(text.slice(start, end + 1));
  }
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as unknown;
    } catch {
      // Try the next shape.
    }
  }
  return undefined;
}

export function buildAiExtractPrompt(source: string, fields: readonly WorkflowAiExtractField[]): string {
  const capped = source.length <= AI_EXTRACT_SOURCE_CAP ? source : `${source.slice(0, AI_EXTRACT_SOURCE_CAP)}…`;
  return [
    'Extract the following fields from the text below.',
    `Reply with ONLY a JSON object whose keys are exactly: ${fields.map((field) => field.key).join(', ')}.`,
    'No prose, no markdown code fence. Use null for a field the text does not contain.',
    '',
    'Fields:',
    ...fields.map((field) => `- ${field.key}${field.description.trim() ? `: ${field.description.trim()}` : ''}`),
    '',
    'Text:',
    '---',
    capped,
    '---',
  ].join('\n');
}

export function createAiPromptExecutor(deps: AiExecutorDeps = defaultAiExecutorDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'ai-prompt') return { ok: false, error: 'Not an ai-prompt node.' };
    const prompt = interpolate(node.config.prompt, context.upstream);
    if (!prompt.ok) return prompt;
    if (prompt.value.trim() === '') return { ok: false, error: 'This step has no prompt.' };

    const reply = await runHeadlessPrompt(prompt.value, node.config, context, deps);
    if (!reply.ok) return reply;
    if (node.config.format === 'text') return { ok: true, output: { text: reply.text, via: reply.via } };

    const json = parseJsonReply(reply.text);
    if (json === undefined) return { ok: false, error: 'The reply was not valid JSON.' };
    return { ok: true, output: { text: reply.text, json, via: reply.via } };
  };
}

export function createAiExtractExecutor(deps: AiExecutorDeps = defaultAiExecutorDeps): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'ai-extract') return { ok: false, error: 'Not an ai-extract node.' };
    if (node.config.fields.length === 0) return { ok: false, error: 'This step has no fields to extract.' };
    const source = interpolate(node.config.source, context.upstream);
    if (!source.ok) return source;

    const reply = await runHeadlessPrompt(buildAiExtractPrompt(source.value, node.config.fields), node.config, context, deps);
    if (!reply.ok) return reply;

    const parsed = parseJsonReply(reply.text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'The reply was not a JSON object.' };
    }
    const record = parsed as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const field of node.config.fields) {
      output[field.key] = Object.hasOwn(record, field.key) ? record[field.key] : null;
    }
    return { ok: true, output };
  };
}

export const aiPromptExecutor = createAiPromptExecutor();
export const aiExtractExecutor = createAiExtractExecutor();
