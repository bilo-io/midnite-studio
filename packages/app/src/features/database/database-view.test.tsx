import type { ConnectionConfig, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useDatabaseConnectionsStore } from '../../store/database-connections-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { DatabaseView } from './database-view';

// `query-editor.tsx` is Monaco (`@monaco-editor/react`), which jsdom cannot
// evaluate cleanly (`code-editor.test.tsx`'s own precedent) — this suite is
// about the workbench/store wiring around the editor, not Monaco's own
// behaviour, so it's replaced with a plain textarea standing in for
// `sql`/`onChange`.
vi.mock('./query-editor', () => ({
  QueryEditor: ({ sql, onChange }: { sql: string; onChange: (sql: string) => void }) => (
    <textarea aria-label="SQL" value={sql} onChange={(event) => onChange(event.target.value)} />
  ),
}));

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <DatabaseView />
      </DialogHost>
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
  useWorkbenchStore.setState({
    tabs: [],
    activeTabId: null,
    activeQueryTabId: null,
    dirtyQueryTabIds: new Set(),
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

  it('opens a query tab from the connection row, runs it, and shows a + for another (Phase 61 Themes G/H)', async () => {
    const queryStart = vi.fn();
    installBridge({ listConnections: vi.fn().mockResolvedValue([postgres]), queryStart });
    renderView();

    fireEvent.click(await screen.findByText('Local Postgres'));
    await waitFor(() => {
      expect(useDatabaseConnectionsStore.getState().selectedConnectionId).toBe('c1');
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Open query tab' }));

    // The new tab is a real WorkbenchTab of kind 'query', focused immediately.
    await waitFor(() => {
      const tabs = useWorkbenchStore.getState().tabs;
      expect(tabs).toHaveLength(1);
      expect(tabs[0]?.kind).toBe('query');
      expect(useWorkbenchStore.getState().activeQueryTabId).toBe(tabs[0]?.id);
    });

    // A blank SELECT-less tab means no results yet.
    expect(await screen.findByText('No results yet')).toBeDefined();
    // The strip now has a "+" for another tab against the same connection.
    expect(screen.getByRole('button', { name: 'New query tab' })).toBeDefined();

    const editor = await screen.findByLabelText('SQL');
    fireEvent.change(editor, { target: { value: 'SELECT 1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(queryStart).toHaveBeenCalledTimes(1));
    expect(queryStart.mock.calls[0]?.[0]).toMatchObject({ connectionId: 'c1', sql: 'SELECT 1' });
  });
});
