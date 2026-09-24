import { homedir } from 'node:os';

import {
  cheapModelFor,
  failure,
  modelArgsFor,
  ok,
  toAgentPrompt,
  type AgentDefinition,
  type GitOpResult,
} from '@midnite/studio-shared';

import { OUTPUT_TAIL_CAP, runProcess, type ProcessSink, type SpawnFn } from '../process-runner';
import { listAgents } from '../terminal-service';
import { resolveHeadlessAgent } from '../companion/ask';
import { runOllamaPrompt, type OllamaHeadlessDeps } from './ollama-headless';

/**
 * The wand (Phase 95 Theme E) — one field's text, rewritten by the roster's
 * cheapest headless CLI.
 *
 * `main/companion/ask.ts`'s pattern exactly, per the phase doc's own
 * instruction ("the `ask.ts` pattern") — `runProcess` directly (no council
 * lock, no persisted run, nothing a single rewrite has any use for), print
 * mode rather than a pty, and a `GitOpResult` envelope so "no CLI installed"
 * and "it timed out" are sentences the wand renders beside the field, never
 * exceptions that would strand the in-flight edit. The one addition over
 * `askCompanion` is the model: `cheapModelFor` (`ai-models.ts`) picks the
 * roster entry's small tier, and `modelArgsFor` turns it into the `--model`
 * flag inserted ahead of the prompt — a rewrite is exactly the short,
 * disposable call that should not spend a flagship model's price on it.
 *
 * `resolveHeadlessAgent` is imported from `companion/ask.ts` rather than
 * reimplemented — the "preferred id first, then anything on the roster with
 * a known print mode" walk is identical for both callers, and a second copy
 * would drift the moment one of them changed it.
 */

/** Same ceiling `askCompanion` uses (`COMPANION_ASK_TIMEOUT_MS`) — a wand
 *  click sits between "typed a field" and "sees a suggestion", not a batch
 *  job. Its own constant rather than a re-export: the two timeouts are equal
 *  today by coincidence, not by contract, and a future change to either
 *  should not silently move the other. */
export const AI_IMPROVE_FIELD_TIMEOUT_MS = 30_000;

/** How much of the current field value is sent — long enough for a real
 *  issue body, short enough that a runaway paste does not inflate the call. */
export const AI_IMPROVE_FIELD_INPUT_CAP = 4000;

/** How much of one "other field" (context, not the target) is sent — these
 *  are grounding, not the thing being rewritten. */
const OTHER_FIELD_CAP = 400;

export type AiImproveFieldInput = {
  /** The roster entry to prefer — the renderer's `primaryAgent`. */
  agentId?: string | undefined;
  /** Where to run the CLI. `null`/absent runs it in the home directory. */
  repoPath?: string | null | undefined;
  /** Named in the prompt, e.g. "owner/name" — never used as a `cwd`. */
  repoName: string;
  fieldName: string;
  fieldValue: string;
  otherFields?: Record<string, string> | undefined;
  /** Phase 96 Theme I — run on this Ollama model via `/api/chat`, not a CLI. */
  ollamaModel?: string | undefined;
};

export type AiImproveFieldDeps = {
  /** Injected so a test can hand in a roster without a userData directory. */
  agents: () => Promise<AgentDefinition[]>;
  /** Injected so a test can answer with fixed stdout, garbage, or ENOENT. */
  spawn?: SpawnFn | undefined;
  timeoutMs?: number | undefined;
  /** Injected only so a test need not touch `$HOME`. */
  home?: (() => string) | undefined;
  ollama?: OllamaHeadlessDeps | undefined;
};

export const defaultAiImproveFieldDeps: AiImproveFieldDeps = { agents: listAgents };

/** Keep the tail of a long value — the end of a description is usually its
 *  most load-bearing sentence, the same reasoning `ask.ts`'s `capHead` uses. */
function capHead(text: string, cap: number): string {
  return text.length <= cap ? text : `…${text.slice(-cap)}`;
}

/**
 * The system prompt: rewrite one field, print nothing else.
 *
 * Unlike `buildAskPrompt`, this asks for **plain text, not JSON** — the
 * result is dropped straight into the field's own input, and a JSON
 * envelope here would just be one more thing to parse and fail on for no
 * benefit (there is no second field, like `intent`, riding alongside it).
 */
export function buildImproveFieldPrompt(input: AiImproveFieldInput): string {
  const otherLines = Object.entries(input.otherFields ?? {})
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${capHead(value, OTHER_FIELD_CAP)}`);

  return [
    `You are rewriting the "${input.fieldName}" field of an issue or project`,
    `in the repository "${input.repoName || 'this repository'}".`,
    'Reply with ONLY the rewritten field text and nothing else —',
    'no preamble, no quotes, no markdown code fence, no explanation.',
    'Keep it roughly the same length as the current text unless it is',
    'clearly too terse or rambling for what it is trying to say.',
    '',
    `Current "${input.fieldName}":`,
    '---',
    capHead(input.fieldValue, AI_IMPROVE_FIELD_INPUT_CAP),
    '---',
    ...(otherLines.length > 0 ? ['', 'Other fields, for context only — do not rewrite these:', ...otherLines] : []),
  ].join('\n');
}

/** Collect stdout, capped — the reply is the text itself, so there is
 *  nothing to parse the way `askCompanion`'s `textSink` leaves for its own
 *  caller to do. */
function textSink(): ProcessSink<string> {
  let buffer = '';
  return {
    push: (chunk) => {
      buffer = (buffer + chunk).slice(-OUTPUT_TAIL_CAP);
    },
    finish: () => ({ ok: true, data: buffer }),
  };
}

/**
 * Rewrite one field, once.
 *
 * Never throws — every outcome is the `GitOpResult` envelope. Unlike
 * `askCompanion`'s "unparseable output is still a success" posture, an empty
 * reply here IS a failure: there is no fallback sentence a text field can
 * render in place of nothing, so a blank rewrite is refused rather than
 * silently blanking the field it was meant to improve.
 */
export async function improveField(
  input: AiImproveFieldInput,
  deps: AiImproveFieldDeps = defaultAiImproveFieldDeps,
): Promise<GitOpResult<{ text: string }>> {
  if (input.ollamaModel) {
    const reply = await runOllamaPrompt(
      input.ollamaModel,
      buildImproveFieldPrompt(input),
      deps.timeoutMs ?? AI_IMPROVE_FIELD_TIMEOUT_MS,
      deps.ollama,
    );
    if (!reply.ok) return failure(reply.message);
    const text = reply.data.trim();
    return text.length === 0 ? failure(`${input.ollamaModel} answered with nothing.`) : ok({ text });
  }

  const roster = await deps.agents();
  const resolved = resolveHeadlessAgent(roster, input.agentId);
  if (!resolved) {
    return failure('No agent CLI with a headless mode is installed, so the wand has nothing to run.');
  }

  const model = cheapModelFor(resolved.agent.id);
  const modelArgs = model ? modelArgsFor(resolved.agent.id, model) : [];
  const prompt = toAgentPrompt(buildImproveFieldPrompt(input), resolved.agent.id);
  const cwd = input.repoPath ?? (deps.home ?? homedir)();

  const outcome = await runProcess<string>(
    resolved.agent.command,
    [...(resolved.agent.args ?? []), ...resolved.args, ...modelArgs, prompt],
    cwd,
    {
      sink: textSink(),
      timeoutMs: deps.timeoutMs ?? AI_IMPROVE_FIELD_TIMEOUT_MS,
      ...(deps.spawn ? { spawn: deps.spawn } : {}),
    },
  );

  if (!outcome.ok) {
    return failure(
      outcome.reason === 'timed-out'
        ? 'That took too long, so the rewrite was cancelled.'
        : `Could not run ${resolved.agent.label}: ${outcome.hint}`,
    );
  }

  const text = outcome.data.trim();
  if (text.length === 0) {
    return failure(`${resolved.agent.label} answered with nothing.`);
  }
  return ok({ text });
}
