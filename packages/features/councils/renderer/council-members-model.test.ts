import { describe, expect, it } from 'vitest';

import type { CouncilMember } from '@midnite/studio-shared';

import { applyPresetMembers, membersFromGenerated, resizeMembers, revealOrder } from './council-members-model';

const MEMBERS: CouncilMember[] = [
  { id: 'a', name: 'Optimist', role: 'r', provider: 'claude', model: 'haiku-4-5' },
  { id: 'b', name: 'Skeptic', role: 'r', provider: 'agy', model: 'gemini-3.8-flash-low' },
];

describe('applyPresetMembers', () => {
  it("brings the preset's members, seated on the current agents slot by slot", () => {
    const next = applyPresetMembers(MEMBERS, 'debate');
    expect(next.map((m) => m.name)).toEqual(['Affirmative', 'Negative', 'Cross-examiner']);
    expect(next.map((m) => [m.provider, m.model])).toEqual([
      ['claude', 'haiku-4-5'],
      ['agy', 'gemini-3.8-flash-low'],
      // A slot that did not exist takes the last member's agent.
      ['agy', 'gemini-3.8-flash-low'],
    ]);
    expect(new Set(next.map((m) => m.id)).size).toBe(3);
  });

  it('keeps the members as they are for Custom', () => {
    expect(applyPresetMembers(MEMBERS, 'custom')).toEqual(MEMBERS);
  });

  it('falls back to Antigravity with no members to seat on', () => {
    expect(applyPresetMembers([], 'promote-demote').map((m) => m.provider)).toEqual(['agy', 'agy']);
  });
});

describe('resizeMembers', () => {
  it('trims from the end', () => {
    expect(resizeMembers(MEMBERS, 1, 'brainstorm').map((m) => m.id)).toEqual(['a']);
  });

  it("grows with the preset's next unused member, then generic ones", () => {
    const debate = applyPresetMembers(MEMBERS, 'debate').slice(0, 2);
    const next = resizeMembers(debate, 4, 'debate');
    expect(next.map((m) => m.name)).toEqual(['Affirmative', 'Negative', 'Cross-examiner', 'Member 4']);
    expect(next.slice(0, 2)).toEqual(debate);
  });

  it('adds generic members for Custom', () => {
    expect(resizeMembers(MEMBERS, 3, 'custom')[2]).toMatchObject({ name: 'Member 3', provider: 'agy' });
  });
});

describe('membersFromGenerated', () => {
  it('mints ids and keeps a model only when one was chosen', () => {
    const next = membersFromGenerated([
      { name: 'A', role: 'r', provider: 'claude', model: 'haiku-4-5' },
      { name: 'B', role: 'r', provider: 'agy' },
    ]);
    expect(next[0]).toMatchObject({ name: 'A', model: 'haiku-4-5' });
    expect('model' in next[1]!).toBe(false);
    expect(next[0]!.id).not.toBe(next[1]!.id);
  });
});

describe('revealOrder', () => {
  it('numbers only the members that are new, in order', () => {
    const next = [MEMBERS[0]!, { ...MEMBERS[1]!, id: 'c' }, { ...MEMBERS[1]!, id: 'd' }];
    expect([...revealOrder(MEMBERS, next)]).toEqual([
      ['c', 0],
      ['d', 1],
    ]);
  });
});
