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
    if (session === 'missing' || session === null) throw new Error('expected a session');
    unsub();

    expect(prepare).toHaveBeenCalledWith({ profileId: 'ap-1', cwd: '/repos/demo', resume: false });
    expect(session).toMatchObject({ kind: 'agent', agentId: 'claude', profileId: 'ap-1', title: 'demo', cwd: '/repos/demo' });
    expect(seenInSameTick).toEqual({ pending: "claude --append-system-prompt-file '/p.md'\r", launch: 'abc123' });
    expect(useTerminalStore.getState().activeId).toBe(session.id);
  });

  it('opens nothing when prepare fails or the agent is gone', async () => {
    expect(await launchProfileSession(async () => null, profile, target)).toBeNull();
    expect(await launchProfileSession(async () => 'missing' as const, profile, target)).toBe('missing');
    expect(useTerminalStore.getState().sessions).toEqual([]);
  });

  it('carries a hand-off prompt to main and types the line without a Return unless autoSend', async () => {
    const prepare = vi.fn(async () => ({ launchId: 'l1', line: "claude 'do it'" }));
    const typed = await launchProfileSession(prepare, profile, { ...target, prompt: 'do it' });
    expect(prepare).toHaveBeenCalledWith({ profileId: 'ap-1', cwd: '/repos/demo', resume: false, prompt: 'do it' });
    if (typed === 'missing' || typed === null) throw new Error('expected a session');
    expect(useTerminalStore.getState().pendingInput[typed.id]).toBe("claude 'do it'");
    const sent = await launchProfileSession(prepare, profile, { ...target, prompt: 'do it', autoSend: true });
    if (sent === 'missing' || sent === null) throw new Error('expected a session');
    expect(useTerminalStore.getState().pendingInput[sent.id]).toBe("claude 'do it'\r");
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

  it('falls back to the base CLI for a deleted agent, a plain session or no host', async () => {
    expect(await prepareProfileStart(async () => 'missing' as const, session, false)).toBe('fallback');
    const prepare = vi.fn();
    expect(await prepareProfileStart(prepare, { cwd: '/r' }, false)).toBe('fallback');
    expect(await prepareProfileStart(undefined, session, false)).toBe('fallback');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('starts nothing when the prepare failed: the bare CLI would drop the allowlist', async () => {
    expect(await prepareProfileStart(async () => null, session, false)).toBe('failed');
  });
});
