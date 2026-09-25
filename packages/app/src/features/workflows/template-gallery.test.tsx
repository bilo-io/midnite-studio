import { WORKFLOW_TEMPLATES, type MidniteStudioBridge, type Workflow, type WorkflowTemplate } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useToastStore } from '../../store/toast-store';
import { WorkflowList } from './workflow-list';
import { templateFromWorkflow, workflowFromTemplate } from './workflow-io';

/** Phase 97 Theme L — the "New from template" gallery, driven through the workflow list. */

function userTemplate(): WorkflowTemplate {
  return {
    id: 'user-1',
    title: 'My saved flow',
    blurb: '',
    source: '',
    tags: [],
    workflow: { name: 'My saved flow', nodes: [], edges: [] },
  } as WorkflowTemplate;
}

function installBridge(userTemplates: WorkflowTemplate[] = []) {
  const save = vi.fn().mockImplementation(async ({ workflow }: { workflow: Workflow }) => ({ ok: true, value: workflow }));
  const deleteTemplate = vi.fn().mockResolvedValue({ ok: true, value: undefined });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    workflow: {
      list: vi.fn().mockResolvedValue({ workflows: [] }),
      save,
      delete: vi.fn(),
      templates: {
        list: vi.fn().mockResolvedValue({ templates: userTemplates }),
        save: vi.fn(),
        delete: deleteTemplate,
      },
    } as unknown as MidniteStudioBridge['workflow'],
  } as Partial<MidniteStudioBridge>;
  return { save, deleteTemplate };
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

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useToastStore.setState({ toasts: [] });
});

describe('template gallery', () => {
  it('lists every built-in with a preview, plus the user section', async () => {
    installBridge([userTemplate()]);
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'New from template' }));

    const builtIn = screen.getByRole('region', { name: 'Built-in' });
    for (const template of WORKFLOW_TEMPLATES) {
      expect(within(builtIn).getByRole('button', { name: `Use ${template.title}` })).toBeTruthy();
      expect(within(builtIn).getByRole('img', { name: `${template.title} preview` })).toBeTruthy();
    }
    const mine = screen.getByRole('region', { name: 'Your templates' });
    expect(await within(mine).findByRole('button', { name: 'Use My saved flow' })).toBeTruthy();
  });

  it('instantiates a template as a new workflow with fresh ids and selects it', async () => {
    const { save } = installBridge();
    const { onSelect } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'New from template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Graph Engineering diamond' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const saved = (save.mock.calls[0]![0] as { workflow: Workflow }).workflow;
    const source = WORKFLOW_TEMPLATES.find((t) => t.id === 'graph-engineering-diamond')!;
    expect(saved.name).toBe(source.title);
    expect(saved.nodes).toHaveLength(source.workflow.nodes.length);
    expect(saved.nodes.some((node) => source.workflow.nodes.some((s) => s.id === node.id))).toBe(false);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(saved.id));
    expect(screen.queryByTestId('template-gallery')).toBeNull();
  });

  it('shows the setup checklist once for a template that needs one', async () => {
    installBridge();
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'New from template' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use Risk router' }));

    await waitFor(() => {
      const messages = useToastStore.getState().toasts.map((toast) => toast.message);
      expect(messages.some((message) => message.includes('registered repo'))).toBe(true);
    });
  });
});

describe('template <-> workflow helpers', () => {
  it('a saved user template gets a user- id and round-trips back into a workflow', () => {
    const workflow: Workflow = {
      id: 'w1',
      name: 'Mine',
      description: 'desc',
      nodes: [{ id: 'n1', label: 'Wait', x: 0, y: 0, kind: 'delay', config: { ms: 0 } }],
      edges: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const template = templateFromWorkflow(workflow);
    expect(template.id.startsWith('user-')).toBe(true);
    expect(template.blurb).toBe('desc');
    expect('id' in template.workflow).toBe(false);

    const back = workflowFromTemplate(template, 5);
    expect(back.id).not.toBe('w1');
    expect(back.nodes[0]!.id).not.toBe('n1');
    expect(back.createdAt).toBe(5);
  });
});
