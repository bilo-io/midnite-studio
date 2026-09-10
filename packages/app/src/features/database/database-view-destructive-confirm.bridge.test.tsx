import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useDatabaseConnectionsStore } from '../../store/database-connections-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { DatabaseView } from './database-view';

/**
 * Migrated from `e2e/database-destructive-confirm.spec.ts` (Phase 82 Theme C,
 * wave 5) — the destructive-statement safety gate (`statement-confirm.ts`)
 * exercised end to end: a write statement is blocked behind the app's own
 * blast-radius confirm dialog until explicitly confirmed, and a plain read
 * never shows one at all. **Both of the original 2 tests moved here — no
 * stragglers.**
 *
 * See `database-view-edit-cell.bridge.test.tsx`'s own header comment for why
 * `./query-editor` (real Monaco) is mocked with a plain textarea rather than
 * driven for real, and why that mock also neutralises the lazy-chunk hazard
 * for `database-view.tsx`'s own `React.lazy(() => import('./query-editor'))`.
 */
vi.mock('./query-editor', () => ({
  QueryEditor: ({ sql, onChange }: { sql: string; onChange: (sql: string) => void }) => (
    <textarea aria-label="SQL" value={sql} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const destructiveFixtures: MockFixtures = {
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
          columns: [
            { name: 'id', type: 'int4', nullable: false, isPrimaryKey: true, references: null },
            { name: 'email', type: 'text', nullable: false, isPrimaryKey: false, references: null },
          ],
        },
      ],
    },
  },
  dbTableRows: {
    users: {
      columns: ['id', 'email'],
      rows: [
        { id: 1, email: 'ada@example.com' },
        { id: 2, email: 'grace@example.com' },
        { id: 3, email: 'bo@example.com' },
      ],
    },
  },
};

async function openQueryTab(): Promise<void> {
  renderView(<DatabaseView />, { fixtures: destructiveFixtures });
  const region = await screen.findByRole('region', { name: 'Connections' });
  fireEvent.click(within(region).getByText('Local Postgres'));
  fireEvent.click(await screen.findByRole('button', { name: 'Open query tab' }));
  await screen.findByRole('tab', { name: 'Query 1' });
}

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

describe('DatabaseView, the destructive-statement confirm gate through the real bridge', () => {
  it('a destructive statement is blocked behind a confirm dialog until confirmed', async () => {
    await openQueryTab();

    fireEvent.change(await screen.findByLabelText('SQL'), {
      target: { value: 'DELETE FROM users' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    const dialog = await screen.findByRole('dialog', { name: 'Run this statement?' });
    expect(within(dialog).getByText(/DELETE FROM users/)).toBeTruthy();
    expect(within(dialog).getByText(/Local Postgres/)).toBeTruthy();

    // Blocked: nothing has run yet — the empty state from before the confirm
    // is still what renders, not a row count.
    expect(screen.getByText('No results yet')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Run statement' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Run this statement?' })).toBeNull());

    // Only once confirmed does the statement actually run.
    //
    // A regex, not the exact string: the row count and the duration
    // (` · 1ms`) are two adjacent JSX expressions under the same `<span>`,
    // so its whole normalised text is "3 rows · 1ms" — Testing Library's
    // `getByText` matches a node's WHOLE text by default (unlike
    // Playwright's own substring default, which is why the e2e original
    // could assert the bare `'3 rows'` string).
    await screen.findByText(/^3 rows/);
  });

  it('a plain read never shows the confirm dialog', async () => {
    await openQueryTab();

    fireEvent.change(await screen.findByLabelText('SQL'), {
      target: { value: 'SELECT * FROM users' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.queryByRole('dialog', { name: 'Run this statement?' })).toBeNull();
    await screen.findByText('ada@example.com');
  });
});
