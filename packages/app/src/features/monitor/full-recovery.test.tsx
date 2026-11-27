// vitest/jsdom: no browser capability needed — a mock bridge and the two stores.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { FullRecoveryHost } from './full-recovery-dialog';
import { groupByRepo, isAllAttached, runFullRecovery, useFullRecoveryStore } from './full-recovery';

const session = (sessionId: string, repoId: string) => ({
  sessionId,
  title: `title-${sessionId}`,
  cwd: `/w/${repoId}`,
  repoId,
  legacy: false,
});

function mockBridge(opts: { recover: unknown; processes?: unknown }) {
  const recoverDetached = vi.fn().mockResolvedValue(opts.recover);
  const processes = vi.fn().mockResolvedValue(opts.processes ?? { ok: false, message: 'no' });
  (window as unknown as { midniteStudio: unknown }).midniteStudio = {
    terminal: { recoverDetached, save: vi.fn() },
    optimizer: { processes },
    repos: { list: vi.fn().mockResolvedValue([]) },
  };
  return { recoverDetached };
}

beforeEach(() => {
  useFullRecoveryStore.setState({ summary: null });
  useTerminalStore.setState({
    sessions: [],
    legacy: {},
    states: {},
    activeId: null,
    refresh: vi.fn().mockResolvedValue(undefined),
  });
});
afterEach(() => {
  cleanup();
  (window as unknown as { midniteStudio?: unknown }).midniteStudio = undefined;
});

describe('groupByRepo', () => {
  it('groups by repoId in first-seen order', () => {
    const groups = groupByRepo([session('a', 'r1'), session('b', 'r2'), session('c', 'r1')]);
    expect(groups.map((g) => [g.repoId, g.sessions.map((s) => s.sessionId)])).toEqual([
      ['r1', ['a', 'c']],
      ['r2', ['b']],
    ]);
  });
});

describe('runFullRecovery', () => {
  it('an error envelope notifies and opens no dialog', async () => {
    mockBridge({ recover: { ok: false, kind: 'error', message: 'broker down' } });
    const notify = vi.fn();
    expect(await runFullRecovery({ notify })).toBeNull();
    expect(notify).toHaveBeenCalledWith({
      title: 'Could not recover sessions',
      body: 'broker down',
    });
    expect(useFullRecoveryStore.getState().summary).toBeNull();
  });

  it('skips the unreachable section while the inventory carries no lost rows', async () => {
    mockBridge({
      recover: { ok: true, recovered: [], live: 0, previousBuild: 0 },
      processes: {
        ok: true,
        value: {
          processes: [
            { pid: 5, ppid: 1, name: 'x', argv: 'x', rssBytes: 10, cpuPercent: 0, ours: true },
          ],
          memory: null,
          error: null,
        },
      },
    });
    const summary = await runFullRecovery({ notify: vi.fn() });
    expect(summary?.unreachable).toEqual([]);
  });

  it('counts only broker roots as unreachable, not their child processes', async () => {
    const row = (pid: number, ppid: number, brokerPid: number) => ({
      pid,
      ppid,
      name: `p${pid}`,
      argv: 'x',
      rssBytes: 100,
      cpuPercent: 0,
      ours: true,
      lost: 'unreachable',
      brokerPid,
    });
    mockBridge({
      recover: { ok: true, recovered: [], live: 0, previousBuild: 0 },
      processes: {
        ok: true,
        value: { processes: [row(5, 1, 5), row(6, 5, 5), row(7, 6, 5)], memory: null, error: null },
      },
    });
    const summary = await runFullRecovery({ notify: vi.fn() });
    expect(summary?.unreachable.map((p) => p.pid)).toEqual([5]);
  });

  it('a second call while one runs joins it', async () => {
    const { recoverDetached } = mockBridge({
      recover: { ok: true, recovered: [], live: 0, previousBuild: 0 },
    });
    const dialogs = { notify: vi.fn() };
    await Promise.all([runFullRecovery(dialogs), runFullRecovery(dialogs)]);
    expect(recoverDetached).toHaveBeenCalledTimes(1);
  });

  it('keeps rows Theme B marks unreachable', async () => {
    mockBridge({
      recover: { ok: true, recovered: [], live: 3, previousBuild: 0 },
      processes: {
        ok: true,
        value: {
          processes: [
            {
              pid: 5,
              ppid: 1,
              name: 'broker',
              argv: 'x',
              rssBytes: 2048,
              cpuPercent: 0,
              ours: true,
              lost: 'unreachable',
              brokerPid: 5,
            },
          ],
          memory: null,
          error: null,
        },
      },
    });
    const summary = await runFullRecovery({ notify: vi.fn() });
    expect(summary?.unreachable).toEqual([{ pid: 5, name: 'broker', rssBytes: 2048 }]);
  });
});

describe('FullRecoveryHost', () => {
  const renderHost = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DialogHost>
          <FullRecoveryHost />
        </DialogHost>
      </QueryClientProvider>,
    );

  it('says everything is attached when nothing needs recovering', async () => {
    mockBridge({ recover: { ok: true, recovered: [], live: 2, previousBuild: 0 } });
    renderHost();
    await runFullRecovery({ notify: vi.fn() });
    expect(await screen.findByText('Everything is attached')).toBeTruthy();
    expect(screen.getByText('2 sessions running')).toBeTruthy();
    expect(screen.queryByText(/Recovered \(/)).toBeNull();
  });

  it('counts sessions another app owns under "Belongs to <app>" and is not "attached"', async () => {
    mockBridge({
      recover: { ok: true, recovered: [], live: 1, previousBuild: 0, otherApps: [{ app: 'agents', count: 2 }] },
    });
    renderHost();
    await runFullRecovery({ notify: vi.fn() });
    expect(await screen.findByText('Belongs to agents (2)')).toBeTruthy();
    expect(screen.queryByText('Everything is attached')).toBeNull();
    expect(screen.queryByText(/Recovered \(/)).toBeNull();
    expect(useFullRecoveryStore.getState().summary?.recovered).toEqual([]);
  });

  it('lists recovered sessions grouped by repo and Reveal selects the repo and the session', async () => {
    mockBridge({
      recover: {
        ok: true,
        recovered: [session('s1', 'r1'), session('s2', 'r2'), session('s3', 'r1')],
        live: 3,
        previousBuild: 0,
      },
    });
    const s = useTerminalStore
      .getState()
      .openSession({ kind: 'agent', agentId: 'claude', title: 'x', cwd: '/w/r1', repoId: 'r1' });
    renderHost();
    await runFullRecovery({ notify: vi.fn() });
    expect(await screen.findByText('Recovered (3)')).toBeTruthy();
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(screen.queryByText(/Still on a previous build/)).toBeNull();
    const selectRepo = vi.spyOn(useUiStore.getState(), 'selectRepo');
    useFullRecoveryStore.setState({
      summary: { recovered: [session(s.id, 'r1')], live: 1, previousBuild: 0, otherApps: [], unreachable: [] },
    });
    fireEvent.click(await screen.findByText('Reveal'));
    expect(selectRepo).toHaveBeenCalledWith('r1');
    expect(useTerminalStore.getState().activeId).toBe(s.id);
  });

  it('shows the unreachable section only with data', async () => {
    useFullRecoveryStore.setState({
      summary: {
        recovered: [],
        live: 1,
        previousBuild: 0,
        otherApps: [],
        unreachable: [{ pid: 9, name: 'b', rssBytes: 1024 ** 3 }],
      },
    });
    renderHost();
    expect(await screen.findByText(/Unreachable \(1 · /)).toBeTruthy();
    expect(screen.getByText('Manage resources')).toBeTruthy();
    expect(screen.queryByText('Everything is attached')).toBeNull();
  });

  it('does not say everything is attached when the live store still holds a previous-build session', async () => {
    // Main reports previousBuild 0, yet the renderer's own list has one: the section wins, the banner is absent.
    const s = useTerminalStore
      .getState()
      .openSession({ kind: 'agent', agentId: 'claude', title: 'old', cwd: '/w/r1', repoId: 'r1' });
    useTerminalStore.setState({ legacy: { [s.id]: true } });
    const summary = { recovered: [], live: 1, previousBuild: 0, otherApps: [], unreachable: [] };
    expect(isAllAttached(summary, 1)).toBe(false);
    expect(isAllAttached(summary, 0)).toBe(true);
    useFullRecoveryStore.setState({ summary });
    renderHost();
    expect(await screen.findByText(/Still on a previous build \(1\)/)).toBeTruthy();
    expect(screen.queryByText('Everything is attached')).toBeNull();
  });

  it('End… closes the summary so the confirm inside the terminal panel is not covered', async () => {
    const panel = document.createElement('div');
    panel.setAttribute('data-terminal-panel', '');
    document.body.appendChild(panel);
    const s = useTerminalStore
      .getState()
      .openSession({ kind: 'agent', agentId: 'claude', title: 'old', cwd: '/w/r1', repoId: 'r1' });
    useTerminalStore.setState({ legacy: { [s.id]: true } });
    useFullRecoveryStore.setState({
      summary: { recovered: [], live: 1, previousBuild: 1, otherApps: [], unreachable: [] },
    });
    renderHost();
    fireEvent.click(await screen.findByText('End…'));
    expect(screen.queryByTestId('full-recovery-dialog')).toBeNull();
    expect(useFullRecoveryStore.getState().summary).toBeNull();
    expect(await screen.findByText('End this session?')).toBeTruthy();
    panel.remove();
  });
});
