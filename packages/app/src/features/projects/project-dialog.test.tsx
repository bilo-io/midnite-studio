import type { ForgeCapability } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { ProjectDialog } from './project-dialog';

const create = vi.fn();
const edit = vi.fn();
const del = vi.fn();
const capabilities = vi.fn<() => Promise<ForgeCapability>>();

const FULL_OPS = {
  createIssue: true,
  editIssue: true,
  deleteIssue: true,
  createProject: true,
  editProject: true,
  deleteProject: true,
  addProjectItem: true,
  removeProjectItem: true,
  linkBlockedBy: true,
  linkSubIssue: true,
};

function capability(overrides: Partial<ForgeCapability['ops']> = {}): ForgeCapability {
  return {
    pulls: 'full',
    issues: 'full',
    checks: 'full',
    projects: 'full',
    threadResolution: 'full',
    requestChanges: 'full',
    repoListing: 'full',
    ops: { ...FULL_OPS, ...overrides },
  };
}

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forgeProject: { create, edit, delete: del },
    forgeAccounts: { capabilities },
    ai: { improveField: vi.fn() },
  }),
  hasBridge: () => true,
}));

afterEach(() => {
  cleanup();
  create.mockReset();
  edit.mockReset();
  del.mockReset();
  capabilities.mockReset();
});

function renderDialog(props: Partial<ComponentProps<typeof ProjectDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DialogHost>
        <ProjectDialog
          open
          onClose={vi.fn()}
          repoId="repo-1"
          repoName="bilo-io/midnite-studio"
          mode={{ kind: 'create' }}
          {...props}
        />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('ProjectDialog', () => {
  it('creates a board and hands the new id back to the caller', async () => {
    capabilities.mockResolvedValue(capability());
    create.mockResolvedValue({ ok: true, kind: 'ok', project: { id: 'PVT_1', title: 'Roadmap' } });
    const onCreated = vi.fn();
    renderDialog({ onCreated });

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Roadmap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ repoId: 'repo-1', title: 'Roadmap' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('PVT_1'));
  });

  it('hides Delete when the capability says the provider cannot', async () => {
    capabilities.mockResolvedValue(capability({ deleteProject: false }));
    renderDialog({
      mode: { kind: 'edit', projectId: 'PVT_1', title: 'Roadmap', closed: false, itemCount: 3 },
    });

    await waitFor(() => expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Roadmap'));
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('shows Delete when the capability allows it, and its confirm carries the item count', async () => {
    capabilities.mockResolvedValue(capability());
    renderDialog({
      mode: { kind: 'edit', projectId: 'PVT_1', title: 'Roadmap', closed: false, itemCount: 12 },
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Delete "Roadmap"?')).toBeTruthy();
    expect(screen.getByText(/12 items/)).toBeTruthy();
  });

  it('renames a board, sending only the changed field', async () => {
    capabilities.mockResolvedValue(capability());
    edit.mockResolvedValue({ ok: true, kind: 'ok' });
    const onClose = vi.fn();
    renderDialog({
      onClose,
      mode: { kind: 'edit', projectId: 'PVT_1', title: 'Roadmap', closed: false, itemCount: 0 },
    });

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Roadmap v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(edit).toHaveBeenCalledWith({ projectId: 'PVT_1', title: 'Roadmap v2' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
