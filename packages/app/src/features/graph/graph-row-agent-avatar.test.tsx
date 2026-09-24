import type { GraphRow, Ref, TerminalSession } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommitGraphRow } from './graph-row';
import { graphThemeFor } from './graph-themes';
import type { ActiveAgentWorktreeSession } from './use-agent-worktrees';

const revealSessionMock = vi.fn((_sessionId: string) => true);
vi.mock('../terminal/reveal-session', () => ({
  revealSession: (sessionId: string) => revealSessionMock(sessionId),
}));

const theme = graphThemeFor('default', 'comfortable');

const commit = (sha: string, subject: string) => ({
  sha,
  subject,
  authorEmail: 'author@example.com',
  authorName: 'Author',
  authorDate: 1700000000,
  committerDate: 1700000000,
  parents: [],
  refs: [],
  coAuthors: [],
  sessionTrailers: [],
});

const row: GraphRow = {
  row: 0,
  commit: commit('abc1234', 'feat: initial commit'),
  lane: 0,
  colorIdx: 1,
  edges: [],
  laneCount: 1,
};

const makeRef = (name: string, worktreePath: string | null = null): Ref => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'abc1234',
  isHead: false,
  worktreePath,
  upstream: null,
});

const session: TerminalSession = {
  id: 'session-1',
  kind: 'agent',
  agentId: 'claude',
  title: 'midnite-studio',
  cwd: '/wt/agent',
  repoId: 'r1',
  createdAt: Date.now(),
};

/**
 * `agentSessionFor` renders `RefAgentAvatar` only for the ref it returns a
 * session for — the plain worktree-path boolean below (`isAgentActive`) is a
 * separate lookup, exactly as `graph-view.tsx` wires the two.
 */
const agentSessionFor = (ref: Ref): ActiveAgentWorktreeSession | undefined =>
  ref.worktreePath === '/wt/agent' ? { session, agentId: 'claude' } : undefined;

describe('CommitGraphRow agent avatar', () => {
  afterEach(() => {
    cleanup();
    revealSessionMock.mockClear();
  });

  it('renders the agent avatar only beside the ref an agent session is bound to', () => {
    const refs = [makeRef('feature/agent', '/wt/agent'), makeRef('feature/idle', '/wt/idle')];

    render(
      <CommitGraphRow
        row={row}
        refs={refs}
        selected={false}
        gutterWidth={80}
        laneWidth={16}
        theme={theme}
        clipId="clip"
        dimmed={false}
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
        onRefContextMenu={vi.fn()}
        onRefActivate={vi.fn()}
        syncFor={() => []}
        onSync={vi.fn()}
        syncing={{}}
        currentBranch={null}
        isAgentActive={(ref) => agentSessionFor(ref) !== undefined}
        agentSessionFor={agentSessionFor}
      />,
    );

    const avatars = screen.getAllByTestId('ref-agent-avatar');
    expect(avatars).toHaveLength(1);
  });

  it('opens the bound session from the avatar\'s hover-revealed "Reveal session" button', () => {
    const refs = [makeRef('feature/agent', '/wt/agent')];

    render(
      <CommitGraphRow
        row={row}
        refs={refs}
        selected={false}
        gutterWidth={80}
        laneWidth={16}
        theme={theme}
        clipId="clip"
        dimmed={false}
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
        onRefContextMenu={vi.fn()}
        onRefActivate={vi.fn()}
        syncFor={() => []}
        onSync={vi.fn()}
        syncing={{}}
        currentBranch={null}
        isAgentActive={(ref) => agentSessionFor(ref) !== undefined}
        agentSessionFor={agentSessionFor}
      />,
    );

    const avatar = screen.getByTestId('ref-agent-avatar');
    fireEvent.mouseEnter(avatar.parentElement as HTMLElement);

    const button = screen.getByTestId('ref-agent-reveal-session');
    expect(button.textContent).toContain('Reveal session');
    fireEvent.click(button);

    expect(revealSessionMock).toHaveBeenCalledWith('session-1');
  });

  it('renders no avatar and no agent glow class when no session is bound to the ref', () => {
    const refs = [makeRef('feature/idle', '/wt/idle')];

    const { container } = render(
      <CommitGraphRow
        row={row}
        refs={refs}
        selected={false}
        gutterWidth={80}
        laneWidth={16}
        theme={theme}
        clipId="clip"
        dimmed={false}
        onSelect={vi.fn()}
        onContextMenu={vi.fn()}
        onRefContextMenu={vi.fn()}
        onRefActivate={vi.fn()}
        syncFor={() => []}
        onSync={vi.fn()}
        syncing={{}}
        currentBranch={null}
      />,
    );

    expect(screen.queryByTestId('ref-agent-avatar')).toBeNull();
    const badge = container.querySelector('[data-ref="refs/heads/feature/idle"]') as HTMLElement;
    expect(badge.className).not.toContain('ref-badge-agent-glow');
  });
});
