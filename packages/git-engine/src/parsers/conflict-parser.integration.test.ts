import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readFileDiff } from '../commands/diff';
import { TempRepo } from '../testing/temp-repo';
import { parseConflictedFile } from './conflict-parser';

/**
 * `conflict-parser.test.ts` proves the marker grammar against hand-written
 * fixtures; this proves the same parser against what real git actually emits
 * for both conflict styles — the round-trip `diff-conflicts.integration.test.ts`
 * stops short of, since it only asserts the raw marker text survives parsing.
 */
describe('parseConflictedFile — against real git output (integration)', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await TempRepo.create();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('round-trips a default-style merge conflict', async () => {
    await repo.commitFile('f.txt', 'a\nbase\nc\n', 'base');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('f.txt', 'a\nFEATURE\nc\n', 'feature edit');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('f.txt', 'a\nMAIN\nc\n', 'main edit');
    const merge = await repo.gitAllowFailure(['merge', 'feature']);
    expect(merge.exitCode).not.toBe(0);

    const diff = await readFileDiff(repo.path, 'f.txt', false);
    const [hunk] = parseConflictedFile(diff.hunks);

    const conflicts = hunk!.segments.filter((s) => s.kind === 'conflict');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'conflict',
      region: { ours: ['MAIN'], theirs: ['FEATURE'], base: null },
    });
  });

  it('round-trips a diff3-style merge conflict, ancestor included', async () => {
    await repo.git(['config', 'merge.conflictStyle', 'diff3']);
    await repo.commitFile('f.txt', 'a\nORIGINAL\nc\n', 'base');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('f.txt', 'a\nFEATURE\nc\n', 'feature edit');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('f.txt', 'a\nMAIN\nc\n', 'main edit');
    const merge = await repo.gitAllowFailure(['merge', 'feature']);
    expect(merge.exitCode).not.toBe(0);

    const diff = await readFileDiff(repo.path, 'f.txt', false);
    const [hunk] = parseConflictedFile(diff.hunks);

    const conflicts = hunk!.segments.filter((s) => s.kind === 'conflict');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      kind: 'conflict',
      region: { ours: ['MAIN'], theirs: ['FEATURE'], base: ['ORIGINAL'] },
    });
  });

  it('parses an already-resolved file to zero regions', async () => {
    await repo.commitFile('f.txt', 'a\nb\nc\n', 'base');
    await repo.writeFile('f.txt', 'a\nb\nc\nd\n');

    const diff = await readFileDiff(repo.path, 'f.txt', false);
    const hunks = parseConflictedFile(diff.hunks);

    for (const hunk of hunks) {
      expect(hunk.segments.filter((s) => s.kind === 'conflict')).toHaveLength(0);
    }
  });
});
