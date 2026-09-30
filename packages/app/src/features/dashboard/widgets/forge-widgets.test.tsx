import type { Forge, ForgeIssue, ForgeKind, ForgePull, ForgeRun } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IssuesWidget, PullsWidget, RunListRow } from './forge-widgets';

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

describe('forge mark colour', () => {
  it('carries the provider brand colour, not muted grey', () => {
    render(<PullsWidget result={ready} isFetching={false} repoId="r1" forge={forge('gitlab', 'gitlab.com')} />);
    const mark = screen.getByRole('img', { name: 'GitLab' });
    expect(mark.style.getPropertyValue('--brand-light')).toBe('#FC6D26');
    expect(mark.style.color).toBe('var(--forge-brand)');
  });
});

describe('IssuesWidget state icon', () => {
  const issue = (number: number, state: 'open' | 'closed'): ForgeIssue =>
    ({
      number,
      title: `Issue ${number}`,
      state,
      labels: [],
      author: null,
      url: `https://example.test/i/${number}`,
    }) as unknown as ForgeIssue;

  it('marks open and closed issues differently', () => {
    render(
      <IssuesWidget
        result={{
          cli: { reason: 'ready', hint: '' },
          issues: [issue(1, 'open'), issue(2, 'closed')],
          disabled: false,
          error: null,
        }}
        isFetching={false}
        repoId="r1"
      />,
    );
    expect(screen.getByRole('img', { name: 'Open issue' }).dataset.issueState).toBe('open');
    expect(screen.getByRole('img', { name: 'Closed issue' }).dataset.issueState).toBe('closed');
  });
});

describe('RunListRow', () => {
  const run = (status: string, conclusion: string | null): ForgeRun =>
    ({
      id: '1',
      name: 'CI',
      status,
      conclusion,
      headBranch: 'main',
      createdAt: '2026-09-30T10:00:00Z',
      url: 'https://example.test/r/1',
    }) as unknown as ForgeRun;

  it.each([
    ['completed', 'success', 'actions-glow-ok'],
    ['completed', 'failure', 'actions-glow-fail'],
  ] as const)('reuses the Actions view styling for %s/%s', (status, conclusion, glow) => {
    render(
      <ul>
        <RunListRow run={run(status, conclusion)} onOpen={() => {}} />
      </ul>,
    );
    expect(screen.getByText('main').className).toContain(glow);
  });

  it('a running row wears the Actions running animation', () => {
    render(
      <ul>
        <RunListRow run={run('in_progress', null)} onOpen={() => {}} />
      </ul>,
    );
    expect(screen.getByRole('button', { name: 'Open run' }).className).toContain('actions-item-running');
  });
});
