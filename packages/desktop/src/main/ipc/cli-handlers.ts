import { homedir } from 'node:os';
import { app } from 'electron';
import { CHANNELS } from '@midnite/studio-shared';
import { createCliInstaller, onPathFields as runtimeOnPathFields } from '@midnite/studio-runtime';
import { handleBare, handleOp } from './handle.js';
import { preferredTargets } from '../cli-path.js';
import * as S from '@midnite/studio-shared';

/**
 * The `midnite` CLI's IPC surface. The installer itself — ownership test,
 * `midnite-studio` alias, foreign-binary refusal, notices — lives in the
 * runtime (`createCliInstaller`, Phase 113 Theme D); this file only binds it
 * to this app: its bundle's `bin/` directory, the real home directory and the
 * login-shell PATH.
 */

/** Directory holding the bundled `midnite` script and the deprecated `midnite-studio` wrapper. */
function getBundleBinDir(): string {
  if (app.isPackaged) {
    return `${process.resourcesPath}/bin`;
  }
  return `${app.getAppPath()}/resources/bin`;
}

/** Built per call so the bundle dir and targets are read when asked, as before the move. */
const installer = () =>
  createCliInstaller({
    bundleBinDir: getBundleBinDir(),
    homeDir: homedir(),
    path: process.env['PATH'],
    preferredTargets,
  });

/** `shell-path.ts` folds the login shell's PATH into `process.env` at boot, so the default is what a new terminal gets. */
export function onPathFields(
  target: string,
  path: string | undefined = process.env['PATH'],
): { onPath: boolean; pathExportLine: string | null } {
  return runtimeOnPathFields(target, path);
}

export function registerCliHandlers(): void {
  handleBare(CHANNELS.cliStatus, async () => installer().status());
  handleOp(CHANNELS.cliInstall, S.CliInstallRequest, async (req) => installer().install(req.target));
  handleOp(CHANNELS.cliUninstall, S.CliUninstallRequest, async () => installer().uninstall());
}
