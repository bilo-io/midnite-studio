import type { MidniteStudioBridge, Workflow, WorkflowRun } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { WorkflowsView } from './workflows-view';

/**
 * The right-hand `panel-stack`'s own navigation (Phase 52 Theme F) — push
 * (Inspector → History → Run), back/forward through `PanelHeader`'s
 * chevrons, and a reset on switching workflow. `card-panel-stack.test.tsx`
 * would be the closer sibling to crib from, but that panel has only one
 * entry kind (a card); this one is the first with three, so its own
 * `sameWorkflowPanelEntry`/label-switch logic is what earns a test here.
 */

/** jsdom implements no `ResizeObserver` — `workflow-canvas.tsx` reads one to
 *  size itself, the same gap `workflow-canvas.test.tsx` stubs. */
beforeAll(() => {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});

function run(over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'r1',
    workflowId: 'w1',
    workflowName: 'Fetch and log',
    status: 'completed',
    nodes: [],
    edges: [],
    startedAt: Date.now() - 5000,
    endedAt: Date.now() - 2000,
    ...over,
  };
}

function installBridge(runs: WorkflowRun[] = [run()]) {
  const workflows: Workflow[] = [
    { id: 'w1', name: 'Fetch and log', nodes: [], edges: [], createdAt: 1, updatedAt: 1 },
    { id: 'w2', name: 'Second workflow', nodes: [], edges: [], createdAt: 1, updatedAt: 1 },
  ];
  const runsById = new Map(runs.map((r) => [r.id, r]));
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    workflow: {
      list: vi.fn().mockResolvedValue({ workflows }),
      save: vi.fn().mockResolvedValue({ ok: true, value: workflows[0] }),
      delete: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      run: vi.fn(),
      cancel: vi.fn(),
      runs: {
        list: vi.fn().mockResolvedValue({ runs }),
        get: vi.fn(async ({ runId }: { runId: string }) => ({ run: runsById.get(runId) ?? null })),
      },
      onRunChanged: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['workflow'],
  } as Partial<MidniteStudioBridge>;
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <WorkflowsView />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('the workflow editor\'s right-hand panel-stack (Phase 52 Theme F)', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('starts on the inspector, with no back to take', async () => {
    installBridge();
    renderView();

    fireEvent.click(await screen.findByText('Fetch and log'));

    expect(await screen.findByText('Inspector')).toBeDefined();
    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', true);
  });

  it('pushes History, then a run, and Back walks it back one step at a time', async () => {
    installBridge();
    renderView();
    fireEvent.click(await screen.findByText('Fetch and log'));
    await screen.findByText('Inspector');

    fireEvent.click(screen.getByRole('button', { name: 'Run history' }));
    expect(await screen.findByText('History')).toBeDefined();
    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', false);

    fireEvent.click(await screen.findByRole('button', { name: /Completed/ }));
    expect(await screen.findByText('Run')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Back'));
    expect(await screen.findByText('History')).toBeDefined();

    fireEvent.click(screen.getByLabelText('Back'));
    expect(await screen.findByText('Inspector')).toBeDefined();
    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', true);
  });

  it('Forward retraces a Back, and pushing a new entry truncates the forward tail', async () => {
    installBridge();
    renderView();
    fireEvent.click(await screen.findByText('Fetch and log'));
    await screen.findByText('Inspector');

    fireEvent.click(screen.getByRole('button', { name: 'Run history' }));
    await screen.findByText('History');
    expect(screen.getByLabelText('Forward')).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByLabelText('Back'));
    await screen.findByText('Inspector');
    expect(screen.getByLabelText('Forward')).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByLabelText('Forward'));
    expect(await screen.findByText('History')).toBeDefined();
    expect(screen.getByLabelText('Forward')).toHaveProperty('disabled', true);
  });

  it('"Back to editing" resets the whole stack, not just one step', async () => {
    installBridge();
    renderView();
    fireEvent.click(await screen.findByText('Fetch and log'));
    await screen.findByText('Inspector');

    fireEvent.click(screen.getByRole('button', { name: 'Run history' }));
    await screen.findByText('History');
    fireEvent.click(await screen.findByRole('button', { name: /Completed/ }));
    await screen.findByText('Run');

    fireEvent.click(screen.getByRole('button', { name: 'Back to editing' }));

    expect(await screen.findByText('Inspector')).toBeDefined();
    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Forward')).toHaveProperty('disabled', true);
  });

  it('switching workflow remounts the editor, resetting the panel-stack to Inspector', async () => {
    installBridge();
    renderView();
    fireEvent.click(await screen.findByText('Fetch and log'));
    await screen.findByText('Inspector');

    fireEvent.click(screen.getByRole('button', { name: 'Run history' }));
    await screen.findByText('History');

    fireEvent.click(screen.getByText('Second workflow'));

    expect(await screen.findByText('Inspector')).toBeDefined();
    expect(screen.getByLabelText('Back')).toHaveProperty('disabled', true);
  });
});
