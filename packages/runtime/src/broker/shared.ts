import type * as net from 'node:net';

import type { RuntimeAppId } from '../app-id';
import { readRuntimeHostRecord, type RuntimeHostRecord } from '../host/host-record';
import { openBrokerClient, type BrokerClient, type BrokerSessionInfo, type BrokerStatus } from './client';

/**
 * A guest app's way onto the runtime host's pty broker (`docs/APPS.md`, "The shared data plane").
 *
 * The host's broker socket is named by the host's build under the host's data directory, so a
 * guest cannot compute it; it reads it from the runtime host record instead. The client it opens is
 * a `guest`: it lists, snapshots, streams, writes to and resizes the host's sessions, and never
 * spawns, retires, shuts down or creates one.
 *
 * Re-resolves lazily: a guest opened before the host finds the broker on its next call once the
 * host has written its record, and one whose broker went away tries the record again.
 */

export type SharedBrokerOptions = {
  /** The runtime's data directory (where the host record lives). */
  runtimeDirectory: string;
  appId: RuntimeAppId;
  log?: (message: string) => void;
  connectSocket?: (path: string) => net.Socket;
  /** Injected in tests; defaults to reading the record from `runtimeDirectory`. */
  readRecord?: (runtimeDirectory: string) => RuntimeHostRecord | null;
};

export type SharedBroker = {
  /** The attached client, or null when no host has a broker running. */
  client(): Promise<BrokerClient | null>;
  /** Every live session the host's broker (and its legacy peers) serve, plus how it was reached. */
  listSessions(): Promise<{ sessions: BrokerSessionInfo[]; status: BrokerStatus }>;
  dispose(): Promise<void>;
};

const NONE: BrokerStatus = { mode: 'inproc', reason: 'no shared terminal broker is running' };

/** Open one guest client on a known broker socket — what {@link createSharedBroker} uses per resolve. */
export function attachSharedBroker(options: {
  socketPath: string;
  directory: string;
  appId: RuntimeAppId;
  log?: (message: string) => void;
  connectSocket?: (path: string) => net.Socket;
}): BrokerClient {
  const { log } = options;
  return openBrokerClient({
    role: 'guest',
    socketPath: options.socketPath,
    brokerDir: options.directory,
    dataDir: options.directory,
    // Unused by a guest (it never spawns or names a socket); present because the identity type needs them.
    appVersion: '',
    isPackaged: true,
    brokerScriptPath: '',
    buildId: 'guest',
    ...(log ? { log: (message: string) => log(message.replace('[broker]', `[broker:${options.appId}]`)) } : {}),
    ...(options.connectSocket ? { connectSocket: options.connectSocket } : {}),
  });
}

export function createSharedBroker(options: SharedBrokerOptions): SharedBroker {
  const readRecord = options.readRecord ?? readRuntimeHostRecord;
  let current: { client: BrokerClient; socketPath: string } | null = null;

  const client = async (): Promise<BrokerClient | null> => {
    if (current !== null && current.client.isAlive()) return current.client;
    const broker = readRecord(options.runtimeDirectory)?.broker ?? null;
    if (broker === null) return null;
    if (current !== null) await current.client.disconnect();
    const next = attachSharedBroker({ ...options, socketPath: broker.socketPath, directory: broker.directory });
    await next.init();
    current = { client: next, socketPath: broker.socketPath };
    return next.isAlive() ? next : null;
  };

  return {
    client,
    async listSessions() {
      const attached = await client();
      if (attached === null) return { sessions: [], status: current?.client.getStatus() ?? NONE };
      return { sessions: await attached.listSessions(), status: { mode: 'broker' } };
    },
    async dispose() {
      await current?.client.disconnect();
      current = null;
    },
  };
}
