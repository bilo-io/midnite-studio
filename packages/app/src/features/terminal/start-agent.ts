import {
  OLLAMA_DEFAULT_BASE_URL,
  agentHeadlessArgs,
  agentInteractiveArgs,
  agentInvocationArgs,
  resolveAgentLaunch,
  shellQuote,
  toAgentPrompt,
  type SkillExecutionMode,
  type TerminalSession,
  type TerminalSurface,
} from '@midnite/studio-shared';

import { useTerminalStore } from './terminal-store';
import { useUiStore } from '../../store/ui-store';

// Re-exported for the handful of existing call sites (and tests) that import
// these from here — the implementations now live in
// `@midnite/studio-shared`'s `agent-invocation.ts`, shared with
// `council-runner.ts`, which cannot import this renderer-only module.
export {
  agentHeadlessArgs,
  agentInteractiveArgs,
  agentInvocationArgs,
  shellQuote,
  toAgentPrompt,
};

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
  surface,
  taskRef,
  projectRef,
  workflowRunRef,
  forgeAccountKey,
  extraArgs = [],
  autoSend = false,
  mode,
}: {
  repoId: string;
  cwd: string;
  /** The session's label in the terminal list. */
  title: string;
  prompt?: string;
  /** The roster entry's id (e.g. `'claude'`, `'agy'`, `'codex'`) — labels the session. */
  agentId: string;
  /** The roster entry's `command` — what's actually typed at the shell. */
  command: string;
  /**
   * `'fab'` hosts the session in the FAB panel (Phase 35), `'kanban'` inside
   * a board card (Phase 41): either way, the main terminal panel is neither
   * opened nor handed the session. Taken from the shared `TerminalSurface`
   * enum rather than restated as a hand-written union, so widening the
   * schema widens this too.
   */
  surface?: TerminalSurface;
  /** `{ projectId, itemId }` — required alongside `surface: 'kanban'` (Phase 41 Theme D). */
  taskRef?: { projectId: string; itemId: string };
  /** Session attribution (Phase 95 Theme H) — see `TerminalSessionSchema`'s own docs. */
  projectRef?: { projectId: string; forge: string };
  workflowRunRef?: { workflowId: string; runId: string; nodeId: string };
  forgeAccountKey?: string;
  /**
   * Extra flags for the agent's own CLI, ahead of the prompt — the FAB's
   * `--model` picker is the only caller today (`loopModelArgs`). Words, not a
   * string: they go into the same array as everything else and are never
   * re-split, so a flag value with a space in it stays one word.
   */
  extraArgs?: string[];
  /**
   * Append the Return, so the composed command RUNS rather than sitting at the
   * prompt. The second deliberate exception to the type-but-don't-send posture
   * above (councils were the first): a FAB loop's command is composed from
   * checkboxes the user just set and launched by their explicit Start press —
   * the confirmation the withheld Return exists to collect already happened.
   */
  autoSend?: boolean;
  /**
   * Execution mode: `'interactive'` (default) or `'headless'`.
   * Falls back to `useUiStore.getState().skillExecutionMode` when absent.
   */
  mode?: SkillExecutionMode;
}): TerminalSession {
  if (surface !== 'fab' && surface !== 'kanban') useUiStore.getState().setTerminalOpen(true);

  /*
    Phase 96 Theme H — the ONE resolver, called with the binding this session
    launches with right now (`ui-store.ts`'s `agentBackends`, read
    synchronously: it is already in-memory renderer state, no IPC needed).
    `base` is the compile-time default rather than a live read of the daemon's
    actual host: the renderer cannot read `OLLAMA_HOST` (only main can), and
    there is no Settings ▸ Ollama host-override page yet (Theme C's own
    scope) — see `OLLAMA_DEFAULT_BASE_URL`'s own doc comment. Only the
    recipe's `argsBefore`/`commandOverride` are used here; its `env` is
    resolved again, with the daemon's REAL host, by `use-terminal-ipc.ts`'s
    `start()` right before `pty.create` — the one point in this flow that is
    already async.
  */
  const binding = useUiStore.getState().agentBackends[agentId];
  const launch = resolveAgentLaunch({ id: agentId, command }, binding, OLLAMA_DEFAULT_BASE_URL);

  const session = useTerminalStore.getState().openSession({
    kind: 'agent',
    agentId,
    title,
    cwd,
    repoId,
    ...(surface === undefined ? {} : { surface }),
    ...(taskRef === undefined ? {} : { taskRef }),
    ...(projectRef === undefined ? {} : { projectRef }),
    ...(workflowRunRef === undefined ? {} : { workflowRunRef }),
    ...(forgeAccountKey === undefined ? {} : { forgeAccountKey }),
    ...(launch.backend === 'ollama' ? { backend: launch.backend, ollamaModel: launch.model } : {}),
  });

  const executionMode = mode ?? useUiStore.getState().skillExecutionMode ?? 'interactive';

  // Queued input beats the roster's own start command (see `agentInput` in
  // <TerminalPanel>), so this replaces the bare command an agent session would
  // otherwise open with rather than racing it.
  const words =
    prompt !== undefined
      ? [
          launch.command,
          ...launch.argsBefore,
          ...extraArgs,
          ...agentInvocationArgs(agentId, executionMode),
          shellQuote(toAgentPrompt(prompt, agentId)),
        ]
      : [launch.command, ...launch.argsBefore, ...extraArgs];
  useTerminalStore.getState().queueInput(session.id, words.join(' ') + (autoSend ? '\r' : ''));
  return session;
}
