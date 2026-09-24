import type { TerminalSession } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RefAgentAvatar } from './ref-agent-avatar';

const revealSessionMock = vi.fn((_sessionId: string) => true);
vi.mock('../terminal/reveal-session', () => ({
  revealSession: (sessionId: string) => revealSessionMock(sessionId),
}));

const session: TerminalSession = {
  id: 'session-1',
  kind: 'agent',
  agentId: 'claude',
  title: 'midnite-studio',
  cwd: '/repo/.worktrees/agent-wt',
  repoId: 'r1',
  createdAt: Date.now(),
};

describe('RefAgentAvatar', () => {
  afterEach(() => {
    cleanup();
    revealSessionMock.mockClear();
  });

  it('renders the agent avatar circle, sized like the git contributor avatar', () => {
    const { getByTestId } = render(<RefAgentAvatar session={session} agentId="claude" />);

    const avatar = getByTestId('ref-agent-avatar');
    expect(avatar.style.width).toBe('14px');
    expect(avatar.style.height).toBe('14px');
    expect(avatar.className).toContain('rounded-full');
  });

  it('reveals a "Reveal session" button on hover, hidden until then', () => {
    const { getByTestId, container, queryByTestId } = render(
      <RefAgentAvatar session={session} agentId="claude" />,
    );

    expect(queryByTestId('ref-agent-reveal-session')).toBeNull();

    fireEvent.mouseEnter(container.firstElementChild as HTMLElement);

    const button = getByTestId('ref-agent-reveal-session');
    expect(button.textContent).toContain('Reveal session');
  });

  it('calls revealSession with this session\'s id when the button is clicked', () => {
    const { getByTestId, container } = render(
      <RefAgentAvatar session={session} agentId="claude" />,
    );

    fireEvent.mouseEnter(container.firstElementChild as HTMLElement);
    fireEvent.click(getByTestId('ref-agent-reveal-session'));

    expect(revealSessionMock).toHaveBeenCalledWith('session-1');
  });

  it('hides the button again once the pointer leaves the hover group', () => {
    const { container, queryByTestId } = render(
      <RefAgentAvatar session={session} agentId="claude" />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.mouseEnter(wrapper);
    expect(queryByTestId('ref-agent-reveal-session')).not.toBeNull();

    vi.useFakeTimers();
    fireEvent.mouseLeave(wrapper);
    act(() => {
      // Past the shared hover-group grace period (`useHoverGroup`'s
      // `HOVER_GRACE_MS` in `ref-badge.tsx`) that lets the pointer cross the
      // gap to the portalled button without it closing under it.
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();
    expect(queryByTestId('ref-agent-reveal-session')).toBeNull();
  });
});
