import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXIT, decide, fetchChecks, main as ciWatch, tail } from './ci-watch.mjs';
import { main as prBody, sections, setSection } from './pr-body.mjs';
import { assemble, main as prContext } from './pr-context.mjs';
import { flatten, packageOf, plan, renderTable } from './scoped-check.mjs';

const chk = (name, bucket, extra = {}) => ({ name, bucket, state: bucket.toUpperCase(), link: 'https://github.com/o/r/actions/runs/77/job/1', startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:05:00Z', ...extra });
const open = { state: 'OPEN' };

describe('ci-watch decide', () => {
  it('green, pending, real failure', () => {
    expect(decide({ view: open, checks: [chk('a', 'pass')] })).toMatchObject({ done: true, code: EXIT.ok });
    expect(decide({ view: open, checks: [chk('a', 'pass'), chk('b', 'pending')] })).toMatchObject({ done: false });
    expect(decide({ view: open, checks: [chk('a', 'pass'), chk('b', 'fail')] })).toMatchObject({ done: true, code: EXIT.fail });
  });
  it('billing lock exits fast, even with pending jobs', () => {
    const fast = { startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:00:03Z' };
    expect(decide({ view: open, checks: [chk('a', 'fail', fast), chk('b', 'fail', fast)] })).toMatchObject({ code: EXIT.billing });
  });
  it('reruns a known flake once', () => {
    const checks = [chk('e2e browser-pane', 'fail'), chk('x', 'pass')];
    const d = decide({ view: open, checks, rerunFlakes: true });
    expect(d.rerun).toEqual(['77']);
    expect(decide({ view: open, checks, rerunFlakes: true, reran: new Set(['77']) }).code).toBeDefined();
  });
  it('handles merged/closed targets', () => {
    expect(decide({ view: { state: 'MERGED' }, checks: [], until: 'merged' }).code).toBe(EXIT.ok);
    expect(decide({ view: { state: 'CLOSED' }, checks: [], until: 'merged' }).code).toBe(EXIT.closed);
    expect(decide({ view: { state: 'MERGED' }, checks: [] }).code).toBe(EXIT.closed);
  });
  it('tail keeps the last 80 lines', () => {
    const t = tail(Array.from({ length: 200 }, (_, i) => `l${i}`).join('\n'));
    expect(t.split('\n')).toHaveLength(80);
    expect(t.endsWith('l199')).toBe(true);
  });
});

describe('ci-watch main', () => {
  const mk = (script) => {
    let i = 0;
    return async (args) => {
      const a = args.join(' ');
      if (a.startsWith('pr view')) return JSON.stringify({ state: 'OPEN' });
      if (a.startsWith('pr checks')) return JSON.stringify(script[Math.min(i++, script.length - 1)]);
      if (a.startsWith('run view')) return Array.from({ length: 100 }, (_, k) => `log${k}`).join('\n');
      return '';
    };
  };
  const base = { token: 't', sleep: async () => {}, log: () => {}, now: () => 0 };
  it('polls until green', async () => {
    expect(await ciWatch(['5', '--json'], { ...base, out: () => {}, ghRun: mk([[chk('a', 'pending')], [chk('a', 'pass')]]) })).toBe(EXIT.ok);
  });
  it('prints the failing log tail', async () => {
    let printed = '';
    const code = await ciWatch(['5'], { ...base, out: (s) => (printed += s), ghRun: mk([[chk('a', 'fail')]]) });
    expect(code).toBe(EXIT.fail);
    expect(printed).toContain('log99');
    expect(printed).not.toContain('log10\n');
  });
  it('times out', async () => {
    let t = 0;
    expect(await ciWatch(['5', '--timeout', '1'], { ...base, now: () => (t += 61_000), ghRun: mk([[chk('a', 'pending')]]) })).toBe(EXIT.timeout);
  });
  it('usage and help', async () => {
    expect(await ciWatch([], base)).toBe(EXIT.usage);
    expect(await ciWatch(['5', '--until', 'x'], base)).toBe(EXIT.usage);
  });
  it('fetchChecks reads stdout off a non-zero exit', async () => {
    const run = async () => {
      throw Object.assign(new Error('x'), { stdout: '[{"name":"a","bucket":"fail"}]', stderr: '' });
    };
    expect(await fetchChecks(1, { run, env: {}, repo: 'o/r' })).toHaveLength(1);
    const none = async () => {
      throw Object.assign(new Error('x'), { stderr: 'no checks reported on the branch' });
    };
    expect(await fetchChecks(1, { run: none, env: {}, repo: 'o/r' })).toEqual([]);
  });
});

describe('scoped-check', () => {
  const pkgs = {
    'packages/shared': { name: '@midnite/studio-shared', scripts: { test: 'vitest run' } },
    'packages/features/loops': { name: '@midnite/studio-feature-loops', scripts: { typecheck: 'tsc', test: 'vitest run' }, dependencies: { '@midnite/studio-shared': 'workspace:*' } },
  };
  const files = new Set([...Object.keys(pkgs).map((d) => `${d}/package.json`), 'packages/shared/tsconfig.json', 'packages/features/loops/tsconfig.json']);
  const exists = (p) => files.has(p);
  const readPkg = (d) => pkgs[d];
  it('finds the nearest package', () => {
    expect(packageOf('packages/features/loops/renderer/a.tsx', exists)).toBe('packages/features/loops');
    expect(packageOf('docs/x.md', exists)).toBeNull();
  });
  it('plans vitest on changed tests, tsc, eslint, and builds shared first for dependents', () => {
    const p = plan(['packages/features/loops/renderer/a.tsx', 'packages/features/loops/renderer/a.test.tsx', 'docs/x.md'], { exists, readPkg });
    expect(p.orphans).toEqual(['docs/x.md']);
    const ids = p.packages[0].steps.map((s) => s.id);
    expect(ids).toEqual(['build shared', 'vitest', 'tsc', 'eslint']);
    expect(p.packages[0].steps[1].cmd).toContain('renderer/a.test.tsx');
  });
  it('does not build shared for shared itself, and dedupes', () => {
    const p = plan(['packages/shared/a.ts', 'packages/features/loops/b.ts'], { exists, readPkg });
    expect(p.packages.find((x) => x.name === '@midnite/studio-shared').steps.map((s) => s.id)).not.toContain('build shared');
    expect(flatten(p).filter((s) => s.id === 'build shared')).toHaveLength(1);
  });
  it('never emits a workspace-wide command', () => {
    const p = plan(['packages/shared/a.ts'], { exists, readPkg });
    expect(JSON.stringify(flatten(p))).not.toMatch(/moon|:typecheck/);
  });
  it('--run executes sequentially and reports a table, failing on a non-zero step', async () => {
    const calls = [];
    let printed = '';
    const code = await (await import('./scoped-check.mjs')).main(['--run'], {
      root: '/r', git: (a) => (a.includes('HEAD') && a.length === 4 ? '' : 'packages/shared/a.ts\0'), exists, readPkg, out: (s) => (printed += s),
      spawn: async (s) => (calls.push(s.id), s.id === 'tsc' ? 1 : 0),
    });
    expect(code).toBe(1);
    expect(calls).toEqual(['vitest', 'tsc', 'eslint']);
    expect(printed).toContain('FAIL (1)');
    expect(renderTable([{ pkg: 'p', id: 'x', code: 0, seconds: 1 }])).toContain('pass');
  });
});

describe('pr-body', () => {
  const body = '## What\n\nold\n\n```md\n## Fake\n```\n\n## Self-review\n\nr1\n\n## Closes\n\nCloses #1\n';
  it('ignores headings inside fences', () => expect(sections(body.split('\n')).map((s) => s.title)).toEqual(['What', 'Self-review', 'Closes']));
  it('replaces one section and leaves the rest', () => {
    const out = setSection(body, 'Self-review', 'r2');
    expect(out).toContain('## Self-review\n\nr2\n');
    expect(out).toContain('old');
    expect(out).toContain('Closes #1');
    expect(out).not.toContain('r1');
  });
  it('is idempotent, for replace and append', () => {
    const once = setSection(body, 'Self-review', 'r2');
    expect(setSection(once, 'Self-review', 'r2')).toBe(once);
    const app = setSection(body, 'Self-review', 'r2', { append: true });
    expect(app).toContain('r1\nr2');
    expect(setSection(app, 'Self-review', 'r2', { append: true })).toBe(app);
  });
  it('adds a missing section at the end', () => expect(setSection('## A\n\nx\n', 'New', 'y')).toBe('## A\n\nx\n\n## New\n\ny\n'));
  it('main: dry-run prints, otherwise edits via --body-file only when changed', async () => {
    const calls = [];
    const ghRun = async (a) => (a[1] === 'view' ? JSON.stringify({ body }) : (calls.push(a), ''));
    let printed = '';
    const w = { token: 't', ghRun, writeFile: () => {} };
    const orig = process.stdout.write;
    process.stdout.write = (s) => ((printed += s), true);
    try {
      expect(await prBody(['3', '--set-section', 'Self-review', '--text', 'r2', '--dry-run'], w)).toBe(0);
      expect(calls).toHaveLength(0);
      expect(printed).toContain('r2');
      expect(await prBody(['3', '--set-section', 'Self-review', '--text', 'r2'], w)).toBe(0);
      expect(calls[0]).toContain('--body-file');
      expect(await prBody(['3', '--set-section', 'Self-review', '--text', 'r1'], w)).toBe(0);
      expect(calls).toHaveLength(1);
    } finally {
      process.stdout.write = orig;
    }
    expect(await prBody(['3'], w)).toBe(2);
  });
});

describe('pr-context', () => {
  const view = { number: 9, title: 't', url: 'u', state: 'OPEN', isDraft: true, headRefName: 'feature/x', baseRefName: 'main', author: { login: 'a' }, additions: 3, deletions: 1, changedFiles: 1, files: [{ path: 'f' }], reviews: [{ author: { login: 'r' }, state: 'COMMENTED', body: ' hi ' }], comments: [], labels: [{ name: 'l' }] };
  it('assembles worktree, dirt and ahead/behind', () => {
    const c = assemble({ view, checks: [chk('a', 'pass')], worktrees: [{ path: '/w', branch: 'feature/x', head: 'abc' }], status: ' M a.ts\n', counts: { ahead: 2, behind: 0 } });
    expect(c.worktree).toMatchObject({ path: '/w', dirty: true, dirtyFiles: [' M a.ts'] });
    expect(c).toMatchObject({ ahead: 2, behind: 0, reviews: [{ body: 'hi' }] });
    expect(assemble({ view, checks: [], worktrees: [], status: '', counts: {} }).worktree).toBeNull();
  });
  it('main resolves the PR from the branch', async () => {
    let printed = '';
    const ghRun = async (a) => {
      if (a[0] === 'pr' && a[1] === 'list') return JSON.stringify([{ number: 9 }]);
      if (a[1] === 'view') return JSON.stringify(view);
      return '[]';
    };
    const gitRun = async (a) => {
      if (a[0] === 'rev-parse') return 'feature/x\n';
      if (a[0] === 'worktree') return 'worktree /w\0HEAD abc\0branch refs/heads/feature/x\0\0';
      if (a[0] === 'rev-list') return '0\t2\n';
      return '';
    };
    expect(await prContext([], { token: 't', ghRun, gitRun, out: (s) => (printed += s) })).toBe(0);
    expect(JSON.parse(printed)).toMatchObject({ pr: { number: 9 }, ahead: 2, behind: 0, worktree: { path: '/w', dirty: false } });
  });
});

describe('push.sh guards', () => {
  const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  const script = join(import.meta.dirname, 'push.sh');
  const repo = () => {
    const d = mkdtempSync(join(tmpdir(), 'push-sh-'));
    sh(d, 'init', '-q', '-b', 'main');
    writeFileSync(join(d, 'a'), '1');
    sh(d, 'add', '.');
    sh(d, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'base');
    sh(d, 'branch', 'origin-main');
    sh(d, 'checkout', '-q', '-b', 'feature/t');
    return d;
  };
  const run = (d, ...a) => {
    try {
      return { code: 0, out: execFileSync('bash', [script, '--base', 'main', ...a], { cwd: d, encoding: 'utf8', stdio: 'pipe' }) };
    } catch (e) {
      return { code: e.status, err: String(e.stderr) };
    }
  };
  it('passes clean, refuses a trailer, refuses and fixes a tracked scratchpad', () => {
    const d = repo();
    writeFileSync(join(d, 'b'), '2');
    sh(d, 'add', '.');
    sh(d, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'one');
    expect(run(d, '--check').code).toBe(0);
    writeFileSync(join(d, 'c'), '3');
    sh(d, 'add', '.');
    sh(d, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'two\n\nCo-Authored-By: x <x@x>');
    expect(run(d, '--check')).toMatchObject({ code: 1 });
    sh(d, 'reset', '-q', '--hard', 'HEAD~1');
    writeFileSync(join(d, 'SCRATCHPAD.md'), 's');
    sh(d, 'add', '.');
    sh(d, '-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'oops');
    expect(run(d, '--check').code).toBe(1);
    expect(run(d, '--check', '--fix').code).toBe(0);
    expect(sh(d, 'ls-files')).not.toContain('SCRATCHPAD.md');
  });
  it('refuses main', () => {
    const d = repo();
    sh(d, 'checkout', '-q', 'main');
    expect(run(d, '--check').code).toBe(1);
  });
});
