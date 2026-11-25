// Worktree sitrep rows: parsers and the gather with mocked git/gh/fs (vitest/node, nothing spawned).
import { describe, expect, it } from 'vitest';

import { addStats, gatherWorktrees, parseNext, parseTodo, stallCheck, worktreeProgress } from './worktrees.mjs';
import { gather, worktreesDir } from '../sitrep.mjs';

const MD = `## Brief\nx\n\n## Next\n\n- wire the cap flags\n\n## Todo\n- [x] one\n- [ ] two\n- [ ] three\n- [ ]\n`;

describe('parsers', () => {
  it('parseTodo counts real items only', () => {
    expect(parseTodo(MD)).toEqual({ ticked: 1, total: 3, firstOpen: 'two' });
    expect(parseTodo('no todo here')).toEqual({ ticked: 0, total: 0, firstOpen: null });
  });
  it('parseNext takes the first non-blank line', () => {
    expect(parseNext(MD)).toBe('wire the cap flags');
    expect(parseNext('## Brief\nx')).toBeNull();
  });
  it('progress = 10 + 40 x ticked/total, rounded to 10', () => {
    expect(worktreeProgress({ ticked: 0, total: 8 })).toBe(10);
    expect(worktreeProgress({ ticked: 4, total: 8 })).toBe(30);
    expect(worktreeProgress({ ticked: 8, total: 8 })).toBe(50);
    expect(worktreeProgress({ ticked: 1, total: 3 })).toBe(20);
    expect(worktreeProgress({ ticked: 0, total: 0 })).toBe(10);
  });
  it('stallCheck flags the second identical signature', () => {
    const a = stallCheck(undefined, '1/3@abc', 0);
    expect(a.stalled).toBe(false);
    expect(stallCheck(a.state, '1/3@abc', 1000).stalled).toBe(false); // too soon after the first sighting
    expect(stallCheck(a.state, '1/3@abc', 10 * 60000).stalled).toBe(true);
    expect(stallCheck(a.state, '2/3@abc', 10 * 60000).stalled).toBe(false);
  });
  it('addStats sums', () => {
    expect(addStats({ files: 1, added: 2, deleted: 3 }, { files: 1, added: 1, deleted: 0 })).toEqual({ files: 2, added: 3, deleted: 3 });
  });
});

const fakeGit = (head = 'aaa') => async (args) => {
  if (args[0] === 'symbolic-ref') return 'feature/x\n';
  if (args[0] === 'rev-parse') return `${head}\n`;
  if (args.includes('origin/main...HEAD')) return ' 2 files changed, 10 insertions(+), 1 deletion(-)\n';
  return ' 1 file changed, 5 insertions(+)\n';
};
const files = { '/w/a/SCRATCHPAD.md': MD, '/w/b/SCRATCHPAD.md': MD };
const opts = (over = {}) => ({
  dir: '/w',
  list: () => ['a', 'b', 'c'],
  read: (p) => {
    if (!(p in files)) throw new Error('ENOENT');
    return files[p];
  },
  run: fakeGit(),
  gh: async (args, { cwd }) => (cwd.endsWith('/b') ? '[{"number":5}]' : '[]'),
  statePath: null,
  ...over,
});

describe('gatherWorktrees', () => {
  it('skips dirs without a scratchpad and branches that already have a PR', async () => {
    const rows = await gatherWorktrees(opts());
    expect(rows.map((r) => r.task)).toEqual(['a']);
    expect(rows[0]).toMatchObject({ progress: 20, additions: 15, deletions: 1, changedFiles: 3, note: 'two', status: '🚧 building' });
  });
  it('merges with PR rows through gather and honours --worktrees-only', async () => {
    const both = await gather(['--worktrees', '/w'], { run: async () => '[{"number":1}]', wt: opts() });
    expect(both.map((r) => r.number ?? r.task)).toEqual([1, 'a']);
    const only = await gather(['--worktrees', '/w', '--worktrees-only'], { wt: opts() });
    expect(only.map((r) => r.task)).toEqual(['a']);
  });
  it('worktreesDir: optional dir argument', () => {
    expect(worktreesDir(['table'])).toBeNull();
    expect(worktreesDir(['--worktrees', '/x'])).toBe('/x');
    expect(worktreesDir(['--worktrees', '--json'], '/cwd')).toBe('/cwd/.worktrees');
  });
});
