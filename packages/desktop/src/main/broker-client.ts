import type { ChildProcess } from 'node:child_process';
import type * as net from 'node:net';
import { join } from 'node:path';

import { createBrokerService, type BrokerClient } from '@midnite/studio-runtime';

import { capFile } from './log-sink';
import { brokerSocketName, fingerprintFile } from './socket-name';

/**
 * Studio's binding of the runtime's pty broker service (Phase 113 Theme D).
 *
 * The client itself — connect, spawn, legacy-peer discovery, the stale →
 * retire → respawn order — moved to `@midnite/studio-runtime`'s
 * `broker/client.ts`. This module is what Studio composes it with, and it
 * fills the broker's identity in exactly as the client used to derive it for
 * itself: sockets under `<userData>/broker`, the `broker.js` that sits beside
 * this bundle (out of `app.asar`), and desktop's log rotation. So the socket
 * path, the build fingerprint and therefore which broker Studio finds are
 * unchanged — and `broker-client.test.ts`, written against the old module,
 * runs against the moved code through this one.
 *
 * Studio attaches as the `studio` app. Another app process composed from the
 * same runtime attaches through the same service and lands on the same
 * broker (`broker-two-apps.test.ts`).
 */

export type { BrokerClient, BrokerSessionInfo, BrokerStatus } from '@midnite/studio-runtime';
export { brokerSocketName, fingerprintFile };

export type BrokerClientDeps = {
  userDataDir: string;
  appVersion: string;
  isPackaged: boolean;
  /**
   * Fingerprint of the build this client belongs to; defaults to a content
   * hash of the broker script. Part of the socket name — see
   * {@link brokerSocketName} for why.
   */
  buildId?: string;
  log?: (message: string) => void;
  spawnBrokerProcess?: (scriptPath: string, args: string[], logFd: number) => ChildProcess;
  connectSocket?: (path: string) => net.Socket;
  spawnMaxAttempts?: number;
  spawnConnectTimeoutMs?: number;
};

/** The bundled broker entry, beside main's own bundle — unpacked, since a child process cannot run from inside an asar. */
export function studioBrokerScriptPath(): string {
  return join(__dirname, 'broker.js').replace('app.asar', 'app.asar.unpacked');
}

export function createBrokerClient(deps: BrokerClientDeps): BrokerClient {
  const { userDataDir, ...rest } = deps;
  return createBrokerService({
    ...rest,
    dataDir: userDataDir,
    brokerScriptPath: studioBrokerScriptPath(),
    capLogFile: capFile,
  }).attach('studio');
}
