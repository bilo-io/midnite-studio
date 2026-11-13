import { describe, expect, it } from 'vitest';

import { COUNCIL_FREE_MEMBERS, COUNCIL_MIN_MEMBERS } from './council';
import {
  COUNCIL_PRESET_TYPES,
  COUNCIL_SYNTHESIS_PRESETS,
  councilNoun,
  councilSynthesisLabel,
  recommendSynthesisType,
  resolveSynthInstructions,
} from './council-presets';

describe('COUNCIL_SYNTHESIS_PRESETS', () => {
  it('has the four agreed presets', () => {
    expect(COUNCIL_PRESET_TYPES).toEqual(['brainstorm', 'debate', 'promote-demote', 'review']);
  });

  it.each(COUNCIL_PRESET_TYPES)('%s is well formed and fits the free tier', (type) => {
    const preset = COUNCIL_SYNTHESIS_PRESETS[type];
    expect(preset.instructions.length).toBeGreaterThan(40);
    expect(preset.members.length).toBeGreaterThanOrEqual(COUNCIL_MIN_MEMBERS);
    expect(preset.members.length).toBeLessThanOrEqual(COUNCIL_FREE_MEMBERS);
    expect(new Set(preset.members.map((m) => m.name)).size).toBe(preset.members.length);
    for (const member of preset.members) expect(member.role.trim()).not.toBe('');
  });
});

describe('resolveSynthInstructions', () => {
  it("uses the stored instructions, else the preset's", () => {
    expect(resolveSynthInstructions('debate', '  Pick a winner.  ')).toBe('Pick a winner.');
    expect(resolveSynthInstructions('debate', undefined)).toBe(COUNCIL_SYNTHESIS_PRESETS.debate.instructions);
    expect(resolveSynthInstructions('review', '   ')).toBe(COUNCIL_SYNTHESIS_PRESETS.review.instructions);
  });

  it("falls back to brainstorm's for a Custom council with none", () => {
    expect(resolveSynthInstructions('custom', undefined)).toBe(COUNCIL_SYNTHESIS_PRESETS.brainstorm.instructions);
  });
});

describe('labels', () => {
  it('names every type', () => {
    expect(councilSynthesisLabel('promote-demote')).toBe('Promote / Demote');
    expect(councilSynthesisLabel('custom')).toBe('Custom');
    expect(councilNoun('custom')).toBe('');
    expect(councilNoun('debate')).toBe('debate');
  });
});

describe('recommendSynthesisType', () => {
  it.each([
    ['Review this PR for security problems', 'review'],
    ['What could go wrong with the migration?', 'review'],
    ['Postgres vs SQLite for the desktop app', 'debate'],
    ['Which is better: tabs or a sidebar?', 'debate'],
    ['Should we adopt pnpm workspaces?', 'promote-demote'],
    ['Is it worth rewriting the parser?', 'promote-demote'],
    ['Ideas for the onboarding screen', 'brainstorm'],
    ['The colour palette for the website', 'brainstorm'],
  ] as const)('%s → %s', (topic, type) => {
    expect(recommendSynthesisType(topic)?.type).toBe(type);
  });

  it('has nothing to say about an empty prompt', () => {
    expect(recommendSynthesisType('   ')).toBeNull();
  });
});
