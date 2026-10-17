import { CHANNELS, defineFeatureManifest, EVENT_CHANNELS } from '@midnite/studio-shared';

/**
 * The Database feature — one of Coder's tabs (Phase 113 Theme O).
 *
 * The main half is the saved-connections store, the pooled connection per
 * connection id, schema introspection, the streamed query service and the
 * credential vault binding, moved out of `packages/desktop/src/main/db` and
 * `ipc/database.ts`. Every channel takes a connection id, never a host or a
 * password: main reads the connection from its own store and the password from
 * the vault.
 *
 * **A database password is a credential.** The wire carries it exactly once —
 * on `dbSaveConnection`, renderer to main, write-only — and no channel here
 * answers one: `ConnectionConfig` has no password field, the list is plain
 * metadata, and a connect reads the password from the vault in main. In an app
 * that is not the runtime host the vault is the host's over its socket, behind
 * the pairing and the grants.
 *
 * Imports `@midnite/studio-shared` and nothing else — the main-process
 * composer reads this file too.
 */
export const databaseManifest = defineFeatureManifest({
  feature: 'database',
  owner: 'coder',
  views: [
    {
      id: 'database',
      global: true,
      rail: { group: 'workspace', label: 'Database', description: 'Connections, schema tree and a query editor with results' },
    },
  ],
  settingsPages: [],
  ipc: [
    CHANNELS.dbListConnections,
    CHANNELS.dbSaveConnection,
    CHANNELS.dbDeleteConnection,
    CHANNELS.dbTestConnection,
    CHANNELS.dbGetSchema,
    CHANNELS.dbQueryStart,
    CHANNELS.dbQueryCancel,
  ],
  events: [EVENT_CHANNELS.dbQueryBatch, EVENT_CHANNELS.dbQueryDone],
  mcpTools: [],
});

export type DatabaseManifest = typeof databaseManifest;
