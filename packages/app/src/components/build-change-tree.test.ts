import { describe, expect, it } from 'vitest';

import {
  buildChangeTree,
  collectFilePaths,
  flattenBySize,
  type ChangedFile,
  type DirNode,
} from './build-change-tree';

const file = (path: string, insertions = 1, deletions = 0): ChangedFile => ({
  path,
  oldPath: null,
  insertions,
  deletions,
});

/** Directory rows, by their displayed name — what the collapsing assertions read. */
const dirNames = (nodes: ReturnType<typeof buildChangeTree>): string[] =>
  nodes.filter((n): n is DirNode => n.kind === 'dir').map((n) => n.name);

describe('buildChangeTree', () => {
  it('collapses a chain of single-child directories into one row', () => {
    // The screenshot case: `packages / desktop / scripts` is one row, not three
    // indents of nothing.
    const tree = buildChangeTree([file('packages/desktop/scripts/afterpack.cjs')]);
    expect(dirNames(tree)).toEqual(['packages/desktop/scripts']);
    expect((tree[0] as DirNode).children.map((c) => c.name)).toEqual(['afterpack.cjs']);
  });

  it('stops collapsing where the tree branches', () => {
    const tree = buildChangeTree([
      file('packages/app/src/a.ts'),
      file('packages/desktop/src/b.ts'),
    ]);
    expect(dirNames(tree)).toEqual(['packages']);

    const packages = tree[0] as DirNode;
    expect(dirNames(packages.children)).toEqual(['app/src', 'desktop/src']);
  });

  it('does not collapse a directory that holds a file of its own', () => {
    const tree = buildChangeTree([file('packages/README.md'), file('packages/app/src/a.ts')]);
    expect(dirNames(tree)).toEqual(['packages']);

    const packages = tree[0] as DirNode;
    expect(packages.children.map((c) => c.name)).toEqual(['app/src', 'README.md']);
  });

  it('rolls subtree totals up into every directory row', () => {
    const tree = buildChangeTree([
      file('packages/app/a.ts', 10, 2),
      file('packages/app/b.ts', 5, 1),
      file('docs/c.md', 1, 1),
    ]);

    const packages = tree.find((n) => n.name === 'packages/app') as DirNode;
    expect(packages.insertions).toBe(15);
    expect(packages.deletions).toBe(3);
    expect(packages.fileCount).toBe(2);

    const docs = tree.find((n) => n.name === 'docs') as DirNode;
    expect(docs.fileCount).toBe(1);
  });

  it('puts directories before files at every level', () => {
    const tree = buildChangeTree([file('README.md'), file('src/a.ts')]);
    expect(tree.map((n) => n.kind)).toEqual(['dir', 'file']);
  });

  it('sorts numerically, so phase-2 precedes phase-10', () => {
    const tree = buildChangeTree([
      file('todo/phase-10.md'),
      file('todo/phase-2.md'),
      file('todo/phase-1.md'),
    ]);
    const todo = tree[0] as DirNode;
    expect(todo.children.map((c) => c.name)).toEqual([
      'phase-1.md',
      'phase-2.md',
      'phase-10.md',
    ]);
  });

  it('handles a path that is both a file and another path’s directory prefix', () => {
    // `src` is a directory AND `src.ts` is a file beside it; a trie keyed on the
    // raw prefix rather than on segments merges the two.
    const tree = buildChangeTree([file('src.ts'), file('src/a.ts')]);
    expect(dirNames(tree)).toEqual(['src']);
    expect(tree.filter((n) => n.kind === 'file').map((n) => n.name)).toEqual(['src.ts']);
  });

  it('carries oldPath through, so a renamed file can still be diffed', () => {
    const renamed: ChangedFile = { ...file('b/new.ts'), oldPath: 'a/old.ts' };
    const tree = buildChangeTree([renamed]);
    const node = (tree[0] as DirNode).children[0];
    expect(node?.kind === 'file' && node.oldPath).toBe('a/old.ts');
  });

  it('survives a path with an empty segment', () => {
    // git can emit `a//b` for an odd index entry; an empty segment would
    // otherwise create a directory row with no name.
    const tree = buildChangeTree([file('a//b.ts')]);
    expect(dirNames(tree)).toEqual(['a']);
  });

  it('returns nothing for no files', () => {
    expect(buildChangeTree([])).toEqual([]);
  });

  it('keeps a root-level file at the root', () => {
    const tree = buildChangeTree([file('CLAUDE.md')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: 'file', name: 'CLAUDE.md', path: 'CLAUDE.md' });
  });
});

describe('collectFilePaths', () => {
  it('collects every file under a directory, however deep', () => {
    const tree = buildChangeTree([
      file('src/a.ts'),
      file('src/nested/b.ts'),
      file('other/c.ts'),
    ]);
    const src = tree.find((n) => n.name === 'src') as DirNode;
    expect(collectFilePaths(src).sort()).toEqual(['src/a.ts', 'src/nested/b.ts']);
  });

  it('does not collapse a chain of directories away — a middle segment still finds its files', () => {
    const tree = buildChangeTree([file('a/b/c/d.ts'), file('a/b/c/e.ts')]);
    // The chain collapses into one row named "a/b/c"; the files are still there.
    const collapsed = tree[0] as DirNode;
    expect(collectFilePaths(collapsed).sort()).toEqual(['a/b/c/d.ts', 'a/b/c/e.ts']);
  });
});

describe('flattenBySize', () => {
  it('puts the biggest change first, whatever its path', () => {
    const out = flattenBySize([
      file('a/small.ts', 1, 1),
      file('z/huge.lock', 4000, 0),
      file('m/medium.ts', 10, 5),
    ]);
    expect(out.map((f) => f.name)).toEqual(['huge.lock', 'medium.ts', 'small.ts']);
  });

  it('counts deletions towards the size, not just insertions', () => {
    const out = flattenBySize([file('a.ts', 1, 0), file('b.ts', 0, 50)]);
    expect(out[0]?.name).toBe('b.ts');
  });

  it('breaks ties on path so the order is stable', () => {
    const out = flattenBySize([file('b.ts', 1, 1), file('a.ts', 1, 1)]);
    expect(out.map((f) => f.name)).toEqual(['a.ts', 'b.ts']);
  });
});
