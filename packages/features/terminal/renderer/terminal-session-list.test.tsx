// vitest/jsdom: the list's per-app filter and its "Show all apps" toggle (Phase 123 Theme E), under the default host.
import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import type { TerminalSession } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  };
  useTerminalStore.setState({
    sessions: [row('own', 'browser'), row('studio-one'), row('mind-one', 'mind')],
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
