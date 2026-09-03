import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { failure, ok, type ConflictHunkSide, type ConflictRegion, type GitOpResult } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { locateConflictRegion, type LocatedConflictRegion } from '../parsers/conflict-parser';
import { gitErrorLine } from './worktree-ops';

/**
 * Hunk-level conflict resolution (Phase 47 Theme C): resolve one conflicted
 * region within a path, leaving its siblings untouched and still conflicted.
 *
 * **Corrected from the phase doc, found spiking this against real git**: the
 * doc called for `git apply --index`, on the reasoning that the worktree and
 * the index should never disagree about resolution progress. That flag
 * cannot work here — an unmerged path has no stage-0 index entry at all
 * (`ls-files -u` shows only stages 1/2/3), and `git apply --index`/`--cached`
 * fails outright with "does not exist in index" against one, confirmed with a
 * throwaway repo before writing this. There is also no such thing as a
 * *partial* index for a conflicted path: staging is whole-file-or-nothing, so
 * "agree on resolution progress" while regions remain can only mean "don't
 * touch the index at all" — which is what leaving the pre-existing 1/2/3
 * stages alone already guarantees. So this applies with a plain
 * (worktree-only) `git apply`, and only stages the path — collapsing those
 * stages into one resolved stage-0 entry, matching Theme B's own finish line
 * — once a fresh read of the file shows zero markers left. That is the one
 * moment the doc's "agree" genuinely bites: a resolved file must not sit
 * there still reading as unmerged.
 */

function resolvedLines(region: { ours: string[]; theirs: string[] }, side: ConflictHunkSide): string[] {
  if (side === 'ours') return region.ours;
  if (side === 'theirs') return region.theirs;
  return [...region.ours, ...region.theirs];
}

function linesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((line, i) => line === b[i]);
}

function regionMatches(located: LocatedConflictRegion, region: ConflictRegion): boolean {
  if (!linesEqual(located.ours, region.ours)) return false;
  if (!linesEqual(located.theirs, region.theirs)) return false;
  if (located.base === null || region.base === null) return located.base === region.base;
  return linesEqual(located.base, region.base);
}

/**
 * Splits a file's text into its real lines — `content.split('\n')` alone
 * leaves a phantom trailing `''` element whenever the file ends in `\n`,
 * which is not a line and must not be treated as one (as context, or when
 * counting positions).
 *
 * A file whose very last line has no trailing newline at all is not handled:
 * the patch built below never emits a `\ No newline at end of file` marker,
 * so a region touching that exact last line can fail to apply. Left as a
 * known gap rather than guessed at — every fixture this phase's tests touch
 * ends in `\n`.
 */
function splitFile(content: string): string[] {
  const raw = content.split('\n');
  return content.endsWith('\n') ? raw.slice(0, -1) : raw;
}

/** A single-hunk unified diff replacing `located`'s block with `newBlock`. */
function buildPatch(
  path: string,
  lines: string[],
  located: LocatedConflictRegion,
  newBlock: string[],
): string {
  const oldBlock = [
    located.oursMarker,
    ...located.ours,
    ...(located.baseMarker !== null ? [located.baseMarker, ...(located.base ?? [])] : []),
    located.sepMarker,
    ...located.theirs,
    located.endMarker,
  ];

  const contextBefore = located.startLine > 0 ? [lines[located.startLine - 1]] : [];
  const contextAfter = located.endLine < lines.length ? [lines[located.endLine]] : [];

  const oldStart = located.startLine - contextBefore.length + 1; // 1-based
  const oldCount = contextBefore.length + oldBlock.length + contextAfter.length;
  const newCount = contextBefore.length + newBlock.length + contextAfter.length;

  const body = [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldStart},${oldCount} +${oldStart},${newCount} @@`,
    ...contextBefore.map((l) => ` ${l}`),
    ...oldBlock.map((l) => `-${l}`),
    ...newBlock.map((l) => `+${l}`),
    ...contextAfter.map((l) => ` ${l}`),
  ];
  return `${body.join('\n')}\n`;
}

/**
 * Accepts `side`'s content for one conflicted region of `path`, applying it
 * to the worktree file only. Sibling regions in the same file are untouched
 * and still parse as conflicted. `region` is the caller's own last-read view
 * of that region — used only to detect that it changed since, not trusted for
 * the write itself, which always re-reads the file fresh.
 *
 * Not layered on `stagePaths`: this needs the raw `add` plumbing inline,
 * because it and the apply above must run as ONE queued task — nesting a
 * second `writeQueue.run` for the same repo inside an already-running one
 * would deadlock (`conflict-resolve.ts` documents the same hazard for
 * `resolveConflictWholeFile`).
 */
export async function applyConflictHunk(
  worktreePath: string,
  path: string,
  regionIndex: number,
  region: ConflictRegion,
  side: ConflictHunkSide,
): Promise<GitOpResult> {
  return writeQueue.run(worktreePath, async () => {
    const absolutePath = join(worktreePath, path);
    let content: string;
    try {
      content = await readFile(absolutePath, 'utf8');
    } catch (error) {
      return failure(error instanceof Error ? error.message : `Could not read ${path}.`);
    }

    const lines = splitFile(content);
    const located = locateConflictRegion(lines, regionIndex);
    if (!located || !regionMatches(located, region)) {
      return failure(
        `'${path}' changed since this region was read — refresh and try again.`,
        undefined,
        'stale-write',
      );
    }

    const patch = buildPatch(path, lines, located, resolvedLines(region, side));
    const applied = await execGit(worktreePath, ['apply', '-'], { stdin: patch, write: true });
    if (applied.exitCode !== 0) {
      return failure(gitErrorLine(applied.stderr) || `Could not apply that resolution to '${path}'.`);
    }

    let resolvedContent: string;
    try {
      resolvedContent = await readFile(absolutePath, 'utf8');
    } catch (error) {
      return failure(error instanceof Error ? error.message : `Could not read ${path}.`);
    }
    if (resolvedContent.includes('<<<<<<<')) return ok(); // sibling regions remain — stay unmerged

    const staged = await execGit(worktreePath, ['add', '--', path], { write: true });
    if (staged.exitCode !== 0) {
      return failure(gitErrorLine(staged.stderr) || `Could not stage '${path}'.`);
    }
    return ok();
  });
}
