import type { TerminalSession } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { ActivityIndicator, TerminalSessionList } from './terminal-session-list';
import { useTerminalStore } from './terminal-store';

afterEach(() => {
  cleanup();
  useTerminalStore.setState({
    sessions: [],
    states: {},
    legacy: {},
    legacyBannerDismissed: false,
  });
});

describe('ActivityIndicator', () => {
  it.each([
    ['thinking' as const, 'thinking', 'Thinking'],
    ['waiting' as const, 'waiting', 'Waiting for input'],
    ['idle' as const, 'idle', 'Idle'],
    [undefined, 'unknown', 'Activity unknown'],
  ])('renders %s as data-activity=%s with the label %s', (activity, expectedData, label) => {
    const { container } = render(<ActivityIndicator activity={activity} />);
    expect(container.querySelector(`[data-activity="${expectedData}"]`)).not.toBeNull();
    expect(screen.getByLabelText(label)).not.toBeNull();
  });

  it('never renders a live region — an agent repaints too fast for one to be read', () => {
    for (const activity of ['thinking', 'waiting', 'idle', undefined] as const) {
      const { container, unmount } = render(<ActivityIndicator activity={activity} />);
      expect(container.querySelector('[aria-live]')).toBeNull();
      unmount();
    }
  });
});

describe('TerminalSessionList — legacy provenance (Phase 51 Theme G)', () => {
  const session = (id: string): TerminalSession => ({
    id,
    kind: 'shell',
    title: 'repo',
    cwd: '/repo',
    repoId: 'repo:1',
    createdAt: 0,
  });

  it('marks a live legacy session with the provenance glyph, not "Asleep"', () => {
    // A legacy session with a bound pty is `state: 'open'` — sessionPhase
    // reports it live (Theme G), so only the legacy check should surface a
    // moon glyph here, and it must not say "Asleep".
    useTerminalStore.setState({
      sessions: [session('s-legacy'), session('s-2')],
      states: { 's-legacy': 'open', 's-2': 'open' },
      legacy: { 's-legacy': true },
    });

    render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} />
      </DialogHost>,
    );

    expect(screen.getByLabelText('From a previous run')).not.toBeNull();
    expect(screen.queryByLabelText('Asleep')).toBeNull();
  });

  it('still marks a genuinely slept session "Asleep", not as provenance', () => {
    useTerminalStore.setState({
      sessions: [session('s-asleep'), session('s-2')].map((s, i) =>
        i === 0 ? { ...s, asleep: true } : s,
      ),
      states: { 's-asleep': 'exited', 's-2': 'open' },
      legacy: {},
    });

    render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} />
      </DialogHost>,
    );

    expect(screen.getByLabelText('Asleep')).not.toBeNull();
    expect(screen.queryByLabelText('From a previous run')).toBeNull();
  });
});

describe('TerminalSessionList — legacy banner docking and actions', () => {
  const session = (id: string): TerminalSession => ({
    id,
    kind: 'shell',
    title: 'repo',
    cwd: '/repo',
    repoId: 'repo:1',
    createdAt: 0,
  });

  it('docks the banner at the bottom of the session list container', () => {
    useTerminalStore.setState({
      sessions: [session('s-legacy'), session('s-2')],
      states: { 's-legacy': 'open', 's-2': 'open' },
      legacy: { 's-legacy': true },
      legacyBannerDismissed: false,
    });

    const { container } = render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} />
      </DialogHost>,
    );

    const listContainer = container.querySelector('[data-session-list]') as HTMLElement;
    expect(listContainer).not.toBeNull();
    expect(listContainer.className).toContain('flex');
    expect(listContainer.className).toContain('flex-col');
    expect(listContainer.className).toContain('h-full');

    const alert = screen.getByRole('alert');
    expect(alert).not.toBeNull();
    expect(alert.className).toContain('shrink-0');

    // Alert should be docked at the bottom: it is the last child of [data-session-list]
    expect(listContainer.lastElementChild).toBe(alert);

    // And the previous sibling is the scrollable session rows wrapper
    const scrollWrapper = listContainer.firstElementChild as HTMLElement;
    expect(scrollWrapper).not.toBeNull();
    expect(scrollWrapper.className).toContain('flex-1');
    expect(scrollWrapper.className).toContain('overflow-y-auto');
  });

  it('renders the Dismiss button before (to the left of) the Restart button', () => {
    useTerminalStore.setState({
      sessions: [session('s-legacy'), session('s-2')],
      states: { 's-legacy': 'open', 's-2': 'open' },
      legacy: { 's-legacy': true },
      legacyBannerDismissed: false,
    });

    render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} />
      </DialogHost>,
    );

    const alert = screen.getByRole('alert');
    const buttons = within(alert).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toBe('Dismiss');
    expect(buttons[1]?.textContent).toBe('Restart');
  });

  it('dismisses the banner when clicking Dismiss', () => {
    useTerminalStore.setState({
      sessions: [session('s-legacy'), session('s-2')],
      states: { 's-legacy': 'open', 's-2': 'open' },
      legacy: { 's-legacy': true },
      legacyBannerDismissed: false,
    });

    render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} />
      </DialogHost>,
    );

    const alert = screen.getByRole('alert');
    const dismissButton = within(alert).getByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissButton);

    expect(useTerminalStore.getState().legacyBannerDismissed).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

