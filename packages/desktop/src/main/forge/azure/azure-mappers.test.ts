import { describe, expect, it } from 'vitest';

import {
  mapBuildStatus,
  mapChecksRollup,
  mapMergeable,
  mapPullState,
  mapReviewDecision,
  mapWorkItemStateCategory,
} from './azure-mappers';

describe('mapPullState', () => {
  it('maps active to open', () => expect(mapPullState('active')).toBe('open'));
  it('maps completed to merged', () => expect(mapPullState('completed')).toBe('merged'));
  it('maps abandoned to closed', () => expect(mapPullState('abandoned')).toBe('closed'));
  it('treats an unrecognised status as open', () => expect(mapPullState('notSet')).toBe('open'));
});

describe('mapMergeable', () => {
  it('maps succeeded to MERGEABLE', () => expect(mapMergeable('succeeded')).toBe('MERGEABLE'));
  it('maps conflicts and rejectedByPolicy to CONFLICTING', () => {
    expect(mapMergeable('conflicts')).toBe('CONFLICTING');
    expect(mapMergeable('rejectedByPolicy')).toBe('CONFLICTING');
    expect(mapMergeable('failure')).toBe('CONFLICTING');
  });
  it('maps queued and notSet to UNKNOWN — still computing, not a false', () => {
    expect(mapMergeable('queued')).toBe('UNKNOWN');
    expect(mapMergeable('notSet')).toBe('UNKNOWN');
  });
  it('is null when there is no mergeStatus at all', () => {
    expect(mapMergeable(null)).toBeNull();
  });
});

describe('mapBuildStatus', () => {
  const table: Array<[string, string | null, { status: string; conclusion: string | null }]> = [
    ['notStarted', null, { status: 'queued', conclusion: null }],
    ['postponed', null, { status: 'queued', conclusion: null }],
    ['inProgress', null, { status: 'in_progress', conclusion: null }],
    ['cancelling', null, { status: 'in_progress', conclusion: null }],
    ['completed', 'succeeded', { status: 'completed', conclusion: 'success' }],
    ['completed', 'failed', { status: 'completed', conclusion: 'failure' }],
    ['completed', 'canceled', { status: 'completed', conclusion: 'cancelled' }],
    ['completed', 'partiallySucceeded', { status: 'completed', conclusion: 'neutral' }],
    ['completed', 'none', { status: 'completed', conclusion: null }],
  ];

  it.each(table)('maps status=%s result=%s', (status, result, expected) => {
    expect(mapBuildStatus(status, result)).toEqual(expected);
  });

  it('treats an unrecognised status as still queued rather than throwing', () => {
    expect(mapBuildStatus('some-future-status', null)).toEqual({ status: 'queued', conclusion: null });
  });
});

describe('mapWorkItemStateCategory', () => {
  it('maps Proposed and InProgress to open', () => {
    expect(mapWorkItemStateCategory('Proposed')).toBe('open');
    expect(mapWorkItemStateCategory('InProgress')).toBe('open');
  });
  it('maps Completed and Removed to closed', () => {
    expect(mapWorkItemStateCategory('Completed')).toBe('closed');
    expect(mapWorkItemStateCategory('Removed')).toBe('closed');
  });
  it('maps Resolved to open — a team workflow step still follows it', () => {
    expect(mapWorkItemStateCategory('Resolved')).toBe('open');
  });
  it('treats an unknown or missing category as open', () => {
    expect(mapWorkItemStateCategory(null)).toBe('open');
    expect(mapWorkItemStateCategory('SomeFutureCategory')).toBe('open');
  });
});

describe('mapReviewDecision', () => {
  it('is null with no reviewers', () => {
    expect(mapReviewDecision([])).toBeNull();
  });

  it('reports APPROVED for a plain 10 vote', () => {
    expect(mapReviewDecision([{ vote: 10, isRequired: false }])).toBe('APPROVED');
  });

  it('reports APPROVED for 5 ("approved with suggestions") — the case a naive mapper misses', () => {
    expect(mapReviewDecision([{ vote: 5, isRequired: false }])).toBe('APPROVED');
  });

  it('reports CHANGES_REQUESTED for -10, the only true reject', () => {
    expect(mapReviewDecision([{ vote: -10, isRequired: false }])).toBe('CHANGES_REQUESTED');
  });

  it('does NOT report CHANGES_REQUESTED for -5 ("waiting for author") — the other case a naive mapper misses', () => {
    expect(mapReviewDecision([{ vote: -5, isRequired: false }])).not.toBe('CHANGES_REQUESTED');
  });

  it('reports REVIEW_REQUIRED when a required reviewer is at 0 or waiting', () => {
    expect(mapReviewDecision([{ vote: 0, isRequired: true }])).toBe('REVIEW_REQUIRED');
    expect(mapReviewDecision([{ vote: -5, isRequired: true }])).toBe('REVIEW_REQUIRED');
  });

  it('a reject wins over an approval from someone else', () => {
    expect(
      mapReviewDecision([
        { vote: 10, isRequired: false },
        { vote: -10, isRequired: false },
      ]),
    ).toBe('CHANGES_REQUESTED');
  });

  it('is null when nobody required has voted and nobody rejected', () => {
    expect(mapReviewDecision([{ vote: 0, isRequired: false }])).toBeNull();
  });
});

describe('mapChecksRollup', () => {
  it('is null with no build at all', () => {
    expect(mapChecksRollup(null, null)).toBeNull();
  });
  it('is pending while in progress', () => {
    expect(mapChecksRollup('inProgress', null)).toBe('pending');
  });
  it('is passing for a succeeded build', () => {
    expect(mapChecksRollup('completed', 'succeeded')).toBe('passing');
  });
  it('is passing for a partiallySucceeded build — neutral counts as passing, not failing', () => {
    expect(mapChecksRollup('completed', 'partiallySucceeded')).toBe('passing');
  });
  it('is failing for a failed build', () => {
    expect(mapChecksRollup('completed', 'failed')).toBe('failing');
  });
});
