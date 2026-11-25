import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { groupIconSelectOptions } from '../components/select/icon-select';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { startStudioLoopProfileSession } from './profile-pickers';

const prepare = vi.hoisted(() => vi.fn());
vi.mock('./profile-launch', () => ({ studioPrepareProfileLaunch: prepare }));

const INPUT = {
  profileId: 'profile-rev',
  baseAgentId: 'codex',
  repoId: 'repo-1',
  cwd: '/work',
  title: 'Patrol',
  prompt: '/loop /midnite-patrol',
  loopId: 'patrol',
  autoSend: true,
};

describe('startStudioLoopProfileSession (#1699)', () => {
  beforeEach(() => prepare.mockReset());
  afterEach(() => useTerminalStore.setState({ sessions: [] }));

  it("opens a loop session under the custom agent with main's line, the loop's prompt as its first prompt", async () => {
    prepare.mockResolvedValue({ launchId: 'l1', line: 'codex --x' });
    const id = await startStudioLoopProfileSession(INPUT);
    // Codex reads a slash command as `$name`, as the roster launch types it.
    expect(prepare).toHaveBeenCalledWith({ profileId: 'profile-rev', cwd: '/work', resume: false, prompt: '$loop $midnite-patrol' });
    const session = useTerminalStore.getState().sessions.find((s) => s.id === id);
    expect(session).toMatchObject({ agentId: 'codex', profileId: 'profile-rev', loopId: 'patrol', cwd: '/work' });
  });

  it('answers missing for a deleted agent and opens nothing', async () => {
    prepare.mockResolvedValue('missing');
    await expect(startStudioLoopProfileSession(INPUT)).resolves.toBe('missing');
    expect(useTerminalStore.getState().sessions).toHaveLength(0);
  });
});

describe('groupIconSelectOptions', () => {
  it('leaves ungrouped options alone and folds runs of one group under one header', () => {
    const plain = [{ id: 'a', label: 'A' }];
    expect(groupIconSelectOptions(plain)).toBe(plain);
    expect(
      groupIconSelectOptions([
        { id: 'p1', label: 'P1', group: 'Your agents' },
        { id: 'p2', label: 'P2', group: 'Your agents' },
        { id: 'claude', label: 'Claude', group: 'Agents' },
      ]),
    ).toEqual([
      { label: 'Your agents', options: [{ id: 'p1', label: 'P1', group: 'Your agents' }, { id: 'p2', label: 'P2', group: 'Your agents' }] },
      { label: 'Agents', options: [{ id: 'claude', label: 'Claude', group: 'Agents' }] },
    ]);
  });
});
