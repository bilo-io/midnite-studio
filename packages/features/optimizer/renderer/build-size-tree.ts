/**
 * The path trie behind the Optimizer's tree views.
 *
 * A sibling of `components/build-change-tree.ts`, not a reuse of it: that one
 * sums insertions and deletions and is typed on `ChangedFile`, and widening it
 * to also sum bytes would give every Changes-panel row two fields it has no
 * value for. What the two genuinely share is the *shape* of the algorithm —
 * build, roll up on the way out, collapse single-child chains — which is
 * cheap to state twice and expensive to abstract over two different measures.
 *
 * Pure and tested on its own for the reason that file gives: a collapsing rule
 * and a roll-up sum both look plausible when they are off by one directory,
 * and no screenshot would catch it.
 *
 * The roll-up assumes **no item's path is an ancestor of another's** — an
 * ancestor would become a leaf beside a directory of the same path and its
 * bytes, which already include the descendant's, would be summed into the
 * parent twice. That assumption is the scanner's own invariant, not a hope:
 * `scan-service.ts` sizes a directory that matches a detector and does not
 * descend into it (its Decision 2). A future producer that broke it would
 * have to de-duplicate before calling this.
 */

/** The minimum a row must carry to be placed and summed. */
export type SizedItem = { path: string; bytes: number };

export type SizeFileNode<T extends SizedItem = SizedItem> = T & {
  kind: 'file';
  /** The last path segment — what the row shows. */
  name: string;
};

export type SizeDirNode<T extends SizedItem = SizedItem> = {
  kind: 'dir';
  /** One or more segments joined by `/` — a collapsed chain is one row. */
  name: string;
  /** Full path, the node's identity and its React key. */
  path: string;
  bytes: number;
  /** Subtree item count, so a collapsed directory can still say what is in it. */
  itemCount: number;
  children: SizeTreeNode<T>[];
};

export type SizeTreeNode<T extends SizedItem = SizedItem> = SizeFileNode<T> | SizeDirNode<T>;

/**
 * How siblings are ordered.
 *
 * `size-desc`/`size-asc` interleave directories and files — the question they
 * answer is "what is taking up the space", and hoisting every directory above
 * a file twice its size would answer a different one. `name` is the explorer
 * ordering: directories first, then files, both alphabetical, which is the
 * only ordering nobody has to learn.
 *
 * Ascending is a member here rather than a reverse applied by the caller: the
 * order is per level, and reversing a flattened tree would put a directory's
 * children before the directory.
 *
 * The member names match `StorageSort`'s (`storage-filter.ts`) deliberately,
 * so the Storage tab's three-way control reaches the tree without a mapping
 * step — the mapping is where "Smallest first" got silently dropped.
 */
export type SizeSort = 'size-desc' | 'size-asc' | 'name';

type Building<T extends SizedItem> = {
  segment: string;
  path: string;
  dirs: Map<string, Building<T>>;
  files: T[];
};

/** Locale-aware, numeric-aware compare — `phase-2` before `phase-10`. */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

export function buildSizeTree<T extends SizedItem>(
  items: readonly T[],
  sort: SizeSort = 'size-desc',
): SizeTreeNode<T>[] {
  const root: Building<T> = { segment: '', path: '', dirs: new Map(), files: [] };

  for (const item of items) {
    // Absolute paths arrive with a leading `/`, and a scan can hand back
    // `a//b` for an odd entry; an empty segment would create a nameless
    // directory row.
    const segments = item.path.split('/').filter((s) => s.length > 0);
    if (segments.length === 0) continue;

    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let next = node.dirs.get(segment);
      if (next === undefined) {
        next = {
          segment,
          path: node.path === '' ? `/${segment}` : `${node.path}/${segment}`,
          dirs: new Map(),
          files: [],
        };
        node.dirs.set(segment, next);
      }
      node = next;
    }
    node.files.push(item);
  }

  return finish(root, sort).children;
}

/**
 * Collapse, sum and sort one level.
 *
 * The collapse happens on the way *up*: `a → b → c` is only collapsible once
 * you know `a` and `b` each hold exactly one directory and no files of their
 * own, which is not knowable top-down.
 */
function finish<T extends SizedItem>(node: Building<T>, sort: SizeSort): SizeDirNode<T> {
  const dirs: SizeTreeNode<T>[] = [];
  const files: SizeTreeNode<T>[] = [];
  let bytes = 0;
  let itemCount = 0;

  for (const dir of node.dirs.values()) {
    let child: SizeDirNode<T> = finish(dir, sort);
    while (child.children.length === 1 && child.children[0]?.kind === 'dir') {
      const only = child.children[0];
      child = { ...only, name: `${child.name}/${only.name}` };
    }
    dirs.push(child);
    bytes += child.bytes;
    itemCount += child.itemCount;
  }

  for (const file of node.files) {
    const name = file.path.slice(file.path.lastIndexOf('/') + 1);
    files.push({ ...file, kind: 'file', name });
    bytes += file.bytes;
    itemCount += 1;
  }

  const children =
    sort === 'name'
      ? [
          ...dirs.sort((a, b) => compare(a.name, b.name)),
          ...files.sort((a, b) => compare(a.name, b.name)),
        ]
      : [...dirs, ...files].sort((a, b) =>
          sort === 'size-asc'
            ? a.bytes - b.bytes || compare(a.name, b.name)
            : b.bytes - a.bytes || compare(a.name, b.name),
        );

  return { kind: 'dir', name: node.segment, path: node.path, bytes, itemCount, children };
}
