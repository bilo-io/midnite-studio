/**
 * The path trie behind every "here are the changed files" list.
 *
 * Pure, and tested on its own, because it is the part most likely to be quietly
 * wrong: the collapsing rule and the roll-up sums both produce plausible-looking
 * output when they are off by one directory, and neither is something a
 * screenshot would catch.
 *
 * Promoted out of the commit inspector once the Changes panel grew the same
 * tree ⇄ list choice. Generic over the row payload, so a caller can hang
 * whatever its own rows need — a status code, the staging actions — off each
 * file and get it back on the node rather than re-joining by path afterwards.
 */

/** The minimum a row must carry to be placed and summed. */
export type ChangedFile = {
  path: string;
  oldPath: string | null;
  insertions: number;
  deletions: number;
};

export type FileNode<T extends ChangedFile = ChangedFile> = T & {
  kind: 'file';
  /** The last path segment — what the row shows. */
  name: string;
};

export type DirNode<T extends ChangedFile = ChangedFile> = {
  kind: 'dir';
  /**
   * One or more segments joined by `/`. A chain of single-child directories
   * collapses into one row, so this is `packages/desktop/src` far more often
   * than it is one name.
   */
  name: string;
  /** Full path from the repo root — the node's identity, and its React key. */
  path: string;
  insertions: number;
  deletions: number;
  /** Subtree file count, so a collapsed directory can still say how much is in it. */
  fileCount: number;
  children: TreeNode<T>[];
};

export type TreeNode<T extends ChangedFile = ChangedFile> = FileNode<T> | DirNode<T>;

/** Mutable trie node; becomes a `DirNode` on the way out. */
type Building<T extends ChangedFile> = {
  segment: string;
  path: string;
  dirs: Map<string, Building<T>>;
  files: T[];
};

/**
 * Build the tree.
 *
 * Directories sort before files and both alphabetically, which is what every
 * file explorer does and therefore the only ordering nobody has to learn. The
 * *list* view is the one sorted by change size — see `flattenBySize`.
 */
export function buildChangeTree<T extends ChangedFile>(files: readonly T[]): TreeNode<T>[] {
  const root: Building<T> = { segment: '', path: '', dirs: new Map(), files: [] };

  for (const file of files) {
    // A path is NUL-safe but not segment-safe: git can emit `a//b` for an odd
    // index entry, and an empty segment would create a directory with no name.
    const segments = file.path.split('/').filter((s) => s.length > 0);
    if (segments.length === 0) continue;

    let node = root;
    for (const segment of segments.slice(0, -1)) {
      let next = node.dirs.get(segment);
      if (next === undefined) {
        next = {
          segment,
          path: node.path === '' ? segment : `${node.path}/${segment}`,
          dirs: new Map(),
          files: [],
        };
        node.dirs.set(segment, next);
      }
      node = next;
    }
    // `oldPath` is normalised here rather than trusted: it arrives over IPC,
    // where the preload validates requests but not responses, and `undefined`
    // reaching the row renders the rename marker on every unrenamed file.
    node.files.push({ ...file, oldPath: file.oldPath ?? null });
  }

  return finish(root).children;
}

/**
 * Collapse, sum and sort one level.
 *
 * Collapsing happens on the way *up*, after the children are final: a chain
 * `a → b → c` is only collapsible once you know `a` and `b` each have exactly
 * one child and no files of their own, and that is not knowable top-down.
 */
function finish<T extends ChangedFile>(node: Building<T>): DirNode<T> {
  const children: TreeNode<T>[] = [];
  let insertions = 0;
  let deletions = 0;
  let fileCount = 0;

  for (const dir of [...node.dirs.values()].sort((a, b) => compare(a.segment, b.segment))) {
    let child: DirNode<T> = finish(dir);

    // The collapse: a directory holding exactly one directory and no files of
    // its own is a step on the way somewhere, not a place. `packages` and
    // `packages/desktop` become one row rather than two indents of nothing.
    while (child.children.length === 1 && child.children[0]?.kind === 'dir') {
      const only = child.children[0];
      child = { ...only, name: `${child.name}/${only.name}` };
    }

    children.push(child);
    insertions += child.insertions;
    deletions += child.deletions;
    fileCount += child.fileCount;
  }

  for (const file of [...node.files].sort((a, b) => compare(a.path, b.path))) {
    const name = file.path.slice(file.path.lastIndexOf('/') + 1);
    children.push({ ...file, kind: 'file', name });
    insertions += file.insertions;
    deletions += file.deletions;
    fileCount += 1;
  }

  return {
    kind: 'dir',
    name: node.segment,
    path: node.path,
    insertions,
    deletions,
    fileCount,
    children,
  };
}

/**
 * Locale-aware, numeric-aware compare.
 *
 * `phase-2` before `phase-10` — plain string order puts `phase-10` first, which
 * in a repo whose docs are numbered is wrong on nearly every screen.
 */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Every file path in a directory's subtree, for a bulk action scoped to it. */
export function collectFilePaths<T extends ChangedFile>(node: DirNode<T>): string[] {
  const paths: string[] = [];
  const walk = (child: TreeNode<T>) => {
    if (child.kind === 'file') paths.push(child.path);
    else child.children.forEach(walk);
  };
  node.children.forEach(walk);
  return paths;
}

/**
 * The flat view: every file, biggest change first.
 *
 * This is the "what actually moved" ordering — a 4000-line lockfile churn and a
 * two-line fix are indistinguishable in a path-sorted tree, and the whole reason
 * to offer a second view is to answer that question in one glance. Ties fall
 * back to path so the order is stable across renders.
 */
export function flattenBySize<T extends ChangedFile>(files: readonly T[]): FileNode<T>[] {
  return [...files]
    .map((file) => ({
      ...file,
      oldPath: file.oldPath ?? null,
      kind: 'file' as const,
      name: file.path.slice(file.path.lastIndexOf('/') + 1),
    }))
    .sort((a, b) => {
      const size = b.insertions + b.deletions - (a.insertions + a.deletions);
      return size !== 0 ? size : compare(a.path, b.path);
    });
}
