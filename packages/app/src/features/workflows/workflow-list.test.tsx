import type { Workflow, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useToastStore } from '../../store/toast-store';
import { WorkflowList } from './workflow-list';

/**
 * jsdom's `File`/`Blob` implement neither `.text()` nor `.arrayBuffer()` —
 * only `FileReader`, which jsdom backs with its own internal buffer, reaches
 * the content at all. `workflow-io.ts`'s import path calls `file.text()`
 * (real in every browser and in Electron's renderer, per the MDN File API),
 * so the import tests below need this polyfilled rather than the production
 * code reaching for `FileReader` just to appease this one environment.
 */
beforeAll(() => {
  File.prototype.text ??= function (this: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
});

function workflow(over: Partial<Workflow> = {}): Workflow {
  return { id: 'w1', name: 'Fetch and log', nodes: [], edges: [], createdAt: 1, updatedAt: 1, ...over };
}

function installBridge(overrides: Partial<MidniteStudioBridge['workflow']> = {}) {
  const list = vi.fn().mockResolvedValue({ workflows: [] });
  const save = vi.fn().mockResolvedValue({ ok: true, value: workflow() });
  const del = vi.fn().mockResolvedValue({ ok: true, value: undefined });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    workflow: { list, save, delete: del, run: vi.fn(), cancel: vi.fn(), runs: { list: vi.fn(), get: vi.fn() }, onRunChanged: vi.fn(() => () => {}), ...overrides } as unknown as MidniteStudioBridge['workflow'],
  } as Partial<MidniteStudioBridge>;
  return { list, save, delete: del };
}

function renderList(onSelect = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <WorkflowList selectedId={null} onSelect={onSelect} />
      </DialogHost>
    </QueryClientProvider>,
  );
  return { onSelect };
}

describe('WorkflowList', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    useToastStore.setState({ toasts: [] });
  });

  it('shows the empty state with no workflows', async () => {
    installBridge();
    renderList();
    expect(await screen.findByText('No workflows yet')).toBeDefined();
  });

  it('lists workflows and selects one on click', async () => {
    installBridge({ list: vi.fn().mockResolvedValue({ workflows: [workflow()] }) });
    const { onSelect } = renderList();

    fireEvent.click(await screen.findByText('Fetch and log'));
    expect(onSelect).toHaveBeenCalledWith('w1');
  });

  it('creates a new workflow and selects it', async () => {
    const { save } = installBridge();
    const { onSelect } = renderList();
    await screen.findByText('No workflows yet');

    fireEvent.click(screen.getByLabelText('New workflow'));

    await waitFor(() => expect(save).toHaveBeenCalled());
    const saved = save.mock.calls[0]![0].workflow as Workflow;
    expect(saved.nodes).toEqual([]);
    expect(onSelect).toHaveBeenCalledWith(saved.id);
  });

  it('deletes a workflow after the destructive confirm', async () => {
    const { delete: del } = installBridge({ list: vi.fn().mockResolvedValue({ workflows: [workflow()] }) });
    renderList();

    fireEvent.contextMenu(await screen.findByText('Fetch and log'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(del).toHaveBeenCalledWith({ id: 'w1' }));
  });

  it('imports a workflow file, saving it with fresh ids', async () => {
    const { save } = installBridge();
    const { onSelect } = renderList();
    await screen.findByText('No workflows yet');

    const file = new File([JSON.stringify(workflow({ name: 'Imported' }))], 'workflow.json', {
      type: 'application/json',
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(save).toHaveBeenCalled());
    const saved = save.mock.calls[0]![0].workflow as Workflow;
    expect(saved.id).not.toBe('w1');
    expect(saved.name).toBe('Imported');
    expect(onSelect).toHaveBeenCalledWith(saved.id);
  });

  it('reports a bad import file without saving anything', async () => {
    const { save } = installBridge();
    renderList();
    await screen.findByText('No workflows yet');

    const file = new File(['not json'], 'workflow.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0]?.message).toContain('Could not import');
    expect(save).not.toHaveBeenCalled();
  });

  describe('the name filter (Phase 52 Theme E)', () => {
    it('shows every workflow for an empty query', async () => {
      installBridge({
        list: vi.fn().mockResolvedValue({ workflows: [workflow(), workflow({ id: 'w2', name: 'Second' })] }),
      });
      renderList();
      expect(await screen.findByText('Fetch and log')).toBeDefined();
      expect(screen.getByText('Second')).toBeDefined();
    });

    it('narrows to workflows whose name matches, case-insensitively', async () => {
      installBridge({
        list: vi.fn().mockResolvedValue({ workflows: [workflow(), workflow({ id: 'w2', name: 'Second' })] }),
      });
      renderList();
      await screen.findByText('Fetch and log');

      fireEvent.change(screen.getByPlaceholderText('Filter workflows…'), { target: { value: 'FETCH' } });

      expect(screen.getByText('Fetch and log')).toBeDefined();
      expect(screen.queryByText('Second')).toBeNull();
    });

    it('a query matching nothing shows a no-matches state, not the empty-list one', async () => {
      installBridge({ list: vi.fn().mockResolvedValue({ workflows: [workflow()] }) });
      renderList();
      await screen.findByText('Fetch and log');

      fireEvent.change(screen.getByPlaceholderText('Filter workflows…'), { target: { value: 'nope' } });

      expect(await screen.findByText('No matches')).toBeDefined();
      expect(screen.queryByText('No workflows yet')).toBeNull();
    });

    it('does not render the filter input at all with no workflows to filter', async () => {
      installBridge();
      renderList();
      await screen.findByText('No workflows yet');
      expect(screen.queryByPlaceholderText('Filter workflows…')).toBeNull();
    });
  });
});
