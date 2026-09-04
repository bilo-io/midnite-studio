import type { ForgeJob, ForgeRun } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import { RunDetail } from './run-detail';

const runLogFn = vi.fn();
const workflowsFn = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forge: {
      runLog: runLogFn,
      workflows: workflowsFn,
    },
  }),
  hasBridge: () => true,
}));

function fakeRun(overrides: Partial<ForgeRun> = {}): ForgeRun {
  return {
    id: '12345',
    name: 'CI',
    workflowName: 'CI',
    workflowId: '101',
    status: 'completed',
    conclusion: 'success',
    event: 'push',
    headBranch: 'main',
    headSha: 'abcdef1',
    url: 'https://github.com/bilo-io/midnite-studio/actions/runs/12345',
    createdAt: '2026-01-01T00:00:00Z',
    startedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:02:00Z',
    displayTitle: 'ci: test run',
    number: 1,
    attempt: 1,
    ...overrides,
  };
}

function fakeJobs(): ForgeJob[] {
  return [
    {
      id: 'job-1',
      name: 'gate',
      status: 'completed',
      conclusion: 'success',
      url: 'https://github.com/bilo-io/midnite-studio/actions/runs/12345/job/1',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T00:01:00Z',
      steps: [
        {
          number: 1,
          name: 'Set up job',
          status: 'completed',
          conclusion: 'success',
          startedAt: '2026-01-01T00:00:00Z',
          completedAt: '2026-01-01T00:00:05Z',
        },
      ],
    },
  ];
}

describe('RunDetail resizable panels', () => {
  beforeEach(() => {
    runLogFn.mockResolvedValue({
      cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
      log: {
        lines: ['gate\tSet up job\t2026-01-01T00:00:01.000Z Starting job'],
        truncated: false,
        omittedLines: 0,
        totalBytes: 50,
      },
      error: null,
      pending: false,
    });
    workflowsFn.mockResolvedValue({
      cli: { reason: 'ready', binPath: '/usr/bin/gh', hint: '' },
      workflows: [],
      error: null,
    });
  });

  it('renders a vertical resize handle and resizable jobs pane', () => {
    useUiStore.setState((s) => ({
      layout: { ...s.layout, actionsJobsHeight: 240 },
    }));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <RunDetail
          repoId="repo-1"
          run={fakeRun()}
          jobs={fakeJobs()}
          loadingJobs={false}
          jobsError={null}
        />
      </QueryClientProvider>,
    );

    const handle = screen.getByRole('separator', { name: /resize the jobs list/i });
    expect(handle).not.toBeNull();

    const jobsContainer = screen.getByTestId('actions-jobs-pane');
    expect(jobsContainer.style.height).toBe('240px');
  });
});
