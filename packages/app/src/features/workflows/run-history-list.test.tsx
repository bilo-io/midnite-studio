import type { MidniteStudioBridge, WorkflowRun } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunHistoryList } from './run-history-list';

function run(over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'r1',
    workflowId: 'w1',
    workflowName: 'W',
    status: 'completed',
    nodes: [],
    edges: [],
    startedAt: Date.now() - 5000,
    endedAt: Date.now() - 2000,
    ...over,
  };
}

function installBridge(runs: WorkflowRun[]) {
  const list = vi.fn().mockResolvedValue({ runs });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    workflow: {
      list: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      run: vi.fn(),
      cancel: vi.fn(),
      runs: { list, get: vi.fn() },
      onRunChanged: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['workflow'],
  } as Partial<MidniteStudioBridge>;
  return { list };
}

function renderList(onSelectRun = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RunHistoryList workflowId="w1" onSelectRun={onSelectRun} />
    </QueryClientProvider>,
  );
  return { onSelectRun };
}

describe('RunHistoryList', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('shows the empty state with no runs', async () => {
    installBridge([]);
    renderList();
    expect(await screen.findByText('No runs yet')).not.toBeNull();
  });

  it('lists runs newest-first and selecting one calls onSelectRun', async () => {
    installBridge([run({ id: 'older', startedAt: Date.now() - 60_000 }), run({ id: 'newer' })]);
    const { onSelectRun } = renderList();

    const list = await screen.findByRole('list', { name: 'Runs' });
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(2);

    fireEvent.click(rows[0]!);
    expect(onSelectRun).toHaveBeenCalledWith('newer');
  });

  it('shows a run in flight without an end time as still running, no duration', async () => {
    installBridge([run({ status: 'running', endedAt: undefined })]);
    renderList();
    expect(await screen.findByText('Running')).not.toBeNull();
  });

  describe('the status facet (Phase 52 Theme E)', () => {
    it('shows every run when nothing is selected — empty means everyone', async () => {
      installBridge([run({ id: 'r1', status: 'completed' }), run({ id: 'r2', status: 'failed' })]);
      renderList();

      const list = await screen.findByRole('list', { name: 'Runs' });
      expect(within(list).getAllByRole('button')).toHaveLength(2);
    });

    it('narrows to only the selected status', async () => {
      installBridge([run({ id: 'r1', status: 'completed' }), run({ id: 'r2', status: 'failed' })]);
      renderList();
      await screen.findByRole('list', { name: 'Runs' });

      fireEvent.click(screen.getByRole('button', { name: 'All statuses' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Failed' }));

      const list = screen.getByRole('list', { name: 'Runs' });
      const rows = within(list).getAllByRole('button');
      expect(rows).toHaveLength(1);
      expect(within(rows[0]!).getByText('Failed')).not.toBeNull();
    });

    it('a status that matches nothing shows the no-matches state, not the empty-runs state', async () => {
      installBridge([run({ id: 'r1', status: 'completed' })]);
      renderList();
      await screen.findByRole('list', { name: 'Runs' });

      fireEvent.click(screen.getByRole('button', { name: 'All statuses' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Failed' }));

      expect(await screen.findByText('No matches')).not.toBeNull();
      expect(screen.queryByText("Hit Run to start this workflow's first run.")).toBeNull();
    });
  });
});
