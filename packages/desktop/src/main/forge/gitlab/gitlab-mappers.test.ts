import { describe, expect, it } from 'vitest';

import {
  mapApprovalDecision,
  mapChecksRollup,
  mapIssueState,
  mapMergeRequestState,
  mapPipelineStatus,
} from './gitlab-mappers';

describe('mapPipelineStatus', () => {
  const table: Array<[string, { status: string; conclusion: string | null }]> = [
    ['created', { status: 'queued', conclusion: null }],
    ['waiting_for_resource', { status: 'waiting', conclusion: null }],
    ['preparing', { status: 'queued', conclusion: null }],
    ['pending', { status: 'pending', conclusion: null }],
    ['running', { status: 'in_progress', conclusion: null }],
    ['success', { status: 'completed', conclusion: 'success' }],
    ['failed', { status: 'completed', conclusion: 'failure' }],
    ['canceled', { status: 'completed', conclusion: 'cancelled' }],
    ['skipped', { status: 'completed', conclusion: 'skipped' }],
    ['manual', { status: 'waiting', conclusion: null }],
    ['scheduled', { status: 'pending', conclusion: null }],
  ];

  it.each(table)('maps %s', (input, expected) => {
    expect(mapPipelineStatus(input)).toEqual(expected);
  });

  it('treats an unrecognised status as still queued rather than throwing', () => {
    expect(mapPipelineStatus('some-future-status')).toEqual({ status: 'queued', conclusion: null });
  });
});

describe('mapMergeRequestState', () => {
  it('maps opened to open', () => expect(mapMergeRequestState('opened')).toBe('open'));
  it('maps merged to merged', () => expect(mapMergeRequestState('merged')).toBe('merged'));
  it('maps closed to closed', () => expect(mapMergeRequestState('closed')).toBe('closed'));
  it('maps locked to open — still open, only frozen for edits', () =>
    expect(mapMergeRequestState('locked')).toBe('open'));
});

describe('mapIssueState', () => {
  it('maps opened to open', () => expect(mapIssueState('opened')).toBe('open'));
  it('maps closed to closed', () => expect(mapIssueState('closed')).toBe('closed'));
});

describe('mapApprovalDecision', () => {
  it('reports APPROVED when approved', () => {
    expect(mapApprovalDecision(true, 1)).toBe('APPROVED');
  });

  it('reports REVIEW_REQUIRED when not approved but required', () => {
    expect(mapApprovalDecision(false, 2)).toBe('REVIEW_REQUIRED');
  });

  it('reports null when nothing is required and nobody approved', () => {
    expect(mapApprovalDecision(false, 0)).toBeNull();
  });

  it('never reports CHANGES_REQUESTED — GitLab has no such state', () => {
    for (const approved of [true, false]) {
      for (const required of [0, 1, 5]) {
        expect(mapApprovalDecision(approved, required)).not.toBe('CHANGES_REQUESTED');
      }
    }
  });
});

describe('mapChecksRollup', () => {
  it('reports null for no pipeline', () => {
    expect(mapChecksRollup(null)).toBeNull();
    expect(mapChecksRollup(undefined)).toBeNull();
  });

  it('reports passing for a successful pipeline', () => {
    expect(mapChecksRollup('success')).toBe('passing');
  });

  it('reports failing for a failed pipeline', () => {
    expect(mapChecksRollup('failed')).toBe('failing');
  });

  it('reports pending for a running pipeline', () => {
    expect(mapChecksRollup('running')).toBe('pending');
  });

  it('reports passing for a skipped pipeline', () => {
    expect(mapChecksRollup('skipped')).toBe('passing');
  });
});
