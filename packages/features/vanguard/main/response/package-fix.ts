import { access } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';

import {
  detectPackageManager,
  packageFixBranch,
  removePackageArgv,
  updatePackageArgv,
  type PackageArgv,
  type PackageManager,
} from '@midnite/studio-runtime';
import type { SecurityFinding } from '@midnite/studio-shared';

import type { SensorRunProcess } from '../sensor-host';
import { expandHome } from './target';

/**
 * A Guard package fix (Phase 122 Theme G): `update-package` and `remove-package` run on a new branch in a throwaway
 * `git worktree`, never in the user's working tree and never on the branch they are on. The package manager's argv
 * comes from the runtime's `package-argv.ts` (lifecycle scripts off, lockfile only where the manager has the flag);
 * nothing is pushed, no PR is opened, and there is no sudo anywhere on the path. The branch carries one commit of the
 * tracked files the manager changed.
 */

const LOCKFILES = ['pnpm-lock.yaml', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'Cargo.lock'] as const;
const EXISTING_BRANCH_HINT = 'A branch for this fix already exists; delete or merge it first.';
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const GIT_TIMEOUT_MS = 30 * 1000;

export interface PackageTarget {
  /** The directory holding the lockfile. */
  dir: string;
  manager: PackageManager;
}

const exists = async (path: string): Promise<boolean> => access(path).then(() => true, () => false);

/**
 * Where the finding's evidence points: a lockfile (its manager is the file name) or a path inside `node_modules`
 * (the repo is what is above it, and the lockfile found beside it decides the manager). Home-folded paths are expanded.
 */
export async function locatePackageTarget(finding: SecurityFinding, home: string): Promise<PackageTarget | null> {
  for (const item of finding.evidence) {
    if (item.kind !== 'path') continue;
    const path = expandHome(item.path, home);
    const direct = detectPackageManager(path);
    if (direct) return { dir: dirname(path), manager: direct };
    const at = path.indexOf('/node_modules/');
    if (at <= 0) continue;
    const dir = path.slice(0, at);
    for (const name of LOCKFILES) {
      const manager = detectPackageManager(name);
      if (manager && (await exists(join(dir, name)))) return { dir, manager };
    }
  }
  return null;
}

export interface PackageFixCommand {
  file: string;
  args: string[];
  /** Relative to the worktree root. */
  cwd: string;
}

export interface PackageFixPlan {
  branch: string;
  worktree: string;
  commands: string[];
  title: string;
  /** What the user is shown: every command, exactly as it will run. */
  summary: string;
  warnings: string[];
}

export type PackageFixAction =
  | { id: 'update-package'; name: string; from: string; to: string }
  | { id: 'remove-package'; name: string; version: string };

export function packageFixArgv(action: PackageFixAction, manager: PackageManager): PackageArgv | null {
  return action.id === 'update-package'
    ? updatePackageArgv(manager, action.name, action.to, { lockfileOnly: true })
    : removePackageArgv(manager, action.name, { lockfileOnly: true });
}

export const worktreeDirFor = (userData: string, branch: string): string => join(userData, 'guard', 'fix-worktrees', branch.replace(/\//g, '-'));

export const commitMessage = (action: PackageFixAction): string =>
  action.id === 'update-package'
    ? `fix(deps): update ${action.name} from ${action.from} to ${action.to}`
    : `fix(deps): remove ${action.name}@${action.version}`;

export function describeFix(action: PackageFixAction, target: PackageTarget, branch: string, worktree: string, argv: PackageArgv): PackageFixPlan {
  const commands = [
    `git worktree add -b ${branch} ${worktree} HEAD`,
    `${argv.file} ${argv.args.join(' ')}`,
    'git add -u && git commit',
    `git worktree remove ${worktree}`,
  ];
  const verb = action.id === 'update-package' ? `Update ${action.name} to ${action.to}` : `Remove ${action.name}`;
  return {
    branch,
    worktree,
    commands,
    title: `${verb} on a new branch?`,
    summary:
      `Makes branch ${branch} from the current commit in a temporary worktree, runs the package manager there, commits the changed tracked files and removes the worktree. ` +
      'Your working tree and your current branch are not touched, nothing is pushed and no pull request is opened.',
    warnings: [
      ...(target.manager === 'yarn' ? ['yarn has no flag to skip install scripts: the new version’s install scripts may run.'] : []),
      'No administrator rights are used. Read the diff before you merge the branch.',
    ],
  };
}

type Outcome = { ok: true; detail: string } | { ok: false; error: string };

/** Runs the fix. Any failure after the worktree exists removes it and the branch this run created. */
export async function runPackageFix(input: {
  action: PackageFixAction;
  target: PackageTarget;
  argv: PackageArgv;
  branch: string;
  worktree: string;
  runProcess: SensorRunProcess;
}): Promise<Outcome> {
  const { action, target, argv, branch, worktree, runProcess } = input;
  const git = async (cwd: string, args: string[], timeoutMs = GIT_TIMEOUT_MS) => runProcess('git', ['-C', cwd, ...args], { timeoutMs });
  const fail = (hint: string): { ok: false; error: string } => ({ ok: false, error: hint });

  const top = await git(target.dir, ['rev-parse', '--show-toplevel']);
  if (!top.ok || top.exitCode !== 0) return fail(`${target.dir} is not inside a git repository, so there is no branch to put the fix on.`);
  const root = top.stdout.trim();
  const rel = relative(root, target.dir);

  const clash = await git(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
  if (clash.ok && clash.exitCode === 0) return fail(EXISTING_BRANCH_HINT);

  const added = await git(root, ['worktree', 'add', '-b', branch, worktree, 'HEAD']);
  if (!added.ok || added.exitCode !== 0) return fail(`Could not make a worktree for the fix: ${added.ok ? added.stderr.trim() : added.hint}`);

  const cleanUp = async (): Promise<void> => {
    await git(root, ['worktree', 'remove', '--force', worktree]);
    await git(root, ['branch', '-D', branch]);
  };

  const ran = await runProcess(argv.file, argv.args, { cwd: join(worktree, rel), timeoutMs: INSTALL_TIMEOUT_MS });
  if (!ran.ok || ran.exitCode !== 0) {
    await cleanUp();
    return fail(ran.ok ? `${argv.file} failed: ${ran.stderr.trim().slice(0, 400)}` : `${argv.file} did not run: ${ran.hint}`);
  }

  await git(worktree, ['add', '-u']);
  const staged = await git(worktree, ['diff', '--cached', '--quiet']);
  if (staged.ok && staged.exitCode === 0) {
    await cleanUp();
    return fail(`${basename(argv.file)} changed nothing, so there is nothing to commit.`);
  }
  // The repo's own hooks are arbitrary code and are not run for a commit the app makes.
  const committed = await git(worktree, ['-c', 'core.hooksPath=/dev/null', 'commit', '-m', commitMessage(action)]);
  if (!committed.ok || committed.exitCode !== 0) {
    await cleanUp();
    return fail(`Could not commit the change: ${committed.ok ? committed.stderr.trim().slice(0, 400) : committed.hint}`);
  }
  await git(root, ['worktree', 'remove', '--force', worktree]);
  return { ok: true, detail: `Committed on branch ${branch} in ${root}. Push it and open a pull request from Git when you have read the diff.` };
}

export { packageFixBranch };
