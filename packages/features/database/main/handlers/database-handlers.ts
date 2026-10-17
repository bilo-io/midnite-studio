import { createConnectionPool, driverFor, type ConnectionPool } from '@midnite/studio-db-engine';
import type { FeatureMainContext } from '@midnite/studio-runtime';
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

import type { ConnectionsStore } from '../connections-store';
import type { CredentialVault } from '../credential-vault';
import { cancelQuery, startQuery, type QueryStreams } from '../query-service';

/**
 * The Database view's IPC surface (Phase 61 Themes D; a feature's since Phase 113 Theme O). Every op
 * returns `DbOpResult` and never throws across the boundary — the same "conflicts/errors are a normal
 * outcome the UI renders" rule every other channel follows, adapted to a domain with no `conflict` arm.
 *
 * What the composer owns arrives as {@link DatabaseHandlerServices}: where the connections are kept,
 * where a password is kept (the vault — in an app that is not the runtime host, the host's, behind the
 * pairing and the grants) and how an in-flight query stream is tracked. The password is read here, in
 * main, to open a connection; no handler answers one.
 */
export type DatabaseHandlerServices = {
  connections: ConnectionsStore;
  credentials: CredentialVault;
  streams: QueryStreams;
};

/**
 * One pooled connection per `ConnectionConfig.id`, shared across every channel below. Connection
 * pooling has no precedent in this repo — see `connection-pool.ts`'s own doc comment for the
 * concurrent-connect race it guards against.
 */
const pool: ConnectionPool = createConnectionPool(driverFor);

/** Disconnect and drop every pooled connection — window teardown and quit. */
export async function shutdownDb(): Promise<void> {
  await pool.evictAll();
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function registerDatabaseHandlers(ctx: FeatureMainContext, services: DatabaseHandlerServices): void {
  const { connections, credentials, streams } = services;

  async function passwordFor(config: ConnectionConfig): Promise<string | undefined> {
    const stored = await credentials.get(config.id);
    return stored ?? undefined;
  }

  ctx.ipc.handleBare(CHANNELS.dbListConnections, () => connections.list());

  ctx.ipc.handle(
    CHANNELS.dbSaveConnection,
    schemas.DbSaveConnectionRequest,
    async (req): Promise<DbOpResult<ConnectionConfig>> => {
      await connections.save(req.connection);
      try {
        if (req.password !== undefined) {
          await credentials.set(req.connection, req.password);
        } else {
          // No new password on this save — if the host/database changed under
          // an unchanged password field, the OLD password no longer describes
          // this connection. Revoke rather than silently reuse it.
          await credentials.reconcile(req.connection);
        }
      } catch (err) {
        // The vault refused (an app not granted the `db-credentials` namespace, say): the connection
        // is saved without a password and the user is told why, instead of an opaque rejected invoke.
        await pool.evict(req.connection.id);
        return dbFailure(`The connection was saved, but its password could not be stored: ${messageOf(err)}`);
      }
      // A saved connection's driver may be stale (a pooled connection to the
      // OLD host/database under this same id) — evict so the next use
      // reconnects against what was just saved.
      await pool.evict(req.connection.id);
      return dbOk(req.connection);
    },
    (issue) => dbFailure(issue),
  );

  ctx.ipc.handle(
    CHANNELS.dbDeleteConnection,
    schemas.DbDeleteConnectionRequest,
    async (req): Promise<DbOpResult> => {
      await pool.evict(req.id);
      await connections.delete(req.id);
      await credentials.delete(req.id);
      return dbOk();
    },
    (issue) => dbFailure(issue),
  );

  ctx.ipc.handle(
    CHANNELS.dbTestConnection,
    schemas.DbTestConnectionRequest,
    async (req): Promise<DbOpResult> => {
      const password = req.password ?? (await passwordFor(req.connection));
      const driver = driverFor(req.connection, password);
      try {
        await driver.connect();
        return dbOk();
      } catch (err) {
        return dbFailure(messageOf(err));
      } finally {
        // Never pooled — a test connection is its own throwaway driver
        // instance, so a failed test never poisons a real pooled entry.
        await driver.disconnect().catch(() => {});
      }
    },
    (issue) => dbFailure(issue),
  );

  ctx.ipc.handle(
    CHANNELS.dbGetSchema,
    schemas.DbGetSchemaRequest,
    async (req): Promise<DbOpResult<SchemaTree>> => {
      const connection = await connections.get(req.connectionId);
      if (!connection) return dbFailure('That connection no longer exists.');
      try {
        const driver = await pool.get(connection, await passwordFor(connection));
        pool.touch(connection.id);
        return dbOk(await driver.introspect());
      } catch (err) {
        return dbFailure(messageOf(err));
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
  const failedToStart = (requestId: string, error: string): void =>
    ctx.emit(EVENT_CHANNELS.dbQueryDone, { requestId, rowCount: 0, truncated: false, durationMs: 0, error });

  ctx.ipc.handle(
    CHANNELS.dbQueryStart,
    schemas.DbQueryStartRequest,
    async (req) => {
      const connection = await connections.get(req.connectionId);
      if (!connection) {
        failedToStart(req.requestId, 'That connection no longer exists.');
        return;
      }

      try {
        const driver = await pool.get(connection, await passwordFor(connection));
        pool.touch(connection.id);
        startQuery({ emit: ctx.emit, streams }, driver, {
          requestId: req.requestId,
          sql: req.sql,
          ...(req.params ? { params: req.params } : {}),
        });
      } catch (err) {
        failedToStart(req.requestId, messageOf(err));
      }
    },
    () => undefined,
  );

  ctx.ipc.handle(
    CHANNELS.dbQueryCancel,
    schemas.DbQueryCancelRequest,
    ({ requestId }) => {
      cancelQuery(streams, requestId);
    },
    () => undefined,
  );
}
