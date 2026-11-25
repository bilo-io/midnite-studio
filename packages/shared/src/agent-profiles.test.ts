import { describe, expect, it } from 'vitest';

import {
  AGENT_BLUEPRINT_STAGES,
  AGENT_BLUEPRINT_STAGE_IDS,
  AgentProfileSchema,
  blueprintSummary,
  createBlankAgentProfile,
  duplicateAgentProfile,
  parseAgentProfiles,
  uniqueProfileName,
  type IdFactory,
} from './index';

const ids: IdFactory = () => 'loop-abc';
const valid = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: 'Reviewer',
  baseAgentId: 'claude',
  accent: '#112233',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('AgentProfileSchema', () => {
  it('fills defaults', () => {
    const p = AgentProfileSchema.parse(valid('profile-1'));
    expect(p).toMatchObject({ description: '', model: 'default', systemPrompt: '', mcpTools: null, skills: [], blueprint: {} });
    expect(p.limits).toEqual({});
  });

  it('rejects a bad accent, an empty trimmed name and a foreign id prefix', () => {
    expect(AgentProfileSchema.safeParse(valid('profile-1', { accent: 'red' })).success).toBe(false);
    expect(AgentProfileSchema.safeParse(valid('profile-1', { name: '   ' })).success).toBe(false);
    expect(AgentProfileSchema.safeParse(valid('claude')).success).toBe(false);
  });
});

describe('parseAgentProfiles', () => {
  it('keeps 2 of [valid, invalid, duplicate-id, valid]', () => {
    const out = parseAgentProfiles([valid('profile-1'), { id: 'x' }, valid('profile-1', { name: 'Dup' }), valid('profile-2')]);
    expect(out.map((p) => p.id)).toEqual(['profile-1', 'profile-2']);
    expect(out[0]?.name).toBe('Reviewer');
  });

  it('returns [] for a non-array', () => {
    expect(parseAgentProfiles({})).toEqual([]);
  });
});

describe('factories', () => {
  it('creates a blank profile with the injected id and clock', () => {
    expect(createBlankAgentProfile(ids, 42)).toMatchObject({
      id: 'profile-abc',
      name: 'New agent',
      baseAgentId: 'claude',
      accent: '#8b5cf6',
      createdAt: 42,
      updatedAt: 42,
    });
  });

  it('duplicates with a new id, fresh timestamps and a unique name', () => {
    const src = AgentProfileSchema.parse(valid('profile-1', { name: 'Reviewer' }));
    const copy = duplicateAgentProfile(src, ['Reviewer', 'Reviewer copy'], ids, 99);
    expect(copy).toMatchObject({ id: 'profile-abc', name: 'Reviewer copy 2', createdAt: 99, updatedAt: 99, baseAgentId: 'claude' });
  });
});

describe('uniqueProfileName', () => {
  it('numbers past taken names', () => {
    expect(uniqueProfileName('Reviewer', ['Reviewer', 'Reviewer 2'])).toBe('Reviewer 3');
    expect(uniqueProfileName('Reviewer', [])).toBe('Reviewer');
  });

  it('truncates the base and keeps the suffix', () => {
    const base = 'x'.repeat(60);
    const out = uniqueProfileName(base, [base]);
    expect(out).toHaveLength(60);
    expect(out.endsWith(' 2')).toBe(true);
  });
});

describe('blueprint', () => {
  it('has the five stages with 3-4 options and unique option ids', () => {
    expect(AGENT_BLUEPRINT_STAGES.map((s) => s.id)).toEqual([...AGENT_BLUEPRINT_STAGE_IDS]);
    const all: string[] = [];
    for (const stage of AGENT_BLUEPRINT_STAGES) {
      expect(stage.options.length).toBeGreaterThanOrEqual(3);
      expect(stage.options.length).toBeLessThanOrEqual(4);
      for (const option of stage.options) {
        all.push(option.id);
        expect(option.summary.length).toBeLessThanOrEqual(220);
        if (option.docsUrl !== null) expect(option.docsUrl.startsWith('https://')).toBe(true);
      }
    }
    expect(new Set(all).size).toBe(all.length);
    expect(AGENT_BLUEPRINT_STAGES[0]?.options.find((o) => o.id === 'custom')?.docsUrl).toBeNull();
  });

  it('summarises in stage order and drops unknown option ids', () => {
    const rows = blueprintSummary({ act: { options: ['mcp', 'nope'], note: 'n' }, orchestrate: { options: ['custom'], note: '' } });
    expect(rows.map((r) => r.stageId)).toEqual([...AGENT_BLUEPRINT_STAGE_IDS]);
    expect(rows[0]?.optionLabels).toEqual(['Custom / in-house']);
    expect(rows[2]).toMatchObject({ optionLabels: ['Model Context Protocol'], note: 'n' });
    expect(rows[1]?.optionLabels).toEqual([]);
  });
});
