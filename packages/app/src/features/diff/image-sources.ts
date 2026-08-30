import {
  MGIT_INDEX_REV,
  mgitBlobUrl,
  mgitFileUrl,
  type FileDiff,
  type StatusCode,
  type StatusEntry,
} from '@midnite/git-shared';

import { previewKindForFile } from '../../lib/languages';

/**
 * Which bytes an image diff should show on each side, as `mgit-file://` URLs.
 *
 * Pure, and in the renderer rather than main, because it is only URL arithmetic
 * over a diff the renderer already has — and because the two callers ask the
 * same question about different revision pairs. A working-tree diff compares the
 * index with the checkout; a staged one compares HEAD with the index; a commit
 * one compares the first parent with the commit. Getting that pairing wrong
 * shows a stale "before", which is worse than showing none.
 *
 * `null` on a side means that side does not exist — an addition has no before,
 * a deletion has no after — and the viewer renders one pane instead of two.
 */
export type ImageSide = {
  url: string;
  /** What this side IS, in the words the diff header already uses. */
  label: string;
};

export type ImageDiffSources = {
  before: ImageSide | null;
  after: ImageSide | null;
};

/** The revision pair to diff between. */
export type ImageDiffTarget =
  | {
      kind: 'worktree';
      repoId: string;
      worktreePath?: string | null;
      /** The staged half (HEAD → index) rather than the unstaged one (index → checkout). */
      staged: boolean;
    }
  | { kind: 'commit'; repoId: string; sha: string; parentSha?: string };


/**
 * Sources for a diff, or `null` when an image viewer is not the right answer.
 *
 * Two gates, and both matter. The path must LOOK like an image — the same
 * extension table the Files preview uses, so the two surfaces never disagree
 * about what is viewable. And git must have called the file binary: a textual
 * diff exists for an SVG, and replacing it with two pictures would hide the
 * change rather than show it.
 */
export function imageDiffSources(
  diff: FileDiff | undefined,
  target: ImageDiffTarget,
): ImageDiffSources | null {
  if (!diff || !diff.binary) return null;
  const fileName = diff.path.slice(diff.path.lastIndexOf('/') + 1);
  if (previewKindForFile(fileName) !== 'image') return null;

  // A rename or copy moved the bytes: the pre-image lives at the OLD path, and
  // asking for the new path at the old revision finds nothing.
  const oldPath = diff.oldPath ?? diff.path;
  const added = diff.change === 'added';
  const deleted = diff.change === 'deleted';

  if (target.kind === 'commit') {
    const short = target.sha.slice(0, 7);
    const parentRev = target.parentSha ?? `${target.sha}^`;
    const parentLabel = target.parentSha ? target.parentSha.slice(0, 7) : `${short}^`;
    return {
      before: added
        ? null
        : {
            url: mgitBlobUrl(target.repoId, parentRev, oldPath),
            label: parentLabel,
          },
      after: deleted ? null : { url: mgitBlobUrl(target.repoId, target.sha, diff.path), label: short },
    };
  }


  const { repoId, worktreePath, staged } = target;
  if (staged) {
    return {
      before: added ? null : { url: mgitBlobUrl(repoId, 'HEAD', oldPath, worktreePath), label: 'HEAD' },
      after: deleted
        ? null
        : { url: mgitBlobUrl(repoId, MGIT_INDEX_REV, diff.path, worktreePath), label: 'staged' },
    };
  }

  return {
    before: added
      ? null
      : { url: mgitBlobUrl(repoId, MGIT_INDEX_REV, oldPath, worktreePath), label: 'index' },
    after: deleted
      ? null
      : {
          // The unstaged "after" is the file on disk, which the protocol already
          // serves — no reason to route it through the object database.
          url: mgitFileUrl('repo', repoId, diff.path, worktreePath),
          label: 'working tree',
        },
  };
}

/**
 * HEAD against the file on disk — the pairing for a file BROWSER rather than a
 * diff.
 *
 * The Files view has no staged/unstaged distinction to offer: it shows one
 * checkout, and the question a reader has of a changed asset there is "how does
 * this differ from what is committed". Both halves of a two-step change (staged,
 * then edited again) fall inside that one comparison, which is why this does not
 * take a `staged` flag.
 */
export function headToWorktreeImage(
  target: { repoId: string; worktreePath?: string | undefined },
  relPath: string,
): ImageDiffSources {
  return {
    before: { url: mgitBlobUrl(target.repoId, 'HEAD', relPath, target.worktreePath), label: 'HEAD' },
    after: {
      url: mgitFileUrl('repo', target.repoId, relPath, target.worktreePath),
      label: 'working tree',
    },
  };
}

/**
 * Whether HEAD holds a version of this path that differs from the one on disk —
 * the gate on offering a comparison at all.
 *
 * A path absent from status matches HEAD, so there is nothing to compare. An
 * untracked or ignored file, and one staged as an addition, have no pre-image in
 * HEAD at all: offering "compare" there would produce an empty before pane and
 * read as a broken viewer rather than as a new file.
 */
export function differsFromHead(entry: StatusEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.staged === 'added') return false;
  return !NO_HEAD_SIDE.has(entry.staged) && !NO_HEAD_SIDE.has(entry.unstaged);
}

const NO_HEAD_SIDE = new Set<StatusCode>(['untracked', 'ignored']);
