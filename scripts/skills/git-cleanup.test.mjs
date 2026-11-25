// midnite-git-cleanup/cleanup.sh against a throwaway repo with a fake `gh` (vitest/node; spawns only git + sh).
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, '../../.agents/skills/midnite-git-cleanup/cleanup.sh');
const MIRROR = join(import.meta.dirname, '../../.claude/skills/midnite-git-cleanup/cleanup.sh');

const sh = (cwd, cmd, env = {}) => execFileSync('sh', ['-c', cmd], { cwd, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cleanup-')));
  const origin = join(root, 'origin.git');
  const repo = join(root, 'repo');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, repo);
  git(repo, 'checkout', '-q', '-b', 'main');
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'init');
  git(repo, 'push', '-q', '-u', 'origin', 'main');
  // a two-commit branch, then a squash merge: neither ancestor nor patch-equivalent
  git(repo, 'checkout', '-q', '-b', 'feature/sq');
  for (const n of ['1', '2']) {
    writeFileSync(join(repo, `f${n}.txt`), `${n}\n`);
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', `f${n}`);
  }
  const tip = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', 'main');
  git(repo, 'merge', '-q', '--squash', 'feature/sq');
  git(repo, 'commit', '-qm', 'squash');
  git(repo, 'push', '-q', 'origin', 'main');
  const bin = join(root, 'bin');
  sh(root, `mkdir -p ${bin}`);
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh
[ "$1" = auth ] && exit 0
case "$*" in
  *--head*) printf '7\\t%s\\n' "$FAKE_OID" ;;
  *) : ;;
esac
`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  return { root, repo, tip, env: { PATH: `${bin}:${process.env.PATH}`, FAKE_OID: tip } };
}

describe('cleanup.sh', () => {
  it('the two skill mirrors are byte-identical', () => {
    expect(readFileSync(SCRIPT, 'utf8')).toBe(readFileSync(MIRROR, 'utf8'));
  });

  it('dry run recognises a squash-merged local branch through the merged-PR lookup and changes nothing', () => {
    const f = fixture();
    const out = sh(f.repo, `sh ${SCRIPT}`, f.env);
    expect(out).toMatch(/STALE \(fully landed/);
    expect(out).toMatch(/feature\/sq\s+merged via PR #7/);
    expect(git(f.repo, 'branch', '--list', 'feature/sq')).toContain('feature/sq');
  });

  it('keeps it when the PR tip differs from the local tip', () => {
    const f = fixture();
    const out = sh(f.repo, `sh ${SCRIPT}`, { ...f.env, FAKE_OID: '0'.repeat(40) });
    expect(out).toMatch(/KEEPING[\s\S]*feature\/sq\s+PR #7 merged, but local tip has moved/);
  });

  it('without gh the squash-merged branch is kept (ancestry/cherry cannot see it)', () => {
    const f = fixture();
    const out = sh(f.repo, `sh ${SCRIPT} --no-remote`, f.env);
    expect(out).toMatch(/KEEPING[\s\S]*feature\/sq\s+2 unique change/);
  });

  it('--apply clears a worktree whose only dirt is SCRATCHPAD.md, then deletes the branch', () => {
    const f = fixture();
    const wt = join(f.root, 'wt-sq');
    git(f.repo, 'worktree', 'add', '-q', wt, 'feature/sq');
    writeFileSync(join(wt, 'SCRATCHPAD.md'), 'notes\n');
    const out = sh(f.repo, `sh ${SCRIPT} --apply`, f.env);
    expect(out).toMatch(/removed worktree/);
    expect(existsSync(wt)).toBe(false);
    expect(git(f.repo, 'branch', '--list', 'feature/sq')).toBe('');
  });

  it('a worktree with other dirt stays BLOCKED and is never forced', () => {
    const f = fixture();
    const wt = join(f.root, 'wt-sq');
    git(f.repo, 'worktree', 'add', '-q', wt, 'feature/sq');
    writeFileSync(join(wt, 'SCRATCHPAD.md'), 'notes\n');
    writeFileSync(join(wt, 'real.txt'), 'work\n');
    const out = sh(f.repo, `sh ${SCRIPT} --apply`, f.env);
    expect(out).toMatch(/BLOCKED/);
    expect(existsSync(join(wt, 'real.txt'))).toBe(true);
  });
});
