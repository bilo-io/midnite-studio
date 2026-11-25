// worktree-lifecycle.sh sweep / scratchpads / remove against a throwaway repo (vitest/node; spawns git + bash only).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, 'worktree-lifecycle.sh');
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wtl-')));
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'init');
  mkdirSync(join(repo, '.worktrees'));
  const mk = (slug, { commit = false, pad = 'x' } = {}) => {
    const p = join(repo, '.worktrees', slug);
    git(repo, 'worktree', 'add', '-q', p, '-b', `feature/${slug}`, 'main');
    if (pad) writeFileSync(join(p, 'SCRATCHPAD.md'), pad);
    if (commit) {
      writeFileSync(join(p, 'new.txt'), 'n\n');
      git(p, 'add', 'new.txt');
      git(p, 'commit', '-qm', 'work');
    }
    return p;
  };
  // a gh that knows no PRs, so only ancestry decides
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const run = (...args) =>
    execFileSync('bash', [SCRIPT, ...args], { cwd: repo, encoding: 'utf8', env: { ...process.env, MIDNITE_WT_ROOT: repo, PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  return { root, repo, mk, run };
}

describe('worktree-lifecycle.sh', () => {
  it('sweep lists landed worktrees (ancestor of main) with size and dirty state, applies nothing by default', () => {
    const f = fixture();
    const landed = f.mk('landed');
    f.mk('open', { commit: true });
    const out = f.run('sweep');
    expect(out).toMatch(/^landed\tfeature\/landed\tmerged \(ancestor of main\)\t\d+ MB\tclean\t-$/m);
    expect(out).not.toMatch(/^open\t/m);
    expect(out).toMatch(/dry run/);
    expect(existsSync(landed)).toBe(true);
  });

  it('sweep --apply removes clean landed worktrees (scratchpad aside) and their branch, keeps dirty ones', () => {
    const f = fixture();
    const clean = f.mk('clean');
    const dirty = f.mk('dirty');
    writeFileSync(join(dirty, 'wip.txt'), 'wip\n');
    const out = f.run('sweep', '--apply');
    expect(out).toMatch(/^clean\t.*\tremoved \+ branch deleted$/m);
    expect(out).toMatch(/^dirty\t.*dirty \(1 files\)\tskipped \(dirty\)$/m);
    expect(out).toMatch(/freed \d+ MB/);
    expect(existsSync(clean)).toBe(false);
    expect(existsSync(dirty)).toBe(true);
    expect(git(f.repo, 'branch', '--list', 'feature/clean')).toBe('');
    expect(existsSync(f.repo)).toBe(true);
  });

  it('remove prints freed MB and works with an untracked SCRATCHPAD.md, never forcing a dirty tree', () => {
    const f = fixture();
    const a = f.mk('a');
    expect(f.run('remove', 'a')).toMatch(/removed .*\/a \(freed \d+ MB\)/);
    expect(existsSync(a)).toBe(false);
    const b = f.mk('b');
    writeFileSync(join(b, 'wip.txt'), 'wip\n');
    expect(() => f.run('remove', 'b')).toThrow();
    expect(existsSync(b)).toBe(true);
  });

  it('scratchpads lists slug, age, todo count and the Next line', () => {
    const f = fixture();
    f.mk('p', { pad: '## Next\n\n- ship the thing\n\n## Todo\n- [x] one\n- [ ] two\n' });
    f.mk('q', { pad: null });
    const out = f.run('scratchpads');
    expect(out).toMatch(/^p\t\d+s\ttodo 1\/2\tnext: ship the thing$/m);
    expect(out).not.toMatch(/^q\t/m);
  });
});
