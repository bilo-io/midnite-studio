import { describe, expect, it } from 'vitest';
import type { ForgeComment } from '@midnite/studio-shared';
import {
  resolveAssignedReviewers,
  resolveReviewerCandidates,
} from './reviewer-status';

describe('reviewer-status logic', () => {
  const comments: ForgeComment[] = [
    {
      id: 'c1',
      kind: 'review',
      author: 'alice',
      body: 'LGTM',
      createdAt: '2026-08-20T10:00:00Z',
      url: '',
      reviewState: 'COMMENTED',
    },
    {
      id: 'c2',
      kind: 'review',
      author: 'alice',
      body: 'Actually Approved',
      createdAt: '2026-08-20T11:00:00Z',
      url: '',
      reviewState: 'APPROVED',
    },
    {
      id: 'c3',
      kind: 'review',
      author: 'bob',
      body: 'Needs fixes',
      createdAt: '2026-08-20T12:00:00Z',
      url: '',
      reviewState: 'CHANGES_REQUESTED',
    },
    {
      id: 'c4',
      kind: 'comment',
      author: 'charlie',
      body: 'Nice PR, checking out',
      createdAt: '2026-08-20T13:00:00Z',
      url: '',
      reviewState: null,
    },
    {
      id: 'c5',
      kind: 'comment',
      author: 'author1',
      body: 'Thanks for looking',
      createdAt: '2026-08-20T14:00:00Z',
      url: '',
      reviewState: null,
    },
  ];

  it('resolveAssignedReviewers uses latest review status and handles waiting requests', () => {
    // alice approved, bob requested changes, dan is awaiting review
    const assigned = resolveAssignedReviewers(['dan'], comments, 'author1');

    expect(assigned).toEqual([
      { login: 'dan', state: 'waiting', stateLabel: 'Awaiting review' },
      { login: 'alice', state: 'approved', stateLabel: 'Approved' },
      { login: 'bob', state: 'changes_requested', stateLabel: 'Changes requested' },
    ]);
  });

  it('prioritizes waiting state if reviewer was re-requested after approval', () => {
    const assigned = resolveAssignedReviewers(['alice'], comments, 'author1');

    expect(assigned).toEqual([
      { login: 'alice', state: 'waiting', stateLabel: 'Awaiting review' },
      { login: 'bob', state: 'changes_requested', stateLabel: 'Changes requested' },
    ]);
  });

  it('excludes author from assigned and candidate reviewers', () => {
    const assigned = resolveAssignedReviewers(['author1'], comments, 'author1');
    expect(assigned.some((r) => r.login === 'author1')).toBe(false);

    const candidates = resolveReviewerCandidates(['author1'], comments, 'author1');
    expect(candidates.some((r) => r.login === 'author1')).toBe(false);
  });

  it('resolveReviewerCandidates includes comment authors and marks requested state', () => {
    const candidates = resolveReviewerCandidates(['dan'], comments, 'author1');

    expect(candidates).toEqual([
      { login: 'dan', state: 'waiting', stateLabel: 'Awaiting review', isRequested: true },
      { login: 'alice', state: 'approved', stateLabel: 'Approved', isRequested: false },
      { login: 'bob', state: 'changes_requested', stateLabel: 'Changes requested', isRequested: false },
      { login: 'charlie', state: 'commented', stateLabel: 'Commented', isRequested: false },
    ]);
  });
});
