import type { ForgeCliStatus } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppIssue, createAppIssueCommand, parseCreatedIssueUrl } from './gh-app-issue';

/**
 * The one write with no `Forge` — always `bilo-io/midnite-apps`, regardless
 * of which repo (if any) is open in the git client.
 *
 * `runInShell` is mocked; `shellQuote` is real, same discipline
 * `gh-write.test.ts` applies — the quoting is exactly the thing worth getting
 * right, and stubbing it would make the test agree with itself instead of
 * with the function that does the escaping.
 *
 * **No real issue is ever filed by this suite** — `bilo-io/midnite-apps` is a
 * public, currently-empty board, and posting a test issue to it would be
 * visible to anyone and impossible to take back. Every assertion here is
 * against the built command string or a mocked `runInShell` result.
 */

const { runInShell, ghStatus } = vi.hoisted(() => ({
  runInShell: vi.fn<
    (
      command: string,
      timeout: number,
      options?: { combine?: boolean },
    ) => Promise<{
      output: string;
      stdout: string;
      stderr: string;
      exitCode: number | null;
    }>
  >(),
  ghStatus: vi.fn<() => Promise<ForgeCliStatus>>(async () => ({
    reason: 'ready',
    binPath: '/usr/bin/gh',
    hint: '',
  })),
}));

vi.mock('./gh-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./gh-shell')>();
  return {
    ...actual,
    runInShell,
    ghStatus,
  };
});

beforeEach(() => {
  runInShell.mockReset();
  ghStatus.mockReset();
  ghStatus.mockResolvedValue({ reason: 'ready', binPath: '/usr/bin/gh', hint: '' });
});

describe('createAppIssueCommand', () => {
  it('always targets bilo-io/midnite-apps, via -R', () => {
    const command = createAppIssueCommand({
      title: 'The graph view is blank',
      body: 'Steps to reproduce…',
      labels: ['bug', 'app: midnite-studio'],
    });

    expect(command).toBe(
      "gh issue create -R 'bilo-io/midnite-apps'" +
        " --title 'The graph view is blank' --body 'Steps to reproduce…'" +
        " --label 'bug' --label 'app: midnite-studio'",
    );
  });

  it('quotes a title or body that carries a single quote, safely', () => {
    const command = createAppIssueCommand({
      title: "It won't open",
      body: "Nothing happens when I click 'Start'.",
      labels: ['enhancement'],
    });

    // shellQuote closes, escapes, and reopens the quote — never a bare `'`.
    expect(command).toContain("'It won'\\''t open'");
    expect(command).toContain("'Nothing happens when I click '\\''Start'\\''.'");
  });

  it('emits one --label flag per label, in order — never a joined list', () => {
    const command = createAppIssueCommand({
      title: 't',
      body: 'b',
      labels: ['enhancement', 'app: midnite-studio'],
    });

    expect(command).toMatch(/--label 'enhancement' --label 'app: midnite-studio'$/);
  });

  it('never emits the active repo’s slug — there is no forge to derive one from', () => {
    const command = createAppIssueCommand({ title: 't', body: 'b', labels: [] });
    expect(command).not.toContain('midnite-studio/issues');
    expect(command).toContain("-R 'bilo-io/midnite-apps'");
  });
});

describe('parseCreatedIssueUrl', () => {
  it('finds the URL gh issue create prints on success', () => {
    expect(parseCreatedIssueUrl('https://github.com/bilo-io/midnite-apps/issues/7\n')).toBe(
      'https://github.com/bilo-io/midnite-apps/issues/7',
    );
  });

  it('finds the URL even behind a banner line a shell rc might print', () => {
    expect(
      parseCreatedIssueUrl('Last login: Mon\nhttps://github.com/bilo-io/midnite-apps/issues/123\n'),
    ).toBe('https://github.com/bilo-io/midnite-apps/issues/123');
  });

  it('returns null rather than throwing when there is nothing to find', () => {
    expect(parseCreatedIssueUrl('')).toBeNull();
    expect(parseCreatedIssueUrl('no url here')).toBeNull();
  });
});

describe('createAppIssue', () => {
  it('creates a bug report with the bug label pair, returning the parsed url', async () => {
    runInShell.mockResolvedValue({
      output: 'https://github.com/bilo-io/midnite-apps/issues/9\n',
      stdout: 'https://github.com/bilo-io/midnite-apps/issues/9\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await createAppIssue({ title: '[bug] it crashed', body: 'diagnostics', kind: 'bug' });

    expect(result).toEqual({
      ok: true,
      cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
      error: null,
      url: 'https://github.com/bilo-io/midnite-apps/issues/9',
    });
    const command = runInShell.mock.calls[0]?.[0] ?? '';
    expect(command).toContain("--label 'bug' --label 'app: midnite-studio'");
    expect(command).not.toContain('enhancement');
  });

  it('creates a feature request with the enhancement label pair', async () => {
    runInShell.mockResolvedValue({
      output: 'https://github.com/bilo-io/midnite-apps/issues/10\n',
      stdout: 'https://github.com/bilo-io/midnite-apps/issues/10\n',
      stderr: '',
      exitCode: 0,
    });

    await createAppIssue({ title: '[feat] add dark mode', body: 'would love this', kind: 'feature' });

    const command = runInShell.mock.calls[0]?.[0] ?? '';
    expect(command).toContain("--label 'enhancement' --label 'app: midnite-studio'");
    expect(command).not.toContain("'bug'");
  });

  it('succeeds without a url when gh prints something the pattern misses', async () => {
    runInShell.mockResolvedValue({ output: 'ok, no url this time', stdout: 'ok, no url this time', stderr: '', exitCode: 0 });

    const result = await createAppIssue({ title: 't', body: 'b', kind: 'bug' });

    expect(result).toEqual({
      ok: true,
      cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
      error: null,
      url: null,
    });
  });

  it('reports a gh failure with its own words, never a generic string', async () => {
    runInShell.mockResolvedValue({
      output: 'HTTP 422: Validation Failed (https://api.github.com/repos/bilo-io/midnite-apps/issues)',
      stdout: '',
      stderr: 'HTTP 422: Validation Failed (https://api.github.com/repos/bilo-io/midnite-apps/issues)',
      exitCode: 1,
    });

    const result = await createAppIssue({ title: 't', body: 'b', kind: 'bug' });

    expect(result.ok).toBe(false);
    expect(result.url).toBeNull();
    expect(result.error).toContain('Validation Failed');
  });

  it('attempts nothing, and surfaces the probe result, when gh has no credential', async () => {
    ghStatus.mockResolvedValue({
      reason: 'not-authenticated',
      binPath: '/usr/bin/gh',
      hint: 'Run `gh auth login` in a terminal to see Actions and Reviews here.',
    });

    const result = await createAppIssue({ title: 't', body: 'b', kind: 'bug' });

    expect(runInShell).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      cli: {
        reason: 'not-authenticated',
        binPath: '/usr/bin/gh',
        hint: 'Run `gh auth login` in a terminal to see Actions and Reviews here.',
      },
      error: null,
      url: null,
    });
  });
});
