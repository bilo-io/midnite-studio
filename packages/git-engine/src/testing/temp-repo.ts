import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

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
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'midnite-studio-test-')));
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

  /**
   * The identity every commit here is made with, pinned as ENV rather than
   * left to the local config above.
   *
   * Config is not enough: git reads `GIT_AUTHOR_NAME` and friends ahead of
   * `user.name`, so an environment that exports them — CI does, so that a
   * repo built by something other than this fixture can still commit — wins
   * over `git config user.name` and the author assertions read back whatever
   * the runner is called. That failed only on CI, where the variables are
   * set, which is the worst place to discover it.
   *
   * The config lines stay: they are what a plain `git` run inside one of these
   * repos by hand (debugging a failure, say) picks up.
   */
  private static readonly IDENTITY = {
    GIT_AUTHOR_NAME: 'Test User',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test User',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  } as const;

  /** Run git in this repo, failing the test on a non-zero exit. */
  async git(args: string[]): Promise<string> {
    const res = await execGit(this.path, args, {
      write: true,
      throwOnError: true,
      env: { ...TempRepo.IDENTITY },
    });
    return res.stdout;
  }

  /**
   * Run git WITHOUT failing the test on a non-zero exit.
   *
   * Some fixtures need a command that is supposed to fail: a conflicting
   * `git merge` exits 1 and leaves the unmerged index that the test is actually
   * about, so `git()`'s throwOnError would destroy the state being set up.
   */
  async gitAllowFailure(args: string[]): Promise<{ exitCode: number; stdout: string }> {
    const res = await execGit(this.path, args, { write: true, env: { ...TempRepo.IDENTITY } });
    return { exitCode: res.exitCode, stdout: res.stdout };
  }

  async writeFile(relative: string, contents: string): Promise<void> {
    const fullPath = join(this.path, relative);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, contents, 'utf8');
  }

  /** Write, stage and commit in one step — the common case in these tests. */
  async commitFile(relative: string, contents: string, message: string): Promise<string> {
    await this.writeFile(relative, contents);
    await this.git(['add', '--', relative]);
    return this.commit(message);
  }

  async commit(message: string, extraArgs: string[] | { author?: string } = []): Promise<string> {
    const args: string[] = [];
    if (Array.isArray(extraArgs)) {
      args.push(...extraArgs);
    } else if (extraArgs.author) {
      args.push(`--author=${extraArgs.author}`);
    }

    // `-F -` via stdin: a message with quotes or newlines needs no escaping.
    await execGit(this.path, ['commit', '-F', '-', ...args], {
      write: true,
      throwOnError: true,
      stdin: message,
      // The one call that actually stamps an identity, so the one that most
      // needs `IDENTITY` — it does not route through `git()` because the
      // message goes in over stdin.
      env: { ...TempRepo.IDENTITY },
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
