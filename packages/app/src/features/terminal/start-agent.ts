import { agentInvocationArgs, shellQuote, toAgentPrompt } from '@midnite/studio-shared';

import { useTerminalStore } from './terminal-store';
import { useUiStore } from '../../store/ui-store';

// Re-exported for the handful of existing call sites (and tests) that import
// these three from here — the implementations now live in
// `@midnite/studio-shared`'s `agent-invocation.ts`, shared with
// `council-runner.ts`, which cannot import this renderer-only module.
export { agentInvocationArgs, shellQuote, toAgentPrompt };

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
  const words = [command, ...agentInvocationArgs(agentId), shellQuote(toAgentPrompt(prompt, agentId))];
  useTerminalStore.getState().queueInput(session.id, words.join(' '));
}
