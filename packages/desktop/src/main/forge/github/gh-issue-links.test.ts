import type { Forge } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { linkIssues, unlinkIssues } from './gh-issue-links';

/* Same arrangement `gh-write.test.ts`/`gh-project-write.test.ts` use. */
const { runInShell } = vi.hoisted(() => ({
  runInShell: vi.fn<
    (
      command: string,
      timeout: number,
      options?: { combine?: boolean },
    ) => Promise<{ output: string; stdout: string; stderr: string; exitCode: number | null }>
  >(),
}));

vi.mock('./gh-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gh-shell')>();
  return {
    ...actual,
    runInShell,
    ghStatus: vi.fn(async () => ({ reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' })),
    invalidateGhProbe: vi.fn(),
  };
});

const forge: Forge = { kind: 'github', host: 'github.com', owner: 'acme', repo: 'widgets' };

const issueView = (id: string) => ({
  output: JSON.stringify({
    id,
    number: 1,
    title: 'x',
    state: 'open',
    author: { login: 'a' },
    labels: [],
    assignees: [],
    updatedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    url: 'https://github.com/acme/widgets/issues/1',
    milestone: null,
    body: '',
  }),
  stdout: '',
  stderr: '',
  exitCode: 0,
});

const mutationOk = (field: string) => ({
  output: JSON.stringify({ data: { [field]: { issue: { id: 'I_1' } } } }),
  stdout: '',
  stderr: '',
  exitCode: 0,
});

beforeEach(() => {
  runInShell.mockReset();
});

describe('linkIssues', () => {
  it('resolves both issue node ids first, then sends addBlockedBy', async () => {
    runInShell
      .mockResolvedValueOnce(issueView('I_source'))
      .mockResolvedValueOnce(issueView('I_target'))
      .mockResolvedValueOnce(mutationOk('addBlockedBy'));

    const result = await linkIssues(forge, { kind: 'blockedBy', number: 1, targetNumber: 2 });

    expect(runInShell).toHaveBeenCalledTimes(3);
    const mutationCommand = runInShell.mock.calls[2]?.[0] ?? '';
    expect(mutationCommand).toContain('addBlockedBy');
    expect(mutationCommand).toContain('"issueId":"I_source"');
    expect(mutationCommand).toContain('"blockedByIssueId":"I_target"');
    expect(result).toEqual({ ok: true, cli: expect.anything(), error: null, via: 'api' });
  });

  it('addSubIssue names its two ids issueId/subIssueId, not issueId/blockedByIssueId', async () => {
    runInShell
      .mockResolvedValueOnce(issueView('I_parent'))
      .mockResolvedValueOnce(issueView('I_child'))
      .mockResolvedValueOnce(mutationOk('addSubIssue'));

    await linkIssues(forge, { kind: 'subIssue', number: 1, targetNumber: 2 });

    const mutationCommand = runInShell.mock.calls[2]?.[0] ?? '';
    expect(mutationCommand).toContain('addSubIssue');
    expect(mutationCommand).toContain('"subIssueId":"I_child"');
    expect(mutationCommand).not.toContain('blockedByIssueId');
  });

  it('resolves a cross-repo target against its own owner/name, not the source repo', async () => {
    runInShell
      .mockResolvedValueOnce(issueView('I_source'))
      .mockResolvedValueOnce(issueView('I_target'))
      .mockResolvedValueOnce(mutationOk('addBlockedBy'));

    await linkIssues(forge, { kind: 'blockedBy', number: 1, targetNumber: 9, targetRepo: 'acme/other' });

    // The second `gh issue view` call resolves the target — it must be built
    // against the foreign repo, not the source one.
    expect(runInShell.mock.calls[1]?.[0]).toContain("--repo 'acme/other'");
  });

  it('reports a failure envelope, never a throw, when a node id cannot be resolved', async () => {
    runInShell
      .mockResolvedValueOnce({ output: 'not found', stdout: '', stderr: '', exitCode: 1 })
      .mockResolvedValueOnce(issueView('I_target'));

    const result = await linkIssues(forge, { kind: 'blockedBy', number: 1, targetNumber: 2 });

    expect(result.ok).toBe(false);
    // No mutation is attempted once resolution has already failed.
    expect(runInShell).toHaveBeenCalledTimes(2);
  });
});

describe('unlinkIssues', () => {
  it('sends removeBlockedBy / removeSubIssue — the inverse mutation names', async () => {
    runInShell
      .mockResolvedValueOnce(issueView('I_source'))
      .mockResolvedValueOnce(issueView('I_target'))
      .mockResolvedValueOnce(mutationOk('removeBlockedBy'));

    const result = await unlinkIssues(forge, { kind: 'blockedBy', number: 1, targetNumber: 2 });

    expect(runInShell.mock.calls[2]?.[0]).toContain('removeBlockedBy');
    expect(result).toMatchObject({ ok: true, via: 'api' });
  });
});
