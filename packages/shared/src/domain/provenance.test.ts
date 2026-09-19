import { describe, expect, it } from 'vitest';

import type { AgentSignature } from '../terminal';
import type { Commit } from './commit';
import {
  classifyProvenance,
  CommitProvenanceSchema,
  commitsForLiveSession,
  commitsForSession,
  extractIdentity,
  ProvenanceSourceSchema,
} from './provenance';
import type { ClosedSession } from './session-history';

const mockRoster: AgentSignature[] = [
  {
    agentId: 'claude',
    emails: ['noreply@anthropic.com'],
    names: ['Claude', 'Claude Code'],
  },
  {
    agentId: 'codex',
    emails: ['noreply@github.com', 'codex@openai.com'],
    names: ['Codex'],
  },
  {
    agentId: 'agy',
    emails: ['antigravity@google.com'],
    names: ['Antigravity', 'agy'],
  },
];

const makeCommit = (overrides: Partial<Commit> = {}): Commit => ({
  sha: 'a'.repeat(40),
  parents: [],
  authorName: 'Bilo Lwabona',
  authorEmail: 'bilo.lwabona@gmail.com',
  authorDate: 1700000000,
  committerDate: 1700000000,
  subject: 'feat: add novelty',
  refs: [],
  coAuthors: [],
  sessionTrailers: [],
  ...overrides,
});

const makeSession = (overrides: Partial<ClosedSession> = {}): ClosedSession => ({
  id: 'session-1',
  kind: 'agent',
  agentId: 'claude',
  title: 'midnite-studio',
  cwd: '/path/to/repo',
  repoId: 'repo-studio',
  createdAt: 1700000000,
  closedAt: 1700000100,
  exitCode: 0,
  reason: 'closed',
  transcriptBytes: 1024,
  ...overrides,
});

describe('ProvenanceSourceSchema & CommitProvenanceSchema', () => {
  it('validates provenance sources', () => {
    expect(ProvenanceSourceSchema.parse('session-trailer')).toBe('session-trailer');
    expect(ProvenanceSourceSchema.parse('co-author')).toBe('co-author');
    expect(ProvenanceSourceSchema.parse('author')).toBe('author');
    expect(ProvenanceSourceSchema.parse('session-window')).toBe('session-window');
    expect(() => ProvenanceSourceSchema.parse('unknown')).toThrow();
  });

  it('validates CommitProvenance shapes', () => {
    expect(CommitProvenanceSchema.parse({ kind: 'human' })).toEqual({ kind: 'human' });
    expect(
      CommitProvenanceSchema.parse({
        kind: 'agent',
        agentIds: ['claude'],
        source: 'session-trailer',
        sessionId: 'session-1',
      }),
    ).toEqual({
      kind: 'agent',
      agentIds: ['claude'],
      source: 'session-trailer',
      sessionId: 'session-1',
    });
    expect(
      CommitProvenanceSchema.parse({
        kind: 'mixed',
        agentIds: ['claude'],
        source: 'co-author',
      }),
    ).toEqual({
      kind: 'mixed',
      agentIds: ['claude'],
      source: 'co-author',
    });
  });
});

describe('extractIdentity', () => {
  it('extracts name and email from Name <email>', () => {
    expect(extractIdentity('Claude <noreply@anthropic.com>')).toEqual({
      name: 'Claude',
      email: 'noreply@anthropic.com',
    });
  });

  it('extracts email from bare <email>', () => {
    expect(extractIdentity('<noreply@anthropic.com>')).toEqual({
      name: '',
      email: 'noreply@anthropic.com',
    });
  });

  it('extracts email from bare email without angle brackets', () => {
    expect(extractIdentity('antigravity@google.com')).toEqual({
      name: '',
      email: 'antigravity@google.com',
    });
  });

  it('extracts name when no email is present', () => {
    expect(extractIdentity('Claude Code')).toEqual({
      name: 'Claude Code',
      email: '',
    });
  });
});

describe('classifyProvenance', () => {
  describe('confidence ordering', () => {
    it('ranks session-trailer above co-author, author, and session-window', () => {
      const commit = makeCommit({
        authorEmail: 'antigravity@google.com', // author is agy
        authorName: 'Antigravity',
        coAuthors: ['Codex <codex@openai.com>'], // co-author is codex
        sessionTrailers: ['session-claude'], // session-trailer is claude
        committerDate: 1700000050,
      });

      const sessions = [
        makeSession({
          id: 'session-claude',
          agentId: 'claude',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({
        kind: 'agent',
        agentIds: ['claude'],
        source: 'session-trailer',
        sessionId: 'session-claude',
      });
    });

    it('ranks co-author above author and session-window', () => {
      const commit = makeCommit({
        authorEmail: 'bilo.lwabona@gmail.com', // human author
        authorName: 'Bilo Lwabona',
        coAuthors: ['Claude <noreply@anthropic.com>'], // co-author is claude
        sessionTrailers: ['unknown-session'], // does not resolve
        committerDate: 1700000050,
      });

      const sessions = [
        makeSession({
          id: 'session-agy',
          agentId: 'agy',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({
        kind: 'mixed',
        agentIds: ['claude'],
        source: 'co-author',
      });
    });

    it('ranks author above session-window', () => {
      const commit = makeCommit({
        authorEmail: 'antigravity@google.com', // author is agy
        authorName: 'Antigravity',
        coAuthors: ['Alice <alice@example.com>'], // human co-author
        sessionTrailers: [],
        committerDate: 1700000050,
      });

      const sessions = [
        makeSession({
          id: 'session-claude',
          agentId: 'claude',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({
        kind: 'agent',
        agentIds: ['agy'],
        source: 'author',
      });
    });
  });

  describe('kind: mixed vs agent vs human', () => {
    it('classifies human author + agent co-author as mixed', () => {
      const commit = makeCommit({
        authorName: 'Bilo Lwabona',
        authorEmail: 'bilo.lwabona@gmail.com',
        coAuthors: ['Claude <noreply@anthropic.com>'],
      });

      const result = classifyProvenance(commit, mockRoster, []);
      expect(result).toEqual({
        kind: 'mixed',
        agentIds: ['claude'],
        source: 'co-author',
      });
    });

    it('classifies agent author + agent co-author as agent', () => {
      const commit = makeCommit({
        authorName: 'Antigravity',
        authorEmail: 'antigravity@google.com',
        coAuthors: ['Claude <noreply@anthropic.com>'],
      });

      const result = classifyProvenance(commit, mockRoster, []);
      expect(result).toEqual({
        kind: 'agent',
        agentIds: ['claude'],
        source: 'co-author',
      });
    });

    it('classifies agent author alone as agent', () => {
      const commit = makeCommit({
        authorName: 'Codex',
        authorEmail: 'noreply@github.com',
      });

      const result = classifyProvenance(commit, mockRoster, []);
      expect(result).toEqual({
        kind: 'agent',
        agentIds: ['codex'],
        source: 'author',
      });
    });

    it('classifies pure human commit with no trailers or sessions as human', () => {
      const commit = makeCommit({
        authorName: 'Ada Lovelace',
        authorEmail: 'ada@example.com',
      });

      const result = classifyProvenance(commit, mockRoster, []);
      expect(result).toEqual({ kind: 'human' });
    });

    it('deduplicates multiple co-author entries for the same agent', () => {
      const commit = makeCommit({
        coAuthors: [
          'Claude <noreply@anthropic.com>',
          'Claude Code <noreply@anthropic.com>',
        ],
      });

      const result = classifyProvenance(commit, mockRoster, []);
      expect(result).toEqual({
        kind: 'mixed',
        agentIds: ['claude'],
        source: 'co-author',
      });
    });

    it('supports matching by agent name case-insensitively', () => {
      const commit = makeCommit({
        authorName: 'bilo',
        authorEmail: 'bilo@example.com',
        coAuthors: ['claude'],
      });

      const result = classifyProvenance(commit, mockRoster, []);
      expect(result).toEqual({
        kind: 'mixed',
        agentIds: ['claude'],
        source: 'co-author',
      });
    });
  });

  describe('session trailer resolution', () => {
    it('ignores shell sessions matching the trailer', () => {
      const commit = makeCommit({
        sessionTrailers: ['shell-session'],
      });

      const sessions = [
        makeSession({
          id: 'shell-session',
          kind: 'shell',
          agentId: undefined,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions);
      expect(result).toEqual({ kind: 'human' });
    });

    it('handles multiple matching session trailers and deduplicates agentIds', () => {
      const commit = makeCommit({
        sessionTrailers: ['s1', 's2'],
      });

      const sessions = [
        makeSession({ id: 's1', agentId: 'claude' }),
        makeSession({ id: 's2', agentId: 'claude' }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions);
      expect(result).toEqual({
        kind: 'agent',
        agentIds: ['claude'],
        source: 'session-trailer',
        sessionId: 's1',
      });
    });
  });

  describe('window-join rules', () => {
    it('counts a session with reason: superseded', () => {
      const commit = makeCommit({
        committerDate: 1700000050,
      });

      const sessions = [
        makeSession({
          id: 's-superseded',
          agentId: 'codex',
          reason: 'superseded',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({
        kind: 'agent',
        agentIds: ['codex'],
        source: 'session-window',
        sessionId: 's-superseded',
      });
    });

    it('two overlapping agent sessions yield both agentIds and source: session-window', () => {
      const commit = makeCommit({
        committerDate: 1700000050,
      });

      const sessions = [
        makeSession({
          id: 's-claude',
          agentId: 'claude',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
        makeSession({
          id: 's-codex',
          agentId: 'codex',
          createdAt: 1700000020,
          closedAt: 1700000080,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({
        kind: 'agent',
        agentIds: ['claude', 'codex'],
        source: 'session-window',
      });
    });

    it('never matches a session on a different repoId even if timestamps align', () => {
      const commit = makeCommit({
        committerDate: 1700000050,
      });

      const sessions = [
        makeSession({
          id: 's-other',
          agentId: 'claude',
          repoId: 'other-repo',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({ kind: 'human' });
    });

    it('classifies a commit older than the oldest session as human', () => {
      const commit = makeCommit({
        committerDate: 1699999000, // older than 1700000000
      });

      const sessions = [
        makeSession({
          id: 's-claude',
          agentId: 'claude',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({ kind: 'human' });
    });

    it('classifies a commit newer than the newest session as human', () => {
      const commit = makeCommit({
        committerDate: 1700000200,
      });

      const sessions = [
        makeSession({
          id: 's-claude',
          agentId: 'claude',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({ kind: 'human' });
    });

    it('handles millisecond session timestamps correctly', () => {
      const commit = makeCommit({
        committerDate: 1700000050, // unix seconds
      });

      const sessions = [
        makeSession({
          id: 's-ms',
          agentId: 'agy',
          createdAt: 1700000000000, // unix ms
          closedAt: 1700000100000, // unix ms
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({
        kind: 'agent',
        agentIds: ['agy'],
        source: 'session-window',
        sessionId: 's-ms',
      });
    });

    it('ignores shell sessions during window join', () => {
      const commit = makeCommit({
        committerDate: 1700000050,
      });

      const sessions = [
        makeSession({
          id: 's-shell',
          kind: 'shell',
          agentId: undefined,
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      const result = classifyProvenance(commit, mockRoster, sessions, 'repo-studio');
      expect(result).toEqual({ kind: 'human' });
    });

    it('matches boundary timestamps exactly (inclusive start and end)', () => {
      const commitStart = makeCommit({ committerDate: 100 });
      const commitEnd = makeCommit({ committerDate: 200 });

      const sessions = [
        makeSession({
          id: 's-boundary',
          agentId: 'claude',
          createdAt: 100,
          closedAt: 200,
        }),
      ];

      expect(classifyProvenance(commitStart, mockRoster, sessions, 'repo-studio')).toEqual({
        kind: 'agent',
        agentIds: ['claude'],
        source: 'session-window',
        sessionId: 's-boundary',
      });

      expect(classifyProvenance(commitEnd, mockRoster, sessions, 'repo-studio')).toEqual({
        kind: 'agent',
        agentIds: ['claude'],
        source: 'session-window',
        sessionId: 's-boundary',
      });
    });

    it('matches session-window when repoId argument is omitted', () => {
      const commit = makeCommit({ committerDate: 1700000050 });
      const sessions = [
        makeSession({
          id: 's-omitted',
          agentId: 'claude',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      expect(classifyProvenance(commit, mockRoster, sessions)).toEqual({
        kind: 'agent',
        agentIds: ['claude'],
        source: 'session-window',
        sessionId: 's-omitted',
      });
    });

    it('reads repoId from commit object if repoId argument is omitted', () => {
      const commit = { ...makeCommit({ committerDate: 1700000050 }), repoId: 'repo-target' };
      const sessions = [
        makeSession({
          id: 's-repo',
          agentId: 'claude',
          repoId: 'repo-target',
          createdAt: 1700000000,
          closedAt: 1700000100,
        }),
      ];

      expect(
        classifyProvenance(commit as Commit & { repoId?: string }, mockRoster, sessions),
      ).toEqual({
        kind: 'agent',
        agentIds: ['claude'],
        source: 'session-window',
        sessionId: 's-repo',
      });
    });

    it('falls through to human when co-authors exist but do not match any agent', () => {
      const commit = makeCommit({
        coAuthors: ['Human Contributor <human@example.com>'],
      });

      expect(classifyProvenance(commit, mockRoster, [])).toEqual({ kind: 'human' });
    });

    it('falls through to human when session trailer does not resolve to any session', () => {
      const commit = makeCommit({
        sessionTrailers: ['non-existent-session'],
      });

      expect(classifyProvenance(commit, mockRoster, [])).toEqual({ kind: 'human' });
    });
  });

  describe('commitsForSession', () => {
    it('finds commits matching by session trailer or window join', () => {
      const session = makeSession({
        id: 'target-session',
        agentId: 'claude',
        repoId: 'repo-1',
        createdAt: 1000,
        closedAt: 2000,
      });

      const c1 = makeCommit({
        sha: '1'.repeat(40),
        sessionTrailers: ['target-session'],
        committerDate: 500, // outside window, but has trailer
      });

      const c2 = makeCommit({
        sha: '2'.repeat(40),
        committerDate: 1500, // inside window
      });

      const c3 = makeCommit({
        sha: '3'.repeat(40),
        committerDate: 3000, // outside window
      });

      const matched = commitsForSession([c1, c2, c3], session);
      expect(matched.map((c) => c.sha)).toEqual(['1'.repeat(40), '2'.repeat(40)]);
    });

    it('returns empty when given a non-agent session', () => {
      const shellSession = makeSession({
        id: 'shell',
        kind: 'shell',
        agentId: undefined,
      });

      expect(commitsForSession([makeCommit()], shellSession)).toEqual([]);
    });

    it('rejects window match when commit repoId differs from session repoId', () => {
      const session = makeSession({
        id: 's1',
        repoId: 'repo-A',
        createdAt: 1000,
        closedAt: 2000,
      });

      const commit = {
        ...makeCommit({ committerDate: 1500 }),
        repoId: 'repo-B',
      };

      expect(commitsForSession([commit], session)).toEqual([]);
    });
  });

  describe('commitsForLiveSession', () => {
    it('finds commits matching by session trailer or since createdAt', () => {
      const session = {
        id: 'live-session-1',
        kind: 'agent',
        agentId: 'claude',
        repoId: 'repo-1',
        createdAt: 1000,
      };

      const c1 = makeCommit({
        sha: '1'.repeat(40),
        sessionTrailers: ['live-session-1'],
        committerDate: 500, // before createdAt, but has trailer
      });

      const c2 = makeCommit({
        sha: '2'.repeat(40),
        committerDate: 1500, // after createdAt
      });

      const c3 = makeCommit({
        sha: '3'.repeat(40),
        committerDate: 800, // before createdAt, no trailer
      });

      const matched = commitsForLiveSession([c1, c2, c3], session);
      expect(matched.map((c) => c.sha)).toEqual(['1'.repeat(40), '2'.repeat(40)]);
    });

    it('returns empty when given a non-agent session', () => {
      const shellSession = {
        id: 'shell-live',
        kind: 'shell',
        agentId: undefined,
        createdAt: 1000,
      };

      expect(commitsForLiveSession([makeCommit()], shellSession)).toEqual([]);
    });

    it('rejects match when commit repoId differs from live session repoId', () => {
      const session = {
        id: 's-live',
        kind: 'agent',
        agentId: 'claude',
        repoId: 'repo-A',
        createdAt: 1000,
      };

      const commit = {
        ...makeCommit({ committerDate: 1500 }),
        repoId: 'repo-B',
      };

      expect(commitsForLiveSession([commit], session)).toEqual([]);
    });
  });
});

