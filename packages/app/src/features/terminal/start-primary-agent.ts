import { BUILTIN_AGENTS } from '@midnite/studio-shared';

import { useUiStore } from '../../store/ui-store';
import { startAgent } from './start-agent';

/**
 * Open the terminal on a fresh session running the currently configured
 * primary agent in `cwd`, with `prompt` typed at its shell and NOT executed.
 *
 * Resolves the agent definition via `useUiStore.getState().primaryAgent` and
 * `BUILTIN_AGENTS` (falling back to the default builtin agent), passing its
 * command and configured args to {@link startAgent}.
 */
export function startPrimaryAgent({
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
  const primaryId = useUiStore.getState().primaryAgent;
  const agent = BUILTIN_AGENTS.find((a) => a.id === primaryId) ?? BUILTIN_AGENTS[0]!;
  startAgent({
    repoId,
    cwd,
    title,
    prompt,
    agentId: agent.id,
    command: agent.command,
    extraArgs: agent.args,
  });
}

/**
 * @deprecated Use {@link startPrimaryAgent} instead.
 */
export const startClaude = startPrimaryAgent;
