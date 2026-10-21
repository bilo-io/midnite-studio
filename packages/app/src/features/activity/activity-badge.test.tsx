import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BUILTIN_AGENTS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useTerminalStore } from '../terminal/terminal-store';
import { useUiStore } from '../../store/ui-store';
import { ActivityBadgeStack } from './activity-badge';
import type { ActivityGlowBadge } from './use-activity-glow';

afterEach(cleanup);

const agentBadge: ActivityGlowBadge = { sessionId: 's1', kind: 'agent', agentId: 'claude', label: 'claude', status: 'agent' };
const shellBadge: ActivityGlowBadge = { sessionId: 's2', kind: 'shell', agentId: undefined, label: 'Terminal', status: 'shell' };

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

  it("renders the terminal list's own avatar, in the agent's brand colour, with its arc", () => {
    const codex = BUILTIN_AGENTS.find((agent) => agent.id === 'codex')!;
    const { container } = render(
      <ActivityBadgeStack badges={[{ ...agentBadge, agentId: 'codex', label: 'codex' }]} />,
    );
    const mark = container.querySelector('[data-agent-avatar="codex"] svg') as SVGElement;
    // jsdom normalises a hex colour to rgb(), so compare through the same parser.
    const expected = document.createElement('span');
    expected.style.color = codex.accent;
    expect(mark.style.color).toBe(expected.style.color);
    const ring = container.querySelector('[data-testid="session-icon-glow"]') as HTMLElement;
    expect(ring.getAttribute('data-activity-status')).toBe('agent');
    expect(ring.classList.contains('terminal-agent-glow')).toBe(true);
    expect(ring.style.getPropertyValue('--agent-accent')).toBe(codex.accent);
  });

  it("each badge's ring shows its own session's status", () => {
    const { container } = render(<ActivityBadgeStack badges={[{ ...agentBadge, status: 'waiting' }]} />);
    expect(container.querySelector('[data-testid="session-icon-glow"]')?.getAttribute('data-activity-status')).toBe(
      'waiting',
    );
  });

  it('a shell badge wears the terminal glyph and the shell ring, never the agent arc', () => {
    const { container } = render(<ActivityBadgeStack badges={[shellBadge]} />);
    expect(container.querySelector('[data-agent-avatar="shell"]')).not.toBeNull();
    const ring = container.querySelector('[data-testid="session-icon-glow"]') as HTMLElement;
    expect(ring.getAttribute('data-activity-status')).toBe('shell');
    expect(ring.classList.contains('terminal-agent-glow')).toBe(false);
  });

  it('names the agent/shell as the badge label', () => {
    render(<ActivityBadgeStack badges={[agentBadge]} />);
    expect(screen.getByLabelText('claude')).toBeDefined();
  });

  it('stacks past three, collapsing the rest into a +N chip', () => {
    const badges: ActivityGlowBadge[] = [
      { sessionId: 's1', kind: 'agent', agentId: 'claude', label: 'claude', status: 'agent' },
      { sessionId: 's2', kind: 'agent', agentId: 'codex', label: 'codex', status: 'agent' },
      { sessionId: 's3', kind: 'shell', agentId: undefined, label: 'Terminal', status: 'shell' },
      { sessionId: 's4', kind: 'shell', agentId: undefined, label: 'Terminal', status: 'shell' },
      { sessionId: 's5', kind: 'shell', agentId: undefined, label: 'Terminal', status: 'shell' },
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
      <div onClick={onParentClick}>
        <ActivityBadgeStack badges={[{ sessionId: session.id, kind: 'agent', agentId: 'claude', label: 'claude', status: 'agent' }]} />
      </div>,
    );

    fireEvent.click(screen.getByTestId('activity-badge'));

    expect(useUiStore.getState().terminalOpen).toBe(true);
    expect(useTerminalStore.getState().activeId).toBe(session.id);
  });
});
