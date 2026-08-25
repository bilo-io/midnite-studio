import { execGit } from '../exec/git-exec';

/**
 * Which of these paths does `.gitignore` match?
 *
 * One batched `git check-ignore --stdin -z` per directory listing — never a
 * spawn per entry. Paths go in NUL-delimited and come back NUL-delimited
 * (`-z` on both sides), the house rule: file names contain newlines and
 * spaces, and this is exactly where splitting on either would corrupt them.
 *
 * Exit codes are data here, not errors: 0 = at least one path is ignored,
 * 1 = none are, anything else (128 = not a repo, -1 = spawn failure) degrades
 * to "nothing ignored" — a listing with no dimming beats no listing.
 */
export async function checkIgnored(
  repoPath: string,
  relPaths: readonly string[],
): Promise<Set<string>> {
  if (relPaths.length === 0) return new Set();

  const res = await execGit(
    repoPath,
    ['check-ignore', '--stdin', '-z'],
    { stdin: relPaths.join('\0') },
  );
  if (res.exitCode !== 0 || res.stdout.length === 0) return new Set();

  const matched = res.stdout.split('\0');
  // `-z` terminates every record, so the final split token is an empty string.
  if (matched[matched.length - 1] === '') matched.pop();
  return new Set(matched);
}
