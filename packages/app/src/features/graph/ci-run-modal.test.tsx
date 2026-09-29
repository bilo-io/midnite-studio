import { aggregateCommitRuns, ForgeRunSchema, type ForgeRun } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CiCell } from './ci-cell';
import { CiRunModal } from './ci-run-modal';

const runDetailFn = vi.fn();
const runLogFn = vi.fn();
const workflowsFn = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ forge: { runDetail: runDetailFn, runLog: runLogFn, workflows: workflowsFn } }),
  hasBridge: () => true,
}));

const SHA = 'c'.repeat(40);
const CLI = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };

const run = (over: Partial<ForgeRun>): ForgeRun =>
  ForgeRunSchema.parse({
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    headSha: SHA,
    createdAt: '2026-09-01T10:00:00Z',
    url: 'https://github.com/o/r/actions/runs/1',
    ...over,
  });

const job = (runId: string, name: string, conclusion: string | null, status = 'completed') => ({
  id: `${runId}-${name}`,
  name,
  status,
  conclusion,
  url: '',
  startedAt: '2026-09-01T10:00:00Z',
  completedAt: status === 'completed' ? '2026-09-01T10:02:00Z' : null,
  steps: [
    {
      number: 1,
      name: `${name} step`,
      status,
      conclusion,
      startedAt: '2026-09-01T10:00:00Z',
      completedAt: status === 'completed' ? '2026-09-01T10:01:00Z' : null,
    },
  ],
});

function renderWith(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  runDetailFn.mockImplementation(async ({ runId }: { runId: string }) => ({
    cli: CLI,
    detail: {
      jobs:
        runId === '20'
          ? [job('20', 'test', 'failure')]
          : runId === '30'
            ? [job('30', 'build', null, 'in_progress')]
            : [job(runId, 'lint', 'success')],
    },
    error: null,
  }));
  runLogFn.mockResolvedValue({ cli: CLI, log: null, pending: true, error: null });
  workflowsFn.mockResolvedValue({ cli: CLI, workflows: [], error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mixed = aggregateCommitRuns([
  run({ id: '10', name: 'lint', workflowName: 'Lint', conclusion: 'success' }),
  run({ id: '20', name: 'test', workflowName: 'Test', conclusion: 'failure' }),
  run({ id: '30', name: 'build', workflowName: 'Build', status: 'in_progress', conclusion: null }),
])!;

describe('CiRunModal', () => {
  it('opens on the failed run and lists every run as a tab, most relevant first', async () => {
    renderWith(<CiRunModal repoId="r" sha={SHA} subject="feat: x" ci={mixed} onClose={() => {}} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Test: Failed',
      'Build: Running',
      'Lint: Passed',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    // The shared RunDetail, not a lookalike: its landmark and its job tree.
    const detail = screen.getByRole('region', { name: 'Run detail' });
    await waitFor(() => expect(runDetailFn).toHaveBeenCalledWith({ repoId: 'r', runId: '20' }));
    expect(await within(detail).findByRole('button', { name: 'test' })).toBeTruthy();
  });

  it('switches to another run from its tab, and with the arrow keys', async () => {
    renderWith(<CiRunModal repoId="r" sha={SHA} subject={null} ci={mixed} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Build: Running' }));
    await waitFor(() => expect(runDetailFn).toHaveBeenCalledWith({ repoId: 'r', runId: '30' }));
    expect(screen.getByRole('tab', { name: 'Build: Running' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Build: Running' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Lint: Passed' }).getAttribute('aria-selected')).toBe('true');
  });

  it('shows no tab strip for a commit with one run', () => {
    const single = aggregateCommitRuns([run({ id: '10', conclusion: 'failure' })])!;
    renderWith(<CiRunModal repoId="r" sha={SHA} subject={null} ci={single} onClose={() => {}} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('region', { name: 'Run detail' })).toBeTruthy();
  });

  it('closes on Escape and on an outside click', () => {
    const onClose = vi.fn();
    renderWith(<CiRunModal repoId="r" sha={SHA} subject={null} ci={mixed} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('CiCell', () => {
  it('is a button named for its verdict and what clicking does', () => {
    const onOpen = vi.fn();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <CiCell sha={SHA} ci={mixed} connector={null} onOpen={onOpen} />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'CI: failed — open run' });
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledWith(SHA);
    // The row's own click (select the commit) must not fire as well.
    expect(onRow).not.toHaveBeenCalled();
  });

  it('draws nothing for a commit with no CI — but still carries the connector', () => {
    const { container } = render(
      <CiCell sha={SHA} ci={undefined} connector={{ color: 'red', opacity: 0.45, strokeWidth: 2, glow: false }} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    const line = container.querySelector('[data-graph-connector]') as HTMLElement;
    expect(line).not.toBeNull();
    // Starts one row-gap to the left, so it spans the gap from the ref column too.
    expect(line.style.left).toBe('-8px');
    expect(line.style.right).toBe('0px');
  });

  it('draws no connector on a row with no refs', () => {
    const { container } = render(<CiCell sha={SHA} ci={mixed} connector={null} />);
    expect(container.querySelector('[data-graph-connector]')).toBeNull();
  });
});
