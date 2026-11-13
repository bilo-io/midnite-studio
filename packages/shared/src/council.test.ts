import { describe, expect, it } from 'vitest';

import {
  COUNCIL_MEMBER_PROVIDERS,
  CouncilRunSchema,
  CouncilSchema,
  councilThreadTitle,
  councilTurnCount,
  COUNCIL_SYNTHESIS_TYPES,
  councilMemberCap,
  createStarterMembers,
} from './council';

describe('createStarterMembers', () => {
  it('returns three members, each with a unique id and an eligible provider', () => {
    const members = createStarterMembers();
    expect(members).toHaveLength(3);
    expect(new Set(members.map((m) => m.id)).size).toBe(3);
    for (const member of members) {
      expect(COUNCIL_MEMBER_PROVIDERS).toContain(member.provider);
    }
  });
});

describe('CouncilSchema', () => {
  it('round-trips a council with starter members', () => {
    const council = {
      id: 'c1',
      name: 'Test',
      members: createStarterMembers(),
      synthProvider: 'agy' as const,
      createdAt: 1,
      updatedAt: 1,
    };
    expect(CouncilSchema.parse(council)).toEqual({ ...council, synthesisType: 'brainstorm' });
  });

  it('rejects a member provider outside the eligible pool', () => {
    const council = {
      id: 'c1',
      name: 'Test',
      members: [{ id: 'm1', name: 'X', provider: 'grok', role: 'role' }],
      synthProvider: 'agy',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(CouncilSchema.safeParse(council).success).toBe(false);
  });

  it('accepts Claude as a member and a model on members and the synthesizer (Phase 133)', () => {
    const council = {
      id: 'c1',
      name: 'Test',
      members: [{ id: 'm1', name: 'X', provider: 'claude', role: 'role', model: 'haiku' }],
      synthProvider: 'agy',
      synthModel: 'gemini-3.8-flash-low',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(CouncilSchema.parse(council)).toEqual({ ...council, synthesisType: 'brainstorm' });
  });
});

describe('a run persisted before Phase 133', () => {
  it('reads with no turns as a one-turn thread', () => {
    const run = CouncilRunSchema.parse({
      id: 'r1',
      councilId: 'c1',
      prompt: 'topic',
      format: 'brainstorm',
      status: 'completed',
      synthProvider: 'agy',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    });
    expect(run.turns).toEqual([]);
    expect(councilTurnCount(run)).toBe(1);
    expect(councilThreadTitle(run)).toBe('topic');
  });
});

describe('CouncilRunSchema', () => {
  it('accepts a run with a transient member ptyId', () => {
    const run = {
      id: 'r1',
      councilId: 'c1',
      prompt: 'topic',
      format: 'brainstorm' as const,
      status: 'running' as const,
      synthProvider: 'codex' as const,
      members: [
        {
          memberId: 'm1',
          name: 'Optimist',
          provider: 'agy' as const,
          role: 'Best case.',
          status: 'running' as const,
          output: '',
          truncated: false,
          startedAt: 1,
          ptyId: 'pty-1',
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    expect(CouncilRunSchema.safeParse(run).success).toBe(true);
  });

  it('accepts every synthesis type as a format and rejects an unknown one (Phase 134)', () => {
    const base = { id: 'r1', councilId: 'c1', prompt: 'topic', status: 'running', synthProvider: 'codex', members: [], createdAt: 1, updatedAt: 1 };
    for (const format of COUNCIL_SYNTHESIS_TYPES) expect(CouncilRunSchema.safeParse({ ...base, format }).success).toBe(true);
  });

  it('rejects a format that is not a synthesis type', () => {
    const run = {
      id: 'r1',
      councilId: 'c1',
      prompt: 'topic',
      format: 'roundtable',
      status: 'running',
      synthProvider: 'codex',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    };
    expect(CouncilRunSchema.safeParse(run).success).toBe(false);
  });
});

describe('councilMemberCap (Phase 134)', () => {
  it('is 3 on the free tier and 6 with councils.pro', () => {
    expect(councilMemberCap(false)).toBe(3);
    expect(councilMemberCap(true)).toBe(6);
  });
});
