import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useDatabaseConnectionsStore } from '../../store/database-connections-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { DatabaseView } from './database-view';

/**
 * Migrated from `e2e/database-query-tabs-independent.spec.ts` (Phase 82
 * Theme C, wave 5) — two query tabs against the same connection keep
 * independent results: `query-results-store.ts` keys a run by tab id, and
 * switching tabs shows each one's own last streamed rows without re-running
 * anything. **The one original test moved here — no stragglers.**
 *
 * See `database-view-edit-cell.bridge.test.tsx`'s own header comment for why
 * `./query-editor` (real Monaco) is mocked with a plain textarea, and why
 * that also neutralises the lazy-chunk hazard for `database-view.tsx`'s own
 * `React.lazy(() => import('./query-editor'))`.
 */
vi.mock('./query-editor', () => ({
  QueryEditor: ({ sql, onChange }: { sql: string; onChange: (sql: string) => void }) => (
    <textarea aria-label="SQL" value={sql} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const tabsFixtures: MockFixtures = {
  ...fixtures,
  dbConnections: [
    {
      id: 'c1',
      name: 'Local Postgres',
      provider: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'app',
    },
  ],
  dbSchemaByConnection: {
    c1: {
      tables: [
        {
          name: 'users',
          kind: 'table',
          columns: [{ name: 'id', type: 'int4', nullable: false, isPrimaryKey: true, references: null }],
        },
        {
          name: 'orders',
          kind: 'table',
          columns: [
            { name: 'total', type: 'numeric', nullable: true, isPrimaryKey: false, references: null },
          ],
        },
      ],
    },
  },
  dbTableRows: {
    users: { columns: ['id', 'email'], rows: [{ id: 1, email: 'ada@example.com' }] },
    orders: { columns: ['id', 'total'], rows: [{ id: 9, total: 42.5 }] },
  },
};

beforeEach(() => {
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
});

afterEach(cleanup);

describe('DatabaseView, independent query tabs through the real bridge', () => {
  it('two query tabs against one connection stay independent', async () => {
    renderView(<DatabaseView />, { fixtures: tabsFixtures });
    const region = await screen.findByRole('region', { name: 'Connections' });
    fireEvent.click(within(region).getByText('Local Postgres'));

    // Tab 1: users
    fireEvent.click(await screen.findByRole('button', { name: 'Open query tab' }));
    await screen.findByRole('tab', { name: 'Query 1' });
    fireEvent.change(await screen.findByLabelText('SQL'), {
      target: { value: 'SELECT * FROM users' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
    await screen.findByText('ada@example.com');

    // Tab 2: orders, opened fresh via the strip's own "+"
    fireEvent.click(screen.getByRole('button', { name: 'New query tab' }));
    await screen.findByRole('tab', { name: 'Query 2' });
    expect(screen.queryByText('ada@example.com')).toBeNull();
    expect(screen.getByText('No results yet')).toBeTruthy();

    fireEvent.change(await screen.findByLabelText('SQL'), {
      target: { value: 'SELECT * FROM orders' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
    await screen.findByText('42.5');
    expect(screen.queryByText('ada@example.com')).toBeNull();

    // Switch back to tab 1: its own streamed rows are still there, with no
    // re-run — the mocked engine never sees a third `queryStart` for it.
    fireEvent.click(screen.getByRole('tab', { name: 'Query 1' }));
    await screen.findByText('ada@example.com');
    expect(screen.queryByText('42.5')).toBeNull();

    // And tab 2, switched back to, still shows its own.
    fireEvent.click(screen.getByRole('tab', { name: 'Query 2' }));
    await screen.findByText('42.5');
    expect(screen.queryByText('ada@example.com')).toBeNull();
  });
});
