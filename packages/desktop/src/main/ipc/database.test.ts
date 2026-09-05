import { CHANNELS, EVENT_CHANNELS, type ConnectionConfig } from '@midnite/studio-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `database.ts` registers straight through the real `electron.ipcMain`
 * (`handle.ts`'s own doc comment), so testing it means capturing what it
 * registers — the same `vi.mock('electron', ...)` shape `tests-handlers.test.ts`
 * uses for its own main-process surface. The connection pool and drivers are
 * mocked here too: this is the IPC layer's own contract test (save/list/delete
 * round-trip, a failed connection surfacing `{ok:false}`), not a driver test —
 * those live in `db-engine` against a real, ephemeral instance.
 */
const {
  handlers,
  poolGet,
  poolTouch,
  poolEvict,
  poolEvictAll,
  driverForMock,
  startQueryMock,
  cancelQueryMock,
} = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, raw: unknown) => unknown>(),
  poolGet: vi.fn(),
  poolTouch: vi.fn(),
  poolEvict: vi.fn(async () => {}),
  poolEvictAll: vi.fn(async () => {}),
  driverForMock: vi.fn(),
  startQueryMock: vi.fn(),
  cancelQueryMock: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, fn: (event: unknown, raw: unknown) => unknown) => {
      handlers.set(channel, fn);
    }),
  },
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

vi.mock('../db/query-service', () => ({
  startQuery: startQueryMock,
  cancelQuery: cancelQueryMock,
}));

import { configureDb, registerDbHandlers } from './database';

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

function fakeVault() {
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
  };
}

function fakeWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  } as unknown as import('electron').BrowserWindow;
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  registerDbHandlers(() => fakeWindow());
});

describe('dbListConnections', () => {
  it('returns the store list', async () => {
    const store = fakeStore();
    store._seed(postgres);
    configureDb(store, fakeVault());

    const handler = handlers.get(CHANNELS.dbListConnections)!;
    const result = await handler({}, undefined);
    expect(result).toEqual([postgres]);
  });
});

describe('dbSaveConnection', () => {
  it('saves the connection and stores a provided password', async () => {
    const store = fakeStore();
    const vault = fakeVault();
    configureDb(store, vault);

    const handler = handlers.get(CHANNELS.dbSaveConnection)!;
    const result = await handler({}, { connection: postgres, password: 'hunter2' });

    expect(result).toEqual({ ok: true, data: postgres });
    expect(store.save).toHaveBeenCalledWith(postgres);
    expect(vault.set).toHaveBeenCalledWith(postgres, 'hunter2');
    expect(vault.reconcile).not.toHaveBeenCalled();
    expect(poolEvict).toHaveBeenCalledWith('c1');
  });

  it('reconciles (rather than overwrites) the vault when no password is sent', async () => {
    const store = fakeStore();
    const vault = fakeVault();
    configureDb(store, vault);

    const handler = handlers.get(CHANNELS.dbSaveConnection)!;
    await handler({}, { connection: postgres });

    expect(vault.set).not.toHaveBeenCalled();
    expect(vault.reconcile).toHaveBeenCalledWith(postgres);
  });

  it('surfaces a validation failure as {ok:false}, not a thrown rejection', async () => {
    configureDb(fakeStore(), fakeVault());
    const handler = handlers.get(CHANNELS.dbSaveConnection)!;
    const result = (await handler({}, { connection: { ...postgres, id: '' } })) as {
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
    const vault = fakeVault();
    configureDb(store, vault);

    const handler = handlers.get(CHANNELS.dbDeleteConnection)!;
    const result = await handler({}, { id: 'c1' });

    expect(result).toEqual({ ok: true });
    expect(store.delete).toHaveBeenCalledWith('c1');
    expect(vault.delete).toHaveBeenCalledWith('c1');
    expect(poolEvict).toHaveBeenCalledWith('c1');
  });
});

describe('dbTestConnection', () => {
  it('connects and disconnects a throwaway driver, answering ok', async () => {
    configureDb(fakeStore(), fakeVault());
    const connect = vi.fn(async () => {});
    const disconnect = vi.fn(async () => {});
    driverForMock.mockReturnValue({ connect, disconnect, query: vi.fn(), introspect: vi.fn() });

    const handler = handlers.get(CHANNELS.dbTestConnection)!;
    const result = await handler({}, { connection: postgres, password: 'x' });

    expect(result).toEqual({ ok: true });
    expect(connect).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    // A test connection is never pooled — see database.ts's own comment.
    expect(poolGet).not.toHaveBeenCalled();
  });

  it('surfaces a connection failure as {ok:false} rather than throwing', async () => {
    configureDb(fakeStore(), fakeVault());
    const disconnect = vi.fn(async () => {});
    driverForMock.mockReturnValue({
      connect: vi.fn(async () => {
        throw new Error('connection refused');
      }),
      disconnect,
      query: vi.fn(),
      introspect: vi.fn(),
    });

    const handler = handlers.get(CHANNELS.dbTestConnection)!;
    const result = (await handler({}, { connection: postgres, password: 'x' })) as {
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
  it("fails without throwing when the connection no longer exists", async () => {
    configureDb(fakeStore(), fakeVault());
    const handler = handlers.get(CHANNELS.dbGetSchema)!;
    const result = (await handler({}, { connectionId: 'missing' })) as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  it('introspects the pooled driver for a known connection', async () => {
    const store = fakeStore();
    store._seed(postgres);
    configureDb(store, fakeVault());
    const tree = { connectionId: 'c1', tables: [] };
    const introspect = vi.fn(async () => tree);
    poolGet.mockResolvedValue({ introspect });

    const handler = handlers.get(CHANNELS.dbGetSchema)!;
    const result = await handler({}, { connectionId: 'c1' });

    expect(result).toEqual({ ok: true, data: tree });
    expect(poolTouch).toHaveBeenCalledWith('c1');
  });
});

describe('dbQueryStart', () => {
  it('sends dbQueryDone with an error when the connection no longer exists, rather than rejecting', async () => {
    configureDb(fakeStore(), fakeVault());
    const win = fakeWindow();
    registerDbHandlers(() => win);

    const handler = handlers.get(CHANNELS.dbQueryStart)!;
    const result = await handler(
      {},
      { connectionId: 'missing', requestId: 'missing#1', sql: 'SELECT 1' },
    );

    expect(result).toBeUndefined();
    expect(win.webContents.send).toHaveBeenCalledWith(
      EVENT_CHANNELS.dbQueryDone,
      expect.objectContaining({ requestId: 'missing#1', error: expect.any(String) }),
    );
    expect(startQueryMock).not.toHaveBeenCalled();
  });

  it('starts the query producer for a known connection', async () => {
    const store = fakeStore();
    store._seed(postgres);
    configureDb(store, fakeVault());
    const driver = { query: vi.fn(), introspect: vi.fn() };
    poolGet.mockResolvedValue(driver);
    const win = fakeWindow();
    registerDbHandlers(() => win);

    const handler = handlers.get(CHANNELS.dbQueryStart)!;
    await handler({}, { connectionId: 'c1', requestId: 'c1#1', sql: 'SELECT 1' });

    expect(startQueryMock).toHaveBeenCalledWith(win, driver, {
      requestId: 'c1#1',
      sql: 'SELECT 1',
    });
  });
});

describe('dbQueryCancel', () => {
  it('cancels the stream for the request id', async () => {
    const win = fakeWindow();
    registerDbHandlers(() => win);
    const handler = handlers.get(CHANNELS.dbQueryCancel)!;
    await handler({}, { requestId: 'c1#1' });
    expect(cancelQueryMock).toHaveBeenCalledWith(win, 'c1#1');
  });
});
