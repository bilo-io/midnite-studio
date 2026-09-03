import { describe, expect, it } from 'vitest';

import {
  ScaffoldApplyResultSchema,
  ScaffoldEntrySchema,
  ScaffoldManifestSchema,
  ScaffoldPlanSchema,
  ScaffoldStatusSchema,
  SCAFFOLD_STATUSES,
} from './scaffold';

describe('ScaffoldStatusSchema', () => {
  it('accepts every declared status', () => {
    for (const status of SCAFFOLD_STATUSES) {
      expect(ScaffoldStatusSchema.parse(status)).toBe(status);
    }
  });

  it('rejects an unknown status', () => {
    expect(ScaffoldStatusSchema.safeParse('modified').success).toBe(false);
  });
});

describe('ScaffoldEntrySchema', () => {
  it('round-trips a valid entry', () => {
    const entry = { path: '.claude/skills/midnite-exec/SKILL.md', status: 'create', bytes: 512 };
    expect(ScaffoldEntrySchema.parse(entry)).toEqual(entry);
  });

  it('rejects a negative byte count', () => {
    expect(
      ScaffoldEntrySchema.safeParse({ path: 'a', status: 'create', bytes: -1 }).success,
    ).toBe(false);
  });

  it('rejects an empty path', () => {
    expect(ScaffoldEntrySchema.safeParse({ path: '', status: 'create', bytes: 0 }).success).toBe(
      false,
    );
  });
});

describe('ScaffoldPlanSchema', () => {
  it('round-trips a plan with a mix of statuses', () => {
    const plan = {
      targetRoot: '/tmp/some-repo',
      templateVersion: '1.0.0',
      entries: [
        { path: '.midnite/tasks/_INDEX.md', status: 'unchanged', bytes: 10 },
        { path: '.claude/skills/midnite-exec/SKILL.md', status: 'stale', bytes: 20 },
        { path: 'CLAUDE.md', status: 'locally-edited', bytes: 30 },
      ],
    };
    expect(ScaffoldPlanSchema.parse(plan)).toEqual(plan);
  });

  it('accepts an empty entries array', () => {
    expect(
      ScaffoldPlanSchema.parse({ targetRoot: '/tmp/r', templateVersion: '1', entries: [] }).entries,
    ).toEqual([]);
  });
});

describe('ScaffoldApplyResultSchema', () => {
  it('round-trips written and skipped paths', () => {
    const result = {
      written: ['.midnite/tasks/_INDEX.md'],
      skipped: [{ path: 'CLAUDE.md', reason: 'changed on disk since the plan was read' }],
    };
    expect(ScaffoldApplyResultSchema.parse(result)).toEqual(result);
  });

  it('accepts an all-written result with nothing skipped', () => {
    const result = { written: ['a', 'b'], skipped: [] };
    expect(ScaffoldApplyResultSchema.parse(result)).toEqual(result);
  });
});

describe('ScaffoldManifestSchema', () => {
  it('round-trips a manifest with a file map', () => {
    const manifest = {
      version: 1,
      template: {
        version: '1.0.0',
        files: { '.midnite/tasks/_INDEX.md': 'a'.repeat(64) },
      },
    };
    expect(ScaffoldManifestSchema.parse(manifest)).toEqual(manifest);
  });

  it('rejects a version other than 1', () => {
    expect(
      ScaffoldManifestSchema.safeParse({
        version: 2,
        template: { version: '1', files: {} },
      }).success,
    ).toBe(false);
  });

  it('accepts an empty file map, for a template with nothing written yet', () => {
    const manifest = { version: 1, template: { version: '1.0.0', files: {} } };
    expect(ScaffoldManifestSchema.parse(manifest)).toEqual(manifest);
  });
});
