import { useTerminalStore } from './terminal-store';
import { useUiStore } from '../../store/ui-store';

/**
 * Open the terminal on a fresh agent session in `cwd`, with `prompt` typed at
 * its shell and NOT executed.
 *
 * The no-newline half is the whole point, and it is the same posture the Agent
 * settings page takes with an uninstall command: the app hands over a command,
 * the user's Return runs it. An agent that starts editing a repository because
 * a dialog was dismissed in the wrong direction is not a feature, and the one
 * keystroke buys a look at the prompt before it is sent.
 *
 * Written as a plain function over `getState()` rather than a hook, so a dialog
 * callback — which runs long after the component that opened it has re-rendered
 * — can call it. `agentId`/`command` are the caller's job to resolve (from the
 * roster `useAgents()` already reads) rather than this function's, so this stays
 * a plain function with no query cache to reach into.
 */
export function startAgent({
  repoId,
  cwd,
  title,
  prompt,
  agentId,
  command,
}: {
  repoId: string;
  cwd: string;
  /** The session's label in the terminal list. */
  title: string;
  prompt: string;
  /** The roster entry's id (e.g. `'claude'`, `'agy'`, `'codex'`) — labels the session. */
  agentId: string;
  /** The roster entry's `command` — what's actually typed at the shell. */
  command: string;
}): void {
  useUiStore.getState().setTerminalOpen(true);

  const session = useTerminalStore.getState().openSession({
    kind: 'agent',
    agentId,
    title,
    cwd,
    repoId,
  });

  // Queued input beats the roster's own start command (see `agentInput` in
  // <TerminalPanel>), so this replaces the bare command an agent session would
  // otherwise open with rather than racing it.
  useTerminalStore
    .getState()
    .queueInput(session.id, `${command} ${shellQuote(toAgentPrompt(prompt, agentId))}`);
}

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
