import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveVideoRoot } from './root-resolution';

const dirs = (...paths: string[]) => {
  const set = new Set(paths);
  return (path: string) => set.has(path);
};

describe('resolveVideoRoot (Phase 99 Theme D)', () => {
  it('1 — the repo itself, when it has the midnite-videos layout', () => {
    const r = resolveVideoRoot(
      { repoPath: '/r', globalRoot: '/g' },
      dirs('/r/video-editor', '/r/projects', '/r/.midnite/media/video'),
    );
    expect(r).toEqual({ root: '/r', source: 'repo', setupTarget: join('/r', '.midnite/media/video') });
  });

  it('needs both markers — a lone projects/ is not the layout', () => {
    const r = resolveVideoRoot({ repoPath: '/r', globalRoot: '/g' }, dirs('/r/projects'));
    expect(r.source).toBe('global');
  });

  it('2 — <repo>/.midnite/media/video when it exists', () => {
    const r = resolveVideoRoot({ repoPath: '/r', globalRoot: '/g' }, dirs('/r/.midnite/media/video'));
    expect(r).toMatchObject({ root: '/r/.midnite/media/video', source: 'repo-media' });
  });

  it('3 — the global root otherwise, and with no repo open', () => {
    expect(resolveVideoRoot({ repoPath: '/r', globalRoot: '/g' }, dirs())).toMatchObject({
      root: '/g',
      source: 'global',
    });
    expect(resolveVideoRoot({ repoPath: null, globalRoot: '/g' }, dirs())).toEqual({
      root: '/g',
      source: 'global',
      setupTarget: null,
    });
  });

  it('nothing resolves → null root, with the setup target named', () => {
    expect(resolveVideoRoot({ repoPath: '/r', globalRoot: null }, dirs())).toEqual({
      root: null,
      source: null,
      setupTarget: '/r/.midnite/media/video',
    });
  });
});
