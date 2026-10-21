import type { ForgeIssue } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { isRepoIssuesSource, REPO_ISSUES_FIELDS, repoIssuesAsItems, REPO_ISSUES_SOURCE_ID } from './repo-issues-source';

const mk = (number: number, state: 'open' | 'closed', updatedAt: string): ForgeIssue => ({
  id: '',
  number,
  title: `t${number}`,
  state,
  author: 'a',
  labels: [{ name: 'bug', color: 'f00' }],
  assignees: ['a'],
  updatedAt,
  createdAt: null,
  url: `https://github.com/o/r/issues/${number}`,
  milestone: null,
});

describe('Repo issues source', () => {
  it('is recognised by its sentinel id', () => {
    expect(isRepoIssuesSource(REPO_ISSUES_SOURCE_ID)).toBe(true);
    expect(isRepoIssuesSource('PVT_123')).toBe(false);
    expect(isRepoIssuesSource(null)).toBe(false);
  });

  it('maps issues to items grouped by an Open/Closed status field, newest first', () => {
    const items = repoIssuesAsItems([mk(1, 'closed', '2026-01-01T00:00:00Z'), mk(2, 'open', '2026-02-01T00:00:00Z')], 'o/r');
    expect(items.map((i) => (i.content.type === 'issue' ? i.content.number : 0))).toEqual([2, 1]);
    const fieldId = REPO_ISSUES_FIELDS[0]!.id;
    expect(items.map((i) => (i.fieldValues[fieldId] as { optionId: string }).optionId)).toEqual(['open', 'closed']);
    expect((REPO_ISSUES_FIELDS[0] as { options: { name: string }[] }).options.map((o) => o.name)).toEqual(['Open', 'Closed']);
    expect(items[0]!.content).toMatchObject({ labels: ['bug'], repo: 'o/r' });
  });
});
