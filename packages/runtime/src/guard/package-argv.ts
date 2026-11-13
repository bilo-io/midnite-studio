import { basename } from 'node:path';

/** The package manager a lockfile belongs to. */
export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'cargo';

/** The lockfile name decides the manager (Theme G: "the repo's package manager detected from the lockfile"). */
export function detectPackageManager(lockfilePath: string): PackageManager | null {
  switch (basename(lockfilePath)) {
    case 'pnpm-lock.yaml':
      return 'pnpm';
    case 'package-lock.json':
    case 'npm-shrinkwrap.json':
      return 'npm';
    case 'yarn.lock':
      return 'yarn';
    case 'Cargo.lock':
      return 'cargo';
    default:
      return null;
  }
}

export interface PackageArgv {
  file: PackageManager;
  args: string[];
}

/** Names go to a package manager's argv, never a shell, but a name that looks like a flag is still refused. */
const SAFE = /^[A-Za-z0-9@][A-Za-z0-9@._/+-]*$/;
const safe = (value: string): boolean => SAFE.test(value);

/**
 * The argv that moves `name` to `to`: `pnpm up name@to`, `npm install name@to`, `yarn up name@to` (classic uses
 * `upgrade`, berry `up`; `up` is accepted by both), `cargo update -p name --precise to`. Null for a manager Guard
 * cannot drive or a value that is not a plain package name or version. The runner executes it on a branch with
 * lifecycle scripts off; this function only builds the vector.
 */
export function updatePackageArgv(manager: PackageManager, name: string, to: string): PackageArgv | null {
  if (!safe(name) || !safe(to)) return null;
  switch (manager) {
    case 'pnpm':
      return { file: 'pnpm', args: ['up', `${name}@${to}`, '--ignore-scripts'] };
    case 'npm':
      return { file: 'npm', args: ['install', `${name}@${to}`, '--ignore-scripts'] };
    case 'yarn':
      return { file: 'yarn', args: ['up', `${name}@${to}`] };
    case 'cargo':
      return { file: 'cargo', args: ['update', '-p', name, '--precise', to] };
  }
}

/** The argv that takes `name` out. Cargo removes from the manifest with `cargo remove`. */
export function removePackageArgv(manager: PackageManager, name: string): PackageArgv | null {
  if (!safe(name)) return null;
  switch (manager) {
    case 'pnpm':
      return { file: 'pnpm', args: ['remove', name, '--ignore-scripts'] };
    case 'npm':
      return { file: 'npm', args: ['uninstall', name, '--ignore-scripts'] };
    case 'yarn':
      return { file: 'yarn', args: ['remove', name] };
    case 'cargo':
      return { file: 'cargo', args: ['remove', name] };
  }
}

/** The branch a package fix is made on, never `main`. */
export function packageFixBranch(action: 'update' | 'remove' | 'pin', name: string, to?: string): string {
  const slug = `${name}${to ? `-${to}` : ''}`.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `guard/${action}-${slug}`.slice(0, 80);
}
