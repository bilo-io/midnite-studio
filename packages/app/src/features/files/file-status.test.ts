import { describe, expect, it } from 'vitest';

import type { StatusEntry, StatusResult } from '@midnite/git-shared';

import { buildFileStatusIndex, resolveFileStatusIndex } from './file-status';

const entry = (overrides: Partial<StatusEntry> & { path: string }): StatusEntry => ({
  origPath: null,
  staged: 'unmodified',
  unstaged: 'unmodified',
  conflicted: false,
  similarity: null,
  ...overrides,
});

describe('buildFileStatusIndex', () => {
  it('joins by path, byte-identical, no normalisation', () => {
    const { byPath } = buildFileStatusIndex([entry({ path: 'src/app.ts', unstaged: 'modified' })]);
    expect(byPath.get('src/app.ts')).toEqual({ code: 'modified', conflicted: false });
    expect(byPath.get('src/App.ts')).toBeUndefined();
  });

  it('maps every achievable StatusCode to a distinct badge', () => {
    // `unmodified` never appears in `status.entries`, and `ignored` never does
    // either — `getStatus` runs with `--ignored=no`. The other eight are the
    // full set a real entry can carry.
    const codes = ['modified', 'added', 'deleted', 'renamed', 'copied', 'untracked', 'typeChanged'] as const;
    const { byPath } = buildFileStatusIndex(codes.map((code) => entry({ path: code, unstaged: code })));

    for (const code of codes) {
      expect(byPath.get(code)).toEqual({ code, conflicted: false });
    }
    const seen = new Set(codes.map((code) => byPath.get(code)?.code));
    expect(seen.size).toBe(codes.length);
  });

  it('renders a conflicted entry as its own badge regardless of code', () => {
    const { byPath } = buildFileStatusIndex([
      entry({ path: 'src/app.ts', unstaged: 'modified', conflicted: true }),
    ]);
    expect(byPath.get('src/app.ts')).toEqual({ code: 'modified', conflicted: true });
  });

  it('rolls up every literal ancestor directory, not just the immediate parent', () => {
    const { dirRollup } = buildFileStatusIndex([entry({ path: 'a/b/c/file.ts', unstaged: 'modified' })]);
    expect(dirRollup.get('a')).toEqual({ code: 'modified', conflicted: false });
    expect(dirRollup.get('a/b')).toEqual({ code: 'modified', conflicted: false });
    expect(dirRollup.get('a/b/c')).toEqual({ code: 'modified', conflicted: false });
  });

  it('picks the worst status across siblings under the same directory', () => {
    const { dirRollup } = buildFileStatusIndex([
      entry({ path: 'src/a.ts', unstaged: 'untracked' }),
      entry({ path: 'src/b.ts', unstaged: 'deleted' }),
      entry({ path: 'src/c.ts', unstaged: 'modified', conflicted: true }),
    ]);
    expect(dirRollup.get('src')).toEqual({ code: 'modified', conflicted: true });
  });

  it('does not collapse a single-child directory chain into one entry, unlike build-change-tree', () => {
    // A chain with exactly one child at every level (e.g. packages/desktop/src)
    // is exactly what build-change-tree.ts collapses into one row. A caller
    // walking file-tree.tsx's literal fs levels still needs "packages" and
    // "packages/desktop" to resolve on their own.
    const { dirRollup } = buildFileStatusIndex([
      entry({ path: 'packages/desktop/src/index.ts', unstaged: 'modified' }),
    ]);
    expect(dirRollup.has('packages')).toBe(true);
    expect(dirRollup.has('packages/desktop')).toBe(true);
    expect(dirRollup.has('packages/desktop/src')).toBe(true);
  });

  it('does not add a rollup entry for the file itself', () => {
    const { dirRollup } = buildFileStatusIndex([entry({ path: 'src/app.ts', unstaged: 'modified' })]);
    expect(dirRollup.has('src/app.ts')).toBe(false);
  });
});

describe('resolveFileStatusIndex', () => {
  const status: StatusResult = {
    branch: { head: 'main', oid: 'abc', upstream: null, ahead: 0, behind: 0, unborn: false, detached: false },
    entries: [entry({ path: 'src/app.ts', unstaged: 'modified' })],
    inProgress: null,
  };

  it('renders a placeholder as unknown, not as clean', () => {
    expect(resolveFileStatusIndex(status, true)).toBeUndefined();
  });

  it('builds the real index once status has actually answered', () => {
    const index = resolveFileStatusIndex(status, false);
    expect(index?.byPath.get('src/app.ts')).toEqual({ code: 'modified', conflicted: false });
  });

  it('treats missing data as an empty, real (not placeholder) status', () => {
    const index = resolveFileStatusIndex(undefined, false);
    expect(index?.byPath.size).toBe(0);
  });
});
