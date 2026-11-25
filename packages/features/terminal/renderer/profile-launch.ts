import type { AgentProfile, TerminalSession } from '@midnite/studio-shared';

import { useTerminalStore } from './terminal-store';

/**
 * Custom agents in the terminal (Phase 154 Theme F).
 *
 * Main builds a custom agent's whole typed line (`agentProfile:prepareLaunch`); the renderer never does.
 * What comes back is that line and a single-use launch id, which `pty.create` carries so main binds the
 * agent's private MCP socket to the session.
 */
export type PrepareProfileLaunch = (req: {
  profileId: string;
  cwd: string;
  resume: boolean;
}) => Promise<{ launchId: string; line: string } | null>;

/**
 * Opens a session for `profile` in `target`. Prepare first, so a refusal (an unknown base CLI, a socket
 * that would not start) opens nothing. The session, its launch id and its typed line land in the same
 * tick, so the view mounts with the line already queued and never types the base command first.
 */
export async function launchProfileSession(
  prepare: PrepareProfileLaunch,
  profile: Pick<AgentProfile, 'id' | 'name' | 'baseAgentId'>,
  target: { repoId: string; cwd: string; title?: string },
): Promise<TerminalSession | null> {
  const prepared = await prepare({ profileId: profile.id, cwd: target.cwd, resume: false });
  if (!prepared) return null;
  const store = useTerminalStore.getState();
  const session = store.openSession({
    kind: 'agent',
    agentId: profile.baseAgentId,
    profileId: profile.id,
    title: target.title ?? profile.name,
    cwd: target.cwd,
    repoId: target.repoId,
  });
  store.setLaunchId(session.id, prepared.launchId);
  store.queueInput(session.id, `${prepared.line}\r`);
  return session;
}

/**
 * What waking (`resume: false`) or resuming (`resume: true`) a custom agent's session types, re-prepared
 * so the agent comes back with its prompt, model and tools. `null` when the session runs no custom agent,
 * the host cannot prepare, or the prepare failed (a deleted agent): the caller then does what it does for
 * the base CLI.
 */
export async function prepareProfileStart(
  prepare: PrepareProfileLaunch | undefined,
  session: Pick<TerminalSession, 'profileId' | 'cwd'>,
  resume: boolean,
): Promise<{ input: string; profileLaunchId: string } | null> {
  if (!session.profileId || !prepare) return null;
  const prepared = await prepare({ profileId: session.profileId, cwd: session.cwd, resume });
  return prepared ? { input: `${prepared.line}\r`, profileLaunchId: prepared.launchId } : null;
}
