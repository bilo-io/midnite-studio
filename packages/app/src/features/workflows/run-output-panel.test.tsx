import type { WorkflowRun } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunOutputPanel, runToMarkdown } from './run-output-panel';

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'r1',
    workflowId: 'w1',
    workflowName: 'My workflow',
    status: 'completed',
    startedAt: 1000,
    endedAt: 3500,
    nodes: [
      {
        nodeId: 'n1',
        kind: 'http',
        label: 'Call API',
        status: 'succeeded',
        output: { status: 200 },
        truncated: false,
        gatedDownstream: false,
        startedAt: 1000,
        endedAt: 2000,
      },
      {
        nodeId: 'n2',
        kind: 'transform',
        label: 'Reshape',
        status: 'failed',
        error: 'boom',
        truncated: false,
        gatedDownstream: false,
        startedAt: 2000,
        endedAt: 3500,
      },
    ],
    edges: [],
    ...overrides,
  };
}

describe('RunOutputPanel', () => {
  afterEach(() => cleanup());

  it('shows an empty state when collapsed is false and there is no run', () => {
    render(<RunOutputPanel run={null} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
    expect(screen.getByText('No run yet')).not.toBeNull();
  });

  it('renders nothing but the header when collapsed', () => {
    render(<RunOutputPanel run={run()} collapsed onToggleCollapsed={() => {}} height={200} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('Run output')).not.toBeNull();
  });

  it('toggles collapsed on header click', () => {
    const onToggleCollapsed = vi.fn();
    render(<RunOutputPanel run={run()} collapsed={false} onToggleCollapsed={onToggleCollapsed} height={200} />);
    fireEvent.click(screen.getByText('Run output'));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });

  it('the Nodes tab lists every node with its status', () => {
    render(<RunOutputPanel run={run()} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
    expect(screen.getByRole('tab', { name: 'nodes' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Call API')).not.toBeNull();
    expect(screen.getByText('Succeeded')).not.toBeNull();
    expect(screen.getByText('Failed')).not.toBeNull();
  });

  it('switches to the Logs tab and shows a chronological stream', () => {
    render(<RunOutputPanel run={run()} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
    fireEvent.click(screen.getByRole('tab', { name: 'logs' }));
    const log = screen.getByText((_, el) => el?.tagName === 'PRE' && el.textContent!.includes('Call API — started'));
    expect(log.textContent).toContain('Reshape — Failed — boom');
  });

  it('exposes an Export button that downloads markdown once a run exists', () => {
    render(<RunOutputPanel run={run()} collapsed={false} onToggleCollapsed={() => {}} height={200} />);
    expect(screen.getByLabelText('Export run as Markdown')).not.toBeNull();
  });
});

describe('runToMarkdown', () => {
  it('includes the workflow name, status, a node table row and the error', () => {
    const md = runToMarkdown(run());
    expect(md).toContain('My workflow');
    expect(md).toContain('**completed**');
    expect(md).toContain('| Call API | http | Succeeded |');
    expect(md).toContain('boom');
  });
});
