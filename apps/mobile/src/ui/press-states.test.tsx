// vitest/jsdom: the composed accessibility sentence for each row type, and the focus ring (Phase 146 L5).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@bilo-io/ui-native';
import type { Commit, ForgeProjectItem, ForgePull } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';
import { CommitRow, commitLabel } from '../history/commit-row';
import { PullRow, pullLabel } from '../reviews/pull-row';
import { TaskCard, cardLabel } from '../tasks/task-card';

afterEach(cleanup);

const now = new Date('2026-11-20T12:00:00Z');
const commit = (parents: string[]): Commit =>
  ({
    sha: '2d4626d1111111111111111111111111111111aa',
    parents,
    subject: 'feat(app): switch selected repo',
    authorName: 'bilo-io',
    authorDate: Math.floor(new Date('2026-11-20T10:00:00Z').getTime() / 1000),
  }) as unknown as Commit;
const pull = (over: Partial<ForgePull> = {}): ForgePull => ({
  id: 'P1', number: 12, title: 'Fix it', state: 'open', isDraft: false, reviewDecision: 'APPROVED', checks: 'passing',
  headBranch: 'x', author: 'ada', url: '', mergedAt: null, closedAt: null, commentCount: 3, ...over,
});
const task = {
  id: 'i1',
  fieldValues: [],
  content: { number: 7, title: 'Fix the thing', labels: ['ui'], assignees: ['octo'], url: '', state: 'open', kind: 'issue' },
} as unknown as ForgeProjectItem;

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('composed labels', () => {
  it('a commit reads as one sentence, marking merges', () => {
    expect(commitLabel(commit(['p1']), now)).toBe('Commit 2d4626d, feat(app): switch selected repo, by bilo-io, 2 hours ago');
    expect(commitLabel(commit(['p1', 'p2']), now)).toBe('Commit 2d4626d, feat(app): switch selected repo, by bilo-io, 2 hours ago, merge commit');
  });
  it('a pull request carries author, state, decision, checks and comments', () => {
    expect(pullLabel(pull(), now)).toBe('Pull request 12, Fix it, by ada, Open, Approved, checks passing, 3 comments');
    expect(pullLabel(pull({ reviewDecision: null, checks: null, commentCount: 1, state: 'merged', mergedAt: '2026-11-18T12:00:00Z' }), now)).toBe(
      'Pull request 12, Fix it, by ada, Merged, 1 comment, merged 2 days ago',
    );
  });
  it('a task card names its ref, labels and assignees', () => {
    expect(cardLabel(task)).toMatch(/^#7, Fix the thing\. Labels ui\. Assigned to octo\.$/);
  });
});

describe('rows apply the label and a focus ring', () => {
  it('CommitRow, PullRow and TaskCard expose the composed label and ring on focus', () => {
    const noop = () => undefined;
    wrap(
      <>
        <CommitRow commit={commit(['p1'])} isHead={false} isLast now={now} onPress={noop} />
        <PullRow pull={pull()} now={now} onPress={noop} />
        <TaskCard item={task} stroke={null} onPress={noop} />
      </>,
    );
    const rows = [
      screen.getByLabelText(commitLabel(commit(['p1']), now)),
      screen.getByLabelText(pullLabel(pull(), now)),
      screen.getByLabelText(cardLabel(task)),
    ];
    expect(screen.queryAllByTestId('focus-ring')).toHaveLength(0);
    for (const row of rows) {
      fireEvent.focus(row);
      expect(screen.getAllByTestId('focus-ring')).toHaveLength(1);
      fireEvent.blur(row);
      expect(screen.queryAllByTestId('focus-ring')).toHaveLength(0);
    }
  });
});
