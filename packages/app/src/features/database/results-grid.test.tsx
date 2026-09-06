import type { MidniteStudioBridge, SchemaTree } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQueryResultsStore } from '../../store/query-results-store';
import { ResultsGrid } from './results-grid';
import { runStatement } from './run-statement';

vi.mock('./run-statement', () => ({ runStatement: vi.fn() }));

const TREE: SchemaTree = {
  connectionId: 'c1',
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
};

function installBridge() {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    db: {
      getSchema: vi.fn().mockResolvedValue({ ok: true, data: TREE }),
    } as unknown as MidniteStudioBridge['db'],
  } as Partial<MidniteStudioBridge>;
}

function renderGrid(overrides: Partial<Parameters<typeof ResultsGrid>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResultsGrid tabId="t1" connectionId="c1" provider="postgres" sql="SELECT * FROM users" {...overrides} />
    </QueryClientProvider>,
  );
}

function seedRun(tabId: string, columns: string[], rows: unknown[][]) {
  const store = useQueryResultsStore.getState();
  store.begin(tabId, 'req1');
  store.appendBatch(tabId, 'req1', columns, rows);
  store.finish(tabId, 'req1', { rowCount: rows.length, truncated: false, durationMs: 12 });
}

describe('ResultsGrid', () => {
  beforeEach(() => {
    installBridge();
    // `@tanstack/virtual-core`'s default `getRect` reads `offsetWidth`/
    // `offsetHeight` (not `getBoundingClientRect`) — jsdom never lays out,
    // so both are always 0 with no override, and every row falls outside
    // the "visible" range, rendering nothing. A fixed non-zero size is
    // enough for these tests, which only assert on which rows exist, not on
    // scroll-position math.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useQueryResultsStore.setState({ runs: {} });
    vi.mocked(runStatement).mockReset();
    vi.restoreAllMocks();
  });

  it('shows an empty state before any query has run', () => {
    renderGrid();
    expect(screen.getByText('No results yet')).toBeDefined();
  });

  it('renders streamed rows and the row count', async () => {
    seedRun('t1', ['id', 'email'], [
      [1, 'ada@example.com'],
      [2, 'grace@example.com'],
    ]);
    renderGrid();
    expect(await screen.findByText('ada@example.com')).toBeDefined();
    expect(screen.getByText(/2 rows/)).toBeDefined();
  });

  it('shows a truncated banner when the stream capped', async () => {
    const store = useQueryResultsStore.getState();
    store.begin('t1', 'req1');
    store.appendBatch('t1', 'req1', ['id'], [[1]]);
    store.finish('t1', 'req1', { rowCount: 50_000, truncated: true, durationMs: 900 });
    renderGrid();
    expect(await screen.findByText(/Showing first 50,000 rows/)).toBeDefined();
  });

  it('shows an error state when the query failed', async () => {
    const store = useQueryResultsStore.getState();
    store.begin('t1', 'req1');
    store.finish('t1', 'req1', { rowCount: 0, truncated: false, durationMs: 5, error: 'syntax error' });
    renderGrid();
    expect(await screen.findByText('syntax error')).toBeDefined();
  });

  it('leaves editing off for a query that is not a plain single-table SELECT *', async () => {
    seedRun('t1', ['n'], [[1]]);
    renderGrid({ sql: 'SELECT COUNT(*) FROM users' });
    expect(await screen.findByText(/Editing is off/)).toBeDefined();
  });

  it('double-click edits a cell, marks it, and Submit runs a parameterised UPDATE after a matching staleness check', async () => {
    seedRun('t1', ['id', 'email'], [[1, 'ada@example.com']]);
    vi.mocked(runStatement).mockImplementation(async (_conn, sql) => {
      if (sql.startsWith('SELECT')) return { rowCount: 1, rows: [['ada@example.com']] };
      return { rowCount: 1, rows: [] };
    });

    renderGrid();
    await screen.findByText('ada@example.com');
    // The schema tree (needed for `detectEditableTable`) resolves one tick
    // after the seeded rows do — retry the double-click until it lands after
    // that resolution rather than racing it.
    await waitFor(() => {
      fireEvent.doubleClick(screen.getByText('ada@example.com'));
      expect(screen.getByDisplayValue('ada@example.com')).toBeDefined();
    });

    const input = screen.getByDisplayValue('ada@example.com');
    fireEvent.change(input, { target: { value: 'ada2@example.com' } });
    fireEvent.blur(input);

    expect(await screen.findByText('Submit 1 edit')).toBeDefined();

    fireEvent.click(screen.getByText('Submit 1 edit'));

    await screen.findByText('Export CSV');
    const calls = vi.mocked(runStatement).mock.calls;
    expect(calls.some((call) => call[1].startsWith('SELECT'))).toBe(true);
    const updateCall = calls.find((call) => call[1].startsWith('UPDATE'));
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]).toContain('$1');
    expect(updateCall?.[2]).toEqual(['ada2@example.com', 1]);
  });

  it('does not edit primary-key columns', async () => {
    seedRun('t1', ['id', 'email'], [[1, 'ada@example.com']]);
    renderGrid();
    const cell = await screen.findByText('1');
    fireEvent.doubleClick(cell);
    expect(screen.queryByDisplayValue('1')).toBeNull();
  });

  it('marks a row conflicted and does not update it when the staleness check finds a mismatch', async () => {
    seedRun('t1', ['id', 'email'], [[1, 'ada@example.com']]);
    vi.mocked(runStatement).mockImplementation(async (_conn, sql) => {
      if (sql.startsWith('SELECT')) return { rowCount: 1, rows: [['someone-else@example.com']] };
      return { rowCount: 1, rows: [] };
    });

    renderGrid();
    await screen.findByText('ada@example.com');
    await waitFor(() => {
      fireEvent.doubleClick(screen.getByText('ada@example.com'));
      expect(screen.getByDisplayValue('ada@example.com')).toBeDefined();
    });
    const input = screen.getByDisplayValue('ada@example.com');
    fireEvent.change(input, { target: { value: 'ada2@example.com' } });
    fireEvent.blur(input);
    fireEvent.click(await screen.findByText('Submit 1 edit'));

    // The conflicted edit stays pending rather than being silently dropped —
    // the user still has a decision to make (re-run to see the fresh value,
    // or force it through) — so "Submit 1 edit" is still what renders, not
    // "Export CSV".
    await waitFor(() => {
      expect(screen.getByLabelText('Unsaved edit')).toBeDefined();
    });
    expect(vi.mocked(runStatement).mock.calls.some((call) => call[1].startsWith('UPDATE'))).toBe(false);
  });
});
