import { defineFeatureMain } from '@midnite/studio-runtime';

import { databaseManifest } from '../manifest';
import type { ConnectionsStore } from './connections-store';
import type { CredentialVault } from './credential-vault';
import { registerDatabaseHandlers, shutdownDb } from './handlers/database-handlers';
import { createQueryStreams, type QueryStreams } from './query-service';

export { databaseManifest, type DatabaseManifest } from '../manifest';
export {
  createConnectionsStore,
  nullConnectionsStore,
  parseConnectionsState,
  type ConnectionsStore,
} from './connections-store';
export {
  connectionFingerprint,
  createCredentialVault,
  credentialVaultPath,
  nullCredentialVault,
  type CredentialVault,
} from './credential-vault';
export { BATCH_SIZE, createQueryStreams, MAX_QUERY_ROWS, type QueryStreams } from './query-service';
export { shutdownDb };

/**
 * The Database feature's main half (Phase 113 Theme O) — saved connections, the pooled query service
 * and the credential vault binding, moved out of `packages/desktop/src/main/db` and `ipc/database.ts`.
 *
 * What only the composer knows arrives here:
 *
 * - **`connections`** — where the saved connections live ({@link createConnectionsStore} over the
 *   app's own userData, so each app keeps its own list). Every field but the password.
 * - **`credentials`** — where a connection's password lives ({@link createCredentialVault} over a
 *   `VaultClient`). **Passwords never reach a renderer**: the wire carries one only on a save
 *   (renderer to main, write-only) and nothing answers one. In Studio the client is its own vault; in
 *   an app that is not the runtime host it is the host's, over its socket, behind the pairing and the
 *   grants — a denied `db-credentials` read is a connection with no password, and a denied write is a
 *   sentence in the save's answer, never a stored value.
 * - **`streams`** — where in-flight query streams are tracked. Studio hands its per-window registry
 *   (shared with the commit log and the search); the default is one in-memory registry.
 *
 * Call {@link shutdownDb} on quit: it disconnects every pooled connection.
 */
export type DatabaseMainServices = {
  connections: ConnectionsStore;
  credentials: CredentialVault;
  streams?: QueryStreams;
};

export const databaseMain = defineFeatureMain<DatabaseMainServices>({
  feature: databaseManifest.feature,
  channels: databaseManifest.ipc,
  register(ctx, services) {
    registerDatabaseHandlers(ctx, {
      connections: services.connections,
      credentials: services.credentials,
      streams: services.streams ?? createQueryStreams(),
    });
  },
});
