import { describe, expect, it } from 'vitest';
import {
  migrateBuildPlanSkills,
  migrateSwarmFleetSkills,
  renameSwarmFleetSkills,
  migratePrSkills,
  renameBuildPlanSkills,
  renameLegacySkills,
  renameLegacySkillsIn,
  renamePrSkills,
} from './migrate-skill-renames';

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

describe('build/plan skill renames (v38 → v39)', () => {
  it('renames create, create-adhoc and ideate, and leaves refine and lookalikes alone', () => {
    expect(renameBuildPlanSkills('/midnite-create 98 D')).toBe('/midnite-build 98 D');
    expect(renameBuildPlanSkills('/loop /midnite-create-adhoc')).toBe('/loop /midnite-build-adhoc');
    expect(renameBuildPlanSkills('/loop /midnite-ideate')).toBe('/loop /midnite-plan');
    expect(renameBuildPlanSkills('/midnite-refine 77')).toBe('/midnite-refine 77');
    expect(renameBuildPlanSkills('/my-midnite-create')).toBe('/my-midnite-create');
  });

  it('rewrites every persisted skill field, and only the skill keys of a custom loop', () => {
    const migrated = migrateBuildPlanSkills({
      agentSkills: { execBacklog: '/midnite-create', brainstorm: '/midnite-ideate' },
      columnSkillByProject: { p: { 'in progress': '/midnite-create' } },
      customLoops: [{ label: 'midnite-create fans', fallbackPrompt: '/loop /midnite-create' }],
    });
    expect(migrated.agentSkills).toEqual({ execBacklog: '/midnite-build', brainstorm: '/midnite-plan' });
    expect(migrated.columnSkillByProject).toEqual({ p: { 'in progress': '/midnite-build' } });
    expect(migrated.customLoops).toEqual([{ label: 'midnite-create fans', fallbackPrompt: '/loop /midnite-build' }]);
  });
});

describe('swarm → fleet skill rename (v39 → v40)', () => {
  it('renames midnite-swarm and leaves lookalikes and the new skills alone', () => {
    expect(renameSwarmFleetSkills('/midnite-swarm 91 101')).toBe('/midnite-fleet 91 101');
    expect(renameSwarmFleetSkills('/loop /midnite-swarm')).toBe('/loop /midnite-fleet');
    expect(renameSwarmFleetSkills('/my-midnite-swarm')).toBe('/my-midnite-swarm');
    expect(renameSwarmFleetSkills('/midnite-swarm-x')).toBe('/midnite-swarm-x');
    expect(renameSwarmFleetSkills('/midnite-fleet')).toBe('/midnite-fleet');
  });

  it('rewrites every persisted skill field, and only the skill keys of a custom loop', () => {
    const migrated = migrateSwarmFleetSkills({
      agentSkills: { execSwarm: '/midnite-swarm', prReview: '/midnite-pr-review' },
      cardSkillByTask: { t1: '/midnite-swarm' },
      columnSkillByProject: { p: { 'in progress': '/midnite-swarm' } },
      customLoops: [{ label: 'midnite-swarm fans', fallbackPrompt: '/loop /midnite-swarm' }],
    });
    expect(migrated.agentSkills).toEqual({ execSwarm: '/midnite-fleet', prReview: '/midnite-pr-review' });
    expect(migrated.cardSkillByTask).toEqual({ t1: '/midnite-fleet' });
    expect(migrated.columnSkillByProject).toEqual({ p: { 'in progress': '/midnite-fleet' } });
    expect(migrated.customLoops).toEqual([{ label: 'midnite-swarm fans', fallbackPrompt: '/loop /midnite-fleet' }]);
  });
});
