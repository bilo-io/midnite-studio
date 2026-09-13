/**
 * Turning a roster agent's `command` and a free-text prompt into a one-shot
 * shell invocation.
 *
 * Framework-agnostic on purpose: originally lived in
 * `packages/app/src/features/terminal/start-agent.ts` (renderer-only), and
 * moved here once Phase 34's `council-runner.ts` (main-process, no renderer
 * access) needed the exact same per-agent invocation-args table — a second
 * copy would drift the moment one of the three CLIs' non-interactive flag
 * changed. `start-agent.ts` re-exports these rather than redefining them.
 */

import { z } from 'zod';

export const SkillExecutionModeSchema = z.enum(['interactive', 'headless']);
export type SkillExecutionMode = z.infer<typeof SkillExecutionModeSchema>;
export const DEFAULT_SKILL_EXECUTION_MODE: SkillExecutionMode = 'interactive';

/**
 * Translate the prompt's Claude/Antigravity `/name` skill prefix into
 * whatever the target agent actually expects.
 *
 * Claude and Antigravity's `agy` both auto-import a project skill as a `/name`
 * slash command, so a stored prompt like `/midnite-exec` or `/loop /midnite-exec`
 * needs no change for either. Codex is the odd one out — it doesn't recognise
 * `/name` for a custom skill at all, only `$name` — so this rewrites every
 * leading `/token` to `$token` before it reaches a Codex session. Anything that
 * doesn't start with `/` (a plain sentence) passes through untouched either way.
 */
export function toAgentPrompt(prompt: string, agentId: string): string {
  if (agentId !== 'codex') return prompt;
  return prompt.replace(/(^|\s)\/(\S+)/g, (_match, boundary: string, name: string) =>
    `${boundary}$${name}`,
  );
}

/**
 * The flags a roster agent needs ahead of its prompt to start an interactive
 * session, verified in `docs/AGENTS_CLI.md`.
 *
 * - Antigravity (`agy`): `--prompt-interactive`
 * - OpenCode (`opencode`): `--prompt`
 * - Copilot (`copilot`): `suggest`
 * - Aider (`aider`): `--message`
 * - OpenClaude (`openclaude`): `chat`
 * - Goose (`goose`): `session start --instruction`
 * - Claude, Codex, Cursor, Grok, Cline, Kilo: bare positional prompt or no extra flags
 */
export function agentInteractiveArgs(agentId: string): string[] {
  switch (agentId) {
    case 'agy':
      return ['--prompt-interactive'];
    case 'opencode':
      return ['--prompt'];
    case 'copilot':
      return ['suggest'];
    case 'aider':
      return ['--message'];
    case 'openclaude':
      return ['chat'];
    case 'goose':
      return ['session', 'start', '--instruction'];
    case 'claude':
    case 'codex':
    case 'cursor':
    case 'grok':
    case 'cline':
    case 'kilo':
    default:
      return [];
  }
}

/**
 * The flags that make an agent CLI answer once and **exit** — print/headless mode.
 * Verified against `docs/AGENTS_CLI.md`.
 *
 * - Claude, Cursor, Grok, Antigravity (`agy`): `-p`
 * - OpenClaude (`openclaude`): `--bg`
 * - OpenCode (`opencode`), Kilo (`kilo`): `run`
 * - Codex (`codex`): `exec`
 * - Copilot (`copilot`): `explain`
 * - Cline (`cline`): `--auto-approve true`
 * - Aider (`aider`): `--yes-always --message`
 * - Goose (`goose`): `run -t`
 *
 * `null` rather than `[]` for an unknown agent CLI with no known print mode,
 * so callers know it cannot be run unattended.
 */
export function agentHeadlessArgs(agentId: string): string[] | null {
  switch (agentId) {
    case 'claude':
    case 'cursor':
    case 'grok':
    case 'agy':
      return ['-p'];
    case 'openclaude':
      return ['--bg'];
    case 'opencode':
    case 'kilo':
      return ['run'];
    case 'codex':
      return ['exec'];
    case 'copilot':
      return ['explain'];
    case 'cline':
      return ['--auto-approve', 'true'];
    case 'aider':
      return ['--yes-always', '--message'];
    case 'goose':
      return ['run', '-t'];
    default:
      return null;
  }
}

/**
 * Flags needed to invoke an agent with a prompt, in either `'interactive'`
 * (default) or `'headless'` mode.
 */
export function agentInvocationArgs(
  agentId: string,
  mode: SkillExecutionMode = 'interactive',
): string[] {
  if (mode === 'headless') {
    return agentHeadlessArgs(agentId) ?? agentInteractiveArgs(agentId);
  }
  return agentInteractiveArgs(agentId);
}

/**
 * One shell word, whatever is in it.
 *
 * Single quotes rather than double: these prompts quote git commands in
 * backticks, and inside double quotes a backtick is command substitution — the
 * one form of quoting that would let a branch name run something. The only
 * character single quotes cannot carry is a single quote, hence the dance.
 */
export function shellQuote(text: string): string {
  return `'${text.replace(/\s+/g, ' ').trim().replace(/'/g, String.raw`'\''`)}'`;
}

