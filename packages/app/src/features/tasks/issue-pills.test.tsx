import type { ForgeIssue, ForgeProjectItem } from '@midnite/studio-shared';
import { EMPTY_ISSUE_LINK_SET } from '@midnite/studio-shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { IssuePills, TaskIssueProvider } from './issue-pills';

const issue: ForgeIssue = {
  id: '',
  number: 7,
  title: 'Bug',
  state: 'open',
  author: 'bilo',
  labels: [
    { name: 'bug', color: 'ee0000' },
    { name: 'ui', color: '00ee00' },
    { name: 'p1', color: '0000ee' },
  ],
  assignees: [],
  updatedAt: '2026-01-01T00:00:00Z',
  createdAt: null,
  url: 'https://github.com/o/r/issues/7',
  milestone: { title: 'v1', dueOn: null } as never,
};

const item: ForgeProjectItem = {
  id: 'i',
  content: {
    type: 'issue',
    id: '',
    number: 7,
    repo: 'o/r',
    title: 'Bug',
    url: issue.url,
    state: 'open',
    assignees: [],
    body: '',
    labels: ['bug', 'ui', 'p1'],
    dependencies: EMPTY_ISSUE_LINK_SET,
    linkedPrs: [],
  },
  fieldValues: {},
};

function mount(density: 'row' | 'card' | 'node') {
  return render(
    <TaskIssueProvider
      value={{
        issuesByNumber: new Map([[7, issue]]),
        repoId: 'r1',
        repoName: 'o/r',
        showState: true,
        now: Date.parse('2026-01-03T00:00:00Z'),
      }}
    >
      <IssuePills item={item} density={density} />
    </TaskIssueProvider>,
  );
}

const kinds = (c: HTMLElement) => [...c.querySelectorAll('[data-issue-pill]')].map((e) => e.getAttribute('data-issue-pill'));

describe('IssuePills', () => {
  afterEach(cleanup);

  it('row: state, 2 labels, overflow, milestone and age', () => {
    const { container } = mount('row');
    expect(kinds(container)).toEqual(['state', 'label', 'label', 'more-labels', 'milestone', 'updated']);
  });

  it('card: state, 3 labels and milestone, no age', () => {
    const { container } = mount('card');
    expect(kinds(container)).toEqual(['state', 'label', 'label', 'label', 'milestone']);
  });

  it('node: state and 2 labels only', () => {
    const { container } = mount('node');
    expect(kinds(container)).toEqual(['state', 'label', 'label', 'more-labels']);
  });
});
