import { describe, expect, it } from 'vitest';

import { attributeChange, type IntegrityLiveSession } from './attribution';

const sessions: IntegrityLiveSession[] = [
  { sessionId: 's1', agentId: 'claude', repoId: 'repo-1', cwd: '/r', title: 'refactor' },
  { sessionId: 's2', agentId: 'codex', repoId: 'repo-2', cwd: '/other' },
  { sessionId: 's3', repoId: 'repo-1', cwd: '/r' },
  { sessionId: 's4', agentId: 'gemini', cwd: '/r/packages/app' },
];

describe('attributeChange', () => {
  it('names the agent sessions live in the repo, never a plain shell', () => {
    const a = attributeChange(sessions, { scope: 'repo', repoId: 'repo-1', root: '/r' });
    expect(a.sessions.map((s) => s.sessionId)).toEqual(['s1', 's4']);
    expect(a.summary).toContain('"refactor" (claude, session s1)');
    expect(a.summary).toContain('best-effort');
  });

  it('counts any agent session for a home-dir file', () => {
    const a = attributeChange(sessions, { scope: 'user', root: '/home' });
    expect(a.sessions.map((s) => s.sessionId)).toEqual(['s1', 's2', 's4']);
  });

  it('says so when no agent session was live', () => {
    const a = attributeChange([sessions[2]!], { scope: 'repo', repoId: 'repo-1', root: '/r' });
    expect(a.sessions).toEqual([]);
    expect(a.summary).toMatch(/^No agent session was live in this repo/);
  });

  it("adds the audit trail's tool call when there is one", () => {
    const a = attributeChange(sessions, { scope: 'repo', repoId: 'repo-1', root: '/r' }, 'Write .githooks/pre-commit');
    expect(a.summary).toContain('names the tool call: Write .githooks/pre-commit');
  });
});
