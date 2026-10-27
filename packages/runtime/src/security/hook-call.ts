import type { ToolCallContext } from '@midnite/studio-shared';

/**
 * Maps a CLI's `PreToolUse` hook input onto the tool ids the policy speaks (Phase 121 Theme B).
 *
 * Claude Code hands its hook `{ tool_name, tool_input, cwd, session_id, hook_event_name }` on stdin; Codex's
 * hook carries the same fields under the same names. The CLIs' own tools are not MCP tools, so they are
 * translated: a `Bash` line that runs `git push --force`, `git reset` or `git branch -D` is the policy's
 * `git.push` / `git.reset` / `git.branch.delete`; a file write is `fs.write`; a fetch is `web.fetch`; any other
 * shell line is `shell.exec`. The policy never sees the CLI's vocabulary.
 */

export interface HookInput {
  tool_name?: unknown;
  tool_input?: unknown;
  cwd?: unknown;
  session_id?: unknown;
}

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'apply_patch']);
const FETCH_TOOLS = new Set(['WebFetch', 'web_fetch']);
const SHELL_TOOLS = new Set(['Bash', 'shell', 'local_shell']);

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});
const asString = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

/** The words of the git invocation in `command` (after any `cd x &&`), or null when it is not one. */
function gitWords(command: string): string[] | null {
  for (const segment of command.split(/&&|\|\||;|\n|\|/)) {
    const words = segment.trim().split(/\s+/);
    if (words[0] === 'git') return words.slice(1);
  }
  return null;
}

/** The sub-command and its flags, skipping git's own `-C dir` / `-c k=v` options. */
function gitSub(words: string[]): { sub: string; rest: string[] } | null {
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    if (word === '-C' || word === '-c') {
      i++;
      continue;
    }
    if (word.startsWith('-')) continue;
    return { sub: word, rest: words.slice(i + 1) };
  }
  return null;
}

export function hookCallToPolicyCall(hook: HookInput): Pick<ToolCallContext, 'tool' | 'input' | 'repoPath'> & { sessionId?: string } {
  const name = asString(hook.tool_name) ?? 'unknown';
  const input = asRecord(hook.tool_input);
  const repoPath = asString(hook.cwd);
  const sessionId = asString(hook.session_id);
  const base = { ...(repoPath ? { repoPath } : {}), ...(sessionId ? { sessionId } : {}) };

  if (SHELL_TOOLS.has(name)) {
    const command = asString(input.command) ?? asString(input.cmd) ?? '';
    const git = gitWords(command);
    const parsed = git ? gitSub(git) : null;
    if (parsed?.sub === 'reset') return { tool: 'git.reset', input: { command }, ...base };
    if (parsed?.sub === 'branch' && parsed.rest.some((w) => w === '-d' || w === '-D' || w === '--delete')) return { tool: 'git.branch.delete', input: { command }, ...base };
    if (parsed?.sub === 'push') {
      const lease = parsed.rest.some((w) => w.startsWith('--force-with-lease'));
      const force = parsed.rest.some((w) => w === '--force' || w === '-f');
      if (lease || force) return { tool: 'git.push', input: { command, ...(lease ? { forceWithLease: true } : {}), ...(force ? { force: true } : {}) }, ...base };
      return { tool: 'git.push', input: { command }, ...base };
    }
    return { tool: 'shell.exec', input: { command }, ...base };
  }
  if (WRITE_TOOLS.has(name)) {
    const path = asString(input.file_path) ?? asString(input.path) ?? asString(input.notebook_path);
    return { tool: 'fs.write', input: path ? { path } : {}, ...base };
  }
  if (FETCH_TOOLS.has(name)) return { tool: 'web.fetch', input: { url: asString(input.url) ?? '' }, ...base };
  return { tool: name, input, ...base };
}
