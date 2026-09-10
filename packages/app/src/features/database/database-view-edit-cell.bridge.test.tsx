import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useDatabaseConnectionsStore } from '../../store/database-connections-store';
import { useWorkbenchStore } from '../../store/workbench-store';
import { DatabaseView } from './database-view';

/**
 * Migrated from `e2e/database-edit-cell.spec.ts` (Phase 82 Theme C, wave 5) —
 * the inline-editing round trip against the mocked SQL engine: double-click a
 * cell, submit, re-run the query and see the edit stick; and the manufactured
 * staleness conflict (`__mstudioDbWrite`) that blocks an update from
 * overwriting a row that changed underneath it. **Both of the original 2
 * tests moved here — no stragglers.**
 *
 * `query-editor.tsx` is real Monaco (`@monaco-editor/react` + `getMonaco()`),
 * which jsdom cannot evaluate cleanly — `database-view.test.tsx` already
 * solved this for `DatabaseView` specifically, and this file reuses that exact
 * `vi.mock('./query-editor', …)` textarea stand-in rather than inventing a
 * second approach. Because the whole module is mocked, `database-view.tsx`'s
 * own `React.lazy(() => import('./query-editor'))` boundary never touches the
 * real Monaco/`getMonaco()` code at all — the lazy-chunk hazard other waves
 * hit does not apply here, so no `beforeAll` chunk warm-up is needed.
 */
vi.mock('./query-editor', () => ({
  QueryEditor: ({ sql, onChange }: { sql: string; onChange: (sql: string) => void }) => (
    <textarea aria-label="SQL" value={sql} onChange={(event) => onChange(event.target.value)} />
  ),
}));

const editFixtures: MockFixtures = {
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
      rows: [{ id: 1, email: 'ada@example.com' }],
    },
  },
};

async function runUsersQuery(): Promise<void> {
  renderView(<DatabaseView />, { fixtures: editFixtures });
  const region = await screen.findByRole('region', { name: 'Connections' });
  fireEvent.click(within(region).getByText('Local Postgres'));
  fireEvent.click(await screen.findByRole('button', { name: 'Open query tab' }));
  await screen.findByRole('tab', { name: 'Query 1' });

  fireEvent.change(await screen.findByLabelText('SQL'), { target: { value: 'SELECT * FROM users' } });
  fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
  await screen.findByText('ada@example.com');
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

describe('DatabaseView, edit-cell round trip through the real bridge', () => {
  it('edit a cell, submit, and a re-query sees the change', async () => {
    await runUsersQuery();

    fireEvent.doubleClick(screen.getByText('ada@example.com'));
    const input = document.querySelector('[data-index="0"] input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ada2@example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(await screen.findByRole('button', { name: 'Submit 1 edit' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Submit 1 edit' }));

    // Submitted cleanly: no conflict, so the toolbar reverts to Export CSV.
    // The grid keeps rendering its own streamed snapshot until the next
    // run — it does not locally patch the cell — which is exactly what the
    // re-query below is for.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy());

    // Re-query: the mocked engine's UPDATE mutated its in-memory table, so a
    // fresh SELECT reads back the edit rather than the original value.
    fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
    await screen.findByText('ada2@example.com');
    expect(screen.queryByText('ada@example.com')).toBeNull();
  });

  it('a manufactured staleness conflict blocks the update and keeps the edit pending', async () => {
    await runUsersQuery();

    // Simulate a concurrent write landing between this tab's initial SELECT
    // and the edit it is about to submit — the exact race Decision 2's
    // staleness re-check exists to catch.
    (
      window as unknown as {
        __mstudioDbWrite: (
          table: string,
          match: Record<string, unknown>,
          patch: Record<string, unknown>,
        ) => void;
      }
    ).__mstudioDbWrite('users', { id: 1 }, { email: 'concurrent@example.com' });

    fireEvent.doubleClick(screen.getByText('ada@example.com'));
    const input = document.querySelector('[data-index="0"] input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ada2@example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    fireEvent.click(await screen.findByRole('button', { name: 'Submit 1 edit' }));

    // Conflicted: the edit stays pending (still "Submit 1 edit", still the
    // unsaved-edit dot) rather than silently applying over a row that moved.
    await waitFor(() => expect(screen.getByLabelText('Unsaved edit')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Submit 1 edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();

    // And nothing was written: a re-query reads back the concurrent write,
    // not this tab's own edit.
    fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
    await screen.findByText('concurrent@example.com');
    expect(screen.queryByText('ada2@example.com')).toBeNull();
  });
});
