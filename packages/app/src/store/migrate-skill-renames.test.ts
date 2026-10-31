import { describe, expect, it } from 'vitest';
import { migratePrSkills, renameLegacySkills, renameLegacySkillsIn, renamePrSkills } from './migrate-skill-renames';

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

describe('PR skill renames (v37 → v38)', () => {
  it.each([
    ['/pr-review', '/midnite-pr-review'],
    ['/pr-feedback', '/midnite-pr-feedback'],
    ['/loop /pr-review', '/loop /midnite-pr-review'],
    ['/loop /pr-review /pr-feedback Look only at ready PRs.', '/loop /midnite-pr-review /midnite-pr-feedback Look only at ready PRs.'],
    ['/pr-review --dry-run', '/midnite-pr-review --dry-run'],
  ])('%s → %s', (before, after) => {
    expect(renamePrSkills(before)).toBe(after);
  });

  it('leaves look-alike and already-renamed skills alone, and is idempotent', () => {
    for (const same of ['/ekko-pr-review', '/loop-pr-reviews', '/midnite-pr-review', '/pr-reviewer', 'pr-review']) {
      expect(renamePrSkills(same)).toBe(same);
    }
    expect(renamePrSkills(renamePrSkills('/pr-feedback'))).toBe('/midnite-pr-feedback');
  });

  it('rewrites agent skills, modifier skills and custom loops, nested', () => {
    const migrated = migratePrSkills({
      agentSkills: { prReview: '/pr-review', loopPrFeedback: '/loop /pr-feedback', triage: '/midnite-triage' },
      loopModifierSkills: { watchdog: { 'pr-review': '/pr-review' } },
      customLoops: [{ id: 'custom:a', label: 'Runs /pr-review', fallbackPrompt: '/loop /pr-review', modifiers: [{ defaultSkill: '/pr-feedback', n: 1 }] }],
      cardSkillByTask: { t1: '/pr-review' },
      unrelated: '/pr-review',
    });
    expect(migrated).toEqual({
      agentSkills: { prReview: '/midnite-pr-review', loopPrFeedback: '/loop /midnite-pr-feedback', triage: '/midnite-triage' },
      loopModifierSkills: { watchdog: { 'pr-review': '/midnite-pr-review' } },
      customLoops: [
        { id: 'custom:a', label: 'Runs /pr-review', fallbackPrompt: '/loop /midnite-pr-review', modifiers: [{ defaultSkill: '/midnite-pr-feedback', n: 1 }] },
      ],
      cardSkillByTask: { t1: '/midnite-pr-review' },
      unrelated: '/pr-review',
    });
  });
});
