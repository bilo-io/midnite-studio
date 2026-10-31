// vitest/jsdom: composition of the shell, Settings and the status bar over no bridge — no real browser needed.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LuShieldAlert, LuRadar } from 'react-icons/lu';

import { SuiteAppShell } from './suite-app-shell';
import { navFromGroups, type NavConfig } from './nav-config';

const NAV: NavConfig = {
  views: [
    { id: 'one', label: 'One', icon: LuShieldAlert },
    { id: 'two', label: 'Two', icon: LuRadar },
  ],
};

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

function renderShell(extra: Partial<React.ComponentProps<typeof SuiteAppShell>> = {}) {
  return render(
    <SuiteAppShell app="vanguard" name="Midnite Vanguard" accent="#e11d48" nav={NAV} home="one" {...extra}>
      {(view) => <p>view:{view}</p>}
    </SuiteAppShell>,
  );
}

describe('SuiteAppShell', () => {
  it('renders the home view, switches on a rail click and keeps its own state', () => {
    renderShell();
    expect(screen.getByText('view:one')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: 'Two' }));
    expect(screen.getByText('view:two')).toBeTruthy();
  });

  it('shows the suite Settings pages in place of the view, and returns to a view on a rail click', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = screen.getByTestId('suite-settings');
    expect(within(settings).getAllByText('Appearance').length).toBeGreaterThan(0);
    expect(within(settings).getAllByText('Keyboard shortcuts').length).toBeGreaterThan(0);
    expect(screen.queryByText('view:one')).toBeNull();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: 'One' }));
    expect(screen.getByText('view:one')).toBeTruthy();
  });

  it('keeps the view mounted, hidden and inert, while Settings is open when asked to', () => {
    let mounts = 0;
    function Probe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <p>probe</p>;
    }
    render(
      <SuiteAppShell app="browser" name="Midnite Browser" accent="#0ea5e9" nav={NAV} home="one" keepViewMounted>
        {() => <Probe />}
      </SuiteAppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByTestId('suite-settings')).toBeTruthy();
    const view = screen.getByTestId('suite-view');
    expect(view.className).toContain('invisible');
    expect(view.getAttribute('aria-hidden')).toBe('true');
    expect(view.hasAttribute('inert')).toBe(true);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: 'One' }));
    expect(screen.queryByTestId('suite-settings')).toBeNull();
    expect(screen.getByTestId('suite-view').className).not.toContain('invisible');
    expect(mounts).toBe(1);
  });

  it('unmounts the view while Settings is open by default', () => {
    let mounts = 0;
    function Probe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <p>probe</p>;
    }
    render(
      <SuiteAppShell app="vanguard" name="Midnite Vanguard" accent="#e11d48" nav={NAV} home="one">
        {() => <Probe />}
      </SuiteAppShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByText('probe')).toBeNull();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: 'One' }));
    expect(mounts).toBe(2);
  });

  it('offers no terminal, companion or FAB host without `panels` (gated off until a suite app has a pty host)', () => {
    const { container } = renderShell();
    expect(container.querySelector('[data-shell-panel]')).toBeNull();
  });

  it('is controlled when the app passes view and onViewChange', () => {
    const seen: string[] = [];
    renderShell({ view: 'two', onViewChange: (v) => seen.push(v) });
    expect(screen.getByText('view:two')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: 'One' }));
    expect(seen).toEqual(['one']);
  });

  it('mounts no status bar until a segment is offered', () => {
    renderShell();
    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(screen.queryByTestId('status-bar')).toBeNull();
  });

  it('opens Settings on Mod+, and says so through onSettingsOpenChange', () => {
    const seen: boolean[] = [];
    renderShell({ onSettingsOpenChange: (open) => seen.push(open) });
    fireEvent.keyDown(window, { key: ',', code: 'Comma', ctrlKey: true });
    expect(screen.getByTestId('suite-settings')).toBeTruthy();
    expect(seen).toEqual([true]);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Views' })).getByRole('link', { name: 'One' }));
    expect(seen).toEqual([true, false]);
  });
});

describe('SuiteAppShell: launcher link landing', () => {
  const GROUPED = navFromGroups([
    { id: 'agents', label: 'Agents', icon: LuShieldAlert, views: [{ id: 'chats', label: 'Chats', icon: LuShieldAlert }] },
    {
      id: 'coder',
      label: 'Coder',
      icon: LuRadar,
      views: [
        { id: 'requests', label: 'Requests', icon: LuRadar },
        { id: 'reviews', label: 'Reviews', icon: LuRadar },
      ],
    },
  ]);
  function withLink(taken: { module?: string; view?: string } | null) {
    let push: (landing: { module?: string; view?: string }) => void = () => undefined;
    const take = vi.fn(async () => taken);
    (window as { midniteStudio?: unknown }).midniteStudio = {
      suiteLink: { take, onOpen: (h: typeof push) => { push = h; return () => undefined; } },
    };
    return { take, push: (l: { module?: string; view?: string }) => act(() => push(l)) };
  }
  const shell = () =>
    render(
      <SuiteAppShell app="agents" name="Midnite Agents" accent="#6366f1" nav={GROUPED} home="chats">
        {(view) => <p>view:{view}</p>}
      </SuiteAppShell>,
    );

  it('lands a cold start on the module and view the launcher passed', async () => {
    withLink({ module: 'coder', view: 'reviews' });
    shell();
    expect(await screen.findByText('view:reviews')).toBeTruthy();
  });

  it('lands a link that reaches the running host, leaving Settings', async () => {
    const { push } = withLink(null);
    shell();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    push({ module: 'coder' });
    expect(await screen.findByText('view:requests')).toBeTruthy();
  });

  it('stays on the home view for an unknown module or view', async () => {
    const { take, push } = withLink({ module: 'vault', view: 'nope' });
    shell();
    await vi.waitFor(() => expect(take).toHaveBeenCalled());
    push({ view: 'also-nope' });
    expect(screen.getByText('view:chats')).toBeTruthy();
  });
});
