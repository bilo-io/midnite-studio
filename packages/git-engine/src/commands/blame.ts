import type { BlameResult, GitOpResult } from '@midnite/git-shared';

import { execGit } from '../exec/git-exec';
import { parseBlame } from '../parsers/blame-parser';

export type BlameOptions = {
  relPath: string;
  rev?: string;
  followRenames?: boolean;
};

export async function readBlame(
  worktreePath: string,
  options: BlameOptions,
): Promise<GitOpResult<BlameResult>> {
  const args = ['blame', '--porcelain'];
  if (options.followRenames) {
    args.push('-C', '-M');
  }
  if (options.rev) {
    args.push(options.rev);
  }
  args.push('--', options.relPath);

  const res = await execGit(worktreePath, args);
  if (res.exitCode !== 0) {
    return {
      ok: false,
      kind: 'error',
      message: res.stderr.trim() || `git blame failed for ${options.relPath}`,
    };
  }

  const result = parseBlame(res.stdout, options.relPath, options.rev);
  return {
    ok: true,
    value: result,
  };
}
