import type { MidniteStudioBridge, Workflow, WorkflowRun } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../../store/ui-store';
import { WorkflowsView } from './workflows-view';

beforeAll(() => {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

function installBridge() {
  const workflows: Workflow[] = [
    { id: 'w1', name: 'Fetch and log', nodes: [], edges: [], createdAt: 1, updatedAt: 1 },
  ];
  const runs: WorkflowRun[] = [];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    workflow: {
      list: vi.fn().mockResolvedValue({ workflows }),
      save: vi.fn().mockResolvedValue({ ok: true, value: workflows[0] }),
      delete: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      run: vi.fn(),
      cancel: vi.fn(),
      runs: {
        list: vi.fn().mockResolvedValue({ runs }),
        get: vi.fn(async () => ({ run: null })),
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

describe('WorkflowsView resizable panels', () => {
  beforeEach(() => {
    useUiStore.setState({
      layout: DEFAULT_LAYOUT,
    });
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('renders the workflow list resize handle and responds to keyboard nudge, store updates, and reset', async () => {
    installBridge();
    renderView();

    const listHandle = screen.getByRole('separator', { name: 'Resize workflows list' });
    expect(listHandle).toBeDefined();

    // Default width is 224px
    expect(useUiStore.getState().layout.workflowListWidth).toBe(224);
    expect(DEFAULT_LAYOUT.workflowListWidth).toBe(224);
    expect(LAYOUT_BOUNDS.workflowListWidth).toEqual({ min: 180, max: 480 });

    // ArrowRight nudges by +8px
    fireEvent.keyDown(listHandle, { key: 'ArrowRight' });
    expect(useUiStore.getState().layout.workflowListWidth).toBe(232);

    // Double click resets to initial default
    fireEvent.doubleClick(listHandle);
    expect(useUiStore.getState().layout.workflowListWidth).toBe(224);

    // Store update reflects on panel width
    act(() => {
      useUiStore.getState().setLayout('workflowListWidth', 300);
    });
    expect(useUiStore.getState().layout.workflowListWidth).toBe(300);
  });

  it('renders the workflow detail resize handle when workflow is selected and responds to keyboard nudge and reset', async () => {
    installBridge();
    renderView();

    // Select workflow
    fireEvent.click(await screen.findByText('Fetch and log'));
    await screen.findByText('Inspector');

    const detailHandle = screen.getByRole('separator', { name: 'Resize workflow detail' });
    expect(detailHandle).toBeDefined();

    // Default width is 320px
    expect(useUiStore.getState().layout.workflowDetailWidth).toBe(320);
    expect(DEFAULT_LAYOUT.workflowDetailWidth).toBe(320);
    expect(LAYOUT_BOUNDS.workflowDetailWidth).toEqual({ min: 260, max: 600 });

    // For edge: 'end', ArrowLeft nudges width larger by +8px
    fireEvent.keyDown(detailHandle, { key: 'ArrowLeft' });
    expect(useUiStore.getState().layout.workflowDetailWidth).toBe(328);

    // Double click resets to initial default
    fireEvent.doubleClick(detailHandle);
    expect(useUiStore.getState().layout.workflowDetailWidth).toBe(320);

    // Store update reflects on panel width
    act(() => {
      useUiStore.getState().setLayout('workflowDetailWidth', 400);
    });
    expect(useUiStore.getState().layout.workflowDetailWidth).toBe(400);
  });
});
