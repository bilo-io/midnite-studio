import { describe, expect, it, vi } from 'vitest';

import type { Forge, ForgeIssue, WorkflowNode } from '@midnite/studio-shared';

import type { ForgeAdapter } from '../../forge/adapter';
import type { ExecutorContext } from '../executor-registry';
import {
  createForgeCommentExecutor,
  createForgeIssueExecutor,
  createGitStatusExecutor,
  parseForgeNumber,
  type ForgeExecutorDeps,
  type GitStatusExecutorDeps,
} from './git-forge';

function context(upstream: Record<string, unknown> = {}): ExecutorContext {
  return {
    upstream,
    signal: { cancelled: () => false },
    timeoutMs: 5_000,
    workflowId: 'w',
    runId: 'r',
    reportSessionId: async () => {},
    reportWaiting: async () => {},
  };
}

const CLI = { reason: 'ok' } as never;
const FORGE = { kind: 'github', host: 'github.com', owner: 'o', repo: 'r' } as unknown as Forge;

/** Only the three adapter methods these executors call — everything else is never reached. */
function fakeAdapter(over: Partial<ForgeAdapter>): ForgeAdapter {
  return over as ForgeAdapter;
}

function forgeDeps(adapter: ForgeAdapter | null): ForgeExecutorDeps & { resolveAdapter: ReturnType<typeof vi.fn> } {
  return { resolveAdapter: vi.fn(async () => (adapter ? { forge: FORGE, adapter } : null)) };
}

describe('the git-status executor', () => {
  const deps: GitStatusExecutorDeps = {
    resolveWorkdir: async (repoId) => (repoId === 'repo-1' ? '/src/app' : null),
    currentBranch: async () => 'main',
    revParse: async () => 'abc123',
    readStatusCounts: async () => ({
      staged: [{ path: 'a.ts', insertions: 1, deletions: 0 }],
      unstaged: [],
    }),
  };

  it('reads branch, HEAD and counts for a registered repository', async () => {
    const node: WorkflowNode = { id: 'g', label: 'Status', x: 0, y: 0, kind: 'git-status', config: { repoId: 'repo-1' } };
    expect(await createGitStatusExecutor(deps)(node, context())).toEqual({
      ok: true,
      output: { repoId: 'repo-1', path: '/src/app', branch: 'main', head: 'abc123', staged: 1, unstaged: 0, clean: false },
    });
  });

  it('names a repository that is not open', async () => {
    const node: WorkflowNode = { id: 'g', label: 'Status', x: 0, y: 0, kind: 'git-status', config: { repoId: 'gone' } };
    const outcome = await createGitStatusExecutor(deps)(node, context());
    expect(!outcome.ok && outcome.error).toContain('No open repository has the id "gone"');
  });

  it('turns a git failure into a node failure, never a throw', async () => {
    const node: WorkflowNode = { id: 'g', label: 'Status', x: 0, y: 0, kind: 'git-status', config: { repoId: 'repo-1' } };
    const broken = { ...deps, readStatusCounts: async () => Promise.reject(new Error('not a git repository')) };
    expect(await createGitStatusExecutor(broken)(node, context())).toEqual({
      ok: false,
      error: 'Could not read git status: not a git repository',
    });
  });
});

describe('parseForgeNumber', () => {
  it('accepts 42 and #42, nothing else', () => {
    expect(parseForgeNumber('42')).toBe(42);
    expect(parseForgeNumber(' #7 ')).toBe(7);
    expect(parseForgeNumber('0')).toBeNull();
    expect(parseForgeNumber('4x')).toBeNull();
    expect(parseForgeNumber('')).toBeNull();
  });
});

describe('the forge-comment executor', () => {
  function commentNode(config: Partial<Extract<WorkflowNode, { kind: 'forge-comment' }>['config']>): WorkflowNode {
    return {
      id: 'c',
      label: 'Comment',
      x: 0,
      y: 0,
      kind: 'forge-comment',
      config: { repoId: 'repo-1', target: 'pr', number: '{{trigger.number}}', body: 'Checked {{trigger.title}}', ...config },
    };
  }

  it('posts an interpolated comment on the PR through the adapter', async () => {
    const commentPull = vi.fn(async () => ({ ok: true, cli: CLI, error: null }));
    const deps = forgeDeps(fakeAdapter({ commentPull }));
    const outcome = await createForgeCommentExecutor(deps)(commentNode({}), context({ trigger: { number: 12, title: 'Fix' } }));
    expect(outcome).toEqual({ ok: true, output: { target: 'pr', number: 12 } });
    expect(deps.resolveAdapter).toHaveBeenCalledWith('repo-1');
    expect(commentPull).toHaveBeenCalledWith(FORGE, 12, 'Checked Fix');
  });

  it('comments on an issue when targeted at one', async () => {
    const commentIssue = vi.fn(async () => ({ ok: true, cli: CLI, error: null }));
    await createForgeCommentExecutor(forgeDeps(fakeAdapter({ commentIssue })))(
      commentNode({ target: 'issue', number: '3', body: 'hi' }),
      context(),
    );
    expect(commentIssue).toHaveBeenCalledWith(FORGE, 3, 'hi');
  });

  it('fails on a bad number, a repo with no forge, and a refused write', async () => {
    const commentPull = vi.fn(async () => ({ ok: false, cli: CLI, error: 'HTTP 403' }));
    const run = createForgeCommentExecutor(forgeDeps(fakeAdapter({ commentPull })));
    expect(await run(commentNode({ number: 'abc' }), context())).toEqual({ ok: false, error: '"abc" is not a PR number.' });
    expect(await run(commentNode({ number: '1', body: 'x' }), context())).toEqual({ ok: false, error: 'HTTP 403' });
    const noForge = await createForgeCommentExecutor(forgeDeps(null))(commentNode({ number: '1', body: 'x' }), context());
    expect(!noForge.ok && noForge.error).toContain('not an open repository with a supported forge remote');
  });
});

describe('the forge-issue executor', () => {
  const issueNode: WorkflowNode = {
    id: 'i',
    label: 'File',
    x: 0,
    y: 0,
    kind: 'forge-issue',
    config: { repoId: 'repo-1', title: 'Flaky: {{t.name}}', body: '', labels: ['bug'] },
  };

  it('creates the issue and hands its number and url on', async () => {
    const issue = { number: 99, url: 'https://github.com/o/r/issues/99', title: 'Flaky: login' } as ForgeIssue;
    const createIssue = vi.fn(async () => ({ ok: true as const, cli: CLI, issue }));
    const outcome = await createForgeIssueExecutor(forgeDeps(fakeAdapter({ createIssue })))(issueNode, context({ t: { name: 'login' } }));
    expect(outcome).toEqual({ ok: true, output: { number: 99, url: issue.url, title: 'Flaky: login' } });
    expect(createIssue).toHaveBeenCalledWith(FORGE, { title: 'Flaky: login', labels: ['bug'] });
  });

  it('passes the forge error through', async () => {
    const createIssue = vi.fn(async () => ({ ok: false as const, cli: CLI, error: 'label not found' }));
    expect(await createForgeIssueExecutor(forgeDeps(fakeAdapter({ createIssue })))(issueNode, context({ t: { name: 'x' } }))).toEqual({
      ok: false,
      error: 'label not found',
    });
  });
});
