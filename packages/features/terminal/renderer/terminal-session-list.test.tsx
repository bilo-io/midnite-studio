// vitest/jsdom: the list's per-app filter and its "Show all apps" toggle (Phase 123 Theme E), under the default host.
import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { BUILTIN_AGENTS, type TerminalSession } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetAppFilter } from './app-filter';
import { createDefaultTerminalHost } from './default-host';
import { TerminalHostProvider } from './host';
import { TerminalSessionList } from './terminal-session-list';
import { useTerminalStore } from './terminal-store';

const row = (id: string, appId?: TerminalSession['appId']): TerminalSession => ({
  id,
  kind: 'shell',
  title: id,
  cwd: `/repos/${id}`,
  repoId: `repo:${id}`,
  createdAt: 1,
  ...(appId ? { appId } : {}),
});

function renderList(appId: 'browser' | 'studio') {
  const host = createDefaultTerminalHost(appId);
  return render(
    <FrameChromeProvider chrome={createFrameChrome().chrome}>
      <TerminalHostProvider host={host}>
        <TerminalSessionList agents={[]} width={200} />
      </TerminalHostProvider>
    </FrameChromeProvider>,
  );
}

const set = vi.fn(() => Promise.resolve({ ok: true }));

beforeEach(() => {
  __resetAppFilter();
  set.mockClear();
  (window as unknown as { midniteStudio: unknown }).midniteStudio = {
    suitePrefs: {
      get: () => new Promise(() => undefined),
      set,
      onChanged: () => () => undefined,
    },
    terminal: {
      save: vi.fn(),
    },
  };
  useTerminalStore.setState({
    sessions: [row('own', 'browser'), row('studio-one'), row('mind-one', 'mind')],
    liveCwd: {},
    activeId: null,
  });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

const labels = () => screen.queryAllByTestId('terminal-session-app').map((img) => img.getAttribute('alt'));

describe('TerminalSessionList — sessions carry the app', () => {
  it('lists only this app’s own sessions by default', () => {
    renderList('browser');
    expect(screen.getByText('own')).toBeTruthy();
    expect(screen.queryByText('studio-one')).toBeNull();
    expect(screen.queryByText('mind-one')).toBeNull();
    expect(labels()).toEqual([]);
  });

  it('lists every app’s sessions, each tagged with its app, once toggled — and persists the choice', () => {
    renderList('browser');
    const toggle = screen.getByTestId('terminal-show-all-apps');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('studio-one')).toBeTruthy();
    expect(screen.getByText('mind-one')).toBeTruthy();
    expect(labels()).toEqual(['browser', 'studio', 'mind']);
    expect(set).toHaveBeenCalledWith({ key: 'terminal', value: { showAllApps: true } });
  });

  it('shows every app’s sessions in Studio by default', () => {
    renderList('studio');
    expect(screen.getByText('own')).toBeTruthy();
    expect(screen.getByText('mind-one')).toBeTruthy();
    expect(screen.getByTestId('terminal-show-all-apps').getAttribute('aria-pressed')).toBe('true');
  });

  it('offers no toggle when every session is this app’s own', () => {
    useTerminalStore.setState({ sessions: [row('own', 'browser')] });
    renderList('browser');
    expect(screen.queryByTestId('terminal-show-all-apps')).toBeNull();
  });
});

describe('openSession stamps the window’s app', () => {
  it('stamps a non-Studio app and leaves a Studio record unchanged', () => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useTerminalStore.setState({ sessions: [], appId: 'browser' });
    const a = useTerminalStore.getState().openSession({ kind: 'shell', title: 'x', cwd: '/x', repoId: 'r' });
    expect(a.appId).toBe('browser');
    useTerminalStore.getState().setAppId('studio');
    const b = useTerminalStore.getState().openSession({ kind: 'shell', title: 'y', cwd: '/y', repoId: 'r' });
    expect('appId' in b).toBe(false);
  });
});

describe('TerminalSessionList — per-repo accordions', () => {
  const claude = BUILTIN_AGENTS.find((a) => a.id === 'claude')!;

  const agentRow = (
    id: string,
    repoId: string,
    title: string,
    name: string,
    opts?: { asleep?: boolean },
  ): TerminalSession => ({
    id,
    kind: 'agent',
    agentId: 'claude',
    title,
    name,
    cwd: `/repos/${title}`,
    repoId,
    createdAt: 1,
    ...(opts?.asleep ? { asleep: true } : {}),
  });

  it('groups active and sleeping sessions per repo and excludes dismissed sessions', () => {
    useTerminalStore.setState({
      sessions: [
        agentRow('s1', 'repo:a', 'alpha', 'Fix bug'),
        agentRow('s2', 'repo:b', 'beta', 'Add tests'),
        agentRow('s3', 'repo:a', 'alpha', 'Sleeping work', { asleep: true }),
      ],
      states: { s1: 'open', s2: 'open', s3: 'exited' },
      activity: { s1: 'thinking' },
      activeId: 's1',
    });

    const { container } = render(
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <TerminalHostProvider host={createDefaultTerminalHost('studio')}>
          <TerminalSessionList agents={[claude]} width={220} />
        </TerminalHostProvider>
      </FrameChromeProvider>,
    );

    const alphaHeader = screen.getByRole('button', { name: 'Collapse alpha' });
    const betaHeader = screen.getByRole('button', { name: 'Collapse beta' });
    expect(alphaHeader.getAttribute('aria-expanded')).toBe('true');
    expect(betaHeader.getAttribute('aria-expanded')).toBe('true');

    const alphaBody = container.querySelector('[id="terminal-repo-/repos/alpha"]') as HTMLElement;
    const betaBody = container.querySelector('[id="terminal-repo-/repos/beta"]') as HTMLElement;
    expect(alphaBody.textContent).toContain('Fix bug');
    expect(alphaBody.textContent).toContain('Sleeping work');
    expect(betaBody.textContent).toContain('Add tests');

    // Existing lifecycle states and activity indicator are preserved
    expect(alphaBody.querySelectorAll('[data-phase="live"]')).toHaveLength(1);
    expect(alphaBody.querySelectorAll('[data-phase="asleep"]')).toHaveLength(1);
    expect(alphaBody.querySelector('[data-activity="thinking"]')).not.toBeNull();

    // Dismissing a session removes it from its repo group
    act(() => {
      useTerminalStore.setState((state) => ({
        sessions: state.sessions.filter((s) => s.id !== 's3'),
      }));
    });
    expect(alphaBody.textContent).not.toContain('Sleeping work');
  });

  it('toggles collapse/expand when clicking a repo header and skips collapsed groups in keyboard nav', () => {
    useTerminalStore.setState({
      sessions: [
        agentRow('s1', 'repo:a', 'alpha', 'First'),
        agentRow('s2', 'repo:b', 'beta', 'Second'),
        agentRow('s3', 'repo:c', 'gamma', 'Third'),
      ],
      states: { s1: 'open', s2: 'open', s3: 'open' },
      activeId: 's1',
    });

    const { container } = render(
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <TerminalHostProvider host={createDefaultTerminalHost('studio')}>
          <TerminalSessionList agents={[claude]} width={220} />
        </TerminalHostProvider>
      </FrameChromeProvider>,
    );

    const betaHeader = screen.getByRole('button', { name: 'Collapse beta' });
    fireEvent.click(betaHeader);
    expect(screen.getByRole('button', { name: 'Expand beta' }).getAttribute('aria-expanded')).toBe('false');

    const listEl = container.querySelector('[data-session-list]') as HTMLElement;
    fireEvent.keyDown(listEl, { key: 'ArrowDown' });
    expect(useTerminalStore.getState().activeId).toBe('s3');

    fireEvent.click(screen.getByRole('button', { name: 'Expand beta' }));
    expect(screen.getByRole('button', { name: 'Collapse beta' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('moves and merges sessions across folder accordions when liveCwd or cwd changes', () => {
    useTerminalStore.setState({
      sessions: [
        { ...agentRow('s1', 'repo:a', 'alpha', 'First'), cwd: '/Users/dev/alpha/' },
        { ...agentRow('s2', 'repo:b', 'beta', 'Second'), cwd: '/Users/dev/beta' },
      ],
      states: { s1: 'open', s2: 'open' },
      activeId: 's1',
    });

    const { container } = render(
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <TerminalHostProvider host={createDefaultTerminalHost('studio')}>
          <TerminalSessionList agents={[claude]} width={220} />
        </TerminalHostProvider>
      </FrameChromeProvider>,
    );

    expect(screen.getByRole('button', { name: 'Collapse alpha' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse beta' })).toBeTruthy();

    // `cd /Users/dev/beta/` via OSC 7 merges s1 into beta's accordion
    act(() => {
      useTerminalStore.getState().setLiveCwd('s1', '/Users/dev/beta/');
    });

    expect(screen.queryByRole('button', { name: 'Collapse alpha' })).toBeNull();
    const betaBody = container.querySelector('[id="terminal-repo-/Users/dev/beta"]') as HTMLElement;
    expect(betaBody.textContent).toContain('First');
    expect(betaBody.textContent).toContain('Second');

    // `cd /Users/dev/gamma` creates a new open accordion with folder basename 'gamma'
    act(() => {
      useTerminalStore.getState().setLiveCwd('s1', '/Users/dev/gamma');
    });

    const gammaHeader = screen.getByRole('button', { name: 'Collapse gamma' });
    expect(gammaHeader.getAttribute('aria-expanded')).toBe('true');
    const gammaBody = container.querySelector('[id="terminal-repo-/Users/dev/gamma"]') as HTMLElement;
    expect(gammaBody.textContent).toContain('First');
    expect(betaBody.textContent).not.toContain('First');
  });

  it('opens a searchable flyout from a folder accordion + button without toggling it and creates a session in that folder', () => {
    useTerminalStore.setState({
      sessions: [
        { ...agentRow('s1', 'repo:a', 'old-title', 'First'), cwd: '/Users/dev/alpha' },
        { ...agentRow('s2', 'repo:b', 'beta', 'Second'), cwd: '/Users/dev/beta' },
      ],
      states: { s1: 'open', s2: 'open' },
      activeId: 's2',
    });

    render(
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <TerminalHostProvider host={createDefaultTerminalHost('studio')}>
          <TerminalSessionList
            agents={[claude]}
            agentStatus={[{ id: 'claude', installed: true, resolvedPath: '/usr/local/bin/claude' }]}
            width={220}
          />
        </TerminalHostProvider>
      </FrameChromeProvider>,
    );

    const alphaHeader = screen.getByRole('button', { name: 'Collapse alpha' });
    const addBtn = screen.getByRole('button', { name: 'New session in alpha' });
    fireEvent.click(addBtn);

    // Accordion stays expanded
    expect(alphaHeader.getAttribute('aria-expanded')).toBe('true');

    // Searchable flyout opens
    const search = screen.getByPlaceholderText('Find a CLI…');
    expect(search).toBeTruthy();

    fireEvent.change(search, { target: { value: 'claude' } });
    fireEvent.click(screen.getByRole('menuitem', { name: /Claude/ }));

    const created = useTerminalStore.getState().sessions.find((s) => s.id !== 's1' && s.id !== 's2');
    expect(created).toBeDefined();
    expect(created?.cwd).toBe('/Users/dev/alpha');
    expect(created?.title).toBe('alpha');
    expect(created?.agentId).toBe('claude');
  });

  it('invokes host.onSelectRepo with liveCwd (falling back to session.cwd) when clicking a session row', () => {
    const onSelectRepo = vi.fn();
    const host = { ...createDefaultTerminalHost('studio'), onSelectRepo };

    useTerminalStore.setState({
      sessions: [
        { ...row('s1', 'studio'), cwd: '/Users/dev/alpha', repoId: 'repo:a', title: 'alpha' },
        { ...row('s2', 'studio'), cwd: '/Users/dev/beta', repoId: 'repo:b', title: 'beta' },
      ],
      liveCwd: { s2: '/Users/dev/gamma' },
      states: { s1: 'open', s2: 'open' },
      activeId: 's1',
    });

    render(
      <FrameChromeProvider chrome={createFrameChrome().chrome}>
        <TerminalHostProvider host={host}>
          <TerminalSessionList agents={[]} width={220} />
        </TerminalHostProvider>
      </FrameChromeProvider>,
    );

    const rows = document.querySelectorAll('[data-session-row]');
    fireEvent.click(rows[0]!);
    expect(onSelectRepo).toHaveBeenCalledWith({ repoId: 'repo:a', cwd: '/Users/dev/alpha' });

    fireEvent.click(rows[1]!);
    expect(onSelectRepo).toHaveBeenCalledWith({ repoId: 'repo:b', cwd: '/Users/dev/gamma' });
    expect(useTerminalStore.getState().activeId).toBe('s2');
  });
});
