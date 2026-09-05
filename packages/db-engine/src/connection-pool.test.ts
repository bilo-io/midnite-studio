import { describe, expect, it, vi } from 'vitest';

import type { ConnectionConfig } from '@midnite/studio-shared';

import { createConnectionPool } from './connection-pool';
import type { DbDriver, DbDriverFactory } from './driver';

function fakeConfig(id: string): ConnectionConfig {
  return { id, name: id, provider: 'postgres', database: 'app' };
}

/** A driver whose `connect()` resolves only when the test releases it. */
function makeControllableDriver(): { driver: DbDriver; resolveConnect: () => void } {
  let resolveConnect!: () => void;
  const connectGate = new Promise<void>((resolve) => {
    resolveConnect = resolve;
  });
  const driver: DbDriver = {
    connect: async () => {
      await connectGate;
    },
    disconnect: async () => {},
    query: async () => ({ rowCount: 0 }),
    introspect: async () => ({ connectionId: 'x', tables: [] }),
  };
  return { driver, resolveConnect: () => resolveConnect() };
}

describe('createConnectionPool', () => {
  it('connects once for two overlapping get() calls on the same id', async () => {
    const controllable = makeControllableDriver();
    let connectCallCount = 0;
    const factory: DbDriverFactory = vi.fn(() => {
      connectCallCount++;
      return controllable.driver;
    });

    const pool = createConnectionPool(factory);
    const config = fakeConfig('c1');

    // Two overlapping invocations, exactly the double-clicked-button /
    // double-invoked-effect shape `demo-api/server.ts` documents.
    const first = pool.get(config, undefined);
    const second = pool.get(config, undefined);

    // Only one driver instance should ever have been constructed — the
    // second call must have found the in-flight promise, not raced a new one.
    expect(connectCallCount).toBe(1);
    expect(factory).toHaveBeenCalledTimes(1);

    controllable.resolveConnect();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(pool.size()).toBe(1);
  });

  it('reuses the pooled driver on a subsequent get() once connected', async () => {
    const driver: DbDriver = {
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      query: async () => ({ rowCount: 0 }),
      introspect: async () => ({ connectionId: 'x', tables: [] }),
    };
    const factory: DbDriverFactory = vi.fn(() => driver);
    const pool = createConnectionPool(factory);
    const config = fakeConfig('c1');

    await pool.get(config, undefined);
    await pool.get(config, undefined);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(driver.connect).toHaveBeenCalledTimes(1);
  });

  it('evicts and disconnects an idle connection', async () => {
    const disconnect = vi.fn(async () => {});
    const driver: DbDriver = {
      connect: async () => {},
      disconnect,
      query: async () => ({ rowCount: 0 }),
      introspect: async () => ({ connectionId: 'x', tables: [] }),
    };
    const pool = createConnectionPool(() => driver, { idleTimeoutMs: 1000 });
    const config = fakeConfig('c1');

    const start = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(start);
    await pool.get(config, undefined);
    expect(pool.size()).toBe(1);

    await pool.evictIdle(start + 500);
    expect(pool.size()).toBe(1);
    expect(disconnect).not.toHaveBeenCalled();

    await pool.evictIdle(start + 2000);
    expect(pool.size()).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('touch() resets the idle clock', async () => {
    const disconnect = vi.fn(async () => {});
    const driver: DbDriver = {
      connect: async () => {},
      disconnect,
      query: async () => ({ rowCount: 0 }),
      introspect: async () => ({ connectionId: 'x', tables: [] }),
    };
    const pool = createConnectionPool(() => driver, { idleTimeoutMs: 1000 });
    const config = fakeConfig('c1');

    const start = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(start);
    await pool.get(config, undefined);

    vi.spyOn(Date, 'now').mockReturnValue(start + 900);
    pool.touch('c1');

    await pool.evictIdle(start + 1500);
    expect(disconnect).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('evictAll disconnects every pooled connection', async () => {
    const disconnect = vi.fn(async () => {});
    const factory: DbDriverFactory = () => ({
      connect: async () => {},
      disconnect,
      query: async () => ({ rowCount: 0 }),
      introspect: async () => ({ connectionId: 'x', tables: [] }),
    });
    const pool = createConnectionPool(factory);

    await pool.get(fakeConfig('c1'), undefined);
    await pool.get(fakeConfig('c2'), undefined);
    expect(pool.size()).toBe(2);

    await pool.evictAll();
    expect(pool.size()).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
