import type { Ref, RefKind, Upstream } from '@midnite-git/shared';

/**
 * Parser for `git for-each-ref` output.
 *
 * The format is built here so parser and command share one definition. Fields
 * are NUL-separated and records newline-separated — `for-each-ref` has no `-z`
 * for records, but ref names cannot contain a newline (git enforces it), so
 * newline record separation is safe where it wouldn't be for paths.
 */
const FIELDS = [
  '%(refname)',
  '%(objecttype)',
  '%(objectname)',
  // For an annotated tag, the commit it peels to. Empty for everything else.
  '%(*objectname)',
  '%(upstream:short)',
  // `[ahead 2, behind 1]` / `[gone]` / `` — parsed by parseTrack below.
  '%(upstream:track)',
  '%(HEAD)',
  // Set when this branch is checked out in some worktree — git refuses to check
  // the same branch out twice, so the UI disables checkout on those.
  '%(worktreepath)',
] as const;

export const FOR_EACH_REF_FORMAT = FIELDS.join('%00');

const kindFor = (refName: string): RefKind | null => {
  if (refName.startsWith('refs/heads/')) return 'localBranch';
  if (refName.startsWith('refs/remotes/')) return 'remoteBranch';
  if (refName.startsWith('refs/tags/')) return 'tag';
  return null;
};

const shortName = (refName: string, kind: RefKind): string => {
  switch (kind) {
    case 'localBranch':
      return refName.slice('refs/heads/'.length);
    case 'remoteBranch':
      return refName.slice('refs/remotes/'.length);
    case 'tag':
      return refName.slice('refs/tags/'.length);
    default:
      return refName;
  }
};

export function parseRefs(payload: string): Ref[] {
  const refs: Ref[] = [];

  for (const line of payload.split('\n')) {
    if (line.length === 0) continue;
    const f = line.split('\x00');
    if (f.length < FIELDS.length) continue;

    const [refName, objectType, objectName, peeled, upstreamName, track, headMarker, worktreePath] =
      f as [string, string, string, string, string, string, string, string, ...string[]];

    const kind = kindFor(refName);
    if (!kind) continue;

    // `refs/remotes/origin/HEAD` is a symbolic pointer at the remote's default
    // branch, not a branch of its own. Badging it would double-label whichever
    // branch it points at.
    if (kind === 'remoteBranch' && refName.endsWith('/HEAD')) continue;

    // An annotated tag's `%(objectname)` is the tag OBJECT's sha; the graph joins
    // badges to rows by commit sha, so use the peeled commit when there is one.
    const sha = objectType === 'tag' && peeled.length > 0 ? peeled : objectName;

    refs.push({
      name: shortName(refName, kind),
      fullName: refName,
      kind,
      sha,
      upstream: parseTrack(upstreamName, track),
      isHead: headMarker === '*',
      worktreePath: worktreePath.length > 0 ? worktreePath : null,
    });
  }

  return refs;
}

/**
 * Parse `%(upstream:track)`, which is one of:
 *
 *   ``                       in sync (or no upstream at all)
 *   `[ahead 3]`
 *   `[behind 2]`
 *   `[ahead 3, behind 2]`    diverged
 *   `[gone]`                 upstream branch deleted on the remote
 */
export function parseTrack(upstreamName: string, track: string): Upstream | null {
  if (upstreamName.length === 0) return null;

  const gone = track.includes('gone');
  const ahead = Number.parseInt(/ahead (\d+)/.exec(track)?.[1] ?? '0', 10);
  const behind = Number.parseInt(/behind (\d+)/.exec(track)?.[1] ?? '0', 10);

  return { name: upstreamName, ahead, behind, gone };
}
