import { createConnectionPool, driverFor, type ConnectionPool } from '@midnite/studio-db-engine';
import {
  CHANNELS,
  EVENT_CHANNELS,
  dbFailure,
  dbOk,
  schemas,
  type ConnectionConfig,
  type DbOpResult,
  type SchemaTree,
} from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import { nullConnectionsStore, type ConnectionsStore } from '../db/connections-store';
import { nullCredentialVault, type CredentialVault } from '../db/credential-vault';
import { cancelQuery, startQuery } from '../db/query-service';
import { handle, handleBare } from './handle';

/**
 * The Database view's IPC surface (Phase 61 Themes D). Every op returns
 * `DbOpResult` and never throws across the boundary — the same
 * "conflicts/errors are a normal outcome the UI renders" rule every other
 * channel in this file follows, adapted to a domain with no `conflict` arm.
 *
 * `registerDbHandlers()` takes no store, matching `registerRepoHandlers`'s
 * own `getWindow` thunk: it is called from the synchronous handler-
 * registration block, before `userData` is resolved. `configureDb(...)` is
 * called afterward, in the synchronous store-wiring block beside
 * `configureDiagnostics`.
 */

let connectionsStore: ConnectionsStore = nullConnectionsStore;
let credentialVault: CredentialVault = nullCredentialVault;

/**
 * One pooled connection per `ConnectionConfig.id`, shared across every
 * channel below. Connection pooling has no precedent in this repo — see
 * `connection-pool.ts`'s own doc comment for the concurrent-connect race it
 * guards against.
 */
const pool: ConnectionPool = createConnectionPool(driverFor);

/** Injected at boot with stores rooted at `app.getPath('userData')`. */
export function configureDb(nextStore: ConnectionsStore, nextVault: CredentialVault): void {
  connectionsStore = nextStore;
  credentialVault = nextVault;
}

/** Disconnect and drop every pooled connection — window teardown. */
export async function shutdownDb(): Promise<void> {
  await pool.evictAll();
}

async function passwordFor(config: ConnectionConfig): Promise<string | undefined> {
  const stored = await credentialVault.get(config.id);
  return stored ?? undefined;
}

export function registerDbHandlers(getWindow: () => BrowserWindow | null): void {
  handleBare(CHANNELS.dbListConnections, () => connectionsStore.list());

  handle(
    CHANNELS.dbSaveConnection,
    schemas.DbSaveConnectionRequest,
    async (req): Promise<DbOpResult<ConnectionConfig>> => {
      await connectionsStore.save(req.connection);
      if (req.password !== undefined) {
        await credentialVault.set(req.connection, req.password);
      } else {
        // No new password on this save — if the host/database changed under
        // an unchanged password field, the OLD password no longer describes
        // this connection. Revoke rather than silently reuse it.
        await credentialVault.reconcile(req.connection);
      }
      // A saved connection's driver may be stale (a pooled connection to the
      // OLD host/database under this same id) — evict so the next use
      // reconnects against what was just saved.
      await pool.evict(req.connection.id);
      return dbOk(req.connection);
    },
    (issue) => dbFailure(issue),
  );

  handle(
    CHANNELS.dbDeleteConnection,
    schemas.DbDeleteConnectionRequest,
    async (req): Promise<DbOpResult> => {
      await pool.evict(req.id);
      await connectionsStore.delete(req.id);
      await credentialVault.delete(req.id);
      return dbOk();
    },
    (issue) => dbFailure(issue),
  );

  handle(
    CHANNELS.dbTestConnection,
    schemas.DbTestConnectionRequest,
    async (req): Promise<DbOpResult> => {
      const password = req.password ?? (await passwordFor(req.connection));
      const driver = driverFor(req.connection, password);
      try {
        await driver.connect();
        return dbOk();
      } catch (err) {
        return dbFailure(err instanceof Error ? err.message : String(err));
      } finally {
        // Never pooled — a test connection is its own throwaway driver
        // instance, so a failed test never poisons a real pooled entry.
        await driver.disconnect().catch(() => {});
      }
    },
    (issue) => dbFailure(issue),
  );

  handle(
    CHANNELS.dbGetSchema,
    schemas.DbGetSchemaRequest,
    async (req): Promise<DbOpResult<SchemaTree>> => {
      const connection = await connectionsStore.get(req.connectionId);
      if (!connection) return dbFailure('That connection no longer exists.');
      try {
        const driver = await pool.get(connection, await passwordFor(connection));
        pool.touch(connection.id);
        return dbOk(await driver.introspect());
      } catch (err) {
        return dbFailure(err instanceof Error ? err.message : String(err));
      }
    },
    (issue) => dbFailure(issue),
  );

  /**
   * Resolves immediately, exactly like `logStart` — rows arrive as
   * `dbQueryBatch` events, and `dbQueryDone` ends the stream. A connection
   * that cannot be found or opened surfaces as a `dbQueryDone` carrying
   * `error`, not as a rejected `invoke`: a failure to even begin is not a
   * special case for the caller.
   */
  handle(
    CHANNELS.dbQueryStart,
    schemas.DbQueryStartRequest,
    async (req) => {
      const win = getWindow();
      if (!win) return;

      const connection = await connectionsStore.get(req.connectionId);
      if (!connection) {
        if (!win.isDestroyed()) {
          win.webContents.send(EVENT_CHANNELS.dbQueryDone, {
            requestId: req.requestId,
            rowCount: 0,
            truncated: false,
            durationMs: 0,
            error: 'That connection no longer exists.',
          });
        }
        return;
      }

      try {
        const driver = await pool.get(connection, await passwordFor(connection));
        pool.touch(connection.id);
        startQuery(win, driver, { requestId: req.requestId, sql: req.sql });
      } catch (err) {
        if (!win.isDestroyed()) {
          win.webContents.send(EVENT_CHANNELS.dbQueryDone, {
            requestId: req.requestId,
            rowCount: 0,
            truncated: false,
            durationMs: 0,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
    () => undefined,
  );

  handle(
    CHANNELS.dbQueryCancel,
    schemas.DbQueryCancelRequest,
    ({ requestId }) => {
      const win = getWindow();
      if (win) cancelQuery(win, requestId);
    },
    () => undefined,
  );
}
