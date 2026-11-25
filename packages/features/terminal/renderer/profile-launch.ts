import type { AgentProfile, TerminalSession, TerminalSurface } from '@midnite/studio-shared';

import { useTerminalStore } from './terminal-store';

/**
 * Custom agents in the terminal (Phase 154 Theme F).
 *
 * Main builds a custom agent's whole typed line (`agentProfile:prepareLaunch`); the renderer never does.
 * What comes back is that line and a single-use launch id, which `pty.create` carries so main binds the
 * agent's private MCP socket to the session.
 */
/**
 * `'missing'` when the agent no longer exists (deleted): the session may go on as its base CLI. `null` for
 * any other failure, which the host has already reported: nothing starts, because starting the bare base
 * CLI would drop the agent's tool allowlist while its chrome still names it.
 */
export type PrepareProfileLaunch = (req: {
  profileId: string;
  cwd: string;
  resume: boolean;
  /** A first prompt typed with the agent (a skill hand-off); absent starts it bare. */
  prompt?: string;
  /** `'headless'` types the base CLI's print mode with the prompt (a headless skill hand-off). */
  mode?: 'interactive' | 'headless';
}) => Promise<{ launchId: string; line: string } | 'missing' | null>;

/**
 * Opens a session for `profile` in `target`. Prepare first, so a refusal (an unknown base CLI, a socket
 * that would not start) opens nothing. The session, its launch id and its typed line land in the same
 * tick, so the view mounts with the line already queued and never types the base command first.
 */
export async function launchProfileSession(
  prepare: PrepareProfileLaunch,
  profile: Pick<AgentProfile, 'id' | 'name' | 'baseAgentId'>,
  target: {
    repoId: string;
    cwd: string;
    title?: string;
    prompt?: string;
    autoSend?: boolean;
    surface?: TerminalSurface;
    mode?: 'interactive' | 'headless';
  },
): Promise<TerminalSession | 'missing' | null> {
  const prepared = await prepare({
    profileId: profile.id,
    cwd: target.cwd,
    resume: false,
    ...(target.prompt === undefined ? {} : { prompt: target.prompt }),
    ...(target.mode === undefined ? {} : { mode: target.mode }),
  });
  if (prepared === 'missing') return 'missing';
  if (!prepared) return null;
  const store = useTerminalStore.getState();
  const session = store.openSession({
    kind: 'agent',
    agentId: profile.baseAgentId,
    profileId: profile.id,
    title: target.title ?? profile.name,
    cwd: target.cwd,
    repoId: target.repoId,
    ...(target.surface === undefined ? {} : { surface: target.surface }),
  });
  store.setLaunchId(session.id, prepared.launchId);
  store.queueInput(session.id, prepared.line + (target.prompt === undefined || target.autoSend ? '\r' : ''));
  return session;
}

/**
 * What waking (`resume: false`) or resuming (`resume: true`) a custom agent's session types, re-prepared
 * so the agent comes back with its prompt, model and tools. `'fallback'` when the session runs no custom
 * agent, the host cannot prepare, or the agent was deleted: the caller does what it does for the base
 * CLI. `'failed'` for any other failure (already reported): the caller starts nothing.
 */
export async function prepareProfileStart(
  prepare: PrepareProfileLaunch | undefined,
  session: Pick<TerminalSession, 'profileId' | 'cwd'>,
  resume: boolean,
): Promise<{ input: string; profileLaunchId: string } | 'fallback' | 'failed'> {
  if (!session.profileId || !prepare) return 'fallback';
  const prepared = await prepare({ profileId: session.profileId, cwd: session.cwd, resume });
  if (prepared === 'missing') return 'fallback';
  if (!prepared) return 'failed';
  return { input: `${prepared.line}\r`, profileLaunchId: prepared.launchId };
}
