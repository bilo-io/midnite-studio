import type { TerminalSession } from '@midnite/studio-shared';
import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoopStatus } from '../features/loops/loop-status';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { useUiStore } from '../store/ui-store';
import { TitleBarAgents } from './title-bar-agents';

const IDLE: LoopStatus = {
  sessionId: undefined,
  phase: undefined,
  activity: undefined,
  running: false,
  waiting: false,
  thinking: false,
};

vi.mock('../features/loops/loop-status', () => ({
  useAllLoopStatuses: () => DEFAULT_LOOPS.map(() => IDLE),
}));

const session = (overrides: Partial<TerminalSession> & { id: string }): TerminalSession => ({
  kind: 'agent',
  agentId: 'claude',
  title: 'repo',
  cwd: '/repo',
  repoId: 'repo-1',
  createdAt: 0,
  ...overrides,
});

beforeEach(() => {
  useUiStore.setState({ fabPanelOpen: false, activeFabTab: 'innovate' });
  useTerminalStore.setState({ sessions: [], states: {}, liveAgentId: {} });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TitleBarAgents', () => {
  /**
   * The count leads, the launchers follow, and the hairline closes the cluster
   * — the order `chrome` in `app.tsx` depends on, since everything after this
   * (the date pill, the lifecycle actions, the theme toggle) assumes the rule
   * separating it from the agent readouts has already been drawn.
   */
  it('renders the count, then the launchers, then its own separator', () => {
    useTerminalStore.setState({ sessions: [session({ id: 'a' })], states: { a: 'open' } });
    render(<TitleBarAgents />);

    const cluster = screen.getByTestId('titlebar-agents');
    const order = Array.from(cluster.children).map((child) =>
      child.getAttribute('data-testid'),
    );
    expect(order).toEqual(['titlebar-agent-count', 'fab-launchers']);
    expect(cluster.nextElementSibling?.getAttribute('data-testid')).toBe('titlebar-agents-sep');
  });

  /**
   * The reason the hairline is this component's job rather than `chrome`'s: at
   * zero agents `LiveAgentCount` returns `null`, so a rule keyed on "the count
   * rendered" would vanish while the launcher strip beside it stayed. The
   * cluster itself never empties — `FabLaunchers` has a collapsed form — so the
   * rule is safe to tie to the cluster.
   */
  it('keeps the separator with no agents running, because the strip remains', () => {
    render(<TitleBarAgents />);

    expect(screen.queryByTestId('titlebar-agent-count')).toBeNull();
    expect(screen.getByTestId('fab-launchers').dataset.expanded).toBe('false');
    expect(screen.getByTestId('titlebar-agents-sep')).toBeDefined();
  });

  it('reads the live agent count out of the terminal store', () => {
    useTerminalStore.setState({
      sessions: [session({ id: 'a' }), session({ id: 'b', agentId: 'codex' })],
      states: { a: 'open', b: 'starting' },
    });
    render(<TitleBarAgents />);

    expect(screen.getByTestId('titlebar-agent-count').textContent).toContain('2 agents');
  });
});
