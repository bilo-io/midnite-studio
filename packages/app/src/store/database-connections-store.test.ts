import type { ConnectionConfig, MidniteStudioBridge } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDatabaseConnectionsStore } from './database-connections-store';

const postgres: ConnectionConfig = {
  id: 'c1',
  name: 'Local Postgres',
  provider: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'app',
  username: 'app_user',
};

function installBridge(overrides: Partial<MidniteStudioBridge['db']> = {}) {
  const listConnections = vi.fn().mockResolvedValue([postgres]);
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    db: {
      listConnections,
      saveConnection: vi.fn(),
      deleteConnection: vi.fn(),
      testConnection: vi.fn(),
      getSchema: vi.fn(),
      queryStart: vi.fn(),
      queryCancel: vi.fn(),
      onQueryBatch: vi.fn(() => () => {}),
      onQueryDone: vi.fn(() => () => {}),
      ...overrides,
    } as unknown as MidniteStudioBridge['db'],
  } as Partial<MidniteStudioBridge>;
  return { listConnections };
}

function reset() {
  useDatabaseConnectionsStore.setState({
    status: 'idle',
    connections: [],
    error: null,
    selectedConnectionId: null,
  });
}

describe('useDatabaseConnectionsStore', () => {
  beforeEach(reset);
  afterEach(() => {
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('reports an error with no bridge, rather than hanging on loading', async () => {
    await useDatabaseConnectionsStore.getState().load();
    const state = useDatabaseConnectionsStore.getState();
    expect(state.status).toBe('error');
    expect(state.error).toBeTruthy();
  });

  it('loads the connections list from the bridge', async () => {
    installBridge();
    await useDatabaseConnectionsStore.getState().load();
    const state = useDatabaseConnectionsStore.getState();
    expect(state.status).toBe('ready');
    expect(state.connections).toEqual([postgres]);
  });

  it('surfaces a rejected listConnections call as an error state', async () => {
    installBridge({ listConnections: vi.fn().mockRejectedValue(new Error('boom')) });
    await useDatabaseConnectionsStore.getState().load();
    expect(useDatabaseConnectionsStore.getState().status).toBe('error');
  });

  it('upserts a new connection and an edited one by id', () => {
    useDatabaseConnectionsStore.getState().upsert(postgres);
    expect(useDatabaseConnectionsStore.getState().connections).toEqual([postgres]);

    const renamed = { ...postgres, name: 'Renamed' };
    useDatabaseConnectionsStore.getState().upsert(renamed);
    const state = useDatabaseConnectionsStore.getState();
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0]?.name).toBe('Renamed');
  });

  it('removes a connection and clears the selection if it was selected', () => {
    useDatabaseConnectionsStore.setState({ connections: [postgres], selectedConnectionId: 'c1' });
    useDatabaseConnectionsStore.getState().remove('c1');
    const state = useDatabaseConnectionsStore.getState();
    expect(state.connections).toEqual([]);
    expect(state.selectedConnectionId).toBeNull();
  });

  it('leaves the selection alone when a different connection is removed', () => {
    const other: ConnectionConfig = { ...postgres, id: 'c2', name: 'Other' };
    useDatabaseConnectionsStore.setState({
      connections: [postgres, other],
      selectedConnectionId: 'c1',
    });
    useDatabaseConnectionsStore.getState().remove('c2');
    expect(useDatabaseConnectionsStore.getState().selectedConnectionId).toBe('c1');
  });
});
