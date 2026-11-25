import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { launchProfileSession, prepareProfileStart } from './profile-launch';
import { agentInitialInput } from './terminal-panel';
import { useTerminalStore } from './terminal-store';

const profile = { id: 'ap-1', name: 'Reviewer', baseAgentId: 'claude' };
const target = { repoId: 'repo-1', cwd: '/repos/demo', title: 'demo' };

beforeEach(() => {
  useTerminalStore.setState({ sessions: [], activeId: null, pendingInput: {}, launchIds: {} });
});

describe('launchProfileSession', () => {
  it('opens an agent session carrying the profile, with the line and launch id queued in the same tick', async () => {
    const prepare = vi.fn(async () => ({ launchId: 'abc123', line: "claude --append-system-prompt-file '/p.md'" }));
    let seenInSameTick: { pending?: string; launch?: string } = {};
    const unsub = useTerminalStore.subscribe((state) => {
      const session = state.sessions[0];
      if (session && state.pendingInput[session.id] !== undefined) {
        seenInSameTick = { pending: state.pendingInput[session.id], launch: state.launchIds[session.id] };
      }
    });
    const session = await launchProfileSession(prepare, profile, target);
    unsub();

    expect(prepare).toHaveBeenCalledWith({ profileId: 'ap-1', cwd: '/repos/demo', resume: false });
    expect(session).toMatchObject({ kind: 'agent', agentId: 'claude', profileId: 'ap-1', title: 'demo', cwd: '/repos/demo' });
    expect(seenInSameTick).toEqual({ pending: "claude --append-system-prompt-file '/p.md'\r", launch: 'abc123' });
    expect(useTerminalStore.getState().activeId).toBe(session?.id);
  });

  it('opens nothing when prepare fails', async () => {
    expect(await launchProfileSession(async () => null, profile, target)).toBeNull();
    expect(useTerminalStore.getState().sessions).toEqual([]);
  });

  it('never types the base command for a profile session', () => {
    expect(agentInitialInput([...BUILTIN_AGENTS], 'claude', 'ap-1')).toBeUndefined();
    expect(agentInitialInput([...BUILTIN_AGENTS], 'claude')).toBe('claude\r');
  });
});

describe('prepareProfileStart (wake and Resume)', () => {
  const session = { profileId: 'ap-1', cwd: '/repos/demo' };

  it('wakes with resume: false and resumes with resume: true', async () => {
    const prepare = vi.fn(async ({ resume }: { resume: boolean }) => ({ launchId: resume ? 'r' : 'w', line: resume ? 'claude --resume' : 'claude' }));
    expect(await prepareProfileStart(prepare, session, false)).toEqual({ input: 'claude\r', profileLaunchId: 'w' });
    expect(await prepareProfileStart(prepare, session, true)).toEqual({ input: 'claude --resume\r', profileLaunchId: 'r' });
    expect(prepare.mock.calls.map(([req]) => req.resume)).toEqual([false, true]);
  });

  it('answers null — fall back to the base CLI — for a failed prepare, a plain session or no host', async () => {
    expect(await prepareProfileStart(async () => null, session, false)).toBeNull();
    const prepare = vi.fn();
    expect(await prepareProfileStart(prepare, { cwd: '/r' }, false)).toBeNull();
    expect(await prepareProfileStart(undefined, session, false)).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });
});
