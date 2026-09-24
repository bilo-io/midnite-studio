import {
  OLLAMA_DEFAULT_BASE_URL,
  agentHeadlessArgs,
  agentInteractiveArgs,
  agentInvocationArgs,
  resolveAgentLaunch,
  shellQuote,
  toAgentPrompt,
  type AgentOllamaBinding,
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
 * A per-launch model pick (Phase 96 Theme I) — the card composer's and loop's
 * model picker, once it grows an "Ollama" group beside `LOOP_MODELS`, and
 * "Launch with…" from the model detail modal.
 *
 * **Precedence: when present, this always wins over the persisted
 * `agentBackends[agentId]` default for that one launch — never layered on
 * top of it.** `{backend: 'native'}` forces the launch to run natively even
 * if the agent's own Settings ▸ Agent default is Ollama (the caller then
 * supplies its own `--model` via `extraArgs`, e.g. `loopModelArgs`).
 * `{backend: 'ollama', model}` forces the launch onto that model even if the
 * agent's default is native or a different model — "whatever the agent's
 * default is", per the phase doc. Omitting this param entirely (every call
 * site before this phase) falls back to the persisted default exactly as
 * Theme H left it.
 */
export type StartAgentModelOverride = { backend: 'native' } | { backend: 'ollama'; model: string };

/** Removes one `--model <value>` pair from `args`, if present.
 *
 * The defence-in-depth half of the fix: even a caller that still computes
 * `extraArgs` from `loopModelArgs` (Claude's own native `--model` picker)
 * cannot double up a `--model` flag once the launch resolves to Ollama —
 * `ollamaLaunchRecipe`'s own `argsBefore` is always the one that wins,
 * because it is what actually matches `ANTHROPIC_BASE_URL`/the daemon.
 */
function stripModelFlag(args: string[]): string[] {
  const i = args.indexOf('--model');
  if (i === -1) return args;
  return [...args.slice(0, i), ...args.slice(i + 2)];
}

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
  modelOverride,
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
  /** Per-launch backend pick; see `StartAgentModelOverride`. */
  modelOverride?: StartAgentModelOverride;
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
  const binding: AgentOllamaBinding | undefined =
    modelOverride === undefined
      ? useUiStore.getState().agentBackends[agentId]
      : modelOverride.backend === 'native'
        ? { backend: 'native' }
        : { backend: 'ollama', model: modelOverride.model };
  const launch = resolveAgentLaunch({ id: agentId, command }, binding, OLLAMA_DEFAULT_BASE_URL);
  // An Ollama launch's recipe owns `--model`; a caller's native pick is dropped.
  const callerArgs = launch.backend === 'ollama' ? stripModelFlag(extraArgs) : extraArgs;

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
          ...callerArgs,
          ...agentInvocationArgs(agentId, executionMode),
          shellQuote(toAgentPrompt(prompt, agentId)),
        ]
      : [launch.command, ...launch.argsBefore, ...callerArgs];
  useTerminalStore.getState().queueInput(session.id, words.join(' ') + (autoSend ? '\r' : ''));
  return session;
}
