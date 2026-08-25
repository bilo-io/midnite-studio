import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { readFileDiff } from './diff';

/**
 * The three cases where asking git the wrong question returns output that looks
 * perfectly valid and describes something else entirely. Each of these shipped
 * broken and was caught in review; the tests are here so they stay caught.
 */
describe('diff commands — the ways a scoped diff lies (integration)', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await TempRepo.create();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('renders an unmerged file instead of claiming it has no changes', async () => {
    // `git diff` on an unmerged path emits a COMBINED diff — `@@@ -1,3 -1,3 +1,7
    // @@@`, two marker columns — which an `^@@ -`-anchored parser skips whole.
    // The symptom is "No changes to show for this file." on the one file the
    // user most needs mid-merge.
    await repo.commitFile('f.txt', 'a\nbase\nc\n', 'base');
    await repo.git(['checkout', '-b', 'feature']);
    await repo.commitFile('f.txt', 'a\nFEATURE\nc\n', 'feature edit');
    await repo.git(['checkout', 'main']);
    await repo.commitFile('f.txt', 'a\nMAIN\nc\n', 'main edit');

    const merge = await repo.gitAllowFailure(['merge', 'feature']);
    expect(merge.exitCode).not.toBe(0);

    const diff = await readFileDiff(repo.path, 'f.txt', false);

    expect(diff.combined).toBe(true);
    expect(diff.hunks.length).toBeGreaterThan(0);

    const text = diff.hunks.flatMap((h) => h.lines).map((l) => l.text);
    expect(text.some((t) => t.includes('<<<<<<<'))).toBe(true);
    expect(text.some((t) => t.includes('MAIN'))).toBe(true);
    expect(text.some((t) => t.includes('FEATURE'))).toBe(true);
  });

  it('diffs a path containing glob characters literally', async () => {
    // A pathspec is glob-matched by default, so `pages/[id].tsx` is a character
    // class matching `pages/i.tsx`. Without --literal-pathspecs the pane renders
    // a DIFFERENT file's content under the requested filename — and Next.js-style
    // dynamic routes make this ordinary, not exotic.
    await repo.git(['config', 'core.precomposeunicode', 'false']);
    await repo.commitFile('i.tsx', 'export const i = 1\n', 'decoy');
    await writeFile(join(repo.path, 'i.tsx'), 'export const i = 999\n', 'utf8');
    await writeFile(join(repo.path, '[id].tsx'), 'export const dynamic = true\n', 'utf8');

    const diff = await readFileDiff(repo.path, '[id].tsx', false);

    expect(diff.path).toBe('[id].tsx');
    const text = diff.hunks.flatMap((h) => h.lines).map((l) => l.text);
    expect(text.some((t) => t.includes('dynamic'))).toBe(true);
    // The decoy's content must not appear anywhere in it.
    expect(text.some((t) => t.includes('export const i'))).toBe(false);
  });

  it('does not render a fully-staged file as a brand-new addition', async () => {
    // "empty `git diff` output and not staged" was taken to mean "untracked",
    // and the /dev/null fallback then painted the entire file green. A tracked
    // file with nothing unstaged looks identical — reachable whenever a
    // selection outlives a Stage click.
    const body = Array.from({ length: 8 }, (_, i) => `line ${i}`).join('\n');
    await repo.commitFile('big.txt', `${body}\n`, 'base');
    await repo.writeFile('big.txt', `${body}\nnine\n`);
    await repo.git(['add', '--', 'big.txt']);

    const unstaged = await readFileDiff(repo.path, 'big.txt', false);

    expect(unstaged.change).not.toBe('added');
    expect(unstaged.hunks).toEqual([]);
    expect(unstaged.insertions).toBe(0);

    // The staged view still shows the real change.
    const staged = await readFileDiff(repo.path, 'big.txt', true);
    expect(staged.insertions).toBe(1);
  });

  it('still shows an untracked file as an addition', async () => {
    // The guard above must not cost the case it replaced.
    await repo.commitFile('a.txt', 'a\n', 'base');
    await repo.writeFile('fresh.txt', 'hello\nworld\n');

    const diff = await readFileDiff(repo.path, 'fresh.txt', false);

    expect(diff.change).toBe('added');
    expect(diff.insertions).toBe(2);
  });
});
