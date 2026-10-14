import { join } from 'node:path';

import type { RuntimeAppId } from '../app-id';
import { openBrokerClient, type BrokerClient, type BrokerClientOptions } from './client';
import { brokerSocketName, fingerprintFile } from './socket-name';

/**
 * The pty broker as a runtime service — Phase 113 Theme D, item 2.
 *
 * The broker was always a separate, detached process reached over a Unix
 * socket, so "every app attaches to it" needs no new transport: what has to
 * be the runtime's rather than an app's is the broker's **identity** — the
 * socket directory, the version and the build fingerprint that name the
 * socket, and the script that gets spawned. Any process holding the same
 * {@link BrokerServiceOptions} computes the same socket path, so two apps
 * attach to one broker and see each other's sessions (the server broadcasts
 * output and answers `list` for every client). An app never picks its own
 * broker directory or script; it is handed this service.
 *
 * Unchanged on purpose, because `CLAUDE.md`'s broker bullet depends on it:
 *
 * - **Build-fingerprinted socket names** (`brokerSocketName`): a runtime
 *   update brings a new `buildId`, so its clients spawn a fresh broker and
 *   find the previous one in the same directory as a *legacy* peer whose
 *   sessions stay reachable until they end.
 * - **Stale → retire → respawn, in that order** (`client.ts`'s
 *   `retireStalePrimary`): the stale broker steps off the path before its
 *   successor binds it.
 *
 * The fingerprint is computed once, here, and handed to every client, so two
 * apps attached through one service can never disagree about which socket is
 * current.
 */
export type BrokerServiceOptions = Omit<BrokerClientOptions, 'brokerDir' | 'log' | 'buildId'> & {
  /** The runtime's data directory; the broker's sockets and log live in `<dataDir>/broker`. */
  dataDir: string;
  /** Overrides the content hash of the broker script — tests, and a composer that already has it. */
  buildId?: string;
  /** Log sink; each attached client's lines are tagged with its app id unless it is Studio. */
  log?: (message: string) => void;
};

export interface BrokerService {
  /** Where the current build's broker listens — the same for every app attached here. */
  readonly socketPath: string;
  readonly buildId: string;
  /**
   * A client connection for `appId`. Call `init()` on it to connect (or spawn
   * the broker if none is listening); each app process attaches once.
   */
  attach(appId: RuntimeAppId): BrokerClient;
}

export function createBrokerService(options: BrokerServiceOptions): BrokerService {
  const { log, ...rest } = options;
  const brokerDir = join(options.dataDir, 'broker');
  const buildId = options.buildId ?? fingerprintFile(options.brokerScriptPath);
  const socketPath = join(brokerDir, brokerSocketName(options.appVersion, buildId, options.isPackaged));

  return {
    socketPath,
    buildId,
    attach(appId) {
      // Studio's lines stay exactly as they were; another app's say whose they are.
      const tagged =
        log && appId !== 'studio' ? (message: string) => log(message.replace('[broker]', `[broker:${appId}]`)) : log;
      return openBrokerClient({ ...rest, brokerDir, buildId, ...(tagged ? { log: tagged } : {}) });
    },
  };
}
