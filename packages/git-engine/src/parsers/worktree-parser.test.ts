import { describe, expect, it } from 'vitest';

import { parseWorktrees } from './worktree-parser';

describe('parseWorktrees', () => {
  it('marks only the first record as the main worktree', () => {
    const payload = [
      'worktree /Users/x/repo',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      'worktree /Users/x/repo/.worktrees/feature',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/feature',
      '',
    ].join('\n');

    const worktrees = parseWorktrees(payload, 'repo-1');

    expect(worktrees.map((w) => [w.path, w.branch, w.isMain])).toEqual([
      ['/Users/x/repo', 'main', true],
      ['/Users/x/repo/.worktrees/feature', 'feature', false],
    ]);
  });

  it('builds a stable id from repo and path', () => {
    const [wt] = parseWorktrees('worktree /Users/x/repo\nHEAD abc\n', 'repo-1');
    expect(wt?.id).toBe('repo-1:/Users/x/repo');
  });

  it('leaves branch null on a detached worktree', () => {
    const payload = [
      'worktree /Users/x/repo',
      'HEAD 3333333333333333333333333333333333333333',
      'detached',
      '',
    ].join('\n');

    expect(parseWorktrees(payload, 'r')[0]?.branch).toBeNull();
  });

  it('reads the locked and prunable flags, with or without a reason', () => {
    const payload = [
      'worktree /Users/x/repo',
      'HEAD aaa',
      'branch refs/heads/main',
      '',
      'worktree /Users/x/wt/locked',
      'HEAD bbb',
      'branch refs/heads/locked',
      'locked on removable media',
      '',
      'worktree /Users/x/wt/gone',
      'HEAD ccc',
      'branch refs/heads/gone',
      'prunable',
      '',
    ].join('\n');

    const worktrees = parseWorktrees(payload, 'r');
    expect(worktrees[1]?.locked).toBe(true);
    expect(worktrees[2]?.prunable).toBe(true);
  });

  it('handles a bare main repo with no HEAD line', () => {
    const payload = ['worktree /Users/x/bare.git', 'bare', ''].join('\n');
    const [wt] = parseWorktrees(payload, 'r');

    expect(wt?.isMain).toBe(true);
    expect(wt?.headSha).toBeNull();
    expect(wt?.branch).toBeNull();
  });

  it('tolerates CRLF and a missing trailing blank line', () => {
    const payload = 'worktree /Users/x/repo\r\nHEAD aaa\r\nbranch refs/heads/main';
    expect(parseWorktrees(payload, 'r')).toHaveLength(1);
  });

  it('returns nothing for empty output', () => {
    expect(parseWorktrees('', 'r')).toEqual([]);
  });
});
