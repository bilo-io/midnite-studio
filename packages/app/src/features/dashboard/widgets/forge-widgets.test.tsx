import type { Forge, ForgeKind, ForgePull } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PullsWidget } from './forge-widgets';

const pull: ForgePull = {
  id: 'PR_1',
  number: 7,
  title: 'Add forge marks',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  headBranch: 'feature/forge',
  author: 'octocat',
  url: 'https://example.test/pr/7',
  mergedAt: null,
  closedAt: null,
};

const ready = { cli: { reason: 'ready', hint: '' }, pulls: [pull], error: null };

function forge(kind: ForgeKind, host: string): Forge {
  return { kind, host, owner: 'acme', repo: 'widgets' };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PullsWidget forge mark', () => {
  it.each([
    ['github', 'github.com', 'GitHub'],
    ['gitlab', 'gitlab.com', 'GitLab'],
    ['bitbucket', 'bitbucket.org', 'Bitbucket'],
    ['azure', 'dev.azure.com', 'Azure DevOps'],
  ] as const)('labels a %s row with the forge name', (kind, host, label) => {
    render(<PullsWidget result={ready} isFetching={false} repoId="r1" forge={forge(kind, host)} />);
    const mark = screen.getByRole('img', { name: label });
    expect(mark.getAttribute('data-forge')).toBe(kind);
    expect(mark.querySelector('svg')).not.toBeNull();
  });

  it('appends the host for a non-default instance', () => {
    render(
      <PullsWidget
        result={ready}
        isFetching={false}
        repoId="r1"
        forge={forge('gitlab', 'gitlab.corp.example')}
      />,
    );
    expect(screen.getByRole('img', { name: 'GitLab · gitlab.corp.example' })).toBeTruthy();
  });

  it('shows the forge name in a tooltip on hover', () => {
    vi.useFakeTimers();
    render(
      <PullsWidget
        result={ready}
        isFetching={false}
        repoId="r1"
        forge={forge('github', 'github.com')}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('img', { name: 'GitHub' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('tooltip').textContent).toBe('GitHub');
  });

  it('renders no mark without a known forge', () => {
    const { container, rerender } = render(
      <PullsWidget result={ready} isFetching={false} repoId="r1" />,
    );
    expect(container.querySelector('[data-forge]')).toBeNull();
    rerender(
      <PullsWidget result={ready} isFetching={false} repoId="r1" forge={forge('unknown', 'nas')} />,
    );
    expect(container.querySelector('[data-forge]')).toBeNull();
  });
});
