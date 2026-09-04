import type { TerminalSession } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { ActivityIndicator, TerminalSessionList } from './terminal-session-list';
import { useTerminalStore } from './terminal-store';

afterEach(() => {
  cleanup();
  useTerminalStore.setState({ sessions: [], states: {}, legacy: {} });
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
