import { symlinkSync, unlinkSync, readlinkSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { app } from 'electron';
import { CHANNELS } from '@midnite/studio-shared';
import { handleBare, handleOp } from './handle.js';
import { preferredTargets, type CliInstallState } from '../cli-path.js';
import * as S from '@midnite/studio-shared';

function getBundleBinPath(): string {
  if (app.isPackaged) {
    return `${process.resourcesPath}/bin/midnite-studio`;
  }
  return `${app.getAppPath()}/resources/bin/midnite-studio`;
}

function getCliStatus(): CliInstallState {
  const targets = preferredTargets(homedir());

  for (const target of targets) {
    if (existsSync(target)) {
      try {
        const resolved = readlinkSync(target);
        const managed = resolved.includes('midnite-studio') || resolved.includes('Midnite Studio');
        return {
          installed: true,
          path: target,
          target,
          managed,
        };
      } catch {
        return {
          installed: true,
          path: target,
          target,
          managed: false,
        };
      }
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
    const home = homedir();
    const targets = preferredTargets(home);
    const bundleBin = getBundleBinPath();

    const targetList: string[] = req.target === 'user' ? (targets[1] ? [targets[1]] : []) : targets;
    let installedTarget: string | null = null;
    let lastError: Error | null = null;

    for (const target of targetList) {
      if (!target) continue;
      try {
        const dir = dirname(target);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        if (existsSync(target)) {
          try {
            const resolved = String(readlinkSync(target));
            if (!resolved.includes('midnite-studio') && !resolved.includes('Midnite Studio')) {
              throw new Error(`Target ${target} exists and is unmanaged`);
            }
            unlinkSync(target);
          } catch (e: unknown) {
            const err = e as Error;
            if (err.message?.includes('unmanaged')) throw err;
          }
        }
        symlinkSync(bundleBin, target);
        installedTarget = target;
        break;
      } catch (err: unknown) {
        lastError = err as Error;
      }
    }

    if (!installedTarget) {
      return {
        ok: false,
        kind: 'error',
        message: lastError?.message ?? 'Failed to install CLI binary',
      };
    }

    return {
      ok: true,
      value: getCliStatus(),
    };
  });

  handleOp(CHANNELS.cliUninstall, S.CliUninstallRequest, async () => {
    const status = getCliStatus();
    if (!status.installed || !status.target) {
      return { ok: true, value: getCliStatus() };
    }

    if (!status.managed) {
      return {
        ok: false,
        kind: 'error',
        message: 'CLI symlink is unmanaged and cannot be uninstalled automatically',
      };
    }

    try {
      unlinkSync(status.target);
      return { ok: true, value: getCliStatus() };
    } catch (err: unknown) {
      const error = err as Error;
      return {
        ok: false,
        kind: 'error',
        message: error.message ?? 'Failed to uninstall CLI symlink',
      };
    }
  });
}
