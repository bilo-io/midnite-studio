import { afterEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { listRemotes, parseRemoteConfig } from './remotes';

/**
 * Against real git, because the framing is the risk.
 *
 * `git config -z --get-regexp` emits `key\nvalue\0`, which is documented in one
 * sentence and easy to mis-remember as `key\0value\0`. A fixture written from
 * that memory passes its own unit test and returns nothing at all in the app.
 */
describe('listRemotes', () => {
  const repos: TempRepo[] = [];
  const makeRepo = async (): Promise<TempRepo> => {
    const repo = await TempRepo.create();
    repos.push(repo);
    return repo;
  };

  afterEach(async () => {
    await Promise.all(repos.splice(0).map((r) => r.cleanup()));
  });

  it('returns an empty list for a repo with no remotes', async () => {
    const repo = await makeRepo();
    await expect(listRemotes(repo.path)).resolves.toEqual([]);
  });

  it('reads several remotes and derives each forge', async () => {
    const repo = await makeRepo();
    await repo.git(['remote', 'add', 'origin', 'git@github.com:bilo-io/midnite-git.git']);
    await repo.git(['remote', 'add', 'mirror', 'https://gitlab.com/bilo/midnite.git']);

    const remotes = await listRemotes(repo.path);

    expect(remotes).toHaveLength(2);
    expect(remotes.find((r) => r.name === 'origin')).toEqual({
      name: 'origin',
      fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
      // No pushurl set, so it falls back to the fetch URL — git's own rule.
      pushUrl: 'git@github.com:bilo-io/midnite-git.git',
      forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
    });
    expect(remotes.find((r) => r.name === 'mirror')?.forge?.kind).toBe('gitlab');
  });

  it('reads a distinct pushurl', async () => {
    const repo = await makeRepo();
    await repo.git(['remote', 'add', 'origin', 'https://github.com/o/r.git']);
    await repo.git(['remote', 'set-url', '--push', 'origin', 'git@github.com:o/r.git']);

    const [origin] = await listRemotes(repo.path);

    expect(origin?.fetchUrl).toBe('https://github.com/o/r.git');
    expect(origin?.pushUrl).toBe('git@github.com:o/r.git');
  });

  it('degrades a non-forge remote to forge: null without dropping it', async () => {
    // A local-path remote is a perfectly normal remote. It must still be listed
    // — the sidebar shows it — it just has nothing to link to.
    const other = await makeRepo();
    const repo = await makeRepo();
    await repo.git(['remote', 'add', 'local', other.path]);

    const [local] = await listRemotes(repo.path);

    expect(local?.name).toBe('local');
    expect(local?.forge).toBeNull();
  });

  it('keeps a remote name that contains a dot intact', async () => {
    const repo = await makeRepo();
    await repo.git(['remote', 'add', 'my.fork', 'git@github.com:me/fork.git']);

    const [remote] = await listRemotes(repo.path);

    // `remote.my.fork.url` split naively on `.` yields the name `my`.
    expect(remote?.name).toBe('my.fork');
  });
});

describe('parseRemoteConfig', () => {
  it('takes the first of several urls on one remote', () => {
    // Git allows a push fan-out via repeated `remote.<n>.pushurl`. The first is
    // the one git reports as *the* URL; the rest are additional targets.
    const payload =
      'remote.origin.url\nhttps://github.com/o/r.git\0' +
      'remote.origin.pushurl\ngit@github.com:o/r.git\0' +
      'remote.origin.pushurl\ngit@backup.example:o/r.git\0';

    expect(parseRemoteConfig(payload)).toEqual([
      {
        name: 'origin',
        fetchUrl: 'https://github.com/o/r.git',
        pushUrl: 'git@github.com:o/r.git',
        forge: { host: 'github.com', owner: 'o', repo: 'r', kind: 'github' },
      },
    ]);
  });

  it('drops a pushurl with no url behind it', () => {
    expect(parseRemoteConfig('remote.broken.pushurl\ngit@github.com:o/r.git\0')).toEqual([]);
  });

  it('ignores a record with no value', () => {
    expect(parseRemoteConfig('remote.origin.url\n\0')).toEqual([]);
  });
});
