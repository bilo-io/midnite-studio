import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrateLegacyRepoStore } from './userdata-migration';

/**
 * The migration against real directories. It carries no `electron` import — the
 * two userData paths are arguments — so it runs under bare vitest.
 */
describe('migrateLegacyRepoStore', () => {
  let root: string;
  let legacy: string;
  let current: string;

  const REPOS = '{"version":1,"paths":["/tmp/one"]}\n';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'midnite-git-test-'));
    legacy = join(root, 'midnite-git');
    current = join(root, 'Midnite Git');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('copies the repo list out of the pre-rename directory', async () => {
    await writeFileIn(legacy, REPOS);

    expect(await migrateLegacyRepoStore(legacy, current)).toBe(true);
    expect(await readFile(join(current, 'repos.json'), 'utf8')).toBe(REPOS);
  });

  it('leaves the legacy copy in place, so an older build still boots', async () => {
    await writeFileIn(legacy, REPOS);

    await migrateLegacyRepoStore(legacy, current);

    expect(await readFile(join(legacy, 'repos.json'), 'utf8')).toBe(REPOS);
  });

  it('never overwrites a list the renamed app has already written', async () => {
    await writeFileIn(legacy, REPOS);
    const newer = '{"version":1,"paths":["/tmp/two"]}\n';
    await writeFileIn(current, newer);

    expect(await migrateLegacyRepoStore(legacy, current)).toBe(false);
    expect(await readFile(join(current, 'repos.json'), 'utf8')).toBe(newer);
  });

  it('is a no-op on a clean install, with no legacy directory at all', async () => {
    expect(await migrateLegacyRepoStore(legacy, current)).toBe(false);
  });

  // Guards the truncate-on-self-copy footgun: on a platform where userData does
  // not embed the app name, both arguments are the same path.
  it('does not touch the file when both paths are the same directory', async () => {
    await writeFileIn(legacy, REPOS);

    expect(await migrateLegacyRepoStore(legacy, legacy)).toBe(false);
    expect(await readFile(join(legacy, 'repos.json'), 'utf8')).toBe(REPOS);
  });
});

async function writeFileIn(directory: string, contents: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'repos.json'), contents, 'utf8');
}
