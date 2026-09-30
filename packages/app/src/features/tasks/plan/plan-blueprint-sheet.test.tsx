import type { AiPlanBlueprint, ForgeCapability, GitOpResult } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { PlanBlueprintSheet } from './plan-blueprint-sheet';

const planBlueprint = vi.fn<() => Promise<GitOpResult<{ blueprint: AiPlanBlueprint }>>>();
const issueCreate = vi.fn();
const issuesLink = vi.fn();
const projectCreate = vi.fn();
const projectAddItem = vi.fn();
const projectList = vi.fn(async () => ({ cli: { reason: 'ready', binPath: '/gh', hint: '' }, projects: [], error: null }));

vi.mock('../../../services/bridge', () => ({
  bridge: () => ({
    ai: { planBlueprint, improveField: vi.fn() },
    forge: { issueCreate, issuesLink },
    forgeProject: { create: projectCreate, addItem: projectAddItem, list: projectList },
  }),
  hasBridge: () => true,
}));

afterEach(() => {
  cleanup();
  planBlueprint.mockReset();
  issueCreate.mockReset();
  issuesLink.mockReset();
  projectCreate.mockReset();
  projectAddItem.mockReset();
});

const FULL_OPS: ForgeCapability['ops'] = {
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

const capability: ForgeCapability = {
  pulls: 'full',
  issues: 'full',
  checks: 'full',
  projects: 'full',
  threadResolution: 'full',
  requestChanges: 'full',
  repoListing: 'full',
  ops: FULL_OPS,
};

const blueprint: AiPlanBlueprint = {
  project: { title: 'Ship auth', description: '' },
  tasks: [
    { key: 'api', title: 'Build the API', body: '', labels: [] },
    { key: 'ui', title: 'Wire up the UI', body: '', labels: [] },
  ],
  edges: [{ from: 'ui', to: 'api', kind: 'blockedBy' }],
};

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DialogHost>
        <PlanBlueprintSheet
          open
          onClose={vi.fn()}
          repoId="repo-1"
          repoName="bilo-io/midnite-studio"
          initialPrompt="Build a login flow"
          origin={{ kind: 'project', capability, defaultProjectId: null }}
        />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('PlanBlueprintSheet', () => {
  it('generates a blueprint immediately on open, from the prompt already typed at the entry point', async () => {
    let resolvePlan: (value: GitOpResult<{ blueprint: AiPlanBlueprint }>) => void = () => {};
    planBlueprint.mockReturnValue(new Promise((resolve) => (resolvePlan = resolve)));
    renderSheet();

    await waitFor(() =>
      expect(planBlueprint).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Build a login flow', repoName: 'bilo-io/midnite-studio' }),
      ),
    );
    expect(screen.getByText('Drafting a plan…')).toBeTruthy();

    resolvePlan({ ok: true, value: { blueprint } });
    await waitFor(() => expect(screen.getByDisplayValue('Build the API')).toBeTruthy());
  });

  it('is editable except while a plan is generating — locked with the agent glow while re-planning', async () => {
    planBlueprint.mockResolvedValueOnce({ ok: true, value: { blueprint } });
    renderSheet();

    await waitFor(() => expect(screen.getByDisplayValue('Build the API')).toBeTruthy());
    const apiTitle = screen.getByDisplayValue('Build the API') as HTMLInputElement;
    expect(apiTitle.disabled).toBe(false);

    let resolveReplan: (value: GitOpResult<{ blueprint: AiPlanBlueprint }>) => void = () => {};
    planBlueprint.mockReturnValueOnce(new Promise((resolve) => (resolveReplan = resolve)));
    fireEvent.click(screen.getByRole('button', { name: 'Re-plan' }));

    await waitFor(() => expect((screen.getByDisplayValue('Build the API') as HTMLInputElement).disabled).toBe(true));

    resolveReplan({ ok: true, value: { blueprint } });
    await waitFor(() => expect((screen.getByDisplayValue('Build the API') as HTMLInputElement).disabled).toBe(false));
  });

  it('sends the current edited draft back as context on Re-plan', async () => {
    planBlueprint.mockResolvedValueOnce({ ok: true, value: { blueprint } });
    renderSheet();
    await waitFor(() => expect(screen.getByDisplayValue('Build the API')).toBeTruthy());

    fireEvent.change(screen.getByDisplayValue('Build the API'), { target: { value: 'Build the REST API' } });
    planBlueprint.mockResolvedValueOnce({ ok: true, value: { blueprint } });
    fireEvent.click(screen.getByRole('button', { name: 'Re-plan' }));

    await waitFor(() =>
      expect(planBlueprint).toHaveBeenLastCalledWith(
        expect.objectContaining({
          existing: expect.objectContaining({
            tasks: expect.arrayContaining([expect.objectContaining({ title: 'Build the REST API' })]),
          }),
        }),
      ),
    );
  });

  it('touches nothing on the forge until Confirm, then sequences the writes and reports success', async () => {
    planBlueprint.mockResolvedValueOnce({ ok: true, value: { blueprint } });
    projectCreate.mockResolvedValue({ ok: true, kind: 'ok', project: { id: 'proj-1', number: 1, title: 'Ship auth', url: '', closed: false } });
    issueCreate.mockImplementation(async (req: { title: string }) => ({
      ok: true,
      cli: { reason: 'ready', binPath: '/gh', hint: '' },
      issue: { id: `id-${req.title}`, number: req.title.includes('API') ? 101 : 102, title: req.title },
    }));
    projectAddItem.mockResolvedValue({ ok: true, kind: 'ok' });
    issuesLink.mockResolvedValue({ ok: true, cli: { reason: 'ready', binPath: '/gh', hint: '' }, error: null });

    renderSheet();
    await waitFor(() => expect(screen.getByDisplayValue('Build the API')).toBeTruthy());

    expect(projectCreate).not.toHaveBeenCalled();
    expect(issueCreate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.getByText('Done.')).toBeTruthy());
    expect(projectCreate).toHaveBeenCalledTimes(1);
    expect(issueCreate).toHaveBeenCalledTimes(2);
    expect(projectAddItem).toHaveBeenCalledTimes(2);
    expect(issuesLink).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'blockedBy', number: 102, targetNumber: 101 }),
    );
  });

  it('reports a partial failure per item and offers Retry remaining', async () => {
    planBlueprint.mockResolvedValueOnce({ ok: true, value: { blueprint } });
    projectCreate.mockResolvedValue({ ok: true, kind: 'ok', project: { id: 'proj-1', number: 1, title: 'Ship auth', url: '', closed: false } });
    issueCreate.mockResolvedValueOnce({
      ok: true,
      cli: { reason: 'ready', binPath: '/gh', hint: '' },
      issue: { id: 'id-api', number: 101, title: 'Build the API' },
    });
    issueCreate.mockResolvedValueOnce({ ok: false, cli: { reason: 'ready', binPath: '/gh', hint: '' }, error: 'GitHub rejected it.' });

    renderSheet();
    await waitFor(() => expect(screen.getByDisplayValue('Build the API')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.getByText('GitHub rejected it.')).toBeTruthy());
    expect(screen.getByText('Stopped — one step failed.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry remaining' })).toBeTruthy();
    // The board was created and the first issue succeeded — Retry-remaining
    // must not repeat either.
    expect(projectCreate).toHaveBeenCalledTimes(1);
    expect(issueCreate).toHaveBeenCalledTimes(2);
  });
});
