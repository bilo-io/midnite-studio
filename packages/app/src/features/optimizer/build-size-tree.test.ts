import { describe, expect, it } from 'vitest';

import { buildSizeTree, type SizeDirNode } from './build-size-tree';

const item = (path: string, bytes: number) => ({ path, bytes });

const dir = <T extends { path: string; bytes: number }>(
  nodes: readonly ({ kind: 'dir' } | { kind: 'file' })[],
  index: number,
): SizeDirNode<T> => nodes[index] as unknown as SizeDirNode<T>;

describe('buildSizeTree', () => {
  it('rolls bytes and item counts up the tree', () => {
    const tree = buildSizeTree([
      item('/repos/app/node_modules', 300),
      item('/repos/app/dist', 100),
      item('/repos/api/target', 50),
    ]);

    // `/repos` is the only root, and it holds everything.
    expect(tree).toHaveLength(1);
    const repos = dir(tree, 0);
    expect(repos.name).toBe('repos');
    expect(repos.bytes).toBe(450);
    expect(repos.itemCount).toBe(3);
  });

  it('collapses a chain of single-child directories into one row', () => {
    const tree = buildSizeTree([item('/a/b/c/dist', 10)]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe('a/b/c');
    expect(tree[0]?.kind).toBe('dir');
  });

  it('stops collapsing where a directory holds more than one child', () => {
    const tree = buildSizeTree([item('/a/b/one', 10), item('/a/b/two', 20)]);

    expect(tree[0]?.name).toBe('a/b');
    expect(dir(tree, 0).children.map((child) => child.name)).toEqual(['two', 'one']);
  });

  it('orders siblings biggest-first under the size sort, interleaving dirs and files', () => {
    const tree = buildSizeTree([
      item('/root/small-dir/inner', 10),
      item('/root/big-file', 500),
      item('/root/mid-dir/inner', 100),
    ]);

    expect(dir(tree, 0).children.map((child) => child.name)).toEqual([
      'big-file',
      'mid-dir',
      'small-dir',
    ]);
  });

  it('orders siblings smallest-first under the ascending size sort', () => {
    const tree = buildSizeTree(
      [
        item('/root/small-dir/inner', 10),
        item('/root/big-file', 500),
        item('/root/mid-dir/inner', 100),
      ],
      'size-asc',
    );

    expect(dir(tree, 0).children.map((child) => child.name)).toEqual([
      'small-dir',
      'mid-dir',
      'big-file',
    ]);
  });

  it('orders directories before files, alphabetically, under the name sort', () => {
    const tree = buildSizeTree(
      [
        item('/root/zeta-dir/inner', 10),
        item('/root/alpha-file', 500),
        item('/root/beta-dir/inner', 100),
      ],
      'name',
    );

    expect(dir(tree, 0).children.map((child) => child.name)).toEqual([
      'beta-dir',
      'zeta-dir',
      'alpha-file',
    ]);
  });

  it('keeps the payload on the leaf so a row needs no re-join by path', () => {
    const tree = buildSizeTree([{ path: '/a/dist', bytes: 4, detectorId: 'node-dist' }]);
    const leaf = dir<{ path: string; bytes: number; detectorId: string }>(tree, 0).children[0];

    expect(leaf).toMatchObject({ kind: 'file', name: 'dist', detectorId: 'node-dist' });
  });

  it('drops an empty path rather than growing a nameless row', () => {
    expect(buildSizeTree([item('', 10), item('///', 20)])).toEqual([]);
  });

  it('tolerates a doubled separator', () => {
    const tree = buildSizeTree([item('/a//b', 10)]);
    expect(tree[0]?.name).toBe('a');
    expect(dir(tree, 0).children[0]?.name).toBe('b');
  });
});
