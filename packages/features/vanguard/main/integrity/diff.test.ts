import { integrityFileKey, matchIntegrityEntry, type IntegrityBaseline } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { diffIntegrity, integrityCandidates, integrityFingerprint } from './diff';
import type { WatchedFile } from './enumerate';

const file = (relPath: string, base: 'worktree' | 'git-dir' = 'worktree'): WatchedFile => ({
  key: integrityFileKey(base, relPath),
  base,
  relPath,
  absPath: `/r/${relPath}`,
  entry: matchIntegrityEntry('repo', base, relPath)!,
});

const HOOK = file('.githooks/pre-commit');
const KEY = HOOK.key;
const FP = integrityFingerprint('repo-1', KEY);

const baseline = (files: IntegrityBaseline['files']): IntegrityBaseline => ({
  version: 1,
  scopeId: 'repo-1',
  root: '/r',
  createdAt: 1,
  updatedAt: 1,
  files,
});

function run(prev: IntegrityBaseline | null, now: string | null, committed: boolean, files = [HOOK]) {
  const observed = new Map<string, string | null>(files.map((f) => [f.key, f.key === KEY ? now : 'x']));
  return diffIntegrity({
    scopeId: 'repo-1',
    root: '/r',
    baseline: prev,
    files,
    observed,
    committed: committed ? new Set([KEY]) : new Set(),
    fileFor: (key) => (key === KEY ? HOOK : undefined),
    now: 10,
  });
}

describe('diffIntegrity', () => {
  it('takes the first scan as the baseline and reports nothing', () => {
    const r = run(null, 'aa', false);
    expect(r.fresh).toBe(true);
    expect(r.changes).toEqual([]);
    expect(r.baseline.files[KEY]).toEqual({ hash: 'aa' });
  });

  it('reports nothing when nothing changed', () => {
    const r = run(baseline({ [KEY]: { hash: 'aa' } }), 'aa', false);
    expect(r.changes).toEqual([]);
    expect(r.resolved).toEqual([]);
  });

  it('reports an out-of-commit change once, keeping the trusted hash', () => {
    const r = run(baseline({ [KEY]: { hash: 'aa' } }), 'bb', false);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ kind: 'modified', before: 'aa', after: 'bb', fingerprint: FP });
    expect(r.baseline.files[KEY]).toEqual({ hash: 'aa', flagged: { hash: 'bb', at: 10, fingerprint: FP } });

    const again = run(r.baseline, 'bb', false);
    expect(again.changes).toEqual([]);
  });

  it('reports a further change to a flagged file against what was last seen', () => {
    const flagged = baseline({ [KEY]: { hash: 'aa', flagged: { hash: 'bb', at: 5, fingerprint: FP } } });
    const r = run(flagged, 'cc', false);
    expect(r.changes[0]).toMatchObject({ before: 'bb', after: 'cc' });
  });

  it('takes a committed change silently', () => {
    const r = run(baseline({ [KEY]: { hash: 'aa' } }), 'bb', true);
    expect(r.changes).toEqual([]);
    expect(r.baseline.files[KEY]).toEqual({ hash: 'bb' });
  });

  it('clears the flag and resolves the finding once the change is committed', () => {
    const flagged = baseline({ [KEY]: { hash: 'aa', flagged: { hash: 'bb', at: 5, fingerprint: FP } } });
    const r = run(flagged, 'bb', true);
    expect(r.changes).toEqual([]);
    expect(r.resolved).toEqual([FP]);
    expect(r.baseline.files[KEY]).toEqual({ hash: 'bb' });
  });

  it('resolves a flagged change that was reverted', () => {
    const flagged = baseline({ [KEY]: { hash: 'aa', flagged: { hash: 'bb', at: 5, fingerprint: FP } } });
    const r = run(flagged, 'aa', false);
    expect(r.changes).toEqual([]);
    expect(r.resolved).toEqual([FP]);
    expect(r.baseline.files[KEY]).toEqual({ hash: 'aa' });
  });

  it('reports a created and a deleted file', () => {
    const created = run(baseline({}), 'aa', false);
    expect(created.changes[0]).toMatchObject({ kind: 'created', before: null, after: 'aa' });
    const deleted = diffIntegrity({
      scopeId: 'repo-1',
      root: '/r',
      baseline: baseline({ [KEY]: { hash: 'aa' } }),
      files: [],
      observed: new Map(),
      committed: new Set(),
      fileFor: (key) => (key === KEY ? HOOK : undefined),
      now: 10,
    });
    expect(deleted.changes[0]).toMatchObject({ kind: 'deleted', before: 'aa', after: null });
  });

  it('forgets a key that left the watched set rather than reporting it', () => {
    const r = diffIntegrity({
      scopeId: 'repo-1',
      root: '/r',
      baseline: baseline({ 'worktree:gone.txt': { hash: 'aa' } }),
      files: [],
      observed: new Map(),
      committed: new Set(),
      fileFor: () => undefined,
      now: 10,
    });
    expect(r.changes).toEqual([]);
    expect(r.baseline.files).toEqual({});
  });
});

describe('integrityCandidates', () => {
  it('names changed and flagged keys only, and nothing on a fresh scope', () => {
    const observed = new Map<string, string | null>([
      ['worktree:a', 'same'],
      ['worktree:b', 'new'],
      ['worktree:c', 'flag'],
    ]);
    const prev = baseline({
      'worktree:a': { hash: 'same' },
      'worktree:b': { hash: 'old' },
      'worktree:c': { hash: 'x', flagged: { hash: 'flag', at: 1, fingerprint: 'f' } },
      'worktree:d': { hash: 'deleted' },
    });
    expect(integrityCandidates(prev, observed).sort()).toEqual(['worktree:b', 'worktree:c', 'worktree:d']);
    expect(integrityCandidates(null, observed)).toEqual([]);
  });
});
