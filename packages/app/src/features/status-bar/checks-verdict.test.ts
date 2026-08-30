import type { ForgePull } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { findPrForBranch } from './checks-verdict';

const pull = (overrides: Partial<ForgePull> & { number: number; headBranch: string }): ForgePull => ({
  title: '',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  author: '',
  url: '',
  mergedAt: null,
  closedAt: null,
  ...overrides,
});

describe('findPrForBranch', () => {
  it('renders nothing when no branch is checked out', () => {
    expect(findPrForBranch([pull({ number: 1, headBranch: 'feature-x' })], null)).toBeNull();
  });

  it('renders nothing when no open pull matches the checked-out branch', () => {
    expect(findPrForBranch([pull({ number: 1, headBranch: 'feature-x' })], 'main')).toBeNull();
  });

  it('matches the pull whose head branch is the checked-out branch', () => {
    const match = pull({ number: 2, headBranch: 'feature-y' });
    const pulls = [pull({ number: 1, headBranch: 'feature-x' }), match];
    expect(findPrForBranch(pulls, 'feature-y')).toBe(match);
  });
});
