import type { GrepHit } from '@midnite/studio-shared';

import { execGit, spawnGit } from '../exec/git-exec';
import { type GrepMatch, parseGrep } from '../parsers/grep-parser';

export type GrepMode = 'fixed' | 'regex';

export type GrepOptions = {
  query?: string;
  pattern?: string;
  mode?: GrepMode;
  caseSensitive?: boolean;
  ignoreCase?: boolean;
  wholeWord?: boolean;
  wordMatch?: boolean;
  regexp?: boolean;
  maxPerFile?: number;
  rev?: string;
  paths?: readonly string[];
  contextLines?: number;
};

/**
 * `-e <query>` always, never a positional pattern — the one form that stays
 * safe when `query` itself starts with `-`. `mode` maps onto git's own
 * `-F`/`-E` rather than trusting the default (basic regex), so "fixed" and
 * "regex" are both explicit rather than one of them being "whatever git does
 * when you don't ask".
 */
export function buildGrepArgs(options: GrepOptions): string[] {
  const args = ['grep', '-z', '-n', '-I', '--no-color'];

  if (options.maxPerFile !== undefined) {
    args.push('-m', String(options.maxPerFile));
  }

  const isCaseSensitive = options.caseSensitive ?? (options.ignoreCase !== undefined ? !options.ignoreCase : false);
  if (!isCaseSensitive) args.push('-i');

  const isRegex = options.regexp ?? (options.mode === 'regex');
  if (isRegex) args.push('-E');
  else args.push('-F');

  const isWholeWord = options.wholeWord ?? options.wordMatch ?? false;
  if (isWholeWord) args.push('-w');

  if (options.contextLines && options.contextLines > 0) {
    args.push(`-C${options.contextLines}`);
  }

  const pattern = options.pattern ?? options.query ?? '';
  args.push('-e', pattern);

  if (options.rev) args.push(options.rev);
  if (options.paths?.length) args.push('--', ...options.paths);

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

export type GrepStream = {
  readonly done: Promise<{ total: number; error?: string }>;
  cancel(): void;
};

/**
 * Stream grep hits in batches.
 */
export function streamGrep(
  repoPath: string,
  options: GrepOptions,
  onBatch: (hits: GrepHit[]) => void,
  batchSize = 500,
): GrepStream {
  const child = spawnGit(repoPath, buildGrepArgs(options));

  let remainder = '';
  let pending: GrepHit[] = [];
  let total = 0;
  let stderr = '';
  let cancelled = false;

  const flush = (): void => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    onBatch(batch);
  };

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    const combined = remainder + chunk;
    const lines = combined.split('\n');
    remainder = lines.pop() ?? '';

    for (const line of lines) {
      if (!line) continue;
      const parsed = parseGrep(line);
      for (const m of parsed) {
        pending.push(m);
        total += 1;
        if (pending.length >= batchSize) flush();
      }
    }
  });

  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    if (stderr.length < 8192) stderr += chunk;
  });

  const done = new Promise<{ total: number; error?: string }>((resolve) => {
    const finish = (code: number | null): void => {
      if (remainder.length > 0) {
        const parsed = parseGrep(remainder);
        for (const m of parsed) {
          pending.push(m);
          total += 1;
        }
      }
      remainder = '';
      flush();

      if (cancelled || code === 0 || code === 1 || total > 0) {
        resolve({ total });
      } else {
        resolve({ total, error: stderr.trim() || `git grep exited with ${code}` });
      }
    };

    child.on('close', finish);
    child.on('error', (err: Error) => {
      stderr += err.message;
      finish(-1);
    });
  });

  return {
    done,
    cancel: () => {
      cancelled = true;
      child.kill();
    },
  };
}

