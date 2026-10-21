// @vitest-environment node
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, type ConnectionConfig } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The connection pool and drivers are mocked here: this is the IPC layer's own contract test
 * (save/list/delete round-trip, a failed connection surfacing `{ok:false}`), not a driver test —
 * those live in `db-engine` against a real, ephemeral instance (skipped without
 * `MSTUDIO_TEST_<PROVIDER>_*`; nothing here starts a database or a container).
 */
const { poolGet, poolTouch, poolEvict, poolEvictAll, driverForMock, startQueryMock } = vi.hoisted(() => ({
  poolGet: vi.fn(),
  poolTouch: vi.fn(),
  poolEvict: vi.fn(async () => {}),
  poolEvictAll: vi.fn(async () => {}),
  driverForMock: vi.fn(),
  startQueryMock: vi.fn(),
}));

vi.mock('@midnite/studio-db-engine', () => ({
  createConnectionPool: () => ({
    get: poolGet,
    touch: poolTouch,
    evict: poolEvict,
    evictIdle: vi.fn(async () => {}),
    evictAll: poolEvictAll,
    size: () => 0,
  }),
  driverFor: driverForMock,
}));

vi.mock('../query-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../query-service')>()),
  startQuery: startQueryMock,
}));

import type { CredentialVault } from '../credential-vault';
import { createQueryStreams } from '../query-service';
import { registerDatabaseHandlers, shutdownDb } from './database-handlers';

const postgres: ConnectionConfig = {
  id: 'c1',
  name: 'Local Postgres',
  provider: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'app',
  username: 'app_user',
};

function fakeStore() {
  const connections = new Map<string, ConnectionConfig>();
  return {
    list: vi.fn(async () => [...connections.values()]),
    get: vi.fn(async (id: string) => connections.get(id) ?? null),
    save: vi.fn(async (config: ConnectionConfig) => {
      connections.set(config.id, config);
    }),
    delete: vi.fn(async (id: string) => {
      connections.delete(id);
    }),
    _seed: (config: ConnectionConfig) => connections.set(config.id, config),
  };
}

function fakeVault(overrides: Partial<CredentialVault> = {}) {
  const passwords = new Map<string, string>();
  return {
    isAvailable: vi.fn(() => true),
    get: vi.fn(async (id: string) => passwords.get(id) ?? null),
    set: vi.fn(async (config: ConnectionConfig, password: string) => {
      passwords.set(config.id, password);
    }),
    delete: vi.fn(async (id: string) => {
      passwords.delete(id);
    }),
    reconcile: vi.fn(async () => {}),
    ...overrides,
  };
}

function setup(store = fakeStore(), vault = fakeVault()) {
  const ctx = createRecordingContext();
  const streams = createQueryStreams();
  registerDatabaseHandlers(ctx, { connections: store, credentials: vault, streams });
  return { ctx, store, vault, streams };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerDatabaseHandlers', () => {
  it('registers exactly the manifest invoke channels', () => {
    expect([...setup().ctx.channels].sort()).toEqual(
      [
        CHANNELS.dbListConnections,
        CHANNELS.dbSaveConnection,
        CHANNELS.dbDeleteConnection,
        CHANNELS.dbTestConnection,
        CHANNELS.dbGetSchema,
        CHANNELS.dbQueryStart,
        CHANNELS.dbQueryCancel,
      ].sort(),
    );
  });
});

describe('dbListConnections', () => {
  it('returns the store list — metadata only, never a password', async () => {
    const store = fakeStore();
    store._seed(postgres);
    const { ctx, vault } = setup(store);
    await vault.set(postgres, 'hunter2');

    const result = await ctx.invoke(CHANNELS.dbListConnections);

    expect(result).toEqual([postgres]);
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });
});

describe('dbSaveConnection', () => {
  it('saves the connection and stores a provided password', async () => {
    const { ctx, store, vault } = setup();

    const result = await ctx.invoke(CHANNELS.dbSaveConnection, { connection: postgres, password: 'hunter2' });

    expect(result).toEqual({ ok: true, data: postgres });
    expect(store.save).toHaveBeenCalledWith(postgres);
    expect(vault.set).toHaveBeenCalledWith(postgres, 'hunter2');
    expect(vault.reconcile).not.toHaveBeenCalled();
    expect(poolEvict).toHaveBeenCalledWith('c1');
  });

  it('never echoes the password back', async () => {
    const { ctx } = setup();
    const result = await ctx.invoke(CHANNELS.dbSaveConnection, { connection: postgres, password: 'hunter2' });
    expect(JSON.stringify(result)).not.toContain('hunter2');
  });

  it('reconciles (rather than overwrites) the vault when no password is sent', async () => {
    const { ctx, vault } = setup();

    await ctx.invoke(CHANNELS.dbSaveConnection, { connection: postgres });

    expect(vault.set).not.toHaveBeenCalled();
    expect(vault.reconcile).toHaveBeenCalledWith(postgres);
  });

  it('answers a vault that refuses the password with a sentence, not a rejected invoke', async () => {
    // An app not granted the `db-credentials` namespace (or not paired) — the host denies the write.
    const vault = fakeVault({
      set: vi.fn(async () => {
        throw new Error('Midnite Coder has not been granted access to db-credentials.');
      }),
    });
    const { ctx, store } = setup(fakeStore(), vault);

    const result = (await ctx.invoke(CHANNELS.dbSaveConnection, { connection: postgres, password: 'hunter2' })) as {
      ok: boolean;
      message?: string;
    };

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/password could not be stored/);
    expect(result.message).toMatch(/not been granted/);
    expect(result.message).not.toContain('hunter2');
    // The connection itself was saved; only the credential was refused.
    expect(store.save).toHaveBeenCalledWith(postgres);
  });

  it('surfaces a validation failure as {ok:false}, not a thrown rejection', async () => {
    const { ctx } = setup();
    const result = (await ctx.invoke(CHANNELS.dbSaveConnection, { connection: { ...postgres, id: '' } })) as {
      ok: boolean;
      kind?: string;
    };
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('error');
  });
});

describe('dbDeleteConnection', () => {
  it('deletes from the store, the vault and the pool', async () => {
    const store = fakeStore();
    store._seed(postgres);
    const { ctx, vault } = setup(store);

    const result = await ctx.invoke(CHANNELS.dbDeleteConnection, { id: 'c1' });

    expect(result).toEqual({ ok: true });
    expect(store.delete).toHaveBeenCalledWith('c1');
    expect(vault.delete).toHaveBeenCalledWith('c1');
    expect(poolEvict).toHaveBeenCalledWith('c1');
  });
});

describe('dbTestConnection', () => {
  it('connects and disconnects a throwaway driver, answering ok', async () => {
    const { ctx } = setup();
    const connect = vi.fn(async () => {});
    const disconnect = vi.fn(async () => {});
    driverForMock.mockReturnValue({ connect, disconnect, query: vi.fn(), introspect: vi.fn() });

    const result = await ctx.invoke(CHANNELS.dbTestConnection, { connection: postgres, password: 'x' });

    expect(result).toEqual({ ok: true });
    expect(connect).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    // A test connection is never pooled — see the handler's own comment.
    expect(poolGet).not.toHaveBeenCalled();
  });

  it('reads the password from the vault when the request carries none', async () => {
    const { ctx, vault } = setup();
    await vault.set(postgres, 'from-vault');
    driverForMock.mockReturnValue({ connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}), query: vi.fn(), introspect: vi.fn() });

    await ctx.invoke(CHANNELS.dbTestConnection, { connection: postgres });

    expect(driverForMock).toHaveBeenCalledWith(postgres, 'from-vault');
  });

  it('surfaces a connection failure as {ok:false} rather than throwing', async () => {
    const { ctx } = setup();
    const disconnect = vi.fn(async () => {});
    driverForMock.mockReturnValue({
      connect: vi.fn(async () => {
        throw new Error('connection refused');
      }),
      disconnect,
      query: vi.fn(),
      introspect: vi.fn(),
    });

    const result = (await ctx.invoke(CHANNELS.dbTestConnection, { connection: postgres, password: 'x' })) as {
      ok: boolean;
      message?: string;
    };
    expect(result.ok).toBe(false);
    expect(result.message).toBe('connection refused');
    // Still disconnected even on a failed test — no half-open socket left behind.
    expect(disconnect).toHaveBeenCalled();
  });
});

describe('dbGetSchema', () => {
  it('fails without throwing when the connection no longer exists', async () => {
    const { ctx } = setup();
    const result = (await ctx.invoke(CHANNELS.dbGetSchema, { connectionId: 'missing' })) as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  it('introspects the pooled driver for a known connection, opened with the vault password', async () => {
    const store = fakeStore();
    store._seed(postgres);
    const { ctx, vault } = setup(store);
    await vault.set(postgres, 'from-vault');
    const tree = { connectionId: 'c1', tables: [] };
    const introspect = vi.fn(async () => tree);
    poolGet.mockResolvedValue({ introspect });

    const result = await ctx.invoke(CHANNELS.dbGetSchema, { connectionId: 'c1' });

    expect(result).toEqual({ ok: true, data: tree });
    expect(poolGet).toHaveBeenCalledWith(postgres, 'from-vault');
    expect(poolTouch).toHaveBeenCalledWith('c1');
  });
});

describe('dbQueryStart', () => {
  it('sends dbQueryDone with an error when the connection no longer exists, rather than rejecting', async () => {
    const { ctx } = setup();

    const result = await ctx.invoke(CHANNELS.dbQueryStart, { connectionId: 'missing', requestId: 'missing#1', sql: 'SELECT 1' });

    expect(result).toBeUndefined();
    expect(ctx.emitted).toEqual([
      {
        channel: EVENT_CHANNELS.dbQueryDone,
        payload: expect.objectContaining({ requestId: 'missing#1', error: expect.any(String) }),
      },
    ]);
    expect(startQueryMock).not.toHaveBeenCalled();
  });

  it('starts the query producer for a known connection, emitting through the composer', async () => {
    const store = fakeStore();
    store._seed(postgres);
    const { ctx, streams } = setup(store);
    const driver = { query: vi.fn(), introspect: vi.fn() };
    poolGet.mockResolvedValue(driver);

    await ctx.invoke(CHANNELS.dbQueryStart, { connectionId: 'c1', requestId: 'c1#1', sql: 'SELECT 1' });

    expect(startQueryMock).toHaveBeenCalledWith(expect.objectContaining({ emit: expect.any(Function), streams }), driver, {
      requestId: 'c1#1',
      sql: 'SELECT 1',
    });
  });

  it('reports a connection that cannot be opened as a done event with the reason', async () => {
    const store = fakeStore();
    store._seed(postgres);
    const { ctx } = setup(store);
    poolGet.mockRejectedValue(new Error('password authentication failed'));

    await ctx.invoke(CHANNELS.dbQueryStart, { connectionId: 'c1', requestId: 'c1#1', sql: 'SELECT 1' });

    expect(ctx.emitted[0]?.payload).toMatchObject({ requestId: 'c1#1', error: 'password authentication failed' });
  });
});

describe('dbQueryCancel', () => {
  it('cancels the stream for the request id', async () => {
    const { ctx, streams } = setup();
    const cancelled: string[] = [];
    streams.register({ requestId: 'c1#1', cancel: () => void cancelled.push('c1#1') });

    await ctx.invoke(CHANNELS.dbQueryCancel, { requestId: 'c1#1' });

    expect(cancelled).toEqual(['c1#1']);
  });
});

describe('shutdownDb', () => {
  it('disconnects every pooled connection', async () => {
    await shutdownDb();
    expect(poolEvictAll).toHaveBeenCalledOnce();
  });
});
