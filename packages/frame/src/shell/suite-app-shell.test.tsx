// vitest/jsdom: composition of the shell, Settings and the status bar over no bridge — no real browser needed.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LuShieldAlert, LuRadar } from 'react-icons/lu';

import { SuiteAppShell } from './suite-app-shell';
import type { NavConfig } from './nav-config';

const NAV: NavConfig = {
  views: [
    { id: 'one', label: 'One', icon: LuShieldAlert },
    { id: 'two', label: 'Two', icon: LuRadar },
  ],
};

afterEach(cleanup);

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
