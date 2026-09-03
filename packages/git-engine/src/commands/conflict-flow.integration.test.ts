import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ConflictRegion } from '@midnite/studio-shared';

import { applyConflictHunk } from './conflict-hunk';
import { resolveConflictWholeFile } from './conflict-resolve';
import { continueOp, merge, rebase } from './sequencer';
import { conflictedPaths } from './status';
import { locateConflictRegion } from '../parsers/conflict-parser';
import { TempRepo } from '../testing/temp-repo';

/**
 * Phase 47 Theme F — the wiring/safety-net pass.
 *
 * Themes B and C each proved their own write path in isolation. Nothing
 * proved that using BOTH in the same conflicted merge — the ordinary case,
 * since a real conflict resolution is rarely "every file the same way" —
 * actually reaches a completed merge commit through the real sequencer
 * (`continueOp`), not just an empty `conflictedPaths()`. And nothing
 * re-checked, at this combined level, that Theme B's and Theme C's own
 * "ours"/"theirs" during a rebase agree with EACH OTHER — each theme's own
 * integration suite only ever proved its own write path self-consistent.
 */
async function read(repo: TempRepo, relative: string): Promise<string> {
  return readFile(join(repo.path, relative), 'utf8');
}

/** The `ConflictRegion` content a Studio-style caller would already have from a prior read. */
function regionOf(content: string, index: number): ConflictRegion {
  const located = locateConflictRegion(content.split('\n'), index);
  if (!located) throw new Error(`no region ${index} in fixture`);
  return { ours: located.ours, theirs: located.theirs, base: located.base };
}

describe('conflict resolution — mixing whole-file and hunk-level in one operation', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await TempRepo.create();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('a merge resolved with one whole-file accept and one region-by-region file reaches a completed merge commit', async () => {
    await repo.commitFile('a.txt', 'A-ORIGINAL\n', 'base a');
    await repo.commitFile('b.txt', 'top\nB-ORIGINAL\nbottom\n', 'base b');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('a.txt', 'A-FEATURE\n', 'feature a');
    await repo.commitFile('b.txt', 'top\nB-FEATURE\nbottom\n', 'feature b');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('a.txt', 'A-MAIN\n', 'main a');
    await repo.commitFile('b.txt', 'top\nB-MAIN\nbottom\n', 'main b');

    const headBeforeMerge = await repo.head();
    const merged = await merge(repo.path, { source: 'feature' });
    if (merged.ok || merged.kind !== 'conflict') {
      throw new Error(`expected a conflict result, got ${JSON.stringify(merged)}`);
    }
    expect(merged.files.sort()).toEqual(['a.txt', 'b.txt']);

    // a.txt: Theme B, whole-file accept.
    const wholeFile = await resolveConflictWholeFile(repo.path, 'a.txt', 'ours');
    expect(wholeFile.ok).toBe(true);

    // b.txt: Theme C, region-by-region.
    const region = regionOf(await read(repo, 'b.txt'), 0);
    const hunk = await applyConflictHunk(repo.path, 'b.txt', 0, region, 'theirs');
    expect(hunk.ok).toBe(true);

    // Both resolved — this is the exact condition ConflictBanner's Continue
    // button gates on (`conflicted.length > 0`), computed from the same
    // `StatusResult` this reads.
    expect(await conflictedPaths(repo.path)).toEqual([]);

    const continued = await continueOp(repo.path, 'merge');
    expect(continued.ok).toBe(true);

    // The merge commit actually completed: HEAD moved, and it is a real
    // merge commit (two parents) rather than a fast-forward or no-op.
    const headAfter = await repo.head();
    expect(headAfter).not.toBe(headBeforeMerge);
    const parents = (await repo.git(['rev-list', '--parents', '-n', '1', 'HEAD'])).trim().split(' ');
    expect(parents).toHaveLength(3); // the merge commit itself + two parents

    await expect(read(repo, 'a.txt')).resolves.toBe('A-MAIN\n');
    await expect(read(repo, 'b.txt')).resolves.toBe('top\nB-FEATURE\nbottom\n');
  });

  it("a mixed rebase resolution agrees with itself about which side is \"ours\"", async () => {
    // git's own :2:/:3: convention inverts "ours"/"theirs" for a rebase
    // relative to merge — Theme B's own suite proves this for the whole-file
    // path, Theme C's for the hunk path, each in isolation. This proves the
    // two agree with EACH OTHER inside the same rebase: an integration risk
    // neither theme's own tests could have caught alone.
    await repo.commitFile('a.txt', 'A-ORIGINAL\n', 'base a');
    await repo.commitFile('b.txt', 'top\nB-ORIGINAL\nbottom\n', 'base b');
    await repo.git(['checkout', '-b', 'feature']);
    // Both edits in ONE commit, so replaying it during the rebase conflicts
    // on both files in the SAME step — two separate commits would conflict
    // one file per rebase step instead, which wouldn't exercise resolving
    // both write paths against the same in-progress operation at once.
    await repo.writeFile('a.txt', 'A-FEATURE\n');
    await repo.writeFile('b.txt', 'top\nB-FEATURE\nbottom\n');
    await repo.git(['add', '-A']);
    await repo.commit('feature a+b');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('a.txt', 'A-MAIN\n', 'main a');
    await repo.commitFile('b.txt', 'top\nB-MAIN\nbottom\n', 'main b');
    await repo.git(['checkout', 'feature']);

    const rebased = await rebase(repo.path, { onto: 'main' });
    if (rebased.ok || rebased.kind !== 'conflict') {
      throw new Error(`expected a conflict result, got ${JSON.stringify(rebased)}`);
    }
    expect(rebased.files.sort()).toEqual(['a.txt', 'b.txt']);

    // "ours" during a rebase is the branch being rebased ONTO (MAIN) for
    // both write paths — accepting "ours" on both files must land MAIN's
    // content on both, never a mix of MAIN and FEATURE.
    const wholeFile = await resolveConflictWholeFile(repo.path, 'a.txt', 'ours');
    expect(wholeFile.ok).toBe(true);
    const region = regionOf(await read(repo, 'b.txt'), 0);
    const hunk = await applyConflictHunk(repo.path, 'b.txt', 0, region, 'ours');
    expect(hunk.ok).toBe(true);

    await expect(read(repo, 'a.txt')).resolves.toBe('A-MAIN\n');
    await expect(read(repo, 'b.txt')).resolves.toBe('top\nB-MAIN\nbottom\n');

    expect(await conflictedPaths(repo.path)).toEqual([]);
    const continued = await continueOp(repo.path, 'rebase');
    expect(continued.ok).toBe(true);
  });
});
