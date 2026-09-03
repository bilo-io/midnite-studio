import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ConflictRegion } from '@midnite/studio-shared';

import { applyConflictHunk } from './conflict-hunk';
import { locateConflictRegion } from '../parsers/conflict-parser';
import { TempRepo } from '../testing/temp-repo';

async function read(repo: TempRepo, relative: string): Promise<string> {
  return readFile(join(repo.path, relative), 'utf8');
}

/** Region content for a located region — what a caller who parsed the file already has. */
function regionOf(content: string, index: number): ConflictRegion {
  const lines = content.split('\n');
  const located = locateConflictRegion(lines, index);
  if (!located) throw new Error(`no region ${index} in fixture`);
  return { ours: located.ours, theirs: located.theirs, base: located.base };
}

/**
 * `applyConflictHunk` is a thin wrapper around a synthesized patch applied
 * with real git, so — same reasoning as `conflict-resolve.integration.test.ts`
 * — it's only worth proving against an actual repo.
 */
describe('applyConflictHunk', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await TempRepo.create();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  /** Two conflicted regions, far enough apart that git keeps them separate hunks. */
  async function setUpTwoRegionConflict(): Promise<void> {
    const filler = Array.from({ length: 8 }, (_, i) => `c${i}`).join('\n');
    await repo.commitFile('f.txt', `a\nbase1\n${filler}\nbase2\ng\n`, 'base');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('f.txt', `a\nFEAT1\n${filler}\nFEAT2\ng\n`, 'feature edit');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('f.txt', `a\nMAIN1\n${filler}\nMAIN2\ng\n`, 'main edit');
    const merge = await repo.gitAllowFailure(['merge', 'feature']);
    expect(merge.exitCode).not.toBe(0);
  }

  it('resolves one region to "ours", leaving the sibling region conflicted', async () => {
    await setUpTwoRegionConflict();
    const before = await read(repo, 'f.txt');
    const region = regionOf(before, 0);

    const result = await applyConflictHunk(repo.path, 'f.txt', 0, region, 'ours');

    expect(result.ok).toBe(true);
    const after = await read(repo, 'f.txt');
    expect(after).toContain('MAIN1');
    expect(after).not.toContain('FEAT1');
    // The second region is untouched and still parseable as conflicted.
    expect(after.match(/<<<<<<</g)).toHaveLength(1);
    expect(locateConflictRegion(after.split('\n'), 0)).toMatchObject({ ours: ['MAIN2'], theirs: ['FEAT2'] });
    // Not fully resolved yet — the file must still read as unmerged.
    expect((await repo.gitAllowFailure(['diff', '--name-only', '--diff-filter=U'])).stdout).toContain('f.txt');
  });

  it('resolves "theirs" for one region', async () => {
    await setUpTwoRegionConflict();
    const before = await read(repo, 'f.txt');
    const region = regionOf(before, 0);

    const result = await applyConflictHunk(repo.path, 'f.txt', 0, region, 'theirs');

    expect(result.ok).toBe(true);
    const after = await read(repo, 'f.txt');
    expect(after).toContain('FEAT1');
    expect(after).not.toContain('MAIN1');
  });

  it('resolves "both" as ours-then-theirs — the common additive-conflict answer', async () => {
    await repo.commitFile('f.txt', 'start\nend\n', 'base');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('f.txt', 'start\nimport-b\nend\n', 'feature adds import b');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('f.txt', 'start\nimport-a\nend\n', 'main adds import a');
    const merge = await repo.gitAllowFailure(['merge', 'feature']);
    expect(merge.exitCode).not.toBe(0);

    const before = await read(repo, 'f.txt');
    const region = regionOf(before, 0);

    const result = await applyConflictHunk(repo.path, 'f.txt', 0, region, 'both');

    expect(result.ok).toBe(true);
    await expect(read(repo, 'f.txt')).resolves.toBe('start\nimport-a\nimport-b\nend\n');
  });

  it('re-parses only the remaining regions, and finalizes staging once none are left', async () => {
    await setUpTwoRegionConflict();
    const first = regionOf(await read(repo, 'f.txt'), 0);
    await applyConflictHunk(repo.path, 'f.txt', 0, first, 'ours');

    // After the first hunk, index stages are still 1/2/3 — nothing staged yet.
    expect((await repo.git(['ls-files', '-u', '--', 'f.txt'])).split('\n').filter(Boolean)).toHaveLength(3);

    const second = regionOf(await read(repo, 'f.txt'), 0); // the sibling is now index 0
    const result = await applyConflictHunk(repo.path, 'f.txt', 0, second, 'theirs');

    expect(result.ok).toBe(true);
    const after = await read(repo, 'f.txt');
    expect(after).not.toMatch(/<<<<<<</);
    // Zero markers left — the path is finalized: staged, one clean stage-0 entry.
    expect((await repo.gitAllowFailure(['diff', '--name-only', '--diff-filter=U'])).stdout).toBe('');
    await expect(repo.git(['show', ':0:f.txt'])).resolves.toBe(after);
  });

  it('fails as a stale write, not a crash or a corrupted file, when the region no longer matches', async () => {
    await setUpTwoRegionConflict();
    const before = await read(repo, 'f.txt');
    const staleRegion = regionOf(before, 0);
    // The file changes on disk (e.g. another apply, or an editor save) after
    // the caller's `region` was read but before this call runs.
    await repo.writeFile('f.txt', before.replace('MAIN1', 'MAIN1-EDITED'));

    const result = await applyConflictHunk(repo.path, 'f.txt', 0, staleRegion, 'ours');

    if (result.ok || result.kind !== 'error') {
      throw new Error(`expected a stale-write error, got ${JSON.stringify(result)}`);
    }
    expect(result.code).toBe('stale-write');
    // Untouched — no partial or corrupted patch application.
    await expect(read(repo, 'f.txt')).resolves.toBe(before.replace('MAIN1', 'MAIN1-EDITED'));
  });

  it('fails as a stale write for a region index that no longer exists', async () => {
    await setUpTwoRegionConflict();
    const region = regionOf(await read(repo, 'f.txt'), 0);

    const result = await applyConflictHunk(repo.path, 'f.txt', 5, region, 'ours');

    if (result.ok || result.kind !== 'error') {
      throw new Error(`expected a stale-write error, got ${JSON.stringify(result)}`);
    }
    expect(result.code).toBe('stale-write');
  });
});
