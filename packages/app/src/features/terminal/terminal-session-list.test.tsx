import { BUILTIN_AGENTS, type TerminalSession } from '@midnite/studio-shared';
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
    reattachedCount: 0,
    reattachedSessionIds: [],
    reattachedDismissed: false,
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

    expect(screen.getByLabelText('Running under a previous build')).not.toBeNull();
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
    expect(screen.queryByLabelText('Running under a previous build')).toBeNull();
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

    // Docked at the bottom: the notices stack is the last child, holding the alert
    const notices = screen.getByTestId('terminal-notices');
    expect(listContainer.lastElementChild).toBe(notices);
    expect(notices.contains(alert)).toBe(true);

    // And the previous sibling is the scrollable session rows wrapper
    const scrollWrapper = listContainer.firstElementChild as HTMLElement;
    expect(scrollWrapper).not.toBeNull();
    expect(scrollWrapper.className).toContain('flex-1');
    expect(scrollWrapper.className).toContain('overflow-y-auto');
  });

  it('renders Dismiss first, then the two actions that end processes', () => {
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
    expect(buttons.map((b) => b.textContent)).toEqual(['Dismiss', 'End all…', 'Restart…']);
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

describe('TerminalSessionList — the row icon wears the activity glow (Phase 95 Theme C)', () => {
  const claude = BUILTIN_AGENTS.find((a) => a.id === 'claude')!;

  const agentSession = (id: string): TerminalSession => ({
    id,
    kind: 'agent',
    agentId: 'claude',
    title: 'agent',
    cwd: '/repo',
    repoId: 'repo:1',
    createdAt: 0,
  });

  const shellSession = (id: string): TerminalSession => ({
    id,
    kind: 'shell',
    title: 'shell',
    cwd: '/repo',
    repoId: 'repo:1',
    createdAt: 0,
  });

  it('no glow on an idle (not live) row', () => {
    useTerminalStore.setState({ sessions: [agentSession('s1')], states: { s1: 'exited' } });

    const { container } = render(
      <DialogHost>
        <TerminalSessionList agents={[claude]} width={220} />
      </DialogHost>,
    );

    expect(container.querySelector('[data-testid="session-icon-glow"]')).toBeNull();
  });

  it('a live agent row wears the agent ring', () => {
    useTerminalStore.setState({ sessions: [agentSession('s1')], states: { s1: 'open' } });

    const { container } = render(
      <DialogHost>
        <TerminalSessionList agents={[claude]} width={220} />
      </DialogHost>,
    );

    const glow = container.querySelector('[data-testid="session-icon-glow"]');
    expect(glow).not.toBeNull();
    expect(glow?.getAttribute('data-activity-status')).toBe('agent');
    expect(glow?.getAttribute('data-agent-icon')).toBe('true');
    expect(glow?.classList.contains('terminal-agent-glow')).toBe(true);
    expect((glow as HTMLElement)?.style.getPropertyValue('--agent-accent')).toBe(claude.accent);
  });

  it('the row mark is the shared AgentAvatar, in the agent’s brand colour', () => {
    useTerminalStore.setState({ sessions: [agentSession('s1')], states: { s1: 'open' } });

    const { container } = render(
      <DialogHost>
        <TerminalSessionList agents={[claude]} width={220} />
      </DialogHost>,
    );

    const mark = container.querySelector(`[data-agent-avatar="${claude.id}"] svg`) as SVGElement;
    const expected = document.createElement('span');
    expected.style.color = claude.accent;
    expect(mark.style.color).toBe(expected.style.color);
    expect(mark.getAttribute('class')).toContain('size-3.5');
  });

  it('a live plain shell row wears the metallic shell ring', () => {
    useTerminalStore.setState({ sessions: [shellSession('s1')], states: { s1: 'open' } });

    const { container } = render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} />
      </DialogHost>,
    );

    const glow = container.querySelector('[data-testid="session-icon-glow"]');
    expect(glow).not.toBeNull();
    expect(glow?.getAttribute('data-activity-status')).toBe('shell');
    expect(glow?.getAttribute('data-agent-icon')).toBeNull();
    expect(glow?.classList.contains('terminal-agent-glow')).toBe(false);
  });

  it('a waiting agent row wears the waiting ring', () => {
    useTerminalStore.setState({
      sessions: [agentSession('s1')],
      states: { s1: 'open' },
      activity: { s1: 'waiting' },
    });

    const { container } = render(
      <DialogHost>
        <TerminalSessionList agents={[claude]} width={220} />
      </DialogHost>,
    );

    expect(container.querySelector('[data-testid="session-icon-glow"]')?.getAttribute('data-activity-status')).toBe(
      'waiting',
    );
  });
});


describe('TerminalSessionList — notices stack', () => {
  const session = (id: string): TerminalSession => ({
    id,
    kind: 'shell',
    title: 'repo',
    cwd: '/repo',
    repoId: 'repo:1',
    createdAt: 0,
  });

  const seedBoth = () =>
    useTerminalStore.setState({
      sessions: [session('s-legacy'), session('s-2')],
      states: { 's-legacy': 'open', 's-2': 'open' },
      legacy: { 's-legacy': true },
      legacyBannerDismissed: false,
      reattachedCount: 2,
      reattachedSessionIds: ['s-legacy', 's-2'],
      reattachedDismissed: false,
    });

  it('renders no notices node when neither notice applies', () => {
    useTerminalStore.setState({ sessions: [session('s-2')], states: { 's-2': 'open' } });
    render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} />
      </DialogHost>,
    );
    expect(screen.queryByTestId('terminal-notices')).toBeNull();
  });

  it('stacks the reattached note directly under the legacy notice', () => {
    seedBoth();
    render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} />
      </DialogHost>,
    );
    const notices = screen.getByTestId('terminal-notices');
    const alert = screen.getByRole('alert');
    const note = screen.getByTestId('reattached-note');
    expect(notices.contains(alert)).toBe(true);
    expect(notices.contains(note)).toBe(true);
    expect(alert.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.nextElementSibling).toBe(note);
  });

  it('gives both notices the same shell and structure', () => {
    seedBoth();
    render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} />
      </DialogHost>,
    );
    const alert = screen.getByRole('alert');
    const note = screen.getByTestId('reattached-note');
    expect(alert.hasAttribute('data-panel-notice')).toBe(true);
    expect(note.hasAttribute('data-panel-notice')).toBe(true);
    const shell = (el: HTMLElement) =>
      el.className
        .split(/\s+/)
        .filter((c) => !/^(border-amber|bg-amber|text-amber|border-border|bg-muted|text-muted|animate-)/.test(c))
        .sort();
    expect(shell(note)).toEqual(shell(alert));
    for (const el of [alert, note]) {
      expect(el.querySelectorAll('p.font-medium')).toHaveLength(1);
      // Dismiss always leads; the legacy notice adds its two process-ending actions after it.
      expect(el.querySelector('button')?.textContent).toBe('Dismiss');
    }
  });

  it('renders no notices when showNotices is false', () => {
    seedBoth();
    render(
      <DialogHost>
        <TerminalSessionList agents={[]} width={220} showNotices={false} />
      </DialogHost>,
    );
    expect(screen.queryByTestId('terminal-notices')).toBeNull();
    expect(screen.queryByTestId('reattached-note')).toBeNull();
  });
});

describe('TerminalSessionList — ending previous-build sessions', () => {
  const session = (id: string, over: Partial<TerminalSession> = {}): TerminalSession => ({
    id,
    kind: 'shell',
    title: 'repo',
    cwd: '/repo',
    repoId: 'repo:1',
    createdAt: 0,
    ...over,
  });

  const seed = () =>
    useTerminalStore.setState({
      sessions: [session('old-1', { name: 'claude run' }), session('old-2', { cwd: '/other' }), session('new')],
      states: { 'old-1': 'open', 'old-2': 'open', new: 'open' },
      ptyIds: { 'old-1': 'p1', 'old-2': 'p2', new: 'p3' },
      legacy: { 'old-1': true, 'old-2': true },
      foregroundCommand: { 'old-1': 'claude' },
      legacyBannerDismissed: false,
    });

  const renderList = () =>
    render(
      <DialogHost>
        <div data-terminal-panel className="relative">
          <TerminalSessionList agents={[]} width={220} />
        </div>
      </DialogHost>,
    );

  it('End all lists every previous-build session and its command before ending anything', () => {
    seed();
    renderList();

    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'End all…' }));
    const dialog = screen.getByRole('dialog', { name: 'End 2 previous-build sessions?' });
    expect(dialog.textContent).toContain('claude run — claude (/repo)');
    expect(dialog.textContent).toContain('— shell (/other)');
    // Nothing has been ended yet.
    expect(useTerminalStore.getState().sessions).toHaveLength(3);

    fireEvent.click(within(dialog).getByRole('button', { name: 'End 2 sessions' }));
    expect(useTerminalStore.getState().sessions.map((s) => s.id)).toEqual(['new']);
    expect(useTerminalStore.getState().legacy).toEqual({});
  });

  it('cancelling the confirm ends nothing', () => {
    seed();
    renderList();
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'End all…' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(useTerminalStore.getState().sessions).toHaveLength(3);
  });

  it('offers End session on a previous-build row, and only there', () => {
    seed();
    const { container } = renderList();
    // Grouped by folder: /repo holds old-1 then new, /other holds old-2.
    const rows = container.querySelectorAll('[data-session-row]');

    fireEvent.contextMenu(rows[1] as Element);
    expect(screen.queryByText('End session…')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });

    fireEvent.contextMenu(rows[0] as Element);
    fireEvent.click(screen.getByText('End session…'));
    const dialog = screen.getByRole('dialog', { name: 'End this session?' });
    expect(dialog.textContent).toContain('claude run — claude (/repo)');
    fireEvent.click(within(dialog).getByRole('button', { name: 'End session' }));
    expect(useTerminalStore.getState().sessions.map((s) => s.id)).toEqual(['old-2', 'new']);
  });

  it('marks each previous-build row with the marker, and no other row', () => {
    seed();
    renderList();
    expect(screen.getAllByTestId('terminal-session-previous-build')).toHaveLength(2);
  });
});
