import { useTerminalStore } from './terminal-store';
import { useUiStore } from '../../store/ui-store';

/**
 * Open the terminal on a fresh Claude session in `cwd`, with `prompt` typed at
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
 * — can call it.
 */
export function startClaude({
  repoId,
  cwd,
  title,
  prompt,
}: {
  repoId: string;
  cwd: string;
  /** The session's label in the terminal list. */
  title: string;
  prompt: string;
}): void {
  useUiStore.getState().setTerminalOpen(true);

  const session = useTerminalStore.getState().openSession({
    kind: 'agent',
    agentId: 'claude',
    title,
    cwd,
    repoId,
  });

  // Queued input beats the roster's own start command (see `agentInput` in
  // <TerminalPanel>), so this replaces the bare `claude` an agent session would
  // otherwise open with rather than racing it.
  useTerminalStore.getState().queueInput(session.id, `claude ${shellQuote(prompt)}`);
}

/**
 * One shell word, whatever is in it.
 *
 * Single quotes rather than double: these prompts quote git commands in
 * backticks, and inside double quotes a backtick is command substitution — the
 * one form of quoting that would let a branch name run something. The only
 * character single quotes cannot carry is a single quote, hence the dance.
 */
function shellQuote(text: string): string {
  return `'${text.replace(/\s+/g, ' ').trim().replace(/'/g, String.raw`'\''`)}'`;
}
