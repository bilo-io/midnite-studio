import { execGit } from '../exec/git-exec';
import { type GrepMatch, parseGrep } from '../parsers/grep-parser';

export type GrepMode = 'fixed' | 'regex';

export type GrepOptions = {
  query: string;
  mode: GrepMode;
  caseSensitive: boolean;
  wholeWord: boolean;
  /** `-m`: per-file match cap. git enforces this natively, so a broad query
   *  in one huge generated file cannot dominate the whole response. */
  maxPerFile: number;
};

/**
 * `-e <query>` always, never a positional pattern — the one form that stays
 * safe when `query` itself starts with `-`. `mode` maps onto git's own
 * `-F`/`-E` rather than trusting the default (basic regex), so "fixed" and
 * "regex" are both explicit rather than one of them being "whatever git does
 * when you don't ask".
 */
export function buildGrepArgs(options: GrepOptions): string[] {
  const args = ['grep', '-z', '-n', '-I', '--no-color', '-m', String(options.maxPerFile)];
  if (!options.caseSensitive) args.push('-i');
  if (options.wholeWord) args.push('-w');
  args.push(options.mode === 'fixed' ? '-F' : '-E');
  args.push('-e', options.query);
  return args;
}

export type GrepResult =
  | { ok: true; matches: GrepMatch[] }
  | { ok: false; message: string };

/**
 * Search the tracked working tree. Modelled on `checkIgnored` in `ignore.ts`:
 * one batched call, NUL-delimited output, plain `execGit` over `dugite`.
 *
 * Exit codes are data, not exceptions: 0 is matches, 1 is git's own "no
 * matches" (empty stdout, not a failure), and anything else — most commonly
 * 128 for a malformed regex — surfaces stderr as the one message the caller
 * has to explain a failed search with.
 */
export async function readGrep(repoPath: string, options: GrepOptions): Promise<GrepResult> {
  const res = await execGit(repoPath, buildGrepArgs(options));
  if (res.exitCode === 0) return { ok: true, matches: parseGrep(res.stdout) };
  if (res.exitCode === 1) return { ok: true, matches: [] };
  return { ok: false, message: res.stderr.trim() || `git grep exited ${res.exitCode}` };
}
