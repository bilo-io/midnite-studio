import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../../components/dialog-host';
import { PlanWithAiBar } from './plan-with-ai-bar';

const planBlueprint = vi.fn();

vi.mock('../../../services/bridge', () => ({
  bridge: () => ({
    ai: { planBlueprint, improveField: vi.fn() },
    forge: { issueCreate: vi.fn(), issuesLink: vi.fn() },
    forgeProject: {
      create: vi.fn(),
      addItem: vi.fn(),
      list: vi.fn(async () => ({ cli: { reason: 'ready', binPath: '/gh', hint: '' }, projects: [], error: null })),
    },
  }),
  hasBridge: () => true,
}));

afterEach(() => {
  cleanup();
  planBlueprint.mockReset();
});

function renderBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DialogHost>
        <PlanWithAiBar
          repoId="repo-1"
          repoName="bilo-io/midnite-studio"
          origin={{
            kind: 'project',
            capability: {
              pulls: 'full',
              issues: 'full',
              checks: 'full',
              projects: 'full',
              threadResolution: 'full',
              requestChanges: 'full',
              repoListing: 'full',
              ops: {
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
              },
            },
            defaultProjectId: null,
          }}
        />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('PlanWithAiBar', () => {
  it('disables the button until a prompt is typed', () => {
    renderBar();
    const button = () => screen.getByRole('button', { name: /plan with ai/i }) as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Plan with AI prompt'), { target: { value: 'Build a login flow' } });
    expect(button().disabled).toBe(false);
  });

  it('opens the review sheet with the typed prompt, and generates immediately', async () => {
    planBlueprint.mockReturnValue(new Promise(() => {})); // never resolves — only the request matters here
    renderBar();

    fireEvent.change(screen.getByLabelText('Plan with AI prompt'), { target: { value: 'Build a login flow' } });
    fireEvent.click(screen.getByRole('button', { name: /plan with ai/i }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    await waitFor(() =>
      expect(planBlueprint).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Build a login flow' })),
    );
  });
});
