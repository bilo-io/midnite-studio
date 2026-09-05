import type { ConnectionConfig } from '@midnite/studio-shared';

import type { DbDriver, DbDriverFactory } from './driver';

/** Default idle-timeout eviction: 5 minutes with no activity. */
export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

type PoolEntry = {
  driver: DbDriver;
  lastUsedAt: number;
};

/**
 * One pooled connection per `ConnectionConfig.id`.
 *
 * **Connection pooling has no precedent in this repo** (`grep -n "pool\|Pool"
 * packages/desktop/src/main/*.ts` finds nothing relevant) — this is new
 * machinery, not a reuse of an existing pattern.
 *
 * **The concurrent-connect race is guarded with an in-flight promise map,
 * checked before the first `await`.**
 * [`demo-api/server.ts:36-42`](../../desktop/src/main/demo-api/server.ts)
 * documents this exact bug already: two overlapping calls both passed a
 * synchronous "already exists" check before either had finished its own
 * async setup, and both bound a resource. The fix here is the same shape:
 * `get()` records the in-flight `connect()` promise in `connecting`
 * *synchronously*, before any `await` in its own body, so a second concurrent
 * call for the same id sees that entry and awaits the same promise instead of
 * starting a second connection.
 */
export type ConnectionPool = {
  /** Returns the pooled driver for this connection, connecting it if needed. */
  get(config: ConnectionConfig, password: string | undefined): Promise<DbDriver>;
  /** Marks a connection as freshly used, resetting its idle-eviction clock. */
  touch(id: string): void;
  /** Disconnect and drop one pooled connection, if it exists. */
  evict(id: string): Promise<void>;
  /** Disconnect and drop every connection idle for at least `idleTimeoutMs`. */
  evictIdle(now: number): Promise<void>;
  /** Disconnect and drop every pooled connection — window teardown. */
  evictAll(): Promise<void>;
  size(): number;
};

export function createConnectionPool(
  factory: DbDriverFactory,
  options: { idleTimeoutMs?: number } = {},
): ConnectionPool {
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const entries = new Map<string, PoolEntry>();
  const connecting = new Map<string, Promise<DbDriver>>();

  const get = async (config: ConnectionConfig, password: string | undefined): Promise<DbDriver> => {
    const existing = entries.get(config.id);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.driver;
    }

    // Checked BEFORE any `await` in this function's own body — see the
    // module docblock. A second concurrent call for the same id lands here
    // and awaits the SAME promise rather than racing a second `connect()`.
    const inFlight = connecting.get(config.id);
    if (inFlight) return inFlight;

    const connectPromise = (async () => {
      const driver = factory(config, password);
      await driver.connect();
      entries.set(config.id, { driver, lastUsedAt: Date.now() });
      return driver;
    })();

    connecting.set(config.id, connectPromise);
    try {
      return await connectPromise;
    } finally {
      connecting.delete(config.id);
    }
  };

  const evict = async (id: string): Promise<void> => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    await entry.driver.disconnect();
  };

  const evictIdle = async (now: number): Promise<void> => {
    const stale = [...entries.entries()]
      .filter(([, entry]) => now - entry.lastUsedAt >= idleTimeoutMs)
      .map(([id]) => id);
    for (const id of stale) await evict(id);
  };

  const evictAll = async (): Promise<void> => {
    const ids = [...entries.keys()];
    for (const id of ids) await evict(id);
  };

  return {
    get,
    touch: (id) => {
      const entry = entries.get(id);
      if (entry) entry.lastUsedAt = Date.now();
    },
    evict,
    evictIdle,
    evictAll,
    size: () => entries.size,
  };
}
