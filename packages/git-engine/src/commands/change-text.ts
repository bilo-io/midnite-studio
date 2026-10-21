import { execGit } from '../exec/git-exec';

/**
 * The raw text of a checkout's pending changes, for a caller that wants to
 * *read* them (the commit box's "Write with AI") rather than render them.
 *
 * Read-only. Staged changes win: when anything is staged only that is
 * returned, because the commit about to be made contains exactly that. With
 * nothing staged it falls back to the working tree's tracked changes plus the
 * names of untracked files (`git diff` never shows those). Untracked names
 * come from `ls-files -z`, so paths containing newlines survive.
 */
export type ChangeText = {
  source: 'staged' | 'working';
  /** `git diff --stat` — always small, always complete. */
  stat: string;
  /** The full unified patch. The caller caps it; the engine does not. */
  patch: string;
  /** Untracked paths (working source only). */
  untracked: string[];
};

const DIFF_FLAGS = ['--no-color', '--no-ext-diff'] as const;

export async function readChangeText(cwd: string): Promise<ChangeText | null> {
  const cached = await execGit(cwd, ['diff', '--cached', ...DIFF_FLAGS, '--stat']);
  if (cached.exitCode === 0 && cached.stdout.trim().length > 0) {
    const patch = await execGit(cwd, ['diff', '--cached', ...DIFF_FLAGS]);
    return { source: 'staged', stat: cached.stdout, patch: patch.stdout, untracked: [] };
  }

  const stat = await execGit(cwd, ['diff', ...DIFF_FLAGS, '--stat']);
  const others = await execGit(cwd, ['ls-files', '-z', '--others', '--exclude-standard']);
  const untracked = others.exitCode === 0 ? others.stdout.split('\0').filter((p) => p.length > 0) : [];
  const hasTracked = stat.exitCode === 0 && stat.stdout.trim().length > 0;
  if (!hasTracked && untracked.length === 0) return null;

  const patch = hasTracked ? await execGit(cwd, ['diff', ...DIFF_FLAGS]) : null;
  return {
    source: 'working',
    stat: stat.stdout,
    patch: patch?.stdout ?? '',
    untracked,
  };
}
