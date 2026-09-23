import { describe, expect, it } from 'vitest';
import { renameLegacySkills, renameLegacySkillsIn } from './migrate-skill-renames';

describe('renameLegacySkills', () => {
  it.each([
    ['/midnite-exec', '/midnite-create'],
    ['/midnite-exec-adhoc', '/midnite-create-adhoc'],
    ['/midnite-exec-swarm', '/midnite-swarm'],
    ['/midnite-brainstorm', '/midnite-ideate'],
    ['/loop /midnite-exec', '/loop /midnite-create'],
    ['/loop /midnite-brainstorm', '/loop /midnite-ideate'],
    ['/midnite-exec --dry-run', '/midnite-create --dry-run'],
  ])('%s → %s', (before, after) => {
    expect(renameLegacySkills(before)).toBe(after);
  });

  it('leaves unrelated and look-alike skills alone', () => {
    expect(renameLegacySkills('/midnite-refine')).toBe('/midnite-refine');
    expect(renameLegacySkills('/my-midnite-exec')).toBe('/my-midnite-exec');
    expect(renameLegacySkills('/midnite-exec-custom')).toBe('/midnite-exec-custom');
  });

  it('rewrites every string value of a saved record and passes junk through', () => {
    expect(renameLegacySkillsIn({ execBacklog: '/midnite-exec', prReview: '/pr-review' })).toEqual({
      execBacklog: '/midnite-create',
      prReview: '/pr-review',
    });
    expect(renameLegacySkillsIn(undefined)).toBeUndefined();
  });
});
