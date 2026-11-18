import { describe, expect, it } from 'vitest';

import { LOG_FORMAT, isTracked, logRange, parseLog, parseShortstat, parseWorktreeList, shortstat, worktreeList } from './git.mjs';

describe('parseShortstat', () => {
  it('parses all three counters', () => expect(parseShortstat(' 6 files changed, 210 insertions(+), 35 deletions(-)\n')).toEqual({ files: 6, added: 210, deleted: 35 }));
  it('handles singular and missing parts', () => {
    expect(parseShortstat(' 1 file changed, 1 insertion(+)')).toEqual({ files: 1, added: 1, deleted: 0 });
    expect(parseShortstat('')).toEqual({ files: 0, added: 0, deleted: 0 });
  });
});

describe('parseLog', () => {
  const rec = (sha, subject, body = '') => `${sha}\x00A N\x00a@b.c\x002026-01-01T00:00:00+02:00\x00${subject}\x00${body}\x00\x01`;
  it('keeps newlines, pipes and spaces inside subjects and bodies', () => {
    const out = parseLog(`${rec('aaa', 'fix: a | b  c', 'line1\nline2\n')}\n${rec('bbb', 'feat: x')}`);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ sha: 'aaa', subject: 'fix: a | b  c', body: 'line1\nline2', email: 'a@b.c' });
    expect(out[1].sha).toBe('bbb');
  });
  it('returns [] for empty output', () => expect(parseLog('')).toEqual([]));
});

describe('parseWorktreeList', () => {
  it('parses NUL-delimited porcelain records, including odd branch names and detached heads', () => {
    const text = ['worktree /r', 'HEAD abc', 'branch refs/heads/main', '', 'worktree /r/.worktrees/a b', 'HEAD def', 'detached', 'locked', '', ''].join('\x00');
    expect(parseWorktreeList(text)).toEqual([
      { path: '/r', head: 'abc', branch: 'main' },
      { path: '/r/.worktrees/a b', head: 'def', detached: true, locked: true },
    ]);
  });
});

describe('wrappers use injected runner with -z args', () => {
  it('shortstat / logRange / worktreeList / isTracked', async () => {
    const calls = [];
    const outs = [' 2 files changed, 3 insertions(+)', `x\x00n\x00e\x00d\x00s\x00b\x00\x01`, 'worktree /r\x00HEAD h\x00\x00', 'SCRATCHPAD.md\x00', ''];
    const run = async (args) => (calls.push(args), outs.shift());
    expect(await shortstat('main...HEAD', { run })).toEqual({ files: 2, added: 3, deleted: 0 });
    expect((await logRange('a..b', { run, max: 5 }))[0].sha).toBe('x');
    expect(calls[1]).toContain(`--format=${LOG_FORMAT}`);
    expect(await worktreeList({ run })).toHaveLength(1);
    expect(calls[2]).toEqual(['worktree', 'list', '--porcelain', '-z']);
    expect(await isTracked('SCRATCHPAD.md', { run })).toBe(true);
    expect(await isTracked('SCRATCHPAD.md', { run })).toBe(false);
    expect(calls[3]).toEqual(['ls-files', '-z', '--', 'SCRATCHPAD.md']);
  });
});
