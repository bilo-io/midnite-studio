import { describe, expect, it } from 'vitest';

import { RETIRED_APP_ALIASES } from './modules';
import { RETIRED_SUITE_APP_HOSTS, SUITE_APP_IDS, SuiteAppIdSchema } from './suite-apps';

describe('SUITE_APP_IDS', () => {
  it('has no duplicates', () => {
    expect(new Set(SUITE_APP_IDS).size).toBe(SUITE_APP_IDS.length);
  });

  it('is what the schema accepts', () => {
    for (const id of SUITE_APP_IDS) expect(SuiteAppIdSchema.parse(id)).toBe(id);
    expect(SuiteAppIdSchema.safeParse('launcher').success).toBe(false);
  });

  it('no longer lists the six retired apps, and resolves a persisted retired id to its host', () => {
    for (const [id, host] of Object.entries(RETIRED_SUITE_APP_HOSTS)) {
      expect(SUITE_APP_IDS as readonly string[]).not.toContain(id);
      expect(SuiteAppIdSchema.parse(id)).toBe(host);
      expect(RETIRED_APP_ALIASES[id as keyof typeof RETIRED_APP_ALIASES].app).toBe(host);
    }
  });
});
