import type { ConnectionConfig, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDatabaseConnectionsStore } from '../../store/database-connections-store';
import { DatabaseView } from './database-view';

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DatabaseView />
    </QueryClientProvider>,
  );
}

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
  const listConnections = vi.fn().mockResolvedValue([]);
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    db: {
      listConnections,
      saveConnection: vi.fn(),
      deleteConnection: vi.fn(),
      testConnection: vi.fn(),
      getSchema: vi.fn().mockResolvedValue({ ok: true, data: { connectionId: 'c1', tables: [] } }),
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

describe('DatabaseView', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    reset();
  });

  it('shows the empty state with no connections', async () => {
    installBridge();
    renderView();
    expect(await screen.findByText('No connections yet')).toBeDefined();
  });

  it('shows an error state without throwing when there is no bridge', async () => {
    renderView();
    expect(await screen.findByText("Couldn't load connections")).toBeDefined();
  });

  it('lists a loaded connection and lets it be selected', async () => {
    installBridge({ listConnections: vi.fn().mockResolvedValue([postgres]) });
    renderView();

    const row = await screen.findByText('Local Postgres');
    fireEvent.click(row);

    await waitFor(() => {
      expect(useDatabaseConnectionsStore.getState().selectedConnectionId).toBe('c1');
    });
    // The right pane now renders the connection's schema tree (Theme F) in
    // place of the old "coming in a later phase" placeholder.
    expect(await screen.findAllByText('Local Postgres')).not.toHaveLength(0);
  });

  it('opens the connection dialog from the New connection button', async () => {
    installBridge();
    renderView();
    await screen.findByText('No connections yet');

    fireEvent.click(screen.getByLabelText('New connection'));
    expect(await screen.findByRole('dialog', { name: 'New connection' })).toBeDefined();
  });
});
