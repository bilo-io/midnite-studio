import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { readReflog } from './reflog';

let repo: TempRepo;

beforeEach(async () => {
  repo = await TempRepo.create();
});

afterEach(async () => {
  await repo.cleanup();
});

describe('readReflog', () => {
  it('reads HEAD by default, newest first, with real unix timestamps', async () => {
    const first = await repo.commitFile('a.txt', 'one\n', 'first');
    await new Promise((r) => setTimeout(r, 1100));
    const second = await repo.commitFile('a.txt', 'two\n', 'second');

    const entries = await readReflog(repo.path);

    expect(entries.map((e) => e.sha)).toEqual([second, first]);
    expect(entries[0]?.action).toBe('commit');
    expect(entries[0]?.at).toBeGreaterThan(0);
    // Distinct seconds, not the fixture's own author date reused twice — the
    // whole reason for `--date=unix` over `%at`/`%ct` (see the parser's doc).
    expect(entries[0]?.at).toBeGreaterThan(entries[1]!.at);
  }, 15_000);

  it('pairs each entry with the sha it moved from', async () => {
    const first = await repo.commitFile('a.txt', 'one\n', 'first');
    const second = await repo.commitFile('a.txt', 'two\n', 'second');

    const entries = await readReflog(repo.path);

    expect(entries[0]).toMatchObject({ sha: second, oldSha: first });
  });

  it("reflects a reset's real time, not the commit it lands on", async () => {
    const first = await repo.commitFile('a.txt', 'one\n', 'first');
    await new Promise((r) => setTimeout(r, 1100));
    await repo.commitFile('a.txt', 'two\n', 'second');
    await new Promise((r) => setTimeout(r, 1100));
    const beforeReset = Math.floor(Date.now() / 1000);
    await repo.git(['reset', '--hard', first]);

    const entries = await readReflog(repo.path);

    expect(entries[0]?.action).toBe('reset');
    expect(entries[0]?.sha).toBe(first);
    // If this read the target COMMIT's own committer date instead of the
    // reflog entry's real write time, it would be `first`'s original date —
    // seconds behind `beforeReset`, not at or after it.
    expect(entries[0]?.at).toBeGreaterThanOrEqual(beforeReset);
  }, 15_000);

  it('reads an explicit ref rather than HEAD', async () => {
    await repo.commitFile('a.txt', 'one\n', 'first');
    await repo.git(['checkout', '-b', 'feature']);
    const onFeature = await repo.commitFile('b.txt', 'two\n', 'on feature');

    const headEntries = await readReflog(repo.path);
    const featureEntries = await readReflog(repo.path, { ref: 'refs/heads/feature' });

    expect(headEntries[0]?.sha).toBe(onFeature);
    expect(featureEntries[0]?.sha).toBe(onFeature);
    // HEAD's own reflog also recorded the branch checkout that isn't part of
    // feature's own history.
    expect(headEntries.some((e) => e.action === 'checkout')).toBe(true);
    expect(featureEntries.some((e) => e.action === 'checkout')).toBe(false);
  });

  it('caps the page at `limit`, still giving the last returned entry a real oldSha', async () => {
    const shas: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      shas.push(await repo.commitFile('a.txt', `${i}\n`, `commit ${i}`));
    }

    const entries = await readReflog(repo.path, { limit: 3 });

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.sha)).toEqual([shas[4], shas[3], shas[2]]);
    // The 4th entry back (index 2, sha shas[2]) moved FROM shas[1] — a real
    // sha, even though shas[1]'s own entry was cut from the page.
    expect(entries[2]?.oldSha).toBe(shas[1]);
  });

  it('returns an empty list for a ref with no reflog', async () => {
    await repo.commitFile('a.txt', 'one\n', 'first');
    expect(await readReflog(repo.path, { ref: 'refs/heads/nonexistent' })).toEqual([]);
  });

  it('keeps a colon-containing subject intact, unparsed further than the action', async () => {
    await repo.commitFile('a.txt', 'one\n', 'first: with a colon in the message');

    const entries = await readReflog(repo.path);
    expect(entries[0]?.subject).toContain('first: with a colon in the message');
  });
});
