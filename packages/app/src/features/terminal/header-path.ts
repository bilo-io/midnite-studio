import { collapseHome } from './collapse-home';
import type { ResolvedRepoPath } from './resolve-repo-for-path';

export type HeaderPathParts = {
  /** Ancestors, `~`-collapsed. Gives way first when the row runs out of width. */
  head: string;
  /** The part you navigate by. Survives truncation; never empty for a real path. */
  tail: string;
  /** Whether `tail` names a registered checkout, and so earns the emphasis. */
  emphasised: boolean;
};

/**
 * Split a path into the part that may be truncated away and the part that
 * must not be.
 *
 * The split is always made — with a registered checkout the tail is that
 * checkout and everything under it; without one it is the last segment, so a
 * deep path still keeps its tail. Only the *emphasis* is conditional, because
 * outside a known repository there is nothing for a bold segment to mean.
 *
 * Computed on the COLLAPSED string rather than by slicing the raw path from
 * the right. That distinction is the whole reason this is a tested function:
 * the tempting `path.length - splitAt` arithmetic assumes `~` never eats into
 * the tail, and a repository registered at the home directory breaks exactly
 * that assumption — `/Users/you` as a root splits `~/Dev/midnite-studio` into
 * `~/Dev/m` + `idnite-git`, a boundary in the middle of a word.
 */
export function splitHeaderPath(
  path: string,
  home: string | null | undefined,
  match: ResolvedRepoPath | null,
): HeaderPathParts {
  const splitAt = match ? lastSegmentStart(match.root) : lastSegmentStart(path);

  // Collapse each side independently. `collapseHome` only ever rewrites a
  // leading home prefix, and only the head can carry one.
  const head = collapseHome(path.slice(0, splitAt), home);
  const tail = path.slice(splitAt);

  /*
    A root that IS the home directory (or `/`) puts the split inside the prefix
    `~` replaces, so the head keeps its literal `/Users/` and the tail opens
    with a username — true, but not what the row is for. Collapsing the whole
    path and emphasising all of it is the honest reading: the checkout you are
    standing in is home.
  */
  if (head && !head.startsWith('~') && collapseHome(path, home).startsWith('~')) {
    return { head: '', tail: collapseHome(path, home), emphasised: match !== null };
  }

  return { head, tail, emphasised: match !== null };
}

/**
 * Index of the last path segment's first character — where `…/Dev/` ends and
 * `midnite-studio` begins.
 *
 * String work rather than `node:path`: the renderer may not import node
 * builtins (see the package boundaries in CLAUDE.md).
 */
function lastSegmentStart(value: string): number {
  // A trailing slash would otherwise make the last "segment" the empty string.
  const end = value.endsWith('/') && value.length > 1 ? value.length - 1 : value.length;
  const at = value.lastIndexOf('/', end - 1);
  return at < 0 ? 0 : at + 1;
}
