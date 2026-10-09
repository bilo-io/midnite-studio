import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { app } from 'electron';
import { CHANNELS } from '@midnite/studio-shared';
import { handleBare, handleOp } from './handle.js';
import {
  CLI_NAME,
  LEGACY_CLI_NAME,
  aliasTargetFor,
  pathExportLine,
  preferredTargets,
  type CliInstallState,
} from '../cli-path.js';
import * as S from '@midnite/studio-shared';

/** Directory holding the bundled `midnite` script and the deprecated `midnite-studio` wrapper. */
function getBundleBinDir(): string {
  if (app.isPackaged) {
    return `${process.resourcesPath}/bin`;
  }
  return `${app.getAppPath()}/resources/bin`;
}

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

export function linkState(path: string, bundleBinDir: string = getBundleBinDir()): LinkState {
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

/** An owned link whose target still exists (a dangling one is stale and gets replaced, not reported). */
const liveOwned = (path: string): boolean => linkState(path) === 'owned' && existsSync(path);

function relink(linkPath: string, to: string): void {
  if (linkState(linkPath) !== 'none') unlinkSync(linkPath);
  symlinkSync(to, linkPath);
}

const foreignPrimaryNotice = (path: string, aliasInstalled: boolean): string =>
  `A \`${CLI_NAME}\` command already exists at ${path} and is not Midnite Studio's (it may belong to the original midnite app), so it was left untouched.` +
  (aliasInstalled ? ` Only the deprecated \`${LEGACY_CLI_NAME}\` alias is installed.` : '');

/**
 * Whether `target`'s directory is on PATH (Phase 98 Theme G). `shell-path.ts`
 * folds the login shell's PATH into `process.env` at boot, so this is the PATH
 * a new terminal gets — not launchd's bare one a Finder-launched app starts with.
 */
export function onPathFields(
  target: string,
  path: string | undefined = process.env['PATH'],
): { onPath: boolean; pathExportLine: string | null } {
  const dir = dirname(target);
  const onPath = (path ?? '').split(':').some((entry) => entry.replace(/\/+$/, '') === dir);
  return { onPath, pathExportLine: onPath ? null : pathExportLine(dir) };
}

function getCliStatus(): CliInstallState {
  for (const target of preferredTargets(homedir())) {
    const alias = aliasTargetFor(target);
    const primary = linkState(target);
    const legacy = linkState(alias);
    const aliasInstalled = liveOwned(alias);

    if (primary === 'owned' && existsSync(target)) {
      return {
        installed: true,
        path: target,
        target,
        managed: true,
        command: CLI_NAME,
        aliasInstalled,
        ...onPathFields(target),
      };
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
          ...onPathFields(alias),
        };
      }
      return { installed: true, path: target, target, managed: false, ...onPathFields(target) };
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
        ...onPathFields(alias),
      };
    }
    if (legacy === 'foreign') {
      return { installed: true, path: alias, target: alias, managed: false, ...onPathFields(alias) };
    }
  }

  return {
    installed: false,
    path: null,
    target: null,
    managed: false,
  };
}

export function registerCliHandlers(): void {
  handleBare(CHANNELS.cliStatus, async () => {
    return getCliStatus();
  });

  handleOp(CHANNELS.cliInstall, S.CliInstallRequest, async (req) => {
    const targets = preferredTargets(homedir());
    const binDir = getBundleBinDir();

    const targetList: string[] = req.target === 'user' ? (targets[1] ? [targets[1]] : []) : targets;
    let installed = false;
    let lastError: Error | null = null;
    let notice: string | null = null;

    for (const target of targetList) {
      if (!target) continue;
      try {
        const dir = dirname(target);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const alias = aliasTargetFor(target);
        const primaryForeign = linkState(target) === 'foreign';
        const aliasForeign = linkState(alias) === 'foreign';
        if (primaryForeign && aliasForeign) {
          throw new Error(`${target} and ${alias} already exist and are unmanaged`);
        }
        // Never clobber a `midnite` that is not ours; the alias still goes in so
        // the command people already know keeps working.
        if (!primaryForeign) relink(target, `${binDir}/${CLI_NAME}`);
        if (!aliasForeign) relink(alias, `${binDir}/${LEGACY_CLI_NAME}`);
        notice = primaryForeign ? foreignPrimaryNotice(target, true) : null;
        installed = true;
        break;
      } catch (err: unknown) {
        lastError = err as Error;
      }
    }

    if (!installed) {
      return {
        ok: false,
        kind: 'error',
        message: lastError?.message ?? 'Failed to install CLI binary',
      };
    }

    const value = getCliStatus();
    return { ok: true, value: notice ? { ...value, notice } : value };
  });

  handleOp(CHANNELS.cliUninstall, S.CliUninstallRequest, async () => {
    let removed = false;
    let foreign: string | null = null;
    try {
      for (const target of preferredTargets(homedir())) {
        for (const path of [target, aliasTargetFor(target)]) {
          const state = linkState(path);
          if (state === 'owned') {
            unlinkSync(path);
            removed = true;
          } else if (state === 'foreign') {
            foreign = path;
          }
        }
      }
    } catch (err: unknown) {
      return {
        ok: false,
        kind: 'error',
        message: (err as Error).message ?? 'Failed to uninstall CLI symlink',
      };
    }

    if (!removed && foreign) {
      return {
        ok: false,
        kind: 'error',
        message: 'CLI symlink is unmanaged and cannot be uninstalled automatically',
      };
    }
    return { ok: true, value: getCliStatus() };
  });
}
