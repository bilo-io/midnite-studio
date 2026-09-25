import { describe, expect, it } from 'vitest';

import type { ForgeComment } from '@midnite/studio-shared';

import { gateApprovalCommentBody, gateApprovalToken, parseGateDecisionFromComments } from './gate-comment';

function comment(over: Partial<ForgeComment>): ForgeComment {
  return {
    id: '1',
    kind: 'comment',
    author: 'bilo-io',
    body: '',
    createdAt: '2026-01-01T00:00:00Z',
    url: '',
    reviewState: null,
    ...over,
  };
}

describe('gateApprovalToken (Phase 97 Theme D)', () => {
  it('is deterministic for the same run/node pair — a re-post names the same token', () => {
    expect(gateApprovalToken('r1', 'n1')).toBe(gateApprovalToken('r1', 'n1'));
  });

  it('differs across runs and across nodes', () => {
    expect(gateApprovalToken('r1', 'n1')).not.toBe(gateApprovalToken('r2', 'n1'));
    expect(gateApprovalToken('r1', 'n1')).not.toBe(gateApprovalToken('r1', 'n2'));
  });
});

describe('gateApprovalCommentBody', () => {
  it('names both commands with the exact token', () => {
    const body = gateApprovalCommentBody({ title: 'Ship it?', instructions: 'Check the diff first.', token: 'abcd1234' });
    expect(body).toContain('/midnite approve abcd1234');
    expect(body).toContain('/midnite reject abcd1234');
    expect(body).toContain('Ship it?');
    expect(body).toContain('Check the diff first.');
  });

  it('falls back to a generic heading when the gate has no title', () => {
    const body = gateApprovalCommentBody({ title: '', instructions: '', token: 'abcd1234' });
    expect(body).toContain('A workflow gate is waiting for your approval.');
  });
});

describe('parseGateDecisionFromComments', () => {
  const token = 'abcd1234';

  it('decides from the owner’s own approve comment', () => {
    const result = parseGateDecisionFromComments(
      [comment({ author: 'bilo-io', body: `/midnite approve ${token}` })],
      token,
      'bilo-io',
    );
    expect(result.decided).toMatchObject({ decision: 'approved', author: 'bilo-io' });
    expect(result.ignoredAuthors).toEqual([]);
  });

  it('decides reject the same way, and strips the command from the note', () => {
    const result = parseGateDecisionFromComments(
      [comment({ author: 'bilo-io', body: `Looks risky. /midnite reject ${token}` })],
      token,
      'bilo-io',
    );
    expect(result.decided?.decision).toBe('rejected');
    expect(result.decided?.note).toBe('Looks risky.');
  });

  it("ignores — and reports — a comment from anyone but the account the gate posted with", () => {
    const result = parseGateDecisionFromComments(
      [comment({ author: 'someone-else', body: `/midnite approve ${token}` })],
      token,
      'bilo-io',
    );
    expect(result.decided).toBeNull();
    expect(result.ignoredAuthors).toEqual(['someone-else']);
  });

  it('ignores a comment naming a different token entirely', () => {
    const result = parseGateDecisionFromComments(
      [comment({ author: 'bilo-io', body: '/midnite approve deadbeef' })],
      token,
      'bilo-io',
    );
    expect(result.decided).toBeNull();
    expect(result.ignoredAuthors).toEqual([]);
  });

  it('takes the first owner decision chronologically, ignoring a wrong-author comment that came before it', () => {
    const result = parseGateDecisionFromComments(
      [
        comment({ id: '1', author: 'someone-else', body: `/midnite approve ${token}` }),
        comment({ id: '2', author: 'bilo-io', body: `/midnite reject ${token}` }),
      ],
      token,
      'bilo-io',
    );
    expect(result.decided?.decision).toBe('rejected');
    expect(result.ignoredAuthors).toEqual(['someone-else']);
  });

  it('is case-insensitive on the command word', () => {
    const result = parseGateDecisionFromComments(
      [comment({ author: 'bilo-io', body: `/midnite APPROVE ${token}` })],
      token,
      'bilo-io',
    );
    expect(result.decided?.decision).toBe('approved');
  });

  it('answers null with no matching comment at all', () => {
    const result = parseGateDecisionFromComments(
      [comment({ author: 'bilo-io', body: 'just chatting' })],
      token,
      'bilo-io',
    );
    expect(result.decided).toBeNull();
    expect(result.ignoredAuthors).toEqual([]);
  });
});
