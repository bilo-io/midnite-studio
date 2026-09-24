import { homedir } from 'node:os';

import {
  failure,
  fastModelFor,
  modelArgsFor,
  ok,
  parsePlanBlueprintReply,
  toAgentPrompt,
  type AgentDefinition,
  type AiPlanBlueprint,
  type GitOpResult,
} from '@midnite/studio-shared';

import { OUTPUT_TAIL_CAP, runProcess, type ProcessSink, type SpawnFn } from '../process-runner';
import { listAgents } from '../terminal-service';
import { resolveHeadlessAgent } from '../companion/ask';
import { runOllamaPrompt, type OllamaHeadlessDeps } from './ollama-headless';

/**
 * Plan with AI (Phase 95 Theme F) — `main/ai/improve-field.ts`'s pattern
 * exactly (`runProcess` directly, print mode, a `GitOpResult` envelope), with
 * two differences the phase doc itself calls for: the **fast** tier
 * (`fastModelFor`, not `cheapModelFor` — a blueprint is read by a human before
 * anything happens, so latency matters more than shaving the last cent) and a
 * reply that has to be **structured JSON**, not plain text. The JSON case is
 * closer to `companion/ask.ts`'s `askCompanion` — same "find the first
 * balanced object" recovery (`parsePlanBlueprintReply`, shared) — except an
 * unparseable reply is not a debuggable-but-successful fallback here the way
 * the companion's is: a blueprint the sheet cannot render is not a sentence
 * worth showing beside a chat bubble, so this earns the phase doc's own **one
 * retry** before giving up.
 */

/** Longer than the wand's 30s: a blueprint is a paragraph of structured JSON
 *  describing several tasks, not a single field's rewrite, and the phase doc
 *  budgets one retry on top of this — see {@link planBlueprint}'s own two
 *  `runProcess` calls, each against this same ceiling. */
export const AI_PLAN_BLUEPRINT_TIMEOUT_MS = 45_000;

/** How much of the free-text prompt is sent. */
export const AI_PLAN_BLUEPRINT_PROMPT_CAP = 4000;

export type AiPlanBlueprintInput = {
  agentId?: string | undefined;
  repoPath?: string | null | undefined;
  repoName: string;
  prompt: string;
  /** The sheet's current edits, sent back as context for **Re-plan**. */
  existing?: AiPlanBlueprint | undefined;
  /** Present only when planning sub-issues of an already-open issue. */
  originIssue?: { number: number; title: string } | undefined;
  /** Phase 96 Theme I — run on this Ollama model via `/api/chat`, not a CLI. */
  ollamaModel?: string | undefined;
};

export type AiPlanBlueprintDeps = {
  agents: () => Promise<AgentDefinition[]>;
  spawn?: SpawnFn | undefined;
  timeoutMs?: number | undefined;
  home?: (() => string) | undefined;
  ollama?: OllamaHeadlessDeps | undefined;
};

export const defaultAiPlanBlueprintDeps: AiPlanBlueprintDeps = { agents: listAgents };

const BLUEPRINT_SHAPE_LINES = [
  'Reply with ONE JSON object and nothing else — no preamble, no markdown code',
  'fence, no explanation. It must match exactly this shape:',
  '{',
  '  "project": { "title": string, "description": string },',
  '  "tasks": [ { "key": string, "title": string, "body": string, "labels": string[] } ],',
  '  "edges": [ { "from": string, "to": string, "kind": "blockedBy" } ]',
  '}',
  '`key` is a short local slug (e.g. "api", "tests") — unique within `tasks`,',
  'never a number, never reused. An edge means `from` is blocked by `to`; only',
  'name keys that appear in `tasks`. Omit `edges` (or leave it empty) if',
  'nothing depends on anything else. Include 1 to 12 tasks — enough to be a',
  'real plan, not a single vague one.',
];

/** The system prompt: draft a blueprint, or revise one already on screen. */
export function buildPlanBlueprintPrompt(input: AiPlanBlueprintInput): string {
  const lines: string[] = [];

  if (input.originIssue) {
    lines.push(
      `You are breaking issue #${input.originIssue.number} ("${input.originIssue.title}") into`,
      `sub-issues, in the repository "${input.repoName || 'this repository'}".`,
      'Ignore the "project" field below — it is unused for sub-issues — but still',
      'include it with any placeholder title.',
    );
  } else {
    lines.push(
      `You are planning a project board in the repository "${input.repoName || 'this repository'}".`,
    );
  }

  lines.push('', ...BLUEPRINT_SHAPE_LINES, '');

  if (input.existing) {
    lines.push(
      'The current draft, already edited by a person — revise it rather than',
      'starting over, keeping anything that still fits:',
      '---',
      JSON.stringify(input.existing),
      '---',
      '',
      'What to change:',
    );
  } else {
    lines.push('The request:');
  }

  lines.push('---', input.prompt.slice(0, AI_PLAN_BLUEPRINT_PROMPT_CAP), '---');

  return lines.join('\n');
}

/** The retry's own prompt — the first reply plus why it was rejected, asked
 *  to try again rather than restarting from the original request alone. */
function buildRetryPrompt(basePrompt: string, invalidReply: string): string {
  return [
    basePrompt,
    '',
    'Your last reply did not parse as that exact JSON shape. It was:',
    '---',
    invalidReply.slice(-AI_PLAN_BLUEPRINT_PROMPT_CAP),
    '---',
    'Reply again with ONLY the corrected JSON object — nothing else.',
  ].join('\n');
}

function textSink(): ProcessSink<string> {
  let buffer = '';
  return {
    push: (chunk) => {
      buffer = (buffer + chunk).slice(-OUTPUT_TAIL_CAP);
    },
    finish: () => ({ ok: true, data: buffer }),
  };
}

/** One headless call, returning the raw stdout tail — never throws; a
 *  `runProcess` failure is reported back to {@link planBlueprint} as `null`
 *  plus the reason, so it can decide whether a retry is worth attempting. */
async function runOnce(
  resolved: { agent: AgentDefinition; args: string[] },
  prompt: string,
  cwd: string,
  deps: AiPlanBlueprintDeps,
): Promise<{ ok: true; data: string } | { ok: false; message: string }> {
  const model = fastModelFor(resolved.agent.id);
  const modelArgs = model ? modelArgsFor(resolved.agent.id, model) : [];
  const agentPrompt = toAgentPrompt(prompt, resolved.agent.id);

  const outcome = await runProcess<string>(
    resolved.agent.command,
    [...(resolved.agent.args ?? []), ...resolved.args, ...modelArgs, agentPrompt],
    cwd,
    {
      sink: textSink(),
      timeoutMs: deps.timeoutMs ?? AI_PLAN_BLUEPRINT_TIMEOUT_MS,
      ...(deps.spawn ? { spawn: deps.spawn } : {}),
    },
  );

  if (!outcome.ok) {
    return {
      ok: false,
      message:
        outcome.reason === 'timed-out'
          ? 'That took too long, so the plan was cancelled.'
          : `Could not run ${resolved.agent.label}: ${outcome.hint}`,
    };
  }
  return { ok: true, data: outcome.data };
}

/**
 * Draft (or revise) a blueprint, once — with one retry if the first reply
 * does not parse as {@link AiPlanBlueprintSchema}. Never throws; every
 * outcome is the `GitOpResult` envelope, exactly `improveField`'s posture.
 */
export async function planBlueprint(
  input: AiPlanBlueprintInput,
  deps: AiPlanBlueprintDeps = defaultAiPlanBlueprintDeps,
): Promise<GitOpResult<{ blueprint: AiPlanBlueprint }>> {
  const basePrompt = buildPlanBlueprintPrompt(input);
  let label: string;
  let run: (prompt: string) => ReturnType<typeof runOnce>;

  if (input.ollamaModel) {
    const model = input.ollamaModel;
    label = model;
    run = (prompt) => runOllamaPrompt(model, prompt, deps.timeoutMs ?? AI_PLAN_BLUEPRINT_TIMEOUT_MS, deps.ollama);
  } else {
    const roster = await deps.agents();
    const resolved = resolveHeadlessAgent(roster, input.agentId);
    if (!resolved) {
      return failure('No agent CLI with a headless mode is installed, so there is nothing to plan with.');
    }
    const cwd = input.repoPath ?? (deps.home ?? homedir)();
    label = resolved.agent.label;
    run = (prompt) => runOnce(resolved, prompt, cwd, deps);
  }

  const first = await run(basePrompt);
  if (!first.ok) return failure(first.message);

  const firstBlueprint = parsePlanBlueprintReply(first.data);
  if (firstBlueprint) return ok({ blueprint: firstBlueprint });

  // One retry, per the phase doc — the model's own last reply becomes part of
  // the correction prompt rather than a second blind attempt.
  const retryPrompt = buildRetryPrompt(basePrompt, first.data);
  const second = await run(retryPrompt);
  if (!second.ok) return failure(second.message);

  const secondBlueprint = parsePlanBlueprintReply(second.data);
  if (secondBlueprint) return ok({ blueprint: secondBlueprint });

  return failure(`${label} could not answer with a plan in the shape this app expects.`);
}
