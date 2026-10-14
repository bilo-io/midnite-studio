import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import {
  aliasTargetFor,
  CLI_NAME,
  LEGACY_CLI_NAME,
  pathExportLine,
  preferredTargets as defaultPreferredTargets,
  type CliInstallState,
} from './cli-path';

/**
 * The `midnite` CLI installer — moved from desktop's `ipc/cli-handlers.ts`
 * into the runtime (Phase 113 Theme D), which now owns the command.
 *
 * Nothing here reads `electron`, `os.homedir()` or `process.env`: the bundle's
 * `bin/` directory, the home directory and PATH are all parameters, so a test
 * (or a second app's composer) points it at a temp directory and can never
 * touch a real `/usr/local/bin` or `~/.local/bin`. Behaviour is unchanged from
 * the desktop original — the `midnite` name, the deprecated `midnite-studio`
 * alias, never replacing a `midnite` that does not resolve into this app's
 * bundle, and the `notice` that says so.
 */

/**
 * What sits at a would-be install path.
 *
 * "Owned" means the symlink resolves into this app's bundle — the same test
 * for the status badge, the installer and the uninstaller, so they can never
 * disagree about whose file it is. Anything else (a plain binary, or a link
 * into another tool — notably the original midnite app's `@midnite/cli`,
 * which also names its command `midnite`) is foreign and is never touched.
 */
export type LinkState = 'none' | 'owned' | 'foreign';

/** Bundle layouts an owned link can resolve to, old installs and dev checkouts included. */
const OWNED_BIN = /(Midnite Studio\.app\/Contents\/Resources|packages\/desktop\/resources)\/bin\/midnite(-studio)?$/;

export function linkState(path: string, bundleBinDir: string): LinkState {
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return 'none';
  }
  if (!stat.isSymbolicLink()) return 'foreign';
  let resolved: string;
  try {
    resolved = resolve(dirname(path), readlinkSync(path));
  } catch {
    return 'foreign';
  }
  const name = basename(resolved);
  const inBundle = dirname(resolved) === bundleBinDir && (name === CLI_NAME || name === LEGACY_CLI_NAME);
  return inBundle || OWNED_BIN.test(resolved) ? 'owned' : 'foreign';
}

/**
 * Whether `target`'s directory is on PATH (Phase 98 Theme G). The login shell's
 * PATH is folded into `process.env` at boot, so the caller passes the PATH a
 * new terminal gets — not launchd's bare one a Finder-launched app starts with.
 */
export function onPathFields(
  target: string,
  path: string | undefined,
): { onPath: boolean; pathExportLine: string | null } {
  const dir = dirname(target);
  const onPath = (path ?? '').split(':').some((entry) => entry.replace(/\/+$/, '') === dir);
  return { onPath, pathExportLine: onPath ? null : pathExportLine(dir) };
}

const foreignPrimaryNotice = (path: string, aliasInstalled: boolean): string =>
  `A \`${CLI_NAME}\` command already exists at ${path} and is not Midnite Studio's (it may belong to the original midnite app), so it was left untouched.` +
  (aliasInstalled ? ` Only the deprecated \`${LEGACY_CLI_NAME}\` alias is installed.` : '');

export type CliInstallerOptions = {
  /** Directory holding the bundled `midnite` script and the `midnite-studio` wrapper. */
  bundleBinDir: string;
  homeDir: string;
  /** PATH to judge `onPath` against. */
  path?: string | undefined;
  /** Where the primary command may be linked, in order of preference. Defaults to `/usr/local/bin` then `~/.local/bin`. */
  preferredTargets?: (home: string) => string[];
};

export type CliInstallResult = { ok: true; value: CliInstallState } | { ok: false; kind: 'error'; message: string };

export type CliInstaller = {
  status(): CliInstallState;
  /** `target: 'user'` installs only into the second (user-local) target. */
  install(target?: string): CliInstallResult;
  uninstall(): CliInstallResult;
};

export function createCliInstaller(opts: CliInstallerOptions): CliInstaller {
  const { bundleBinDir, homeDir } = opts;
  const targets = (): string[] => (opts.preferredTargets ?? defaultPreferredTargets)(homeDir);
  const state = (path: string): LinkState => linkState(path, bundleBinDir);
  const onPath = (target: string) => onPathFields(target, opts.path);
  /** An owned link whose target still exists (a dangling one is stale and gets replaced, not reported). */
  const liveOwned = (path: string): boolean => state(path) === 'owned' && existsSync(path);

  function relink(linkPath: string, to: string): void {
    if (state(linkPath) !== 'none') unlinkSync(linkPath);
    symlinkSync(to, linkPath);
  }

  function status(): CliInstallState {
    for (const target of targets()) {
      const alias = aliasTargetFor(target);
      const primary = state(target);
      const legacy = state(alias);
      const aliasInstalled = liveOwned(alias);

      if (primary === 'owned' && existsSync(target)) {
        return { installed: true, path: target, target, managed: true, command: CLI_NAME, aliasInstalled, ...onPath(target) };
      }
      if (primary === 'foreign') {
        if (aliasInstalled) {
          return {
            installed: true,
            path: alias,
            target: alias,
            managed: true,
            command: LEGACY_CLI_NAME,
            aliasInstalled: true,
            notice: foreignPrimaryNotice(target, true),
            ...onPath(alias),
          };
        }
        return { installed: true, path: target, target, managed: false, ...onPath(target) };
      }
      if (aliasInstalled) {
        return {
          installed: true,
          path: alias,
          target: alias,
          managed: true,
          command: LEGACY_CLI_NAME,
          aliasInstalled: true,
          notice: `Installed under the old name \`${LEGACY_CLI_NAME}\`. Reinstall to migrate to \`${CLI_NAME}\`.`,
          ...onPath(alias),
        };
      }
      if (legacy === 'foreign') {
        return { installed: true, path: alias, target: alias, managed: false, ...onPath(alias) };
      }
    }
    return { installed: false, path: null, target: null, managed: false };
  }

  function install(target?: string): CliInstallResult {
    const all = targets();
    const targetList: string[] = target === 'user' ? (all[1] ? [all[1]] : []) : all;
    let installed = false;
    let lastError: Error | null = null;
    let notice: string | null = null;

    for (const t of targetList) {
      if (!t) continue;
      try {
        const dir = dirname(t);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const alias = aliasTargetFor(t);
        const primaryForeign = state(t) === 'foreign';
        const aliasForeign = state(alias) === 'foreign';
        if (primaryForeign && aliasForeign) {
          throw new Error(`${t} and ${alias} already exist and are unmanaged`);
        }
        // Never clobber a `midnite` that is not ours; the alias still goes in so
        // the command people already know keeps working.
        if (!primaryForeign) relink(t, `${bundleBinDir}/${CLI_NAME}`);
        if (!aliasForeign) relink(alias, `${bundleBinDir}/${LEGACY_CLI_NAME}`);
        notice = primaryForeign ? foreignPrimaryNotice(t, true) : null;
        installed = true;
        break;
      } catch (err: unknown) {
        lastError = err as Error;
      }
    }

    if (!installed) {
      return { ok: false, kind: 'error', message: lastError?.message ?? 'Failed to install CLI binary' };
    }
    const value = status();
    return { ok: true, value: notice ? { ...value, notice } : value };
  }

  function uninstall(): CliInstallResult {
    let removed = false;
    let foreign: string | null = null;
    try {
      for (const t of targets()) {
        for (const path of [t, aliasTargetFor(t)]) {
          const s = state(path);
          if (s === 'owned') {
            unlinkSync(path);
            removed = true;
          } else if (s === 'foreign') {
            foreign = path;
          }
        }
      }
    } catch (err: unknown) {
      return { ok: false, kind: 'error', message: (err as Error).message ?? 'Failed to uninstall CLI symlink' };
    }
    if (!removed && foreign) {
      return { ok: false, kind: 'error', message: 'CLI symlink is unmanaged and cannot be uninstalled automatically' };
    }
    return { ok: true, value: status() };
  }

  return { status, install, uninstall };
}
