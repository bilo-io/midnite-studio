import { homedir } from 'node:os';

import { failure, ok, type GitIdentity, type GitOpResult } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { WriteQueue } from '../exec/write-queue';

/**
 * The machine-wide git identity (Phase 98 Theme F): `user.name` / `user.email`
 * in `~/.gitconfig`.
 *
 * `execGit` needs a working directory, but `--global` never reads a repo, so
 * the home directory stands in. Writes are serialised on a fixed key rather
 * than a repo path: `git config` takes `~/.gitconfig.lock`, so two concurrent
 * writers race exactly like two index writers do — the same queue, a different
 * key. Injectable `cwd` and `queue` keep it testable against a temp `HOME`.
 */
const GLOBAL_CONFIG_KEY = '<global-git-config>';
const defaultQueue = new WriteQueue();

async function readKey(cwd: string, key: string): Promise<string | null> {
  const res = await execGit(cwd, ['config', '--global', '--get', key]);
  // Exit 1 is "key not set" — ordinary data; anything else is a real failure.
  if (res.exitCode === 0) return res.stdout.replace(/\r?\n$/, '');
  if (res.exitCode === 1) return '';
  return null;
}

export async function getGlobalGitIdentity(cwd: string = homedir()): Promise<GitOpResult<GitIdentity>> {
  const name = await readKey(cwd, 'user.name');
  const email = await readKey(cwd, 'user.email');
  if (name === null || email === null) return failure("Couldn't read the global git config.");
  return ok({ name, email });
}

export async function setGlobalGitIdentity(
  identity: GitIdentity,
  cwd: string = homedir(),
  queue: WriteQueue = defaultQueue,
): Promise<GitOpResult<GitIdentity>> {
  return queue.run(GLOBAL_CONFIG_KEY, async () => {
    for (const [key, value] of [
      ['user.name', identity.name],
      ['user.email', identity.email],
    ] as const) {
      const res = await execGit(cwd, ['config', '--global', key, value], { write: true });
      if (res.exitCode !== 0) return failure(`Couldn't set ${key}.`, res.stderr);
    }
    return getGlobalGitIdentity(cwd);
  });
}
