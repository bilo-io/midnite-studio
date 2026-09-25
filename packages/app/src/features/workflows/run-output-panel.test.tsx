import type { MidniteStudioBridge, WorkflowNode, WorkflowRun } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  describe('a waiting gate (Phase 97 Theme D)', () => {
    const gateNode: WorkflowNode = {
      id: 'g1',
      label: 'Gate',
      x: 0,
      y: 0,
      kind: 'gate',
      config: { title: 'Ship it?', instructions: 'Check the diff.', onTimeout: 'reject' },
    };
    const waitingRun = run({
      status: 'running',
      nodes: [
        { nodeId: 'g1', kind: 'gate', label: 'Gate', status: 'waiting', truncated: false, gatedDownstream: false },
      ],
    });

    afterEach(() => {
      delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    });

    it("shows the gate's own title/instructions and Approve/Reject once workflowNodes carries its config", () => {
      render(
        <RunOutputPanel
          run={waitingRun}
          workflowNodes={[gateNode]}
          collapsed={false}
          onToggleCollapsed={() => {}}
          height={200}
        />,
      );

      expect(screen.getByText('Waiting for approval')).not.toBeNull();
      expect(screen.getByText('Ship it?')).not.toBeNull();
      expect(screen.getByText('Check the diff.')).not.toBeNull();
      expect(screen.getByRole('button', { name: /Approve/ })).not.toBeNull();
      expect(screen.getByRole('button', { name: /Reject/ })).not.toBeNull();
    });

    it('Approve calls bridge().workflow.gateDecide with the run/node id and the typed note', async () => {
      const gateDecide = vi.fn().mockResolvedValue({ ok: true });
      (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
        workflow: { gateDecide } as unknown as MidniteStudioBridge['workflow'],
      } as Partial<MidniteStudioBridge>;

      render(
        <RunOutputPanel
          run={waitingRun}
          workflowNodes={[gateNode]}
          collapsed={false}
          onToggleCollapsed={() => {}}
          height={200}
        />,
      );

      fireEvent.change(screen.getByPlaceholderText('Optional note'), { target: { value: 'lgtm' } });
      fireEvent.click(screen.getByRole('button', { name: /Approve/ }));

      await waitFor(() =>
        expect(gateDecide).toHaveBeenCalledWith({ runId: 'r1', nodeId: 'g1', decision: 'approved', note: 'lgtm' }),
      );
    });
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
