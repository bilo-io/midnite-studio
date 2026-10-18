// vitest: Studio's PR-comment host over a mock bridge — no forge CLI, no network, no browser pane.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appQueryClient } from '../services/query-client';
import { useUiStore } from '../store/ui-store';
import { STUDIO_CAPTURE_HOST, STUDIO_CAPTURE_PR_COMMENT } from './capture-host';

const mocks = vi.hoisted(() => ({
  pulls: vi.fn(),
  open: vi.fn(),
}));

vi.mock('../services/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/bridge')>()),
  bridge: () => ({ forge: { pulls: mocks.pulls } }),
}));
vi.mock('../services/open-in-midnite', () => ({ openInMidnite: mocks.open }));

const ready = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };

beforeEach(() => {
  appQueryClient.clear();
  mocks.pulls.mockReset();
  mocks.open.mockReset();
});
afterEach(() => useUiStore.setState({ selectedRepoId: null }));

describe('STUDIO_CAPTURE_PR_COMMENT', () => {
  it('is the host the capture feature is given', () => {
    expect(STUDIO_CAPTURE_HOST.prComment).toBe(STUDIO_CAPTURE_PR_COMMENT);
  });

  it('reads the selected repository at call time', () => {
    useUiStore.setState({ selectedRepoId: null });
    expect(STUDIO_CAPTURE_PR_COMMENT.repo()).toBeNull();
    useUiStore.setState({ selectedRepoId: 'repo:/tmp/x' });
    expect(STUDIO_CAPTURE_PR_COMMENT.repo()?.id).toBe('repo:/tmp/x');
  });

  it("lists the repo's open PRs through the forge's own query, cached like useForgePulls", async () => {
    mocks.pulls.mockResolvedValue({
      cli: ready,
      pulls: [{ number: 7, title: 'Fix', url: 'https://github.com/o/r/pull/7', author: 'x' }],
      error: null,
    });
    const first = await STUDIO_CAPTURE_PR_COMMENT.pulls('repo:/tmp/x');
    expect(first).toEqual({
      ok: true,
      pulls: [{ number: 7, title: 'Fix', url: 'https://github.com/o/r/pull/7' }],
    });
    expect(mocks.pulls).toHaveBeenCalledWith({
      repoId: 'repo:/tmp/x',
      limit: 20,
      state: 'open',
      scope: 'all',
    });
    await STUDIO_CAPTURE_PR_COMMENT.pulls('repo:/tmp/x');
    expect(mocks.pulls).toHaveBeenCalledTimes(1);
  });

  it('says why when the forge CLI cannot list them', async () => {
    mocks.pulls.mockResolvedValue({
      cli: { reason: 'not-authenticated', binPath: '/usr/bin/gh', hint: 'gh auth login' },
      pulls: [],
      error: null,
    });
    expect(await STUDIO_CAPTURE_PR_COMMENT.pulls('repo:/tmp/y')).toEqual({
      ok: false,
      message: 'The forge CLI is not signed in — gh auth login.',
    });
  });

  it('opens the PR page in the embedded browser, grouped under its repository', () => {
    STUDIO_CAPTURE_PR_COMMENT.open({
      repoId: 'repo:/tmp/x',
      url: 'https://github.com/o/r/pull/7#new_comment_field',
    });
    expect(mocks.open).toHaveBeenCalledWith('https://github.com/o/r/pull/7#new_comment_field', {
      target: 'in-app',
      originRepoId: 'repo:/tmp/x',
    });
  });
});
