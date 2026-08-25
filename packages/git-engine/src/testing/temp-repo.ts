import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execGit } from '../exec/git-exec';

/**
 * A throwaway repository for integration tests.
 *
 * Real git, not fixtures: the parsers are only worth anything if they match what
 * the actual binary emits, and format details (porcelain-v2 field counts, `-z`
 * framing, decoration syntax) are exactly the sort of thing a hand-written
 * fixture gets subtly wrong. The fixture-string unit tests cover the shapes that
 * are awkward to produce on demand; these cover that git really produces them.
 */
export class TempRepo {
  private constructor(readonly path: string) {}

  static async create(options: { initialBranch?: string; bare?: boolean } = {}): Promise<TempRepo> {
    // realpath, not the raw mkdtemp result: on macOS `/var` is a symlink to
    // `/private/var`, and git reports the resolved path — so every path
    // assertion would otherwise fail on a cosmetic prefix difference.
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'midnite-git-test-')));
    const args = ['init', `--initial-branch=${options.initialBranch ?? 'main'}`];
    if (options.bare) args.push('--bare');
    args.push(dir);

    await execGit(tmpdir(), args, { write: true, throwOnError: true });
    const repo = new TempRepo(dir);

    if (!options.bare) {
      // Identity + signing config must be local: the machine running the tests
      // may have commit.gpgsign=true globally, which would make every commit
      // here prompt for a passphrase and hang.
      await repo.git(['config', 'user.name', 'Test User']);
      await repo.git(['config', 'user.email', 'test@example.com']);
      await repo.git(['config', 'commit.gpgsign', 'false']);
      await repo.git(['config', 'tag.gpgsign', 'false']);
    }

    return repo;
  }

  /** Run git in this repo, failing the test on a non-zero exit. */
  async git(args: string[]): Promise<string> {
    const res = await execGit(this.path, args, { write: true, throwOnError: true });
    return res.stdout;
  }

  async writeFile(relative: string, contents: string): Promise<void> {
    await writeFile(join(this.path, relative), contents, 'utf8');
  }

  /** Write, stage and commit in one step — the common case in these tests. */
  async commitFile(relative: string, contents: string, message: string): Promise<string> {
    await this.writeFile(relative, contents);
    await this.git(['add', '--', relative]);
    return this.commit(message);
  }

  async commit(message: string, extraArgs: string[] = []): Promise<string> {
    // `-F -` via stdin: a message with quotes or newlines needs no escaping.
    await execGit(this.path, ['commit', '-F', '-', ...extraArgs], {
      write: true,
      throwOnError: true,
      stdin: message,
    });
    return this.head();
  }

  async head(): Promise<string> {
    return (await this.git(['rev-parse', 'HEAD'])).trim();
  }

  async cleanup(): Promise<void> {
    await rm(this.path, { recursive: true, force: true });
  }
}
