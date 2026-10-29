import { describe, expect, it } from 'vitest';

import { SUITE_APP_IDS, SuiteAppIdSchema } from './suite-apps';

describe('SUITE_APP_IDS', () => {
  it('has no duplicates', () => {
    expect(new Set(SUITE_APP_IDS).size).toBe(SUITE_APP_IDS.length);
  });

  it('is what the schema accepts', () => {
    for (const id of SUITE_APP_IDS) expect(SuiteAppIdSchema.parse(id)).toBe(id);
    expect(SuiteAppIdSchema.safeParse('launcher').success).toBe(false);
  });
});
