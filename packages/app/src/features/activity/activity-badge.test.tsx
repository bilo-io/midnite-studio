import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useTerminalStore } from '../terminal/terminal-store';
import { useUiStore } from '../../store/ui-store';
import { ActivityBadgeStack } from './activity-badge';
import type { ActivityGlowBadge } from './use-activity-glow';

afterEach(cleanup);

const agentBadge: ActivityGlowBadge = { sessionId: 's1', kind: 'agent', agentId: 'claude', label: 'claude' };
const shellBadge: ActivityGlowBadge = { sessionId: 's2', kind: 'shell', agentId: undefined, label: 'Terminal' };

describe('ActivityBadgeStack', () => {
  beforeEach(() => {
    useTerminalStore.setState({ sessions: [], activeId: null, states: {}, activity: {} });
    useUiStore.setState({ terminalOpen: false, terminalListOpen: false });
  });

  it('renders nothing with no badges', () => {
    const { container } = render(<ActivityBadgeStack badges={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one button per badge, agent and shell alike', () => {
    render(<ActivityBadgeStack badges={[agentBadge, shellBadge]} />);
    const buttons = screen.getAllByTestId('activity-badge');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.getAttribute('data-badge-kind')).toBe('agent');
    expect(buttons[1]?.getAttribute('data-badge-kind')).toBe('shell');
  });

  it('names the agent/shell as the badge label', () => {
    render(<ActivityBadgeStack badges={[agentBadge]} />);
    expect(screen.getByLabelText('claude')).toBeDefined();
  });

  it('stacks past three, collapsing the rest into a +N chip', () => {
    const badges: ActivityGlowBadge[] = [
      { sessionId: 's1', kind: 'agent', agentId: 'claude', label: 'claude' },
      { sessionId: 's2', kind: 'agent', agentId: 'codex', label: 'codex' },
      { sessionId: 's3', kind: 'shell', agentId: undefined, label: 'Terminal' },
      { sessionId: 's4', kind: 'shell', agentId: undefined, label: 'Terminal' },
      { sessionId: 's5', kind: 'shell', agentId: undefined, label: 'Terminal' },
    ];
    render(<ActivityBadgeStack badges={badges} />);

    expect(screen.getAllByTestId('activity-badge')).toHaveLength(3);
    expect(screen.getByLabelText('2 more sessions')).toBeDefined();
  });

  it('exactly three badges: no overflow chip at all', () => {
    const badges: ActivityGlowBadge[] = [agentBadge, shellBadge, { ...shellBadge, sessionId: 's3' }];
    render(<ActivityBadgeStack badges={badges} />);

    expect(screen.getAllByTestId('activity-badge')).toHaveLength(3);
    expect(screen.queryByLabelText(/more session/)).toBeNull();
  });

  it('clicking a badge reveals its session, without bubbling to a parent click', () => {
    const session = useTerminalStore.getState().openSession({
      kind: 'agent',
      agentId: 'claude',
      title: 'card',
      cwd: '/repo',
      repoId: 'r1',
      surface: 'kanban',
    });
    useTerminalStore.getState().setState(session.id, 'open');

    const onParentClick = () => {
      throw new Error('badge click must not bubble');
    };

    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div onClick={onParentClick}>
        <ActivityBadgeStack badges={[{ sessionId: session.id, kind: 'agent', agentId: 'claude', label: 'claude' }]} />
      </div>,
    );

    fireEvent.click(screen.getByTestId('activity-badge'));

    expect(useUiStore.getState().terminalOpen).toBe(true);
    expect(useTerminalStore.getState().activeId).toBe(session.id);
  });
});
