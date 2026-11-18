import { dirname } from 'node:path';
import * as net from 'node:net';

import { appDataDirectory } from '@midnite/studio-runtime/data-directory';
import { STUDIO_DISPLAY_NAME, SUITE_APP_DISPLAY_NAMES, type SuiteMcpAppId } from '@midnite/studio-shared';

import { resolveMcpSocketPath } from './socket-resolve';
import { resolveUserDataDir } from './user-data-dir';

export type SuiteSocket = { app: SuiteMcpAppId; displayName: string; socketPath: string };

export type ResolveSuiteSocketsOptions = {
  /** The apps to look for; defaults to every suite app with an MCP server. */
  apps?: Readonly<Record<string, string>>;
  /** The OS appData directory the suite apps' userData sits under; defaults to Studio's sibling. */
  appDataBase?: string;
  /** A socket file that does not accept a connection in this long is a dead leftover. */
  probeTimeoutMs?: number;
};

/** A live socket answers a connect almost at once; a crashed run's leftover file refuses it. */
export const SUITE_PROBE_TIMEOUT_MS = 300;

function accepts(socketPath: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath);
    const done = (ok: boolean): void => {
      clearTimeout(timer);
      socket.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    timer.unref?.();
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * Every running suite app's MCP socket (Phase 153 Theme B), in table order. A suite app's userData is
 * `<appData>/Midnite Runtime/apps/<id>` (`appDataDirectory`), not Studio's `<appData>/<name>`, so the dir
 * is built the way the app builds it. The probe keeps a stale `.sock` from a crashed run out of the list.
 * Studio is never here: the shim's default path already serves it.
 */
export async function resolveSuiteSockets(options: ResolveSuiteSocketsOptions = {}): Promise<SuiteSocket[]> {
  const apps = options.apps ?? SUITE_APP_DISPLAY_NAMES;
  const base = options.appDataBase ?? dirname(resolveUserDataDir(STUDIO_DISPLAY_NAME));
  const timeoutMs = options.probeTimeoutMs ?? SUITE_PROBE_TIMEOUT_MS;
  const found = await Promise.all(
    Object.entries(apps).map(async ([app, displayName]): Promise<SuiteSocket | null> => {
      const socketPath = resolveMcpSocketPath(appDataDirectory(base, app));
      if (!socketPath || !(await accepts(socketPath, timeoutMs))) return null;
      return { app: app as SuiteMcpAppId, displayName, socketPath };
    }),
  );
  return found.filter((entry): entry is SuiteSocket => entry !== null);
}
