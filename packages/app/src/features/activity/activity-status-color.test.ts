import { ACTIVITY_STATUSES } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { activityStatusVar } from './activity-status-color';

describe('activityStatusVar', () => {
  it('names the exact CSS property resolveActivityTokens writes', () => {
    expect(activityStatusVar('waiting')).toBe('var(--activity-waiting)');
    expect(activityStatusVar('agent')).toBe('var(--activity-agent)');
  });

  it('has a var() for every declared ActivityStatus', () => {
    for (const status of ACTIVITY_STATUSES) {
      expect(activityStatusVar(status)).toBe(`var(--activity-${status})`);
    }
  });
});
