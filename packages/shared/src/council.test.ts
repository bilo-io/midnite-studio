import { describe, expect, it } from 'vitest';

import {
  COUNCIL_MEMBER_PROVIDERS,
  CouncilRunSchema,
  CouncilSchema,
  createStarterMembers,
} from './council';

describe('createStarterMembers', () => {
  it('returns four members, each with a unique id and an eligible provider', () => {
    const members = createStarterMembers();
    expect(members).toHaveLength(4);
    expect(new Set(members.map((m) => m.id)).size).toBe(4);
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
    expect(CouncilSchema.parse(council)).toEqual(council);
  });

  it('rejects a member provider outside the eligible pool', () => {
    const council = {
      id: 'c1',
      name: 'Test',
      members: [{ id: 'm1', name: 'X', provider: 'claude', role: 'role' }],
      synthProvider: 'agy',
      createdAt: 1,
      updatedAt: 1,
    };
    expect(CouncilSchema.safeParse(council).success).toBe(false);
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

  it('rejects a format other than brainstorm', () => {
    const run = {
      id: 'r1',
      councilId: 'c1',
      prompt: 'topic',
      format: 'debate',
      status: 'running',
      synthProvider: 'codex',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    };
    expect(CouncilRunSchema.safeParse(run).success).toBe(false);
  });
});
