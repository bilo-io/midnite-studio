import { describe, expect, it } from 'vitest';
import { navConfigProblems, navFromGroups } from '@midnite/studio-frame';

import { HEALTH_NAV_GROUP } from './health-nav';

describe('HEALTH_NAV_GROUP', () => {
  it('lists the five rail rows', () => {
    expect(HEALTH_NAV_GROUP.views.map((v) => v.id)).toEqual(['today', 'biometrics', 'nutrition', 'workouts', 'progress']);
  });

  it('every rail icon is a function and the config is valid', () => {
    expect(typeof HEALTH_NAV_GROUP.icon).toBe('function');
    for (const v of HEALTH_NAV_GROUP.views) expect(typeof v.icon).toBe('function');
    expect(navConfigProblems(navFromGroups([HEALTH_NAV_GROUP]))).toEqual([]);
  });
});
