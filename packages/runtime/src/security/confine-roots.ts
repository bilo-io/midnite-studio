import { execFile } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';

/**
 * The directories a confined session in `cwd` may write: its git toplevel, the common `.git` a linked
 * worktree commits into, and every linked worktree. A directory that is not a repo (a council member
 * runs in `$HOME`) yields no roots at all, so it is not handed write access to a whole home directory.
 */
export async function resolveSessionRoots(
  cwd: string,
  run: (args: string[], cwd: string) => Promise<string> = gitOutput,
): Promise<string[]> {
  try {
    const top = (await run(['rev-parse', '--show-toplevel'], cwd)).trim();
    if (!top) return [];
    const roots = [top];
    const common = (await run(['rev-parse', '--git-common-dir'], cwd)).trim();
    if (common) roots.push(isAbsolute(common) ? common : resolve(cwd, common));
    const list = await run(['worktree', 'list', '--porcelain'], cwd).catch(() => '');
    for (const line of list.split('\n')) {
      if (line.startsWith('worktree ')) roots.push(line.slice('worktree '.length).trim());
    }
    return [...new Set(roots.filter(Boolean))];
  } catch {
    return [];
  }
}

/** The parent of a `.git` common dir is the primary checkout; exported for the registry filter. */
export function checkoutOfGitDir(gitDir: string): string {
  return gitDir.endsWith('/.git') ? dirname(gitDir) : gitDir;
}

function gitOutput(args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile('git', args, { cwd, timeout: 5000 }, (error, stdout) => (error ? reject(error) : resolvePromise(stdout)));
  });
}
